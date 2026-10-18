-- Uma mesma pessoa pode comentar várias vezes no mesmo post ou usar várias
-- vezes o mesmo link. Receita é somada uma vez por pessoa em cada origem,
-- preservando a contagem de pessoas. Antes o JOIN multiplicava ld.receita.
create or replace function public.jornada_resumo(p_client uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $function$
declare r jsonb;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then
    return null;
  end if;
  with
  lv as (select * from public.crm_leads where client_id = p_client and removido_na_origem is null),
  lp as (select * from lv where (coalesce(occurred_at, received_at) at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
  tq as (select * from public.toques where client_id = p_client and (ocorreu_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate),
  com as (select distinct pessoa_id from tq where tipo = 'comentario' and pessoa_id is not null),
  conv as (select distinct pessoa_id from public.conversas c where client_id = p_client and pessoa_id is not null
           and (iniciada_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
           and exists (select 1 from public.mensagens m where m.conversa_id = c.id and m.client_id = p_client)),
  ld as (select pessoa_id, bool_or(outcome = 'won') ganhou, sum(case when outcome = 'won' then coalesce(price,0) else 0 end) receita
         from lp where pessoa_id is not null group by pessoa_id),
  p as (select pessoa_id from com union select pessoa_id from conv union select pessoa_id from ld),
  origem as (
    select coalesce(nullif(source,''), 'Sem origem informada') o, count(*) leads,
           count(*) filter (where outcome = 'won') ganhos,
           coalesce(sum(price) filter (where outcome = 'won'),0) receita
    from lp group by 1 order by 2 desc limit 12),
  posts as (
    select ip.id, ip.permalink, ip.thumbnail_url, left(ip.caption,120) legenda, ip.posted_at, ip.funnel_stage,
           count(distinct t.pessoa_id) comentaristas,
           count(distinct t.pessoa_id) filter (where ld.pessoa_id is not null) viraram_lead,
           count(distinct t.pessoa_id) filter (where ld.ganhou) ganhos,
           coalesce(sum(ld.receita),0) receita
    from (select distinct instagram_post_id, pessoa_id from tq where tipo = 'comentario') t
    join public.instagram_posts ip on ip.id = t.instagram_post_id and ip.client_id = p_client
    left join ld on ld.pessoa_id = t.pessoa_id
    group by ip.id order by 7 desc, 8 desc limit 10),
  links as (
    select l.id, l.titulo, l.tipo, l.short_url, l.cliques_total,
           count(distinct t.pessoa_id) conversas,
           count(distinct t.pessoa_id) filter (where ld.pessoa_id is not null) viraram_lead,
           count(distinct t.pessoa_id) filter (where ld.ganhou) ganhos,
           coalesce(sum(ld.receita),0) receita
    from public.links_rastreados l
    left join (select distinct link_id, pessoa_id from tq) t on t.link_id = l.id
    left join ld on ld.pessoa_id = t.pessoa_id
    where l.client_id = p_client group by l.id order by l.criado_em desc limit 20)
  select jsonb_build_object(
    'pessoas', (select count(*) from p),
    'comentaram', (select count(*) from com),
    'conversaram', (select count(*) from conv),
    'viraram_lead', (select count(*) from ld),
    'ganhos', (select count(*) from ld where ganhou),
    'receita', (select coalesce(sum(receita),0) from ld),
    'leads_total', (select count(*) from lp),
    'leads_sem_pessoa', (select count(*) from lp where pessoa_id is null),
    'comentaram_e_lead', (select count(*) from com join ld using (pessoa_id)),
    'conversaram_e_lead', (select count(*) from conv join ld on ld.pessoa_id = conv.pessoa_id),
    'comentaram_e_conversaram', (select count(*) from com join conv using (pessoa_id)),
    'por_origem', coalesce((select jsonb_agg(to_jsonb(origem)) from origem), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(to_jsonb(posts)) from posts), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(to_jsonb(links)) from links), '[]'::jsonb),
    'escopo', jsonb_build_object(
      'de', p_de, 'ate', p_ate,
      'leads_base_toda', (select count(*) from lv),
      'leads_removidos_na_origem', (select count(*) from public.crm_leads where client_id = p_client and removido_na_origem is not null)
    )
  ) into r;
  return r;
end;
$function$;

revoke all on function public.jornada_resumo(uuid, date, date) from public, anon;
grant execute on function public.jornada_resumo(uuid, date, date) to authenticated;
