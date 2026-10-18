-- Reforços aditivos após homologação inicial: concorrência, orçamento e integridade da conta.
create unique index creative_active_source_analysis on public.creative_jobs(client_id,account_id,source_id) where kind='analyse' and status in ('queued','running','retry');
create unique index creative_jobs_account_identity on public.creative_jobs(client_id,account_id,id);
create unique index creative_analysis_source_identity on public.creative_analyses(client_id,account_id,source_id,id);
create unique index creative_structure_analysis_identity on public.creative_structures(client_id,account_id,id,analysis_id);
create unique index creative_adaptation_publication_identity on public.creative_adaptations(client_id,account_id,id,published_post_id);
alter table public.creative_analyses add constraint creative_analysis_job_account foreign key(client_id,account_id,job_id) references public.creative_jobs(client_id,account_id,id);
alter table public.creative_structures add constraint creative_structure_source_analysis foreign key(client_id,account_id,source_id,analysis_id) references public.creative_analyses(client_id,account_id,source_id,id);
alter table public.creative_adaptations add constraint creative_adaptation_structure_analysis foreign key(client_id,account_id,structure_id,analysis_id) references public.creative_structures(client_id,account_id,id,analysis_id);
alter table public.creative_adaptations add constraint creative_adaptation_job_account foreign key(client_id,account_id,job_id) references public.creative_jobs(client_id,account_id,id);
alter table public.creative_metric_observations add constraint creative_observation_linked_publication foreign key(client_id,account_id,adaptation_id,post_id) references public.creative_adaptations(client_id,account_id,id,published_post_id);
alter table public.creative_discoveries add constraint creative_discovery_job_account foreign key(client_id,account_id,job_id) references public.creative_jobs(client_id,account_id,id);


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
 if p_kind='analyse' then
   select id into existing from public.creative_jobs where client_id=p_client_id and account_id=a and source_id=s and kind='analyse' and status in ('queued','running','retry');
   if existing is not null then return existing; end if;
 end if;
 insert into public.creative_jobs(client_id,account_id,source_id,kind,input,idempotency_key)
 values(p_client_id,a,s,p_kind,p_input,p_request_key) returning id into j;
 return j;
end $$;

create or replace function public.creative_reserve_cost(p_job_id uuid,p_lease uuid,p_request_key text,p_model text,p_phase text,p_ceiling numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare j public.creative_jobs; u uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente worker' using errcode='42501'; end if;
 select * into j from public.creative_jobs where id=p_job_id for update;
 if j.status<>'running' or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'Lease inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(j.client_id::text,1902));
 if p_ceiling is null or p_ceiling::text in ('NaN','Infinity','-Infinity') then raise exception 'Reserva inválida'; end if;
 if (select coalesce(sum(cost_usd+reserved_usd),0) from public.creative_jobs where client_id=j.client_id and created_at>=current_date)+p_ceiling>10 then raise exception 'Orçamento diário do cliente insuficiente'; end if;
 if p_ceiling<=0 or j.cost_usd+j.reserved_usd+p_ceiling>j.budget_usd then raise exception 'Orçamento do trabalho insuficiente'; end if;
 if exists(select 1 from public.creative_usage where job_id=p_job_id and request_key=p_request_key) then raise exception 'Chamada já reservada; não repetir cobrança sem reconciliação'; end if;
 insert into public.creative_usage(client_id,job_id,request_key,model,phase,reserved_usd) values(j.client_id,j.id,p_request_key,p_model,p_phase,p_ceiling) returning id into u;
 update public.creative_jobs set reserved_usd=reserved_usd+p_ceiling where id=j.id;
 return u;
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
   if s.format='reels' and p_output->'coverage'->>'status'='completa' and (
      coalesce((p_output->'coverage'->>'duration_seconds')::numeric,0)<=0
      or coalesce((p_output->'coverage'->>'audio_processed_seconds')::numeric,0)<(p_output->'coverage'->>'duration_seconds')::numeric-0.1
      or coalesce((p_output->'coverage'->>'visual_processed_seconds')::numeric,0)<(p_output->'coverage'->>'duration_seconds')::numeric-0.1
      or jsonb_array_length(p_output->'result'->'scenes')=0
      or not exists(select 1 from public.creative_assets x where x.client_id=j.client_id and x.account_id=j.account_id and x.source_id=j.source_id and x.kind='video' and x.duration_seconds>0 and p_output->'asset_ids' ? x.id::text)
   ) then raise exception 'Vídeo completo exige áudio, duração e evidências visuais integrais'; end if;
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
