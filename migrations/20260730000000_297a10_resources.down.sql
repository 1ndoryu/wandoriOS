-- 297A-10 rollback
ALTER TABLE media DROP COLUMN IF EXISTS asset_state;
ALTER TABLE articles DROP COLUMN IF EXISTS system_alias;

-- Restore products FK to CASCADE
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_article_id_fkey;
ALTER TABLE products ADD CONSTRAINT products_article_id_fkey
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE;

DROP TABLE IF EXISTS product_versions;
DROP TABLE IF EXISTS resources;
DROP TYPE IF EXISTS asset_processing_state;
DROP TYPE IF EXISTS lifecycle_state;
DROP TYPE IF EXISTS visibility_state;
DROP TYPE IF EXISTS editorial_state;
DROP TYPE IF EXISTS resource_kind;
