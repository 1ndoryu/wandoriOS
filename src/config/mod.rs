use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("Variable de entorno requerida no encontrada: {0}")]
    MissingEnvVar(String),
    #[error("Puerto inválido: {0}")]
    InvalidPort(#[from] std::num::ParseIntError),
}

/// Configuracion de la aplicacion cargada desde variables de entorno
#[derive(Debug, Clone)]
pub struct AppConfig {
    pub database_url: String,
    pub host: String,
    pub port: u16,
    pub stripe_secret_key: Option<String>,
    pub stripe_webhook_secret: Option<String>,
    pub upload_dir: String,
    pub resend_api_key: Option<String>,
    pub email_from: String,
    pub frontend_dist: String,
}

impl AppConfig {
    /// Carga la configuración desde variables de entorno.
    /// Requiere `DATABASE_URL`; `HOST` y `PORT` son opcionales.
    pub fn from_env() -> Result<Self, ConfigError> {
        Ok(Self {
            database_url: std::env::var("DATABASE_URL")
                .map_err(|_| ConfigError::MissingEnvVar("DATABASE_URL".into()))?,
            host: std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()?,
            stripe_secret_key: std::env::var("GLORY_STRIPE_SECRET_KEY")
                .or_else(|_| std::env::var("STRIPE_SECRET_KEY"))
                .ok(),
            stripe_webhook_secret: std::env::var("GLORY_STRIPE_WEBHOOK_SECRET")
                .or_else(|_| std::env::var("STRIPE_WEBHOOK_SECRET"))
                .ok(),
            upload_dir: std::env::var("UPLOAD_DIR").unwrap_or_else(|_| "uploads".to_string()),
            resend_api_key: std::env::var("RESEND_API_KEY").ok(),
            email_from: std::env::var("EMAIL_FROM")
                .unwrap_or_else(|_| "noreply@wandori.us".to_string()),
            frontend_dist: std::env::var("FRONTEND_DIST")
                .unwrap_or_else(|_| "frontend/dist".to_string()),
        })
    }
}
