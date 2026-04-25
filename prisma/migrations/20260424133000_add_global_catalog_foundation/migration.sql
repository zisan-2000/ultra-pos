DO $$
BEGIN
  CREATE TYPE "CatalogProductSource" AS ENUM ('curated', 'imported', 'user_submitted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CatalogImportSourceType" AS ENUM ('csv', 'json', 'barcode_feed', 'supplier_list', 'manual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CatalogPriceKind" AS ENUM ('retail', 'wholesale', 'mrp');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProductSourceType" AS ENUM ('manual', 'template', 'catalog', 'barcode');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "catalog_import_sources" (
  "id" UUID NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "CatalogImportSourceType" NOT NULL,
  "notes" TEXT,
  "imported_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "catalog_import_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "catalog_import_sources_slug_key"
  ON "catalog_import_sources"("slug");

CREATE TABLE IF NOT EXISTS "catalog_products" (
  "id" UUID NOT NULL,
  "business_type" TEXT,
  "name" TEXT NOT NULL,
  "brand" VARCHAR(120),
  "category" TEXT,
  "pack_size" VARCHAR(80),
  "default_base_unit" VARCHAR(40),
  "image_url" TEXT,
  "popularity_score" INTEGER NOT NULL DEFAULT 0,
  "source_type" "CatalogProductSource" NOT NULL DEFAULT 'curated',
  "import_source_id" UUID,
  "external_ref" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "catalog_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_products_import_source_id_fkey"
    FOREIGN KEY ("import_source_id") REFERENCES "catalog_import_sources"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_catalog_products_business_type"
  ON "catalog_products"("business_type");

CREATE INDEX IF NOT EXISTS "idx_catalog_products_business_popularity"
  ON "catalog_products"("business_type", "popularity_score");

CREATE INDEX IF NOT EXISTS "idx_catalog_products_brand"
  ON "catalog_products"("brand");

CREATE INDEX IF NOT EXISTS "idx_catalog_products_import_source_id"
  ON "catalog_products"("import_source_id");

CREATE INDEX IF NOT EXISTS "idx_catalog_products_is_active"
  ON "catalog_products"("is_active");

CREATE TABLE IF NOT EXISTS "catalog_product_aliases" (
  "id" UUID NOT NULL,
  "catalog_product_id" UUID NOT NULL,
  "alias" TEXT NOT NULL,
  "locale" VARCHAR(16),
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_product_aliases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_product_aliases_catalog_product_id_fkey"
    FOREIGN KEY ("catalog_product_id") REFERENCES "catalog_products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_catalog_product_aliases_product_alias"
  ON "catalog_product_aliases"("catalog_product_id", "alias");

CREATE INDEX IF NOT EXISTS "idx_catalog_product_aliases_alias"
  ON "catalog_product_aliases"("alias");

CREATE INDEX IF NOT EXISTS "idx_catalog_product_aliases_locale"
  ON "catalog_product_aliases"("locale");

CREATE TABLE IF NOT EXISTS "catalog_product_barcodes" (
  "id" UUID NOT NULL,
  "catalog_product_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "format" VARCHAR(40),
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_product_barcodes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_product_barcodes_catalog_product_id_fkey"
    FOREIGN KEY ("catalog_product_id") REFERENCES "catalog_products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_catalog_product_barcodes_code"
  ON "catalog_product_barcodes"("code");

CREATE INDEX IF NOT EXISTS "idx_catalog_product_barcodes_product_id"
  ON "catalog_product_barcodes"("catalog_product_id");

CREATE TABLE IF NOT EXISTS "catalog_price_snapshots" (
  "id" UUID NOT NULL,
  "catalog_product_id" UUID NOT NULL,
  "business_type" TEXT,
  "region_code" VARCHAR(40),
  "price_kind" "CatalogPriceKind" NOT NULL DEFAULT 'retail',
  "price" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(8) NOT NULL DEFAULT 'BDT',
  "import_source_id" UUID,
  "source_label" TEXT,
  "observed_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_price_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_price_snapshots_catalog_product_id_fkey"
    FOREIGN KEY ("catalog_product_id") REFERENCES "catalog_products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "catalog_price_snapshots_import_source_id_fkey"
    FOREIGN KEY ("import_source_id") REFERENCES "catalog_import_sources"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_catalog_price_snapshots_product_observed"
  ON "catalog_price_snapshots"("catalog_product_id", "observed_at");

CREATE INDEX IF NOT EXISTS "idx_catalog_price_snapshots_lookup"
  ON "catalog_price_snapshots"("business_type", "region_code", "price_kind");

CREATE INDEX IF NOT EXISTS "idx_catalog_price_snapshots_import_source_id"
  ON "catalog_price_snapshots"("import_source_id");

ALTER TABLE "business_product_templates"
ADD COLUMN IF NOT EXISTS "catalog_product_id" UUID;

ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "catalog_product_id" UUID,
ADD COLUMN IF NOT EXISTS "product_source" "ProductSourceType" NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS "idx_business_product_templates_catalog_product_id"
  ON "business_product_templates"("catalog_product_id");

CREATE INDEX IF NOT EXISTS "idx_products_catalog_product_id"
  ON "products"("catalog_product_id");

CREATE INDEX IF NOT EXISTS "idx_products_shop_source"
  ON "products"("shop_id", "product_source");

DO $$
BEGIN
  ALTER TABLE "business_product_templates"
    ADD CONSTRAINT "business_product_templates_catalog_product_id_fkey"
    FOREIGN KEY ("catalog_product_id") REFERENCES "catalog_products"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "products"
    ADD CONSTRAINT "products_catalog_product_id_fkey"
    FOREIGN KEY ("catalog_product_id") REFERENCES "catalog_products"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
