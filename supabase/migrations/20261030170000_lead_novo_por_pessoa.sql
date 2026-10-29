-- Lead novo = PESSOA nova, não card. Definição aprovada na auditoria de CRM (29/10/2026):
--   "Lead novo: o primeiro registro da pessoa no período, em funil de captação. Não conta quem já tinha registro antes
--    (recorrente), quem é paciente da casa, card apagado, nem funil de compra ou lista de base."
-- Casos que motivaram:
--   - Dr. Sergio Maia: cada orçamento é um card; em 30 dias, 216 cards eram 98 pessoas e só 15 eram novas.
--   - Doctor Creator: os funis de compra da Hubla ("Compras em aberto", "Assinaturas ativas", "Abandono de carrinho",
--     "Reembolso"...) somavam ~500 "leads" em 90 dias, mas são o registro de quem comprou, não captação.
--   - Dra. Samira, Dra. Juliana Carrion, HOMS: "ganho" marcado sem valor nenhum, que na prática é agendamento.
--
-- O que muda:
--   1. crm_funil_papel: o papel de cada funil (captacao, venda, operacional, compra, base). Sem linha = captação.
--      Só compra e base saem da contagem de lead novo: no Kommo e na Clint o card MUDA de funil, então tirar um funil
--      de venda ou operacional tiraria leads que nasceram na captação e avançaram. A duplicata entre funis já some
--      pela contagem por pessoa.
--   2. Chave da pessoa (crm_chave_pessoa): telefone normalizado; sem telefone, o contato do CRM (FlwChat, Clint,
--      Kommo); sem nada, o próprio card.
--   3. crm_leads_resumo_periodo, crm_leads_por_dia_periodo, crm_pessoas_resumo_periodo,
--      crm_pessoas_novas_por_dia_periodo e o "leads" do roi_periodo passam a contar pessoas novas.
--      Ganhos e perdidos do resumo passam a contar pessoas (quem ganhou e perdeu no mesmo período conta como ganho).
--   4. qualidade_dados ganha o alerta "crm-ganho-sem-valor": 5 ou mais ganhos em 90 dias e menos da metade com valor.
--
-- Reversão: recriar as quatro funções crm_* como em 20261006150000 / 20261023170000, trocar de volta os dois trechos de
-- roi_periodo e o bloco de qualidade_dados (pares abaixo invertidos); drop function crm_pessoas_novas(uuid,date,date),
-- crm_pessoas_leads(uuid), crm_definir_papel_funil(uuid,text,text); drop trigger crm_leads_chave_pessoa on crm_leads;
-- drop function crm_leads_chave_pessoa_gatilho(), crm_chave_pessoa(text,jsonb,text,text,uuid);
-- alter table crm_leads drop column chave_pessoa; drop table crm_funil_papel.

create table if not exists public.crm_funil_papel (
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  pipeline_id text not null,
  papel text not null check (papel in ('captacao', 'venda', 'operacional', 'compra', 'base')),
  definido_por text not null default 'regra' check (definido_por in ('regra', 'equipe')),
  atualizado_em timestamptz not null default now(),
  primary key (crm_connection_id, pipeline_id)
);
alter table public.crm_funil_papel enable row level security;
revoke all on table public.crm_funil_papel from public, anon, authenticated;
grant select on table public.crm_funil_papel to authenticated;
grant select, insert, update, delete on table public.crm_funil_papel to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'crm_funil_papel' and policyname = 'crm_funil_papel_admin') then
    create policy crm_funil_papel_admin on public.crm_funil_papel for select to authenticated using (public.is_app_admin());
  end if;
end $$;
comment on table public.crm_funil_papel is 'Papel de cada funil do CRM. Sem linha = captação. Compra e base não contam como lead novo.';

-- Regra inicial pelo nome do funil (a equipe pode trocar com crm_definir_papel_funil; o que a equipe definiu não é
-- sobrescrito pela regra).
insert into public.crm_funil_papel (crm_connection_id, pipeline_id, papel)
select distinct s.crm_connection_id, s.pipeline_id,
  case
    when s.pipeline_name ~* '(reativa[cç][aã]o|resgate|base antiga)' then 'base'   -- antes de compra: "Recompra e Reativação"
    when s.pipeline_name ~* '(compra|assinatura|carrinho|cart[aã]o recusado|reembolso|chargeback|upsell)' then 'compra'
    when s.pipeline_name ~* '(gest[aã]o interna|confirma[cç][aã]o|acompanhamento|atendimento cl[ií]nico|jornada cir[uú]rgica|programa de benef)' then 'operacional'
    when s.pipeline_name ~* '(comercial|procedimento|or[cç]amento)' then 'venda'
  end
