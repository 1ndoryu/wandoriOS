// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
//! Tests de integración del guard de coherencia de releases del workspace.
//! [028A-11] Verifican: validación estructural del árbol, refs de recursos
//! rotos (422 con detalle), cálculo del summary/diff y contrato de listado.
//! Necesitan `DATABASE_URL` apuntando a la BD local (glory_backend_wandorius).

use std::sync::OnceLock;

use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

use glory_backend::repositories::workspace_repo::WorkspaceRepository;
use glory_backend::services::workspace_svc::WorkspaceService;

/// Serializa los tests que publican: cada uno calcula version = max+1, y dos
/// publicaciones concurrentes colisionarían en la versión.
static PUBLISH_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();
fn publish_lock() -> &'static tokio::sync::Mutex<()> {
    PUBLISH_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

struct TestContext {
    pool: sqlx::PgPool,
    admin_id: Uuid,
    releases_created: Vec<i32>,
    resources_created: Vec<Uuid>,
    /* [038A-2] Release activa al iniciar el test: `cleanup()` la restaura
     * para no dejar el estado de rama alterado (higiene ante el guard). */
    previous_active_version: Option<i32>,
}

impl TestContext {
    async fn new() -> Self {
        let database_url =
            std::env::var("DATABASE_URL").expect("DATABASE_URL requerido para tests");
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect(&database_url)
            .await
            .expect("BD disponible");

        let admin_id = Uuid::new_v4();
        sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'test-hash')")
            .bind(admin_id)
            .bind(format!("publish-{admin_id}@example.invalid"))
            .execute(&pool)
            .await
            .expect("admin de prueba creado");

        let previous_active_version = WorkspaceRepository::get_active(&pool)
            .await
            .expect("consulta de release activa")
            .map(|r| r.version);

        Self {
            pool,
            admin_id,
            releases_created: Vec::new(),
            resources_created: Vec::new(),
            previous_active_version,
        }
    }

    async fn create_resource(&mut self, editorial: &str, visibility: &str) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            "INSERT INTO resources (id, kind, title, editorial, visibility, lifecycle) \
             VALUES ($1, 'article', $2, $3::editorial_state, $4::visibility_state, 'active')",
        )
        .bind(id)
        .bind("Artículo de prueba")
        .bind(editorial)
        .bind(visibility)
        .execute(&self.pool)
        .await
        .expect("recurso de prueba creado");
        self.resources_created.push(id);
        id
    }

    async fn cleanup(self) {
        for version in &self.releases_created {
            sqlx::query("DELETE FROM notifications WHERE release_version = $1")
                .bind(version)
                .execute(&self.pool)
                .await
                .expect("notificaciones limpiadas");
            sqlx::query("DELETE FROM workspace_releases WHERE version = $1")
                .bind(version)
                .execute(&self.pool)
                .await
                .expect("release limpiada");
        }
        for id in &self.resources_created {
            sqlx::query("DELETE FROM resources WHERE id = $1")
                .bind(id)
                .execute(&self.pool)
                .await
                .expect("recurso limpiado");
        }
        /* [038A-2] Restaurar la release que estaba activa al iniciar el test.
         * Sin esto, un test que publica (auto-activa) dejaría la rama apuntando
         * a una release de prueba aunque `cleanup()` la borre después. */
        if let Some(version) = self.previous_active_version {
            let _ = WorkspaceService::activate_version(&self.pool, version, true).await;
        }
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(self.admin_id)
            .execute(&self.pool)
            .await
            .expect("usuario limpiado");
    }
}

/// Árbol mínimo válido: los nodos de sistema obligatorios + un folder con un
/// recurso público y una app raíz. Sin publicLocator para no acoplar al
/// contrato de overlay.
/// [038A-2] `tree_with_ids` incluye SIEMPRE los nodos de sistema canónicos
/// (trash/admin/settings/profile/about): el guard de `validate_release_tree`
/// los exige y todo árbol de test debe cumplirlo. Los IDs únicos por ejecución
/// se aplican a folder/recurso para que el diff del summary sea estable.
fn valid_tree(resource_ref: Option<Uuid>) -> serde_json::Value {
    tree_with_ids(resource_ref, "documentos", "about", "recurso")
}

