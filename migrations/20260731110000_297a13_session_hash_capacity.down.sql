-- 297A-13 rollback: restaurar capacidad histórica de token_hash.
-- Se aborta explícitamente si ya existen hashes combinados de 129 caracteres.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM auth_sessions WHERE length(token_hash) > 64) THEN
        RAISE EXCEPTION 'No se puede reducir auth_sessions.token_hash: existen hashes combinados largos';
    END IF;

    ALTER TABLE auth_sessions
        ALTER COLUMN token_hash TYPE VARCHAR(64);
END $$;
