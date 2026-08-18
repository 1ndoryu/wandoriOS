use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

/// Rol del usuario en el sistema
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, ToSchema, sqlx::Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "user_role", rename_all = "lowercase")]
pub enum UserRole {
    User,
    Admin,
}

/// Estado del usuario
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "user_status", rename_all = "lowercase")]
pub enum UserStatus {
    Active,
    Suspended,
    Deleted,
}

/// Modelo de usuario almacenado en base de datos
#[derive(Debug, Clone, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub role: UserRole,
    pub status: UserStatus,
    pub created_at: DateTime<Utc>,
}

/// Response público de usuario — sin datos sensibles
#[derive(Debug, Serialize, ToSchema)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub role: UserRole,
    pub created_at: DateTime<Utc>,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            role: user.role,
            created_at: user.created_at,
        }
    }
}

/// Request body para registrar un nuevo usuario
/// Nota: el rol se asigna siempre como 'user' en el servidor.
/// El request NUNCA acepta rol para prevenir escalada.
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct RegisterRequest {
    #[validate(email(message = "Formato de email inválido"))]
    pub email: String,
    #[validate(length(min = 8, message = "La contraseña debe tener al menos 8 caracteres"))]
    pub password: String,
}

/// Request body para iniciar sesión
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct LoginRequest {
    #[validate(email)]
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RegistrationResponse {
    pub message: String,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct VerifyEmailRequest {
    #[validate(length(min = 32, max = 128))]
    pub token: String,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct PasswordResetRequest {
    #[validate(email(message = "Formato de email inválido"))]
    pub email: String,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct ConfirmPasswordResetRequest {
    #[validate(length(min = 32, max = 128))]
    pub token: String,
    #[validate(length(min = 8, message = "La contraseña debe tener al menos 8 caracteres"))]
    pub password: String,
}

/* [297A-13] MFA TOTP: contratos de estado, setup y verificación. El secreto
 * viaja únicamente en `TotpSetupResponse` (un solo uso) y en la URI otpauth. */

#[derive(Debug, Serialize, ToSchema)]
pub struct TotpStatusResponse {
    pub enabled: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TotpSetupResponse {
    pub secret: String,
    pub otpauth_uri: String,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct TotpCodeRequest {
    #[validate(length(min = 6, max = 6))]
    pub code: String,
}

/// Verificación del segundo factor después del login (reto de un solo uso).
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct MfaVerifyRequest {
    #[validate(length(min = 32, max = 128))]
    pub challenge: String,
    #[validate(length(min = 6, max = 6))]
    pub code: String,
}

/// Respuesta del login cuando la cuenta exige segundo factor.
#[derive(Debug, Serialize, ToSchema)]
pub struct LoginMfaRequired {
    pub mfa: String,
    pub challenge: String,
}