from public.crm_pipeline_statuses s
where s.pipeline_name ~* '(compra|assinatura|carrinho|cart[aã]o recusado|reembolso|chargeback|upsell|reativa[cç][aã]o|resgate|base antiga|gest[aã]o interna|confirma[cç][aã]o|acompanhamento|atendimento cl[ií]nico|jornada cir[uú]rgica|programa de benef|comercial|procedimento|or[cç]amento)'
on conflict (crm_connection_id, pipeline_id) do update set papel = excluded.papel, atualizado_em = now()
  where public.crm_funil_papel.definido_por = 'regra';

create or replace function public.crm_definir_papel_funil(p_connection_id uuid, p_pipeline_id text, p_papel text)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.is_app_admin() then raise exception 'apenas a equipe Doctor Creator'; end if;
  if p_papel not in ('captacao', 'venda', 'operacional', 'compra', 'base') then raise exception 'papel invalido'; end if;
  insert into crm_funil_papel (crm_connection_id, pipeline_id, papel, definido_por)
  values (p_connection_id, p_pipeline_id, p_papel, 'equipe')
  on conflict (crm_connection_id, pipeline_id) do update set papel = excluded.papel, definido_por = 'equipe', atualizado_em = now();
end;
$$;
revoke all on function public.crm_definir_papel_funil(uuid, text, text) from public, anon;
grant execute on function public.crm_definir_papel_funil(uuid, text, text) to authenticated;

-- Quem é a pessoa do card.
create or replace function public.crm_chave_pessoa(p_provider text, p_raw jsonb, p_phone text, p_external_id text, p_connection_id uuid)
returns text
language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    't:' || public.chave_telefone(p_phone),
    case when p_provider = 'flwchat' then 'f:' || (p_raw->'contactIds'->>0) end,
    case when p_provider = 'clint' then 'c:' || (p_raw->'contact'->>'id') end,
    case when p_provider = 'kommo' then 'k:' || (p_raw->'_embedded'->'contacts'->0->>'id') end,
    'l:' || p_connection_id::text || ':' || p_external_id
  );
$$;
revoke all on function public.crm_chave_pessoa(text, jsonb, text, text, uuid) from public, anon;
grant execute on function public.crm_chave_pessoa(text, jsonb, text, text, uuid) to authenticated, service_role;

-- A chave fica gravada no card (calcular card a card na consulta levava 5 s na Dra. Lana, com 20 mil cards).
alter table public.crm_leads add column if not exists chave_pessoa text;
create or replace function public.crm_leads_chave_pessoa_gatilho()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.chave_pessoa := public.crm_chave_pessoa(new.provider, new.raw_payload, new.contact_phone, new.external_lead_id, new.crm_connection_id);
  return new;
end;
$$;
revoke all on function public.crm_leads_chave_pessoa_gatilho() from public, anon, authenticated;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'crm_leads_chave_pessoa' and tgrelid = 'public.crm_leads'::regclass) then
    create trigger crm_leads_chave_pessoa before insert or update of provider, raw_payload, contact_phone, external_lead_id, crm_connection_id
      on public.crm_leads for each row execute function public.crm_leads_chave_pessoa_gatilho();
  end if;
end $$;
update public.crm_leads
   set chave_pessoa = public.crm_chave_pessoa(provider, raw_payload, contact_phone, external_lead_id, crm_connection_id)
 where chave_pessoa is null;
create index if not exists crm_leads_cliente_pessoa_idx on public.crm_leads (client_id, chave_pessoa) where removido_na_origem is null;

