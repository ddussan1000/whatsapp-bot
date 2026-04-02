-- ── org_media: biblioteca de multimedia por organización ─────────────────────
-- Permite almacenar y reutilizar media (imágenes, videos, documentos) en flujos.

CREATE TABLE IF NOT EXISTS org_media (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  filename         TEXT NOT NULL,           -- nombre sanitizado en storage
  original_name    TEXT NOT NULL,           -- nombre original del archivo
  media_type       TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'document')),
  mime_type        TEXT NOT NULL,
  size_bytes       BIGINT,
  storage_path     TEXT NOT NULL,           -- path en Supabase Storage
  public_url       TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS org_media_org_idx ON org_media (organization_id, created_at DESC);

-- RLS
ALTER TABLE org_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_media_select ON org_media
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY org_media_insert ON org_media
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin', 'agent')
    )
  );

CREATE POLICY org_media_delete ON org_media
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );
