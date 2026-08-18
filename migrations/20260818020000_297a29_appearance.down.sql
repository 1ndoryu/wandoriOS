-- 297A-29 down: quita apariencia por usuario y los defaults globales.

ALTER TABLE user_preferences
    DROP COLUMN wallpaper,
    DROP COLUMN font,
    DROP COLUMN scale;

DELETE FROM site_settings WHERE key IN ('appearance_wallpaper', 'appearance_font', 'appearance_scale');
