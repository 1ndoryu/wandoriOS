use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::preferences::{UpdateUserPreferencesRequest, UserPreferences};
use crate::repositories::preferences_repo::PreferencesRepository;
use crate::repositories::settings_repo::SettingsRepository;

pub struct PreferencesService;

/// Valores efectivos de apariencia para el cliente: el campo del usuario si
/// existe, si no el default global (del admin) guardado en `site_settings`.
/// [297A-29] Los defaults del admin son la configuración por defecto del OS;
/// cada usuario puede sobreescribirlos campo a campo (NULL en su fila).
pub fn resolve_appearance(
    user_prefs: &UserPreferences,
    defaults: &std::collections::HashMap<String, String>,
) -> (Option<String>, Option<String>, Option<f64>) {
    let default_scale = defaults
        .get("appearance_scale")
        .and_then(|v| v.parse::<f64>().ok())
        .unwrap_or(1.0);

    let wallpaper = user_prefs.wallpaper.clone().or_else(|| {
        defaults
            .get("appearance_wallpaper")
            .filter(|v| !v.is_empty())
            .cloned()
    });
    let font = user_prefs.font.clone().or_else(|| {
        defaults
            .get("appearance_font")
            .filter(|v| !v.is_empty())
            .cloned()
    });
    let scale = user_prefs.scale.or_else(|| {
        defaults
            .get("appearance_scale")
            .and_then(|v| v.parse::<f64>().ok())
            .filter(|v| *v != 0.0)
    });

    let scale = if scale.unwrap_or(0.0) == 0.0 {
        Some(default_scale)
    } else {
        scale
    };
    (wallpaper, font, scale)
}

impl PreferencesService {
    pub async fn get(pool: &PgPool, user_id: Uuid) -> Result<UserPreferences, AppError> {
        let mut prefs = PreferencesRepository::get(pool, user_id)
            .await?
            .unwrap_or_else(|| UserPreferences {
                user_id,
                theme: "system".to_string(),
                wallpaper: None,
                font: None,
                scale: None,
                revision: 0,
                updated_at: chrono::Utc::now(),
            });

        // Los campos NULL se resuelven contra el default global del admin.
        let defaults = SettingsRepository::get_all(pool).await?;
        let (wallpaper, font, scale) = resolve_appearance(&prefs, &defaults);
        prefs.wallpaper = wallpaper;
        prefs.font = font;
        prefs.scale = scale;
        Ok(prefs)
    }

    pub async fn update(
        pool: &PgPool,
        user_id: Uuid,
        request: UpdateUserPreferencesRequest,
    ) -> Result<UserPreferences, AppError> {
        request
            .validate()
            .map_err(|message| AppError::Validation(message.into()))?;

        let updated = PreferencesRepository::update_if_revision(pool, user_id, &request)
            .await?
            .ok_or_else(|| {
                AppError::Conflict("Las preferencias cambiaron; vuelve a leerlas".into())
            })?;

        // Devolver siempre valores efectivos (con defaults del admin aplicados).
        let defaults = SettingsRepository::get_all(pool).await?;
        let mut effective = updated;
        let (wallpaper, font, scale) = resolve_appearance(&effective, &defaults);
        effective.wallpaper = wallpaper;
        effective.font = font;
        effective.scale = scale;
        Ok(effective)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::models::preferences::UserPreferences;

    fn prefs(
        wallpaper: Option<String>,
        font: Option<String>,
        scale: Option<f64>,
    ) -> UserPreferences {
        UserPreferences {
            user_id: uuid::Uuid::nil(),
            theme: "system".into(),
            wallpaper,
            font,
            scale,
            revision: 0,
            updated_at: chrono::Utc::now(),
        }
    }

    #[test]
    fn user_values_win_over_admin_defaults() {
        let mut defaults = HashMap::new();
        defaults.insert("appearance_wallpaper".into(), "admin.png".to_string());
        defaults.insert("appearance_font".into(), "mono".to_string());
        defaults.insert("appearance_scale".into(), "1.20".to_string());

        let (w, f, s) = resolve_appearance(
            &prefs(Some("yo.png".into()), Some("sans".into()), Some(1.05)),
            &defaults,
        );
        assert_eq!(w.as_deref(), Some("yo.png"));
        assert_eq!(f.as_deref(), Some("sans"));
        assert_eq!(s, Some(1.05));
    }

    #[test]
    fn null_user_fields_heredan_el_default_del_admin() {
        let mut defaults = HashMap::new();
        defaults.insert("appearance_wallpaper".into(), "admin.png".to_string());
        defaults.insert("appearance_font".into(), "mono".to_string());
        defaults.insert("appearance_scale".into(), "0.90".to_string());

        let (w, f, s) = resolve_appearance(&prefs(None, None, None), &defaults);
        assert_eq!(w.as_deref(), Some("admin.png"));
        assert_eq!(f.as_deref(), Some("mono"));
        assert_eq!(s, Some(0.90));
    }

    #[test]
    fn empty_admin_defaults_fall_back_to_system() {
        let defaults = HashMap::new();
        let (w, f, s) = resolve_appearance(&prefs(None, None, None), &defaults);
        assert_eq!(w, None);
        assert_eq!(f, None);
        assert_eq!(s, Some(1.0));
    }
}
