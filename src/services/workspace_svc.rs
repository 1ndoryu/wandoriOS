use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::resource::{PublicContent, ResourceKind};
use crate::models::workspace::{
    validate_release_tree, BrokenResourceRef, ReleaseControlResponse, ReleaseListItem,
    ReleaseTreeIssue, ReleaseValidationResponse, WorkspaceRelease, WorkspaceReleasePublic,
};
use crate::models::workspace_overlay::validate_public_locators_in_tree;
use crate::repositories::notification_repo::NotificationRepository;
use crate::repositories::resource_repo::ResourceRepository;
use crate::repositories::workspace_repo::WorkspaceRepository;

pub struct WorkspaceService;

impl WorkspaceService {
    /// Obtener el release activo (público).
    /// [028A-13] La activa es la marcada `is_active`; si por cualquier motivo
    /// no hubiera ninguna (p. ej. migración a medias), cae al MAX(version).
    /// [038A-2] La respuesta es la release EFECTIVA: el contenido publicado
    /// (artículos/medios `active + ready + public`) se materializa siempre en
    /// el árbol, cualquier versión activa, para que el escritorio lo muestre
    /// aunque la foto de la release no lo incluya. Solo desaparece al
    /// eliminarlo de verdad (trashed) o despublicarlo.
    pub async fn get_active_release(pool: &PgPool) -> Result<WorkspaceReleasePublic, AppError> {
        let release = WorkspaceRepository::get_active(pool)
            .await?
            .or(WorkspaceRepository::get_latest(pool).await?)
            .ok_or_else(|| AppError::NotFound("No hay releases publicados".into()))?;
        let content = ResourceRepository::find_public_content(pool).await?;
        Ok(WorkspaceReleasePublic {
            version: release.version,
            tree: materialize_content_nodes(&release.tree, &content),
            published_at: release.published_at,
        })
    }

    /// Obtener un release por versión (público).
    /// [038A-2] Igual que `get_active_release`: el contenido publicado se
    /// materializa en cualquier versión consultada; el escritorio no puede
    /// perder contenido por un cambio de versión.
    pub async fn get_release_by_version(
        pool: &PgPool,
        version: i32,
    ) -> Result<WorkspaceReleasePublic, AppError> {
        let release = WorkspaceRepository::get_by_version(pool, version)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Release v{version} no encontrado")))?;
        let content = ResourceRepository::find_public_content(pool).await?;
        Ok(WorkspaceReleasePublic {
            version: release.version,
            tree: materialize_content_nodes(&release.tree, &content),
            published_at: release.published_at,
        })
    }

    /// Listar todos los releases en DTO ligero (admin — historial).
    /// [028A-13] `ReleaseListItem` omite el `tree` completo: el panel solo
    /// necesita versión, fechas, resumen y tamaño para renderizar el historial.
    pub async fn list_releases(pool: &PgPool) -> Result<Vec<ReleaseListItem>, AppError> {
        let releases = WorkspaceRepository::list_releases(pool).await?;
        Ok(releases.into_iter().map(ReleaseListItem::from).collect())
    }

    /// Estado actual de la gobernanza del workspace (dashboard del Admin).
    /// [028A-13] Expone la activa y la más reciente para que el panel avise
    /// cuando la activa no es la última publicada (incidente v4).
    pub async fn control(pool: &PgPool) -> Result<ReleaseControlResponse, AppError> {
        let releases = WorkspaceRepository::list_releases(pool).await?;
        let active = releases.iter().find(|r| r.is_active);
        let latest = releases.first();
        let node_count = |r: &WorkspaceRelease| {
            r.tree
                .get("nodes")
                .and_then(serde_json::Value::as_object)
                .map_or(0, serde_json::Map::len)
        };
        Ok(ReleaseControlResponse {
            active_version: active.map(|r| r.version),
            active_node_count: active.map(node_count),
            active_published_at: active.map(|r| r.published_at),
            active_published_by: active.and_then(|r| r.published_by),
            latest_version: latest.map(|r| r.version),
            total_releases: releases.len(),
        })
    }

