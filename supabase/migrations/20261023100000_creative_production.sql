-- Extensão isolada do motor criativo; nenhum conector de publicação é acrescentado.
create unique index creative_adaptation_account_id on public.creative_adaptations(client_id,account_id,id);
create table public.creative_productions (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id), account_id uuid not null,
 adaptation_id uuid, source_id uuid, format text not null check(format in ('carrossel','reels')), title text not null check(length(title) between 1 and 240),
 current_revision integer not null default 0, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 unique(client_id,account_id,id), foreign key(client_id,account_id) references public.instagram_accounts(client_id,id),
 foreign key(client_id,account_id,adaptation_id) references public.creative_adaptations(client_id,account_id,id),
 foreign key(client_id,account_id,source_id) references public.creative_sources(client_id,account_id,id)
);
create unique index creative_production_adaptation on public.creative_productions(client_id,account_id,adaptation_id) where adaptation_id is not null;
create table public.creative_production_revisions (
 id uuid primary key default gen_random_uuid(), client_id uuid not null, account_id uuid not null, project_id uuid not null,
 revision integer not null check(revision>0), document jsonb not null check(jsonb_typeof(document)='object' and pg_column_size(document)<=200000),
 created_by uuid references auth.users(id), created_at timestamptz not null default now(),
 unique(client_id,account_id,project_id,revision), foreign key(client_id,account_id,project_id) references public.creative_productions(client_id,account_id,id)
);
create table public.creative_production_media (
 id uuid primary key default gen_random_uuid(), client_id uuid not null, account_id uuid not null, project_id uuid not null,
 purpose text not null check(purpose in ('input','image','slide','video','archive','subtitle','frame')), storage_path text not null unique,
 mime text not null, bytes bigint not null check(bytes>0 and bytes<=209715200), sha256 text check(sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','ready')), uploader_id uuid references auth.users(id), job_id uuid,
 created_at timestamptz not null default now(), unique(client_id,account_id,project_id,id),
 foreign key(client_id,account_id,project_id) references public.creative_productions(client_id,account_id,id),
 foreign key(client_id,account_id,job_id) references public.creative_jobs(client_id,account_id,id),
 check(storage_path like client_id::text||'/'||account_id::text||'/'||project_id::text||'/%')
);
create table public.creative_production_outputs (
 job_id uuid primary key, client_id uuid not null, account_id uuid not null, project_id uuid not null, revision integer not null,
 kind text not null check(kind in ('production_prepare','production_render','production_image')), result jsonb not null,
 created_at timestamptz not null default now(), foreign key(client_id,account_id,job_id) references public.creative_jobs(client_id,account_id,id),
 foreign key(client_id,account_id,project_id,revision) references public.creative_production_revisions(client_id,account_id,project_id,revision)
);
create index creative_production_media_project on public.creative_production_media(client_id,account_id,project_id);
create index creative_production_output_project on public.creative_production_outputs(client_id,account_id,project_id,created_at desc);
do $$declare t text;begin
 foreach t in array array['creative_productions','creative_production_revisions','creative_production_media','creative_production_outputs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to service_role',t);
 execute format('create policy production_private_read on public.%I for select to authenticated using(public.creative_allowed(client_id,false))',t);
 end loop;
end $$;

create function public.creative_revision_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Revisões são imutáveis; crie uma nova revisão'; end $$;
revoke all on function public.creative_revision_immutable() from public,anon,authenticated;
create trigger production_revision_immutable before update or delete on public.creative_production_revisions for each row execute function public.creative_revision_immutable();

-- Referências privadas são verificadas no servidor, inclusive nas revisões manuais.
create function public.creative_production_validate(p_project uuid,p_document jsonb)
returns void language plpgsql set search_path='' as $$
declare p public.creative_productions; r jsonb; refs jsonb; n integer;
begin
 select * into p from public.creative_productions where id=p_project;
 if p.id is null or jsonb_typeof(p_document) is distinct from 'object' or pg_column_size(p_document)>200000 or
   (p_document->>'version') is distinct from '1' or (p_document->>'format') is distinct from p.format or
   coalesce(length(p_document->>'title'),0) not between 1 and 240 then raise exception 'Documento inválido'; end if;
 if p.format='carrossel' then
   if jsonb_typeof(p_document->'slides') is distinct from 'array' then raise exception 'Slides inválidos'; end if;
   n:=jsonb_array_length(p_document->'slides'); if n not between 1 and 30 then raise exception 'Quantidade de slides inválida'; end if;
   refs:=coalesce(jsonb_path_query_array(p_document,'$.slides[*].image'),'[]')||jsonb_build_array(p_document->'brand'->'logo');
 else
   if jsonb_typeof(p_document->'cuts') is distinct from 'array' or jsonb_array_length(p_document->'cuts')>120 then raise exception 'Plano inválido'; end if;
   refs:=jsonb_build_array(p_document->'source');
 end if;
 for r in select value from jsonb_array_elements(refs) where value<>'null'::jsonb loop
   if r->>'origin'='production' then
     if not exists(select 1 from public.creative_production_media m where m.id=(r->>'id')::uuid and m.client_id=p.client_id and m.account_id=p.account_id and m.project_id=p.id) then raise exception 'Arquivo fora do projeto' using errcode='42501'; end if;
   elsif r->>'origin'='creative' then
     if not exists(select 1 from public.creative_assets a join public.creative_sources s on s.id=a.source_id and s.client_id=a.client_id and s.account_id=a.account_id where a.id=(r->>'id')::uuid and a.client_id=p.client_id and a.account_id=p.account_id and a.source_id=p.source_id and s.origin='own' and a.kind in ('image','video')) then raise exception 'Referência privada indisponível ou sem autorização de reutilização' using errcode='42501'; end if;
   else raise exception 'Origem do arquivo inválida'; end if;
 end loop;
end $$;
revoke all on function public.creative_production_validate(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.creative_production_validate(uuid,jsonb) to service_role;

create function public.creative_production_create(p_client_id uuid,p_account_id uuid,p_adaptation_id uuid,p_document jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare p uuid; a public.creative_adaptations; s uuid;
begin
 if not public.creative_allowed(p_client_id,true) or not exists(select 1 from public.instagram_accounts where id=p_account_id and client_id=p_client_id and active) then raise exception 'Sem permissão' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text,1903));
 if p_adaptation_id is not null then
   select * into a from public.creative_adaptations where id=p_adaptation_id and client_id=p_client_id and account_id=p_account_id;
   if not found or a.document->>'format' is distinct from p_document->>'format' then raise exception 'Adaptação indisponível'; end if;
   select id into p from public.creative_productions where adaptation_id=a.id and client_id=p_client_id and account_id=p_account_id;
   if p is not null then return p; end if;
   select source_id into s from public.creative_structures where id=a.structure_id and client_id=p_client_id and account_id=p_account_id;
 end if;
 if (select count(*) from public.creative_productions where client_id=p_client_id and created_at>=current_date)>=50 then raise exception 'Limite diário de projetos atingido'; end if;
 insert into public.creative_productions(client_id,account_id,adaptation_id,source_id,format,title,created_by)
 values(p_client_id,p_account_id,p_adaptation_id,s,p_document->>'format',left(p_document->>'title',240),auth.uid()) returning id into p;
 perform public.creative_production_validate(p,p_document);
 insert into public.creative_production_revisions(client_id,account_id,project_id,revision,document,created_by) values(p_client_id,p_account_id,p,1,p_document,auth.uid());
 update public.creative_productions set current_revision=1 where id=p;
 return p;
end $$;
create function public.creative_production_save(p_client_id uuid,p_project_id uuid,p_expected integer,p_document jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare p public.creative_productions; n integer;
begin
 if not public.creative_allowed(p_client_id,true) then raise exception 'Sem permissão' using errcode='42501'; end if;
 select * into p from public.creative_productions where id=p_project_id and client_id=p_client_id for update;
 if not found then raise exception 'Projeto indisponível'; end if;
 if p_expected is distinct from p.current_revision then raise exception 'Outra pessoa salvou uma revisão. Atualize antes de salvar.' using errcode='40001'; end if;
 perform public.creative_production_validate(p.id,p_document); n:=p.current_revision+1;
 insert into public.creative_production_revisions(client_id,account_id,project_id,revision,document,created_by) values(p.client_id,p.account_id,p.id,n,p_document,auth.uid());
 update public.creative_productions set current_revision=n,title=p_document->>'title' where id=p.id;
 return n;
end $$;
create function public.creative_production_upload(p_client_id uuid,p_project_id uuid,p_mime text,p_bytes bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.creative_productions; m uuid:=gen_random_uuid(); path text;
begin
 if not public.creative_allowed(p_client_id,true) or auth.uid() is null then raise exception 'Sem permissão' using errcode='42501'; end if;
 select * into p from public.creative_productions where id=p_project_id and client_id=p_client_id for update;
 if not found or p_bytes is null or p_bytes not between 1 and 209715200 or p_mime not in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime') or (p_mime like 'image/%' and p_bytes>20971520) then raise exception 'Arquivo não permitido'; end if;
 if (select count(*) from public.creative_production_media where project_id=p.id and created_at>=current_date and purpose='input')>=40 then raise exception 'Limite diário de uploads do projeto atingido'; end if;
 path:=p.client_id::text||'/'||p.account_id::text||'/'||p.id::text||'/'||m::text;
 insert into public.creative_production_media(id,client_id,account_id,project_id,purpose,storage_path,mime,bytes,uploader_id)
 values(m,p.client_id,p.account_id,p.id,'input',path,p_mime,p_bytes,auth.uid());
 return jsonb_build_object('id',m,'path',path);
end $$;
revoke all on function public.creative_production_create(uuid,uuid,uuid,jsonb),public.creative_production_save(uuid,uuid,integer,jsonb),public.creative_production_upload(uuid,uuid,text,bigint) from public,anon;
grant execute on function public.creative_production_create(uuid,uuid,uuid,jsonb),public.creative_production_save(uuid,uuid,integer,jsonb) to authenticated,service_role;
grant execute on function public.creative_production_upload(uuid,uuid,text,bigint) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('nexo-production-private','nexo-production-private',false,209715200,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','application/zip','application/x-subrip']) on conflict(id) do nothing;
create policy production_media_read on storage.objects for select to authenticated using(bucket_id='nexo-production-private' and exists(select 1 from public.creative_production_media m where m.storage_path=name and public.creative_allowed(m.client_id,false)));
create policy production_media_read_fence on storage.objects as restrictive for select to authenticated using(bucket_id<>'nexo-production-private' or exists(select 1 from public.creative_production_media m where m.storage_path=name and public.creative_allowed(m.client_id,false)));
create policy production_media_anon_fence on storage.objects as restrictive for select to anon using(bucket_id<>'nexo-production-private');
create policy production_media_upload on storage.objects for insert to authenticated with check(bucket_id='nexo-production-private' and exists(select 1 from public.creative_production_media m where m.storage_path=name and m.uploader_id=auth.uid() and m.status='pending' and m.purpose='input' and m.created_at>now()-interval '15 minutes' and public.creative_allowed(m.client_id,true)));
create policy production_media_upload_fence on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'nexo-production-private' or exists(select 1 from public.creative_production_media m where m.storage_path=name and m.uploader_id=auth.uid() and m.status='pending' and m.purpose='input' and m.created_at>now()-interval '15 minutes' and public.creative_allowed(m.client_id,true)));
create policy production_media_update_fence on storage.objects as restrictive for update to authenticated using(bucket_id<>'nexo-production-private') with check(bucket_id<>'nexo-production-private');
create policy production_media_delete_fence on storage.objects as restrictive for delete to authenticated using(bucket_id<>'nexo-production-private');

alter table public.creative_jobs drop constraint creative_jobs_kind_check;
alter table public.creative_jobs add constraint creative_jobs_kind_check check(kind in ('analyse','adapt','discover','measure','search','production_prepare','production_render','production_image'));

-- Conclusão cercada pelo mesmo lease; resultados não substituem revisões editadas pela equipe.
alter function public.creative_finish(uuid,uuid,jsonb) rename to creative_finish_v1;
create function public.creative_finish(p_job_id uuid,p_lease uuid,p_output jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare j public.creative_jobs; p public.creative_productions; x jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente worker' using errcode='42501'; end if;
 select * into j from public.creative_jobs where id=p_job_id for update;
 if not found or j.status<>'running' or j.lease_token is distinct from p_lease or j.lease_until<=now() or not public.creative_allowed(j.client_id,true) then return false; end if;
 if j.kind not like 'production_%' then return public.creative_finish_v1(p_job_id,p_lease,p_output); end if;
 select * into p from public.creative_productions where id=(j.input->>'project_id')::uuid and client_id=j.client_id and account_id=j.account_id;
 if not found or jsonb_typeof(p_output) is distinct from 'object' or pg_column_size(p_output)>1000000 then raise exception 'Resultado inválido'; end if;
 if p_output ? 'document' then perform public.creative_production_validate(p.id,p_output->'document'); end if;
 if jsonb_typeof(p_output->'media_ids') is distinct from 'array' then raise exception 'Resultado sem arquivos'; end if;
 for x in select value from jsonb_array_elements(p_output->'media_ids') loop
   if not exists(select 1 from public.creative_production_media m where m.id=(x#>>'{}')::uuid and m.client_id=j.client_id and m.account_id=j.account_id and m.project_id=p.id and m.job_id=j.id and m.status='ready' and m.sha256 is not null) then raise exception 'Arquivo não confirmado pelo worker'; end if;
 end loop;
 if j.kind in ('production_render','production_image') and jsonb_array_length(p_output->'media_ids')=0 then raise exception 'Render vazio'; end if;
 insert into public.creative_production_outputs(job_id,client_id,account_id,project_id,revision,kind,result) values(j.id,j.client_id,j.account_id,p.id,(j.input->>'revision')::int,j.kind,p_output);
 update public.creative_jobs set status='completed',progress=100,message='Prévia pronta para revisão',output=p_output,lease_token=null,lease_until=null,updated_at=now() where id=j.id;
 return true;
end $$;
revoke all on function public.creative_finish(uuid,uuid,jsonb),public.creative_finish_v1(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.creative_finish(uuid,uuid,jsonb),public.creative_finish_v1(uuid,uuid,jsonb) to service_role;

-- A fila original mantém todos os limites, idempotência e prioridade.
create or replace function public.creative_enqueue(p_client_id uuid,p_kind text,p_input jsonb,p_request_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid; s uuid; j uuid; p public.instagram_posts; st public.creative_structures; existing uuid;
begin
 if not public.creative_allowed(p_client_id,true) then raise exception 'Sem permissão de edição no Nexo' using errcode='42501'; end if;
 if p_kind not in ('analyse','adapt','discover','search','production_prepare','production_render','production_image') or length(p_request_key) not between 1 and 120 or pg_column_size(p_input)>16000 then raise exception 'Pedido inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text,1901));
 select id into existing from public.creative_jobs where client_id=p_client_id and idempotency_key=p_request_key;
 if existing is not null then return existing; end if;
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


-- Workers legados continuam consumindo apenas os contratos que conhecem.
create or replace function public.creative_claim_supported(p_job_id uuid,p_production boolean)
returns setof public.creative_jobs language plpgsql security definer set search_path='' as $$
declare j public.creative_jobs;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente worker' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(239019901);
 update public.creative_jobs set status='failed',error_code='RETRY_EXHAUSTED',message='Limite de tentativas atingido',lease_token=null,updated_at=now()
 where status in ('retry','running') and attempts>=3 and (lease_until is null or lease_until<now());
 select q.* into j from public.creative_jobs q where
   (p_production or q.kind not like 'production_%') and (p_job_id is null or q.id=p_job_id) and q.run_after<=now() and q.attempts<3
   and (q.status in ('queued','retry') or (q.status='running' and q.lease_until<now()))
   and public.creative_allowed(q.client_id,true)
   and (select count(*) from public.creative_jobs r where r.client_id=q.client_id and r.status='running' and r.lease_until>now())<2
   order by q.run_after,q.created_at for update skip locked limit 1;
 if j.id is null then return; end if;
 return query update public.creative_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',message='Worker iniciou o processamento',updated_at=now()
 where id=j.id returning *;
end $$;


create or replace function public.creative_claim(p_job_id uuid default null)
returns setof public.creative_jobs language sql security definer set search_path='' as $$select * from public.creative_claim_supported(p_job_id,false)$$;
revoke all on function public.creative_claim_supported(uuid,boolean),public.creative_claim(uuid) from public,anon,authenticated;
grant execute on function public.creative_claim_supported(uuid,boolean),public.creative_claim(uuid) to service_role;
