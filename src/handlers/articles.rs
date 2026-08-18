use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post, put};
use axum::{Json, Router};
use uuid::Uuid;
use validator::Validate;

use crate::errors::AppError;
use crate::middleware::AdminUser;
use crate::models::article::{
    Article, ArticlePublic, ArticleQueryParams, CreateArticleRequest, PaginatedArticles,
    PaginatedArticlesPublic, UpdateArticleRequest,
};
use crate::services::article::ArticleService;
use crate::AppState;

/// Crear un articulo (admin)
#[utoipa::path(
    post,
    path = "/api/admin/articles",
    request_body = CreateArticleRequest,
    responses(
        (status = 201, description = "Articulo creado", body = Article),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 422, description = "Error de validacion", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn create_article(
    State(state): State<AppState>,
    _auth: AdminUser,
    Json(req): Json<CreateArticleRequest>,
) -> Result<(StatusCode, Json<Article>), AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let article = ArticleService::create(&state.pool, req).await?;
    Ok((StatusCode::CREATED, Json(article)))
}

/// Obtener articulo por ID (admin — incluye borradores)
#[utoipa::path(
    get,
    path = "/api/admin/articles/{id}",
    params(("id" = Uuid, Path, description = "ID del articulo")),
    responses(
        (status = 200, description = "Articulo encontrado", body = Article),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn get_article(
    State(state): State<AppState>,
    _auth: AdminUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Article>, AppError> {
    let article = ArticleService::get(&state.pool, id).await?;
    Ok(Json(article))
}

/// Obtener articulo por slug (publico)
#[utoipa::path(
    get,
    path = "/api/articles/slug/{slug}",
    params(("slug" = String, Path, description = "Slug del articulo")),
    responses(
        (status = 200, description = "Articulo encontrado", body = ArticlePublic),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    )
)]
pub async fn get_article_by_slug(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<ArticlePublic>, AppError> {
    let article = ArticleService::get_by_slug(&state.pool, &slug).await?;
    Ok(Json(ArticlePublic::from(article)))
}

/// Listar articulos publicados (publico)
/// [297A-7] Solo artículos con status='published'
#[utoipa::path(
    get,
    path = "/api/articles",
    params(ArticleQueryParams),
    responses(
        (status = 200, description = "Lista de articulos", body = PaginatedArticlesPublic)
    )
)]
pub async fn list_articles(
    State(state): State<AppState>,
    Query(params): Query<ArticleQueryParams>,
) -> Result<Json<PaginatedArticlesPublic>, AppError> {
    let articles =
        ArticleService::list(&state.pool, Some("published"), params.page, params.per_page).await?;
    Ok(Json(PaginatedArticlesPublic {
        items: articles
            .items
            .into_iter()
            .map(ArticlePublic::from)
            .collect(),
        total: articles.total,
        page: articles.page,
        per_page: articles.per_page,
    }))
}