    /// Dry-run de validación de una release publicada (admin).
    /// [028A-13] Reutiliza el mismo guard que `publish` (estructura, locators
    /// públicos y refs de recursos) pero sin escribir nada. El panel lo usa
    /// para mostrar qué pasaría antes de activar.
    pub async fn validate_version(
        pool: &PgPool,
        version: i32,
    ) -> Result<ReleaseValidationResponse, AppError> {
        let release = WorkspaceRepository::get_by_version(pool, version)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Release v{version} no encontrado")))?;

        let mut issues: Vec<ReleaseTreeIssue> = Vec::new();
        if let Err(message) = validate_release_tree(&release.tree) {
            issues.push(ReleaseTreeIssue {
                node_id: String::new(),
                message,
            });
        }
        if let Err(message) = validate_public_locators_in_tree(&release.tree) {
            issues.push(ReleaseTreeIssue {
                node_id: String::new(),
                message: message.to_string(),
            });
        }
        let broken_refs = collect_broken_resource_refs(pool, &release.tree).await?;

        Ok(ReleaseValidationResponse {
            version,
            valid: issues.is_empty() && broken_refs.is_empty(),
            issues,
            broken_refs,
        })
    }

    /// Activar una release existente (admin).
    /// [028A-13] Sin `force` se valida estructura + refs antes de activar (422
    /// con detalle si hay problemas); con `?force=true` se activa igualmente.
    pub async fn activate_version(
        pool: &PgPool,
        version: i32,
        force: bool,
    ) -> Result<WorkspaceRelease, AppError> {
        let release = WorkspaceRepository::get_by_version(pool, version)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("Release v{version} no encontrado")))?;

        if !force {
            let mut issues: Vec<ReleaseTreeIssue> = Vec::new();
            if let Err(message) = validate_release_tree(&release.tree) {
                issues.push(ReleaseTreeIssue {
                    node_id: String::new(),
                    message,
                });
            }
            if let Err(message) = validate_public_locators_in_tree(&release.tree) {
                issues.push(ReleaseTreeIssue {
                    node_id: String::new(),
                    message: message.to_string(),
                });
            }
            let broken_refs = collect_broken_resource_refs(pool, &release.tree).await?;
            if !issues.is_empty() || !broken_refs.is_empty() {
                return Err(AppError::ValidationDetails {
                    message:
                        "La release tiene problemas; usa ?force=true para activarla igualmente"
                            .into(),
                    details: serde_json::json!({ "issues": issues, "brokenRefs": broken_refs }),
                });
            }
        }

        let mut tx = pool.begin().await?;
        let activated = WorkspaceRepository::activate_version(&mut tx, version).await?;
        tx.commit().await?;
        Ok(activated)
    }

    /// Publicar un nuevo release (admin).
    /// [297A-11 §9.2] Publicación transaccional a release inmutable.
    /// [028A-11] Guard de coherencia: valida estructura del árbol (tipos,
    /// ciclos, parentId, límites), publicLocators y refs de recursos contra la
    /// BD (deben ser `active + ready + public`). El 422 devuelve la lista de
    /// refs rotos para que el panel admin las corrija antes de publicar.
    /// [028A-13] La nueva release se auto-activa (mismo comportamiento que
    /// antes, donde MAX(version) era la vigente); el panel permite revertir.
    pub async fn publish(
        pool: &PgPool,
        tree: serde_json::Value,
        published_by: Uuid,
    ) -> Result<WorkspaceRelease, AppError> {
        validate_release_tree(&tree).map_err(AppError::Validation)?;

        validate_public_locators_in_tree(&tree)
            .map_err(|message| AppError::Validation(message.to_string()))?;

        let broken_refs = collect_broken_resource_refs(pool, &tree).await?;
        if !broken_refs.is_empty() {
            return Err(AppError::ValidationDetails {
                message: format!(
                    "El release referencia {} recursos no publicables",
                    broken_refs.len()
                ),
                details: serde_json::json!({ "brokenRefs": broken_refs }),
            });
        }

        /* Release anterior para el diff auditable */
        let previous = WorkspaceRepository::get_latest(pool).await?;
        let next_version = previous.as_ref().map_or(0, |r| r.version) + 1;
        let summary = compute_release_summary(&tree, previous.as_ref());
        let diff_from = previous.as_ref().map(|r| r.version);

        let mut tx = pool.begin().await?;

        let release = WorkspaceRepository::create(
            &mut tx,
            next_version,
            &tree,
            Some(published_by),
            &summary,
            diff_from,
        )
        .await?;

        /* [028A-13] La release publicada queda vigente de inmediato. */
        WorkspaceRepository::activate_version(&mut tx, release.version).await?;

        NotificationRepository::create_release_notification(&mut tx, release.version, published_by)
            .await?;

        tx.commit().await?;
        Ok(release)
    }
}

