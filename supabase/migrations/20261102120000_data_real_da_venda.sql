-- Data real da venda e coorte honesta (auditoria de confiabilidade de 01/11/2026).
--   1. A venda da Clint e do RD Station contava pela data de entrada do card, ou pela hora do sync quando havia o
--      evento "ganhou". As duas fontes informam quando o negócio foi fechado: Clint em won_at (e lost_at), RD em
--      closed_at (com win = true/false). Os dois campos já chegam em crm_leads.raw_payload. crm_data_desfecho lê essa
--      data; o gatilho crm_registrar_evento passa a datar "ganhou"/"perdeu" por ela, e crm_vendas_periodo e
--      pacientes_periodo contam a venda no dia em que ela fechou. Sem a data da fonte, nada muda (evento, depois a
--      entrada). Dra. Marcelly, outubro: 17 vendas no Nexo contra 19 na Clint.
--   2. O gatilho de eventos não derruba a gravação do lead, mas a falha só ia para o log do banco. Agora fica também
--      em crm_eventos_falhas, e qualidade_dados mostra o alerta "crm-eventos-nao-gravados".
--   3. Venda conta pessoas (decisão do dono, 01/11/2026): pessoas_no_periodo e pessoas_coorte são o número principal;
--      as pessoas que já estavam no CRM antes do período (paciente ou contato antigo) vêm à parte, e os cards ganhos
--      (vendas_no_periodo, vendas_coorte) ficam como informação secundária.
--      Coorte honesta: "dos 19 contatos novos, 147 já viraram venda" (Dr. Sergio) contava os cards ganhos criados no
--      período, inclusive orçamentos de quem já era paciente. crm_vendas_periodo devolve, à parte, as pessoas novas
--      (crm_pessoas_novas) que viraram venda (nunca mais que as pessoas novas) e as vendas a quem já era paciente.
--   4. Card ganho sem valor numa etapa de agendamento não é venda, nem o ganho sem valor do funil de prospecção
--      (pacientes_periodo já fazia assim; crm_vendas_periodo contava). Voltam à parte (ganhos_agendamento_sem_valor,
--      ganhos_prospeccao_sem_valor), para a tela poder dizer.
-- Não apaga nada. Os eventos antigos são recalculados à parte, com supervisão (não é migração).
-- Reversão: recriar crm_registrar_evento e crm_vendas_periodo como em 20261030300000/20261031100000; em
--   pacientes_periodo trocar o bloco "g_real"/"vend" pelo anterior (marcado abaixo); qualidade_dados sem o bloco
--   "crm-eventos-nao-gravados". crm_data_desfecho e crm_eventos_falhas podem ficar.

-- Data em que o negócio foi ganho (ou perdido) segundo a própria fonte. Null quando a fonte não informa ou a data é
-- inválida: quem chama decide o que usar no lugar.
create or replace function public.crm_data_desfecho(p_provider text, p_raw jsonb, p_outcome text)
returns timestamptz
language plpgsql stable
set search_path to 'public', 'pg_temp'
as $$
declare
  v text;
  t timestamptz;
begin
  if p_raw is null or p_outcome is null or p_outcome not in ('won', 'lost') then return null; end if;
  if p_provider = 'clint' then
    v := p_raw->>(case p_outcome when 'won' then 'won_at' else 'lost_at' end);
  elsif p_provider = 'rdstation' then
    if (p_outcome = 'won' and p_raw->>'win' = 'true') or (p_outcome = 'lost' and p_raw->>'win' = 'false') then
      v := p_raw->>'closed_at';
    end if;
  else
    return null;
  end if;
  if v is null or v !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' then return null; end if;
  begin
    t := v::timestamptz;
  exception when others then
    return null;
  end;
  if t < timestamptz '2000-01-01 00:00:00+00' or t > now() + interval '1 day' then return null; end if;
  return t;
