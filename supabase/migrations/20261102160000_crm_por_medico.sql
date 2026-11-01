-- CRM por médico: médicos que dividem a mesma conta de CRM ou de atendimento (Kommo do HOMS, Digisac da IGM Palmas,
-- WTS da Dra. Juliana e da Dra. Mariela) viam a clínica inteira como se fosse deles. Esta migração cria a regra de
-- separação por cliente (crm_filtro_cliente) e aplica a regra nas leituras das telas.
--
-- Não destrutiva e sem efeito ao entrar: sem linha em crm_filtro_cliente para o cliente, tudo fica exatamente como
-- antes (as leituras devolvem as mesmas linhas). Os números mudam só quando o admin cadastra a regra do cliente.
--
-- Regra (por cliente):
--   tipo 'pipeline'     -> crm_leads.pipeline_id (funil; no Digisac, o médico da etiqueta: 'rafaela', 'antonione')
--   tipo 'responsavel'  -> responsável do card (Kommo: responsible_user_id)
--   tipo 'tag'          -> etiqueta do card (Kommo: _embedded.tags[].name; Digisac: etiquetas[])
--   tipo 'campo'        -> campo do card, valor '<field_id>=<enum_id ou texto>' (Kommo: campo "MÉDICO")
--   tipo 'departamento' -> departamento/equipe da sessão de atendimento (WTS, Digisac). 'equipe' é sinônimo.
--   modo 'incluir'      -> o cliente vê só o que casa com alguma regra de incluir
--   modo 'excluir'      -> o cliente vê tudo, menos o que casa com alguma regra de excluir (a clínica fica com o resto)
-- Card, conversa ou sessão sem dono (não casa com nenhuma regra) fica só com o cliente que usa 'excluir' (a clínica).
-- Conversa segue o card ligado (conversas.lead_id) e o departamento da sessão (wts_sessions.session_id = externo_id).
-- Sessão do Digisac segue o card do contato (crm_leads.external_lead_id = wts_sessions.contact_id).
--
-- Reversão: apagar as linhas de crm_filtro_cliente do cliente (volta ao comportamento anterior na hora). Para tirar
-- o mecanismo: recriar as funções pela versão anterior e dropar as funções *_do_cliente e a tabela.

