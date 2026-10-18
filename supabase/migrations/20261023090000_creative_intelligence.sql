-- Módulo aditivo. Nenhum dado da Inspiração global é convertido em material privado.
-- Fila durável PostgreSQL: reserva atômica, lease com fencing e limites por cliente.
create unique index if not exists creative_accounts_identity on public.instagram_accounts(client_id,id);
create unique index if not exists creative_posts_identity on public.instagram_posts(client_id,instagram_account_id,id);
create unique index if not exists creative_pautas_identity on public.pautas_conteudo(client_id,id);

create or replace function public.creative_allowed(p_client uuid, p_write boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select public.tem_modulo(p_client,'hub') and (
   coalesce(auth.jwt()->>'role','')='service_role' or
   case when p_write then public.pode_editar_acoes(p_client)
   else public.is_app_admin() or public.is_client_member(p_client) end
 );
$$;
revoke all on function public.creative_allowed(uuid,boolean) from public,anon;
grant execute on function public.creative_allowed(uuid,boolean) to authenticated,service_role;

create table public.creative_sources (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
 account_id uuid not null, post_id uuid, platform text not null check(platform in ('instagram','tiktok')),
 origin text not null check(origin in ('own','external')), external_id text not null,
 canonical_url text not null check(length(canonical_url)<=2048), format text not null check(format in ('carrossel','reels')),
 title text not null default '', metadata jsonb not null default '{}', created_at timestamptz not null default now(),
 unique(client_id,id), unique(client_id,account_id,id), unique(client_id,account_id,platform,external_id),
 foreign key(client_id,account_id) references public.instagram_accounts(client_id,id),
 foreign key(client_id,account_id,post_id) references public.instagram_posts(client_id,instagram_account_id,id),
 check(origin='external' or (platform='instagram' and post_id is not null))
);
create table public.creative_jobs (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id), account_id uuid not null,
 source_id uuid, kind text not null check(kind in ('analyse','adapt','discover','measure','search')),
 status text not null default 'queued' check(status in ('queued','running','retry','completed','failed','cancelled')),
 input jsonb not null default '{}', output jsonb, idempotency_key text not null,
 progress integer not null default 0 check(progress between 0 and 100), message text not null default 'Na fila',
 attempts integer not null default 0, lease_token uuid, lease_until timestamptz,
 run_after timestamptz not null default now(), budget_usd numeric not null default 2 check(budget_usd>0 and budget_usd<=10),
 reserved_usd numeric not null default 0 check(reserved_usd>=0), cost_usd numeric not null default 0 check(cost_usd>=0),
 error_code text, created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(client_id,id), unique(client_id,idempotency_key),
 foreign key(client_id,account_id) references public.instagram_accounts(client_id,id),
 foreign key(client_id,account_id,source_id) references public.creative_sources(client_id,account_id,id)
);
create index creative_jobs_ready on public.creative_jobs(run_after,created_at) where status in ('queued','retry','running');
create index creative_jobs_client on public.creative_jobs(client_id,created_at desc);
create table public.creative_checkpoints (
 client_id uuid not null, job_id uuid not null, phase text not null, result jsonb not null,
 created_at timestamptz not null default now(), primary key(job_id,phase),
 foreign key(client_id,job_id) references public.creative_jobs(client_id,id)
);
create table public.creative_assets (
 id uuid primary key default gen_random_uuid(), client_id uuid not null, account_id uuid not null, source_id uuid not null,
 kind text not null check(kind in ('image','video','audio','frame')), position integer not null check(position>=1),
 storage_path text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), bytes bigint not null check(bytes>0), mime text not null,
 width integer, height integer, time_seconds numeric, duration_seconds numeric, metadata jsonb not null default '{}',
 created_at timestamptz not null default now(), unique(client_id,id),
 foreign key(client_id,account_id,source_id) references public.creative_sources(client_id,account_id,id),
 check(storage_path like client_id::text || '/' || account_id::text || '/' || source_id::text || '/%')
);
create index creative_assets_source on public.creative_assets(client_id,source_id,position);
create table public.creative_analyses (
 id uuid primary key default gen_random_uuid(), client_id uuid not null, account_id uuid not null, source_id uuid not null,
 job_id uuid not null unique, version text not null, model text not null, coverage jsonb not null,
 result jsonb not null, transcript jsonb not null default '[]', cost_usd numeric not null default 0, created_at timestamptz not null default now(),
 unique(client_id,id), foreign key(client_id,account_id,source_id) references public.creative_sources(client_id,account_id,id),
 foreign key(client_id,job_id) references public.creative_jobs(client_id,id),
 check(coverage->>'status' in ('completa','parcial','indisponivel'))
);
create index creative_analyses_source on public.creative_analyses(client_id,source_id,created_at desc);
create table public.creative_structures (
 id uuid primary key default gen_random_uuid(), client_id uuid not null, account_id uuid not null, source_id uuid not null,
 analysis_id uuid not null unique, title text not null, theme text not null, format text not null check(format in ('carrossel','reels')),
 state text not null default 'candidata' check(state in ('candidata','em_teste','positiva_mercado','positiva_conta','testes_repetidos')),
 evidence jsonb not null default '{}', dna jsonb not null, embedding real[], embedding_model text,
 created_at timestamptz not null default now(), unique(client_id,id), unique(client_id,account_id,id),
 foreign key(client_id,account_id,source_id) references public.creative_sources(client_id,account_id,id),
 foreign key(client_id,analysis_id) references public.creative_analyses(client_id,id),
 check(embedding is null or array_length(embedding,1) between 1 and 3072)
);
create index creative_structures_client on public.creative_structures(client_id,account_id,created_at desc);
create table public.creative_adaptations (
 id uuid primary key default gen_random_uuid(), client_id uuid not null, account_id uuid not null,
 structure_id uuid not null, analysis_id uuid not null, job_id uuid not null unique,
 document jsonb not null, model text not null, pauta_id uuid, published_post_id uuid, created_at timestamptz not null default now(),
 unique(client_id,id), foreign key(client_id,account_id,structure_id) references public.creative_structures(client_id,account_id,id),
 foreign key(client_id,analysis_id) references public.creative_analyses(client_id,id),
 foreign key(client_id,job_id) references public.creative_jobs(client_id,id),
 foreign key(client_id,pauta_id) references public.pautas_conteudo(client_id,id),
 foreign key(client_id,account_id,published_post_id) references public.instagram_posts(client_id,instagram_account_id,id)
);
create index creative_adaptations_client on public.creative_adaptations(client_id,created_at desc);
create table public.creative_metric_observations (
 id uuid primary key default gen_random_uuid(), client_id uuid not null, account_id uuid not null, adaptation_id uuid not null,
 post_id uuid not null, window_day integer not null check(window_day in (1,3,7,28)), observed_at timestamptz not null default now(),
 metrics_at timestamptz, age_hours numeric, quality text not null check(quality in ('within_window','late','stale','missing')),
 metrics jsonb not null, comparison jsonb not null default '{}', unique(adaptation_id,window_day),
 foreign key(client_id,adaptation_id) references public.creative_adaptations(client_id,id),
 foreign key(client_id,account_id,post_id) references public.instagram_posts(client_id,instagram_account_id,id)
);
create index creative_observations_client on public.creative_metric_observations(client_id,adaptation_id);
create table public.creative_usage (
 id uuid primary key default gen_random_uuid(), client_id uuid not null, job_id uuid not null,
 request_key text not null, model text not null, phase text not null, reserved_usd numeric not null check(reserved_usd>0),
 cost_usd numeric, usage jsonb not null default '{}', status text not null default 'reserved' check(status in ('reserved','settled')),
 created_at timestamptz not null default now(), unique(job_id,request_key),
 foreign key(client_id,job_id) references public.creative_jobs(client_id,id)
);
create index creative_usage_client on public.creative_usage(client_id,created_at);
create table public.creative_discoveries (
 id uuid primary key default gen_random_uuid(), client_id uuid not null, account_id uuid not null, job_id uuid not null,
 platform text not null check(platform in ('instagram','tiktok')), external_id text not null, canonical_url text not null,
 title text not null, format text not null check(format in ('carrossel','reels')), metadata jsonb not null,
 observed_at timestamptz not null default now(), unique(job_id,external_id),
 foreign key(client_id,job_id) references public.creative_jobs(client_id,id),
 foreign key(client_id,account_id) references public.instagram_accounts(client_id,id)
);
create index creative_discoveries_client on public.creative_discoveries(client_id,account_id,observed_at desc);
create table public.creative_workers (
 id text primary key, seen_at timestamptz not null default now(), capabilities jsonb not null,
 version text not null
);

