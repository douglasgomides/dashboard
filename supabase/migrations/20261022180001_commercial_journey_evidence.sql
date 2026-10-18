-- Criada pelo Supabase CLI; ordenada após o baseline mais recente (22/10).
-- Camada de evidência sobre CRM/conversas existentes. Não copia mensagens,
-- prontuários ou contatos e não altera oportunidades nos sistemas externos.
alter table public.wts_sessions add column if not exists source_provider text
  check (source_provider in ('wts','digisac')),
  add column if not exists source_connection_id uuid;
do $constraint$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.wts_sessions'::regclass and conname='wts_sessions_source_connection_tenant_fk') then
    alter table public.wts_sessions add constraint wts_sessions_source_connection_tenant_fk
  foreign key (source_connection_id,client_id) references public.crm_connections(id,client_id);
  end if;
end $constraint$;
do $constraint$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.wts_sessions'::regclass and conname='wts_sessions_source_complete_check') then
    alter table public.wts_sessions add constraint wts_sessions_source_complete_check check (coalesce(
  (source_provider is null and source_connection_id is null)
  or (source_provider='wts' and source_connection_id is null)
  or (source_provider='digisac' and source_connection_id is not null),false));
  end if;
end $constraint$;
alter table public.conversas add column if not exists source_connection_id uuid;
do $constraint$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.conversas'::regclass and conname='conversas_source_connection_tenant_fk') then
    alter table public.conversas add constraint conversas_source_connection_tenant_fk
  foreign key (source_connection_id,client_id) references public.crm_connections(id,client_id);
  end if;
end $constraint$;
-- IDs de talk/ticket são locais à conta do fornecedor. Nunca reassociar uma
-- conversa já identificada a outra conexão por colisão de ID externo.
create or replace function public.jornada_preservar_origem_conversa() returns trigger
language plpgsql set search_path=public,pg_temp as $$ begin
  if old.source_connection_id is not null and new.source_connection_id is distinct from old.source_connection_id then
    raise exception 'conversa pertence a outra conexao' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.jornada_preservar_origem_conversa() from public,anon,authenticated;
drop trigger if exists jornada_preservar_origem_conversa on public.conversas;
create trigger jornada_preservar_origem_conversa before update of source_connection_id on public.conversas
  for each row execute function public.jornada_preservar_origem_conversa();
create or replace function public.jornada_preservar_origem_sessao() returns trigger
language plpgsql set search_path=public,pg_temp as $$ begin
  if old.source_provider is not null and (new.source_provider is distinct from old.source_provider
    or new.source_connection_id is distinct from old.source_connection_id) then
    raise exception 'sessao pertence a outra origem' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function public.jornada_preservar_origem_sessao() from public,anon,authenticated;
drop trigger if exists jornada_preservar_origem_sessao on public.wts_sessions;
create trigger jornada_preservar_origem_sessao before update of source_provider,source_connection_id on public.wts_sessions
  for each row execute function public.jornada_preservar_origem_sessao();
create index if not exists wts_sessions_source_contact_idx
  on public.wts_sessions(client_id,source_provider,source_connection_id,contact_id);
create index if not exists crm_leads_flw_session_idx on public.crm_leads(client_id,(raw_payload->>'sessionId'))
  where provider='flwchat' and removido_na_origem is null;
create unique index if not exists crm_leads_id_client_connection_uidx on public.crm_leads(id,client_id,crm_connection_id);

