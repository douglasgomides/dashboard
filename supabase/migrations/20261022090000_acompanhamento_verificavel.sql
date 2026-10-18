-- Pilotos operacionais: contato humano verificável no Nexo e acessos críticos no SAP.
-- Arquivo criado pelo CLI e ordenado depois das dependências de 21/10 existentes no repositório.
-- Nenhuma mensagem, publicação, conversão ou alteração de orçamento é enviada por esta migração.

-- A concessão padrão antiga só vale para clientes sem nenhum contrato registrado.
-- Um contrato SAP explícito não concede Nexo por ausência de uma linha hub.
create or replace function public.tem_modulo(p_client_id uuid,p_modulo text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when not (public.is_app_admin() or public.is_client_member(p_client_id) or coalesce(auth.jwt()->>'role','')='service_role') then false
    when exists(select 1 from public.cliente_modulos m where m.client_id=p_client_id) then
      exists(select 1 from public.cliente_modulos m where m.client_id=p_client_id and m.modulo=p_modulo and m.status in ('ativo','beta'))
    else p_modulo='hub' end;
$$;
revoke all on function public.tem_modulo(uuid,text) from public,anon;
grant execute on function public.tem_modulo(uuid,text) to authenticated,service_role;

alter table public.conversas add column if not exists mensagens_conferidas_em timestamptz,
  add column if not exists mensagens_conferencia_em timestamptz,
  add column if not exists mensagens_cobertura text check (mensagens_cobertura in ('completa','parcial','erro'));

alter table public.sugestoes_agentes add column if not exists medicao jsonb not null default '{}';

-- Eventos observados, com referência à origem. Ganho NÃO implica agendamento/comparecimento/pagamento.
-- Helper interno: somente chamadas privilegiadas das RPCs abaixo, nunca exposto ao cliente.
create or replace function public.operacao_eventos_conversa(p_conversa uuid, p_desde timestamptz)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo, 'fonte', fonte, 'id', id, 'em', em) order by em), '[]')
  from (
    select case when e.tipo = 'ganhou' then 'fechou' else m.marco end as tipo,
      'crm_etapa_mapeada'::text as fonte, e.id::text as id, e.ocorreu_em as em
    from public.conversas c
    join public.crm_leads l on l.id = c.lead_id and l.client_id = c.client_id
    join public.crm_lead_eventos e on e.client_id = c.client_id and e.crm_connection_id = l.crm_connection_id
      and e.external_lead_id = l.external_lead_id
    left join public.sap_etapa_marco m on m.crm_connection_id = e.crm_connection_id
      and m.pipeline_id = e.pipeline_para and m.status_id = e.status_para
    where c.id = p_conversa and e.ocorreu_em > p_desde and e.ocorreu_em <= now()
      and (e.tipo = 'ganhou' or (e.tipo in ('entrou','mudou_etapa') and m.marco in ('agendado','compareceu','fechou')))
    union all
    select 'perdeu', 'crm_evento', e.id::text, e.ocorreu_em
    from public.conversas c join public.crm_leads l on l.id = c.lead_id and l.client_id = c.client_id
    join public.crm_lead_eventos e on e.client_id = c.client_id and e.crm_connection_id = l.crm_connection_id
      and e.external_lead_id = l.external_lead_id
    where c.id = p_conversa and e.tipo = 'perdeu' and e.ocorreu_em > p_desde and e.ocorreu_em <= now()
  ) eventos;
$$;
revoke all on function public.operacao_eventos_conversa(uuid,timestamptz) from public, anon, authenticated;

-- Contrato v2: atividade posterior é observação, não execução nem efeito causado pela sugestão.
create or replace function public.sugestoes_medir()
returns integer language plpgsql security definer set search_path = '' as $$
declare s record; ev jsonb; contato jsonb; resposta jsonb; med jsonb; res text; n integer := 0;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'sem permissao'; end if;
  for s in select * from public.sugestoes_agentes where agente = 'recuperacao'
    and estado <> 'descartada' and criado_em > now() - interval '30 days' for update skip locked
  loop
    ev := public.operacao_eventos_conversa(s.conversa_id,s.criado_em);
    contato := null; resposta := null;
    select jsonb_build_object('id',m.id,'em',m.enviada_em,'fonte','mensagens') into contato
      from public.mensagens m where m.conversa_id = s.conversa_id and m.client_id = s.client_id
      and m.direcao = 'saida' and m.tipo not in ('kommo_robo','sistema') and btrim(m.externo_id) <> ''
      and m.enviada_em > s.criado_em and m.enviada_em <= now() order by m.enviada_em limit 1;
    if contato is not null then
      select jsonb_build_object('id',m.id,'em',m.enviada_em,'fonte','mensagens') into resposta
        from public.mensagens m where m.conversa_id = s.conversa_id and m.client_id = s.client_id
        and m.direcao = 'entrada' and m.enviada_em > (contato->>'em')::timestamptz and m.enviada_em <= now()
        order by m.enviada_em limit 1;
    end if;
    res := case when ev @> '[{"tipo":"fechou"}]' then 'fechou'
      when ev @> '[{"tipo":"compareceu"}]' then 'compareceu'
      when ev @> '[{"tipo":"agendado"}]' then 'agendou'
      when resposta is not null then 'respondeu' when contato is not null then 'enviada' else null end;
    med := jsonb_build_object('versao',2,'atribuicao','nao_demonstrada','contato_observado',contato,
      'resposta_observada',resposta,'eventos_crm',ev,'legado',
      case when s.medicao->>'versao'='2' then s.medicao->'legado'
        else jsonb_build_object('estado',s.estado,'resultado',s.resultado,'medido_em',s.medido_em,'decidido_por',s.decidido_por,'decidido_em',s.decidido_em) end);
    if s.medicao is distinct from med or s.resultado is distinct from res then
      update public.sugestoes_agentes set medicao=med, resultado=res, medido_em=now(),
        estado=case when coalesce(s.medicao->>'versao','')<>'2' and s.estado='feita'
          and s.decidido_por is null and s.decidido_em is null and s.medido_em is not null
          and s.criado_em>now()-interval '14 days' then 'proposta' else estado end where id=s.id;
      n := n+1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function public.sugestoes_medir() from public, anon, authenticated;