/// Igual que `valid_tree` pero con IDs de nodo explícitos.
/// [297A-58] Los tests que verifican el summary deben usar IDs únicos por
/// ejecución: el diff se calcula contra la release anterior REAL de la BD
/// (estado de rama), no contra una historia fija de versiones.
/// [038A-2] Los nodos de sistema usan sus IDs canónicos fijos; solo folder y
/// recurso reciben IDs únicos.
fn tree_with_ids(
    resource_ref: Option<Uuid>,
    folder_id: &str,
    about_id: &str,
    resource_node_id: &str,
) -> serde_json::Value {
    let mut nodes = serde_json::Map::new();
    /* Nodos de sistema obligatorios [038A-2]: mismo set canónico que el shell.
     * `about` se genera con el id pasado (el test usa `about-{uniq}` en el
     * test de summary; el guard exige el id `about`), por eso aquí `about`
     * usa `about_id` — el llamador debe pasar `"about"` salvo que el test
     * pruebe otra cosa. */
    nodes.insert(
        "trash".into(),
        json!({
            "id": "trash",
            "parentId": "desktop",
            "type": "folder",
            "label": "Papelera",
            "position": { "col": 0, "row": 0 }
        }),
    );
    nodes.insert(
        "admin".into(),
        json!({
            "id": "admin",
            "parentId": "desktop",
            "type": "app",
            "label": "Admin",
            "position": { "col": 2, "row": 0 }
        }),
    );
    nodes.insert(
        "settings".into(),
        json!({
            "id": "settings",
            "parentId": "desktop",
            "type": "app",
            "label": "Ajustes",
            "position": { "col": 3, "row": 0 }
        }),
    );
    nodes.insert(
        "profile".into(),
        json!({
            "id": "profile",
            "parentId": "desktop",
            "type": "app",
            "label": "Perfil",
            "position": { "col": 4, "row": 0 }
        }),
    );
    nodes.insert(
        about_id.into(),
        json!({
            "id": about_id,
            "parentId": "desktop",
            "type": "app",
            "label": "Acerca de",
            "position": { "col": 1, "row": 0 }
        }),
    );
    nodes.insert(
        folder_id.into(),
        json!({
            "id": folder_id,
            "parentId": "desktop",
            "type": "folder",
            "label": "Documentos",
            "position": { "col": 5, "row": 0 }
        }),
    );
    if let Some(ref_id) = resource_ref {
        nodes.insert(
            resource_node_id.into(),
            json!({
                "id": resource_node_id,
                "parentId": folder_id,
                "type": "resource",
                "label": "Artículo público",
                "refId": ref_id
            }),
        );
    }
    json!({ "nodes": nodes })
}

