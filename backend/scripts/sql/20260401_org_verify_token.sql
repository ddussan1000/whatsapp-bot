-- Add per-organization webhook verify token
-- Each org gets a unique token they paste into Meta's webhook config

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS verify_token TEXT
    DEFAULT encode(gen_random_bytes(16), 'hex')
    NOT NULL;

-- Backfill existing orgs that have NULL (shouldn't happen with DEFAULT, but just in case)
UPDATE organizations
SET verify_token = encode(gen_random_bytes(16), 'hex')
WHERE verify_token IS NULL OR verify_token = '';
