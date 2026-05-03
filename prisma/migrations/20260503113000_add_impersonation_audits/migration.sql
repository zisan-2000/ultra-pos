CREATE TABLE "impersonation_audits" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "target_user_id" TEXT NOT NULL,
  "started_session_id" TEXT,
  "reason" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMPTZ(6),
  "ended_by_user_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',

  CONSTRAINT "impersonation_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_impersonation_audits_actor_user_id"
  ON "impersonation_audits"("actor_user_id");

CREATE INDEX "idx_impersonation_audits_target_user_id"
  ON "impersonation_audits"("target_user_id");

CREATE INDEX "idx_impersonation_audits_status"
  ON "impersonation_audits"("status");

CREATE INDEX "idx_impersonation_audits_started_at"
  ON "impersonation_audits"("started_at");

ALTER TABLE "impersonation_audits"
  ADD CONSTRAINT "impersonation_audits_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "impersonation_audits"
  ADD CONSTRAINT "impersonation_audits_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "impersonation_audits"
  ADD CONSTRAINT "impersonation_audits_ended_by_user_id_fkey"
  FOREIGN KEY ("ended_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
