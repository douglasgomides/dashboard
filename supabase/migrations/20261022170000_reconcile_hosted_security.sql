-- Reconciliação após PR169 e depois de 20261022160000 (arquivo criado pelo CLI).
-- Rollout hospedado: aplicar SOMENTE este delta em staging/produção depois do
-- preflight. Não reaplicar migrations antigas, seeds nem o bootstrap da branch.
-- As duas instalações já têm os contratos; este delta falha se uma RPC de leitura
-- mudou desde a revisão. Não modifica dados, não valida constraints legadas,
-- não substitui tem_modulo/agentes_marcar_marco e preserva search_path vazio.
-- Executar em uma transação; conflito/timeout/contrato desconhecido deve abortar.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $reviewed_contracts$
declare r record; f regprocedure;
begin
  for r in select * from (values
    ('public.listar_conversas(uuid,integer,integer)','p_client uuid, p_limite integer, p_offset integer',
      'TABLE(id uuid, pessoa_nome text, telefone_final text, provider text, ultima_msg_em timestamp with time zone, ultima_msg_texto text, total_msgs bigint, lead_id uuid, codigo_ref text)',
      'c76919cd3f38d98f2e68a22419c8e393','d6ee4a7384124c50b59ba76804468075'),
    ('public.ler_mensagens(uuid)','p_conversa uuid',
      'TABLE(id uuid, direcao text, autor text, texto text, tipo text, enviada_em timestamp with time zone)',
      'ec585168dc76a2b6c4f45260a932b644','55420c674123bf42598551e6c9cbc9e3'),
    ('public.jornada_resumo(uuid,date,date)','p_client uuid, p_de date, p_ate date','jsonb',
      '573bb0f3a1743e90c996d01ba1815168','a8951f39f0a8d9d44ec56dd18a47a41c'),
    ('public.receita_em_jogo(uuid,date,date)','p_client uuid, p_de date, p_ate date','jsonb',
      'e76333629e702edd6a0be5e730e1651a','b20df993d61670f5938c44edea483fba'),
    ('public.definir_ticket_cliente(uuid,numeric)','p_client uuid, p_valor numeric','void',
      'fc7558ea68ade3f42da22c4f0212dfbb','87c33a5793a9a2712e239d07110c2f09')
  ) as t(signature,args,result,legacy_hash,fixed_hash)
  loop
    f:=to_regprocedure(r.signature);
    if f is null or pg_get_function_identity_arguments(f)<>r.args or pg_get_function_result(f)<>r.result
      or not exists(select 1 from pg_proc where oid=f and md5(prosrc) in(r.legacy_hash,r.fixed_hash)) then
      raise exception 'Contrato não revisado: %. Reconciliar antes do rollout.',r.signature;
    end if;
  end loop;
end;
$reviewed_contracts$;

-- 1. Limites de credenciais e permissões atuais (inclui grants por coluna).
-- Delta do catálogo hospedado, conferido em 17/10/2026. Os grants de SELECT
-- integrais persistiam em produção: não depender de reaplicar migrações antigas.
-- Aplicar com o frontend que já seleciona colunas explícitas. Nenhum valor é
-- lido/alterado; service_role e policies de administração permanecem intactos.
-- Revogar só SELECT da tabela não remove grants já existentes POR COLUNA.
do $$
declare tabela text; colunas text;
begin
  foreach tabela in array array['clients', 'client_ad_accounts'] loop
    select string_agg(format('%I', a.attname), ', ' order by a.attnum) into colunas
    from pg_attribute a
    where a.attrelid = format('public.%I', tabela)::regclass and a.attnum > 0 and not a.attisdropped;
    execute format('revoke select on public.%I from public, anon, authenticated', tabela);
    execute format('revoke select (%s) on public.%I from public, anon, authenticated', colunas, tabela);
  end loop;
end $$;

