//! GAME-01 — Tickets de identidad para transporte realtime.
//!
//! Este módulo no abre WebSocket ni conoce Axum. El token transporta solo un
//! handle aleatorio firmado; el UUID del subject permanece en `GameTicketStore`
//! y nunca cruza el boundary del navegador.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use sha2::Sha256;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::game_character::GameCharacterDefinition;

type HmacSha256 = Hmac<Sha256>;

const PROTOCOL_VERSION: &str = "g1";
const PURPOSE: &str = "game";
const GUEST_PURPOSE: &str = "guest";
pub const GAME_TICKET_DEFAULT_TTL_SECS: i64 = 30;
pub const GAME_TICKET_MAX_TTL_SECS: i64 = 60;
pub const GAME_TICKET_MAX_TOKEN_BYTES: usize = 512;
pub const GAME_TICKET_MAX_PENDING_ENTRIES: usize = 4_096;
pub const GAME_GUEST_COOKIE_NAME: &str = "guest_game";
pub const GAME_GUEST_COOKIE_TTL_SECS: i64 = 2 * 60 * 60;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameTicketClaims {
    /// UUID resuelto por el servidor desde el handle; nunca procede del token.
    pub subject: Uuid,
    /// Personaje del catálogo resuelto al emitir (cuenta con perfil); el
    /// transporte lo usa para que cada jugador se vea con su tono. Los
    /// invitados viajan sin personaje y el room aplica el default.
    pub character_id: Option<String>,
    pub expires_at: i64,
    pub nonce: Uuid,
}

#[derive(Debug, Clone)]
struct PendingTicket {
    subject: Uuid,
    character_id: Option<String>,
    expires_at: i64,
}

#[derive(Debug, Clone, Copy)]
struct GuestIdentity {
    subject: Uuid,
    expires_at: i64,
}

/// Almacén single-use local para el primer despliegue single-instance.
///
/// Una futura topología multi-réplica deberá sustituir este adaptador por un
/// store compartido antes de habilitar tickets entre instancias.
#[derive(Clone, Default)]
pub struct GameTicketStore {
    pending: Arc<Mutex<HashMap<Uuid, PendingTicket>>>,
    guests: Arc<Mutex<HashMap<Uuid, GuestIdentity>>>,
}

impl GameTicketStore {
    /// Emite un ticket opaco: el UUID solo queda en este store server-side.
    /// `character_id` es opcional (los invitados no tienen perfil) y se
    /// valida fail-closed contra el catálogo allowlisted.
    pub fn issue(
        &self,
        subject: Uuid,
        character_id: Option<&str>,
        ttl_secs: i64,
        secret: &str,
    ) -> Result<String, AppError> {
        issue_at(self, subject, character_id, ttl_secs, secret, now_unix())
    }

    /// Verifica y consume el ticket de forma atómica para impedir replay.
    pub fn consume(&self, token: &str, secret: &str) -> Result<GameTicketClaims, AppError> {
        consume_at(self, token, secret, now_unix())
    }

    /// Resuelve una cookie de invitado sin convertirla en identidad de cuenta.
    pub fn resolve_guest(&self, cookie: &str, secret: &str) -> Result<Option<Uuid>, AppError> {
        resolve_guest_at(self, cookie, secret, now_unix())
    }

    /// Crea una identidad temporal y devuelve la cookie opaca que la representa.
    pub fn issue_guest(&self, secret: &str) -> Result<(Uuid, String), AppError> {
        issue_guest_at(self, secret, now_unix())
    }

    /// Revoca la identidad invitada representada por la cookie: la entrada del
    /// store se elimina y la cookie deja de resolver. La reclamación
    /// invitado→cuenta limpia la identidad temporal al autenticarse; una
    /// cookie robada/duplicada deja de ser válida de inmediato.
    pub fn revoke_guest(&self, cookie: &str, secret: &str) -> Result<bool, AppError> {
        revoke_guest_at(self, cookie, secret, now_unix())
    }

    #[cfg(test)]
    fn consume_at_for_test(
        &self,
        token: &str,
        secret: &str,
        now: i64,
    ) -> Result<GameTicketClaims, AppError> {
        consume_at(self, token, secret, now)
    }
}