#[tokio::test]
async fn publish_accepts_valid_tree_and_computes_summary() {
    let _guard = publish_lock().lock().await;
    let mut ctx = TestContext::new().await;

    let resource_id = ctx.create_resource("ready", "public").await;
    /* [297A-58] IDs únicos por ejecución: el summary compara contra la release
     * anterior REAL de la BD; con IDs fijos el test depende de la historia de
     * publicaciones de la rama (fallaba en CI limpio y tras cada release).
     * [028A-13] `publish` versiona contra la ÚLTIMA release (get_latest), no
     * contra la activa: con la activación explícita la activa puede no ser la
     * última publicada. La base del diff es la última, sea cual sea su estado. */
    let uniq = Uuid::new_v4().simple().to_string();
    /* [038A-2] `about` debe usar el id canónico del guard de sistema; solo
     * folder y recurso llevan IDs únicos por ejecución para que el diff del
     * summary sea estable. */
    let (folder_id, about_id, resource_node_id) = (
        format!("doc-{uniq}"),
        "about".to_string(),
        format!("recurso-{uniq}"),
    );
    let tree = tree_with_ids(Some(resource_id), &folder_id, &about_id, &resource_node_id);

    let previous = WorkspaceRepository::get_latest(&ctx.pool)
        .await
        .expect("release previa (la migración siembra v1)")
        .expect("release previa existente");
    let prev_version = previous.version;

    let result = WorkspaceService::publish(&ctx.pool, tree.clone(), ctx.admin_id).await;
    let release = result.expect("release válida publicada");
    ctx.releases_created.push(release.version);

    assert_eq!(
        release.version,
        prev_version + 1,
        "la versión continúa tras v{prev_version}"
    );
    assert_eq!(release.diff_from, Some(prev_version));

    let summary = release.summary.as_object().expect("summary objeto");
    /* [038A-2] El árbol válido incluye los 5 nodos de sistema + folder +
     * recurso: nodeCount = 7. */
    assert_eq!(summary["nodeCount"], json!(7));
    let added = summary["added"].as_array().expect("added lista");
    /* `about` ya existe en la release sembrada (v1), así que NO entra en
     * `added`; solo los nodos únicos de esta ejecución deben aparecer. */
    for id in [&folder_id, &resource_node_id] {
        assert!(
            added.contains(&json!(id)),
            "added debe incluir {id}: {summary:?}"
        );
    }
    /* Los nodos del release anterior ausentes del árbol nuevo salen en removed. */
    let prev_nodes = previous
        .tree
        .get("nodes")
        .and_then(serde_json::Value::as_object)
        .cloned()
        .unwrap_or_default();
    let removed = summary["removed"].as_array().expect("removed lista");
    for prev_id in prev_nodes.keys() {
        if !tree["nodes"].get(prev_id).is_some() {
            assert!(
                removed.contains(&json!(prev_id)),
                "removed debe incluir {prev_id}: {summary:?}"
            );
        }
    }

    /* Contrato de lectura: activo = máximo, listado desc, get por versión. */
    let active = WorkspaceService::get_active_release(&ctx.pool)
        .await
        .expect("release activa");
    assert_eq!(active.version, release.version);

    let by_version = WorkspaceService::get_release_by_version(&ctx.pool, release.version)
        .await
        .expect("release por versión");
    assert_eq!(by_version.version, release.version);

    let list = WorkspaceService::list_releases(&ctx.pool)
        .await
        .expect("listado de releases");
    let versions: Vec<i32> = list.iter().map(|r| r.version).collect();
    assert_eq!(versions.first(), Some(&release.version));
    assert!(
        versions.windows(2).all(|w| w[0] > w[1]),
        "orden descendente"
    );

    ctx.cleanup().await;
}

#[tokio::test]
async fn publish_rejects_unknown_resource_ref_with_details() {
    let _guard = publish_lock().lock().await;
    let ctx = TestContext::new().await;

    /* UUID inexistente: no hay recurso en BD. */
    let ghost = Uuid::new_v4();
    let tree = valid_tree(Some(ghost));

    let err = WorkspaceService::publish(&ctx.pool, tree, ctx.admin_id)
        .await
        .expect_err("debe rechazar ref inexistente");
    match err {
        glory_backend::errors::AppError::ValidationDetails { message, details } => {
            assert!(message.contains("recursos no publicables"));
            let broken = details["brokenRefs"].as_array().expect("brokenRefs lista");
            assert_eq!(broken.len(), 1);
            assert_eq!(broken[0]["refId"], json!(ghost.to_string()));
            assert_eq!(broken[0]["id"], json!("recurso"));
        }
        other => panic!("esperaba ValidationDetails, obtuve: {other:?}"),
    }

    ctx.cleanup().await;
}

#[tokio::test]
async fn publish_rejects_draft_or_private_resource_ref() {
    let _guard = publish_lock().lock().await;
    let mut ctx = TestContext::new().await;

    /* Existe pero no es publicable (draft). */
    let draft_id = ctx.create_resource("draft", "public").await;
    let tree = valid_tree(Some(draft_id));
    let err = WorkspaceService::publish(&ctx.pool, tree, ctx.admin_id)
        .await
        .expect_err("debe rechazar recurso draft");
    assert!(matches!(
        err,
        glory_backend::errors::AppError::ValidationDetails { .. }
    ));

    /* Existe pero privado. */
    let private_id = ctx.create_resource("ready", "private").await;
    let tree = valid_tree(Some(private_id));
    let err = WorkspaceService::publish(&ctx.pool, tree, ctx.admin_id)
        .await
        .expect_err("debe rechazar recurso privado");
    assert!(matches!(
        err,
        glory_backend::errors::AppError::ValidationDetails { .. }
    ));

    ctx.cleanup().await;
}

