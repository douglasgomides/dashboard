-- Criada com supabase migration new. A versão foi ordenada após a última
-- migração existente (que já tinha data futura), sem reescrever o histórico.
-- Somente DDL: não altera registros existentes de clínicas ou pacientes.

-- Mantém a assinatura antiga para abas já abertas; o novo consumidor informa
-- os dois limites. Contagens não podem incluir dias posteriores ao selecionado.
create or replace function public.links_funil(p_client_id uuid,p_desde timestamptz,p_antes_de timestamptz)
returns table(link_id uuid,cliques bigint,conversas bigint,provaveis bigint,agendou bigint,vendas bigint,receita numeric)
language sql stable security definer set search_path='' as $fn$
 with ls as (
   select l.id from public.links_rastreados l where l.client_id=p_client_id
     and (public.is_app_admin() or public.is_client_member(p_client_id)) and p_antes_de>p_desde
 ), cl as (
   select k.link_id,count(*) n from public.link_cliques k join ls on ls.id=k.link_id
   where k.em>=p_desde and k.em<p_antes_de group by k.link_id
 ), cv as (
   select c.id,c.link_id,c.pessoa_id,c.lead_id,c.iniciada_em,c.atribuicao from public.conversas c join ls on ls.id=c.link_id
   where c.client_id=p_client_id and coalesce(c.iniciada_em,c.ultima_msg_em)>=p_desde
     and coalesce(c.iniciada_em,c.ultima_msg_em)<p_antes_de
 ), ag as (
   select cv.id from cv where exists(select 1 from public.conversas_resumos r where r.conversa_id=cv.id
     and (r.resumo->>'situacao'='agendou' or r.resumo->>'etapa'='agendou'))
 ), ganhos as (
   -- Um lead ligado a várias conversas do mesmo link conta uma única vez.
   select distinct cv.link_id,l.id,l.price from cv join public.crm_leads l
     on l.client_id=p_client_id and l.removido_na_origem is null
     and (l.id=cv.lead_id or (cv.pessoa_id is not null and l.pessoa_id=cv.pessoa_id))
   where exists(select 1 from public.crm_lead_eventos e where e.client_id=p_client_id
     and e.crm_connection_id=l.crm_connection_id and e.external_lead_id=l.external_lead_id and e.tipo='ganhou'
     and e.ocorreu_em>=greatest(p_desde,coalesce(cv.iniciada_em,p_desde)) and e.ocorreu_em<p_antes_de)
 ), vd as (select g.link_id,count(*) n,coalesce(sum(g.price),0) receita from ganhos g group by g.link_id)
 select ls.id,coalesce((select n from cl where cl.link_id=ls.id),0),
   (select count(*) from cv where cv.link_id=ls.id),
   (select count(*) from cv where cv.link_id=ls.id and cv.atribuicao='horario'),
   (select count(*) from cv where cv.link_id=ls.id and cv.id in(select id from ag)),
   coalesce((select n from vd where vd.link_id=ls.id),0),coalesce((select vd.receita from vd where vd.link_id=ls.id),0)
 from ls;
