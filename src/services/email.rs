/* wandori.us — Email Service
 * Envia emails transaccionales via Resend API.
 * Se usa para enviar enlaces de descarga despues de una compra. */

use serde::Serialize;

use crate::errors::AppError;

#[derive(Serialize)]
struct SendEmailRequest {
    from: String,
    to: Vec<String>,
    subject: String,
    html: String,
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

pub struct EmailService;

impl EmailService {
    /// Envía un enlace de cuenta (verificación o recuperación) sin guardar el
    /// token en claro ni exponerlo en respuestas de API.
    pub async fn send_account_link(
        api_key: &str,
        from: &str,
        to_email: &str,
        subject: &str,
        heading: &str,
        link: &str,
    ) -> Result<(), AppError> {
        let safe_heading = escape_html(heading);
        let safe_link = escape_html(link);
        let html = format!(
            "<html><body><h1>{safe_heading}</h1><p><a href=\"{safe_link}\">Continuar</a></p></body></html>"
        );
        let body = SendEmailRequest {
            from: from.to_string(),
            to: vec![to_email.to_string()],
            subject: subject.to_string(),
            html,
        };
        let response = reqwest::Client::new()
            .post("https://api.resend.com/emails")
            .header("Authorization", format!("Bearer {api_key}"))
            .json(&body)
            .send()
            .await
            .map_err(|error| AppError::Internal(format!("Error enviando email: {error}")))?;
        if !response.status().is_success() {
            let status = response.status();
            let detail = response.text().await.unwrap_or_default();
            tracing::error!("Resend account email error {status}: {detail}");
            return Err(AppError::Internal(format!(
                "Error enviando email: {status}"
            )));
        }
        Ok(())
    }

    /// Envia un email con el enlace de descarga de un producto digital
    pub async fn send_download_link(
        api_key: &str,
        from: &str,
        to_email: &str,
        product_name: &str,
        download_url: &str,
    ) -> Result<(), AppError> {
        let safe_product_name = escape_html(product_name);
        let safe_download_url = escape_html(download_url);
        let html = format!(
            r#"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; color: #000; background: #fff; padding: 32px;">
  <h1 style="font-size: 20px; font-weight: 400; margin-bottom: 16px;">gracias por tu compra</h1>
    <p style="margin-bottom: 16px;">tu archivo <strong>{safe_product_name}</strong> esta listo para descargar:</p>
    <p style="margin-bottom: 24px;">
    <a href="{safe_download_url}" style="text-decoration: underline; font-size: 14px;">descargar archivo</a>
  </p>
  <p style="font-size: 13px; color: #555;">si el enlace no funciona, copia y pega esta url en tu navegador:<br>{safe_download_url}</p>
  <hr style="border: none; border-top: 1px solid #000; margin: 24px 0;">
  <p style="font-size: 12px; color: #999;">wandori.us</p>
</body>
</html>"#,
        );

        let body = SendEmailRequest {
            from: from.to_string(),
            to: vec![to_email.to_string()],
            subject: format!("tu descarga: {product_name}"),
            html,
        };

        let client = reqwest::Client::new();
        let resp = client
            .post("https://api.resend.com/emails")
            .header("Authorization", format!("Bearer {api_key}"))
            .json(&body)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Error enviando email: {e}")))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            tracing::error!("Resend API error {status}: {text}");
            return Err(AppError::Internal(format!(
                "Error enviando email: {status}"
            )));
        }

        tracing::info!("Email enviado a {to_email}: {product_name}");
        Ok(())
    }
}
