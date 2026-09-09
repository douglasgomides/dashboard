-- Foto e apresentação do cliente, editáveis pelo admin.
--
-- A política de UPDATE em clients já existia (is_app_admin), então aqui só
-- entra a coluna da foto e o lugar para guardá-la.

alter table public.clients add column if not exists avatar_url text;

-- Bucket público na leitura: a foto aparece no cabeçalho do dashboard, e URL
-- assinada com validade só criaria imagem quebrada quando o link expirasse.
-- Não há nada sensível numa foto de perfil que a própria médica publica.
-- Escrita continua restrita a admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-avatars',
  'client-avatars',
  true,
  2097152,  -- 2 MB: é foto de perfil, não banner
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar de cliente e publico para leitura" on storage.objects;
create policy "avatar de cliente e publico para leitura" on storage.objects
  for select
  using (bucket_id = 'client-avatars');

drop policy if exists "admin envia avatar de cliente" on storage.objects;
create policy "admin envia avatar de cliente" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'client-avatars' and public.is_app_admin());

drop policy if exists "admin troca avatar de cliente" on storage.objects;
create policy "admin troca avatar de cliente" on storage.objects
  for update to authenticated
  using (bucket_id = 'client-avatars' and public.is_app_admin())
  with check (bucket_id = 'client-avatars' and public.is_app_admin());

drop policy if exists "admin apaga avatar de cliente" on storage.objects;
create policy "admin apaga avatar de cliente" on storage.objects
  for delete to authenticated
  using (bucket_id = 'client-avatars' and public.is_app_admin());
