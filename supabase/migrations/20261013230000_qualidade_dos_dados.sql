-- Qualidade dos dados: o que está entrando errado, a causa provável, como corrigir e quem corrige.
--
-- Nasceu de um achado de 13/10/2026: leituras do painel feitas em cima de milhares de leads
-- parados (Juliana Paola: 78% dos leads abertos sem movimentação há 90+ dias), CRM sem lead novo
-- enquanto o WhatsApp recebia conversas, e Instagram com "sync OK" gravando zero linhas.
-- Nada aqui altera dado: só lê e aponta. As regras são fixas e verificáveis.
--
-- Também corrige client_sync_status: a data do Instagram passa a ser a do último dia COM
-- alcance (antes contava a linha que só grava o número de seguidores, e escondia alcance parado).

create or replace function public.lead_ultima_movimentacao(p_provider text, p_raw jsonb, p_occurred timestamptz)
returns timestamptz language sql stable as $$
  select coalesce(
    case p_provider
      when 'kommo' then case when (p_raw->>'updated_at') ~ '^\d+$' then to_timestamp((p_raw->>'updated_at')::bigint) end
      when 'flwchat' then case when p_raw->>'updatedAt' ~ '^\d{4}-' then (p_raw->>'updatedAt')::timestamptz end
      when 'clint' then case when coalesce(p_raw->>'updated_stage_at', p_raw->>'updated_at') ~ '^\d{4}-' then coalesce(p_raw->>'updated_stage_at', p_raw->>'updated_at')::timestamptz end
      when 'rdstation' then case when coalesce(p_raw->>'last_activity_at', p_raw->>'updated_at') ~ '^\d{4}-' then coalesce(p_raw->>'last_activity_at', p_raw->>'updated_at')::timestamptz end
    end,
    p_occurred);
$$;

