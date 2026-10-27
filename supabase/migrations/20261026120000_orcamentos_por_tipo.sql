-- Orçamentos por tipo de procedimento, por paciente e com "esfriou" (pedido do Dr. Sergio Maia, painel Orçamentos do WTS).
-- Num painel de orçamentos cada item vira um card: consulta, exame, medicação e programa do mesmo paciente aparecem como
-- "vendas" separadas, e o "em aberto" incha porque ninguém fecha o card quando o paciente desiste.
--   tipo: classificação do nome do procedimento por regra (crm_tipo_procedimento); a equipe pode corrigir um nome em
--         crm_procedimento_tipo, e o que foi corrigido passa na frente da regra.
--   pessoa: mesmo critério de crm_pessoas_resumo_periodo (no FlwChat, o primeiro contato do card).
--   esfriou: card em aberto criado há mais de 60 dias. É só leitura nossa; nada muda no CRM.
--   equipe/fornecedor: cards de contato com tag "Tipo · Equipe" ou "Tipo · Fornecedor ou representante" (raw_payload.contato_tipo,
--         gravado pelo sync do FlwChat) ficam fora e são contados à parte.
-- Só leitura no CRM; admin ou membro da clínica lê; só admin corrige o tipo.
-- Reversão: drop function public.crm_orcamentos_por_tipo(uuid, date, date); drop function public.crm_tipo_procedimento(text);
--           drop table public.crm_procedimento_tipo;

create table if not exists public.crm_procedimento_tipo (
  client_id uuid not null references public.clients(id) on delete cascade,
  procedimento text not null check (length(btrim(procedimento)) between 1 and 300),
  tipo text not null check (tipo in ('Consulta', 'Exame', 'Medicação', 'Terapia injetável', 'Implante hormonal', 'Kit', 'Programa ou clube', 'Estética', 'Outros')),
  confirmado_por uuid default auth.uid(),
  confirmado_em timestamptz not null default now(),
  primary key (client_id, procedimento)
);
alter table public.crm_procedimento_tipo enable row level security;
drop policy if exists crm_procedimento_tipo_ler on public.crm_procedimento_tipo;
create policy crm_procedimento_tipo_ler on public.crm_procedimento_tipo for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
drop policy if exists crm_procedimento_tipo_admin on public.crm_procedimento_tipo;
create policy crm_procedimento_tipo_admin on public.crm_procedimento_tipo for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
revoke all on public.crm_procedimento_tipo from anon, authenticated;
grant select, insert, update, delete on public.crm_procedimento_tipo to authenticated;
grant all on public.crm_procedimento_tipo to service_role;

-- Regra padrão. A ordem importa: "Pacote TIRZEPATIDA" é medicação, "GOH DOCTOR 90" é programa, "KIT B12" é kit.
create or replace function public.crm_tipo_procedimento(p text)
returns text language sql immutable set search_path = public, pg_temp
as $function$
  select case
    when p is null or btrim(p) = '' then null
    when p ~* '(toxina|botul|preenchimento|bioestimul|radiesse|harmoniza|peeling|laser|\mfios?\M)' then 'Estética'
    when p ~* 'implante' then 'Implante hormonal'
    when p ~* '(programa|clube|\mplano\M|acompanhamento|doctor ?90|goh ?90)' then 'Programa ou clube'
    when p ~* '(teste|exame|calorimetria|bioimped|check.?up|ultrass|laborat|microbiota|indican|painel|gen[eé]tic)' then 'Exame'
    when p ~* '\mkits?\M' then 'Kit'
    when p ~* '(tirzepatida|semaglutida|ozempic|mounjaro|wegovy|saxenda|liraglutida|frasco|[0-9] ?mg\M|[0-9] ?ui\M)' then 'Medicação'
    when p ~* '(\mgoh\M|soro|aplica|ferrinjet|quadrimix|injet|infus|endoven)' then 'Terapia injetável'
    when p ~* '(consulta|retorno|avalia|primeira vez)' then 'Consulta'
    else 'Outros'
  end
$function$;
revoke all on function public.crm_tipo_procedimento(text) from public, anon;
grant execute on function public.crm_tipo_procedimento(text) to authenticated, service_role;

