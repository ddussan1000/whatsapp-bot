-- Cache de gasto diario de Meta Ads por instancia.
-- En vez de llamar la API de Meta en cada carga del dashboard, se sincroniza
-- manualmente y se lee de aquí. Esto evita que Meta invalide los tokens por exceso de peticiones.

CREATE TABLE meta_ad_spend (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  instance_id       UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  amount            NUMERIC(14,4) NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'USD',
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, instance_id, date)
);

ALTER TABLE meta_ad_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY meta_ad_spend_member_all ON meta_ad_spend
  USING (is_org_member_or_platform_admin(organization_id));

CREATE INDEX idx_meta_ad_spend_org_date ON meta_ad_spend (organization_id, date);
