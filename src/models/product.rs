use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

use validator::Validate;

/// Producto vendible. [297A-10] `article_id` ahora es opcional (independiente de artículo).
#[derive(Debug, Clone, FromRow)]
pub struct Product {
    pub id: Uuid,
    /// [297A-10] Opcional: producto independiente de artículo.
    pub article_id: Option<Uuid>,
    pub name: String,
    pub description: String,
    pub price_cents: i32,
    pub currency: String,
    pub stripe_product_id: Option<String>,
    pub stripe_price_id: Option<String>,
    /// Legacy: `download_path` directo. Se mantiene hasta fase contract.
    pub download_path: Option<String>,
    /// Legacy: `is_active`. Se mantiene hasta fase contract.
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

/// [018A-46] Contrato administrativo del producto. Nunca incluye storage keys ni
/// identificadores del proveedor de pagos; esos campos permanecen internos.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ProductAdminResponse {
    pub id: Uuid,
    pub article_id: Option<Uuid>,
    pub name: String,
    pub description: String,
    pub price_cents: i32,
    pub currency: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

/// [018A-46] Contrato público mínimo. La disponibilidad ya fue filtrada por el
/// repository; no expone rutas de descarga, storage keys ni datos de Stripe.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ProductPublicResponse {
    pub id: Uuid,
    pub article_id: Option<Uuid>,
    pub name: String,
    pub description: String,
    pub price_cents: i32,
    pub currency: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

impl From<&Product> for ProductAdminResponse {
    fn from(product: &Product) -> Self {
        Self {
            id: product.id,
            article_id: product.article_id,
            name: product.name.clone(),
            description: product.description.clone(),
            price_cents: product.price_cents,
            currency: product.currency.clone(),
            is_active: product.is_active,
            created_at: product.created_at,
        }
    }
}

impl From<&Product> for ProductPublicResponse {
    fn from(product: &Product) -> Self {
        Self {
            id: product.id,
            article_id: product.article_id,
            name: product.name.clone(),
            description: product.description.clone(),
            price_cents: product.price_cents,
            currency: product.currency.clone(),
            is_active: product.is_active,
            created_at: product.created_at,
        }
    }
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateProductRequest {
    pub article_id: Option<Uuid>,
    #[validate(length(
        min = 1,
        max = 500,
        message = "El nombre debe tener entre 1 y 500 caracteres"
    ))]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[validate(range(min = 1, message = "El precio debe ser mayor que cero"))]
    pub price_cents: i32,
    #[serde(default = "default_currency")]
    #[validate(length(equal = 3, message = "La moneda debe tener 3 caracteres"))]
    pub currency: String,
    pub download_path: Option<String>,
    /// [297A-14] Los productos nuevos nacen inactivos/ocultos por defecto.
    #[serde(default)]
    pub is_active: bool,
}

fn default_currency() -> String {
    "USD".to_string()
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateProductRequest {
    #[validate(length(
        min = 1,
        max = 500,
        message = "El nombre debe tener entre 1 y 500 caracteres"
    ))]
    pub name: Option<String>,
    pub description: Option<String>,
    #[validate(range(min = 1, message = "El precio debe ser mayor que cero"))]
    pub price_cents: Option<i32>,
    #[validate(length(equal = 3, message = "La moneda debe tener 3 caracteres"))]
    pub currency: Option<String>,
    pub is_active: Option<bool>,
}

/// Orden de compra
#[derive(Debug, Clone, FromRow, Serialize, ToSchema)]
pub struct Order {
    pub id: Uuid,
    pub product_id: Uuid,
    pub product_version_id: Option<Uuid>,
    pub user_id: Option<Uuid>,
    pub stripe_session_id: Option<String>,
    pub stripe_payment_intent: Option<String>,
    pub customer_email: String,
    pub idempotency_key: Option<String>,
    pub status: String,
    pub paid_at: Option<DateTime<Utc>>,
    pub delivered_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct CreateOrderRequest {
    pub product_id: Uuid,
    pub customer_email: String,
}

/// Request de checkout
#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CheckoutRequest {
    #[validate(email(message = "Formato de email inválido"))]
    pub email: String,
    #[serde(default)]
    #[validate(length(max = 128, message = "La clave de idempotencia es demasiado larga"))]
    pub idempotency_key: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::{
        CreateProductRequest, Product, ProductAdminResponse, ProductPublicResponse,
        UpdateProductRequest,
    };
    use chrono::Utc;
    use uuid::Uuid;
    use validator::Validate;

    #[test]
    fn producto_nuevo_nace_inactivo() {
        let req: CreateProductRequest =
            serde_json::from_str(r#"{"name":"tema","price_cents":1000}"#).unwrap();
        assert!(!req.is_active);
        assert_eq!(req.currency, "USD");
    }

    #[test]
    fn valida_precio_no_positivo() {
        let req: CreateProductRequest =
            serde_json::from_str(r#"{"name":"tema","price_cents":0}"#).unwrap();
        assert!(req.validate().is_err());
    }

    #[test]
    fn valida_moneda_de_tres_caracteres() {
        let req: CreateProductRequest =
            serde_json::from_str(r#"{"name":"tema","price_cents":100,"currency":"US"}"#).unwrap();
        assert!(req.validate().is_err());
    }

    #[test]
    fn update_con_campos_parciales_es_valido() {
        let req: UpdateProductRequest = serde_json::from_str(r#"{"is_active":true}"#).unwrap();
        assert!(req.validate().is_ok());
        assert_eq!(req.is_active, Some(true));
    }

    #[test]
    fn contratos_no_exponen_campos_internos() {
        let product = Product {
            id: Uuid::new_v4(),
            article_id: None,
            name: "archivo".into(),
            description: "desc".into(),
            price_cents: 100,
            currency: "USD".into(),
            stripe_product_id: Some("stripe-product".into()),
            stripe_price_id: Some("stripe-price".into()),
            download_path: Some("/uploads/private.zip".into()),
            is_active: true,
            created_at: Utc::now(),
        };

        for response in [
            serde_json::to_value(ProductAdminResponse::from(&product)).unwrap(),
            serde_json::to_value(ProductPublicResponse::from(&product)).unwrap(),
        ] {
            assert!(response.get("download_path").is_none());
            assert!(response.get("stripe_product_id").is_none());
            assert!(response.get("stripe_price_id").is_none());
        }
    }
}