do $$ declare t text; begin
 foreach t in array array['creative_sources','creative_jobs','creative_checkpoints','creative_assets','creative_analyses','creative_structures','creative_adaptations','creative_metric_observations','creative_usage','creative_discoveries'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public,anon,authenticated',t);
   execute format('grant select on public.%I to authenticated',t);
   execute format('grant select,insert,update,delete on public.%I to service_role',t);
   execute format('create policy creative_private_read on public.%I for select to authenticated using (public.creative_allowed(client_id,false))',t);
 end loop;
end $$;
alter table public.creative_workers enable row level security;
revoke all on public.creative_workers from public,anon,authenticated;
grant select,insert,update,delete on public.creative_workers to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('nexo-creative-private','nexo-creative-private',false,524288000,array['image/jpeg','image/png','image/webp','video/mp4','audio/mpeg','audio/mp4','audio/wav'])
 on conflict(id) do nothing;
create policy creative_private_assets on storage.objects for select to authenticated using (
 bucket_id='nexo-creative-private' and exists (
   select 1 from public.creative_assets a where a.storage_path=name and public.creative_allowed(a.client_id,false)
 )
);
-- Policies permissivas legadas de outros buckets não podem abrir este bucket por OR.
create policy creative_storage_tenant_fence on storage.objects as restrictive for select to authenticated using (
 bucket_id<>'nexo-creative-private' or exists(select 1 from public.creative_assets a where a.storage_path=name and public.creative_allowed(a.client_id,false))
);
create policy creative_storage_anon_fence on storage.objects as restrictive for select to anon using(bucket_id<>'nexo-creative-private');
create policy creative_storage_insert_fence on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'nexo-creative-private');
create policy creative_storage_update_fence on storage.objects as restrictive for update to authenticated using(bucket_id<>'nexo-creative-private') with check(bucket_id<>'nexo-creative-private');
create policy creative_storage_delete_fence on storage.objects as restrictive for delete to authenticated using(bucket_id<>'nexo-creative-private');

