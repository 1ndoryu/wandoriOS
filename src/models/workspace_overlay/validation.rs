use serde_json::Value as JsonValue;

use super::{public_locator, WorkspaceOverlayDocument};

const OVERLAY_SCHEMA_VERSION: i32 = 1;
const MAX_OVERLAY_BYTES: usize = 100 * 1024;
const MAX_ADDED_ITEMS: usize = 500;
const MAX_FIELD_OVERRIDES: usize = 500;
const MAX_TOMBSTONES: usize = 500;
const MAX_ID_LENGTH: usize = 128;
const MAX_LABEL_LENGTH: usize = 255;
const MAX_REF_ID_LENGTH: usize = 256;
const MAX_GRID_COORDINATE: u64 = 10_000;
const MAX_MOBILE_ORDER: u64 = 100_000;

pub(super) fn validate_overlay(overlay: &WorkspaceOverlayDocument) -> Result<(), &'static str> {
    if overlay.version != OVERLAY_SCHEMA_VERSION {
        return Err("Versión de overlay no compatible");
    }

    let added_items = overlay
        .added_items
        .as_object()
        .ok_or("addedItems debe ser un objeto")?;
    if added_items.len() > MAX_ADDED_ITEMS {
        return Err("El overlay supera el máximo de elementos añadidos");
    }
    for (id, node) in added_items {
        validate_added_node(id, node, added_items)?;
    }
    validate_added_parent_graph(added_items)?;

    let field_overrides = overlay
        .field_overrides
        .as_object()
        .ok_or("fieldOverrides debe ser un objeto")?;
    if field_overrides.len() > MAX_FIELD_OVERRIDES {
        return Err("El overlay supera el máximo de overrides");
    }
    for (id, override_value) in field_overrides {
        validate_id(id)?;
        validate_field_override(override_value)?;
    }

    if overlay.tombstones.len() > MAX_TOMBSTONES {
        return Err("El overlay supera el máximo de tombstones");
    }
    let mut unique_tombstones = std::collections::HashSet::new();
    for id in &overlay.tombstones {
        validate_id(id)?;
        if !unique_tombstones.insert(id) {
            return Err("Los tombstones no pueden repetirse");
        }
    }

    let serialized = serde_json::to_vec(overlay).map_err(|_| "Overlay inválido")?;
    if serialized.len() > MAX_OVERLAY_BYTES {
        return Err("El overlay supera el tamaño máximo permitido");
    }
    Ok(())
}

fn validate_added_node(
    id: &str,
    node: &JsonValue,
    added_items: &serde_json::Map<String, JsonValue>,
) -> Result<(), &'static str> {
    validate_id(id)?;
    let node = node
        .as_object()
        .ok_or("Cada elemento añadido debe ser un objeto")?;
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
            return Err("El elemento añadido contiene un campo no permitido");
        }
    }
    let node_id = node
        .get("id")
        .and_then(JsonValue::as_str)
        .ok_or("Cada elemento añadido debe tener id")?;
    if node_id != id {
        return Err("El id del elemento añadido no coincide con su clave");
    }
    let node_type = node
        .get("type")
        .and_then(JsonValue::as_str)
        .ok_or("Cada elemento añadido debe tener type")?;
    if !matches!(node_type, "folder" | "shortcut" | "resource") {
        return Err("El overlay no puede añadir ese tipo de nodo");
    }
    let parent = node
        .get("parentId")
        .ok_or("Cada elemento añadido debe tener parentId")?;
    if parent.is_null() {
        return Err("Un elemento añadido debe pertenecer a una carpeta o al escritorio");
    }
    validate_parent_value(parent, added_items)?;
    validate_label(node.get("label"))?;
    validate_optional_string(node.get("refId"), MAX_REF_ID_LENGTH, "refId")?;
    if matches!(node_type, "shortcut" | "resource")
        && node.get("refId").and_then(JsonValue::as_str).is_none()
    {
        return Err("Los accesos y recursos añadidos deben tener refId");
    }
    if let Some(resource_kind) = node.get("resourceKind") {
        let value = resource_kind
            .as_str()
            .ok_or("resourceKind debe ser texto")?;
        if !matches!(
            value,
            "article"
                | "about"
                | "project"
                | "product"
                | "image"
                | "audio"
                | "video"
                | "document"
                | "folder"
                | "shortcut"
                | "generic"
        ) {
            return Err("resourceKind no válido");
        }
    }
    if node.get("publicLocator").is_some() && !matches!(node_type, "resource" | "shortcut") {
        return Err("publicLocator solo puede pertenecer a recursos o accesos");
    }
    public_locator::validate_public_locator(node.get("publicLocator"))?;
    if let Some(requires) = node.get("requires") {
        if requires.as_str() != Some("public") {
            return Err("Un overlay personal no puede añadir nodos restringidos");
        }
    }
    validate_position(node.get("position"))?;
    validate_position(node.get("mobilePosition"))?;
    validate_mobile_order(node.get("mobileOrder"))?;
    Ok(())
}

