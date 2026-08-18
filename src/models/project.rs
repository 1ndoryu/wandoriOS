use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

/// Proyecto del portfolio
#[derive(Debug, Clone, FromRow)]
pub struct Project {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub url: Option<String>,
    /// [018A-85] Imagen de portada opcional para el catálogo público.
    pub cover_image: Option<String>,
    pub sort_order: i32,
    pub is_visible: bool,
    pub created_at: DateTime<Utc>,
}

/// [018A-48] Contrato administrativo completo. Los metadatos de orden y
/// visibilidad solo se devuelven tras autorización de administrador.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ProjectAdminResponse {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub url: Option<String>,
    pub cover_image: Option<String>,
    pub sort_order: i32,
    pub is_visible: bool,
    pub created_at: DateTime<Utc>,
}

/// [018A-48] Contrato público mínimo. El repository ya filtra y ordena los
/// proyectos visibles; no se filtran al visitante detalles de presentación.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ProjectPublicResponse {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub url: Option<String>,
    pub cover_image: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<&Project> for ProjectAdminResponse {
    fn from(project: &Project) -> Self {
        Self {
            id: project.id,
            title: project.title.clone(),
            description: project.description.clone(),
            url: project.url.clone(),
            cover_image: project.cover_image.clone(),
            sort_order: project.sort_order,
            is_visible: project.is_visible,
            created_at: project.created_at,
        }
    }
}

impl From<&Project> for ProjectPublicResponse {
    fn from(project: &Project) -> Self {
        Self {
            id: project.id,
            title: project.title.clone(),
            description: project.description.clone(),
            url: project.url.clone(),
            cover_image: project.cover_image.clone(),
            created_at: project.created_at,
        }
    }
}

/* [018A-85] Helper serde: distingue campo ausente (None) de null (Some(None))
 * en Option<Option<T>>. Sin él, serde colapsa null y ausente en None y no se
 * podría limpiar la portada con un PUT { "cover_image": null }. */
fn deserialize_some<'de, T, D>(deserializer: D) -> Result<Option<T>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateProjectRequest {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub url: Option<String>,
    #[serde(default)]
    pub cover_image: Option<String>,
    #[serde(default)]
    pub sort_order: i32,
    /// Los proyectos nuevos nacen privados/ocultos salvo publicación explícita.
    #[serde(default)]
    pub is_visible: bool,
}

/// Parche explícito de URL: distingue omitir, limpiar y reemplazar.
#[derive(Debug, Default, ToSchema, PartialEq, Eq)]
pub enum ProjectUrlUpdate {
    #[default]
    Unchanged,
    Clear,
    Set(String),
}