/// Recorre el árbol y devuelve las refs de recursos (type resource/shortcut)
/// cuyo `refId` es UUID pero no es publicable en BD. Los refId no-UUID (p. ej.
/// ids de app del shell) no se validan aquí: no tienen registro en `resources`.
async fn collect_broken_resource_refs(
    pool: &PgPool,
    tree: &serde_json::Value,
) -> Result<Vec<BrokenResourceRef>, AppError> {
    let Some(nodes) = tree.get("nodes").and_then(serde_json::Value::as_object) else {
        return Ok(Vec::new());
    };

    let mut refs: Vec<(Uuid, BrokenResourceRef)> = Vec::new();
    for node in nodes.values() {
        let Some(node) = node.as_object() else {
            continue;
        };
        let Some(node_type) = node.get("type").and_then(serde_json::Value::as_str) else {
            continue;
        };
        if !matches!(node_type, "resource" | "shortcut") {
            continue;
        }
        let Some(ref_id) = node.get("refId").and_then(serde_json::Value::as_str) else {
            continue;
        };
        let Ok(uuid) = Uuid::parse_str(ref_id) else {
            continue;
        };
        let id = node
            .get("id")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("");
        let label = node
            .get("label")
            .and_then(serde_json::Value::as_str)
            .unwrap_or(id);
        refs.push((
            uuid,
            BrokenResourceRef {
                id: id.to_string(),
                ref_id: uuid,
                label: label.to_string(),
            },
        ));
    }

    let uuids: Vec<Uuid> = refs.iter().map(|(uuid, _)| *uuid).collect();
    let broken_uuids = ResourceRepository::find_broken_public_refs(pool, &uuids).await?;
    Ok(refs
        .into_iter()
        .filter(|(uuid, _)| broken_uuids.contains(uuid))
        .map(|(_, broken)| broken)
        .collect())
}

/// Calcula el diff auditable entre el árbol nuevo y la release anterior.
/// Shape: `{ added: [ids], removed: [ids], modified: [ids], nodeCount: n }`.
/// Para la primera release, `added` = todos los nodos. Un nodo se marca
/// `modified` si su JSON completo cambió (posición, label, refId, etc.).
fn compute_release_summary(
    tree: &serde_json::Value,
    previous: Option<&WorkspaceRelease>,
) -> serde_json::Value {
    let empty = serde_json::Map::new();
    let new_nodes = tree
        .get("nodes")
        .and_then(serde_json::Value::as_object)
        .unwrap_or(&empty);
    let node_count = new_nodes.len();

    let Some(prev_nodes) = previous
        .and_then(|r| r.tree.get("nodes"))
        .and_then(serde_json::Value::as_object)
    else {
        return serde_json::json!({
            "added": new_nodes.keys().cloned().collect::<Vec<_>>(),
            "removed": [],
            "modified": [],
            "nodeCount": node_count,
        });
    };

    let mut added: Vec<String> = Vec::new();
    let mut modified: Vec<String> = Vec::new();
    for (id, node) in new_nodes {
        match prev_nodes.get(id) {
            None => added.push(id.clone()),
            Some(prev) if prev != node => modified.push(id.clone()),
            Some(_) => {}
        }
    }
    let removed: Vec<String> = prev_nodes
        .keys()
        .filter(|id| !new_nodes.contains_key(*id))
        .cloned()
        .collect();

    serde_json::json!({
        "added": added,
        "removed": removed,
        "modified": modified,
        "nodeCount": node_count,
    })
}

