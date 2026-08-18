use serde_json::Value as JsonValue;

const MAX_PUBLIC_LOCATOR_PARAMS: usize = 16;
const MAX_PUBLIC_LOCATOR_KEY_LENGTH: usize = 64;
const MAX_PUBLIC_LOCATOR_VALUE_LENGTH: usize = 200;
const MAX_ID_LENGTH: usize = 128;

pub fn validate_public_locators_in_tree(tree: &JsonValue) -> Result<(), &'static str> {
    let nodes = tree
        .get("nodes")
        .and_then(JsonValue::as_object)
        .ok_or("El release debe contener nodes")?;
    for node in nodes.values() {
        if let Some(locator) = node.get("publicLocator") {
            let node_type = node.get("type").and_then(JsonValue::as_str);
            if !matches!(node_type, Some("resource" | "shortcut")) {
                return Err("publicLocator solo puede pertenecer a recursos o accesos");
            }
            if let Some(requires) = node.get("requires") {
                if requires.as_str() != Some("public") {
                    return Err("Un publicLocator solo puede pertenecer a nodos públicos");
                }
            }
            validate_public_locator(Some(locator))?;
        }
    }
    Ok(())
}

pub(super) fn validate_public_locator(value: Option<&JsonValue>) -> Result<(), &'static str> {
    let Some(value) = value else { return Ok(()) };
    let object = value
        .as_object()
        .ok_or("publicLocator debe ser un objeto")?;
    if object.keys().any(|key| key != "appId" && key != "params") {
        return Err("publicLocator contiene campos no permitidos");
    }
    let app_id = object
        .get("appId")
        .and_then(JsonValue::as_str)
        .ok_or("publicLocator debe tener appId")?;
    validate_id(app_id)?;

    let params = object
        .get("params")
        .and_then(JsonValue::as_object)
        .ok_or("publicLocator debe tener params")?;
    if params.len() > MAX_PUBLIC_LOCATOR_PARAMS {
        return Err("publicLocator tiene demasiados parámetros");
    }
    for (key, parameter) in params {
        if key.is_empty()
            || key.len() > MAX_PUBLIC_LOCATOR_KEY_LENGTH
            || key.chars().any(char::is_control)
            || matches!(key.as_str(), "resourceId" | "refId" | "token" | "grant")
        {
            return Err("publicLocator contiene una clave interna o inválida");
        }
        let parameter = parameter
            .as_str()
            .ok_or("Los parámetros de publicLocator deben ser texto")?;
        if parameter.is_empty()
            || parameter == "."
            || parameter == ".."
            || parameter.chars().count() > MAX_PUBLIC_LOCATOR_VALUE_LENGTH
            || parameter.chars().any(char::is_control)
            || parameter.contains('/')
            || parameter.contains('\\')
        {
            return Err("publicLocator contiene un valor inválido");
        }
    }
    Ok(())
}

fn validate_id(id: &str) -> Result<(), &'static str> {
    if id.is_empty() || id.len() > MAX_ID_LENGTH || id.chars().any(char::is_control) {
        return Err("El id del overlay no es válido");
    }
    Ok(())
}
