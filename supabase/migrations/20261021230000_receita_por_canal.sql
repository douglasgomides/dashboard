-- Receita por canal (Liine D): vendas ganhas no CRM no período e de onde veio cada uma, com o grau de certeza.
-- Ordem da origem de cada venda:
--   1. "crm"   : a equipe registrou a fonte do lead no CRM (crm_leads.source)            → registrada
--   2. "texto" : a 1ª conversa da pessoa começa com uma mensagem pronta cadastrada         → pela mensagem de entrada
--   3. "ia"    : a 1ª conversa foi lida pela IA e a origem não é "desconhecida"            → estimada
--   4. sem nada disso                                                                      → desconhecida
-- A venda liga à conversa pelo lead (conversas.lead_id) ou pela pessoa (mesmo telefone). Datas: as mesmas que o resto
-- do Hub usa para o CRM (coalesce(occurred_at, received_at)). Não afirma que o canal "gerou" a receita: mostra a origem
-- registrada ou inferida, e a parte desconhecida fica visível.
-- Reversão: drop function receita_por_canal.

create or replace function public.receita_por_canal(p_client uuid, p_de date, p_ate date)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with vendas as (
    select l.id, l.pessoa_id, coalesce(l.price, 0) valor, nullif(btrim(l.source), '') fonte_crm
    from crm_leads l
    where l.client_id = p_client and (public.is_app_admin() or public.is_client_member(p_client))
      and l.outcome = 'won' and l.removido_na_origem is null
      and (coalesce(l.occurred_at, l.received_at) at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  conv as (
    select distinct on (v.id) v.id venda_id, c.id conversa_id
    from vendas v join conversas c on c.client_id = p_client and (c.lead_id = v.id or (v.pessoa_id is not null and c.pessoa_id = v.pessoa_id))
    order by v.id, c.iniciada_em nulls last, c.id
  ),
  primeira as (
    select distinct on (m.conversa_id) m.conversa_id, lower(regexp_replace(coalesce(m.texto, ''), '\s+', ' ', 'g')) t
    from mensagens m join conv on conv.conversa_id = m.conversa_id
    where m.direcao = 'entrada' and coalesce(m.texto, '') !~* '^\s*\*aten[cç][aã]o:\*'
    order by m.conversa_id, m.enviada_em, m.id
  ),
  origem as (
    select v.id, v.valor,
      case
        when v.fonte_crm is not null then v.fonte_crm
        when o_txt.origem is not null then o_txt.origem
        when nullif(nullif(nullif(r.resumo->>'origem', ''), 'null'), 'desconhecida') is not null then r.resumo->>'origem'
        else 'desconhecida' end canal,
      case
        when v.fonte_crm is not null then 'crm'
        when o_txt.origem is not null then 'texto'
        when nullif(nullif(nullif(r.resumo->>'origem', ''), 'null'), 'desconhecida') is not null then 'ia'
        else 'desconhecida' end certeza
    from vendas v
    left join conv on conv.venda_id = v.id
    left join primeira p on p.conversa_id = conv.conversa_id
    left join conversas_resumos r on r.conversa_id = conv.conversa_id
    left join lateral (select o.origem from origens_texto o where o.client_id = p_client and starts_with(p.t, o.padrao) order by length(o.padrao) desc limit 1) o_txt on true
  )
  select jsonb_build_object(
    'vendas', (select count(*) from origem),
    'receita', (select coalesce(sum(valor), 0) from origem),
    'com_conversa', (select count(*) from conv),
    'por_certeza', (select coalesce(jsonb_object_agg(certeza, jsonb_build_object('vendas', n, 'receita', rec)), '{}'::jsonb)
      from (select certeza, count(*) n, sum(valor) rec from origem group by certeza) x),
    'canais', coalesce((select jsonb_agg(x order by x.receita desc, x.vendas desc) from (
      select canal, count(*) vendas, sum(valor) receita,
        count(*) filter (where certeza = 'crm') crm, count(*) filter (where certeza = 'texto') texto, count(*) filter (where certeza = 'ia') ia
      from origem group by canal) x), '[]'::jsonb));
$function$;

revoke all on function public.receita_por_canal(uuid, date, date) from public, anon;
grant execute on function public.receita_por_canal(uuid, date, date) to authenticated;