create table if not exists public.jornada_vinculos (
  client_id uuid not null references public.clients(id) on delete cascade,
  conversa_id uuid not null,
  lead_id uuid not null,
  crm_connection_id uuid not null,
  lead_externo_id text not null,
  conversa_externo_id text not null,
  metodo text not null check (metodo in ('kommo_evento','flwchat_session','digisac_ticket')),
  referencia_externa text not null check (length(referencia_externa) between 1 and 200),
  estado text not null default 'verificado' check (estado in ('verificado','conflito')),
  confirmado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (conversa_id,client_id),
  foreign key (conversa_id,client_id) references public.conversas(id,client_id) on delete cascade,
  foreign key (lead_id,client_id,crm_connection_id) references public.crm_leads(id,client_id,crm_connection_id) on delete cascade
);
create index if not exists jornada_vinculos_lead_idx on public.jornada_vinculos(client_id,lead_id);
create table if not exists public.jornada_vinculos_auditoria (
  id bigint generated always as identity primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  conversa_id uuid not null,
  lead_id uuid not null,
  acao text not null check (acao in ('confirmado','conflito')),
  metodo text not null,
  em timestamptz not null default now(),
  foreign key (conversa_id,client_id) references public.conversas(id,client_id) on delete cascade,
  foreign key (lead_id,client_id) references public.crm_leads(id,client_id) on delete cascade
);
create index if not exists jornada_vinculos_auditoria_cliente_idx on public.jornada_vinculos_auditoria(client_id,em);
create index if not exists jornada_vinculos_auditoria_conversa_idx on public.jornada_vinculos_auditoria(conversa_id,client_id);
create index if not exists jornada_vinculos_auditoria_lead_idx on public.jornada_vinculos_auditoria(lead_id,client_id);
create index if not exists conversas_source_connection_idx on public.conversas(source_connection_id,client_id) where source_connection_id is not null;
create index if not exists wts_sessions_source_connection_idx on public.wts_sessions(source_connection_id,client_id) where source_connection_id is not null;
alter table public.jornada_vinculos enable row level security;
alter table public.jornada_vinculos_auditoria enable row level security;
drop policy if exists jornada_vinculos_ler on public.jornada_vinculos;
create policy jornada_vinculos_ler on public.jornada_vinculos for select to authenticated
  using ((public.is_app_admin() or public.is_client_member(client_id)) and public.tem_modulo(client_id,'hub'));
drop policy if exists jornada_vinculos_auditoria_ler on public.jornada_vinculos_auditoria;
create policy jornada_vinculos_auditoria_ler on public.jornada_vinculos_auditoria for select to authenticated
  using (public.is_app_admin() and public.tem_modulo(client_id,'hub'));
revoke all on public.jornada_vinculos,public.jornada_vinculos_auditoria from public,anon,authenticated;
grant select on public.jornada_vinculos,public.jornada_vinculos_auditoria to authenticated;
grant select,insert,update,delete on public.jornada_vinculos,public.jornada_vinculos_auditoria to service_role;
revoke all on sequence public.jornada_vinculos_auditoria_id_seq from public,anon,authenticated;
grant usage,select on sequence public.jornada_vinculos_auditoria_id_seq to service_role;

-- Escrita restrita ao servidor. A evidência é reconstruída dos registros da
-- mesma clínica; nenhum JSON arbitrário ou texto de paciente é armazenado.
create or replace function public.jornada_registrar_vinculos(p_client uuid,p_vinculos jsonb)
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare x jsonb; l public.crm_leads; c public.conversas; anterior public.jornada_vinculos;
  metodo text; ref text; n integer:=0; conflitos integer:=0;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' or not public.tem_modulo(p_client,'hub') then
    raise exception 'sem permissao' using errcode='42501';
  end if;
  if jsonb_typeof(p_vinculos) is distinct from 'array' or jsonb_array_length(p_vinculos)>200 then
    raise exception 'lote invalido' using errcode='22023';
  end if;
  -- Serializa reconciliações concorrentes da clínica, inclusive confirmação x conflito.
  perform pg_advisory_xact_lock(hashtextextended('jornada:'||p_client::text,0));
  for x in select value from jsonb_array_elements(p_vinculos) loop
    select * into l from public.crm_leads where id=(x->>'lead_id')::uuid and client_id=p_client and removido_na_origem is null;
    select * into c from public.conversas where id=(x->>'conversa_id')::uuid and client_id=p_client;
    metodo:=x->>'metodo'; ref:=x->>'referencia_externa';
    if l.id is null or c.id is null or nullif(l.external_lead_id,'') is null or length(coalesce(ref,'')) not between 1 and 200
      or not exists(select 1 from public.crm_connections cc where cc.id=l.crm_connection_id and cc.client_id=p_client and cc.provider=l.provider)
    then raise exception 'origem invalida' using errcode='22023'; end if;
    if metodo='kommo_evento' then
      if l.provider<>'kommo' or c.provider<>'kommo' or c.source_connection_id is distinct from l.crm_connection_id or x->>'lead_externo_id' is distinct from l.external_lead_id
        or x->>'conversa_externo_id' is distinct from c.externo_id
        or not exists(select 1 from public.mensagens m where m.client_id=p_client and m.conversa_id=c.id and m.externo_id=ref)
      then raise exception 'evidencia Kommo invalida' using errcode='22023'; end if;
    elsif metodo='flwchat_session' then
      if l.provider<>'flwchat' or c.provider<>'wts' or l.raw_payload->>'sessionId' is distinct from c.externo_id or ref<>c.externo_id
        or not exists(select 1 from public.wts_sessions s where s.client_id=p_client and s.session_id=c.externo_id and s.source_provider='wts')
        or (select count(*) from public.crm_leads q where q.client_id=p_client and q.provider='flwchat'
          and q.removido_na_origem is null and q.raw_payload->>'sessionId'=c.externo_id)<>1
      then raise exception 'sessao FlwChat ambigua ou ausente' using errcode='22023'; end if;
    elsif metodo='digisac_ticket' then
      if l.provider<>'digisac' or c.provider<>'digisac' or c.source_connection_id is distinct from l.crm_connection_id or ref<>c.externo_id
        or not exists(select 1 from public.wts_sessions s where s.client_id=p_client and s.session_id=c.externo_id
          and s.source_provider='digisac' and s.source_connection_id=l.crm_connection_id and s.contact_id=l.external_lead_id)
      then raise exception 'ticket Digisac sem origem confirmada' using errcode='22023'; end if;
    else raise exception 'metodo invalido' using errcode='22023'; end if;
    select * into anterior from public.jornada_vinculos v where v.client_id=p_client and v.conversa_id=c.id;
    if anterior.conversa_id is not null and (anterior.lead_id<>l.id or anterior.estado='conflito') then
      if anterior.estado<>'conflito' then
        update public.jornada_vinculos set estado='conflito',atualizado_em=now() where client_id=p_client and conversa_id=c.id;
        insert into public.jornada_vinculos_auditoria(client_id,conversa_id,lead_id,acao,metodo) values(p_client,c.id,l.id,'conflito',metodo);
      end if;
      conflitos:=conflitos+1;
    else
      insert into public.jornada_vinculos(client_id,conversa_id,lead_id,crm_connection_id,lead_externo_id,conversa_externo_id,metodo,referencia_externa)
        values(p_client,c.id,l.id,l.crm_connection_id,l.external_lead_id,c.externo_id,metodo,ref)
        on conflict(conversa_id,client_id) do update set atualizado_em=now();
      if anterior.conversa_id is null then
        insert into public.jornada_vinculos_auditoria(client_id,conversa_id,lead_id,acao,metodo) values(p_client,c.id,l.id,'confirmado',metodo);
      end if;
      n:=n+1;
    end if;
  end loop;
  return jsonb_build_object('verificados',n,'conflitos',conflitos);