create or replace function public.creative_worker_health()
returns jsonb language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then '{}'::jsonb else coalesce((select jsonb_build_object('seen_at',seen_at,'capabilities',capabilities,'version',version) from public.creative_workers order by seen_at desc limit 1),'{}'::jsonb) end;
$$;

create or replace function public.creative_enqueue(p_client_id uuid,p_kind text,p_input jsonb,p_request_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid; s uuid; j uuid; p public.instagram_posts; st public.creative_structures; existing uuid;
begin
 if not public.creative_allowed(p_client_id,true) then raise exception 'Sem permissão de edição no Nexo' using errcode='42501'; end if;
 if p_kind not in ('analyse','adapt','discover','search') or length(p_request_key) not between 1 and 120 or pg_column_size(p_input)>16000 then raise exception 'Pedido inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text,1901));
 select id into existing from public.creative_jobs where client_id=p_client_id and idempotency_key=p_request_key;
 if existing is not null then return existing; end if;
 if (select count(*) from public.creative_jobs where client_id=p_client_id and kind<>'measure' and created_at>=current_date)>=30 then raise exception 'Limite diário de trabalhos atingido'; end if;
 if (select count(*) from public.creative_jobs where client_id=p_client_id and kind<>'measure' and status in ('queued','running','retry'))>=6 then raise exception 'Aguarde a conclusão dos trabalhos em andamento'; end if;
 if (select coalesce(sum(cost_usd+reserved_usd),0) from public.creative_jobs where client_id=p_client_id and created_at>=current_date)>=10 then raise exception 'Orçamento diário do cliente atingido'; end if;
 a:=(p_input->>'account_id')::uuid;
 if not exists(select 1 from public.instagram_accounts where id=a and client_id=p_client_id) then raise exception 'Conta não pertence ao cliente' using errcode='42501'; end if;
 if p_kind='analyse' then
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
 insert into public.creative_jobs(client_id,account_id,source_id,kind,input,idempotency_key)
 values(p_client_id,a,s,p_kind,p_input,p_request_key) returning id into j;
 return j;
end $$;

create or replace function public.creative_cancel(p_client_id uuid,p_job_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.creative_allowed(p_client_id,true) then raise exception 'Sem permissão' using errcode='42501'; end if;
 update public.creative_jobs set status='cancelled',lease_token=null,lease_until=null,message='Cancelado pela equipe',updated_at=now()
 where id=p_job_id and client_id=p_client_id and status in ('queued','retry','running');
 return found;
end $$;

create or replace function public.creative_claim(p_job_id uuid default null)
returns setof public.creative_jobs language plpgsql security definer set search_path='' as $$
declare j public.creative_jobs;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente worker' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(239019901);
 update public.creative_jobs set status='failed',error_code='RETRY_EXHAUSTED',message='Limite de tentativas atingido',lease_token=null,updated_at=now()
 where status in ('retry','running') and attempts>=3 and (lease_until is null or lease_until<now());
 select q.* into j from public.creative_jobs q where
   (p_job_id is null or q.id=p_job_id) and q.run_after<=now() and q.attempts<3
   and (q.status in ('queued','retry') or (q.status='running' and q.lease_until<now()))
   and public.creative_allowed(q.client_id,true)
   and (select count(*) from public.creative_jobs r where r.client_id=q.client_id and r.status='running' and r.lease_until>now())<2
   order by q.run_after,q.created_at for update skip locked limit 1;
 if j.id is null then return; end if;
 return query update public.creative_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',message='Worker iniciou o processamento',updated_at=now()
 where id=j.id returning *;
end $$;

create or replace function public.creative_heartbeat(p_job_id uuid,p_lease uuid,p_progress integer,p_message text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente worker' using errcode='42501'; end if;
 update public.creative_jobs set progress=greatest(progress,least(99,greatest(0,p_progress))),message=left(p_message,240),lease_until=now()+interval '5 minutes',updated_at=now()
 where id=p_job_id and lease_token=p_lease and status='running' and lease_until>now() and public.creative_allowed(client_id,true);
 return found;
end $$;

create or replace function public.creative_reserve_cost(p_job_id uuid,p_lease uuid,p_request_key text,p_model text,p_phase text,p_ceiling numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.creative_jobs; u uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente worker' using errcode='42501'; end if;
 select * into j from public.creative_jobs where id=p_job_id for update;
 if j.status<>'running' or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'Lease inválido'; end if;
 if p_ceiling<=0 or j.cost_usd+j.reserved_usd+p_ceiling>j.budget_usd then raise exception 'Orçamento do trabalho insuficiente'; end if;
 if exists(select 1 from public.creative_usage where job_id=p_job_id and request_key=p_request_key) then raise exception 'Chamada já reservada; não repetir cobrança sem reconciliação'; end if;
 insert into public.creative_usage(client_id,job_id,request_key,model,phase,reserved_usd) values(j.client_id,j.id,p_request_key,p_model,p_phase,p_ceiling) returning id into u;
 update public.creative_jobs set reserved_usd=reserved_usd+p_ceiling where id=j.id;
 return u;
end $$;
create or replace function public.creative_settle_cost(p_usage_id uuid,p_cost numeric,p_usage jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare u public.creative_usage;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente worker' using errcode='42501'; end if;
 select * into u from public.creative_usage where id=p_usage_id for update;
 if not found or u.status='settled' or p_cost<0 then return false; end if;
 update public.creative_usage set status='settled',cost_usd=p_cost,usage=p_usage where id=u.id;
 update public.creative_jobs set reserved_usd=greatest(0,reserved_usd-u.reserved_usd),cost_usd=cost_usd+p_cost where id=u.job_id;
 return true;
end $$;

create or replace function public.creative_finish(p_job_id uuid,p_lease uuid,p_output jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare j public.creative_jobs; a uuid; st public.creative_structures; s public.creative_sources;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente worker' using errcode='42501'; end if;
 select * into j from public.creative_jobs where id=p_job_id for update;
 if not found or j.status<>'running' or j.lease_token is distinct from p_lease or j.lease_until<=now() or not public.creative_allowed(j.client_id,true) then return false; end if;
 if j.kind='analyse' then
   select * into s from public.creative_sources where id=j.source_id and client_id=j.client_id;
   if jsonb_typeof(p_output->'asset_ids')<>'array' or not exists(
     select 1 from public.creative_assets x where x.client_id=j.client_id and x.account_id=j.account_id and x.source_id=j.source_id and p_output->'asset_ids' ? x.id::text
   ) then raise exception 'Análise sem arquivos privados efetivamente adquiridos'; end if;
   if p_output->'result'->>'format' is distinct from s.format or p_output->'coverage'->>'status' not in ('completa','parcial') then raise exception 'Resultado inválido'; end if;
   if p_output->'coverage'->>'status'='completa' and (
     (s.format='carrossel' and (coalesce((p_output->'coverage'->>'expected_assets')::int,0)<2 or p_output->'coverage'->>'expected_assets' is distinct from p_output->'coverage'->>'acquired_assets' or p_output->'coverage'->>'expected_assets' is distinct from p_output->'coverage'->>'analysed_assets' or p_output->'coverage'->>'visual_method'<>'all_slides'))
     or (s.format='reels' and p_output->'coverage'->>'visual_method'<>'native_video')
   ) then raise exception 'Cobertura não permite análise completa'; end if;
   if p_output->'coverage'->>'status'='completa' and s.format='carrossel' and (
     (select count(distinct position) from public.creative_assets x where x.client_id=j.client_id and x.account_id=j.account_id and x.source_id=j.source_id and x.kind='image' and p_output->'asset_ids' ? x.id::text)<>(p_output->'coverage'->>'expected_assets')::int
     or jsonb_array_length(p_output->'result'->'slides')<>(p_output->'coverage'->>'expected_assets')::int
   ) then raise exception 'Slides ausentes na evidência da análise'; end if;
   insert into public.creative_analyses(client_id,account_id,source_id,job_id,version,model,coverage,result,transcript,cost_usd)
   values(j.client_id,j.account_id,j.source_id,j.id,p_output->>'version',p_output->>'model',p_output->'coverage',p_output->'result',coalesce(p_output->'transcript','[]'),j.cost_usd) returning id into a;
   insert into public.creative_structures(client_id,account_id,source_id,analysis_id,title,theme,format,dna,evidence)
   values(j.client_id,j.account_id,j.source_id,a,s.title,p_output->'result'->>'original_theme',s.format,p_output->'result'->'dna',coalesce(p_output->'performance','{}'));
 elsif j.kind='adapt' then
   select * into st from public.creative_structures where id=(j.input->>'structure_id')::uuid and client_id=j.client_id and account_id=j.account_id;
   if not found or p_output->'document'->>'format' is distinct from st.format then raise exception 'Adaptação inválida'; end if;
   insert into public.creative_adaptations(client_id,account_id,structure_id,analysis_id,job_id,document,model)
   values(j.client_id,j.account_id,st.id,st.analysis_id,j.id,p_output->'document',p_output->>'model') returning id into a;
 end if;
 update public.creative_jobs set status='completed',progress=100,message='Concluído',output=p_output || jsonb_build_object('record_id',a),lease_token=null,lease_until=null,updated_at=now() where id=j.id;
 return true;
end $$;

create or replace function public.creative_fail(p_job_id uuid,p_lease uuid,p_code text,p_message text,p_retry boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente worker' using errcode='42501'; end if;
 update public.creative_jobs set status=case when p_retry and attempts<3 then 'retry' else 'failed' end,error_code=left(p_code,80),message=left(p_message,240),
 lease_token=null,lease_until=null,run_after=now()+make_interval(secs=>least(1800,60*power(2,attempts)::int)),updated_at=now()
 where id=p_job_id and lease_token=p_lease and status='running' and lease_until>now();
 return found;
end $$;

create or replace function public.creative_to_pauta(p_client_id uuid,p_adaptation_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.creative_adaptations; p uuid; d jsonb; obj text; script jsonb;
begin
 if not public.creative_allowed(p_client_id,true) then raise exception 'Sem permissão' using errcode='42501'; end if;
 select * into a from public.creative_adaptations where id=p_adaptation_id and client_id=p_client_id for update;
 if not found then raise exception 'Adaptação indisponível'; end if;
 if a.pauta_id is not null then return a.pauta_id; end if;
 d:=a.document; obj:=d->>'objective';
 if obj in ('compartilhamento','seguidores') then obj:='alcance'; end if;
 select jsonb_agg(to_jsonb((u->>'copy') || E'\nImagem: ' || (u->>'image_brief') || E'\nLayout: ' || (u->>'layout_brief') || E'\nGravação: ' || (u->>'recording_brief') || E'\nEdição: ' || (u->>'editing_brief')) order by (u->>'position')::int) into script from jsonb_array_elements(d->'units') u;
 insert into public.pautas_conteudo(client_id,ideia_id,titulo,formato,objetivo,status,origem_tipo,origem_texto,gancho,roteiro,cta,aviso)
 values(p_client_id,'creative:'||a.id,d->>'title',d->>'format',obj,'escolhida','dado','Inteligência Criativa: estrutura '||a.structure_id,d->>'hook',script,d->>'cta','Revisar precisão médica e regras de publicidade antes de publicar.')
 on conflict(client_id,ideia_id) where ideia_id is not null do nothing returning id into p;
 if p is null then select id into p from public.pautas_conteudo where client_id=p_client_id and ideia_id='creative:'||a.id; end if;
 update public.creative_adaptations set pauta_id=p where id=a.id;
 -- A adaptação permanece documento versionado; criar pauta não declara publicação.
 return p;
end $$;

create or replace function public.creative_link_publication(p_client_id uuid,p_adaptation_id uuid,p_post_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare a public.creative_adaptations; p public.instagram_posts; d integer;
begin
 if not public.creative_allowed(p_client_id,true) then raise exception 'Sem permissão' using errcode='42501'; end if;
 select * into a from public.creative_adaptations where id=p_adaptation_id and client_id=p_client_id for update;
 if not found then raise exception 'Adaptação indisponível'; end if;
 if a.published_post_id is not null and a.published_post_id<>p_post_id then raise exception 'Publicação já vinculada; revisão administrativa necessária'; end if;
 select * into p from public.instagram_posts where id=p_post_id and client_id=p_client_id and instagram_account_id=a.account_id;
 if not found or p.format is distinct from a.document->>'format' or p.posted_at is null or p.posted_at<a.created_at then raise exception 'Publicação incompatível com esta adaptação'; end if;
 update public.creative_adaptations set published_post_id=p.id where id=a.id;
 if a.pauta_id is not null then update public.pautas_conteudo set post_id=p.id,status='publicada',atualizado_em=now() where id=a.pauta_id and client_id=p_client_id; end if;
 update public.creative_structures set state=case when state='candidata' then 'em_teste' else state end where id=a.structure_id and client_id=p_client_id;
 foreach d in array array[1,3,7,28] loop
   insert into public.creative_jobs(client_id,account_id,source_id,kind,input,idempotency_key,run_after)
   values(p_client_id,a.account_id,null,'measure',jsonb_build_object('adaptation_id',a.id,'post_id',p.id,'window_day',d),'measure:'||a.id||':'||d,p.posted_at+make_interval(days=>d)) on conflict(client_id,idempotency_key) do nothing;
 end loop;
 return true;
end $$;

create or replace function public.creative_search(p_client_id uuid,p_account_id uuid,p_query text,p_embedding real[] default null)
returns table(id uuid,similarity double precision) language plpgsql stable security definer set search_path='' as $$
begin
 if not public.creative_allowed(p_client_id,false) then raise exception 'Sem permissão' using errcode='42501'; end if;
 if length(p_query)>500 or array_length(p_embedding,1)>3072 then raise exception 'Busca inválida'; end if;
 return query select s.id, case when p_embedding is not null and s.embedding is not null and array_length(s.embedding,1)=array_length(p_embedding,1)
 then (select sum(x*y)/nullif(sqrt(sum(x*x))*sqrt(sum(y*y)),0) from unnest(s.embedding,p_embedding) as v(x,y))::double precision
 else ts_rank(to_tsvector('portuguese',s.title||' '||s.theme||' '||s.dna::text),plainto_tsquery('portuguese',p_query))::double precision end as similarity
 from public.creative_structures s where s.client_id=p_client_id and s.account_id=p_account_id
 and (p_embedding is not null or to_tsvector('portuguese',s.title||' '||s.theme||' '||s.dna::text) @@ plainto_tsquery('portuguese',p_query))
 order by similarity desc nulls last,s.created_at desc limit 30;
end $$;

-- RPCs de navegador usam o usuário real. RPCs de worker nunca são concedidas ao navegador.
revoke all on function public.creative_worker_health(),public.creative_enqueue(uuid,text,jsonb,text),public.creative_cancel(uuid,uuid),public.creative_to_pauta(uuid,uuid),public.creative_link_publication(uuid,uuid,uuid),public.creative_search(uuid,uuid,text,real[]) from public,anon;
grant execute on function public.creative_worker_health(),public.creative_enqueue(uuid,text,jsonb,text),public.creative_cancel(uuid,uuid),public.creative_to_pauta(uuid,uuid),public.creative_link_publication(uuid,uuid,uuid),public.creative_search(uuid,uuid,text,real[]) to authenticated,service_role;
revoke all on function public.creative_claim(uuid),public.creative_heartbeat(uuid,uuid,integer,text),public.creative_reserve_cost(uuid,uuid,text,text,text,numeric),public.creative_settle_cost(uuid,numeric,jsonb),public.creative_finish(uuid,uuid,jsonb),public.creative_fail(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.creative_claim(uuid),public.creative_heartbeat(uuid,uuid,integer,text),public.creative_reserve_cost(uuid,uuid,text,text,text,numeric),public.creative_settle_cost(uuid,numeric,jsonb),public.creative_finish(uuid,uuid,jsonb),public.creative_fail(uuid,uuid,text,text,boolean) to service_role;
