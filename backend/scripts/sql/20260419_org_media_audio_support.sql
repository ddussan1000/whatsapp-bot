-- Add "audio" to org_media media_type check constraint
ALTER TABLE org_media
  DROP CONSTRAINT IF EXISTS org_media_media_type_check;

ALTER TABLE org_media
  ADD CONSTRAINT org_media_media_type_check
  CHECK (media_type IN ('image', 'video', 'document', 'audio'));