/// Variante determinista para tests y futuros adaptadores de reloj.
pub fn issue_at(
    store: &GameTicketStore,
    subject: Uuid,
    character_id: Option<&str>,
    ttl_secs: i64,
    secret: &str,
    now: i64,
) -> Result<String, AppError> {
    validate_secret(secret)?;
    if now < 0 {
        return Err(AppError::Internal("reloj de ticket inválido".into()));
    }
    if let Some(character_id) = character_id {
        if !GameCharacterDefinition::is_valid_id(character_id) {
            return Err(AppError::Validation("id de personaje inválido".into()));
        }
    }

    let ttl = normalize_ttl(ttl_secs);
    let expires_at = now
        .checked_add(ttl)
        .ok_or_else(|| AppError::Internal("expiración de ticket fuera de rango".into()))?;
    let nonce = Uuid::new_v4();
    let mut pending = store
        .pending
        .lock()
        .map_err(|_| AppError::Internal("almacén de tickets no disponible".into()))?;
    pending.retain(|_, ticket| ticket.expires_at > now);
    if pending.len() >= GAME_TICKET_MAX_PENDING_ENTRIES {
        return Err(AppError::Internal("almacén de tickets lleno".into()));
    }
    pending.insert(
        nonce,
        PendingTicket {
            subject,
            character_id: character_id.map(str::to_string),
            expires_at,
        },
    );
    drop(pending);

    let payload = format!("{PROTOCOL_VERSION}.{PURPOSE}.{nonce}.{expires_at}");
    let signature = sign(&payload, secret)?;
    Ok(format!("{payload}.{signature}"))
}

/// Variante determinista para tests y futuros adaptadores de reloj.
pub fn consume_at(
    store: &GameTicketStore,
    token: &str,
    secret: &str,
    now: i64,
) -> Result<GameTicketClaims, AppError> {
    validate_secret(secret)?;
    if now < 0 {
        return Err(AppError::Internal("reloj de ticket inválido".into()));
    }
    if token.len() > GAME_TICKET_MAX_TOKEN_BYTES {
        return Err(AppError::Unauthorized);
    }

    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 5
        || parts[0] != PROTOCOL_VERSION
        || parts[1] != PURPOSE
        || parts[2].is_empty()
        || parts[3].is_empty()
        || parts[4].is_empty()
    {
        return Err(AppError::Unauthorized);
    }

    let nonce = parts[2]
        .parse::<Uuid>()
        .map_err(|_| AppError::Unauthorized)?;
    let expires_at = parts[3]
        .parse::<i64>()
        .map_err(|_| AppError::Unauthorized)?;
    let payload = format!("{PROTOCOL_VERSION}.{PURPOSE}.{nonce}.{expires_at}");
    let signature = hex::decode(parts[4]).map_err(|_| AppError::Unauthorized)?;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| AppError::Internal("secreto HMAC inválido".into()))?;
    mac.update(payload.as_bytes());
    mac.verify_slice(&signature)
        .map_err(|_| AppError::Unauthorized)?;

    let mut pending = store
        .pending
        .lock()
        .map_err(|_| AppError::Internal("almacén de tickets no disponible".into()))?;
    pending.retain(|_, ticket| ticket.expires_at > now);
    let Some(ticket) = pending.remove(&nonce) else {
        return Err(AppError::Unauthorized);
    };
    if ticket.expires_at != expires_at {
        return Err(AppError::Unauthorized);
    }

    Ok(GameTicketClaims {
        subject: ticket.subject,
        character_id: ticket.character_id,
        expires_at: ticket.expires_at,
        nonce,
    })
}

pub fn issue_guest_at(
    store: &GameTicketStore,
    secret: &str,
    now: i64,
) -> Result<(Uuid, String), AppError> {
    validate_secret(secret)?;
    if now < 0 {
        return Err(AppError::Internal("reloj de invitado inválido".into()));
    }
    let expires_at = now
        .checked_add(GAME_GUEST_COOKIE_TTL_SECS)
        .ok_or_else(|| AppError::Internal("expiración de invitado fuera de rango".into()))?;
    let nonce = Uuid::new_v4();
    let subject = Uuid::new_v4();
    let mut guests = store
        .guests
        .lock()
        .map_err(|_| AppError::Internal("almacén de invitados no disponible".into()))?;
    guests.retain(|_, guest| guest.expires_at > now);
    if guests.len() >= GAME_TICKET_MAX_PENDING_ENTRIES {
        return Err(AppError::Internal("almacén de invitados lleno".into()));
    }
    guests.insert(
        nonce,
        GuestIdentity {
            subject,
            expires_at,
        },
    );
    drop(guests);

    let payload = format!("{PROTOCOL_VERSION}.{GUEST_PURPOSE}.{nonce}.{expires_at}");
    let signature = sign(&payload, secret)?;
    Ok((subject, format!("{payload}.{signature}")))
}