end $$;
revoke all on function public.jornada_registrar_vinculos(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.jornada_registrar_vinculos(uuid,jsonb) to service_role;

-- Revalida o vínculo na leitura. Alteração de ID, origem, sessão ou evidência
-- invalida a associação sem apagar seu histórico nem confiar no pessoa_id legado.
create or replace view public.jornada_vinculos_validos with(security_invoker=true) as
select v.* from public.jornada_vinculos v
join public.crm_leads l on l.id=v.lead_id and l.client_id=v.client_id and l.crm_connection_id=v.crm_connection_id
join public.conversas c on c.id=v.conversa_id and c.client_id=v.client_id
where v.estado='verificado' and l.removido_na_origem is null
  and l.external_lead_id=v.lead_externo_id and c.externo_id=v.conversa_externo_id
  and ((v.metodo='kommo_evento' and l.provider='kommo' and c.provider='kommo' and c.source_connection_id=l.crm_connection_id
    and exists(select 1 from public.mensagens m where m.client_id=v.client_id and m.conversa_id=c.id and m.externo_id=v.referencia_externa))
    or (v.metodo='flwchat_session' and l.provider='flwchat' and c.provider='wts' and l.raw_payload->>'sessionId'=c.externo_id
      and exists(select 1 from public.wts_sessions s where s.client_id=v.client_id and s.session_id=c.externo_id and s.source_provider='wts')
      and (select count(*) from public.crm_leads q where q.client_id=v.client_id and q.provider='flwchat' and q.removido_na_origem is null and q.raw_payload->>'sessionId'=c.externo_id)=1)
    or (v.metodo='digisac_ticket' and l.provider='digisac' and c.provider='digisac' and c.source_connection_id=l.crm_connection_id
      and exists(select 1 from public.wts_sessions s where s.client_id=v.client_id and s.session_id=c.externo_id
        and s.source_provider='digisac' and s.source_connection_id=l.crm_connection_id and s.contact_id=l.external_lead_id)));
-- View interna: conversas/mensagens têm leitura auditada por RPC, não abrir aqui.
revoke all on public.jornada_vinculos_validos from public,anon,authenticated;
grant select on public.jornada_vinculos_validos to service_role;

create or replace function public.jornada_reconciliar(p_client uuid)
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare lote jsonb; r jsonb; total integer:=0; conflitos integer:=0;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'sem permissao' using errcode='42501'; end if;
  if not public.tem_modulo(p_client,'hub') then return jsonb_build_object('verificados',0,'conflitos',0); end if;
  for lote in
    with candidatos as (
      select l.id lead_id,c.id conversa_id,c.externo_id referencia_externa,'flwchat_session' metodo
      from public.crm_leads l join public.conversas c on c.client_id=l.client_id and c.provider='wts' and c.externo_id=l.raw_payload->>'sessionId'
      join public.wts_sessions s on s.client_id=c.client_id and s.session_id=c.externo_id and s.source_provider='wts'
      where l.client_id=p_client and l.provider='flwchat' and l.removido_na_origem is null
      union all
      select l.id,c.id,c.externo_id,'digisac_ticket'
      from public.crm_leads l join public.wts_sessions s on s.client_id=l.client_id and s.source_provider='digisac'
        and s.source_connection_id=l.crm_connection_id and s.contact_id=l.external_lead_id
      join public.conversas c on c.client_id=s.client_id and c.provider='digisac' and c.externo_id=s.session_id and c.source_connection_id=l.crm_connection_id
      where l.client_id=p_client and l.provider='digisac' and l.removido_na_origem is null
    ), unicos as (
      select *,count(*) over(partition by conversa_id) candidatos from candidatos
    ), numerados as (
      select *,row_number() over(order by conversa_id) rn from unicos where candidatos=1
    ) select jsonb_agg(jsonb_build_object('lead_id',lead_id,'conversa_id',conversa_id,'metodo',metodo,'referencia_externa',referencia_externa))
      from numerados group by ((rn-1)/200)
  loop
    r:=public.jornada_registrar_vinculos(p_client,lote);
    total:=total+(r->>'verificados')::integer; conflitos:=conflitos+(r->>'conflitos')::integer;
  end loop;
  return jsonb_build_object('verificados',total,'conflitos',conflitos);
end $$;
revoke all on function public.jornada_reconciliar(uuid) from public,anon,authenticated;
grant execute on function public.jornada_reconciliar(uuid) to service_role;

create or replace function public.jornada_qualidade(p_client uuid,p_de date,p_ate date,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r jsonb;
begin
  if not ((public.is_app_admin() or public.is_client_member(p_client)) and public.tem_modulo(p_client,'hub')) then
    raise exception 'sem permissao' using errcode='42501';
  end if;
  if p_de is null or p_ate is null or p_de>p_ate or p_ate-p_de>3660 or p_offset is null or p_offset<0 then
    raise exception 'periodo ou pagina invalida' using errcode='22023'; end if;
  with leads as materialized (
    select l.*,cc.active conexao_ativa,cps.status_name,
      exists(select 1 from public.crm_etapa_kpi k where k.crm_connection_id=l.crm_connection_id
        and k.pipeline_id=l.pipeline_id and k.status_id=l.status_id and k.kpi='consulta_agendada') agendamento_crm
    from public.crm_leads l join public.crm_connections cc on cc.id=l.crm_connection_id and cc.client_id=l.client_id and cc.provider=l.provider
    left join public.crm_pipeline_statuses cps on cps.crm_connection_id=l.crm_connection_id and cps.pipeline_id=l.pipeline_id and cps.status_id=l.status_id
    where l.client_id=p_client and l.removido_na_origem is null
      and coalesce(l.occurred_at,l.received_at)>=p_de::timestamp at time zone 'America/Sao_Paulo'
      and coalesce(l.occurred_at,l.received_at)<(p_ate+1)::timestamp at time zone 'America/Sao_Paulo'
  ), vinculos as materialized (
    select v.* from public.jornada_vinculos_validos v join leads l on l.id=v.lead_id where v.client_id=p_client
  ), por_lead as materialized (
    select l.id,count(v.conversa_id) conversas_verificadas,
      count(v.conversa_id) filter(where exists(select 1 from public.mensagens m where m.conversa_id=v.conversa_id and m.client_id=p_client and m.direcao='saida')) com_saida,
      count(v.conversa_id) filter(where exists(select 1 from public.conversas c join public.links_rastreados lr on lr.client_id=c.client_id and lr.codigo_ref=c.codigo_ref
        where c.id=v.conversa_id and c.client_id=p_client)) referencias_rastreadas
    from leads l left join vinculos v on v.lead_id=l.id group by l.id
  ), por_fonte as (
    select l.provider,count(*) registros,count(*) filter(where nullif(btrim(l.source),'') is null) sem_origem,
      count(*) filter(where l.occurred_at is null) sem_data_origem,count(*) filter(where l.status_name is null) sem_etapa_mapeada,
      count(*) filter(where p.conversas_verificadas>0) com_conversa_verificada,
      count(*) filter(where l.pessoa_id is not null and p.conversas_verificadas=0) somente_identidade_legada
    from leads l join por_lead p using(id) group by l.provider
  ), fontes as (
    select cc.id conexao_id,cc.provider,cc.active ativa,count(l.id) registros_historicos,
      min(l.occurred_at) historico_desde,max(l.received_at) ultima_gravacao,
      st.backfill_done backfill_concluido,ss.last_success_at ultimo_sucesso_compartilhado,
      (ss.last_error is not null) erro_sync_compartilhado,
      count(l.id) filter(where l.removido_na_origem is null and nullif(btrim(l.source),'') is null) sem_origem,
      count(l.id) filter(where l.removido_na_origem is null and l.occurred_at is null) sem_data_origem
    from public.crm_connections cc left join public.crm_leads l on l.crm_connection_id=cc.id and l.client_id=cc.client_id
    left join public.crm_leads_sync_state st on st.crm_connection_id=cc.id
    left join public.sync_status ss on ss.client_id=cc.client_id and ss.fonte='crm'
    where cc.client_id=p_client group by cc.id,st.backfill_done,ss.last_success_at,ss.last_error
  ), registros as (
    select l.id,l.provider,l.status_name etapa,l.outcome desfecho,coalesce(nullif(btrim(l.source),''),'Não atribuída') origem_crm,
      l.occurred_at entrada_em,l.occurred_at is null data_origem_ausente,p.conversas_verificadas,
      p.com_saida,p.referencias_rastreadas,l.pessoa_id is not null identidade_legada
    from leads l join por_lead p using(id) order by coalesce(l.occurred_at,l.received_at) desc,l.id limit 20 offset p_offset
  ) select jsonb_build_object(
    'versao',1,'periodo',jsonb_build_object('de',p_de,'ate',p_ate,'fuso','America/Sao_Paulo','base','coorte_entrada_crm_estado_atual'),
    'resumo',jsonb_build_object('registros_crm',(select count(*) from leads),
      'com_conversa_verificada',(select count(*) from por_lead where conversas_verificadas>0),
      'com_saida_observada',(select count(*) from por_lead where com_saida>0),
      'sem_origem',(select count(*) from leads where nullif(btrim(source),'') is null),
      'data_origem_ausente',(select count(*) from leads where occurred_at is null),
      'referencias_rastreadas',(select count(*) from por_lead where referencias_rastreadas>0),
      'sinal_agendamento_crm',(select count(*) from leads where agendamento_crm),
      'negocios_ganhos',(select count(*) from leads where outcome='won'),
      'valor_negocios_ganhos',(select sum(price) from leads where outcome='won' and price is not null),
      'ganhos_sem_valor',(select count(*) from leads where outcome='won' and price is null),
      'comparecimentos',null,'receita_faturada',null,'receita_recebida',null,'receita_atribuida',null),
    'conversas',jsonb_build_object(
      'total_periodo',(select count(*) from public.conversas c where c.client_id=p_client and c.iniciada_em>=p_de::timestamp at time zone 'America/Sao_Paulo' and c.iniciada_em<(p_ate+1)::timestamp at time zone 'America/Sao_Paulo'),
      'conflitos',(select count(*) from public.jornada_vinculos v where v.client_id=p_client and v.estado='conflito'),
      'vinculos_invalidos',(select count(*) from public.jornada_vinculos v where v.client_id=p_client and v.estado='verificado' and not exists(select 1 from public.jornada_vinculos_validos vv where vv.client_id=p_client and vv.conversa_id=v.conversa_id)),
      'sessoes_sem_provedor',(select count(*) from public.wts_sessions s where s.client_id=p_client and s.source_provider is null)),
    'por_fonte',coalesce((select jsonb_agg(to_jsonb(x) order by x.provider) from por_fonte x),'[]'::jsonb),
    'fontes',coalesce((select jsonb_agg(to_jsonb(x) order by x.provider,x.conexao_id) from fontes x),'[]'::jsonb),
    'registros',coalesce((select jsonb_agg(to_jsonb(x)) from registros x),'[]'::jsonb),
    'paginacao',jsonb_build_object('offset',p_offset,'limite',20,'total',(select count(*) from leads)),
    'limitacoes',jsonb_build_array(
      'Registros do CRM são oportunidades, não pessoas únicas. Não há deduplicação entre CRMs sem evidência explícita.',
      'Origem informada no CRM é uma declaração da fonte; não comprova campanha, causalidade ou aquisição.',
      'Vínculos legados por pessoa ou telefone ficam fora das associações verificadas.',
      'Mensagem de saída pode ser automática; não comprova atendimento humano nem sua qualidade.',
      'Etapa de agendamento no CRM é sinal administrativo; não comprova consulta marcada ou comparecimento.',
      'Valor de negócio ganho não é receita faturada, recebida ou lucro. Nenhum ROI ou ROAS é calculado.',
      'Último sucesso de CRM é compartilhado por cliente e não certifica cada conexão. Cobertura externa total ainda não é conhecida.',
      'Datas ausentes na origem usam recebimento apenas para incluir o registro no período e são sinalizadas.')) into r;
  return r;
end $$;
revoke all on function public.jornada_qualidade(uuid,date,date,integer) from public,anon;
grant execute on function public.jornada_qualidade(uuid,date,date,integer) to authenticated;

create or replace function public.jornada_eventos_comerciais(p_client uuid,p_lead uuid)
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp as $$
declare l public.crm_leads; r jsonb;
begin
  if not ((public.is_app_admin() or public.is_client_member(p_client)) and public.tem_modulo(p_client,'hub')) then
    raise exception 'sem permissao' using errcode='42501'; end if;
  select * into l from public.crm_leads where client_id=p_client and id=p_lead and removido_na_origem is null;
  if l.id is null then return null; end if;
  insert into public.acessos_conversas(user_id,client_id,acao) values(auth.uid(),p_client,'jornada_eventos_comerciais');
  with vinculos as materialized(select * from public.jornada_vinculos_validos v where v.client_id=p_client and v.lead_id=p_lead),
  eventos as (
    select 'crm:'||e.id::text chave,e.ocorreu_em,'crm_lead_eventos' fonte,e.tipo tipo,'verificado' certeza,
      'Identificador do lead + conexão do CRM' associacao,
      case when e.tipo='entrou' then 'Data de entrada informada pelo CRM' else 'Mudança observada na sincronização; pode ocorrer depois do evento real' end observacao
    from public.crm_lead_eventos e where e.client_id=p_client and e.crm_connection_id=l.crm_connection_id and e.external_lead_id=l.external_lead_id
    union all
    select 'entrada:'||l.id::text,coalesce(l.occurred_at,l.received_at),'crm_leads','entrada_crm',
      case when l.occurred_at is null then 'estimado' else 'verificado' end,'Registro da própria fonte',
      case when l.occurred_at is null then 'Data original ausente; recebimento no Nexo' else 'Data de criação na origem' end
    where not exists(select 1 from public.crm_lead_eventos e where e.client_id=p_client and e.crm_connection_id=l.crm_connection_id and e.external_lead_id=l.external_lead_id and e.tipo='entrou')
    union all
    select 'conversa:'||c.id::text,c.iniciada_em,'conversas:'||c.provider,'conversa','verificado',v.metodo,
      'Cobertura de mensagens: '||coalesce(c.mensagens_cobertura,'não conferida')
    from vinculos v join public.conversas c on c.id=v.conversa_id and c.client_id=p_client
    union all
    select 'saida:'||v.conversa_id::text,min(m.enviada_em),'mensagens','primeira_saida_observada','verificado',v.metodo,
      'Primeira saída armazenada; pode ser automática e a conversa pode ter cobertura parcial'
    from vinculos v join public.mensagens m on m.conversa_id=v.conversa_id and m.client_id=p_client and m.direcao='saida'
    group by v.conversa_id,v.metodo
  ), ordenados as(select * from eventos order by ocorreu_em nulls last,chave limit 200)
  select jsonb_build_object('lead_id',l.id,'provider',l.provider,'origem_crm',nullif(l.source,''),
    'total_eventos',(select count(*) from eventos),'eventos',coalesce((select jsonb_agg(to_jsonb(e)) from ordenados e),'[]'::jsonb),
    'limitado',(select count(*)>200 from eventos)) into r;
  return r;
end $$;
revoke all on function public.jornada_eventos_comerciais(uuid,uuid) from public,anon;
grant execute on function public.jornada_eventos_comerciais(uuid,uuid) to authenticated;
