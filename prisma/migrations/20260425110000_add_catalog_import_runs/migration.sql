DO $$
BEGIN
  CREATE TYPE "CatalogImportPayloadFormat" AS ENUM ('json', 'csv');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CatalogImportMode" AS ENUM ('skip', 'upsert');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "catalog_import_runs" (
  "id" UUID NOT NULL,
  "payload_format" "CatalogImportPayloadFormat" NOT NULL DEFAULT 'json',
  "import_mode" "CatalogImportMode" NOT NULL DEFAULT 'skip',
  "submitted_count" INTEGER NOT NULL DEFAULT 0,
  "valid_count" INTEGER NOT NULL DEFAULT 0,
  "invalid_count" INTEGER NOT NULL DEFAULT 0,
  "duplicate_input_count" INTEGER NOT NULL DEFAULT 0,
  "created_count" INTEGER NOT NULL DEFAULT 0,
  "updated_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "default_business_type" TEXT,
  "default_import_source_id" UUID,
  "default_import_source_label" TEXT,
  "default_source_type" "CatalogProductSource",
  "imported_by_user_id" TEXT,
  "imported_by_label" TEXT,
  "error_summary" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "catalog_import_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_import_runs_default_import_source_id_fkey"
    FOREIGN KEY ("default_import_source_id") REFERENCES "catalog_import_sources"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_catalog_import_runs_created"
  ON "catalog_import_runs"("created_at");

CREATE INDEX IF NOT EXISTS "idx_catalog_import_runs_format_created"
  ON "catalog_import_runs"("payload_format", "created_at");

CREATE INDEX IF NOT EXISTS "idx_catalog_import_runs_default_source"
  ON "catalog_import_runs"("default_import_source_id");
