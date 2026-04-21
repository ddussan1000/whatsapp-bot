-- Add timezone column to organizations, default America/Bogota
alter table organizations
  add column if not exists timezone text not null default 'America/Bogota';