create or replace function public.crm_orcamentos_por_tipo(p_client_id uuid, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public, pg_temp
as $function$
  with base as (
    select cl.outcome, cl.price, cl.occurred_at,
           case when cl.provider = 'flwchat' then coalesce(cl.raw_payload->'contactIds'->>0, cl.external_lead_id) else cl.external_lead_id end as pk,
           (select nullif(btrim(v->>'value'), '')
              from jsonb_array_elements(case when jsonb_typeof(cl.raw_payload->'custom_fields_values') = 'array' then cl.raw_payload->'custom_fields_values' else '[]'::jsonb end) f,
                   jsonb_array_elements(case when jsonb_typeof(f->'values') = 'array' then f->'values' else '[]'::jsonb end) v
             where f->>'field_name' ilike '%procedim%' limit 1) as procedimento,
           coalesce(cl.raw_payload->>'contato_tipo', '') in ('Equipe', 'Fornecedor ou representante') as interno
    from crm_leads cl
    where cl.client_id = p_client_id
      and cl.removido_na_origem is null
      and cl.occurred_at is not null
      and (cl.occurred_at at time zone 'America/Sao_Paulo')::date between p_from and p_to
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  ),
  t as (
    select b.*, coalesce(o.tipo, public.crm_tipo_procedimento(b.procedimento)) as tipo, o.tipo is not null as corrigido,
           b.outcome is distinct from 'won' and b.outcome is distinct from 'lost' and b.occurred_at < now() - interval '60 days' as esfriou
    from base b left join crm_procedimento_tipo o on o.client_id = p_client_id and o.procedimento = b.procedimento
    where b.procedimento is not null and not b.interno
  ),
  por_tipo as (
    select tipo, count(*) as itens, count(distinct pk) as pessoas,
           count(*) filter (where outcome = 'won') as aprovados,
           count(distinct pk) filter (where outcome = 'won') as pessoas_aprovadas,
           coalesce(sum(price) filter (where outcome = 'won'), 0) as valor_aprovado,
           count(*) filter (where outcome = 'won' and price is null) as aprovados_sem_valor,
           count(*) filter (where outcome = 'lost') as perdidos,
           count(*) filter (where esfriou) as esfriados,
           count(*) filter (where outcome is distinct from 'won' and outcome is distinct from 'lost' and not esfriou) as em_aberto
    from t group by tipo
  ),
  pac as (
    select pk, bool_or(outcome = 'won') as aprovou, coalesce(sum(price) filter (where outcome = 'won'), 0) as valor,
           bool_or(tipo = 'Consulta') as consulta, bool_or(outcome = 'won' and tipo <> 'Consulta') as comprou_alem
    from t group by pk
  ),
  nomes as (
    select procedimento, max(tipo) as tipo, bool_or(corrigido) as corrigido, count(*) as itens
    from t group by procedimento
  )
  select jsonb_build_object(
    'itens', (select count(*) from t),
    'cards_sem_procedimento', (select count(*) from base where procedimento is null and not interno),
    'cards_internos', (select count(*) from base where interno),
    'pessoas', (select count(*) from pac),
    'pessoas_aprovadas', (select count(*) from pac where aprovou),
    'valor_aprovado', (select coalesce(sum(valor), 0) from pac),
    'valor_por_paciente', (select round(avg(valor)) from pac where aprovou and valor > 0),
    'pessoas_com_consulta', (select count(*) from pac where consulta),
    'consulta_e_compra', (select count(*) from pac where consulta and comprou_alem),
    'esfriados', (select count(*) from t where esfriou),
    'tipos', coalesce((select jsonb_agg(to_jsonb(p) order by p.valor_aprovado desc, p.itens desc) from por_tipo p), '[]'::jsonb),
    'procedimentos', coalesce((select jsonb_agg(to_jsonb(n) order by n.itens desc) from (select * from nomes order by itens desc limit 300) n), '[]'::jsonb)
  )
$function$;
revoke all on function public.crm_orcamentos_por_tipo(uuid, date, date) from public, anon;
grant execute on function public.crm_orcamentos_por_tipo(uuid, date, date) to authenticated, service_role;
