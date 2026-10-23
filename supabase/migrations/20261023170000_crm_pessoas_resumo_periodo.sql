-- Pessoas x cards no CRM (caso Dr. Sergio Maia, painel "Orçamentos" da WTS).
-- Lá cada card é um ORÇAMENTO, e a mesma pessoa tem vários: em 30 dias foram
-- 243 cards para 100 pessoas, e só 15 delas apareciam pela 1ª vez. A tela
-- contava cada card como "lead novo". Estas duas funções dão a contagem por
-- pessoa, só leitura e sem acesso anon. Para os provedores em que 1 card = 1
-- pessoa (tudo menos flwchat) o resultado é igual ao de crm_leads_resumo_periodo.
--
-- Chave da pessoa: flwchat -> 1º contato do card (raw_payload.contactIds[0]);
-- sem contato, ou outro provedor -> o próprio card (external_lead_id).
-- Nota: crm_leads.pessoa_id NÃO serve como chave aqui (preenchido em só 61% dos
-- cards do Sergio).

create or replace function public.crm_pessoas_resumo_periodo(p_client_id uuid, p_from date, p_to date)
returns table(
  cards bigint,
  pessoas bigint,
  pessoas_novas bigint,
  pessoas_recorrentes bigint,
  cards_de_recorrentes bigint,
  ganhos bigint,
  perdidos bigint,
  abertos bigint,
  valor numeric,
  valor_ganho numeric,
  max_cards_por_pessoa bigint
)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  with base as (
    select cl.outcome, cl.price,
           (cl.occurred_at at time zone 'America/Sao_Paulo')::date as d,
           case when cl.provider = 'flwchat'
                then coalesce(cl.raw_payload->'contactIds'->>0, cl.external_lead_id)
                else cl.external_lead_id end as pk
    from crm_leads cl
    where cl.client_id = p_client_id
      and cl.removido_na_origem is null
      and cl.occurred_at is not null
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  ),
  primeira as (select pk, min(d) as primeiro from base group by pk),
  per as (select b.* from base b where b.d between p_from and p_to),
  por_pessoa as (
    select per.pk, count(*) as n, min(pr.primeiro) as primeiro
    from per join primeira pr using (pk) group by per.pk
  )
  select
    (select count(*) from per),
    (select count(*) from por_pessoa),
    (select count(*) from por_pessoa where primeiro between p_from and p_to),
    (select count(*) from por_pessoa where primeiro < p_from),
    coalesce((select sum(n) from por_pessoa where primeiro < p_from), 0)::bigint,
    (select count(*) from per where outcome = 'won'),
    (select count(*) from per where outcome = 'lost'),
    (select count(*) from per where outcome is distinct from 'won' and outcome is distinct from 'lost'),
    coalesce((select sum(price) from per), 0),
    coalesce((select sum(price) from per where outcome = 'won'), 0),
    coalesce((select max(n) from por_pessoa), 0);
$function$;

create or replace function public.crm_pessoas_novas_por_dia_periodo(p_client_id uuid, p_from date, p_to date)
returns table(dia date, pessoas_novas bigint, cards bigint)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  with base as (
    select (cl.occurred_at at time zone 'America/Sao_Paulo')::date as d,
           case when cl.provider = 'flwchat'
                then coalesce(cl.raw_payload->'contactIds'->>0, cl.external_lead_id)
                else cl.external_lead_id end as pk
    from crm_leads cl
    where cl.client_id = p_client_id
      and cl.removido_na_origem is null
      and cl.occurred_at is not null
      and (public.is_app_admin() or public.is_client_member(p_client_id))
  ),
  primeira as (select pk, min(d) as primeiro from base group by pk),
  dias as (select d, count(*) as cards from base where d between p_from and p_to group by d),
  novas as (select primeiro as d, count(*) as n from primeira where primeiro between p_from and p_to group by primeiro)
  select dias.d, coalesce(novas.n, 0), dias.cards
  from dias left join novas using (d)
  order by dias.d;
$function$;

revoke all on function public.crm_pessoas_resumo_periodo(uuid, date, date) from public, anon;
revoke all on function public.crm_pessoas_novas_por_dia_periodo(uuid, date, date) from public, anon;
grant execute on function public.crm_pessoas_resumo_periodo(uuid, date, date) to authenticated, service_role;
grant execute on function public.crm_pessoas_novas_por_dia_periodo(uuid, date, date) to authenticated, service_role;
