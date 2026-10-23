-- Radar: referências privadas por clínica/conta e pauta transacional, sem geração de imagens.
create unique index creative_discoveries_identity on public.creative_discoveries(client_id,account_id,id);
create table public.creative_reference_bookmarks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  account_id uuid not null,
  discovery_id uuid not null,
  canonical_url text not null check (
    canonical_url ~ '^https://(www\.)?instagram\.com/(p|reel)/[A-Za-z0-9_-]+/?$' or
    canonical_url ~ '^https://(www\.)?tiktok\.com/@[^/?#]+/(video|photo)/[0-9]+/?$'
  ),
  saved_at timestamptz not null default now(),
  saved_by uuid not null default auth.uid() references auth.users(id),
  pauta_id uuid,
  unique(client_id,account_id,canonical_url),
  constraint creative_reference_discovery_fkey foreign key(client_id,account_id,discovery_id)
    references public.creative_discoveries(client_id,account_id,id),
  foreign key(client_id,pauta_id) references public.pautas_conteudo(client_id,id) on delete set null (pauta_id)
);
create index creative_references_saved on public.creative_reference_bookmarks(client_id,account_id,saved_at desc);
create index creative_references_discovery on public.creative_reference_bookmarks(client_id,account_id,discovery_id);
create index creative_references_pauta on public.creative_reference_bookmarks(client_id,pauta_id);
create index creative_references_saved_by on public.creative_reference_bookmarks(saved_by);
alter table public.creative_reference_bookmarks enable row level security;
revoke all on public.creative_reference_bookmarks from public,anon,authenticated;
grant select,insert on public.creative_reference_bookmarks to authenticated;
grant update(pauta_id) on public.creative_reference_bookmarks to authenticated;
grant select,insert,update,delete on public.creative_reference_bookmarks to service_role;
create policy creative_reference_read on public.creative_reference_bookmarks for select to authenticated
  using (public.creative_allowed(client_id,false));
create policy creative_reference_insert on public.creative_reference_bookmarks for insert to authenticated
  with check (public.creative_allowed(client_id,true) and saved_by=(select auth.uid()) and pauta_id is null and exists (
    select 1 from public.creative_discoveries d where d.id=discovery_id and d.client_id=creative_reference_bookmarks.client_id
      and d.account_id=creative_reference_bookmarks.account_id and d.canonical_url=creative_reference_bookmarks.canonical_url
  ));
create policy creative_reference_update on public.creative_reference_bookmarks for update to authenticated
  using (public.creative_allowed(client_id,true)) with check (public.creative_allowed(client_id,true));

create function public.creative_save_reference(p_client_id uuid,p_discovery_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.creative_discoveries; b public.creative_reference_bookmarks;
begin
  if auth.uid() is null or not public.creative_allowed(p_client_id,true) then raise exception 'Sem permissão para salvar referências' using errcode='42501'; end if;
  select * into d from public.creative_discoveries where id=p_discovery_id and client_id=p_client_id;
  if not found then raise exception 'Referência indisponível nesta clínica'; end if;
  insert into public.creative_reference_bookmarks(client_id,account_id,discovery_id,canonical_url)
    values(d.client_id,d.account_id,d.id,d.canonical_url)
    on conflict(client_id,account_id,canonical_url) do nothing;
  select * into b from public.creative_reference_bookmarks where client_id=d.client_id and account_id=d.account_id and canonical_url=d.canonical_url;
  return to_jsonb(b);
end $$;

create function public.creative_reference_to_pauta(p_client_id uuid,p_reference_id uuid,p_title text,p_reason text,p_objective text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b public.creative_reference_bookmarks; d public.creative_discoveries; p uuid;
begin
  if auth.uid() is null or not public.creative_allowed(p_client_id,true) then raise exception 'Sem permissão para preparar pauta' using errcode='42501'; end if;
  select * into b from public.creative_reference_bookmarks where id=p_reference_id and client_id=p_client_id for update;
  if not found then raise exception 'Referência salva indisponível nesta clínica'; end if;
  if b.pauta_id is not null then return b.pauta_id; end if;
  if length(btrim(coalesce(p_title,''))) not between 3 and 200 or length(btrim(coalesce(p_reason,''))) not between 10 and 1800
    or coalesce(p_objective,'') not in ('alcance','salvamento','conversa','autoridade') then raise exception 'Informe o tema, o motivo e um objetivo válido para a pauta'; end if;
  select * into d from public.creative_discoveries where id=b.discovery_id and client_id=b.client_id and account_id=b.account_id;
  if not found then raise exception 'Referência original indisponível'; end if;
  insert into public.pautas_conteudo(client_id,ideia_id,titulo,formato,objetivo,status,motivo,origem_tipo,origem_texto,roteiro,aviso)
    values(p_client_id,'radar:'||b.id,btrim(p_title),d.format,p_objective,'escolhida',btrim(p_reason),'post',d.canonical_url,
      jsonb_build_array('Preparar conteúdo original sobre: '||btrim(p_title), 'Orientação da equipe: '||btrim(p_reason), 'Conferir fatos e adequar a linguagem à clínica; a referência é inspiração para a pauta.'),
      'Pauta para revisão da equipe. Não copiar o conteúdo da referência. Conferir precisão médica e regras de publicidade antes de produzir ou publicar.')
    on conflict(client_id,ideia_id) where ideia_id is not null do nothing returning id into p;
  if p is null then select id into p from public.pautas_conteudo where client_id=p_client_id and ideia_id='radar:'||b.id; end if;
  update public.creative_reference_bookmarks set pauta_id=p where id=b.id and client_id=p_client_id;
  return p;
end $$;
revoke all on function public.creative_save_reference(uuid,uuid),public.creative_reference_to_pauta(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.creative_save_reference(uuid,uuid),public.creative_reference_to_pauta(uuid,uuid,text,text,text) to authenticated;
