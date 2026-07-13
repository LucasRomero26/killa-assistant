-- Pending media files waiting for the user's instruction
-- When a user sends a photo or document, it is stored here until the
-- next text/voice message arrives with the action to perform (e.g.
-- "guarda esto en Drive en la carpeta X"). Expires after 10 minutes.

create table public.pending_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  channel public.messaging_channel not null,
  chat_id text not null,
  file_id text not null,
  file_unique_id text,
  file_name text,
  mime_type text,
  file_size bigint,
  media_type text not null,
  caption text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz
);

alter table public.pending_media enable row level security;

create policy "Users can view own pending media"
  on public.pending_media for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own pending media"
  on public.pending_media for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own pending media"
  on public.pending_media for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own pending media"
  on public.pending_media for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index idx_pending_media_user on public.pending_media(user_id);
create index idx_pending_media_status on public.pending_media(status);
create index idx_pending_media_expires on public.pending_media(expires_at);
