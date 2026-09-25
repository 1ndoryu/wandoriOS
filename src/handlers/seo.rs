use axum::extract::State;
use axum::http::header;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;

use crate::errors::AppError;
use crate::repositories::ArticleRepository;
use crate::AppState;

const SITE_URL: &str = "https://wandori.us";

/// Genera sitemap.xml dinamicamente desde articulos publicados
/* `format_push_string` desactivado aquí a conciencia: escribir en `String`
 * no puede fallar y el proyecto evita `expect` inalcanzables; la asignación
 * extra solo existe para no ocultar el `format!` al lector. */
#[allow(clippy::format_push_string)]
pub async fn sitemap(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let articles = ArticleRepository::list_published_slugs(&state.pool).await?;

    let mut xml = String::from(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">"#,
    );

    /* Paginas estaticas */
    for path in &["/", "/about", "/gallery", "/projects"] {
        xml.push_str(&format!(
            "\n  <url>\n    <loc>{SITE_URL}{path}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>"
        ));
    }

    /* Articulos */
    for (slug, date) in &articles {
        xml.push_str(&format!(
            "\n  <url>\n    <loc>{SITE_URL}/article/{slug}</loc>\n    <lastmod>{}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>",
            date.format("%Y-%m-%d")
        ));
    }

    xml.push_str("\n</urlset>");

    Ok(([(header::CONTENT_TYPE, "application/xml")], xml))
}

/// robots.txt
pub async fn robots() -> impl IntoResponse {
    let content = format!("User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}/sitemap.xml\n");
    ([(header::CONTENT_TYPE, "text/plain")], content)
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/sitemap.xml", get(sitemap))
        .route("/robots.txt", get(robots))
}
