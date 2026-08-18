use std::collections::HashMap;

use sqlx::PgPool;

use crate::models::settings::SiteSetting;

pub struct SettingsRepository;

/* [018A-47] La lista pública es un contrato cerrado. Las claves nuevas no se
 * exponen por accidente solo por existir en `site_settings`; deben añadirse
 * deliberadamente aquí y revisarse como parte del boundary público. */
const PUBLIC_SETTING_KEYS: &[&str] = &[
    "about_content",
    "profile_image",
    "profile_width",
    "profile_height",
    "profile_border",
    "social_links",
    "redes_layout",
    "redes_size",
    "redes_gap",
    "show_entries_on_home",
];

impl SettingsRepository {
    pub async fn get_all(pool: &PgPool) -> Result<HashMap<String, String>, sqlx::Error> {
        let rows =
            sqlx::query_as::<_, SiteSetting>("SELECT key, value, updated_at FROM site_settings")
                .fetch_all(pool)
                .await?;

        Ok(rows.into_iter().map(|s| (s.key, s.value)).collect())
    }

    pub async fn get_public(pool: &PgPool) -> Result<HashMap<String, String>, sqlx::Error> {
        let keys: Vec<String> = PUBLIC_SETTING_KEYS
            .iter()
            .map(|key| (*key).to_string())
            .collect();
        // Dynamic query keeps the repository usable by the local OpenAPI
        // exporter, which intentionally runs without a live database schema.
        let rows = sqlx::query_as::<_, SiteSetting>(
            "SELECT key, value, updated_at FROM site_settings WHERE key = ANY($1)",
        )
        .bind(&keys)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|s| (s.key, s.value)).collect())
    }

    pub async fn upsert(pool: &PgPool, key: &str, value: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, NOW()) \
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
        )
        .bind(key)
        .bind(value)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn upsert_batch(
        pool: &PgPool,
        settings: &HashMap<String, String>,
    ) -> Result<(), sqlx::Error> {
        for (key, value) in settings {
            Self::upsert(pool, key, value).await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::PUBLIC_SETTING_KEYS;

    #[test]
    fn consulta_publica_no_incluye_claves_de_auth() {
        assert!(PUBLIC_SETTING_KEYS.contains(&"profile_image"));
        assert!(PUBLIC_SETTING_KEYS.contains(&"about_content"));
        assert!(!PUBLIC_SETTING_KEYS.contains(&"registration_enabled"));
    }
}