-- Todos os cards vivos do cliente, com a pessoa e o que importa para contar. Uso interno (sem acesso direto).
create or replace function public.crm_pessoas_leads(p_client_id uuid)
returns table(pk text, d date, conta boolean, paciente_antigo boolean, outcome text, price numeric, tem_origem boolean)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(cl.chave_pessoa, public.crm_chave_pessoa(cl.provider, cl.raw_payload, cl.contact_phone, cl.external_lead_id, cl.crm_connection_id)),
         (cl.occurred_at at time zone 'America/Sao_Paulo')::date,
         coalesce(fp.papel, 'captacao') not in ('compra', 'base'),
         coalesce(cl.source = 'Paciente antigo', false),
         cl.outcome, cl.price,
         nullif(btrim(cl.source), '') is not null
  from crm_leads cl
  left join crm_funil_papel fp on fp.crm_connection_id = cl.crm_connection_id and fp.pipeline_id = cl.pipeline_id
  where cl.client_id = p_client_id
    and cl.removido_na_origem is null
    and cl.occurred_at is not null;
$$;
revoke all on function public.crm_pessoas_leads(uuid) from public, anon, authenticated;

-- Pessoas novas no período: primeiro registro da pessoa dentro do período, em funil que conta, e que não é paciente
-- da casa. com_origem: o primeiro registro tem origem.
create or replace function public.crm_pessoas_novas(p_client_id uuid, p_from date, p_to date)
returns table(pk text, primeiro date, com_origem boolean)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  -- Uma passada com janela: juntar a lista com ela mesma levava 4 s na Dra. Lana.
  select x.pk, x.primeiro, bool_or(x.tem_origem)
  from (
    select b.pk, b.d, b.conta, b.tem_origem,
           min(b.d) over (partition by b.pk) as primeiro,
           bool_or(b.paciente_antigo) over (partition by b.pk) as pa
    from public.crm_pessoas_leads(p_client_id) b
  ) x
  where x.d = x.primeiro and x.primeiro between p_from and p_to
  group by x.pk, x.primeiro
  having bool_or(x.conta) and not bool_or(x.pa);
$$;
revoke all on function public.crm_pessoas_novas(uuid, date, date) from public, anon, authenticated;

create or replace function public.crm_leads_resumo_periodo(p_client_id uuid, p_from date, p_to date)
returns table(novos bigint, ganhos bigint, perdidos bigint, valor numeric)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  per as (select * from public.crm_pessoas_leads(p_client_id) b where b.d between p_from and p_to and (select pode from ok)),
  ganhou as (select distinct pk from per where outcome = 'won')
  select
    (select count(*) from public.crm_pessoas_novas(p_client_id, p_from, p_to) where (select pode from ok)),
    (select count(*) from ganhou),
    (select count(distinct pk) from per where outcome = 'lost' and pk not in (select pk from ganhou)),
    coalesce((select sum(price) from per), 0);
$$;

create or replace function public.crm_leads_por_dia_periodo(p_client_id uuid, p_from date, p_to date)
returns table(dia date, total bigint)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select n.primeiro as dia, count(*) as total
  from public.crm_pessoas_novas(p_client_id, p_from, p_to) n
  where public.is_app_admin() or public.is_client_member(p_client_id)
  group by 1
  order by 1;
$$;

create or replace function public.crm_pessoas_resumo_periodo(p_client_id uuid, p_from date, p_to date)
returns table(
  cards bigint, pessoas bigint, pessoas_novas bigint, pessoas_recorrentes bigint, cards_de_recorrentes bigint,
  ganhos bigint, perdidos bigint, abertos bigint, valor numeric, valor_ganho numeric, max_cards_por_pessoa bigint
)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  per as (select * from public.crm_pessoas_leads(p_client_id) b where b.d between p_from and p_to and (select pode from ok)),
  novas as (select pk from public.crm_pessoas_novas(p_client_id, p_from, p_to) where (select pode from ok)),
  por_pessoa as (select pk, count(*) as n from per group by pk)
  select
    (select count(*) from per),
    (select count(*) from por_pessoa),
    (select count(*) from novas),
    (select count(*) from por_pessoa where pk not in (select pk from novas)),
    coalesce((select sum(n) from por_pessoa where pk not in (select pk from novas)), 0)::bigint,
    (select count(*) from per where outcome = 'won'),
    (select count(*) from per where outcome = 'lost'),
    (select count(*) from per where outcome is distinct from 'won' and outcome is distinct from 'lost'),
    coalesce((select sum(price) from per), 0),
    coalesce((select sum(price) from per where outcome = 'won'), 0),
    coalesce((select max(n) from por_pessoa), 0);
$$;