create or replace function public.qualidade_dados(p_client_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  out jsonb := '[]'::jsonb;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_abertos int; v_parados int; v_ativos int; v_total int;
  v_ultimo_lead date; v_conv_depois int; v_wts_depois int;
  v_leads90 int; v_sem_origem int; v_ganhos90 int;
  v_ig_reach date; v_ig_qualquer date; v_posts_atual date; v_tem_ig boolean;
  v_ads_ultimo date; v_tem_ads boolean;
  v_seg_ini int; v_seg_fim int; v_seg_dia_ini date; v_seg_dia_fim date; v_novos int; v_saidas int;
  v_sem_obj int; v_gasto_sem_obj numeric;
  r record;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client_id)) then
    return '[]'::jsonb;
  end if;

  -- ---------------- CRM ----------------
  select count(*) filter (where coalesce(outcome, 'open') = 'open'),
         count(*) filter (where coalesce(outcome, 'open') = 'open'
                          and public.lead_ultima_movimentacao(provider, raw_payload, occurred_at) < now() - interval '90 days'),
         count(*) filter (where coalesce(outcome, 'open') = 'open'
                          and public.lead_ultima_movimentacao(provider, raw_payload, occurred_at) >= now() - interval '30 days'),
         count(*),
         max((occurred_at at time zone 'America/Sao_Paulo')::date)
    into v_abertos, v_parados, v_ativos, v_total, v_ultimo_lead
  from crm_leads where client_id = p_client_id and removido_na_origem is null;

  if v_abertos >= 50 and v_parados::numeric / v_abertos >= 0.3 then
    out := out || jsonb_build_object(
      'id', 'crm-leads-parados', 'fonte', 'crm',
      'severidade', case when v_parados::numeric / v_abertos >= 0.5 then 'alta' else 'media' end,
      'titulo', format('%s de %s leads abertos (%s%%) estão parados há mais de 90 dias', v_parados, v_abertos, round(v_parados * 100.0 / v_abertos)),
      'evidencia', format('Leads abertos sem nenhuma mudança no CRM há 90+ dias: %s. Movimentados nos últimos 30 dias: %s.', v_parados, v_ativos),
      'causa', 'Leads antigos nunca foram encerrados no CRM (nem como ganho, nem como perda). Eles continuam contando como "abertos" e puxam para baixo qualquer taxa calculada sobre a base.',
      'correcao', 'No CRM, marcar esses leads como Perdido (motivo "sem retorno") ou arquivá-los. Depois disso, a base passa a refletir só quem ainda está em negociação.',
      'responsavel', 'comercial',
      'afeta', 'Taxa de conversão da base, leads em atendimento, funil "Leads na base".');
  end if;

  if v_ultimo_lead is not null and v_ultimo_lead < hoje - 3 then
    select count(*) into v_wts_depois from wts_sessions
      where client_id = p_client_id and (started_at at time zone 'America/Sao_Paulo')::date > v_ultimo_lead;
    select coalesce(sum(conversations), 0) into v_conv_depois from meta_ads_daily
      where client_id = p_client_id and date > v_ultimo_lead;
    if v_wts_depois + v_conv_depois >= 5 then
      out := out || jsonb_build_object(
        'id', 'crm-sem-lead-novo', 'fonte', 'crm', 'severidade', 'alta',
        'titulo', format('Nenhum lead novo no CRM desde %s, mas chegaram %s conversas depois disso', to_char(v_ultimo_lead, 'DD/MM'), v_wts_depois + v_conv_depois),
        'evidencia', format('Último lead criado no CRM: %s. Depois disso: %s atendimentos no WhatsApp e %s conversas vindas de anúncio.', to_char(v_ultimo_lead, 'DD/MM'), v_wts_depois, v_conv_depois),
        'causa', 'Os contatos novos não estão sendo registrados no CRM (ou a criação automática de lead parou). A sincronização roda todo dia; o que falta é o dado na origem.',
        'correcao', 'Registrar no CRM todo paciente que chamar, no mesmo dia, ou religar a criação automática de card/lead a partir do WhatsApp.',
        'responsavel', 'atendimento',
        'afeta', 'Leads do período, cruzamento lead x conteúdo, funil comercial.');
    end if;
  end if;

  select count(*), count(*) filter (where nullif(btrim(source), '') is null), count(*) filter (where outcome = 'won')
    into v_leads90, v_sem_origem, v_ganhos90
  from crm_leads where client_id = p_client_id and removido_na_origem is null and occurred_at >= now() - interval '90 days';

  if v_leads90 >= 30 and v_sem_origem::numeric / v_leads90 >= 0.5 then
    out := out || jsonb_build_object(
      'id', 'crm-sem-origem', 'fonte', 'crm', 'severidade', 'media',
      'titulo', format('%s%% dos leads dos últimos 90 dias estão sem origem preenchida', round(v_sem_origem * 100.0 / v_leads90)),
      'evidencia', format('%s de %s leads sem o campo de origem.', v_sem_origem, v_leads90),
      'causa', 'O campo de origem não é obrigatório no CRM ou não é preenchido no atendimento.',
      'correcao', 'Tornar a origem obrigatória ao criar o lead (Instagram, anúncio, indicação, Google, paciente antigo) e preencher nos leads abertos.',
      'responsavel', 'comercial',
      'afeta', 'Quanto do resultado vem do Instagram e dos anúncios.');
  end if;

  if v_leads90 >= 30 and v_ganhos90 = 0 then
    out := out || jsonb_build_object(
      'id', 'crm-sem-ganho', 'fonte', 'crm', 'severidade', 'media',
      'titulo', format('Nenhum lead marcado como ganho em 90 dias (%s leads no período)', v_leads90),
      'evidencia', format('%s leads criados nos últimos 90 dias e 0 ganhos registrados.', v_leads90),
      'causa', 'A equipe agenda e atende, mas não marca o lead como ganho no CRM.',
      'correcao', 'Marcar como Ganho quando a consulta acontecer ou o procedimento for fechado (e, se possível, o valor).',
      'responsavel', 'comercial',
      'afeta', 'Taxa de conversão, retorno do investimento, custo por paciente.');
  end if;

  -- Mesmo CRM em mais de um cliente.
  for r in
    select count(distinct o.client_id) n
    from crm_connections c join crm_connections o
      on o.provider = c.provider and o.subdomain = c.subdomain and o.client_id <> c.client_id and o.active
    where c.client_id = p_client_id and c.active and c.subdomain is not null
    having count(distinct o.client_id) > 0
  loop
    out := out || jsonb_build_object(
      'id', 'crm-compartilhado', 'fonte', 'crm', 'severidade', 'media',
      'titulo', format('Este CRM está ligado a mais %s cliente(s)', r.n),
      'evidencia', 'A mesma conta do CRM (mesmo endereço) aparece conectada a outro cliente do painel. Os números de leads são os mesmos nos dois.',
      'causa', 'Clínica com mais de um médico usando uma conta só do CRM.',
      'correcao', 'Separar por funil, etiqueta ou responsável no CRM e configurar no cadastro qual pertence a qual médico. Até lá, os números do CRM são da clínica inteira.',
      'responsavel', 'equipe_hub',
      'afeta', 'Todos os números do CRM deste cliente.');
  end loop;

  -- Erro de configuração na sincronização.
  for r in select fonte, last_error from sync_status where client_id = p_client_id and last_error is not null loop
    out := out || jsonb_build_object(
      'id', 'sync-erro-' || r.fonte, 'fonte', r.fonte, 'severidade', 'alta',
      'titulo', format('A sincronização de %s está falhando', case r.fonte when 'crm' then 'CRM' when 'anuncios' then 'anúncios' when 'atendimento' then 'WhatsApp' else r.fonte end),
      'evidencia', 'Erro na última tentativa: ' || left(r.last_error, 200),
      'causa', case when r.last_error ilike '%subdom%' then 'Falta o endereço (subdomínio) do CRM no cadastro do cliente.'
                    when r.last_error ~* '(token|oauth|permission|expired)' then 'O acesso venceu ou foi revogado na origem.'
                    else 'Erro técnico na integração.' end,
      'correcao', case when r.last_error ilike '%subdom%' then 'Preencher o subdomínio do CRM em Admin > cliente > CRM.'
                       when r.last_error ~* '(token|oauth|permission|expired)' then 'Pedir ao cliente para autorizar o acesso de novo.'
                       else 'Equipe Doctor Creator: verificar o erro da integração.' end,
      'responsavel', case when r.last_error ~* '(token|oauth|permission|expired)' then 'medico' else 'equipe_hub' end,
      'afeta', 'Todos os números desta fonte.');
  end loop;

  -- ---------------- Instagram ----------------
  select exists (select 1 from instagram_accounts where client_id = p_client_id and active) into v_tem_ig;
  if v_tem_ig then
    select max(date) filter (where reach is not null), max(date) into v_ig_reach, v_ig_qualquer
      from instagram_account_daily_metrics where client_id = p_client_id;
    select max(metrics_updated_at)::date into v_posts_atual from instagram_posts where client_id = p_client_id;

    if v_ig_reach is not null and v_ig_reach < hoje - 3 then
      out := out || jsonb_build_object(
        'id', 'ig-alcance-parado', 'fonte', 'instagram', 'severidade', 'alta',
        'titulo', format('Métricas diárias do Instagram (alcance, interações) pararam em %s', to_char(v_ig_reach, 'DD/MM')),
        'evidencia', format('Último dia com alcance: %s%s.', to_char(v_ig_reach, 'DD/MM'),
          case when v_ig_qualquer > v_ig_reach then format('; o número de seguidores continua chegando (até %s)', to_char(v_ig_qualquer, 'DD/MM')) else '' end),
        'causa', 'A coleta diária da conta não está trazendo as métricas (a sincronização "funciona", mas grava zero linhas). Em geral a conta saiu da fonte de dados ou o acesso venceu.',
        'correcao', 'Equipe Doctor Creator: conferir a conexão da conta na fonte (Windsor ou Meta Business) e rodar a coleta do histórico.',
        'responsavel', 'equipe_hub',
        'afeta', 'Alcance, interações, taxa de engajamento e tudo que depende deles.');
    end if;
    if v_posts_atual is not null and v_posts_atual < hoje - 3 then
      out := out || jsonb_build_object(
        'id', 'ig-posts-parados', 'fonte', 'instagram', 'severidade', 'media',
        'titulo', format('Métricas dos posts não são atualizadas desde %s', to_char(v_posts_atual, 'DD/MM')),
        'evidencia', format('Última atualização de métricas de post: %s.', to_char(v_posts_atual, 'DD/MM')),
        'causa', 'A coleta de posts desta conta não está rodando ou não tem permissão para ler as métricas.',
        'correcao', 'Equipe Doctor Creator: verificar o acesso da conta e rodar a coleta de posts.',
        'responsavel', 'equipe_hub',
        'afeta', 'Ranking de posts, formatos, ideias e relatório.');
    end if;

    -- Seguidores: ganhos - saídas deve fechar com a variação do total.
    select followers_count, date into v_seg_ini, v_seg_dia_ini from instagram_account_daily_metrics
      where client_id = p_client_id and followers_count is not null and date >= hoje - 30 order by date asc limit 1;
    select followers_count, date into v_seg_fim, v_seg_dia_fim from instagram_account_daily_metrics
      where client_id = p_client_id and followers_count is not null and date >= hoje - 30 order by date desc limit 1;
    if v_seg_dia_ini is not null and v_seg_dia_fim > v_seg_dia_ini + 7 then
      select coalesce(sum(new_followers), 0), coalesce(sum(unfollowers), 0) into v_novos, v_saidas
        from instagram_account_daily_metrics where client_id = p_client_id and date > v_seg_dia_ini and date <= v_seg_dia_fim;
      if v_saidas > 0 and abs((v_novos - v_saidas) - (v_seg_fim - v_seg_ini)) > greatest(50, abs(v_seg_fim - v_seg_ini) * 0.3) then
        out := out || jsonb_build_object(
          'id', 'ig-seguidores-nao-fecham', 'fonte', 'instagram', 'severidade', 'media',
          'titulo', 'A conta de seguidores não fecha: ganhos menos saídas não bate com a variação do total',
          'evidencia', format('De %s a %s: total foi de %s para %s (%s). Ganhos %s, saídas %s (saldo %s).',
            to_char(v_seg_dia_ini, 'DD/MM'), to_char(v_seg_dia_fim, 'DD/MM'), v_seg_ini, v_seg_fim, v_seg_fim - v_seg_ini, v_novos, v_saidas, v_novos - v_saidas),
          'causa', 'Dias sem coleta de ganhos/saídas no meio do período, ou o Instagram ainda está fechando os números de alguns dias.',
          'correcao', 'Use a variação do total como referência de crescimento. Equipe Doctor Creator: conferir os dias sem coleta.',
          'responsavel', 'equipe_hub',
          'afeta', 'Novos seguidores e crescimento líquido.');
      end if;
    end if;
  end if;

  -- ---------------- Anúncios ----------------
  select exists (select 1 from meta_ads_daily where client_id = p_client_id) into v_tem_ads;
  if v_tem_ads then
    select max(date) into v_ads_ultimo from meta_ads_daily where client_id = p_client_id and spend > 0;
    if v_ads_ultimo < hoje - 7 then
      out := out || jsonb_build_object(
        'id', 'ads-sem-gasto', 'fonte', 'anuncios', 'severidade', 'media',
        'titulo', format('Nenhum gasto em anúncio desde %s', to_char(v_ads_ultimo, 'DD/MM')),
        'evidencia', format('Último dia com gasto: %s. A sincronização roda sem erro.', to_char(v_ads_ultimo, 'DD/MM')),
        'causa', 'Campanhas pausadas, sem verba ou com pagamento pendente na Meta.',
        'correcao', 'Confirmar com o cliente se os anúncios foram pausados de propósito; se não, verificar pagamento no Gerenciador.',
        'responsavel', 'gestor_trafego',
        'afeta', 'Leitura de anúncios do período.');
    end if;
    select count(distinct d.campaign_id), coalesce(sum(d.spend), 0) into v_sem_obj, v_gasto_sem_obj
      from meta_ads_daily d left join meta_ads_campaigns c
        on c.client_id = d.client_id and c.ad_account_id = d.ad_account_id and c.campaign_id = d.campaign_id
      where d.client_id = p_client_id and d.date >= hoje - 30 and d.spend > 0 and c.objective is null;
    if v_sem_obj > 0 and v_gasto_sem_obj >= 50 then
      out := out || jsonb_build_object(
        'id', 'ads-sem-objetivo', 'fonte', 'anuncios', 'severidade', 'media',
        'titulo', format('%s campanha(s) com gasto e sem objetivo cadastrado', v_sem_obj),
        'evidencia', format('R$ %s nos últimos 30 dias em campanhas sem o cadastro (nome e objetivo).', to_char(v_gasto_sem_obj, 'FM999G999D00')),
        'causa', 'A campanha foi criada depois da última leitura do cadastro de campanhas.',
        'correcao', 'Equipe Doctor Creator: rodar a sincronização de anúncios para ler o cadastro das campanhas.',
        'responsavel', 'equipe_hub',
        'afeta', 'Diagnóstico por objetivo: sem objetivo a campanha não tem régua.');
    end if;
  end if;

  return out;