create table if not exists public.crm_filtro_cliente (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  crm_connection_id uuid references public.crm_connections(id) on delete cascade,
  tipo text not null check (tipo in ('pipeline', 'responsavel', 'tag', 'campo', 'equipe', 'departamento')),
  valor text not null check (btrim(valor) <> ''),
  modo text not null default 'incluir' check (modo in ('incluir', 'excluir')),
  observacao text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  constraint crm_filtro_cliente_conexao check (tipo in ('equipe', 'departamento') or crm_connection_id is not null),
  constraint crm_filtro_cliente_campo check (tipo <> 'campo' or valor ~ '^[^=]+=.+$')
);
create unique index if not exists crm_filtro_cliente_unico
  on public.crm_filtro_cliente (client_id, coalesce(crm_connection_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo, valor, modo);
create index if not exists crm_filtro_cliente_cliente on public.crm_filtro_cliente (client_id, tipo);
comment on table public.crm_filtro_cliente is
  'Regra de separação por médico quando vários clientes usam a mesma conta de CRM/atendimento. Sem linha = sem filtro (o cliente vê a conta inteira). Só admin escreve.';

alter table public.crm_filtro_cliente enable row level security;
revoke all on table public.crm_filtro_cliente from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_filtro_cliente to authenticated;
grant select, insert, update, delete on table public.crm_filtro_cliente to service_role;
do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_filtro_cliente' and policyname = 'crm_filtro_cliente_ler') then
    create policy crm_filtro_cliente_ler on public.crm_filtro_cliente for select to authenticated
      using (public.is_app_admin() or public.is_client_member(client_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_filtro_cliente' and policyname = 'crm_filtro_cliente_admin_insere') then
    create policy crm_filtro_cliente_admin_insere on public.crm_filtro_cliente for insert to authenticated
      with check (public.is_app_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_filtro_cliente' and policyname = 'crm_filtro_cliente_admin_altera') then
    create policy crm_filtro_cliente_admin_altera on public.crm_filtro_cliente for update to authenticated
      using (public.is_app_admin()) with check (public.is_app_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_filtro_cliente' and policyname = 'crm_filtro_cliente_admin_apaga') then
    create policy crm_filtro_cliente_admin_apaga on public.crm_filtro_cliente for delete to authenticated
      using (public.is_app_admin());
  end if;
end $pol$;

-- A conexão da regra precisa ser do próprio cliente (senão a regra de um cliente filtraria a cópia de outro).
-- Definer só para ler crm_connections (que o membro não lê); quem pode gravar continua decidido pelas policies.
create or replace function public.crm_filtro_cliente_valida()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  new.tipo := lower(btrim(new.tipo));
  new.valor := btrim(new.valor);
  if new.tipo = 'equipe' then new.tipo := 'departamento'; end if;
  if new.crm_connection_id is not null and not exists (
       select 1 from public.crm_connections k where k.id = new.crm_connection_id and k.client_id = new.client_id) then
    raise exception 'a conexão do CRM não é deste cliente' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function public.crm_filtro_cliente_valida() from public, anon;
drop trigger if exists crm_filtro_cliente_valida on public.crm_filtro_cliente;
create trigger crm_filtro_cliente_valida before insert or update on public.crm_filtro_cliente
  for each row execute function public.crm_filtro_cliente_valida();

-- As funções abaixo são invoker e sem SET: assim o Postgres as embute (inline) dentro das RPCs definer, e o filtro
-- vira parte da consulta (usa os índices de sempre). Chamadas direto por um usuário, valem as policies de cada tabela.

-- O cliente tem alguma regra? (o aviso "CRM compartilhado" só aparece enquanto não tem)
create or replace function public.crm_tem_filtro(p_client uuid)
returns boolean
language sql stable
as $$
  select exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client)
$$;

-- Um valor de regra casa com o card?
create or replace function public.crm_filtro_casa_card(p_tipo text, p_valor text, p_pipeline text, p_raw jsonb)
returns boolean
language sql immutable
as $$
  select case p_tipo
    when 'pipeline' then coalesce(p_pipeline = p_valor, false)
    when 'responsavel' then coalesce(p_raw->>'responsible_user_id' = p_valor, false)
    when 'tag' then
      exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_raw->'_embedded'->'tags') = 'array' then p_raw->'_embedded'->'tags' else '[]'::jsonb end) t
               where lower(btrim(t->>'name')) = lower(btrim(p_valor)))
      or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_raw->'etiquetas') = 'array' then p_raw->'etiquetas' else '[]'::jsonb end) t
                  where lower(btrim(case when jsonb_typeof(t) = 'string' then t #>> '{}' else coalesce(t->>'label', t->>'name') end)) = lower(btrim(p_valor)))
    when 'campo' then
      exists (select 1
                from jsonb_array_elements(case when jsonb_typeof(p_raw->'custom_fields_values') = 'array' then p_raw->'custom_fields_values' else '[]'::jsonb end) cf,
                     jsonb_array_elements(case when jsonb_typeof(cf->'values') = 'array' then cf->'values' else '[]'::jsonb end) v
               where cf->>'field_id' = split_part(p_valor, '=', 1)
                 and (v->>'enum_id' = substr(p_valor, strpos(p_valor, '=') + 1)
                      or lower(btrim(v->>'value')) = lower(btrim(substr(p_valor, strpos(p_valor, '=') + 1)))))
    else false
  end
$$;

-- O card passa na regra do cliente? (só as regras da conexão do card valem para ele)
create or replace function public.crm_lead_no_filtro(p_client uuid, p_cx uuid, p_pipeline text, p_raw jsonb)
returns boolean
language sql stable
as $$
  select (not exists (select 1 from public.crm_filtro_cliente f
                       where f.client_id = p_client and f.crm_connection_id = p_cx and f.modo = 'incluir'
                         and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))
          or exists (select 1 from public.crm_filtro_cliente f
                      where f.client_id = p_client and f.crm_connection_id = p_cx and f.modo = 'incluir'
                        and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo')
                        and public.crm_filtro_casa_card(f.tipo, f.valor, p_pipeline, p_raw)))
     and not exists (select 1 from public.crm_filtro_cliente f
                      where f.client_id = p_client and f.crm_connection_id = p_cx and f.modo = 'excluir'
                        and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo')
                        and public.crm_filtro_casa_card(f.tipo, f.valor, p_pipeline, p_raw))
$$;

-- O departamento da sessão passa na regra do cliente? (sem departamento: só fica com quem usa 'excluir')
create or replace function public.crm_departamento_no_filtro(p_client uuid, p_dep text)
returns boolean
language sql stable
as $$
  select (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.modo = 'incluir' and f.tipo in ('departamento', 'equipe'))
          or exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.modo = 'incluir' and f.tipo in ('departamento', 'equipe') and f.valor = p_dep))
     and not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.modo = 'excluir' and f.tipo in ('departamento', 'equipe') and f.valor = p_dep)
