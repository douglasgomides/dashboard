-- Vendas do período numa régua honesta (auditoria de Resultados e Relatório, 31/10/2026).
--   1. crm_leads_resumo_periodo conta os cards que ENTRARAM no período e hoje estão ganhos (coorte). O texto dizia
--      "vendas marcadas como ganhas no período", e o número de um mês crescia depois. crm_vendas_periodo devolve as
--      duas contas: vendas fechadas no período (evento "ganhou" em crm_lead_eventos.ocorreu_em; card que já nasceu
--      ganho, como a linha da planilha de vendas, vale pela data de entrada) e a coorte. Também diz desde quando há
--      histórico de eventos (eventos_desde): antes disso, a conta por evento fica incompleta e a tela usa a coorte.
--   2. Dra. Marcella: o FlwChat fecha o card sem dizer se virou venda (outcome 'closed') e a planilha de vendas parou
--      em 08/09. O painel mandava "marcar ganhos no CRM". A função devolve fechados_sem_resultado e o último registro
--      da planilha, e qualidade_dados ganha dois alertas: planilha de vendas parada e cards fechados sem resultado.
--   3. A seção Comercial do PDF usava o histórico inteiro do CRM e a origem crua do campo "Fonte do Lead" (testes de
--      integração, Instagram em 3 grafias, paciente antigo como origem). A função devolve as pessoas novas do período
--      por origem classificada (crm_origem_classifica), a mesma régua do ROI.
-- Reversão: drop function public.crm_vendas_periodo(uuid, date, date); recriar qualidade_dados sem os blocos
--   "crm-fonte-vendas-parada" e "crm-resultado-nao-informado".

create or replace function public.crm_vendas_periodo(p_client_id uuid, p_from date, p_to date)
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  cards as (
    select cl.crm_connection_id, cl.external_lead_id, cl.outcome, cl.provider,
           coalesce(cl.chave_pessoa, public.crm_chave_pessoa(cl.provider, cl.raw_payload, cl.contact_phone, cl.external_lead_id, cl.crm_connection_id)) as pk,
           (cl.occurred_at at time zone 'America/Sao_Paulo')::date as d,
           cl.occurred_at,
           public.crm_origem_classifica(cl.source) as origem
      from crm_leads cl
     where cl.client_id = p_client_id and cl.removido_na_origem is null and cl.occurred_at is not null
       and (select pode from ok)
  ),
  ev as (
    select e.crm_connection_id, e.external_lead_id, e.tipo, (e.ocorreu_em at time zone 'America/Sao_Paulo')::date as d
      from crm_lead_eventos e
     where e.client_id = p_client_id and e.tipo in ('ganhou', 'fechou') and (select pode from ok)
  ),
  ult_ganho as (select crm_connection_id, external_lead_id, max(d) as d from ev where tipo = 'ganhou' group by 1, 2),
  vendas as (
    select c.* from cards c left join ult_ganho g using (crm_connection_id, external_lead_id)
     where c.outcome = 'won'
       and (exists (select 1 from ev x where x.tipo = 'ganhou' and x.d between p_from and p_to
                     and x.crm_connection_id = c.crm_connection_id and x.external_lead_id = c.external_lead_id)
            or (g.d is null and c.d between p_from and p_to))
  ),
  novas as (select n.pk, n.primeiro, n.com_origem from public.crm_pessoas_novas(p_client_id, p_from, p_to) n where (select pode from ok)),
  novas_origem as (
    select n.pk, coalesce((array_agg(c.origem order by c.origem is null, c.occurred_at) filter (where c.d = n.primeiro))[1], 'Não informado') as origem,
           bool_or(c.outcome = 'won' and c.d between p_from and p_to) as virou_venda
      from novas n join cards c on c.pk = n.pk
     group by n.pk
  ),
  por_origem as (
    select origem, count(*) as pessoas, count(*) filter (where virou_venda) as vendas
      from novas_origem group by origem
  )
  select jsonb_build_object(
    'vendas_no_periodo', (select count(*) from vendas),
    'vendas_coorte', (select count(*) from cards where outcome = 'won' and d between p_from and p_to),
    'perdidos_coorte', (select count(*) from cards where outcome = 'lost' and d between p_from and p_to),
    'fechados_sem_resultado', (select count(*) from cards c where c.outcome = 'closed' and (c.d between p_from and p_to
        or exists (select 1 from ev x where x.tipo = 'fechou' and x.d between p_from and p_to
                    and x.crm_connection_id = c.crm_connection_id and x.external_lead_id = c.external_lead_id))),
    'ultima_venda', (select max(coalesce(g.d, c.d)) from cards c left join ult_ganho g using (crm_connection_id, external_lead_id) where c.outcome = 'won'),
    'eventos_desde', (select (min(e.registrado_em) at time zone 'America/Sao_Paulo')::date from crm_lead_eventos e
                       where e.client_id = p_client_id and (select pode from ok)),
    'planilha_ultimo', (select max(c.d) from cards c join crm_connections cc on cc.id = c.crm_connection_id
                         where cc.active and c.provider = 'planilha'),
    'pessoas_novas', (select count(*) from novas),
    'pessoas_novas_com_origem', (select count(*) from novas_origem where origem <> 'Não informado'),
    'por_origem', coalesce((select jsonb_agg(jsonb_build_object('origem', origem, 'pessoas', pessoas, 'vendas', vendas)
                                             order by pessoas desc, origem) from por_origem), '[]'::jsonb)
  )
  where (select pode from ok);
