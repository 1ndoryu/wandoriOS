//! Validación estructural del árbol de un release del workspace.
//! [028A-11] Antes de publicar, el árbol debe ser coherente: sin ciclos,
//! `parentId` existentes, tipos válidos, límite de nodos y posiciones sanas.
//! A diferencia de la validación del overlay personal (solo añade nodos
//! públicos), un release SÍ admite nodos `app` y `requires: "admin"`, porque
//! es la foto completa del escritorio. La validación de refs contra la BD
//! (recursos `active + ready + public`) vive en `WorkspaceService::publish`.
//! [038A-2] El release es la foto completa e inmutable del escritorio: un
//! release sin los nodos del sistema deja el OS inservible (p. ej. sin la
//! Papelera no se puede restaurar nada). Por eso `validate_release_tree`
//! exige la presencia de `SYSTEM_NODE_IDS` (ver abajo): ninguna fuente —
//! panel admin, API, tests de integración, procesos externos — puede publicar
//! o activar una release incompleta.

use serde_json::Value as JsonValue;

const MAX_RELEASE_NODES: usize = 500;
const MAX_ID_LENGTH: usize = 128;
const MAX_LABEL_LENGTH: usize = 255;
const MAX_REF_ID_LENGTH: usize = 256;
const MAX_GRID_COORDINATE: u64 = 10_000;
const MAX_MOBILE_ORDER: u64 = 100_000;

/// Nodos del sistema del shell que TODO release debe contener.
/// [038A-2] Fuente canónica: los nodos que el `AppRegistry` del frontend
/// registra como parte del OS (`default-release.ts` + `ADMIN_NODES` en stores.ts).
/// `trash` (Papelera) es irremplazable: sin él el usuario no puede restaurar
/// contenido borrado. El resto (admin/settings/profile/about) son la
/// navegación de gobierno del escritorio y nunca deben faltar en una foto
/// pública. Los nodos de contenido (documentos, store, orders, downloads,
/// projects) y los prototipos de juego son opcionales: el admin puede
/// ocultarlos legítimamente (ver v3).
pub const SYSTEM_NODE_IDS: &[&str] = &["trash", "admin", "settings", "profile", "about"];

/// Comprueba que el árbol contenga todos los nodos del sistema obligatorios.
/// Devuelve el primer id ausente. [038A-2]
fn first_missing_system_node(nodes: &serde_json::Map<String, JsonValue>) -> Option<&'static str> {
    SYSTEM_NODE_IDS
        .iter()
        .copied()
        .find(|id| !nodes.contains_key(*id))
}

/// Tipos de nodo válidos en un release.
fn is_valid_node_type(node_type: &str) -> bool {
    matches!(node_type, "folder" | "app" | "shortcut" | "resource")
}

/// Valida la estructura del árbol de un release. Devuelve el primer fallo.
pub fn validate_release_tree(tree: &JsonValue) -> Result<(), String> {
    let nodes = tree
        .get("nodes")
        .and_then(JsonValue::as_object)
        .ok_or_else(|| "El release debe contener nodes como objeto".to_string())?;
    if nodes.is_empty() {
        return Err("El release no puede tener un árbol vacío".to_string());
    }
    if nodes.len() > MAX_RELEASE_NODES {
        return Err(format!(
            "El release supera el límite de {MAX_RELEASE_NODES} nodos"
        ));
    }

    for (id, node) in nodes {
        validate_node(id, node, nodes)?;
    }
    validate_parent_graph(nodes)?;

    /* [038A-2] Tras validar la estructura, exigir la presencia de los nodos de
     * sistema: ninguna fuente puede publicar/activar una release que deje el
     * OS sin Papelera, admin, settings, profile o about. */
    if let Some(missing) = first_missing_system_node(nodes) {
        return Err(format!(
            "El release debe contener el nodo de sistema '{missing}'"
        ));
    }
    Ok(())
}

