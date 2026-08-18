-- 297A-29: Panel de control — apariencia por usuario con default del admin.
-- NULL en user_preferences = heredar el default global (del admin).
-- Los defaults globales viven en site_settings (claves appearance_*).

ALTER TABLE user_preferences
    ADD COLUMN wallpaper TEXT,
    ADD COLUMN font VARCHAR(32),
    -- DOUBLE PRECISION: sqlx mapea f64 a FLOAT8; NUMERIC(4,2) no es
    -- compatible con el decoder de Rust.
    ADD COLUMN scale DOUBLE PRECISION;

-- Defaults globales (los escribe el admin desde su panel; el resto de
-- usuarios los hereda cuando su campo está NULL).
INSERT INTO site_settings (key, value)
SELECT 'appearance_wallpaper', ''
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'appearance_wallpaper');

INSERT INTO site_settings (key, value)
SELECT 'appearance_font', 'system'
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'appearance_font');

INSERT INTO site_settings (key, value)
SELECT 'appearance_scale', '1.00'
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'appearance_scale');