pub fn resolve_guest_at(
    store: &GameTicketStore,
    cookie: &str,
    secret: &str,
    now: i64,
) -> Result<Option<Uuid>, AppError> {
    validate_secret(secret)?;
    if now < 0 || cookie.len() > GAME_TICKET_MAX_TOKEN_BYTES {
        return Ok(None);
    }
    let parts: Vec<&str> = cookie.split('.').collect();
    if parts.len() != 5
        || parts[0] != PROTOCOL_VERSION
        || parts[1] != GUEST_PURPOSE
        || parts[2].is_empty()
        || parts[3].is_empty()
        || parts[4].is_empty()
    {
        return Ok(None);
    }
    let Ok(nonce) = parts[2].parse::<Uuid>() else {
        return Ok(None);
    };
    let Ok(expires_at) = parts[3].parse::<i64>() else {
        return Ok(None);
    };
    if expires_at <= now {
        return Ok(None);
    }
    let payload = format!("{PROTOCOL_VERSION}.{GUEST_PURPOSE}.{nonce}.{expires_at}");
    let Ok(signature) = hex::decode(parts[4]) else {
        return Ok(None);
    };
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| AppError::Internal("secreto HMAC inválido".into()))?;
    mac.update(payload.as_bytes());
    if mac.verify_slice(&signature).is_err() {
        return Ok(None);
    }
    let mut guests = store
        .guests
        .lock()
        .map_err(|_| AppError::Internal("almacén de invitados no disponible".into()))?;
    guests.retain(|_, guest| guest.expires_at > now);
    let Some(guest) = guests.get(&nonce) else {
        return Ok(None);
    };
    if guest.expires_at != expires_at {
        return Ok(None);
    }
    Ok(Some(guest.subject))
}

/// Variante determinista para tests y futuros adaptadores de reloj.
pub fn revoke_guest_at(
    store: &GameTicketStore,
    cookie: &str,
    secret: &str,
    now: i64,
) -> Result<bool, AppError> {
    validate_secret(secret)?;
    if now < 0 || cookie.len() > GAME_TICKET_MAX_TOKEN_BYTES {
        return Ok(false);
    }
    let parts: Vec<&str> = cookie.split('.').collect();
    if parts.len() != 5
        || parts[0] != PROTOCOL_VERSION
        || parts[1] != GUEST_PURPOSE
        || parts[2].is_empty()
        || parts[3].is_empty()
        || parts[4].is_empty()
    {
        return Ok(false);
    }
    let Ok(nonce) = parts[2].parse::<Uuid>() else {
        return Ok(false);
    };
    let Ok(expires_at) = parts[3].parse::<i64>() else {
        return Ok(false);
    };
    let payload = format!("{PROTOCOL_VERSION}.{GUEST_PURPOSE}.{nonce}.{expires_at}");
    let Ok(signature) = hex::decode(parts[4]) else {
        return Ok(false);
    };
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| AppError::Internal("secreto HMAC inválido".into()))?;
    mac.update(payload.as_bytes());
    if mac.verify_slice(&signature).is_err() {
        return Ok(false);
    }
    let mut guests = store
        .guests
        .lock()
        .map_err(|_| AppError::Internal("almacén de invitados no disponible".into()))?;
    let Some(guest) = guests.get(&nonce) else {
        return Ok(false);
    };
    /* [297A-76] La revocación requiere firma y entrada vigente; la identidad
     * temporal desaparece de inmediato (reclamación invitado→cuenta). */
    if guest.expires_at != expires_at {
        return Ok(false);
    }
    guests.remove(&nonce);
    Ok(true)
}

fn validate_secret(secret: &str) -> Result<(), AppError> {
    if secret.trim().is_empty() {
        return Err(AppError::Internal(
            "secreto de tickets no configurado".into(),
        ));
    }
    Ok(())
}

fn normalize_ttl(ttl_secs: i64) -> i64 {
    if ttl_secs <= 0 {
        GAME_TICKET_DEFAULT_TTL_SECS
    } else {
        ttl_secs.min(GAME_TICKET_MAX_TTL_SECS)
    }
}