$$;

-- A conversa passa? Segue o card ligado e o departamento da sessão. Sem card (ou sem sessão), fica com a clínica.
create or replace function public.crm_conversa_no_filtro(p_client uuid, p_lead uuid, p_externo text)
returns boolean
language sql stable
as $$
  select (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))
          or coalesce((select public.crm_lead_no_filtro(p_client, l.crm_connection_id, l.pipeline_id, l.raw_payload)
                         from public.crm_leads l where l.id = p_lead and l.client_id = p_client),
                      not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.modo = 'incluir'
                                     and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))))
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.tipo in ('departamento', 'equipe'))
          or coalesce((select public.crm_departamento_no_filtro(p_client, s.department_id)
                         from public.wts_sessions s where s.client_id = p_client and s.session_id = p_externo),
                      not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.modo = 'incluir'
                                     and f.tipo in ('departamento', 'equipe'))))
$$;

-- A sessão de atendimento passa? Departamento e, no Digisac, o card do contato.
create or replace function public.crm_sessao_no_filtro(p_client uuid, p_dep text, p_contato text)
returns boolean
language sql stable
as $$
  select public.crm_departamento_no_filtro(p_client, p_dep)
     and (not exists (select 1 from public.crm_filtro_cliente f join public.crm_connections k on k.id = f.crm_connection_id and k.provider = 'digisac'
                       where f.client_id = p_client and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))
          or coalesce((select public.crm_lead_no_filtro(p_client, l.crm_connection_id, l.pipeline_id, l.raw_payload)
                         from public.crm_connections k join public.crm_leads l on l.crm_connection_id = k.id and l.external_lead_id = p_contato
                        where k.client_id = p_client and k.provider = 'digisac' and l.client_id = p_client
                        order by l.removido_na_origem nulls first, l.occurred_at desc nulls last limit 1),
                      not exists (select 1 from public.crm_filtro_cliente f join public.crm_connections k on k.id = f.crm_connection_id and k.provider = 'digisac'
                                   where f.client_id = p_client and f.modo = 'incluir' and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))))
$$;

-- Leituras por cliente. A primeira condição (o cliente não tem regra) é calculada uma vez por consulta: sem regra,
-- as linhas são as mesmas de "where client_id = p_client".
create or replace function public.crm_leads_do_cliente(p_client uuid)
returns setof public.crm_leads
language sql stable
as $$
  select l.* from public.crm_leads l
   where l.client_id = p_client
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))
          or public.crm_lead_no_filtro(p_client, l.crm_connection_id, l.pipeline_id, l.raw_payload))
$$;

create or replace function public.conversas_do_cliente(p_client uuid)
returns setof public.conversas
language sql stable
as $$
  select c.* from public.conversas c
   where c.client_id = p_client
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client)
          or public.crm_conversa_no_filtro(p_client, c.lead_id, c.externo_id))
$$;

create or replace function public.wts_sessoes_do_cliente(p_client uuid)
returns setof public.wts_sessions
language sql stable
as $$
  select s.* from public.wts_sessions s
   where s.client_id = p_client
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client)
          or public.crm_sessao_no_filtro(p_client, s.department_id, s.contact_id))
$$;

