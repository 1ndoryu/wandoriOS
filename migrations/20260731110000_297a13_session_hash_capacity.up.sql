-- 297A-13: auth_sessions almacena hash de sesión y hash CSRF separados por ':'
-- Cada hash SHA-256 hexadecimal ocupa 64 caracteres; el valor combinado ocupa 129.
ALTER TABLE auth_sessions
    ALTER COLUMN token_hash TYPE VARCHAR(129);
