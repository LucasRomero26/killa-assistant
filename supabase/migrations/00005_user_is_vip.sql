-- KillaAssistant: add is_vip flag to usuarios
-- VIP users are granted restricted Google scopes (calendar + drive).
-- Non-VIP users are granted only light scopes (calendar.events + drive.file).
-- The flag is set manually by the project owner via Supabase Studio.

alter table public.usuarios
  add column if not exists is_vip boolean not null default false;

comment on column public.usuarios.is_vip is
  'When true, the user is granted restricted Google OAuth scopes (calendar + drive). When false, only light scopes (calendar.events + drive.file).';