create or replace function public.crm_pessoas_novas_por_dia_periodo(p_client_id uuid, p_from date, p_to date)
returns table(dia date, pessoas_novas bigint, cards bigint)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  dias as (
    select b.d, count(*) as cards from public.crm_pessoas_leads(p_client_id) b
    where b.d between p_from and p_to and (select pode from ok) group by b.d
  ),
  novas as (
    select primeiro as d, count(*) as n from public.crm_pessoas_novas(p_client_id, p_from, p_to)
    where (select pode from ok) group by primeiro
  )
  select dias.d, coalesce(novas.n, 0), dias.cards
  from dias left join novas using (d)
  order by dias.d;
$$;

revoke all on function public.crm_leads_resumo_periodo(uuid, date, date) from public, anon;
revoke all on function public.crm_leads_por_dia_periodo(uuid, date, date) from public, anon;
revoke all on function public.crm_pessoas_resumo_periodo(uuid, date, date) from public, anon;
revoke all on function public.crm_pessoas_novas_por_dia_periodo(uuid, date, date) from public, anon;
grant execute on function public.crm_leads_resumo_periodo(uuid, date, date) to authenticated, service_role;
grant execute on function public.crm_leads_por_dia_periodo(uuid, date, date) to authenticated, service_role;
grant execute on function public.crm_pessoas_resumo_periodo(uuid, date, date) to authenticated, service_role;
grant execute on function public.crm_pessoas_novas_por_dia_periodo(uuid, date, date) to authenticated, service_role;

-- roi_periodo: leads e leads com origem passam a ser pessoas novas.
do $migra$
declare
  def text := pg_get_functiondef('public.roi_periodo(uuid,date,date)'::regprocedure);
  a1 text := '''leads'', (select count(*) from l),';
  n1 text := '''leads'', (select count(*) from public.crm_pessoas_novas(p_client_id, p_de, p_ate)),';
  a2 text := '''leads_com_origem'', (select count(*) from l where coalesce(source, '''') <> ''''),';
  n2 text := '''leads_com_origem'', (select count(*) from public.crm_pessoas_novas(p_client_id, p_de, p_ate) where com_origem),';
begin
  if position(n1 in def) > 0 then return; end if;
  if position(a1 in def) = 0 or position(a2 in def) = 0 then
    raise exception 'roi_periodo: trechos de leads não encontrados; revisar a migration';
  end if;
  execute replace(replace(def, a1, n1), a2, n2);
end
$migra$;

-- qualidade_dados: ganho sem valor (provável agendamento marcado como ganho).
do $migra$
declare
  def text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  antigo text := '  -- Conferência diária contra o CRM ao vivo (crm_conferencia).';
  novo text := '  -- Ganho sem valor: 5 ou mais ganhos em 90 dias e menos da metade com valor. Na prática é agendamento.
  for r in
    select count(*) filter (where l.outcome = ''won'') as g,
           count(*) filter (where l.outcome = ''won'' and l.price > 0) as gv
    from crm_leads l
    where l.client_id = p_client_id and l.removido_na_origem is null and l.occurred_at >= now() - interval ''90 days''
  loop
    if r.g >= 5 and r.gv * 2 < r.g then
      out := out || jsonb_build_object(
        ''id'', ''crm-ganho-sem-valor'', ''fonte'', ''crm'', ''severidade'', ''media'',
        ''titulo'', format(''%s de %s ganhos dos últimos 90 dias estão sem valor'', r.g - r.gv, r.g),
        ''evidencia'', format(''%s leads marcados como ganho em 90 dias; só %s têm valor preenchido.'', r.g, r.gv),
        ''causa'', ''A equipe marca como ganho quem agendou, antes do pagamento, ou fecha a venda sem preencher o valor.'',
        ''correcao'', ''Marcar ganho só quando o paciente pagar e preencher o valor. Para o agendamento, usar uma etapa "Agendado".'',
        ''responsavel'', ''comercial'',
        ''afeta'', ''Vendas, ticket médio e retorno do investimento.'');
    end if;
  end loop;

  -- Conferência diária contra o CRM ao vivo (crm_conferencia).';
begin
  if position('crm-ganho-sem-valor' in def) > 0 then return; end if;
  if position(antigo in def) = 0 then
    raise exception 'qualidade_dados: trecho da conferência não encontrado; revisar a migration';
  end if;
  execute replace(def, antigo, novo);
end
$migra$;
