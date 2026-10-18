-- Limites adicionais após homologação do primeiro fluxo.
create or replace function public.creative_production_upload(p_client_id uuid,p_project_id uuid,p_mime text,p_bytes bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.creative_productions; m uuid:=gen_random_uuid(); path text;
begin
 if not public.creative_allowed(p_client_id,true) or auth.uid() is null then raise exception 'Sem permissão' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text,1903));
 if (select coalesce(sum(bytes),0) from public.creative_production_media where client_id=p_client_id and purpose='input' and created_at>=current_date)+p_bytes>536870912 then raise exception 'Limite diário de 512 MiB de uploads da clínica atingido'; end if;
 select * into p from public.creative_productions where id=p_project_id and client_id=p_client_id for update;
 if not found or p_bytes is null or p_bytes not between 1 and 209715200 or p_mime not in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime') or (p_mime like 'image/%' and p_bytes>20971520) then raise exception 'Arquivo não permitido'; end if;
 if (select count(*) from public.creative_production_media where project_id=p.id and created_at>=current_date and purpose='input')>=40 then raise exception 'Limite diário de uploads do projeto atingido'; end if;
 path:=p.client_id::text||'/'||p.account_id::text||'/'||p.id::text||'/'||m::text;
 insert into public.creative_production_media(id,client_id,account_id,project_id,purpose,storage_path,mime,bytes,uploader_id)
 values(m,p.client_id,p.account_id,p.id,'input',path,p_mime,p_bytes,auth.uid());
 return jsonb_build_object('id',m,'path',path);
end $$;

create or replace function public.creative_enqueue(p_client_id uuid,p_kind text,p_input jsonb,p_request_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid; s uuid; j uuid; p public.instagram_posts; st public.creative_structures; existing uuid;
begin
 if not public.creative_allowed(p_client_id,true) then raise exception 'Sem permissão de edição no Nexo' using errcode='42501'; end if;
 if p_kind not in ('analyse','adapt','discover','search','production_prepare','production_render','production_image') or length(p_request_key) not between 1 and 120 or pg_column_size(p_input)>16000 then raise exception 'Pedido inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text,1901));
 select id into existing from public.creative_jobs where client_id=p_client_id and idempotency_key=p_request_key;
 if existing is not null then
   if p_kind like 'production_%' and not exists(select 1 from public.creative_jobs where id=existing and kind=p_kind and input=p_input) then raise exception 'Chave já utilizada por outro pedido'; end if;
   return existing;
 end if;
 if (select count(*) from public.creative_jobs where client_id=p_client_id and kind<>'measure' and created_at>=current_date)>=30 then raise exception 'Limite diário de trabalhos atingido'; end if;
 if (select count(*) from public.creative_jobs where client_id=p_client_id and kind<>'measure' and status in ('queued','running','retry'))>=6 then raise exception 'Aguarde a conclusão dos trabalhos em andamento'; end if;
 if (select coalesce(sum(cost_usd+reserved_usd),0) from public.creative_jobs where client_id=p_client_id and created_at>=current_date)>=10 then raise exception 'Orçamento diário do cliente atingido'; end if;
 a:=(p_input->>'account_id')::uuid;
 if not exists(select 1 from public.instagram_accounts where id=a and client_id=p_client_id) then raise exception 'Conta não pertence ao cliente' using errcode='42501'; end if;
 if p_kind like 'production_%' then
   if not exists(select 1 from public.creative_productions pr join public.creative_production_revisions rv on rv.project_id=pr.id and rv.client_id=pr.client_id and rv.account_id=pr.account_id where pr.id=(p_input->>'project_id')::uuid and pr.client_id=p_client_id and pr.account_id=a and rv.revision=(p_input->>'revision')::int) then raise exception 'Revisão indisponível' using errcode='42501'; end if;
   select id into existing from public.creative_jobs where client_id=p_client_id and kind=p_kind and input=p_input and status in ('queued','running','retry');
   if existing is not null then return existing; end if;
 elsif p_kind='analyse' then
   if p_input ? 'post_id' then
     select * into p from public.instagram_posts where id=(p_input->>'post_id')::uuid and client_id=p_client_id and instagram_account_id=a;
     if not found or p.format not in ('carrossel','reels') or p.windsor_media_id is null then raise exception 'Publicação não disponível nesta conta'; end if;
     insert into public.creative_sources(client_id,account_id,post_id,platform,origin,external_id,canonical_url,format,title)
       values(p_client_id,a,p.id,'instagram','own',p.windsor_media_id,coalesce(p.permalink,''),p.format,left(coalesce(p.caption,'Publicação'),180))
       on conflict(client_id,account_id,platform,external_id) do update set title=excluded.title returning id into s;
   else
     select id into s from public.creative_sources where id=(p_input->>'source_id')::uuid and client_id=p_client_id and account_id=a;
     if s is null then raise exception 'Referência indisponível'; end if;
   end if;
 elsif p_kind='adapt' then
   select * into st from public.creative_structures where id=(p_input->>'structure_id')::uuid and client_id=p_client_id and account_id=a;
   if not found or length(trim(coalesce(p_input->>'theme',''))) not between 3 and 500 or coalesce(p_input->>'objective','') not in ('alcance','salvamento','compartilhamento','seguidores','conversa','autoridade') then raise exception 'Estrutura, tema ou objetivo inválido'; end if;
   if not exists(select 1 from public.creative_analyses where id=st.analysis_id and coverage->>'status'='completa') and coalesce(p_input->>'allow_partial','false')<>'true' then raise exception 'Confirme o uso de uma análise parcial'; end if;
   s:=st.source_id;
 elsif p_kind='discover' then
   if coalesce(p_input->>'platform','') not in ('instagram','tiktok') or length(trim(coalesce(p_input->>'query',''))) not between 2 and 200 then raise exception 'Pesquisa inválida'; end if;
 elsif p_kind='search' then
   if length(trim(coalesce(p_input->>'query',''))) not between 2 and 500 then raise exception 'Busca inválida'; end if;
 end if;
 if p_kind='analyse' then
   select id into existing from public.creative_jobs where client_id=p_client_id and account_id=a and source_id=s and kind='analyse' and status in ('queued','running','retry');
   if existing is not null then return existing; end if;
 end if;
 insert into public.creative_jobs(client_id,account_id,source_id,kind,input,idempotency_key)
 values(p_client_id,a,s,p_kind,p_input,p_request_key) returning id into j;
 return j;
end $$;
