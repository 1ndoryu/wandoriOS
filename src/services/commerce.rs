/* wandori.us — Commerce service helpers
 * Genera grants opacos y valida que una descarga solo pueda salir del storage
 * privado configurado. [297A-15] */

use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use std::path::{Component, Path, PathBuf};

use crate::errors::AppError;

pub struct DownloadToken {
    pub raw: String,
    pub hash: String,
}

#[must_use]
pub fn generate_download_token() -> DownloadToken {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let raw = hex::encode(bytes);
    let hash = hash_download_token(&raw);
    DownloadToken { raw, hash }
}

#[must_use]
pub fn hash_download_token(raw: &str) -> String {
    let digest = Sha256::digest(raw.as_bytes());
    hex::encode(digest)
}

/// Resolver fail-closed: nunca permite que un path de producto escape del
/// directorio de uploads, aunque una fila legacy contenga `..` o una ruta
/// absoluta manipulada.
pub fn resolve_private_download_path(
    upload_dir: &str,
    file_path: &str,
) -> Result<PathBuf, AppError> {
    if file_path.is_empty() {
        return Err(AppError::NotFound("Archivo no disponible".into()));
    }
    let relative = file_path
        .strip_prefix("/uploads/")
        .or_else(|| file_path.strip_prefix("uploads/"))
        .unwrap_or(file_path);
    let relative_path = Path::new(relative);
    if relative_path.is_absolute()
        || relative_path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(AppError::Forbidden("Ruta de descarga inválida".into()));
    }

    let root = std::fs::canonicalize(upload_dir)
        .map_err(|_| AppError::Internal("Storage privado no disponible".into()))?;
    let candidate = std::fs::canonicalize(root.join(relative_path))
        .map_err(|_| AppError::NotFound("Archivo no disponible".into()))?;
    if !candidate.starts_with(&root) {
        return Err(AppError::Forbidden("Ruta de descarga inválida".into()));
    }
    Ok(candidate)
}

#[cfg(test)]
mod tests {
    use super::{generate_download_token, hash_download_token};

    #[test]
    fn el_grant_no_guarda_el_token_en_claro() {
        let token = generate_download_token();
        assert_ne!(token.raw, token.hash);
        assert_eq!(token.hash, hash_download_token(&token.raw));
        assert_eq!(token.raw.len(), 64);
        assert_eq!(token.hash.len(), 64);
    }
}