fn validate_added_parent_graph(
    added_items: &serde_json::Map<String, JsonValue>,
) -> Result<(), &'static str> {
    for start in added_items.keys() {
        let mut seen = std::collections::HashSet::new();
        let mut current = Some(start.as_str());
        while let Some(id) = current {
            if !seen.insert(id) {
                return Err("Los nodos añadidos no pueden formar ciclos");
            }
            let Some(node) = added_items.get(id).and_then(JsonValue::as_object) else {
                break;
            };
            current = node
                .get("parentId")
                .and_then(JsonValue::as_str)
                .filter(|parent| added_items.contains_key(*parent));
        }
    }
    Ok(())
}

fn validate_parent_value(
    value: &JsonValue,
    added_items: &serde_json::Map<String, JsonValue>,
) -> Result<(), &'static str> {
    if value.is_null() {
        return Ok(());
    }
    let parent = value.as_str().ok_or("parentId debe ser texto o null")?;
    if parent != "desktop" {
        validate_id(parent)?;
        if !added_items.contains_key(parent) {
            /* Un padre del release puede existir aunque no esté en addedItems. */
        }
    }
    Ok(())
}

fn validate_field_override(value: &JsonValue) -> Result<(), &'static str> {
    let object = value
        .as_object()
        .ok_or("Cada fieldOverride debe ser un objeto")?;
    for key in object.keys() {
        if !matches!(
            key.as_str(),
            "position" | "mobilePosition" | "label" | "parentId" | "mobileOrder"
        ) {
            return Err("fieldOverride contiene un campo no permitido");
        }
    }
    validate_label(object.get("label"))?;
    validate_parent_value(
        object.get("parentId").unwrap_or(&JsonValue::Null),
        &serde_json::Map::new(),
    )?;
    validate_position(object.get("position"))?;
    validate_position(object.get("mobilePosition"))?;
    validate_mobile_order(object.get("mobileOrder"))?;
    Ok(())
}

fn validate_label(value: Option<&JsonValue>) -> Result<(), &'static str> {
    let Some(value) = value else { return Ok(()) };
    let label = value.as_str().ok_or("label debe ser texto")?;
    if label.trim().is_empty() || label.chars().count() > MAX_LABEL_LENGTH {
        return Err("label no es válido");
    }
    Ok(())
}

fn validate_optional_string(
    value: Option<&JsonValue>,
    max_length: usize,
    field: &'static str,
) -> Result<(), &'static str> {
    let Some(value) = value else { return Ok(()) };
    let text = value.as_str().ok_or(field)?;
    if text.is_empty() || text.chars().count() > max_length || text.chars().any(char::is_control) {
        return Err(field);
    }
    Ok(())
}

fn validate_position(value: Option<&JsonValue>) -> Result<(), &'static str> {
    let Some(value) = value else { return Ok(()) };
    let object = value.as_object().ok_or("position debe ser un objeto")?;
    if object.keys().any(|key| key != "col" && key != "row") {
        return Err("position contiene campos no permitidos");
    }
    for key in ["col", "row"] {
        let coordinate = object
            .get(key)
            .and_then(JsonValue::as_u64)
            .ok_or("position debe contener coordenadas enteras")?;
        if coordinate > MAX_GRID_COORDINATE {
            return Err("position supera el límite permitido");
        }
    }
    Ok(())
}

fn validate_mobile_order(value: Option<&JsonValue>) -> Result<(), &'static str> {
    let Some(value) = value else { return Ok(()) };
    let order = value
        .as_u64()
        .ok_or("mobileOrder debe ser entero no negativo")?;
    if order > MAX_MOBILE_ORDER {
        return Err("mobileOrder supera el límite permitido");
    }
    Ok(())
}

fn validate_id(id: &str) -> Result<(), &'static str> {
    if id.is_empty() || id.len() > MAX_ID_LENGTH || id.chars().any(char::is_control) {
        return Err("El id del overlay no es válido");
    }
    Ok(())
}