/// [038A-2] Materializa el contenido publicado en el árbol de una release.
/// Toma el árbol base (proxy: clon) y le inserta los nodos de contenido
/// (artículos → `nota-{id}` bajo "Notas"; medios → `media-{id}` bajo la
/// subcarpeta de "Documentos" según su tipo), replicando EXACTAMENTE el
/// contrato que construye el frontend (`buildArticleNode` / `buildMediaNode`
/// y carpetas) para que el escritorio muestre el contenido publicado en
/// cualquier versión activa. Merge idempotente por id: si el nodo ya existe
/// en el release (p. ej. el admin lo publicó como parte del árbol), se
/// conserva el del release y no se duplica.
///
/// El árbol base NO se muta: se trabaja sobre un valor propio, ya que la
/// release inmutable nunca debe verse alterada al servirse.
fn materialize_content_nodes(
    tree: &serde_json::Value,
    content: &[PublicContent],
) -> serde_json::Value {
    /* Contrato de carpetas: mismas ids/etiquetas/parents que el frontend. */
    const FOLDERS: &[(&str, &str, &str)] = &[
        ("notas", "desktop", "Notas"),
        ("documentos", "desktop", "Documentos"),
        ("documentos-imagenes", "documentos", "Imágenes"),
        ("documentos-audio", "documentos", "Audio"),
        ("documentos-video", "documentos", "Vídeo"),
        ("documentos-documentos", "documentos", "Documentos"),
    ];

    /* Copia de trabajo; el release original queda intacto. */
    let mut out = tree.clone();

    let Some(nodes) = out
        .get_mut("nodes")
        .and_then(serde_json::Value::as_object_mut)
    else {
        /* Sin `nodes`, no hay dónde materializar: devolver tal cual. */
        return out;
    };

    /* Subcarpeta destino de cada tipo de media (mismo mapeo que el frontend). */
    let media_folder = |file_type: &str| match file_type {
        "image" => "documentos-imagenes",
        "audio" => "documentos-audio",
        "video" => "documentos-video",
        _ => "documentos-documentos",
    };

    let ensure_folder = |nodes: &mut serde_json::Map<String, serde_json::Value>,
                         id: &str,
                         parent: &str,
                         label: &str| {
        if nodes.contains_key(id) {
            return;
        }
        nodes.insert(
            id.to_string(),
            serde_json::json!({
                "id": id,
                "parentId": parent,
                "type": "folder",
                "label": label,
                "requires": "public",
            }),
        );
    };

    for item in content {
        match item.kind {
            ResourceKind::Article => {
                ensure_folder(nodes, "notas", "desktop", "Notas");
                let node_id = format!("nota-{}", item.id);
                if nodes.contains_key(&node_id) {
                    continue;
                }
                nodes.insert(
                    node_id.clone(),
                    serde_json::json!({
                        "id": node_id,
                        "parentId": "notas",
                        "type": "resource",
                        "label": item.title,
                        "refId": item.id.to_string(),
                        "resourceKind": "article",
                        "publicLocator": { "appId": "reader", "params": { "slug": item.slug } },
                        "requires": "public",
                    }),
                );
            }
            ResourceKind::Media => {
                ensure_folder(nodes, "documentos", "desktop", "Documentos");
                let file_type = item.file_type.as_deref().unwrap_or("document");
                let folder_id = media_folder(file_type);
                let folder_label = FOLDERS
                    .iter()
                    .find(|(id, _, _)| *id == folder_id)
                    .map_or("Documentos", |(_, _, label)| *label);
                ensure_folder(nodes, folder_id, "documentos", folder_label);
                let node_id = format!("media-{}", item.id);
                if nodes.contains_key(&node_id) {
                    continue;
                }
                let resource_kind = match file_type {
                    "image" => "image",
                    "audio" => "audio",
                    "video" => "video",
                    _ => "document",
                };
                nodes.insert(
                    node_id.clone(),
                    serde_json::json!({
                        "id": node_id,
                        "parentId": folder_id,
                        "type": "resource",
                        "label": item.title,
                        "refId": item.id.to_string(),
                        "resourceKind": resource_kind,
                        "requires": "public",
                    }),
                );
            }
            _ => {}
        }
    }

    out
}