fn sign(payload: &str, secret: &str) -> Result<String, AppError> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|_| AppError::Internal("secreto HMAC inválido".into()))?;
    mac.update(payload.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            i64::try_from(duration.as_secs()).unwrap_or(i64::MAX)
        })
}

#[cfg(test)]
mod tests {
    use super::{
        consume_at, issue_at, issue_guest_at, resolve_guest_at, revoke_guest_at, GameTicketStore,
        GAME_GUEST_COOKIE_TTL_SECS, GAME_TICKET_DEFAULT_TTL_SECS, GAME_TICKET_MAX_TTL_SECS,
    };
    use uuid::Uuid;

    const NOW: i64 = 1_700_000_000;
    const SECRET: &str = "test-game-ticket-secret";

    #[test]
    fn issues_opaque_ticket_and_resolves_uuid_only_server_side() {
        let store = GameTicketStore::default();
        let subject = Uuid::new_v4();
        let token = issue_at(
            &store,
            subject,
            None,
            GAME_TICKET_MAX_TTL_SECS * 10,
            SECRET,
            NOW,
        )
        .expect("ticket");
        assert!(!token.contains(&subject.to_string()));
        let claims = consume_at(&store, &token, SECRET, NOW).expect("claims");
        assert_eq!(claims.subject, subject);
        assert_eq!(claims.character_id, None);
        assert_eq!(claims.expires_at, NOW + GAME_TICKET_MAX_TTL_SECS);
        assert!(token.starts_with("g1.game."));
    }

    #[test]
    fn ticket_carries_resolved_character_and_rejects_invalid_ids() {
        let store = GameTicketStore::default();
        let token = issue_at(
            &store,
            Uuid::new_v4(),
            Some("forest-scout"),
            30,
            SECRET,
            NOW,
        )
        .expect("ticket con personaje");
        let claims = consume_at(&store, &token, SECRET, NOW).expect("claims");
        assert_eq!(claims.character_id.as_deref(), Some("forest-scout"));
        /* El carácter nunca cruza el token firmado: sigue server-side. */
        assert!(!token.contains("forest-scout"));
        /* IDs fuera del catálogo allowlisted fallan fail-closed. */
        assert!(issue_at(&store, Uuid::new_v4(), Some("UPPER"), 30, SECRET, NOW).is_err());
        assert!(issue_at(&store, Uuid::new_v4(), Some(""), 30, SECRET, NOW).is_err());
    }

    #[test]
    fn non_positive_ttl_uses_safe_default() {
        let store = GameTicketStore::default();
        let token = issue_at(&store, Uuid::new_v4(), None, 0, SECRET, NOW).expect("ticket");
        let claims = consume_at(&store, &token, SECRET, NOW).expect("claims");
        assert_eq!(claims.expires_at, NOW + GAME_TICKET_DEFAULT_TTL_SECS);
    }

    #[test]
    fn rejects_tampering_wrong_secret_wrong_purpose_and_malformed_tokens() {
        let store = GameTicketStore::default();
        let token = issue_at(&store, Uuid::new_v4(), None, 30, SECRET, NOW).expect("ticket");
        let mut tampered = token.clone();
        tampered.push('x');
        assert!(consume_at(&store, &tampered, SECRET, NOW).is_err());
        assert!(consume_at(&store, &token, "wrong-secret", NOW).is_err());
        assert!(consume_at(
            &store,
            &token.replacen("g1.game.", "g1.account.", 1),
            SECRET,
            NOW
        )
        .is_err());
        assert!(consume_at(&store, "g1.game.not-a-uuid.1.2.sig", SECRET, NOW).is_err());
    }

    #[test]
    fn rejects_expired_and_invalid_clock_tickets() {
        let store = GameTicketStore::default();
        let token = issue_at(&store, Uuid::new_v4(), None, 30, SECRET, NOW).expect("ticket");
        assert!(consume_at(&store, &token, SECRET, NOW + 30).is_err());
        assert!(issue_at(&store, Uuid::new_v4(), None, 30, SECRET, -1).is_err());
        assert!(consume_at(&store, &token, SECRET, -1).is_err());
    }