end;
$$;
revoke all on function public.crm_data_desfecho(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.crm_data_desfecho(text, jsonb, text) to service_role;

-- Falhas do gatilho de eventos (antes só no log do banco).
create table if not exists public.crm_eventos_falhas (
  id bigserial primary key,
  client_id uuid,
  crm_connection_id uuid,
  external_lead_id text,
  operacao text,
  erro text not null,
  ocorreu_em timestamptz not null default now()
);
create index if not exists crm_eventos_falhas_cliente on public.crm_eventos_falhas (client_id, ocorreu_em);
alter table public.crm_eventos_falhas enable row level security;
revoke all on public.crm_eventos_falhas from anon, authenticated;

create or replace function public.crm_registrar_evento()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  o_out text := case when tg_op = 'UPDATE' then coalesce(old.outcome, 'open') else null end;
  n_out text := coalesce(new.outcome, 'open');
  -- Data do desfecho informada pela fonte (Clint won_at/lost_at, RD closed_at). Sem ela: entrada (card que já chega
  -- fechado) ou a hora da gravação (mudança vista no sync).
  quando timestamptz;
begin
  begin
    if n_out in ('won', 'lost') then quando := public.crm_data_desfecho(new.provider, new.raw_payload, n_out); end if;
    if tg_op = 'INSERT' then
      insert into crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_para, status_para, ocorreu_em)
      values (new.client_id, new.crm_connection_id, new.external_lead_id, 'entrou', new.pipeline_id, new.status_id, coalesce(new.occurred_at, now()));
      -- Card que já chega ganho (ou perdido) também tem o evento do resultado.
      if n_out in ('won', 'lost') then
        insert into crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_para, status_para, ocorreu_em)
        values (new.client_id, new.crm_connection_id, new.external_lead_id, case n_out when 'won' then 'ganhou' else 'perdeu' end,
                new.pipeline_id, new.status_id, coalesce(quando, new.occurred_at, now()));
      end if;
      return new;
    end if;
    if new.client_id is null then return new; end if;
    if old.status_id is distinct from new.status_id or old.pipeline_id is distinct from new.pipeline_id then
      insert into crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_de, status_de, pipeline_para, status_para)
      values (new.client_id, new.crm_connection_id, new.external_lead_id, 'mudou_etapa', old.pipeline_id, old.status_id, new.pipeline_id, new.status_id);
    end if;
    -- Reclassificação da etapa pelo Nexo (crm_definir_etapa_resultado) não é venda nem perda.
    if o_out is distinct from n_out and coalesce(current_setting('nexo.reclassificando', true), '') <> '1' then
      insert into crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_para, status_para, ocorreu_em)
      values (new.client_id, new.crm_connection_id, new.external_lead_id,
        case n_out when 'won' then 'ganhou' when 'lost' then 'perdeu' when 'closed' then 'fechou' else 'reabriu' end,
        new.pipeline_id, new.status_id, coalesce(quando, now()));
    end if;
  exception when others then
    -- Nunca derruba a gravação do lead, mas a falha fica registrada (alerta crm-eventos-nao-gravados).
    raise warning 'crm_registrar_evento: %', sqlerrm;
    begin
      insert into crm_eventos_falhas (client_id, crm_connection_id, external_lead_id, operacao, erro)
      values (new.client_id, new.crm_connection_id, new.external_lead_id, tg_op, left(sqlerrm, 500));
    exception when others then
      raise warning 'crm_registrar_evento: falha ao registrar a falha: %', sqlerrm;
    end;
  end;
  return new;
end;
$$;
revoke all on function public.crm_registrar_evento() from public, anon, authenticated;

