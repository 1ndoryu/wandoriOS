use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::errors::AppError;
use crate::middleware::AdminUser;
use crate::models::product::{
    CheckoutRequest, CreateProductRequest, Order, Product, ProductAdminResponse,
    ProductPublicResponse, UpdateProductRequest,
};
use crate::services::product_svc::ProductService;
use crate::AppState;

/* [018A-22] CheckoutResponse evita exponer el JSON dinámico de Stripe como
 * contrato público; la autoridad de precio y entrega sigue server-side. */
#[derive(Debug, Serialize, ToSchema)]
pub struct CheckoutResponse {
    pub checkout_url: String,
    pub order_id: Uuid,
    pub session_id: String,
}

/// Crear producto (admin) — nace inactivo/private por defecto
#[utoipa::path(
    post,
    path = "/api/admin/products",
    request_body = CreateProductRequest,
    responses(
        (status = 201, description = "Producto creado", body = ProductAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 422, description = "Error de validación", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn create_product(
    State(state): State<AppState>,
    _auth: AdminUser,
    Json(req): Json<CreateProductRequest>,
) -> Result<(StatusCode, Json<ProductAdminResponse>), AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let product = ProductService::create(&state.pool, req).await?;
    Ok((
        StatusCode::CREATED,
        Json(ProductAdminResponse::from(&product)),
    ))
}

/// Obtener producto por ID (admin)
#[utoipa::path(
    get,
    path = "/api/admin/products/{id}",
    params(("id" = Uuid, Path, description = "ID del producto")),
    responses(
        (status = 200, description = "Producto encontrado", body = ProductAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn get_product(
    State(state): State<AppState>,
    _auth: AdminUser,
    Path(id): Path<Uuid>,
) -> Result<Json<ProductAdminResponse>, AppError> {
    let product = ProductService::get(&state.pool, id).await?;
    Ok(Json(ProductAdminResponse::from(&product)))
}

/// Listar todos los productos (admin)
#[utoipa::path(
    get,
    path = "/api/admin/products",
    responses(
        (status = 200, description = "Todos los productos", body = [ProductAdminResponse]),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_all_products(
    State(state): State<AppState>,
    _auth: AdminUser,
) -> Result<Json<Vec<ProductAdminResponse>>, AppError> {
    let products = ProductService::list_all(&state.pool).await?;
    Ok(Json(
        products.iter().map(ProductAdminResponse::from).collect(),
    ))
}

/// Listar productos de un articulo (publico — solo activos)
#[utoipa::path(
    get,
    path = "/api/articles/{article_id}/products",
    params(("article_id" = Uuid, Path, description = "ID del artículo")),
    responses((status = 200, description = "Productos del artículo", body = [ProductPublicResponse]))
)]
pub async fn list_products_by_article(
    State(state): State<AppState>,
    Path(article_id): Path<Uuid>,
) -> Result<Json<Vec<ProductPublicResponse>>, AppError> {
    let products = ProductService::list_by_article(&state.pool, article_id).await?;
    Ok(Json(
        products.iter().map(ProductPublicResponse::from).collect(),
    ))
}

/// Catálogo público de la Tienda.
#[utoipa::path(
    get,
    path = "/api/products",
    responses((status = 200, description = "Catálogo público", body = [ProductPublicResponse]))
)]
pub async fn list_public_products(
    State(state): State<AppState>,
) -> Result<Json<Vec<ProductPublicResponse>>, AppError> {
    let products = ProductService::list_public(&state.pool).await?;
    Ok(Json(
        products.iter().map(ProductPublicResponse::from).collect(),
    ))
}