$$;
revoke all on function public.crm_vendas_periodo(uuid, date, date) from public, anon;
grant execute on function public.crm_vendas_periodo(uuid, date, date) to authenticated, service_role;

-- Alertas: planilha de vendas parada e cards fechados na origem sem resultado.
do $migra$
declare
  def text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  ancora text := '  -- Muitos leads e quase nenhum ganho (menos de 1 a cada 200).';
  novo text := '  -- Planilha de vendas parada enquanto o CRM segue recebendo contatos (Marcella: último registro em 08/09).
  for r in
    select max(cl.occurred_at) ultimo
      from crm_connections c join crm_leads cl on cl.crm_connection_id = c.id and cl.removido_na_origem is null
     where c.client_id = p_client_id and c.active and c.provider = ''planilha''
    having count(*) > 0 and max(cl.occurred_at) < now() - interval ''30 days''
       and (select count(*) from crm_leads o
             where o.client_id = p_client_id and o.provider <> ''planilha'' and o.removido_na_origem is null
               and o.occurred_at >= now() - interval ''30 days'') >= 20
  loop
    out := out || jsonb_build_object(
      ''id'', ''crm-fonte-vendas-parada'', ''fonte'', ''crm'', ''severidade'', ''alta'',
      ''titulo'', format(''A planilha de vendas não é atualizada desde %s'', to_char(r.ultimo at time zone ''America/Sao_Paulo'', ''DD/MM/YYYY'')),
      ''evidencia'', format(''Último registro da planilha em %s (%s dias atrás), enquanto o CRM continua recebendo contatos novos. Sem a planilha, o painel não sabe quantas vendas houve.'',
        to_char(r.ultimo at time zone ''America/Sao_Paulo'', ''DD/MM/YYYY''), extract(day from now() - r.ultimo)::int),
      ''causa'', ''A planilha de vendas deixou de ser preenchida, ou a conexão perdeu o acesso a ela.'',
      ''correcao'', ''Voltar a lançar as vendas na planilha e conferir o acesso da conexão. Enquanto isso, as vendas aparecem como não disponíveis.'',
      ''responsavel'', ''comercial'',
      ''afeta'', ''Vendas, taxa de conversão e retorno do investimento.'');
  end loop;

  -- Cards fechados na origem sem dizer se viraram venda (FlwChat), sem nenhum ganho registrado nos últimos 30 dias.
  for r in
    select count(distinct e.crm_connection_id::text || '':'' || e.external_lead_id) n
      from crm_lead_eventos e
      join crm_leads cl on cl.crm_connection_id = e.crm_connection_id and cl.external_lead_id = e.external_lead_id
     where e.client_id = p_client_id and e.tipo = ''fechou'' and e.ocorreu_em >= now() - interval ''30 days''
       and cl.outcome = ''closed'' and cl.removido_na_origem is null
    having count(*) >= 20
       and not exists (select 1 from crm_leads w where w.client_id = p_client_id and w.outcome = ''won''
                          and w.removido_na_origem is null and w.occurred_at >= now() - interval ''30 days'')
       and not exists (select 1 from crm_lead_eventos g where g.client_id = p_client_id and g.tipo = ''ganhou''
                          and g.ocorreu_em >= now() - interval ''30 days'')
  loop
    out := out || jsonb_build_object(
      ''id'', ''crm-resultado-nao-informado'', ''fonte'', ''crm'', ''severidade'', ''media'',
      ''titulo'', format(''%s cards foram fechados nos últimos 30 dias sem dizer se viraram venda'', r.n),
      ''evidencia'', format(''%s cards saíram da lista de abertos do CRM sem ganho nem perda, e nenhuma venda foi registrada nos últimos 30 dias.'', r.n),
      ''causa'', ''O CRM só informa os cards abertos: quando a equipe fecha um card, ele some sem dizer o resultado.'',
      ''correcao'', ''Equipe Doctor Creator: combinar com a clínica de onde vem o registro de venda (planilha de vendas ou outra fonte) e ligar essa fonte ao Nexo.'',
      ''responsavel'', ''equipe_hub'',
      ''afeta'', ''Vendas, taxa de conversão e retorno do investimento.'');
  end loop;

';
begin
  if position('crm-fonte-vendas-parada' in def) > 0 then return; end if;
  if position(ancora in def) = 0 then raise exception 'qualidade_dados: âncora não encontrada; revisar a migration'; end if;
  execute replace(def, ancora, novo || ancora);
end
$migra$;
