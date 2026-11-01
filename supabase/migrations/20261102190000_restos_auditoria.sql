-- Restos da auditoria de confiabilidade (01/11/2026).
--
--   1. ads_planilha_semanal.removido_em: linha que saiu da planilha de origem (ou lançamento à mão já coberto por uma
--      análise da planilha) fica marcada e sai das leituras, em vez de continuar somando. Dra. Marcelly: 39 linhas
--      que não estão mais na planilha, R$ 2.039 numa semana só (lançamento à mão de 21/10, refeito pela análise de 29/10).
--      Nenhuma linha é apagada; o sync marca e desmarca (api/_lib/ads-planilha-sync.ts).
--   2. "Dados até" dos anúncios lidos pela planilha: só conta semana com investimento anotado e linha ainda na planilha.
--      Semana sem valor (a de 30/10, 32 posts sem "Valor no Período") é "sem dado", não um dia de dado novo.
--      Funções: client_sync_status, status_fontes_clientes e fontes_base.
--   3. Post apagado ou arquivado no Instagram (instagram_posts.removido_em) fora das contas que ainda o somavam:
--      cobertura_periodo (posts), conteudo_comercial (posts do período), conteudo_comercial_profundo (posts com
--      comentário de compra e as duas somas de comentários dos posts do período) e suggest_next_angles.
--      As funções de "dados até" (max(metrics_updated_at)) não mudam: post removido não recebe métrica nova.
--   4. Tokens de CRM e do Instagram fora do navegador: SELECT de crm_connections.access_token, webhook_secret e
--      instagram_account_secrets.meta_access_token sai de authenticated (o admin continua gravando; os syncs leem
--      com service_role). O admin sabe se a conexão tem token/URL de webhook por crm_conexoes_credenciais().
--
-- As trocas em funções existentes seguem o padrão de 20261030120000: substitui só o trecho auditado e pula a função
-- que já está corrigida ou que não tem o trecho (versão diferente). O REVOKE do item 4 é a única parte que tira acesso.
--
-- Reversão:
--   alter table public.ads_planilha_semanal drop column if exists removido_em;
--   grant select on public.crm_connections, public.instagram_account_secrets to authenticated;
--   drop function if exists public.crm_conexoes_credenciais(uuid);
--   (funções: reaplicar as definições de 20261102100000, 20261031120000 e anteriores)

alter table public.ads_planilha_semanal add column if not exists removido_em timestamptz;
comment on column public.ads_planilha_semanal.removido_em is
  'Quando o sync viu que a linha não está mais na planilha de origem (ou que o lançamento à mão foi coberto por uma análise da planilha). Null = vale. Leituras filtram removido_em is null.';

do $migra$
declare r record; def text;
begin
  for r in
    select * from (values
      ('public.cobertura_periodo(uuid,date,date)'::regprocedure,
       'from instagram_posts where client_id = p_client and (select pode from ok)',
       'from instagram_posts where client_id = p_client and removido_em is null and (select pode from ok)'),
      ('public.conteudo_comercial(uuid,date,date)'::regprocedure,
       'where p.client_id = p_client and p.posted_at >= j.ini and p.posted_at < j.fim and (select pode from ok)',
       'where p.client_id = p_client and p.removido_em is null and p.posted_at >= j.ini and p.posted_at < j.fim and (select pode from ok)'),
      ('public.conteudo_comercial_profundo(uuid,date,date)'::regprocedure,
       'join instagram_posts p on p.id = pp.post_id and p.client_id = p_client',
       'join instagram_posts p on p.id = pp.post_id and p.client_id = p_client and p.removido_em is null'),
      ('public.conteudo_comercial_profundo(uuid,date,date)'::regprocedure,
       'where ip.client_id = p_client and ip.posted_at >= j.ini',
       'where ip.client_id = p_client and ip.removido_em is null and ip.posted_at >= j.ini'),
      ('public.suggest_next_angles(uuid,integer)'::regprocedure,
       'and tema is not null',
       'and tema is not null and removido_em is null'),
      ('public.client_sync_status(uuid)'::regprocedure,
       'from ads_planilha_semanal where client_id = p_client_id and analise_em <= current_date)',
       'from ads_planilha_semanal where client_id = p_client_id and analise_em <= current_date and removido_em is null and valor_periodo is not null)'),
      ('public.status_fontes_clientes()'::regprocedure,
       's.client_id = c.id and s.analise_em <= current_date)',
       's.client_id = c.id and s.analise_em <= current_date and s.removido_em is null and s.valor_periodo is not null)'),
      ('public.fontes_base(uuid)'::regprocedure,
       's.client_id = c.id and s.analise_em <= current_date)',
       's.client_id = c.id and s.analise_em <= current_date and s.removido_em is null and s.valor_periodo is not null)')
    ) as v(fn, antigo, novo)
  loop
    def := pg_get_functiondef(r.fn);
    if position(r.novo in def) > 0 then
      continue; -- já aplicada
    end if;
    if position(r.antigo in def) = 0 then
      raise notice '%: sem o trecho auditado; mantida como está', r.fn;
      continue;
    end if;
    execute replace(def, r.antigo, r.novo);
  end loop;
end
$migra$;

-- Tokens: revogar SELECT da tabela não basta quando há grant por coluna; revoga os dois e devolve só as colunas
-- sem segredo. INSERT/UPDATE/DELETE continuam com as policies de admin (a tela grava o token, não o lê).
do $tokens$
declare tabela text; segredos text[]; todas text; livres text;
begin
  for tabela, segredos in
    select * from (values
      ('crm_connections', array['access_token', 'webhook_secret']),
      ('instagram_account_secrets', array['meta_access_token'])
    ) as v(t, s)
  loop
    if to_regclass(format('public.%I', tabela)) is null then continue; end if;
    select string_agg(format('%I', a.attname), ', ' order by a.attnum),
           string_agg(format('%I', a.attname), ', ' order by a.attnum) filter (where a.attname <> all(segredos))
      into todas, livres
    from pg_attribute a
    where a.attrelid = format('public.%I', tabela)::regclass and a.attnum > 0 and not a.attisdropped;
    execute format('revoke select on public.%I from public, anon, authenticated', tabela);
    execute format('revoke select (%s) on public.%I from public, anon, authenticated', todas, tabela);
    if livres is not null then execute format('grant select (%s) on public.%I to authenticated', livres, tabela); end if;
    execute format('grant select, insert, update, delete on public.%I to service_role', tabela);
  end loop;
end
$tokens$;

-- "Tem token?" e "tem URL de webhook?" para a tela do admin, sem devolver o valor.
create or replace function public.crm_conexoes_credenciais(p_client uuid)
returns table(id uuid, tem_token boolean, tem_webhook boolean)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select c.id, coalesce(btrim(c.access_token), '') <> '', coalesce(btrim(c.webhook_secret), '') <> ''
  from public.crm_connections c
  where c.client_id = p_client and public.is_app_admin();
$function$;
revoke all on function public.crm_conexoes_credenciais(uuid) from public, anon;
grant execute on function public.crm_conexoes_credenciais(uuid) to authenticated, service_role;
