use super::{validate_public_locators_in_tree, WorkspaceOverlayDocument};
use serde_json::json;
use serde_json::Value as JsonValue;

fn document(added_items: serde_json::Value) -> WorkspaceOverlayDocument {
    WorkspaceOverlayDocument {
        version: 1,
        added_items,
        field_overrides: json!({}),
        tombstones: Vec::new(),
    }
}

#[test]
fn rechaza_ciclos_en_nodos_anadidos() {
    let overlay = document(json!({
        "a": {"id":"a", "parentId":"b", "type":"folder", "label":"A"},
        "b": {"id":"b", "parentId":"a", "type":"folder", "label":"B"}
    }));
    assert!(overlay.validate().is_err());
}

#[test]
fn rechaza_campos_desconocidos_en_overrides() {
    let mut overlay = document(json!({}));
    overlay.field_overrides = json!({"a": {"requires": "admin"}});
    assert!(overlay.validate().is_err());
}

#[test]
fn rechaza_posiciones_negativas_o_fuera_de_limite() {
    let mut overlay = document(json!({
        "a": {"id":"a", "parentId":"desktop", "type":"folder", "label":"A", "position":{"col":0,"row":0}}
    }));
    overlay.field_overrides = json!({"a": {"position": {"col": -1, "row": 0}}});
    assert!(overlay.validate().is_err());
}

#[test]
fn rechaza_requires_no_textual() {
    let overlay = document(json!({
        "a": {"id":"a", "parentId":"desktop", "type":"folder", "label":"A", "requires":true}
    }));
    assert!(overlay.validate().is_err());
}

#[test]
fn rechaza_payload_sobredimensionado() {
    let mut items = serde_json::Map::new();
    for index in 0..500 {
        let id = format!("folder-{index}");
        items.insert(
            id.clone(),
            json!({
                "id": id,
                "parentId": "desktop",
                "type": "folder",
                "label": "x".repeat(255),
                "requires": "public"
            }),
        );
    }
    assert!(document(JsonValue::Object(items)).validate().is_err());
}

#[test]
fn acepta_overlay_publico_valido() {
    let overlay = document(json!({
        "a": {"id":"a", "parentId":"desktop", "type":"folder", "label":"A", "requires":"public"}
    }));
    assert!(overlay.validate().is_ok());
}

#[test]
fn acepta_locator_publico_y_rechaza_identificadores_internos() {
    let valid = document(json!({
        "article": {
            "id":"article",
            "parentId":"desktop",
            "type":"resource",
            "label":"Artículo",
            "refId":"internal-uuid",
            "resourceKind":"article",
            "publicLocator": {
                "appId":"reader",
                "params":{"slug":"articulo-publico"}
            }
        }
    }));
    assert!(valid.validate().is_ok());

    let invalid = document(json!({
        "article": {
            "id":"article",
            "parentId":"desktop",
            "type":"resource",
            "label":"Artículo",
            "refId":"internal-uuid",
            "resourceKind":"article",
            "publicLocator": {
                "appId":"reader",
                "params":{"resourceId":"internal-uuid"}
            }
        }
    }));
    assert!(invalid.validate().is_err());
}

#[test]
fn release_rechaza_locator_publico_malformado() {
    let valid_tree = json!({
        "version": 1,
        "nodes": {
            "article": {
                "id": "article",
                "parentId": "desktop",
                "type": "resource",
                "label": "Artículo",
                "refId": "internal-uuid",
                "publicLocator": {
                    "appId": "reader",
                    "params": {"slug": "articulo-publico"}
                }
            }
        }
    });
    assert!(validate_public_locators_in_tree(&valid_tree).is_ok());

    let invalid_tree = json!({
        "version": 1,
        "nodes": {
            "article": {
                "id": "article",
                "parentId": "desktop",
                "type": "resource",
                "label": "Artículo",
                "refId": "internal-uuid",
                "publicLocator": {
                    "appId": "reader",
                    "params": {"resourceId": "internal-uuid"}
                }
            }
        }
    });
    assert!(validate_public_locators_in_tree(&invalid_tree).is_err());

    let restricted_tree = json!({
        "version": 1,
        "nodes": {
            "article": {
                "id": "article",
                "parentId": "desktop",
                "type": "resource",
                "label": "Artículo",
                "requires": "admin",
                "publicLocator": {
                    "appId": "reader",
                    "params": {"slug": "articulo-publico"}
                }
            }
        }
    });
    assert!(validate_public_locators_in_tree(&restricted_tree).is_err());
}
