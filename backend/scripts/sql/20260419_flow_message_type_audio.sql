-- Add "audio" value to flow_message_type enum
ALTER TYPE public.flow_message_type ADD VALUE IF NOT EXISTS 'audio';
