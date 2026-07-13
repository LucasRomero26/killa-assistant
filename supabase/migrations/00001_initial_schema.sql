-- KillaAssistant initial schema migration
-- Tables derived from Stitch UI design specifications

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Table: usuarios (extends auth.users)
create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.usuarios enable row level security;

create policy "Users can view own profile"
  on public.usuarios for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update own profile"
  on public.usuarios for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can insert own profile"
  on public.usuarios for insert
  to authenticated
  with check ((select auth.uid()) = id);

create index idx_usuarios_id on public.usuarios(id);

-- Table: configuraciones_bot (AI Behavior)
create type public.response_mode as enum ('always', 'mentions_only', 'never');
create type public.note_format_flags as enum ('include_date', 'tag_source', 'auto_summary');

create table public.configuraciones_bot (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  system_prompt text not null default 'Eres KillaAssistant, un asistente administrativo de élite, enfocado en la precisión técnica y la brevedad ejecutiva.',
  prompt_token_count int not null default 0,
  max_tokens int not null default 4096,
  response_mode public.response_mode not null default 'always',
  note_include_date boolean not null default true,
  note_tag_source boolean not null default false,
  note_auto_summary boolean not null default true,
  assistant_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.configuraciones_bot enable row level security;

create policy "Users can view own bot config"
  on public.configuraciones_bot for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own bot config"
  on public.configuraciones_bot for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own bot config"
  on public.configuraciones_bot for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own bot config"
  on public.configuraciones_bot for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index idx_configuraciones_bot_user on public.configuraciones_bot(user_id);

-- Table: configuraciones_api (API keys)
create type public.api_provider as enum ('nvidia_nim', 'groq', 'grok', 'openai', 'anthropic');

create table public.configuraciones_api (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  provider public.api_provider not null,
  api_key_encrypted text,
  model text,
  is_enabled boolean not null default false,
  permissions jsonb not null default '{}'::jsonb,
  token_limit int,
  last_tested_at timestamptz,
  last_test_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table public.configuraciones_api enable row level security;

create policy "Users can view own API configs"
  on public.configuraciones_api for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own API configs"
  on public.configuraciones_api for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own API configs"
  on public.configuraciones_api for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own API configs"
  on public.configuraciones_api for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index idx_configuraciones_api_user on public.configuraciones_api(user_id);

-- Table: credenciales_google (Google OAuth tokens)
create table public.credenciales_google (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_type text default 'Bearer',
  expiry_date timestamptz,
  scope text,
  calendar_connected boolean not null default false,
  drive_connected boolean not null default false,
  calendar_events_today int not null default 0,
  drive_files_today int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.credenciales_google enable row level security;

create policy "Users can view own Google credentials"
  on public.credenciales_google for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own Google credentials"
  on public.credenciales_google for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own Google credentials"
  on public.credenciales_google for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own Google credentials"
  on public.credenciales_google for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index idx_credenciales_google_user on public.credenciales_google(user_id);

-- Table: conexiones_mensajeria (Telegram/WhatsApp status)
create type public.messaging_channel as enum ('telegram', 'whatsapp');
create type public.connection_status as enum ('connected', 'pending', 'disconnected', 'expired');

create table public.conexiones_mensajeria (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  channel public.messaging_channel not null,
  status public.connection_status not null default 'disconnected',
  chat_id text,
  phone_number text,
  session_data jsonb,
  connected_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel)
);

alter table public.conexiones_mensajeria enable row level security;

create policy "Users can view own messaging connections"
  on public.conexiones_mensajeria for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own messaging connections"
  on public.conexiones_mensajeria for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own messaging connections"
  on public.conexiones_mensajeria for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own messaging connections"
  on public.conexiones_mensajeria for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index idx_conexiones_mensajeria_user on public.conexiones_mensajeria(user_id);

-- Table: logs_actividad (Activity monitor)
create type public.log_source as enum ('whatsapp', 'telegram', 'calendar', 'drive', 'nvidia_nim', 'groq', 'system');
create type public.log_level as enum ('info', 'warning', 'error', 'success');

create table public.logs_actividad (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  source public.log_source not null,
  level public.log_level not null default 'info',
  message text not null,
  detail text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.logs_actividad enable row level security;

create policy "Users can view own logs"
  on public.logs_actividad for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own logs"
  on public.logs_actividad for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own logs"
  on public.logs_actividad for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index idx_logs_actividad_user on public.logs_actividad(user_id);
create index idx_logs_actividad_created on public.logs_actividad(created_at desc);

-- Auto-update updated_at trigger
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in
    select unnest(array['usuarios', 'configuraciones_bot', 'configuraciones_api', 'credenciales_google', 'conexiones_mensajeria'])
  loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.handle_updated_at();', t);
  end loop;
end $$;

-- Auto-create usuario profile on auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into public.configuraciones_bot (user_id)
  values (new.id);

  insert into public.conexiones_mensajeria (user_id, channel, status)
  values
    (new.id, 'telegram', 'disconnected'),
    (new.id, 'whatsapp', 'disconnected')
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