-- A allowlist usa apenas colunas já existentes: ticket_medio é criada mais
-- tarde no bootstrap, mas precisa continuar legível no catálogo hospedado atual.
-- digisac_url é configuração interna e não volta a ser exposta.
do $client_metadata$
declare colunas text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum) into colunas
  from pg_attribute a
  where a.attrelid = 'public.clients'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attname = any(array['id','name','specialty','instagram_handle','cfm_score_status','active','created_at',
      'meta_ad_account_id','wts_company_id','avatar_url','wts_department_ids','em_onboarding','ads_planilha_url','ticket_medio']);
  execute format('grant select (%s) on public.clients to authenticated', colunas);
end;
$client_metadata$;
grant select (client_id, ad_account_id, name, active, created_at, provisional)
  on public.client_ad_accounts to authenticated;

-- Staging de importações já está com RLS sem policies no catálogo real:
-- isso é deny-by-default para usuários, não uma falha que exija abrir acesso.
-- Fecha também privilégios diretos por coluna de eventuais importações antigas.
-- Não cria staging nem inventa sua estrutura nos ambientes que não o possuem.
do $$
declare tabela text; colunas text;
begin
  foreach tabela in array array['_flw_stage', '_flw_steps'] loop
    if to_regclass(format('public.%I', tabela)) is not null then
      execute format('alter table public.%I enable row level security', tabela);
      execute format('revoke all on public.%I from public, anon, authenticated', tabela);
      select string_agg(format('%I', a.attname), ', ' order by a.attnum) into colunas
      from pg_attribute a
      where a.attrelid = format('public.%I', tabela)::regclass and a.attnum > 0 and not a.attisdropped;
      if colunas is not null then
        execute format('revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on public.%2$I from public, anon, authenticated', colunas, tabela);
      end if;
    end if;
  end loop;
end $$;

-- 2. ACL/RLS e somente paths legados public.
-- Hardening aditivo: nenhuma alteração de versões já publicadas e nenhum dado apagado.
-- O aplicativo exige login. Grants padrão do Supabase não devem abrir tabelas,
-- views ou RPCs ao papel anon, nem permitir TRUNCATE (que ignora RLS).
revoke all on all tables in schema public from public, anon;
revoke all on all sequences in schema public from public, anon;
revoke execute on all functions in schema public from public, anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke create on schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from public, anon;
alter default privileges in schema public revoke all on sequences from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Grants por coluna não são removidos pelo REVOKE da tabela.
do $column_acl$
declare r record;
begin
  for r in select c.relname, string_agg(format('%I',a.attname), ', ' order by a.attnum) as cols
    from pg_class c join pg_attribute a on a.attrelid=c.oid
    where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v')
      and a.attnum>0 and not a.attisdropped group by c.relname
  loop
    execute format('revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on public.%2$I from public, anon',r.cols,r.relname);
    execute format('revoke references (%s) on public.%I from authenticated',r.cols,r.relname);
  end loop;
end;
$column_acl$;

-- A view antes usava o proprietário e contornava as policies das tabelas-base.
-- PostgreSQL 15+, já necessário para sap_funil_semanal.
alter view public.meta_ads_daily_v set (security_invoker = true);

-- Corrige somente o path legado exatamente public. Paths vazios das RPCs
-- recentes são seguros e permanecem intactos; paths com extensões exigem revisão.
-- Sem pg_temp explícito ao final, tabelas temporárias sombreiam nomes legados.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proconfig @> array['search_path=public']
  loop
    execute format('alter function %s set search_path = public, pg_temp', f);
  end loop;
end $$;

-- RLS protege linhas, não colunas. Antes um membro podia alterar alcance,
-- legendas, IDs de conta e até mover o post para outro cliente do qual era membro.
-- O navegador só classifica; métricas e identidade vêm do servidor.
revoke update on public.instagram_posts from authenticated;
do $$ declare cols text; begin
  select string_agg(format('%I',attname), ', ' order by attnum) into cols from pg_attribute
    where attrelid='public.instagram_posts'::regclass and attnum>0 and not attisdropped;
  execute format('revoke update (%s) on public.instagram_posts from authenticated',cols);