    #[test]
    fn consumes_ticket_once_and_prunes_expired_entries() {
        let store = GameTicketStore::default();
        let token = issue_at(&store, Uuid::new_v4(), None, 30, SECRET, NOW).expect("ticket");
        assert!(store.consume_at_for_test(&token, SECRET, NOW).is_ok());
        assert!(store.consume_at_for_test(&token, SECRET, NOW + 1).is_err());
        assert_eq!(store.pending.lock().expect("store").len(), 0);

        let expired = issue_at(&store, Uuid::new_v4(), None, 1, SECRET, NOW).expect("ticket");
        let fresh = issue_at(&store, Uuid::new_v4(), None, 30, SECRET, NOW + 2).expect("ticket");
        assert!(store
            .consume_at_for_test(&expired, SECRET, NOW + 2)
            .is_err());
        assert!(store.consume_at_for_test(&fresh, SECRET, NOW + 2).is_ok());
        assert_eq!(store.pending.lock().expect("store").len(), 0);
    }

    #[test]
    fn rejects_oversized_tokens_before_parsing() {
        let store = GameTicketStore::default();
        let oversized = "x".repeat(super::GAME_TICKET_MAX_TOKEN_BYTES + 1);
        assert!(consume_at(&store, &oversized, SECRET, NOW).is_err());
    }

    #[test]
    fn rejects_empty_secret_before_parsing() {
        let store = GameTicketStore::default();
        assert!(issue_at(&store, Uuid::new_v4(), None, 30, " ", NOW).is_err());
        assert!(consume_at(&store, "malformed", " ", NOW).is_err());
    }

    #[test]
    fn guest_cookie_is_opaque_temporary_and_server_resolved() {
        let store = GameTicketStore::default();
        let (subject, cookie) = issue_guest_at(&store, SECRET, NOW).expect("guest");
        assert!(!cookie.contains(&subject.to_string()));
        assert!(cookie.starts_with("g1.guest."));
        assert_eq!(
            resolve_guest_at(&store, &cookie, SECRET, NOW).ok(),
            Some(Some(subject))
        );
        assert_eq!(
            resolve_guest_at(&store, &cookie, SECRET, NOW + GAME_GUEST_COOKIE_TTL_SECS).ok(),
            Some(None)
        );
    }

    #[test]
    fn guest_cookie_tampering_and_wrong_secret_fail_closed() {
        let store = GameTicketStore::default();
        let (_, cookie) = issue_guest_at(&store, SECRET, NOW).expect("guest");
        let mut tampered = cookie.clone();
        tampered.push('x');
        assert_eq!(
            resolve_guest_at(&store, &tampered, SECRET, NOW).ok(),
            Some(None)
        );
        assert_eq!(
            resolve_guest_at(&store, &cookie, "wrong-secret", NOW).ok(),
            Some(None)
        );
        assert_eq!(
            resolve_guest_at(&store, "g1.game.bad", SECRET, NOW).ok(),
            Some(None)
        );
    }

    #[test]
    fn revoking_guest_cookie_invalidates_the_temporary_identity() {
        let store = GameTicketStore::default();
        let (_, cookie) = issue_guest_at(&store, SECRET, NOW).expect("guest");
        assert!(resolve_guest_at(&store, &cookie, SECRET, NOW)
            .ok()
            .flatten()
            .is_some());

        assert_eq!(
            revoke_guest_at(&store, &cookie, SECRET, NOW).ok(),
            Some(true)
        );
        /* Después de la revocación la identidad temporal deja de resolver. */
        assert_eq!(
            resolve_guest_at(&store, &cookie, SECRET, NOW).ok(),
            Some(None)
        );
        /* Revocar de nuevo no es un error: la entrada ya no existe. */
        assert_eq!(
            revoke_guest_at(&store, &cookie, SECRET, NOW).ok(),
            Some(false)
        );
    }

    #[test]
    fn revoking_invalid_cookie_or_wrong_secret_fails_closed() {
        let store = GameTicketStore::default();
        let (_, cookie) = issue_guest_at(&store, SECRET, NOW).expect("guest");
        let mut tampered = cookie.clone();
        tampered.push('x');
        assert_eq!(
            revoke_guest_at(&store, &tampered, SECRET, NOW).ok(),
            Some(false)
        );
        assert_eq!(
            revoke_guest_at(&store, &cookie, "wrong-secret", NOW).ok(),
            Some(false)
        );
        assert_eq!(
            revoke_guest_at(&store, "g1.game.bad", SECRET, NOW).ok(),
            Some(false)
        );
        /* La identidad sigue válida: la revocación fallida no la toca. */
        assert!(resolve_guest_at(&store, &cookie, SECRET, NOW)
            .ok()
            .flatten()
            .is_some());
    }
}