/// Actualizar producto (admin) — sincroniza envelope en transacción
#[utoipa::path(
    put,
    path = "/api/admin/products/{id}",
    params(("id" = Uuid, Path, description = "ID del producto")),
    request_body = UpdateProductRequest,
    responses(
        (status = 200, description = "Producto actualizado", body = ProductAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn update_product(
    State(state): State<AppState>,
    _auth: AdminUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateProductRequest>,
) -> Result<Json<ProductAdminResponse>, AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let product = ProductService::update(&state.pool, id, req).await?;
    Ok(Json(ProductAdminResponse::from(&product)))
}

/// Eliminar producto (admin) — soft delete del envelope
#[utoipa::path(
    delete,
    path = "/api/admin/products/{id}",
    params(("id" = Uuid, Path, description = "ID del producto")),
    responses(
        (status = 204, description = "Producto eliminado"),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn delete_product(
    State(state): State<AppState>,
    _auth: AdminUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    ProductService::delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn create_stripe_checkout(
    state: &AppState,
    stripe_key: &str,
    product: &Product,
    order: &Order,
    email: &str,
) -> Result<Json<CheckoutResponse>, AppError> {
    let success_url = format!(
        "{}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}&order={}",
        state.site_url, order.id
    );
    let cancel_url = format!("{}/checkout/cancel?order={}", state.site_url, order.id);
    let mut params = vec![
        ("mode", "payment".to_string()),
        ("customer_email", email.to_string()),
        ("success_url", success_url),
        ("cancel_url", cancel_url),
        ("line_items[0][quantity]", "1".to_string()),
        (
            "line_items[0][price_data][currency]",
            product.currency.to_lowercase(),
        ),
        (
            "line_items[0][price_data][unit_amount]",
            product.price_cents.to_string(),
        ),
        (
            "line_items[0][price_data][product_data][name]",
            product.name.clone(),
        ),
    ];
    if !product.description.is_empty() {
        params.push((
            "line_items[0][price_data][product_data][description]",
            product.description.clone(),
        ));
    }
    params.push(("metadata[order_id]", order.id.to_string()));
    params.push(("metadata[product_id]", product.id.to_string()));

    let stripe_idempotency = order
        .idempotency_key
        .clone()
        .unwrap_or_else(|| order.id.to_string());
    let response = reqwest::Client::new()
        .post("https://api.stripe.com/v1/checkout/sessions")
        .header("Authorization", format!("Bearer {stripe_key}"))
        .header("Idempotency-Key", stripe_idempotency)
        .form(&params)
        .send()
        .await
        .map_err(|error| AppError::Internal(format!("Error creando Stripe session: {error}")))?;
    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.map_err(|error| {
            AppError::Internal(format!("Error leyendo respuesta de Stripe: {error}"))
        })?;
        tracing::error!("Stripe API error {status}: {detail}");
        return Err(AppError::Internal(format!(
            "Error creando checkout: {status}"
        )));
    }

    let session: serde_json::Value = response.json().await.map_err(|error| {
        AppError::Internal(format!("Error parseando respuesta de Stripe: {error}"))
    })?;
    let checkout_url = session["url"]
        .as_str()
        .ok_or_else(|| AppError::Internal("Stripe no retorno URL de checkout".into()))?;
    let session_id = session["id"]
        .as_str()
        .ok_or_else(|| AppError::Internal("Stripe no retorno ID de sesion".into()))?;

    crate::repositories::product_repo::OrderRepository::update_stripe_session(
        &state.pool,
        order.id,
        session_id,
    )
    .await?;
    tracing::info!(
        "Stripe checkout creado: session={session_id}, order={}",
        order.id
    );

    Ok(Json(CheckoutResponse {
        checkout_url: checkout_url.to_string(),
        order_id: order.id,
        session_id: session_id.to_string(),
    }))
}

/// Iniciar checkout de Stripe.
/// [297A-7] Solo acepta productos activos. Modo demo deshabilitado.
/// [297A-14] `get_public` exige envelope active + public e `is_active` en SQL.
#[utoipa::path(
    post,
    path = "/api/products/{product_id}/checkout",
    params(("product_id" = Uuid, Path, description = "ID del producto")),
    request_body = CheckoutRequest,
    responses(
        (status = 200, description = "Checkout creado", body = CheckoutResponse),
        (status = 404, description = "Producto no disponible", body = ErrorResponse),
        (status = 422, description = "Error de validación", body = ErrorResponse)
    )
)]
pub async fn checkout(
    State(state): State<AppState>,
    Path(product_id): Path<Uuid>,
    headers: HeaderMap,
    Json(req): Json<CheckoutRequest>,
) -> Result<Json<CheckoutResponse>, AppError> {
    req.validate()
        .map_err(|error| AppError::Validation(error.to_string()))?;
    let product = ProductService::get_public(&state.pool, product_id).await?;

    /* [297A-7] Modo demo deshabilitado — requiere Stripe configurado */
    let stripe_key = state
        .stripe_secret_key
        .as_ref()
        .ok_or_else(|| AppError::Internal("Pasarela de pago no configurada".into()))?;

    /* [297A-15] El header tiene precedencia; el body permite clientes que no
     * puedan añadir headers. Si falta, se genera una clave única para no
     * romper clientes legacy, pero los reintentos seguros deben reutilizarla. */
    let idempotency_key = headers
        .get("idempotency-key")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .or(req.idempotency_key)
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let order = crate::repositories::product_repo::OrderRepository::create_with_idempotency(
        &state.pool,
        product.id,
        &req.email,
        &idempotency_key,
    )
    .await?;

    create_stripe_checkout(&state, stripe_key, &product, &order, &req.email).await
}

pub fn routes() -> Router<AppState> {
    Router::new()
        /* Públicos */
        .route(
            "/articles/:article_id/products",
            get(list_products_by_article),
        )
        .route("/products", get(list_public_products))
        .route("/products/:id/checkout", post(checkout))
        /* Admin — contrato canónico /admin/products */
        .route(
            "/admin/products",
            get(list_all_products).post(create_product),
        )
        .route(
            "/admin/products/:id",
            get(get_product).put(update_product).delete(delete_product),
        )
}