end $$;
grant update (funnel_stage, methodology_stage, tema, format) on public.instagram_posts to authenticated;
drop policy if exists "write own or admin writes all post classification" on public.instagram_posts;
drop policy if exists "editors classify their posts" on public.instagram_posts;
create policy "editors classify their posts" on public.instagram_posts
  for update to authenticated
  using (public.pode_editar_acoes(client_id))
  with check (public.pode_editar_acoes(client_id));

revoke update on public.content_angle_suggestions from authenticated;
do $$ declare cols text; begin
  select string_agg(format('%I',attname), ', ' order by attnum) into cols from pg_attribute
    where attrelid='public.content_angle_suggestions'::regclass and attnum>0 and not attisdropped;
  execute format('revoke update (%s) on public.content_angle_suggestions from authenticated',cols);
end $$;
grant update (status) on public.content_angle_suggestions to authenticated;
drop policy if exists "update own or admin updates all angle suggestions" on public.content_angle_suggestions;
drop policy if exists "editors update suggestion status" on public.content_angle_suggestions;
create policy "editors update suggestion status" on public.content_angle_suggestions
  for update to authenticated
  using (public.pode_editar_acoes(client_id))
  with check (public.pode_editar_acoes(client_id));

-- tem_modulo e agentes_marcar_marco pertencem ao contrato operacional de
-- 20261022090000. Não substituir suas regras de contrato, rodada, evidência,
-- consumo da aprovação nem vínculo ClickUp por definições anteriores.

-- 3. Novas tabelas do owner de migrations não devem recuperar TRUNCATE.
-- Apenas defaults do schema public; não altera Auth/Storage ou defaults globais.
-- supabase_admin pode ser imutável para postgres hospedado: o preflight relata
-- esse owner residual. Owners não gerenciáveis nunca são alterados às cegas.
do $future_table_acl$
declare owner_name text;
begin
  for owner_name in
    select rolname from pg_roles where rolname=current_user or
      (rolname in ('postgres','supabase_admin') and pg_has_role(current_user,oid,'MEMBER'))
  loop
    execute format('alter default privileges for role %I in schema public revoke all on tables from public, anon',owner_name);
    execute format('alter default privileges for role %I in schema public revoke truncate, references, trigger on tables from authenticated',owner_name);
    execute format('alter default privileges for role %I in schema public revoke all on sequences from public, anon',owner_name);
    execute format('alter default privileges for role %I in schema public revoke execute on functions from public, anon',owner_name);
  end loop;
end;
$future_table_acl$;

-- 4. Relações tenant: NOT VALID preserva o legado e protege novas chaves.
-- Duas FKs independentes para client_id e parent_id aceitam um filho de A
-- apontando para pai de B. Policies e RPCs passam a confiar em relações falsas.
-- As chaves compostas conferem o tenant, inclusive nas escritas de service_role.
-- NOT VALID mantém a migração compatível com dados legados: protege INSERT e
-- mudanças de chave imediatamente, sem apagar/corrigir silenciosamente dados.
-- Após auditar dados existentes, validar com ALTER TABLE ... VALIDATE CONSTRAINT.
create unique index if not exists instagram_accounts_id_client_uidx on public.instagram_accounts(id, client_id);
create unique index if not exists instagram_posts_id_client_uidx on public.instagram_posts(id, client_id);
create unique index if not exists crm_connections_id_client_uidx on public.crm_connections(id, client_id);
create unique index if not exists crm_leads_id_client_uidx on public.crm_leads(id, client_id);
create unique index if not exists pessoas_id_client_uidx on public.pessoas(id, client_id);
create unique index if not exists links_rastreados_id_client_uidx on public.links_rastreados(id, client_id);
create unique index if not exists conversas_id_client_uidx on public.conversas(id, client_id);
create unique index if not exists agente_execucoes_id_client_uidx on public.agente_execucoes(id, client_id);

