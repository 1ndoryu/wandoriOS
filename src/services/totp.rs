/* wandori.us — TOTP (RFC 6238)
 * Segundo factor de Cuenta: secreto base32 (RFC 4648), códigos de 6 dígitos
 * con HMAC-SHA1 y ventana de ±1 paso de 30 s. Sin dependencias externas;
 * el código es determinista y testeable sin reloj real (los tests usan el
 * paso actual vía SystemTime). */

use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use rand::Rng;
use sha1::Sha1;

const STEP_SECONDS: u64 = 30;
const CODE_DIGITS: u32 = 6;
const SECRET_BYTES: usize = 20; // 160 bits
const WINDOW: u8 = 1;

type HmacSha1 = Hmac<Sha1>;

const BASE32_ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// Genera un secreto TOTP en base32 (sin padding).
pub fn generate_secret() -> String {
    let mut bytes = [0_u8; SECRET_BYTES];
    rand::rngs::OsRng.fill(&mut bytes);
    encode_base32(&bytes)
}

fn encode_base32(input: &[u8]) -> String {
    let mut out = String::with_capacity((input.len() * 8 + 4) / 5);
    let mut buffer: u32 = 0;
    let mut bits = 0;
    for &byte in input {
        buffer = (buffer << 8) | u32::from(byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(char::from(
                BASE32_ALPHABET[((buffer >> bits) & 0x1F) as usize],
            ));
        }
    }
    if bits > 0 {
        out.push(char::from(
            BASE32_ALPHABET[((buffer << (5 - bits)) & 0x1F) as usize],
        ));
    }
    out
}

fn decode_base32(input: &str) -> Option<Vec<u8>> {
    let cleaned: String = input
        .chars()
        .filter(|c| !c.is_whitespace())
        .map(|c| c.to_ascii_uppercase())
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    let mut out = Vec::with_capacity(cleaned.len() * 5 / 8);
    let mut buffer: u32 = 0;
    let mut bits = 0;
    for ch in cleaned.chars() {
        let value = BASE32_ALPHABET.iter().position(|&v| v == ch as u8)?;
        buffer = (buffer << 5) | value as u32;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    Some(out)
}

fn code_at(secret_bytes: &[u8], counter: u64) -> String {
    let mut mac =
        HmacSha1::new_from_slice(secret_bytes).expect("HMAC acepta claves de cualquier tamaño");
    mac.update(&counter.to_be_bytes());
    let digest = mac.finalize().into_bytes();
    let offset = usize::from(digest[19] & 0x0F);
    let bin_code = u32::from_be_bytes([
        digest[offset],
        digest[offset + 1],
        digest[offset + 2],
        digest[offset + 3],
    ]) & 0x7FFF_FFFF;
    format!("{:06}", bin_code % 10_u32.pow(CODE_DIGITS))
}

fn current_counter() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() / STEP_SECONDS)
        .unwrap_or(0)
}

/// Código actual para el secreto (referencia / tests).
pub fn current_code(secret_base32: &str) -> String {
    let Some(bytes) = decode_base32(secret_base32) else {
        return String::new();
    };
    code_at(&bytes, current_counter())
}

/// Verifica un código de 6 dígitos contra el secreto con ventana de ±1 paso.
pub fn verify(secret_base32: &str, code: &str) -> bool {
    let Some(bytes) = decode_base32(secret_base32) else {
        return false;
    };
    let code = code.trim();
    if code.len() != 6 || !code.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    let counter = current_counter();
    let window = u64::from(WINDOW);
    (counter.saturating_sub(window)..=counter.saturating_add(window))
        .any(|step| code_at(&bytes, step) == code)
}

/// URI de aprovisionamiento `otpauth://` para apps autenticadoras.
pub fn otpauth_uri(secret_base32: &str, account_email: &str, issuer: &str) -> String {
    let label = format!("{issuer}:{account_email}").replace(' ', "%20");
    let issuer_enc = issuer.replace(' ', "%20");
    format!(
        "otpauth://totp/{label}?secret={secret_base32}&issuer={issuer_enc}&algorithm=SHA1&digits={CODE_DIGITS}&period={STEP_SECONDS}"
    )
}

#[cfg(test)]
mod tests {
    use super::{current_code, decode_base32, encode_base32, generate_secret, otpauth_uri, verify};

    #[test]
    fn base32_roundtrip_preserves_secret() {
        let secret = generate_secret();
        let decoded = decode_base32(&secret).expect("secreto decodificable");
        assert_eq!(encode_base32(&decoded), secret);
    }

    #[test]
    fn generated_secret_is_32_base32_chars() {
        assert_eq!(generate_secret().len(), 32);
    }

    #[test]
    fn verify_accepts_current_code_and_rejects_invalid() {
        let secret = generate_secret();
        let code = current_code(&secret);
        assert!(verify(&secret, &code));
        assert!(!verify(&secret, "000000"));
        assert!(!verify(&secret, "12345"));
        assert!(!verify(&secret, "abcdef"));
    }

    #[test]
    fn otpauth_uri_exposes_secret_issuer_and_rfc6238_defaults() {
        let secret = generate_secret();
        let uri = otpauth_uri(&secret, "user@example.com", "wandori.us");
        assert!(uri.starts_with("otpauth://totp/wandori.us:user@example.com"));
        assert!(uri.contains(&format!("secret={secret}")));
        assert!(uri.contains("issuer=wandori.us"));
        assert!(uri.contains("algorithm=SHA1"));
    }
}