grant execute on function public.sugestoes_medir() to service_role;

create table public.operacao_recuperacao (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  sugestao_id uuid not null unique references public.sugestoes_agentes(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  responsavel_id uuid not null references auth.users(id),
  responsavel_nome text not null,
  prazo timestamptz not null,
  estado text not null check (estado in ('pronta','aguardando_resposta','bloqueada','escalada','resolvida','cancelada')),
  motivo text,
  mensagem_id uuid unique references public.mensagens(id),
  aprovado_em timestamptz not null default now(),
  detectado_em timestamptz not null,
  verificado_em timestamptz not null default '-infinity',
  observacao jsonb not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index operacao_recuperacao_caso_ativo on public.operacao_recuperacao(conversa_id)
  where estado not in ('resolvida','cancelada');
create index operacao_recuperacao_revisar on public.operacao_recuperacao(verificado_em,id) where estado <> 'cancelada';
create index operacao_recuperacao_cliente on public.operacao_recuperacao(client_id,atualizado_em desc);
create index operacao_recuperacao_responsavel on public.operacao_recuperacao(responsavel_id);
create index operacao_recuperacao_mensagem on public.operacao_recuperacao(mensagem_id) where mensagem_id is not null;
alter table public.operacao_recuperacao enable row level security;
revoke all on public.operacao_recuperacao from anon, authenticated;
grant select on public.operacao_recuperacao to authenticated;
grant all on public.operacao_recuperacao to service_role;
create policy operacao_recuperacao_ler on public.operacao_recuperacao for select to authenticated
  using ((public.is_app_admin() or public.is_client_member(client_id)) and public.tem_modulo(client_id,'hub'));

create table public.operacao_historico (
  id bigint generated always as identity primary key,
  trabalho_id uuid not null references public.operacao_recuperacao(id) on delete cascade,
  acao text not null,
  por uuid references auth.users(id),
  evidencia jsonb not null default '{}',
  em timestamptz not null default now()
);
create index operacao_historico_trabalho on public.operacao_historico(trabalho_id,em);
create index operacao_historico_por on public.operacao_historico(por) where por is not null;
alter table public.operacao_historico enable row level security;
revoke all on public.operacao_historico from anon, authenticated;
grant select on public.operacao_historico to authenticated;
grant all on public.operacao_historico to service_role;
create policy operacao_historico_ler on public.operacao_historico for select to authenticated
  using (exists(select 1 from public.operacao_recuperacao t where t.id=trabalho_id));

-- Prazo de atualidade do piloto assistido: lote de até 36h, visível na interface.
-- Não é uma promessa de atendimento em tempo real. CRM ausente bloqueia contato deste piloto.
create or replace function public.operacao_instante(p_texto text)
returns timestamptz language plpgsql stable set search_path = '' as $$
begin return p_texto::timestamptz; exception when others then return null; end;
$$;
revoke all on function public.operacao_instante(text) from public,anon,authenticated;

create or replace function public.operacao_conversa_atual(p_conversa_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(case when c.provider='kommo' then
    cc.config->>'kommo_conversas_cobertura'='completa'
    and public.operacao_instante(cc.config->>'kommo_conversas_ate') between now()-interval '36 hours' and now()+interval '1 minute'
    else c.mensagens_cobertura='completa' and c.mensagens_conferidas_em between now()-interval '36 hours' and now()+interval '1 minute' end,false)
  from public.conversas c left join public.crm_leads l on l.id=c.lead_id and l.client_id=c.client_id
  left join public.crm_connections cc on cc.id=l.crm_connection_id and cc.client_id=c.client_id
  where c.id=p_conversa_id;
$$;
revoke all on function public.operacao_conversa_atual(uuid) from public,anon,authenticated;

create or replace function public.operacao_fontes(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare fontes jsonb; ok boolean; msgs timestamptz; crm public.sync_status;
begin
  if not ((coalesce(auth.jwt()->>'role','')='service_role' or public.is_app_admin() or public.is_client_member(p_client_id))
    and public.tem_modulo(p_client_id,'hub')) then raise exception 'sem permissao'; end if;
  select max(em) into msgs from (
    select c.mensagens_conferidas_em em from public.conversas c where c.client_id=p_client_id and c.mensagens_cobertura='completa' and c.mensagens_conferidas_em<=now()+interval '1 minute'
    union all select public.operacao_instante(cc.config->>'kommo_conversas_ate') from public.crm_connections cc
      where cc.client_id=p_client_id and cc.provider='kommo' and cc.active and cc.config->>'kommo_conversas_cobertura'='completa' and public.operacao_instante(cc.config->>'kommo_conversas_ate')<=now()+interval '1 minute'
  ) coberturas;
  select * into crm from public.sync_status s where s.client_id=p_client_id and s.fonte='crm';
  fontes:=jsonb_build_array(
    jsonb_build_object('fonte','mensagens','sucesso_em',msgs,'dados_ate',null,'erro_posterior',false,
      'atual',coalesce(msgs>now()-interval '36 hours',false)),
    jsonb_build_object('fonte','crm','sucesso_em',crm.last_success_at,'dados_ate',crm.data_ate,
      'erro_posterior',coalesce(crm.last_error,'')<>'' and crm.last_attempt_at>coalesce(crm.last_success_at,'-infinity'),
      'atual',coalesce(crm.last_success_at between now()-interval '36 hours' and now()+interval '1 minute' and (crm.data_ate is null or crm.data_ate>=current_date-1)
        and not (coalesce(crm.last_error,'')<>'' and crm.last_attempt_at>coalesce(crm.last_success_at,'-infinity')),false)));
  select bool_and((x->>'atual')::boolean) into ok from jsonb_array_elements(fontes) x;
  return jsonb_build_object('apto',ok,'limite_horas',36,'fontes',fontes,'cobertura','conferida_por_caso');
end;
$$;
revoke all on function public.operacao_fontes(uuid) from public, anon;
grant execute on function public.operacao_fontes(uuid) to authenticated,service_role;

create or replace function public.operacao_iniciar(p_sugestao_id uuid,p_prazo timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.sugestoes_agentes; v_id uuid; saude jsonb;
begin
  select * into s from public.sugestoes_agentes where id=p_sugestao_id for update;
  if s.id is null or not public.pode_editar_acoes(s.client_id) or not public.tem_modulo(s.client_id,'hub') then raise exception 'sem permissao'; end if;
  if s.agente <> 'recuperacao' or s.estado <> 'proposta' or s.conversa_id is null or s.criado_em < now()-interval '14 days'
    then raise exception 'proposta indisponivel'; end if;
  if not exists(select 1 from public.conversas c where c.id=s.conversa_id and c.client_id=s.client_id) then raise exception 'conversa invalida'; end if;
  if p_prazo is null or p_prazo <= now() or p_prazo > now()+interval '7 days' then raise exception 'prazo deve estar nos proximos 7 dias'; end if;
  -- Mesma conversa é serializada mesmo se duas propostas forem assumidas simultaneamente.
  perform 1 from public.conversas where id=s.conversa_id for update;
  select id into v_id from public.operacao_recuperacao where sugestao_id=s.id
    or (conversa_id=s.conversa_id and estado not in ('resolvida','cancelada')) order by criado_em limit 1;
  if v_id is not null then return v_id; end if;
  saude := public.operacao_fontes(s.client_id);
  insert into public.operacao_recuperacao(client_id,sugestao_id,conversa_id,responsavel_id,responsavel_nome,prazo,estado,motivo,detectado_em)
  values(s.client_id,s.id,s.conversa_id,auth.uid(),coalesce(public.sap_nome_usuario(auth.uid()),'Responsável'),p_prazo,
    case when (saude->>'apto')::boolean then 'pronta' else 'bloqueada' end,
    case when not (saude->>'apto')::boolean then 'Atualizar atendimento e CRM antes de retomar contato.' end,s.criado_em)
  returning id into v_id;
  insert into public.operacao_historico(trabalho_id,acao,por,evidencia)
    values(v_id,'assumida',auth.uid(),jsonb_build_object('prazo',p_prazo,'fontes',saude));
  perform public.operacao_verificar_interno(s.client_id,v_id);
  return v_id;
end;
$$;
revoke all on function public.operacao_iniciar(uuid,timestamptz) from public,anon;
grant execute on function public.operacao_iniciar(uuid,timestamptz) to authenticated;

-- Verificação reexecutável. Nada é enviado: escolhe continuar, parar, bloquear ou escalar pelos fatos atuais.
create or replace function public.operacao_verificar_interno(p_client_id uuid,p_trabalho_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare t public.operacao_recuperacao; ev jsonb; obs jsonb; saude jsonb; nova text; v_motivo text;
  entrada public.mensagens; saida public.mensagens; enviada public.mensagens; n integer:=0; ultimo jsonb; saudes jsonb:='{}';
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    if p_client_id is null or not public.pode_editar_acoes(p_client_id) or not public.tem_modulo(p_client_id,'hub')
      then raise exception 'sem permissao'; end if;
  end if;
  for t in select * from public.operacao_recuperacao where (p_client_id is null or client_id=p_client_id) and (p_trabalho_id is null or id=p_trabalho_id)
    and estado <> 'cancelada' and (estado<>'resolvida' or criado_em>now()-interval '30 days') order by verificado_em,id limit 500 for update skip locked
  loop
    if t.criado_em<now()-interval '30 days' then
      nova:='cancelada'; v_motivo:='Janela de acompanhamento de 30 dias encerrada. Revisão humana necessária para novo plano.'; obs:=t.observacao;
    elsif not public.tem_modulo(t.client_id,'hub') then
      nova:='cancelada'; v_motivo:='Acesso ao Nexo suspenso.'; obs:=t.observacao;
    else
      saude:=saudes->t.client_id::text;
      if saude is null then saude:=public.operacao_fontes(t.client_id); saudes:=saudes||jsonb_build_object(t.client_id::text,saude); end if;
      ev:=public.operacao_eventos_conversa(t.conversa_id,t.detectado_em);
      entrada:=null; saida:=null; enviada:=null;
      select * into entrada from public.mensagens m where m.conversa_id=t.conversa_id and m.client_id=t.client_id
        and m.direcao='entrada' and m.enviada_em>t.detectado_em and m.enviada_em<=now() order by m.enviada_em limit 1;
      select * into saida from public.mensagens m where m.conversa_id=t.conversa_id and m.client_id=t.client_id
        and m.direcao='saida' and m.tipo not in ('kommo_robo','sistema') and m.enviada_em>t.detectado_em
        and m.enviada_em<=now() and m.id is distinct from t.mensagem_id order by m.enviada_em limit 1;
      select * into enviada from public.mensagens m where m.id=t.mensagem_id;
      select x into ultimo from jsonb_array_elements(ev) x order by (x->>'em')::timestamptz desc limit 1;
      nova:=case when t.mensagem_id is not null then 'aguardando_resposta' else 'pronta' end; v_motivo:=null;
      obs:=jsonb_build_object('eventos_crm',ev,'atribuicao','nao_demonstrada',
        'resposta',case when entrada.id is not null then jsonb_build_object('id',entrada.id,'em',entrada.enviada_em,'fonte','mensagens') end,
        'contato_vinculado',case when enviada.id is not null then jsonb_build_object('id',enviada.id,'externo_id',enviada.externo_id,'em',enviada.enviada_em,'fonte','mensagens') end);
      if t.mensagem_id is null and not (ev @> '[{"tipo":"agendado"}]' or ev @> '[{"tipo":"compareceu"}]' or ev @> '[{"tipo":"fechou"}]') and exists(select 1 from public.conversas c
        join public.crm_leads l on l.id=c.lead_id and l.client_id=c.client_id
        left join public.sap_etapa_marco m on m.crm_connection_id=l.crm_connection_id
          and m.pipeline_id=l.pipeline_id and m.status_id=l.status_id
        where c.id=t.conversa_id and (l.outcome in ('won','lost') or m.marco in ('agendado','compareceu','fechou'))
          ) then
        nova:='cancelada'; v_motivo:='CRM indica avanço ou encerramento sem evento posterior vinculado. Conferir o registro antes de retomar contato.';
      elsif ultimo->>'tipo'='perdeu' then nova:='cancelada'; v_motivo:='Perda registrada no CRM. Não retomar esta cadência.';
      elsif ev @> '[{"tipo":"fechou"}]' or ev @> '[{"tipo":"compareceu"}]' or ev @> '[{"tipo":"agendado"}]' then
        nova:='resolvida'; v_motivo:=case when ev @> '[{"tipo":"fechou"}]' then 'Venda registrada no CRM. Pagamento não conciliado.'
          when ev @> '[{"tipo":"compareceu"}]' then 'Comparecimento registrado em etapa mapeada do CRM.' else 'Agendamento registrado em etapa mapeada do CRM.' end;
      elsif entrada.id is not null then nova:='resolvida'; v_motivo:='Resposta recebida. A equipe assume o atendimento e esta cadência para.';
      elsif exists(select 1 from public.sugestoes_agentes s where s.id=t.sugestao_id and s.estado='descartada') then
        nova:='cancelada'; v_motivo:='Proposta descartada pela equipe.';
      elsif saida.id is not null then nova:='escalada'; v_motivo:='Há outra mensagem da equipe. Confira o histórico antes de novo contato.';
      elsif not public.operacao_conversa_atual(t.conversa_id) then nova:='bloqueada'; v_motivo:='Mensagens deste caso sem coleta completa nas últimas 36h. Reconferir a conversa no provedor.';
      elsif not (saude->>'apto')::boolean then nova:='bloqueada'; v_motivo:='Atendimento ou CRM sem atualização confiável nas últimas 36h. Atualize a fonte.';
      elsif not exists(select 1 from public.app_admins a where a.user_id=t.responsavel_id) and not exists
        (select 1 from public.client_members m where m.client_id=t.client_id and m.user_id=t.responsavel_id and m.role in ('owner','strategist')) then
        nova:='escalada'; v_motivo:='Responsável sem permissão de execução. Reatribua o caso.';
      elsif t.prazo < now() then nova:='escalada'; v_motivo:='Prazo vencido sem desfecho confirmado. Revisar o caso; não repetir contato automaticamente.';
      elsif enviada.id is not null and enviada.enviada_em < now()-interval '3 days' then nova:='escalada'; v_motivo:='Sem resposta após 3 dias. A equipe decide o próximo passo.';
      end if;
      obs:=obs||jsonb_build_object('fontes',saude);
    end if;
    if t.estado is distinct from nova or t.motivo is distinct from v_motivo or t.observacao is distinct from obs then
      update public.operacao_recuperacao set estado=nova,motivo=v_motivo,observacao=obs,atualizado_em=now() where id=t.id;
      insert into public.operacao_historico(trabalho_id,acao,evidencia) values(t.id,'verificada',
        jsonb_build_object('de',t.estado,'para',nova,'motivo',v_motivo,'observacao',obs));
      n:=n+1;
    end if;
    update public.operacao_recuperacao set verificado_em=now() where id=t.id;
  end loop;
  return n;
end;
$$;
revoke all on function public.operacao_verificar_interno(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.operacao_verificar(p_client_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
begin return public.operacao_verificar_interno(p_client_id,null); end;
$$;
revoke all on function public.operacao_verificar(uuid) from public,anon;
grant execute on function public.operacao_verificar(uuid) to authenticated,service_role;

create or replace function public.operacao_vincular_mensagem(p_trabalho_id uuid,p_mensagem_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.operacao_recuperacao; m public.mensagens;
begin
  select * into t from public.operacao_recuperacao where id=p_trabalho_id;
  if t.id is null or not public.pode_editar_acoes(t.client_id) or not public.tem_modulo(t.client_id,'hub') then raise exception 'sem permissao'; end if;
  perform public.operacao_verificar_interno(t.client_id,t.id);
  select * into t from public.operacao_recuperacao where id=p_trabalho_id for update;
  if t.mensagem_id=p_mensagem_id then return; end if;
  -- Outra saída leva a revisão humana. O vínculo explícito ainda é permitido, nunca após resposta/avanço/bloqueio.
  if t.estado not in ('pronta','escalada','resolvida') or t.mensagem_id is not null then raise exception 'caso nao aceita novo contato'; end if;
  if not public.operacao_conversa_atual(t.conversa_id) or not (public.operacao_fontes(t.client_id)->>'apto')::boolean then raise exception 'atualize as fontes antes de vincular'; end if;
  select * into m from public.mensagens where id=p_mensagem_id and client_id=t.client_id and conversa_id=t.conversa_id
    and direcao='saida' and tipo not in ('kommo_robo','sistema') and btrim(externo_id)<>''
    and enviada_em>t.aprovado_em and enviada_em<=now();
  if m.id is null then raise exception 'mensagem da clinica nao encontrada nesta conversa apos a aprovacao'; end if;
  if exists(select 1 from public.mensagens e where e.conversa_id=t.conversa_id and e.direcao='entrada'
    and e.enviada_em>t.aprovado_em and e.enviada_em<=m.enviada_em) or exists
    (select 1 from jsonb_array_elements(public.operacao_eventos_conversa(t.conversa_id,t.aprovado_em)) e
      where (e->>'em')::timestamptz<=m.enviada_em)
    then raise exception 'o caso ja havia avancado antes desta mensagem'; end if;
  update public.operacao_recuperacao set mensagem_id=m.id,estado=case when t.estado='resolvida' then 'resolvida' else 'aguardando_resposta' end,
    motivo=case when t.estado='resolvida' then t.motivo end,
    observacao=t.observacao||jsonb_build_object('contato_vinculado',jsonb_build_object('id',m.id,'externo_id',m.externo_id,'em',m.enviada_em,'fonte','mensagens')),
    prazo=greatest(t.prazo,m.enviada_em+interval '3 days'),atualizado_em=now() where id=t.id;
  insert into public.operacao_historico(trabalho_id,acao,por,evidencia) values(t.id,'contato_vinculado',auth.uid(),
    jsonb_build_object('mensagem_id',m.id,'externo_id',m.externo_id,'em',m.enviada_em,'autoria','declarada_pela_equipe'));
end;
$$;
revoke all on function public.operacao_vincular_mensagem(uuid,uuid) from public,anon;
grant execute on function public.operacao_vincular_mensagem(uuid,uuid) to authenticated;

create or replace function public.operacao_encerrar(p_trabalho_id uuid,p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.operacao_recuperacao;
begin
  select * into t from public.operacao_recuperacao where id=p_trabalho_id for update;
  if t.id is null or not public.pode_editar_acoes(t.client_id) or not public.tem_modulo(t.client_id,'hub') then raise exception 'sem permissao'; end if;
  if length(btrim(coalesce(p_motivo,'')))<5 or length(p_motivo)>500 then raise exception 'informe o motivo (5 a 500 caracteres)'; end if;
  if t.estado in ('resolvida','cancelada') then return; end if;
  update public.operacao_recuperacao set estado='cancelada',motivo=p_motivo,atualizado_em=now() where id=t.id;
  insert into public.operacao_historico(trabalho_id,acao,por,evidencia) values(t.id,'encerrada',auth.uid(),jsonb_build_object('motivo',p_motivo));
end;
$$;
revoke all on function public.operacao_encerrar(uuid,text) from public,anon;
grant execute on function public.operacao_encerrar(uuid,text) to authenticated;

-- SAP: reutiliza as ações combinadas e os papéis existentes, sem criar outro gerenciador de tarefas.
create table public.sap_marco_vinculos (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  marco integer not null check(marco=5),
  clickup_task_id text not null check(clickup_task_id ~ '^[A-Za-z0-9_-]{3,128}$'),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id),
  primary key(clinica_id,marco)
);
alter table public.sap_marco_vinculos enable row level security;
revoke all on public.sap_marco_vinculos from anon,authenticated;
grant select on public.sap_marco_vinculos to authenticated;
grant all on public.sap_marco_vinculos to service_role;
create index sap_marco_vinculos_autor on public.sap_marco_vinculos(atualizado_por) where atualizado_por is not null;
create policy sap_marco_vinculos_ler on public.sap_marco_vinculos for select to authenticated using(public.sap_pode_ler(clinica_id));
create or replace function public.sap_vincular_marco(p_clinica_id uuid,p_task_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  perform 1 from public.sap_clinicas where id=p_clinica_id for update;
  if not found then raise exception 'clinica nao encontrada'; end if;
  if p_task_id is null or p_task_id !~ '^[A-Za-z0-9_-]{3,128}$' then raise exception 'ID de tarefa invalido'; end if;
  insert into public.sap_marco_vinculos(clinica_id,marco,clickup_task_id,atualizado_por)
    values(p_clinica_id,5,p_task_id,auth.uid()) on conflict(clinica_id,marco) do update
    set clickup_task_id=excluded.clickup_task_id,atualizado_em=now(),atualizado_por=auth.uid();
end;
$$;
revoke all on function public.sap_vincular_marco(uuid,text) from public,anon;
grant execute on function public.sap_vincular_marco(uuid,text) to authenticated;

create or replace function public.operacao_acessos_catalogo()
returns table(item text,nome text,papel text) language sql immutable set search_path = '' as $$
  values ('A1','Business Manager (portfólio empresarial) da clínica','trafego'),('A2','Doctor Creator como parceira','trafego'),
    ('A3','Conta de anúncios atribuída ao parceiro','trafego'),('A4','Página do Facebook e Instagram atribuídos','trafego'),
    ('A5','Pixel ou conjunto de dados','trafego'),('A6','Classificação da fonte como saúde e bem-estar','trafego'),
    ('A11','Histórico de restrições','trafego'),('D1','Histórico da agenda dos últimos 90 dias','onboarding'),
    ('D3','Números de atendimento e fechamento dos últimos 3 meses','onboarding');
$$;
revoke all on function public.operacao_acessos_catalogo() from public,anon,authenticated;

create or replace function public.operacao_acesso_valido(a public.sap_acessos)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(a.revogado_em is null and a.confirmado_em is not null and a.confirmado_em <= (now() at time zone 'America/Sao_Paulo')::date
    and nullif(btrim(a.confirmado_por),'') is not null and (a.status='confirmado'
      or (a.status='nao_se_aplica' and length(btrim(coalesce(a.observacao,'')))>=5)),false);
$$;
revoke all on function public.operacao_acesso_valido(public.sap_acessos) from public,anon,authenticated;

create unique index sap_acoes_acesso_unico on public.sap_acoes(clinica_id,codigo) where codigo like 'agente_acesso_%';
create or replace function public.operacao_dia_util(p_data date)
returns boolean language plpgsql immutable set search_path = '' as $$
declare y integer:=extract(year from p_data); a integer; b integer; c integer; d integer; e integer; f integer; g integer;
 h integer; i integer; k integer; l integer; m integer; n integer; pascoa date;
begin
 if p_data is null then return false; end if;
 a:=y%19; b:=y/100; c:=y%100; d:=b/4; e:=b%4; f:=(b+8)/25; g:=(b-f+1)/3;
 h:=(19*a+b-d-g+15)%30; i:=c/4; k:=c%4; l:=(32+2*e+2*i-h-k)%7; m:=(a+11*h+22*l)/451;
 n:=h+l-7*m+114; pascoa:=make_date(y,n/31,n%31+1);
 return extract(isodow from p_data)<6 and to_char(p_data,'MM-DD') not in
  ('01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25')
  and p_data not in (pascoa-48,pascoa-47,pascoa-2,pascoa+60);
end;
$$;
revoke all on function public.operacao_dia_util(date) from public,anon,authenticated;

create or replace function public.operacao_sap_conferir(p_clinica_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cli public.sap_clinicas; it record; a public.sap_acessos; dono text; valido boolean; ev text;
  prazo date; hoje date:=(now() at time zone 'America/Sao_Paulo')::date; p record; empurra integer:=0; anterior integer:=0;
  dur integer; pend integer:=0; resol integer:=0; acoes jsonb;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' and not public.is_app_admin() then raise exception 'sem permissao'; end if;
  select * into cli from public.sap_clinicas where id=p_clinica_id for update;
  if cli.id is null then raise exception 'clinica nao encontrada'; end if;
  -- Mesmo cálculo de dataDoDia(D7) e dia útil anterior, incluindo pausas formais.
  for p in select * from public.sap_pausas where clinica_id=cli.id and removido_em is null order by inicio,id loop
    select coalesce(sum(greatest(0,coalesce(x.fim,p.inicio)-x.inicio)),0)::integer into anterior
      from public.sap_pausas x where x.clinica_id=cli.id and x.removido_em is null and (x.inicio,x.id)<(p.inicio,p.id);
    dur:=greatest(0,coalesce(p.fim,hoje)-p.inicio);
    if 7 > (p.inicio-cli.d0)-anterior then empurra:=empurra+dur; end if;
  end loop;
  prazo:=cli.d0+7+empurra;
  if prazo is not null then while not public.operacao_dia_util(prazo) loop prazo:=prazo-1; end loop; end if;
  for it in select * from public.operacao_acessos_catalogo() loop
    select * into a from public.sap_acessos where clinica_id=cli.id and item=it.item;
    valido:=public.operacao_acesso_valido(a);
    if valido then resol:=resol+1; else pend:=pend+1; end if;
    select coalesce(pe.nome,public.sap_nome_usuario(sp.user_id)) into dono from public.sap_papeis sp
      left join public.pessoas_equipe pe on pe.id=sp.pessoa_id and pe.ativa
      where sp.clinica_id=cli.id and sp.papel=it.papel;
    dono:=case when it.papel='trafego' then 'Gestor de Tráfego' else 'Analista de Onboarding' end||coalesce(' · '||dono,' · atribuir em Quem é quem');
    ev:=case when valido then concat(it.item,': ',a.status,' em ',a.confirmado_em,' por ',a.confirmado_por,
      case when a.status='nao_se_aplica' then ' · '||a.observacao else '' end)
      else 'Falta confirmação com data e responsável; dispensa exige justificativa. Acesso revogado deve ser conferido novamente.' end;
    insert into public.sap_acoes(clinica_id,semana,origem,codigo,texto,lado,responsavel,prazo,status,resultado)
      values(cli.id,date_trunc('week',hoje)::date,'outro','agente_acesso_'||it.item,'Confirmar acesso: '||it.nome,'dc',dono,prazo,
        case when valido then 'feita' else 'aberta' end,ev)
      on conflict(clinica_id,codigo) where codigo like 'agente_acesso_%' do update
      set responsavel=excluded.responsavel,prazo=excluded.prazo,status=excluded.status,resultado=excluded.resultado,
        removido_em=null,atualizado_em=now();
  end loop;
  if pend>0 and exists(select 1 from public.sap_marco_status ms where ms.clinica_id=cli.id and ms.marco=5 and ms.concluido_em is not null) then
    update public.sap_marco_status set concluido_em=null,estado=null,desfeito_em=now(),desfeito_por=auth.uid(),
      desfeito_motivo='Acessos críticos pendentes, revogados ou sem evidência na reconferência operacional.',atualizado_em=now()
      where clinica_id=cli.id and marco=5;
    insert into public.sap_tarefa_historico(clinica_id,marco,acao,motivo) values(cli.id,5,'desfazer','Reconferência operacional encontrou acesso crítico pendente, revogado ou sem evidência.');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',ac.id,'codigo',ac.codigo,'texto',ac.texto,'responsavel',ac.responsavel,'prazo',ac.prazo,
    'status',ac.status,'resultado',ac.resultado) order by ac.codigo),'[]') into acoes from public.sap_acoes ac where ac.clinica_id=cli.id and ac.codigo like 'agente_acesso_%';
  return jsonb_build_object('pendentes',pend,'resolvidos',resol,'acoes',acoes,'proximo_passo',
    case when cli.d0 is null then 'Definir o D0 para calcular os prazos.'
      when pend>0 then 'Responsáveis conferem os acessos e registram data, autor e evidência na Ficha e acessos.'
      else 'Conferir o vínculo exato do ClickUp e solicitar aprovação do marco 5. Próxima etapa: preparar a Sessão 1 com kickoff, formulário e baseline.' end);
end;
$$;
revoke all on function public.operacao_sap_conferir(uuid) from public,anon;
grant execute on function public.operacao_sap_conferir(uuid) to authenticated,service_role;

-- Aprovação tem escopo: execução, cliente, clínica, passo, rodada e evidência aprovados.
alter table public.aprovacoes add column if not exists executada_em timestamptz;
create or replace function public.agentes_marcar_marco(p_aprovacao uuid,p_clinica_id uuid,p_marco integer,p_evidencia text)
returns void language plpgsql security definer set search_path = '' as $$
declare ap public.aprovacoes; ex public.agente_execucoes; cli public.sap_clinicas; anterior text; ev text; claims text;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'sem permissao'; end if;
  select * into ap from public.aprovacoes where id=p_aprovacao for update;
  select * into ex from public.agente_execucoes where id=ap.execucao_id for update;
  select * into cli from public.sap_clinicas where id=p_clinica_id for update;
  if ap.id is null or cli.id is null or cli.d0 is null or ex.id is null or ap.estado<>'aprovada' or ap.passo<>'aprovar_marco'
    or ap.client_id<>cli.client_id or ex.client_id<>cli.client_id or ex.fluxo<>'acessos_criticos' or p_marco<>5
    or ap.proposta->>'marco' is distinct from '5'
    or ex.estado is distinct from 'rodando' or ex.passo_atual is distinct from 7
    or ex.contexto->>'clinica_id' is distinct from cli.id::text
    or p_evidencia is null or length(btrim(p_evidencia))<10 or ap.proposta->>'evidencia' is distinct from p_evidencia
    or ap.proposta->>'rodada' is distinct from ex.contexto->>'rodada_marco'
    or ex.contexto->>'aprovacao_marco' is distinct from ap.id::text
    or not exists(select 1 from public.app_admins a where a.user_id=ap.decidido_por)
    then raise exception 'aprovacao fora do escopo'; end if;
  if ap.executada_em is not null then
    if exists(select 1 from public.sap_marco_status ms where ms.clinica_id=cli.id and ms.marco=5 and ms.concluido_em is not null
      and ms.evidencia=p_evidencia) and not exists(select 1 from public.operacao_acessos_catalogo() it
      left join public.sap_acessos a on a.clinica_id=cli.id and a.item=it.item where not public.operacao_acesso_valido(a)) then return; end if;
    raise exception 'aprovacao consumida e marco nao vigente; solicitar nova conferencia';
  end if;
  -- Trava as linhas contra revogação concorrente até a marcação terminar.
  perform 1 from public.sap_acessos a where a.clinica_id=cli.id for update;
  if exists(select 1 from public.operacao_acessos_catalogo() it left join public.sap_acessos a
      on a.clinica_id=cli.id and a.item=it.item where not public.operacao_acesso_valido(a))
    then raise exception 'acessos pendentes, revogados ou sem evidencia'; end if;
  -- Alteração após a conferência/aprovação precisa de nova rodada, mesmo se agora válida.
  if exists(select 1 from public.sap_acessos a where a.clinica_id=cli.id and a.item in
      (select item from public.operacao_acessos_catalogo()) and a.atualizado_em>ap.criado_em)
    then raise exception 'acessos alterados apos conferencia; solicitar nova aprovacao'; end if;
  perform 1 from public.sap_marco_vinculos v where v.clinica_id=cli.id and v.marco=5 for update;
  if not exists(select 1 from public.sap_marco_vinculos v where v.clinica_id=cli.id and v.marco=5
      and v.clickup_task_id=ex.contexto->'clickup_confirmado'->>'task_id'
      and cli.clickup_folder_id=ex.contexto->'clickup_confirmado'->>'folder_id'
      and ex.contexto->'clickup_confirmado'->>'status'='closed'
      and (ex.contexto->'clickup_confirmado'->>'em')::timestamptz > now()-interval '10 minutes'
      and (ex.contexto->'clickup_confirmado'->>'em')::timestamptz <= now()
      and v.atualizado_em <= ap.criado_em)
    then raise exception 'vinculo exato ClickUp obrigatorio'; end if;
  claims:=current_setting('request.jwt.claims',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ap.decidido_por,'role','authenticated')::text,true);
  perform public.sap_marcar_tarefa(cli.id,5,'feito',null,p_evidencia,null,null);
  perform set_config('request.jwt.claims',coalesce(claims,''),true);
  update public.aprovacoes set executada_em=now() where id=ap.id;
end;
$$;
revoke all on function public.agentes_marcar_marco(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.agentes_marcar_marco(uuid,uuid,integer,text) to service_role;

create or replace function public.sugestao_decidir(p_id uuid,p_estado text,p_resultado text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.sugestoes_agentes;
begin
  select * into s from public.sugestoes_agentes where id=p_id for update;
  if s.id is null or not public.pode_editar_acoes(s.client_id) then raise exception 'sem permissao'; end if;
  if p_estado is null or p_estado not in ('proposta','feita','descartada') then raise exception 'estado invalido'; end if;
  if s.agente='recuperacao' and (p_resultado is not null or p_estado='feita') then raise exception 'resultado da recuperacao exige evidencia verificavel'; end if;
  update public.sugestoes_agentes set estado=p_estado,
    resultado=case when s.agente='recuperacao' then resultado else coalesce(nullif(btrim(left(coalesce(p_resultado,''),500)),''),resultado) end,
    decidido_por=auth.uid(),decidido_em=now() where id=s.id;
  if s.agente='recuperacao' and public.tem_modulo(s.client_id,'hub') then perform public.operacao_verificar(s.client_id); end if;
end;
$$;
revoke all on function public.sugestao_decidir(uuid,text,text) from public,anon;
grant execute on function public.sugestao_decidir(uuid,text,text) to authenticated;

-- Leitura pontual e auditada, sem abrir leitura direta da tabela de mensagens para membros.
create or replace function public.operacao_mensagens(p_trabalho_id uuid)
returns table(id uuid,enviada_em timestamptz,texto text,externo_id text,direcao text,tipo text)
language plpgsql security definer set search_path = '' as $$
declare t public.operacao_recuperacao;
begin
  select * into t from public.operacao_recuperacao where operacao_recuperacao.id=p_trabalho_id;
  if t.id is null or not public.pode_editar_acoes(t.client_id) or not public.tem_modulo(t.client_id,'hub') then raise exception 'sem permissao'; end if;
  insert into public.acessos_conversas(user_id,client_id,conversa_id,acao) values(auth.uid(),t.client_id,t.conversa_id,'operacao_revisar');
  return query select m.id,m.enviada_em,left(m.texto,1000),m.externo_id,m.direcao,m.tipo from public.mensagens m
    where m.client_id=t.client_id and m.conversa_id=t.conversa_id order by m.enviada_em desc limit 50;
end;
$$;
revoke all on function public.operacao_mensagens(uuid) from public,anon;
grant execute on function public.operacao_mensagens(uuid) to authenticated;

create or replace function public.operacao_replanejar(p_trabalho_id uuid,p_prazo timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.operacao_recuperacao;
begin
  select * into t from public.operacao_recuperacao where id=p_trabalho_id for update;
  if t.id is null or not public.pode_editar_acoes(t.client_id) or not public.tem_modulo(t.client_id,'hub') then raise exception 'sem permissao'; end if;
  if t.estado in ('cancelada','resolvida') then raise exception 'caso encerrado'; end if;
  if p_prazo is null or p_prazo<=now() or p_prazo>now()+interval '7 days' then raise exception 'prazo deve estar nos proximos 7 dias'; end if;
  update public.operacao_recuperacao set responsavel_id=auth.uid(),responsavel_nome=coalesce(public.sap_nome_usuario(auth.uid()),'Responsável'),
    prazo=p_prazo,atualizado_em=now() where id=t.id;
  insert into public.operacao_historico(trabalho_id,acao,por,evidencia) values(t.id,'replanejada',auth.uid(),
    jsonb_build_object('responsavel_anterior',t.responsavel_id,'novo_responsavel',auth.uid(),'prazo',p_prazo));
  perform public.operacao_verificar_interno(t.client_id,t.id);
end;
$$;
revoke all on function public.operacao_replanejar(uuid,timestamptz) from public,anon;
grant execute on function public.operacao_replanejar(uuid,timestamptz) to authenticated;