do $g$
declare f text;
begin
  foreach f in array array[
    'public.crm_tem_filtro(uuid)', 'public.crm_filtro_casa_card(text,text,text,jsonb)', 'public.crm_lead_no_filtro(uuid,uuid,text,jsonb)',
    'public.crm_departamento_no_filtro(uuid,text)', 'public.crm_conversa_no_filtro(uuid,uuid,text)', 'public.crm_sessao_no_filtro(uuid,text,text)',
    'public.crm_leads_do_cliente(uuid)', 'public.conversas_do_cliente(uuid)', 'public.wts_sessoes_do_cliente(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$g$;

-- Aplica a regra nas leituras das telas: em cada RPC, "from/join crm_leads", "conversas" e "wts_sessions" passam a ler
-- pela função do cliente. Feito sobre a definição atual (pg_get_functiondef), por isso compõe com as outras migrações
-- que mexem nessas funções. Rodar de novo não muda nada. Função ausente é pulada (aviso).
do $migra$
declare
  alvos text[] := array[
    -- Pacientes do período
    'public.pacientes_periodo(uuid,date,date)', 'public.pacientes_cards(uuid)', 'public.pacientes_vendas(uuid,date,date)',
    -- CRM: resumo, pessoas, vendas, funis, etapas
    'public.crm_pessoas_leads(uuid)', 'public.crm_vendas_periodo(uuid,date,date)', 'public.crm_funis_periodo(uuid,date,date)',
    'public.crm_leads_por_etapa(uuid)', 'public.crm_pipeline_kanban(uuid)', 'public.crm_metricas_essenciais(uuid)',
    'public.crm_visoes_comerciais(uuid,date,date)', 'public.crm_diagnostico_comercial(uuid,date,date)',
    'public.crm_orcamentos_por_tipo(uuid,date,date)', 'public.crm_leads_por_dia(uuid,integer)', 'public.crm_atividade_recente(uuid,integer)',
    'public.crm_funil_por_campo_periodo(uuid,text,date,date)', 'public.crm_funil_por_campo(uuid,text)',
    'public.roi_periodo(uuid,date,date)', 'public.jornada_funil(uuid,date,date)', 'public.jornada_resumo(uuid,date,date)',
    'public.receita_por_canal(uuid,date,date)', 'public.receita_em_jogo(uuid,date,date)', 'public.sap_tracker_auto(uuid,date,date)',
    -- Conversas
    'public.listar_conversas(uuid,integer,integer)', 'public.listar_conversas_canal(uuid,integer,integer)',
    'public.conversas_leitura(uuid,integer)', 'public.leitura_conversas(uuid,integer)',
    -- Atendimento (WTS e Digisac)
    'public.wts_resumo(uuid,date,date)', 'public.wts_por_agente(uuid,date,date)', 'public.wts_volume_diario(uuid,date,date)',
    'public.wts_por_departamento(uuid,date,date)', 'public.wts_fila_do_cliente(uuid,date,date)'];
  tabelas text[][] := array[array['crm_leads', 'crm_leads_do_cliente'], array['conversas', 'conversas_do_cliente'], array['wts_sessions', 'wts_sessoes_do_cliente']];
  alvo text; d text; n text; arg text; sec boolean; tipo1 oid; i int;
begin
  foreach alvo in array alvos loop
    if to_regprocedure(alvo) is null then raise notice 'crm_por_medico: % não existe, pulada', alvo; continue; end if;
    select pg_get_functiondef(p.oid), p.proargnames[1], p.prosecdef, p.proargtypes[0]
      into d, arg, sec, tipo1 from pg_proc p where p.oid = to_regprocedure(alvo);
    if not sec or tipo1 <> 'uuid'::regtype::oid or arg !~ '^p_client(_id)?$' then
      raise exception 'crm_por_medico: % não tem o formato esperado (definer, 1º argumento p_client uuid)', alvo;
    end if;
    if d ~* '(delete\s+from|update|insert\s+into)\s+(public\.)?(crm_leads|conversas|wts_sessions)\y' then
      raise exception 'crm_por_medico: % escreve nas tabelas lidas; não é leitura', alvo;
    end if;
    n := d;
    for i in 1 .. array_length(tabelas, 1) loop
      -- Sem apelido ("from crm_leads where"): ganha o nome da tabela como apelido, para "crm_leads.x" continuar valendo.
      n := regexp_replace(n,
        '\y(from|join)(\s+)(public\.)?' || tabelas[i][1] || '(\s+(where|group|order|limit|left|right|inner|full|cross|join|on|union|window|having)\y|\s*[),;])',
        '\1\2public.' || tabelas[i][2] || '(' || arg || ') ' || tabelas[i][1] || '\4', 'gi');
      -- Com apelido ("from crm_leads cl", "from public.conversas c").
      n := regexp_replace(n,
        '\y(from|join)(\s+)(public\.)?' || tabelas[i][1] || '(\s+)',
        '\1\2public.' || tabelas[i][2] || '(' || arg || ')\4', 'gi');
    end loop;
    if n <> d then execute n; end if;
  end loop;
end
$migra$;

-- O aviso "CRM compartilhado" só enquanto o cliente não tem regra; e a tela sabe quando a regra está ligada.
do $migra$
declare
  d text;
  a1 text := $a$       where k.client_id = p_client and k.active), '[]'::jsonb),$a$;
  n1 text := $n$       where k.client_id = p_client and k.active and not public.crm_tem_filtro(p_client)), '[]'::jsonb),
    'crm_filtro_ativo', public.crm_tem_filtro(p_client),$n$;
