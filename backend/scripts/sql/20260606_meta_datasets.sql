-- Meta Conversions API datasets per org (Option B: tabla dedicada, FK desde instancias)
-- Cada org puede tener múltiples datasets (para distintos Business Managers / cuentas ad).
-- Cada instancia de WhatsApp apunta opcionalmente a un dataset.

CREATE TABLE IF NOT EXISTS meta_datasets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label           text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100),
  dataset_id      text        NOT NULL CHECK (char_length(dataset_id) BETWEEN 1 AND 60),
  access_token    text,       -- AES-256-GCM encrypted via ENCRYPTION_KEY
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE meta_datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_member_rls" ON meta_datasets
  USING (is_org_member_or_platform_admin(organization_id));

CREATE INDEX IF NOT EXISTS idx_meta_datasets_org ON meta_datasets (organization_id);

-- Enlace instancia → dataset (nullable: CAPI es opcional)
ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS meta_dataset_id uuid
    REFERENCES meta_datasets(id) ON DELETE SET NULL;