$fn$;
revoke all on function public.links_funil(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.links_funil(uuid,timestamptz,timestamptz) to authenticated,service_role;

-- A reserva é persistida ANTES da chamada paga. Pedidos concorrentes da mesma
-- clínica compartilham um lock; falha ou interrupção não libera orçamento gasto.
create table public.creative_arte_reservas (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 adaptation_id uuid not null,
 position integer not null check(position>0),
 valor_usd numeric not null check(valor_usd>0 and valor_usd<=1),
 criado_em timestamptz not null default now(),
 encerrado_em timestamptz,
 execucao_id bigint unique references public.ia_execucoes(id) on delete restrict,
 foreign key(client_id,adaptation_id) references public.creative_adaptations(client_id,id) on delete cascade
);
create index creative_arte_reservas_cliente_dia on public.creative_arte_reservas(client_id,criado_em);
create index creative_arte_reservas_adaptacao on public.creative_arte_reservas(adaptation_id,position) where encerrado_em is null;
create index creative_arte_reservas_tenant on public.creative_arte_reservas(client_id,adaptation_id);
alter table public.creative_arte_reservas enable row level security;
revoke all on public.creative_arte_reservas from public,anon,authenticated;
grant all on public.creative_arte_reservas to service_role;

create function public.creative_arte_reservar(p_client_id uuid,p_adaptation_id uuid,p_positions integer[],p_valor_usd numeric)
returns table(id uuid,"position" integer) language plpgsql security definer set search_path='' as $fn$
declare a public.creative_adaptations; quantidade integer; gasto numeric; reservado numeric;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente servidor' using errcode='42501'; end if;
 if p_valor_usd is null or p_valor_usd<=0 or p_valor_usd>1 or coalesce(cardinality(p_positions),0) not between 1 and 12
   then raise exception 'Reserva inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text,239019902));
 select * into a from public.creative_adaptations x where x.id=p_adaptation_id and x.client_id=p_client_id;
 if not found then raise exception 'Adaptação não encontrada nesta clínica'; end if;
 select count(distinct x) into quantidade from unnest(p_positions) x;
 if quantidade<>cardinality(p_positions) or exists(select 1 from unnest(p_positions) p where not exists
   (select 1 from jsonb_array_elements(a.document->'units') u where (u->>'position')::integer=p))
   then raise exception 'Slides inválidos'; end if;
 if exists(select 1 from public.creative_arte_reservas r where r.adaptation_id=p_adaptation_id
   and r.client_id=p_client_id and r.position=any(p_positions) and r.encerrado_em is null and r.criado_em>now()-interval '10 minutes')
   then raise exception 'Estes slides já estão em processamento. Aguarde antes de solicitar novamente.'; end if;
 select coalesce(sum(i.custo_usd),0) into gasto from public.ia_execucoes i where i.client_id=p_client_id
   and i.finalidade='arte_criativa' and i.criado_em>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 select coalesce(sum(r.valor_usd),0) into reservado from public.creative_arte_reservas r where r.client_id=p_client_id
   and r.encerrado_em is null and r.criado_em>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
 if gasto+reservado+quantidade*p_valor_usd>10 then raise exception 'Teto diário de artes atingido, considerando trabalhos em andamento (US$ 10 por clínica).'; end if;
 return query insert into public.creative_arte_reservas as r(client_id,adaptation_id,position,valor_usd)
   select p_client_id,p_adaptation_id,p,p_valor_usd from unnest(p_positions) p returning r.id,r.position;
end;
$fn$;

create function public.creative_arte_finalizar(p_reserva uuid,p_custo_usd numeric,p_modelo text,p_ok boolean,p_erro text,p_ms integer)
returns boolean language plpgsql security definer set search_path='' as $fn$
declare r public.creative_arte_reservas; v_execucao bigint;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente servidor' using errcode='42501'; end if;
 select * into r from public.creative_arte_reservas where id=p_reserva for update;
 if not found then raise exception 'Reserva não encontrada'; end if;
 if r.encerrado_em is not null then return false; end if;
 if p_custo_usd is null or p_custo_usd<0 or p_custo_usd>r.valor_usd or p_ok is null then raise exception 'Custo inválido'; end if;
 insert into public.ia_execucoes(client_id,finalidade,modelo,tokens_entrada,tokens_saida,custo_usd,ok,erro,ms,criado_em)
 values(r.client_id,'arte_criativa',left(p_modelo,100),0,0,p_custo_usd,p_ok,left(p_erro,300),greatest(p_ms,0),r.criado_em)
 returning public.ia_execucoes.id into v_execucao;
 update public.creative_arte_reservas set encerrado_em=now(),execucao_id=v_execucao where id=r.id;
 return true;
end;
$fn$;
revoke all on function public.creative_arte_reservar(uuid,uuid,integer[],numeric) from public,anon,authenticated;
revoke all on function public.creative_arte_finalizar(uuid,numeric,text,boolean,text,integer) from public,anon,authenticated;
grant execute on function public.creative_arte_reservar(uuid,uuid,integer[],numeric) to service_role;
grant execute on function public.creative_arte_finalizar(uuid,numeric,text,boolean,text,integer) to service_role;
-- Limpeza de tentativas esgotadas também respeita o ID de uma execução específica.
CREATE OR REPLACE FUNCTION public.creative_claim(p_job_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF creative_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.creative_jobs;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Somente worker' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(239019901);
 update public.creative_jobs set status='failed',error_code='RETRY_EXHAUSTED',message='Limite de tentativas atingido',lease_token=null,updated_at=now()
 where (p_job_id is null or id=p_job_id) and status in ('retry','running') and attempts>=3 and (lease_until is null or lease_until<now());
 select q.* into j from public.creative_jobs q where
   (p_job_id is null or q.id=p_job_id) and q.run_after<=now() and q.attempts<3
   and (q.status in ('queued','retry') or (q.status='running' and q.lease_until<now()))
   and public.creative_allowed(q.client_id,true)
   and (select count(*) from public.creative_jobs r where r.client_id=q.client_id and r.status='running' and r.lease_until>now())<2
   order by q.run_after,q.created_at for update skip locked limit 1;
 if j.id is null then return; end if;
 return query update public.creative_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',message='Worker iniciou o processamento',updated_at=now()
 where id=j.id returning *;
end $function$;