impl<'de> Deserialize<'de> for ProjectUrlUpdate {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        use serde::de::Error as _;
        /* [018A-82] El contrato OpenAPI generado por ToSchema (y consumido por
         * Orval) serializa el enum como "Unchanged" | "Clear" | { "Set": "..." }
         * (externally-tagged), pero el Deserialize previo solo aceptaba string
         * plana/null y rechazaba { "Set": "..." } con 422 — por eso guardar un
         * proyecto con URL fallaba en update y autosave.
         * Ahora se acepta el formato canónico del schema más el legacy
         * (null → Clear, string plana → Set) para compatibilidad con clientes
         * previos. El frontend (Orval) ya enviaba el formato correcto; el
         * backend incumplía su propio contrato (regla 13: OpenAPI manda). */
        match serde_json::Value::deserialize(deserializer)? {
            serde_json::Value::Null => Ok(Self::Clear),
            serde_json::Value::String(s) if s == "Unchanged" => Ok(Self::Unchanged),
            serde_json::Value::String(s) if s == "Clear" => Ok(Self::Clear),
            serde_json::Value::String(s) => Ok(Self::Set(s)),
            serde_json::Value::Object(mut map) => match map.remove("Set") {
                Some(serde_json::Value::String(s)) => Ok(Self::Set(s)),
                _ => Err(D::Error::custom(
                    "url: expected { \"Set\": \"<url>\" }, a variant string or null",
                )),
            },
            _ => Err(D::Error::custom(
                "url: expected { \"Set\": \"<url>\" }, a variant string or null",
            )),
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateProjectRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    /// Ausente conserva la URL; null la limpia; una cadena la reemplaza.
    #[serde(default)]
    pub url: ProjectUrlUpdate,
    /// [018A-85] Ausente conserva la portada; null la limpia; una cadena la
    /// reemplaza (Option<Option<String>>: None = no tocar, Some(None) = borrar).
    #[serde(default, deserialize_with = "deserialize_some")]
    pub cover_image: Option<Option<String>>,
    pub sort_order: Option<i32>,
    pub is_visible: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::{
        Project, ProjectAdminResponse, ProjectPublicResponse, ProjectUrlUpdate,
        UpdateProjectRequest,
    };
    use chrono::Utc;
    use uuid::Uuid;

    #[test]
    fn distingue_url_omitida_nula_y_con_valor() {
        let omitted: UpdateProjectRequest = serde_json::from_str(r#"{}"#).unwrap();
        assert_eq!(omitted.url, ProjectUrlUpdate::Unchanged);

        let cleared: UpdateProjectRequest = serde_json::from_str(r#"{"url":null}"#).unwrap();
        assert_eq!(cleared.url, ProjectUrlUpdate::Clear);

        let replaced: UpdateProjectRequest =
            serde_json::from_str(r#"{"url":"https://example.com"}"#).unwrap();
        assert_eq!(
            replaced.url,
            ProjectUrlUpdate::Set("https://example.com".to_string())
        );

        /* [018A-82] Formato canónico del contrato OpenAPI (externally-tagged)
         * que envía el cliente Orval; antes rechazado con 422. */
        let replaced_tagged: UpdateProjectRequest =
            serde_json::from_str(r#"{"url":{"Set":"https://example.com"}}"#).unwrap();
        assert_eq!(
            replaced_tagged.url,
            ProjectUrlUpdate::Set("https://example.com".to_string())
        );

        let cleared_tagged: UpdateProjectRequest =
            serde_json::from_str(r#"{"url":"Clear"}"#).unwrap();
        assert_eq!(cleared_tagged.url, ProjectUrlUpdate::Clear);

        let unchanged_tagged: UpdateProjectRequest =
            serde_json::from_str(r#"{"url":"Unchanged"}"#).unwrap();
        assert_eq!(unchanged_tagged.url, ProjectUrlUpdate::Unchanged);
    }

    #[test]
    fn contrato_publico_no_expone_orden_ni_visibilidad() {
        let project = Project {
            id: Uuid::new_v4(),
            title: "Proyecto".into(),
            description: "Descripción".into(),
            url: Some("https://example.com".into()),
            cover_image: Some("https://example.com/cover.png".into()),
            sort_order: 7,
            is_visible: true,
            created_at: Utc::now(),
        };

        let public = serde_json::to_value(ProjectPublicResponse::from(&project)).unwrap();
        assert!(public.get("sort_order").is_none());
        assert!(public.get("is_visible").is_none());
        assert_eq!(
            public.get("cover_image").and_then(|value| value.as_str()),
            Some("https://example.com/cover.png")
        );

        let admin = serde_json::to_value(ProjectAdminResponse::from(&project)).unwrap();
        assert_eq!(
            admin.get("sort_order").and_then(|value| value.as_i64()),
            Some(7)
        );
        assert_eq!(
            admin.get("is_visible").and_then(|value| value.as_bool()),
            Some(true)
        );
    }

    /* [018A-85] La portada distingue omitir (conservar), null (limpiar) y
     * cadena (reemplazar) — mismo contrato semántico que la URL. */
    #[test]
    fn portada_distingue_omitida_nula_y_con_valor() {
        let omitted: UpdateProjectRequest = serde_json::from_str(r#"{}"#).unwrap();
        assert_eq!(omitted.cover_image, None);

        let cleared: UpdateProjectRequest =
            serde_json::from_str(r#"{"cover_image":null}"#).unwrap();
        assert_eq!(cleared.cover_image, Some(None));

        let replaced: UpdateProjectRequest =
            serde_json::from_str(r#"{"cover_image":"https://x.com/a.png"}"#).unwrap();
        assert_eq!(
            replaced.cover_image,
            Some(Some("https://x.com/a.png".to_string()))
        );
    }
}
