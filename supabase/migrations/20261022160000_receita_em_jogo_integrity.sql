-- Delta após 20261021170000: mantém os contratos da auditoria comercial sem
-- converter texto arbitrário da IA para boolean, sem valores monetários não
-- finitos e sem unir resumo de outro cliente. Nenhum dado é reescrito.
alter table public.clients add column if not exists ticket_medio numeric;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.clients'::regclass and conname='clients_ticket_medio_finite_positive') then
    alter table public.clients add constraint clients_ticket_medio_finite_positive
      check (ticket_medio is null or (ticket_medio > 0 and ticket_medio::text not in ('NaN','Infinity','-Infinity'))) not valid;
  end if;
end $$;

create or replace function public.receita_em_jogo(p_client uuid, p_de date, p_ate date)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with permitido as (select public.is_app_admin() or public.is_client_member(p_client) as ok),
  rec as (
    select count(*) as n
    from public.conversas c
    join public.conversas_resumos r on r.conversa_id = c.id and r.client_id = c.client_id
    cross join permitido
    where permitido.ok and c.client_id = p_client
      and (c.ultima_msg_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and coalesce(r.resumo->>'etapa', '') not in ('nao_e_paciente', 'agendou')
      and coalesce(r.resumo->>'situacao', '') <> 'agendou'
      -- Booleans JSON e suas representações textuais usuais são aceitos.
      -- Ausente: recuperável=false, comercial=true. Valor inválido não conta.
      and lower(btrim(coalesce(r.resumo->>'recuperavel', 'false'))) in ('true','t','yes','y','on','1')
      and lower(btrim(coalesce(r.resumo->>'comercial', 'true'))) in ('true','t','yes','y','on','1')
  ),
  crm_ordered as (
    select l.price, row_number() over (order by l.price) as pos, count(*) over () as n
    from public.crm_leads l cross join permitido
    where permitido.ok and l.client_id = p_client and l.outcome = 'won'
      and l.price > 0 and l.price::text not in ('NaN','Infinity','-Infinity')
      and l.removido_na_origem is null
      and coalesce(l.occurred_at, l.received_at) > now() - interval '365 days'
  ),
  crm as (
    -- Mediana em numeric: não converte tickets para double precision.
    select count(*) as n, avg(price) filter (where pos in ((n+1)/2, (n+2)/2)) as med
    from crm_ordered
  ),
  latest_sap as (
    select s.ticket_medio from public.sap_clinicas s cross join permitido
    where permitido.ok and s.client_id = p_client
    order by s.created_at desc nulls last, s.id desc limit 1
  ),
  candidates as (
    select c.ticket_medio as valor, 'equipe'::text as fonte, 1 as prioridade
    from public.clients c cross join permitido where permitido.ok and c.id = p_client
    union all select round(crm.med), 'crm', 2 from crm where crm.n >= 5
    union all select ticket_medio, 'sap', 3 from latest_sap
  ),
  t as (
    select valor, fonte from candidates
    where valor > 0 and valor::text not in ('NaN','Infinity','-Infinity')
    order by prioridade limit 1
  )
  select case when not (select ok from permitido) then null else jsonb_build_object(
    'recuperaveis', (select n from rec), 'ticket', (select valor from t),
    'fonte_ticket', (select fonte from t), 'vendas_crm', (select n from crm),
    'valor', (select n from rec) * (select valor from t)
  ) end;
$$;

create or replace function public.definir_ticket_cliente(p_client uuid, p_valor numeric)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_valor is not null and (p_valor <= 0 or p_valor::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'valor invalido';
  end if;
  update public.clients set ticket_medio = p_valor where id = p_client;
  if not found then raise exception 'cliente nao encontrado'; end if;
end;
$$;
revoke all on function public.receita_em_jogo(uuid,date,date), public.definir_ticket_cliente(uuid,numeric) from public, anon;
grant execute on function public.receita_em_jogo(uuid,date,date), public.definir_ticket_cliente(uuid,numeric) to authenticated, service_role;
