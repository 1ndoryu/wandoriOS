use std::net::SocketAddr;
use std::path::PathBuf;

use glory_backend::config::AppConfig;
use glory_backend::handlers;
use utoipa::OpenApi;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    /* [018A-17] El contrato OpenAPI se puede exportar antes de conectar la
     * base de datos. Así Orval/CI no necesita arrancar un servidor ni dejar
     * procesos Bun/Node o conexiones PostgreSQL vivas solo para codegen. */
    let mut args = std::env::args().skip(1);
    let command = args.next();
    if command.as_deref() == Some("--emit-openapi") {
        let output = args.next().unwrap_or_else(|| "openapi.json".to_string());
        let document = serde_json::to_string_pretty(&handlers::ApiDoc::openapi())?;
        std::fs::write(PathBuf::from(&output), document)?;
        println!("OpenAPI exportado en {output}");
        return Ok(());
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                tracing_subscriber::EnvFilter::new("glory_backend=debug,tower_http=debug")
            }),
        )
        .init();

    let config = AppConfig::from_env()?;

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .min_connections(2)
        .connect(&config.database_url)
        .await?;

    sqlx::migrate!().run(&pool).await?;

    if command.as_deref() == Some("--process-commerce-outbox") {
        /* [297A-15] El buzón dev es local al proceso: el modo sin Resend solo
         * existe en desarrollo, y el worker no retiene el estado entre runs. */
        let dev_mailbox: std::sync::Arc<glory_backend::handlers::dev_mail::DevMailbox> =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let summary = glory_backend::services::commerce_outbox::process_default_batch(
            &pool,
            config.resend_api_key.as_deref(),
            Some(&dev_mailbox),
            &config.email_from,
            &std::env::var("SITE_URL").unwrap_or_else(|_| "https://wandori.us".to_string()),
        )
        .await?;
        println!(
            "Commerce outbox: claimed={}, processed={}, retried={}",
            summary.claimed, summary.processed, summary.retried
        );
        return Ok(());
    }

    /* [297A-8] Limpiar sesiones expiradas al arrancar */
    let cleaned = glory_backend::services::SessionService::cleanup_expired(&pool)
        .await
        .unwrap_or(0);
    if cleaned > 0 {
        tracing::info!("Limpiadas {cleaned} sesiones expiradas al arrancar");
    }

    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("Servidor iniciando en {addr}");
    tracing::info!("Swagger UI disponible en http://{addr}/swagger-ui/");

    let app = handlers::create_router(pool, config);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    /* [297A-8] ConnectInfo necesario para extraer IP del cliente en rate limit */
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