create or replace function public.crm_vendas_periodo(p_client_id uuid, p_from date, p_to date)
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  -- Funil e etapa de agendamento: mesmas regras de pacientes_cards (KPI consulta_agendada ou nome com "agendad").
  funis as (
    select distinct on (s.crm_connection_id, s.pipeline_id) s.crm_connection_id, s.pipeline_id, s.pipeline_name
      from crm_pipeline_statuses s join crm_connections c on c.id = s.crm_connection_id
     where c.client_id = p_client_id and (select pode from ok)
     order by s.crm_connection_id, s.pipeline_id, s.fetched_at desc nulls last
  ),
  etapas as (
    select s.crm_connection_id, s.pipeline_id, s.status_id,
           coalesce((exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = s.crm_connection_id and k.pipeline_id = s.pipeline_id
                              and k.status_id = s.status_id and k.kpi = 'consulta_agendada') or s.status_name ~* '(agendad|agendament)')
                    and not coalesce(s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)', false), false) as agendamento
      from crm_pipeline_statuses s join crm_connections c on c.id = s.crm_connection_id
     where c.client_id = p_client_id and (select pode from ok)
  ),
  cards as (
    select cl.crm_connection_id, cl.external_lead_id, cl.outcome, cl.provider,
           coalesce(cl.chave_pessoa, public.crm_chave_pessoa(cl.provider, cl.raw_payload, cl.contact_phone, cl.external_lead_id, cl.crm_connection_id)) as pk,
           (cl.occurred_at at time zone 'America/Sao_Paulo')::date as d,
           cl.occurred_at,
           public.crm_origem_classifica(cl.source) as origem,
           -- Ganho sem valor numa etapa de agendamento: o CRM marca o agendamento como ganho. Não é venda.
           cl.outcome = 'won' and coalesce(e.agendamento, false) and coalesce(cl.price, 0) = 0 as ganho_agendamento,
           -- Ganho sem valor no funil de prospecção (Social Seller): é resposta à abordagem, não venda (como em pacientes_periodo).
           cl.outcome = 'won' and coalesce(cl.price, 0) = 0 and not coalesce(e.agendamento, false)
             and (coalesce(cc.config->'origem_por_funil'->>btrim(f.pipeline_name), '') ~* '^prospec'
                  or coalesce(f.pipeline_name, '') ~* '(social ?seller|prospec)'
                  or coalesce(fp.papel, '') = 'prospeccao'
                  or coalesce(public.crm_origem_classifica(cl.source), '') = 'Prospecção ativa') as ganho_prospeccao,
           case when cl.outcome = 'won' then (public.crm_data_desfecho(cl.provider, cl.raw_payload, 'won') at time zone 'America/Sao_Paulo')::date end as dg
      from crm_leads cl
      join crm_connections cc on cc.id = cl.crm_connection_id
      left join funis f on f.crm_connection_id = cl.crm_connection_id and f.pipeline_id = cl.pipeline_id
      left join crm_funil_papel fp on fp.crm_connection_id = cl.crm_connection_id and fp.pipeline_id = cl.pipeline_id
      left join etapas e on e.crm_connection_id = cl.crm_connection_id and e.pipeline_id = cl.pipeline_id and e.status_id = cl.status_id
     where cl.client_id = p_client_id and cl.removido_na_origem is null and cl.occurred_at is not null
       and (select pode from ok)
  ),
  ganhos as (select * from cards where outcome = 'won' and not ganho_agendamento and not ganho_prospeccao),
  ev as (
    select e.crm_connection_id, e.external_lead_id, e.tipo, (e.ocorreu_em at time zone 'America/Sao_Paulo')::date as d
      from crm_lead_eventos e
     where e.client_id = p_client_id and e.tipo in ('ganhou', 'fechou') and (select pode from ok)
  ),
  ult_ganho as (select crm_connection_id, external_lead_id, max(d) as d from ev where tipo = 'ganhou' group by 1, 2),
  -- Data da venda: a da fonte (Clint won_at, RD closed_at); sem ela, o evento "ganhou"; sem evento, a entrada.
  no_periodo as (
    select c.* from cards c left join ult_ganho g using (crm_connection_id, external_lead_id)
     where c.outcome = 'won' and case when c.dg is not null then c.dg between p_from and p_to
                else exists (select 1 from ev x where x.tipo = 'ganhou' and x.d between p_from and p_to
                              and x.crm_connection_id = c.crm_connection_id and x.external_lead_id = c.external_lead_id)
                     or (g.d is null and c.d between p_from and p_to) end
  ),
  vendas as (select * from no_periodo where not ganho_agendamento and not ganho_prospeccao),
  coorte as (select * from ganhos where d between p_from and p_to),
  novas as (select n.pk, n.primeiro, n.com_origem from public.crm_pessoas_novas(p_client_id, p_from, p_to) n where (select pode from ok)),
  novas_origem as (
    select n.pk, coalesce((array_agg(c.origem order by c.origem is null, c.occurred_at) filter (where c.d = n.primeiro))[1], 'Não informado') as origem,
           bool_or(c.outcome = 'won' and not c.ganho_agendamento and not c.ganho_prospeccao and c.d between p_from and p_to) as virou_venda
      from novas n join cards c on c.pk = n.pk
     group by n.pk
  ),
  -- Ganhos da coorte de quem não é pessoa nova (orçamento de quem já era paciente).
  coorte_antigos as (select c.* from coorte c where not exists (select 1 from novas n where n.pk = c.pk)),
  por_origem as (
    select origem, count(*) as pessoas, count(*) filter (where virou_venda) as vendas
      from novas_origem group by origem
  )
  select jsonb_build_object(
    -- Decisão do dono (01/11/2026): venda conta PESSOAS. Os cards (orçamentos ganhos) seguem como informação secundária.
    'pessoas_no_periodo', (select count(distinct pk) from vendas),
    'pessoas_no_periodo_ja_no_crm', (select count(distinct v.pk) from vendas v where not exists (select 1 from novas n where n.pk = v.pk)),
    'pessoas_coorte', (select count(distinct pk) from coorte),
    'vendas_no_periodo', (select count(*) from vendas),
    'vendas_com_data_da_fonte', (select count(*) from vendas where dg is not null),
    'ganhos_total', (select count(*) from ganhos),
    'ganhos_com_data_da_fonte', (select count(*) from ganhos where dg is not null),
    'vendas_coorte', (select count(*) from coorte),
    'vendas_coorte_pessoas_novas', (select count(*) from novas_origem where virou_venda),
    'vendas_coorte_ja_pacientes', (select count(*) from coorte_antigos),
    'pessoas_coorte_ja_pacientes', (select count(distinct pk) from coorte_antigos),
    'ganhos_agendamento_sem_valor', (select count(*) from no_periodo where ganho_agendamento),
    'ganhos_agendamento_sem_valor_coorte', (select count(*) from cards where ganho_agendamento and d between p_from and p_to),
    'ganhos_prospeccao_sem_valor', (select count(*) from no_periodo where ganho_prospeccao),
    'perdidos_coorte', (select count(*) from cards where outcome = 'lost' and d between p_from and p_to),
    'fechados_sem_resultado', (select count(*) from cards c where c.outcome = 'closed' and (c.d between p_from and p_to
        or exists (select 1 from ev x where x.tipo = 'fechou' and x.d between p_from and p_to
                    and x.crm_connection_id = c.crm_connection_id and x.external_lead_id = c.external_lead_id))),
    'ultima_venda', (select max(coalesce(c.dg, g.d, c.d)) from ganhos c left join ult_ganho g using (crm_connection_id, external_lead_id)),
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

-- Pacientes do período: a venda (lista "fecharam") também conta pela data da fonte quando ela existe.
do $migra$
declare
  def text := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  ancora text := '  vend as (
    select c.id, c.u, coalesce(g.no_periodo, c.occurred_at) as quando, c.price, c.funil, c.procedimento,
           c.prospec and coalesce(c.price, 0) = 0 as prospec_sem_valor
      from cards c left join g_jan g on g.cx = c.cx and g.ext = c.ext
     where c.outcome = ''won'' and not (c.em_agendamento and coalesce(c.price, 0) = 0)
       and (g.no_periodo is not null or (g.n is null and c.d between p_de and p_ate))
  ),';
  novo text := '  -- [data-real-da-venda] Data da venda informada pela fonte (Clint won_at, RD closed_at), 20261102120000.
  g_real as (
    select cl.id, public.crm_data_desfecho(cl.provider, cl.raw_payload, ''won'') as em
      from crm_leads cl
     where cl.client_id = p_client and cl.outcome = ''won'' and cl.removido_na_origem is null
       and cl.provider in (''clint'', ''rdstation'')
  ),
  vend as (
    select c.id, c.u, coalesce(r.em, g.no_periodo, c.occurred_at) as quando, c.price, c.funil, c.procedimento,
           c.prospec and coalesce(c.price, 0) = 0 as prospec_sem_valor
      from cards c left join g_jan g on g.cx = c.cx and g.ext = c.ext
      left join g_real r on r.id = c.id and r.em is not null
     where c.outcome = ''won'' and not (c.em_agendamento and coalesce(c.price, 0) = 0)
       and case when r.em is not null then (r.em at time zone ''America/Sao_Paulo'')::date between p_de and p_ate
                else (g.no_periodo is not null or (g.n is null and c.d between p_de and p_ate)) end
  ),';
