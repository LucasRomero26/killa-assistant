-- One-time tokens to link Telegram chat_id to a Supabase user

create table public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  user_id uuid not null references public.usuarios(id) on delete cascade,
  chat_id text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz
);

alter table public.telegram_link_tokens enable row level security;

create policy "Users can view own link tokens"
  on public.telegram_link_tokens for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own link tokens"
  on public.telegram_link_tokens for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own link tokens"
  on public.telegram_link_tokens for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index idx_telegram_link_tokens_token on public.telegram_link_tokens(token);
create index idx_telegram_link_tokens_user on public.telegram_link_tokens(user_id);
