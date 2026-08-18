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
use crate::services::game_ticket::GameTicketStore;
use crate::services::game_ws::GameWsState;

/// Estado compartido de la aplicacion — accesible desde handlers y middleware
#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub upload_dir: String,
    pub resend_api_key: Option<String>,
    pub email_from: String,
    pub stripe_secret_key: Option<String>,
    pub stripe_webhook_secret: Option<String>,
    pub game_ticket_secret: Option<String>,
    pub game_ticket_store: GameTicketStore,
    pub game_ws_state: GameWsState,
    pub site_url: String,
    /// [297A-8] Rate limit para login por IP
    pub login_rate_limit: Arc<LoginRateLimit>,
    /// Rate limit independiente para registro y recuperación por IP
    pub auth_action_rate_limit: Arc<AuthActionRateLimit>,
}