#[tokio::test]
async fn publish_rejects_structural_issues() {
    let _guard = publish_lock().lock().await;
    let ctx = TestContext::new().await;

    /* Ciclo: b cuelga de a y a cuelga de b. */
    let cycle = json!({
        "nodes": {
            "a": { "id": "a", "parentId": "b", "type": "folder", "label": "A" },
            "b": { "id": "b", "parentId": "a", "type": "folder", "label": "B" }
        }
    });
    let err = WorkspaceService::publish(&ctx.pool, cycle, ctx.admin_id)
        .await
        .expect_err("debe rechazar ciclo");
    assert!(matches!(err, glory_backend::errors::AppError::Validation(m) if m.contains("ciclo")));

    /* parentId inexistente. */
    let orphan = json!({
        "nodes": {
            "a": { "id": "a", "parentId": "no-existe", "type": "folder", "label": "A" }
        }
    });
    let err = WorkspaceService::publish(&ctx.pool, orphan, ctx.admin_id)
        .await
        .expect_err("debe rechazar parentId inexistente");
    assert!(matches!(
        err,
        glory_backend::errors::AppError::Validation(m) if m.contains("parentId inexistente")
    ));

    /* Tipo no válido. */
    let bad_type = json!({
        "nodes": {
            "a": { "id": "a", "parentId": "desktop", "type": "widget", "label": "A" }
        }
    });
    let err = WorkspaceService::publish(&ctx.pool, bad_type, ctx.admin_id)
        .await
        .expect_err("debe rechazar tipo no válido");
    assert!(matches!(
        err,
        glory_backend::errors::AppError::Validation(_)
    ));

    /* Más de 500 nodos. */
    let mut nodes = serde_json::Map::new();
    for i in 0..501 {
        nodes.insert(
            format!("n{i}"),
            json!({ "id": format!("n{i}"), "parentId": "desktop", "type": "folder", "label": format!("N{i}") }),
        );
    }
    let too_many = json!({ "nodes": nodes });
    let err = WorkspaceService::publish(&ctx.pool, too_many, ctx.admin_id)
        .await
        .expect_err("debe rechazar árbol con más de 500 nodos");
    assert!(matches!(
        err,
        glory_backend::errors::AppError::Validation(m) if m.contains("límite de 500")
    ));

    ctx.cleanup().await;
}

/* [038A-2] Regresión del incidente: la Papelera (y el resto de nodos de
 * sistema) desaparecía cuando un publish dejaba activa una release incompleta
 * (tests v4/v5 publicados contra BD de rama sin nodos de sistema). El guard
 * debe rechazar el árbol ANTES de publicar. */
#[tokio::test]
async fn publish_rejects_tree_without_system_nodes() {
    let _guard = publish_lock().lock().await;
    let ctx = TestContext::new().await;

    /* Árbol con folder/app válidos pero SIN trash (ni el resto de nodos de
     * sistema). Reproduce el árbol mínimo de 3 nodos que causó el incidente. */
    let mut nodes = serde_json::Map::new();
    nodes.insert(
        "documentos".into(),
        json!({
            "id": "documentos",
            "parentId": "desktop",
            "type": "folder",
            "label": "Documentos"
        }),
    );
    nodes.insert(
        "about".into(),
        json!({
            "id": "about",
            "parentId": "desktop",
            "type": "app",
            "label": "Acerca de"
        }),
    );
    let no_trash = json!({ "nodes": nodes });

    let err = WorkspaceService::publish(&ctx.pool, no_trash, ctx.admin_id)
        .await
        .expect_err("debe rechazar árbol sin Papelera");
    match err {
        glory_backend::errors::AppError::Validation(m) => {
            assert!(
                m.contains("nodo de sistema 'trash'"),
                "mensaje debe nombrar el nodo faltante: {m}"
            );
        }
        other => panic!("esperaba Validation, obtuve: {other:?}"),
    }

    ctx.cleanup().await;
}