-- As FKs simples existentes conservam suas ações ON DELETE (CASCADE / SET NULL).
-- Eventos não tinham FK anterior: seguem a exclusão da conexão, sem órfãos.
-- MATCH SIMPLE permite que um vínculo opcional fique nulo sem zerar client_id.
do $$
declare r record;
begin
  for r in select * from (values
    ('instagram_posts', 'instagram_account_id', 'instagram_accounts'),
    ('instagram_account_daily_metrics', 'instagram_account_id', 'instagram_accounts'),
    ('instagram_stories', 'instagram_account_id', 'instagram_accounts'),
    ('instagram_comments', 'instagram_post_id', 'instagram_posts'),
    ('crm_leads', 'crm_connection_id', 'crm_connections'),
    ('crm_raw_events', 'crm_connection_id', 'crm_connections'),
    ('crm_leads', 'pessoa_id', 'pessoas'),
    ('crm_lead_eventos', 'crm_connection_id', 'crm_connections'),
    ('links_rastreados', 'instagram_post_id', 'instagram_posts'),
    ('toques', 'pessoa_id', 'pessoas'),
    ('toques', 'link_id', 'links_rastreados'),
    ('toques', 'instagram_post_id', 'instagram_posts'),
    ('conversas', 'pessoa_id', 'pessoas'),
    ('conversas', 'lead_id', 'crm_leads'),
    ('mensagens', 'conversa_id', 'conversas'),
    ('conversas_resumos', 'conversa_id', 'conversas'),
    ('conversas_origem_anuncio', 'conversa_id', 'conversas'),
    ('pautas_conteudo', 'post_id', 'instagram_posts'),
    ('aprovacoes', 'execucao_id', 'agente_execucoes'),
    ('ia_execucoes', 'execucao_id', 'agente_execucoes'),
    ('brain_itens', 'execucao_id', 'agente_execucoes')
  ) as rel(child_table, parent_column, parent_table)
  loop
    if not exists (select 1 from pg_constraint
      where conrelid = format('public.%I', r.child_table)::regclass
        and conname = r.child_table || '_' || r.parent_column || '_tenant_fk') then
      execute format('alter table public.%I add constraint %I foreign key (%I, client_id) references public.%I(id, client_id)%s not valid',
        r.child_table, r.child_table || '_' || r.parent_column || '_tenant_fk', r.parent_column, r.parent_table,
        case when r.child_table = 'crm_lead_eventos' then ' on delete cascade' else '' end);
    end if;
  end loop;
end $$;

-- 5. Busca literal: preserva as duas assinaturas conhecidas, sem DROP.
-- Correção aditiva do contrato hospedado: ILIKE interpretava % e _ como
-- curingas. Preserva exatamente as duas assinaturas de retorno conhecidas.
-- No banco novo a função ainda não existe nesta versão cronológica; o bootstrap
-- 20261022140000 a criará com busca literal. Não cria/dropa função ausente.
do $migration$
declare
  v_function regprocedure := to_regprocedure('public.buscar_pessoas(uuid,text)');
  v_return text;
  v_projection text;
