-- WhatsApp channel removed: the assistant now operates through Telegram only.
-- Drops the WhatsApp link-token table and stops seeding a WhatsApp row for
-- new users. The messaging_channel / log_source enum values are kept so
-- historical rows in conexiones_mensajeria and logs_actividad stay valid.

drop table if exists public.whatsapp_link_tokens;

delete from public.conexiones_mensajeria where channel = 'whatsapp';

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
  values (new.id, 'telegram', 'disconnected')
  on conflict do nothing;

  return new;
end;
$$;
