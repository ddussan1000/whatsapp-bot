-- Enrich ad_click_logs with ad/campaign/adset names fetched from Meta Ads API
-- Run in Supabase SQL editor

begin;

alter table public.ad_click_logs
  add column if not exists ad_name      text,
  add column if not exists campaign_id  text,
  add column if not exists campaign_name text,
  add column if not exists adset_id     text,
  add column if not exists adset_name   text;

commit;