begin
  if position('[data-real-da-venda]' in def) > 0 then return; end if;
  if position(ancora in def) = 0 then raise exception 'pacientes_periodo: trecho "vend" não encontrado; revisar a migration'; end if;
  execute replace(def, ancora, novo);
end
$migra$;

-- Pacientes do período, "Fecharam": o número já conta pessoas; passa a dizer quantas delas já estavam no CRM antes do
-- período (paciente ou contato antigo), como no Resultado.
do $migra$
declare
  def text := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  ancora text := '''ganho_prospeccao_sem_valor'', (select count(*) from vend where prospec_sem_valor)) end';
  novo text := '''ganho_prospeccao_sem_valor'', (select count(*) from vend where prospec_sem_valor),
            ''ja_no_crm'', (select count(distinct v.u) from vendas v where not exists (select 1 from novas_u n where n.u = v.u))) end';
begin
  if position('''ja_no_crm''' in def) > 0 then return; end if;
  if position(ancora in def) = 0 then raise exception 'pacientes_periodo: trecho "fecharam" não encontrado; revisar a migration'; end if;
  execute replace(def, ancora, novo);
end
$migra$;

-- Alerta: eventos do CRM que o gatilho não conseguiu gravar nos últimos 7 dias.
do $migra$
declare
  def text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  ancora text := '  -- Muitos leads e quase nenhum ganho (menos de 1 a cada 200).';
  novo text := '  -- Eventos do CRM que não foram gravados (falha do gatilho crm_registrar_evento, antes silenciosa).
  for r in
    select count(*) n, max(f.ocorreu_em) ultimo from crm_eventos_falhas f
     where f.client_id = p_client_id and f.ocorreu_em >= now() - interval ''7 days''
    having count(*) > 0
  loop
    out := out || jsonb_build_object(
      ''id'', ''crm-eventos-nao-gravados'', ''fonte'', ''crm'', ''severidade'', ''alta'',
      ''titulo'', format(''%s mudanças de card do CRM não entraram no histórico nos últimos 7 dias'', r.n),
      ''evidencia'', format(''A última falha foi em %s. Sem o histórico, a venda pode cair no mês errado e o funil perde movimentos.'',
        to_char(r.ultimo at time zone ''America/Sao_Paulo'', ''DD/MM/YYYY HH24:MI'')),
      ''causa'', ''O gatilho que grava o histórico de cada card (entrou, mudou de etapa, ganhou, perdeu) deu erro.'',
      ''correcao'', ''Equipe Doctor Creator: ler crm_eventos_falhas, corrigir a causa e recalcular os eventos do período.'',
      ''responsavel'', ''equipe_hub'',
      ''afeta'', ''Vendas do período, histórico de etapas e funil.'');
  end loop;

';
begin
  if position('crm-eventos-nao-gravados' in def) > 0 then return; end if;
  if position(ancora in def) = 0 then raise exception 'qualidade_dados: âncora não encontrada; revisar a migration'; end if;
  execute replace(def, ancora, novo || ancora);
end
$migra$;
