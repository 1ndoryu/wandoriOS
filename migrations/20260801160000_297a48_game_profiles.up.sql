-- 297A-48: Perfil persistente mínimo del juego por cuenta.
-- Los invitados no tienen fila aquí: su identidad sigue siendo temporal y
-- server-side. La selección de personaje se añade en el bloque de catálogo.

CREATE TABLE user_game_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(24) NOT NULL DEFAULT 'Jugador'
        CHECK (char_length(display_name) BETWEEN 1 AND 24),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