end;
$function$;

revoke all on function public.qualidade_dados(uuid) from public, anon;
grant execute on function public.qualidade_dados(uuid) to authenticated;
revoke all on function public.lead_ultima_movimentacao(text, jsonb, timestamptz) from public, anon;
grant execute on function public.lead_ultima_movimentacao(text, jsonb, timestamptz) to authenticated;

-- Data do Instagram no selo de frescor: último dia COM alcance.
create or replace function public.client_sync_status(p_client_id uuid)
 returns table(fonte text, last_attempt_at timestamp with time zone, last_success_at timestamp with time zone, last_error text, last_rows integer, data_ate date, motivo text, motivo_dono text)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_ig date;
  v_ig_posts date;
  v_ads date;
  v_crm date;
  v_wts date;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client_id)) then
    return;
  end if;

  select max(date) into v_ig from instagram_account_daily_metrics where client_id = p_client_id and reach is not null;
  select max(metrics_updated_at)::date into v_ig_posts from instagram_posts where client_id = p_client_id;
  if v_ig is not null and v_ig_posts is not null then v_ig := least(v_ig, v_ig_posts);
  else v_ig := coalesce(v_ig, v_ig_posts); end if;

  select max(date) into v_ads from meta_ads_daily where client_id = p_client_id;
  select max(coalesce(occurred_at, received_at))::date into v_crm from crm_leads where client_id = p_client_id;
  select max(started_at)::date into v_wts from wts_sessions where client_id = p_client_id;

  return query
  select f.fonte,
         s.last_attempt_at, s.last_success_at, s.last_error, s.last_rows,
         case f.fonte
           when 'instagram' then v_ig
           when 'anuncios' then v_ads
           when 'crm' then v_crm
           when 'atendimento' then v_wts
           else s.last_success_at::date
         end,
         s.motivo, s.motivo_dono
  from (values ('instagram'),('comentarios'),('anuncios'),('crm'),('atendimento')) as f(fonte)
  left join sync_status s on s.client_id = p_client_id and s.fonte = f.fonte;
end;
$function$;
