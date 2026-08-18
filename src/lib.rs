#![deny(clippy::all)]
#![warn(clippy::pedantic)]
#![allow(clippy::module_name_repetitions)]
#![allow(clippy::missing_errors_doc)]
#![allow(clippy::missing_panics_doc)]

pub mod config;
pub mod errors;
pub mod handlers;
pub mod middleware;
pub mod models;
pub mod repositories;
pub mod services;

use sqlx::PgPool;
use std::sync::Arc;

use crate::handlers::auth::{AuthActionRateLimit, LoginRateLimit};
use crate::handlers::dev_mail::DevMailbox;

/// Estado compartido de la aplicacion — accesible desde handlers y middleware
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub upload_dir: String,
    pub resend_api_key: Option<String>,
    pub email_from: String,
    pub stripe_secret_key: Option<String>,
    pub stripe_webhook_secret: Option<String>,
    pub site_url: String,
    /// [297A-8] Rate limit para login por IP
    pub login_rate_limit: Arc<LoginRateLimit>,
    /// Rate limit independiente para registro y recuperación por IP
    pub auth_action_rate_limit: Arc<AuthActionRateLimit>,
    /// [297A-13] Buzón de correo mockeado en desarrollo (fail-closed en prod)
    pub dev_mailbox: Arc<DevMailbox>,
}

impl AppState {
    /// [297A-15] Modo mock de pagos: SOLO cuando no hay secretos reales de
    /// Stripe configurados. Fail-closed: con claves reales (producción), el
    /// mock nunca se activa; el checkout llama al proveedor y el webhook exige
    /// firma HMAC. El mismo patrón que Resend/DevMailbox: real solo en prod.
    pub fn stripe_mock_enabled(&self) -> bool {
        self.stripe_secret_key.is_none() && self.stripe_webhook_secret.is_none()
    }
}
