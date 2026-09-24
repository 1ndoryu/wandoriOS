//! [249A-1] Rate limit generico por (ambito, clave) para rutas POST fuera de auth.
//!
//! [por que] Sentinel `ruta-post-sin-rate-limit` (9 hallazgos): el rate
//! limiting existia solo para auth (`handlers/auth.rs`: `LoginRateLimit` /
//! `AuthActionRateLimit`). Este modulo replica ese patron (ventana fija en
//! memoria, purga de expiradas) con contadores `u32` para cuotas altas y
//! error 429 (`AppError::TooManyRequests`) en vez de 403. Los handlers
//! autenticados usan `user_id` como clave (robusto tras proxy); los
//! publicos (`track_events`, `checkout`) usan la IP de `x-forwarded-for` /
//! `x-real-ip`, igual que ya hacia `track_events`.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use axum::http::HeaderMap;

use crate::errors::AppError;

/// Almacen de rate limit por `ambito:clave` en memoria.
pub type ApiRateLimit = Mutex<HashMap<String, (u32, Instant)>>;

/// Cuota: maximo de solicitudes por ventana fija.
pub struct Cuota {
    /// Solicitudes permitidas por ventana.
    pub max: u32,
    /// Duracion de la ventana en segundos.
    pub ventana_secs: u64,
}

/// Escritura autenticada por usuario (notas, notificaciones, articulos admin,
/// ajustes admin, workspace admin): 120/min por usuario.
pub const CUOTA_ESCRITURA: Cuota = Cuota {
    max: 120,
    ventana_secs: 60,
};

/// Analytics publico por IP (volumen legitimo alto desde clientes): 600/min.
pub const CUOTA_ANALYTICS: Cuota = Cuota {
    max: 600,
    ventana_secs: 60,
};

/// Checkout de pago por IP (sensible a abuso): 20/min.
pub const CUOTA_CHECKOUT: Cuota = Cuota {
    max: 20,
    ventana_secs: 60,
};

/// Clave de cliente para endpoints publicos: respeta proxy
/// (`x-forwarded-for` / `x-real-ip`, primera IP) con fallback `directa`.
#[must_use]
pub fn clave_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|valor| valor.to_str().ok())
        .map(|ip| ip.split(',').next().unwrap_or("directa").trim().to_owned())
        .filter(|clave| !clave.is_empty())
        .unwrap_or_else(|| "directa".to_owned())
}

/// Verifica la cuota del `(ambito, clave)`. Retorna `Ok(())` si permitido,
/// `Err(AppError::TooManyRequests)` con segundos de espera si excedida.
pub fn check_api_rate_limit(
    limiter: &ApiRateLimit,
    ambito: &str,
    clave: &str,
    cuota: &Cuota,
) -> Result<(), AppError> {
    let mut mapa = limiter.lock().map_err(|e| {
        AppError::Internal(format!("Error verificando rate limit de {ambito}: {e}"))
    })?;

    let ahora = Instant::now();

    // Purgar entradas expiradas para acotar memoria (patron de auth.rs).
    mapa.retain(|_, (_, inicio)| ahora.duration_since(*inicio).as_secs() < cuota.ventana_secs);

    let llave = format!("{ambito}:{clave}");
    if let Some((conteo, inicio)) = mapa.get_mut(&llave) {
        if ahora.duration_since(*inicio).as_secs() >= cuota.ventana_secs {
            /* Ventana expirada — resetear */
            *conteo = 1;
            *inicio = ahora;
            Ok(())
        } else if *conteo >= cuota.max {
            let espera = cuota
                .ventana_secs
                .saturating_sub(ahora.duration_since(*inicio).as_secs());
            Err(AppError::TooManyRequests {
                mensaje: format!("Demasiadas solicitudes ({ambito}). Reintenta en {espera} s."),
                reintento_secs: espera,
            })
        } else {
            *conteo += 1;
            Ok(())
        }
    } else {
        mapa.insert(llave, (1, ahora));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permite_hasta_la_cuota_y_luego_devuelve_429() {
        let limiter: ApiRateLimit = Mutex::new(HashMap::new());
        let cuota = Cuota {
            max: 2,
            ventana_secs: 60,
        };
        assert!(check_api_rate_limit(&limiter, "notas", "u1", &cuota).is_ok());
        assert!(check_api_rate_limit(&limiter, "notas", "u1", &cuota).is_ok());
        let err = check_api_rate_limit(&limiter, "notas", "u1", &cuota);
        assert!(
            matches!(err, Err(AppError::TooManyRequests { .. })),
            "se esperaba 429, fue {err:?}"
        );
    }

    #[test]
    fn ambitos_y_claves_no_comparten_cubo() {
        let limiter: ApiRateLimit = Mutex::new(HashMap::new());
        let cuota = Cuota {
            max: 1,
            ventana_secs: 60,
        };
        assert!(check_api_rate_limit(&limiter, "notas", "u1", &cuota).is_ok());
        assert!(check_api_rate_limit(&limiter, "notas", "u2", &cuota).is_ok());
        assert!(check_api_rate_limit(&limiter, "ajustes", "u1", &cuota).is_ok());
        assert!(check_api_rate_limit(&limiter, "notas", "u1", &cuota).is_err());
    }

    #[test]
    fn ventana_expirada_resetea_el_contador() {
        let limiter: ApiRateLimit = Mutex::new(HashMap::new());
        let cuota = Cuota {
            max: 1,
            ventana_secs: 60,
        };
        limiter.lock().unwrap().insert(
            "notas:u1".to_owned(),
            (1, Instant::now() - std::time::Duration::from_secs(61)),
        );
        assert!(check_api_rate_limit(&limiter, "notas", "u1", &cuota).is_ok());
    }

    #[test]
    fn clave_ip_respeta_proxy_y_fallback() {
        let mut headers = HeaderMap::new();
        assert_eq!(clave_ip(&headers), "directa");
        headers.insert("x-forwarded-for", "203.0.113.7".parse().unwrap());
        assert_eq!(clave_ip(&headers), "203.0.113.7");
        headers.insert(
            "x-forwarded-for",
            "203.0.113.7, 70.41.3.18".parse().unwrap(),
        );
        assert_eq!(clave_ip(&headers), "203.0.113.7");
    }
}