begin
  if v_function is null then return; end if;
  v_return := pg_get_function_result(v_function);
  if pg_get_function_identity_arguments(v_function) <> 'p_client uuid, p_q text' then
    raise exception 'buscar_pessoas: argumentos inesperados; revisar contrato antes de substituir';
  end if;
  if v_return = 'TABLE(id uuid, nome text, ig_username text, telefone_final text, origem text)' then
    v_projection := $projection$p.id, p.nome, p.ig_username,
      case when p.telefone is not null then '…' || right(regexp_replace(p.telefone, '\D', '', 'g'), 4) end,
      p.origem_primeira$projection$;
  elsif v_return = 'TABLE(id uuid, nome text, telefone_final text, ig_username text)' then
    v_projection := $projection$p.id, p.nome,
      case when p.telefone is not null then '…' || right(regexp_replace(p.telefone, '\D', '', 'g'), 4) end,
      p.ig_username$projection$;
  else
    raise exception 'buscar_pessoas: retorno inesperado; revisar contrato antes de substituir';
  end if;

  -- As substituições são constantes escolhidas somente pelas duas assinaturas
  -- acima; nenhum argumento fornecido pelo usuário entra no SQL de definição.
  execute format($definition$
    create or replace function public.buscar_pessoas(p_client uuid, p_q text)
    returns %s
    language sql stable security definer set search_path = public, pg_temp
    as $body$
      with input as (
        select btrim(coalesce(p_q, '')) as term
      ), search as (
        select term, ltrim(term, '@') as handle,
          regexp_replace(term, '\D', '', 'g') as digits from input
      )
      select %s
      from public.pessoas p cross join search s
      where p.client_id = p_client
        and (public.is_app_admin() or public.is_client_member(p_client))
        and length(s.term) between 2 and 100
        and (strpos(lower(coalesce(p.nome, '')), lower(s.term)) > 0
          or (length(s.handle) > 0 and strpos(lower(coalesce(p.ig_username, '')), lower(s.handle)) > 0)
          or (length(s.digits) >= 4 and strpos(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g'), s.digits) > 0))
      order by p.atualizado_em desc nulls last, p.id
      limit 30;
    $body$;
  $definition$, v_return, v_projection);
  execute 'revoke all on function public.buscar_pessoas(uuid,text) from public, anon';
  execute 'grant execute on function public.buscar_pessoas(uuid,text) to authenticated, service_role';
end;
$migration$;

-- 6. Somente as duas RPCs existentes; não recria contratos bootstrap.
-- As funções de conversa também filtram o tenant dos filhos. Isso protege a
-- leitura enquanto eventuais relações legadas ainda aguardam validação das FKs.
create or replace function public.listar_conversas(p_client uuid, p_limite integer default 50, p_offset integer default 0)
returns table(id uuid, pessoa_nome text, telefone_final text, provider text, ultima_msg_em timestamptz,
  ultima_msg_texto text, total_msgs bigint, lead_id uuid, codigo_ref text)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then return; end if;
  insert into public.acessos_conversas(user_id, client_id, acao) values (auth.uid(), p_client, 'listar');
  return query select c.id, coalesce(p.nome, 'Sem nome'),
    case when p.telefone is not null then '…' || right(regexp_replace(p.telefone, '\D', '', 'g'), 4) end,
    c.provider, c.ultima_msg_em,
    (select m.texto from public.mensagens m where m.conversa_id = c.id and m.client_id = p_client order by m.enviada_em desc, m.id desc limit 1),
    (select count(*) from public.mensagens m where m.conversa_id = c.id and m.client_id = p_client),
    c.lead_id, c.codigo_ref
  from public.conversas c left join public.pessoas p on p.id = c.pessoa_id and p.client_id = p_client
  where c.client_id = p_client
  order by c.ultima_msg_em desc nulls last, c.id
  limit greatest(1, least(coalesce(p_limite, 50), 200)) offset greatest(0, coalesce(p_offset, 0));
end;
$$;
create or replace function public.ler_mensagens(p_conversa uuid)
returns table(id uuid, direcao text, autor text, texto text, tipo text, enviada_em timestamptz)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_client uuid;
begin
  select c.client_id into v_client from public.conversas c where c.id = p_conversa;
  if v_client is null or not (public.is_app_admin() or public.is_client_member(v_client)) then return; end if;
  insert into public.acessos_conversas(user_id, client_id, conversa_id, acao) values (auth.uid(), v_client, p_conversa, 'abrir');
  return query select m.id, m.direcao, m.autor, m.texto, m.tipo, m.enviada_em
    from public.mensagens m where m.conversa_id = p_conversa and m.client_id = v_client order by m.enviada_em, m.id;
end;
$$;
revoke all on function public.listar_conversas(uuid,integer,integer), public.ler_mensagens(uuid) from public, anon;
grant execute on function public.listar_conversas(uuid,integer,integer), public.ler_mensagens(uuid) to authenticated;

-- 7. Receita sem multiplicação por interação.
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

-- 8. Ticket finito e resumo do tenant correto.
-- Delta após 20261021170000: mantém os contratos da auditoria comercial sem
-- converter texto arbitrário da IA para boolean, sem valores monetários não
-- finitos e sem unir resumo de outro cliente. Nenhum dado é reescrito.
alter table public.clients add column if not exists ticket_medio numeric;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.clients'::regclass and conname='clients_ticket_medio_finite_positive') then
    alter table public.clients add constraint clients_ticket_medio_finite_positive
      check (ticket_medio is null or (ticket_medio > 0 and ticket_medio::text not in ('NaN','Infinity','-Infinity'))) not valid;
  end if;
end $$;

create or replace function public.receita_em_jogo(p_client uuid, p_de date, p_ate date)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with permitido as (select public.is_app_admin() or public.is_client_member(p_client) as ok),
  rec as (
    select count(*) as n
    from public.conversas c
    join public.conversas_resumos r on r.conversa_id = c.id and r.client_id = c.client_id
    cross join permitido
    where permitido.ok and c.client_id = p_client
      and (c.ultima_msg_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and coalesce(r.resumo->>'etapa', '') not in ('nao_e_paciente', 'agendou')
      and coalesce(r.resumo->>'situacao', '') <> 'agendou'
      -- Booleans JSON e suas representações textuais usuais são aceitos.
      -- Ausente: recuperável=false, comercial=true. Valor inválido não conta.
      and lower(btrim(coalesce(r.resumo->>'recuperavel', 'false'))) in ('true','t','yes','y','on','1')
      and lower(btrim(coalesce(r.resumo->>'comercial', 'true'))) in ('true','t','yes','y','on','1')
  ),
  crm_ordered as (
    select l.price, row_number() over (order by l.price) as pos, count(*) over () as n
    from public.crm_leads l cross join permitido
    where permitido.ok and l.client_id = p_client and l.outcome = 'won'
      and l.price > 0 and l.price::text not in ('NaN','Infinity','-Infinity')
      and l.removido_na_origem is null
      and coalesce(l.occurred_at, l.received_at) > now() - interval '365 days'
  ),
  crm as (
    -- Mediana em numeric: não converte tickets para double precision.
    select count(*) as n, avg(price) filter (where pos in ((n+1)/2, (n+2)/2)) as med
    from crm_ordered
  ),
  latest_sap as (
    select s.ticket_medio from public.sap_clinicas s cross join permitido
    where permitido.ok and s.client_id = p_client
    order by s.created_at desc nulls last, s.id desc limit 1
  ),
  candidates as (
    select c.ticket_medio as valor, 'equipe'::text as fonte, 1 as prioridade
    from public.clients c cross join permitido where permitido.ok and c.id = p_client
    union all select round(crm.med), 'crm', 2 from crm where crm.n >= 5
    union all select ticket_medio, 'sap', 3 from latest_sap
  ),
  t as (
    select valor, fonte from candidates
    where valor > 0 and valor::text not in ('NaN','Infinity','-Infinity')
    order by prioridade limit 1
  )
  select case when not (select ok from permitido) then null else jsonb_build_object(
    'recuperaveis', (select n from rec), 'ticket', (select valor from t),
    'fonte_ticket', (select fonte from t), 'vendas_crm', (select n from crm),
    'valor', (select n from rec) * (select valor from t)
  ) end;
$$;

create or replace function public.definir_ticket_cliente(p_client uuid, p_valor numeric)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_valor is not null and (p_valor <= 0 or p_valor::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'valor invalido';
  end if;
  update public.clients set ticket_medio = p_valor where id = p_client;
  if not found then raise exception 'cliente nao encontrado'; end if;
end;
$$;
revoke all on function public.receita_em_jogo(uuid,date,date), public.definir_ticket_cliente(uuid,numeric) from public, anon;
grant execute on function public.receita_em_jogo(uuid,date,date), public.definir_ticket_cliente(uuid,numeric) to authenticated, service_role;