fn validate_node(
    id: &str,
    node: &JsonValue,
    nodes: &serde_json::Map<String, JsonValue>,
) -> Result<(), String> {
    validate_id(id)?;
    let node = node
        .as_object()
        .ok_or_else(|| format!("El nodo {id} debe ser un objeto"))?;

    for key in node.keys() {
        if !matches!(
            key.as_str(),
            "id" | "parentId"
                | "type"
                | "label"
                | "refId"
                | "resourceKind"
                | "publicLocator"
                | "position"
                | "mobilePosition"
                | "mobileOrder"
                | "requires"
        ) {
            return Err(format!(
                "El nodo {id} contiene un campo no permitido: {key}"
            ));
        }
    }

    let node_id = node
        .get("id")
        .and_then(JsonValue::as_str)
        .ok_or_else(|| format!("El nodo {id} debe tener id"))?;
    if node_id != id {
        return Err(format!("El id del nodo no coincide con su clave: {id}"));
    }

    let node_type = node
        .get("type")
        .and_then(JsonValue::as_str)
        .ok_or_else(|| format!("El nodo {id} debe tener type"))?;
    if !is_valid_node_type(node_type) {
        return Err(format!("El nodo {id} tiene un tipo no válido: {node_type}"));
    }

    if let Some(parent) = node.get("parentId") {
        if parent.is_null() {
            /* Nodo huérfano (papelera) permitido por contrato. */
        } else {
            let parent = parent
                .as_str()
                .ok_or_else(|| format!("El parentId del nodo {id} debe ser texto o null"))?;
            if parent != "desktop" && !nodes.contains_key(parent) {
                return Err(format!(
                    "El nodo {id} referencia un parentId inexistente: {parent}"
                ));
            }
        }
    } else {
        return Err(format!("El nodo {id} debe tener parentId"));
    }

    validate_label(node.get("label"))?;
    validate_optional_string(node.get("refId"), MAX_REF_ID_LENGTH, "refId")?;

    if matches!(node_type, "shortcut" | "resource")
        && node.get("refId").and_then(JsonValue::as_str).is_none()
    {
        return Err(format!("Los nodos {node_type} deben tener refId"));
    }

    if let Some(requires) = node.get("requires") {
        let value = requires
            .as_str()
            .ok_or_else(|| format!("El requires del nodo {id} debe ser texto"))?;
        if !matches!(value, "public" | "admin") {
            return Err(format!("El requires del nodo {id} no es válido: {value}"));
        }
    }

    if node.get("publicLocator").is_some() && !matches!(node_type, "resource" | "shortcut") {
        return Err(format!(
            "publicLocator solo puede pertenecer a recursos o accesos (nodo {id})"
        ));
    }

    validate_position(node.get("position"), id, "position")?;
    validate_position(node.get("mobilePosition"), id, "mobilePosition")?;
    validate_mobile_order(node.get("mobileOrder"), id)?;
    Ok(())
}

/// Detecta ciclos siguiendo `parentId` desde cada nodo.
fn validate_parent_graph(nodes: &serde_json::Map<String, JsonValue>) -> Result<(), String> {
    for start in nodes.keys() {
        let mut seen = std::collections::HashSet::new();
        let mut current = Some(start.as_str());
        while let Some(id) = current {
            if !seen.insert(id) {
                return Err(format!(
                    "El árbol del release contiene un ciclo en la cadena de {start}"
                ));
            }
            let Some(node) = nodes.get(id).and_then(JsonValue::as_object) else {
                break;
            };
            current = node
                .get("parentId")
                .and_then(JsonValue::as_str)
                .filter(|parent| *parent != "desktop" && nodes.contains_key(*parent));
        }
    }
    Ok(())
}

fn validate_label(value: Option<&JsonValue>) -> Result<(), String> {
    let Some(value) = value else { return Ok(()) };
    let label = value
        .as_str()
        .ok_or_else(|| "label debe ser texto".to_string())?;
    if label.trim().is_empty() || label.chars().count() > MAX_LABEL_LENGTH {
        return Err("label no es válido".to_string());
    }
    Ok(())
}

fn validate_optional_string(
    value: Option<&JsonValue>,
    max_length: usize,
    field: &'static str,
) -> Result<(), String> {
    let Some(value) = value else { return Ok(()) };
    let text = value
        .as_str()
        .ok_or_else(|| format!("{field} debe ser texto"))?;
    if text.is_empty() || text.chars().count() > max_length || text.chars().any(char::is_control) {
        return Err(format!("{field} no es válido"));
    }
    Ok(())
}

fn validate_position(value: Option<&JsonValue>, node_id: &str, field: &str) -> Result<(), String> {
    let Some(value) = value else { return Ok(()) };
    let object = value
        .as_object()
        .ok_or_else(|| format!("El {field} del nodo {node_id} debe ser un objeto"))?;
    if object.keys().any(|key| key != "col" && key != "row") {
        return Err(format!(
            "El {field} del nodo {node_id} contiene campos no permitidos"
        ));
    }
    for key in ["col", "row"] {
        let coordinate = object.get(key).and_then(JsonValue::as_u64).ok_or_else(|| {
            format!("El {field} del nodo {node_id} debe tener coordenadas enteras")
        })?;
        if coordinate > MAX_GRID_COORDINATE {
            return Err(format!(
                "El {field} del nodo {node_id} supera el límite permitido"
            ));
        }
    }
    Ok(())
}

fn validate_mobile_order(value: Option<&JsonValue>, node_id: &str) -> Result<(), String> {
    let Some(value) = value else { return Ok(()) };
    let order = value
        .as_u64()
        .ok_or_else(|| format!("El mobileOrder del nodo {node_id} debe ser entero no negativo"))?;
    if order > MAX_MOBILE_ORDER {
        return Err(format!(
            "El mobileOrder del nodo {node_id} supera el límite permitido"
        ));
    }
    Ok(())
}

fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > MAX_ID_LENGTH || id.chars().any(char::is_control) {
        return Err(format!("El id del release no es válido: {id}"));
    }
    Ok(())
}

/// Issue tipado de validación (para la API admin de dry-run de 028A-13).
/// [028A-13-fix] `rename_all = "camelCase"` para exponer `nodeId` (contrato
/// camelCase del API, igual que el resto de DTOs de gobernanza).
#[derive(Debug, Clone, serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseTreeIssue {
    pub node_id: String,
    pub message: String,
}
