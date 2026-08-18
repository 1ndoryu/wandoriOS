-- 297A-10: Resource envelope, product versions, asset states
-- Strategy: expand → backfill. Legacy columns preserved until contract phase.

-- === ENUMS ===
CREATE TYPE resource_kind AS ENUM ('article', 'project', 'media', 'product', 'asset');
CREATE TYPE editorial_state AS ENUM ('draft', 'ready');
CREATE TYPE visibility_state AS ENUM ('private', 'public', 'unlisted');
CREATE TYPE lifecycle_state AS ENUM ('active', 'trashed');
CREATE TYPE asset_processing_state AS ENUM ('processing', 'clean', 'rejected');

-- === RESOURCES ENVELOPE ===
CREATE TABLE resources (
    id UUID PRIMARY KEY,
    kind resource_kind NOT NULL,
    title VARCHAR(500) NOT NULL,
    editorial editorial_state NOT NULL DEFAULT 'draft',
    visibility visibility_state NOT NULL DEFAULT 'private',
    lifecycle lifecycle_state NOT NULL DEFAULT 'active',
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resources_kind ON resources(kind);
CREATE INDEX idx_resources_editorial ON resources(editorial);
CREATE INDEX idx_resources_visibility ON resources(visibility);
CREATE INDEX idx_resources_lifecycle ON resources(lifecycle);

-- === PRODUCT VERSIONS (immutable deliverables) ===
CREATE TABLE product_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    version_name VARCHAR(100) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_versions_product ON product_versions(product_id);

-- === EXPAND EXISTING TABLES ===
-- Articles: system alias for 'about' page
ALTER TABLE articles ADD COLUMN system_alias VARCHAR(100);

-- Products: decouple from articles (ON DELETE SET NULL instead of CASCADE)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_article_id_fkey;
ALTER TABLE products ALTER COLUMN article_id DROP NOT NULL;
ALTER TABLE products ADD CONSTRAINT products_article_id_fkey
    FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL;

-- Media: asset processing state
ALTER TABLE media ADD COLUMN asset_state asset_processing_state NOT NULL DEFAULT 'clean';

-- === BACKFILL: populate resources from existing data ===

-- Articles → resources
INSERT INTO resources (id, kind, title, editorial, visibility, created_at, updated_at)
SELECT
    id, 'article', title,
    CASE WHEN status = 'published' THEN 'ready'::editorial_state ELSE 'draft'::editorial_state END,
    CASE WHEN status = 'published' THEN 'public'::visibility_state ELSE 'private'::visibility_state END,
    created_at, updated_at
FROM articles;

-- Projects → resources
INSERT INTO resources (id, kind, title, editorial, visibility, created_at)
SELECT
    id, 'project', title,
    CASE WHEN is_visible THEN 'ready'::editorial_state ELSE 'draft'::editorial_state END,
    CASE WHEN is_visible THEN 'public'::visibility_state ELSE 'private'::visibility_state END,
    created_at
FROM projects;

-- Products → resources (default private + inactive per architecture)
INSERT INTO resources (id, kind, title, editorial, visibility, created_at)
SELECT
    id, 'product', name,
    CASE WHEN is_active THEN 'ready'::editorial_state ELSE 'draft'::editorial_state END,
    CASE WHEN is_active THEN 'public'::visibility_state ELSE 'private'::visibility_state END,
    created_at
FROM products;

-- Media → resources
INSERT INTO resources (id, kind, title, editorial, visibility, created_at)
SELECT id, 'media', COALESCE(alt_text, 'media file'), 'ready', 'public', created_at FROM media;

-- Product versions from legacy download_path
INSERT INTO product_versions (product_id, version_name, file_path, created_at)
SELECT id, 'v1 (legacy)', download_path, created_at
FROM products
WHERE download_path IS NOT NULL AND download_path != '';