begin
  d := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  if position('crm_filtro_ativo' in d) = 0 then
    if position(a1 in d) = 0 then raise exception 'pacientes_periodo: trecho do crm_compartilhado_com não encontrado'; end if;
    execute replace(d, a1, n1);
  end if;

  d := pg_get_functiondef('public.roi_periodo(uuid,date,date)'::regprocedure);
  a1 := $a$    where con.subdomain is not null and con.subdomain <> ''$a$;
  n1 := $n$    where con.subdomain is not null and con.subdomain <> '' and not public.crm_tem_filtro(p_client_id)$n$;
  if position('crm_tem_filtro' in d) = 0 then
    if position(a1 in d) = 0 then raise exception 'roi_periodo: trecho de outros não encontrado'; end if;
    execute replace(d, a1, n1);
  end if;

  d := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  a1 := $a$    where c.client_id = p_client_id and c.active and c.subdomain is not null
    having count(distinct o.client_id) > 0$a$;
  n1 := $n$    where c.client_id = p_client_id and c.active and c.subdomain is not null and not public.crm_tem_filtro(p_client_id)
    having count(distinct o.client_id) > 0$n$;
  if position('crm_tem_filtro' in d) = 0 then
    if position(a1 in d) = 0 then raise exception 'qualidade_dados: trecho do CRM compartilhado não encontrado'; end if;
    execute replace(d, a1, n1);
  end if;

  d := pg_get_functiondef('public.crm_diagnostico_comercial(uuid,date,date)'::regprocedure);
  a1 := $a$o.client_id <> p_client_id and o.active and conns.subdomain is not null$a$;
  n1 := $n$o.client_id <> p_client_id and o.active and conns.subdomain is not null and not public.crm_tem_filtro(p_client_id)$n$;
  if position('crm_tem_filtro' in d) = 0 then
    if position(a1 in d) = 0 then raise exception 'crm_diagnostico_comercial: trecho do CRM compartilhado não encontrado'; end if;
    execute replace(d, a1, n1);
  end if;

  d := pg_get_functiondef('public.wts_fila_do_cliente(uuid,date,date)'::regprocedure);
  a1 := $a$where c.id = p_client_id and c.wts_company_id is not null and (select pode from ok)$a$;
  n1 := $n$where c.id = p_client_id and c.wts_company_id is not null and (select pode from ok) and not public.crm_tem_filtro(p_client_id)$n$;
  if position('crm_tem_filtro' in d) = 0 then
    if position(a1 in d) = 0 then raise exception 'wts_fila_do_cliente: trecho da conta compartilhada não encontrado'; end if;
    execute replace(d, a1, n1);
  end if;
end
$migra$;

-- Conta de anúncios compartilhada: até o dono decidir de quem é a conta, as duas telas avisam com o nome do outro
-- cliente (o ROI já mostrava esse nome ao membro). Cliente de teste fica fora. Nenhum dado muda.
create or replace function public.contas_anuncio_compartilhadas(p_client_id uuid)
returns jsonb
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  with ligadas as (
    select a.client_id, a.ad_account_id from client_ad_accounts a join clients c on c.id = a.client_id and c.active and not c.eh_teste where a.active
    union
    select c.id, c.meta_ad_account_id from clients c where c.active and not c.eh_teste and c.meta_ad_account_id is not null and c.meta_ad_account_id <> ''
  ),
  minhas as (select distinct ad_account_id from ligadas where client_id = p_client_id)
  select case when not (public.is_app_admin() or public.is_client_member(p_client_id)) then null else coalesce(jsonb_agg(x), '[]'::jsonb) end
  from (
    select m.ad_account_id,
      count(distinct l.client_id) as outros_clientes,
      (select jsonb_agg(distinct c.name) from clients c where c.id in (select l2.client_id from ligadas l2 where l2.ad_account_id = m.ad_account_id and l2.client_id <> p_client_id)) as nomes
    from minhas m join ligadas l on l.ad_account_id = m.ad_account_id and l.client_id <> p_client_id
    group by m.ad_account_id
  ) x;
$function$;
revoke all on function public.contas_anuncio_compartilhadas(uuid) from public, anon;
grant execute on function public.contas_anuncio_compartilhadas(uuid) to authenticated;