/// Listar todos los articulos incluyendo borradores (admin)
#[utoipa::path(
    get,
    path = "/api/admin/articles",
    params(ArticleQueryParams),
    responses(
        (status = 200, description = "Lista de articulos", body = PaginatedArticles)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_articles_admin(
    State(state): State<AppState>,
    _auth: AdminUser,
    Query(params): Query<ArticleQueryParams>,
) -> Result<Json<PaginatedArticles>, AppError> {
    let articles = ArticleService::list(
        &state.pool,
        params.status.as_deref(),
        params.page,
        params.per_page,
    )
    .await?;
    Ok(Json(articles))
}

/// Actualizar articulo (admin)
#[utoipa::path(
    put,
    path = "/api/admin/articles/{id}",
    params(("id" = Uuid, Path, description = "ID del articulo")),
    request_body = UpdateArticleRequest,
    responses(
        (status = 200, description = "Articulo actualizado", body = Article),
        (status = 404, description = "No encontrado", body = ErrorResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn update_article(
    State(state): State<AppState>,
    _auth: AdminUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateArticleRequest>,
) -> Result<Json<Article>, AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let article = ArticleService::update(&state.pool, id, req).await?;
    Ok(Json(article))
}

/// Eliminar articulo (admin) — soft delete: la fila va a la Papelera.
#[utoipa::path(
    delete,
    path = "/api/admin/articles/{id}",
    params(("id" = Uuid, Path, description = "ID del articulo")),
    responses(
        (status = 204, description = "Articulo eliminado (soft delete)"),
        (status = 404, description = "No encontrado", body = ErrorResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn delete_article(
    State(state): State<AppState>,
    _auth: AdminUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    ArticleService::delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Listar la Papelera de artículos (admin).
#[utoipa::path(
    get,
    path = "/api/admin/articles/trashed",
    params(ArticleQueryParams),
    responses(
        (status = 200, description = "Lista de articulos en la papelera", body = PaginatedArticles)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_trashed_articles(
    State(state): State<AppState>,
    _auth: AdminUser,
    Query(params): Query<ArticleQueryParams>,
) -> Result<Json<PaginatedArticles>, AppError> {
    let articles = ArticleService::list_trashed(&state.pool, params.page, params.per_page).await?;
    Ok(Json(articles))
}

/// Restaurar articulo desde la Papelera (admin).
#[utoipa::path(
    post,
    path = "/api/admin/articles/{id}/restore",
    params(("id" = Uuid, Path, description = "ID del articulo")),
    responses(
        (status = 200, description = "Articulo restaurado", body = Article),
        (status = 404, description = "No encontrado en la papelera", body = ErrorResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn restore_article(
    State(state): State<AppState>,
    _auth: AdminUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Article>, AppError> {
    let article = ArticleService::restore(&state.pool, id).await?;
    Ok(Json(article))
}

/// Obtener articulo publicado por alias de sistema (publico)
/// [297A-10] Usado para artículos de sistema como 'about'.
#[utoipa::path(
    get,
    path = "/api/articles/alias/{alias}",
    params(("alias" = String, Path, description = "Alias de sistema del articulo (e.g. 'about')")),
    responses(
        (status = 200, description = "Articulo encontrado", body = ArticlePublic),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    )
)]
pub async fn get_article_by_alias(
    State(state): State<AppState>,
    Path(alias): Path<String>,
) -> Result<Json<ArticlePublic>, AppError> {
    let article = ArticleService::get_by_alias(&state.pool, &alias).await?;
    Ok(Json(ArticlePublic::from(article)))
}

/// Asignar alias de sistema a un articulo (admin)
#[derive(Debug, serde::Deserialize, utoipa::ToSchema, validator::Validate)]
pub struct SetAliasRequest {
    #[validate(length(max = 100, message = "El alias no puede exceder 100 caracteres"))]
    pub alias: Option<String>,
}

#[utoipa::path(
    put,
    path = "/api/admin/articles/{id}/alias",
    params(("id" = Uuid, Path, description = "ID del articulo")),
    request_body = SetAliasRequest,
    responses(
        (status = 200, description = "Alias asignado"),
        (status = 404, description = "No encontrado", body = ErrorResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn set_article_alias(
    State(state): State<AppState>,
    _auth: AdminUser,
    Path(id): Path<Uuid>,
    Json(req): Json<SetAliasRequest>,
) -> Result<StatusCode, AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;
    ArticleService::set_alias(&state.pool, id, req.alias.as_deref()).await?;
    Ok(StatusCode::OK)
}

pub fn routes() -> Router<AppState> {
    Router::new()
        /* Públicos: solo artículos publicados */
        .route("/articles", get(list_articles))
        .route("/articles/slug/:slug", get(get_article_by_slug))
        .route("/articles/alias/:alias", get(get_article_by_alias))
        /* Admin: CRUD completo + Papelera */
        .route(
            "/admin/articles",
            post(create_article).get(list_articles_admin),
        )
        .route("/admin/articles/trashed", get(list_trashed_articles))
        .route(
            "/admin/articles/:id",
            get(get_article).put(update_article).delete(delete_article),
        )
        .route("/admin/articles/:id/alias", put(set_article_alias))
        .route("/admin/articles/:id/restore", post(restore_article))
}
