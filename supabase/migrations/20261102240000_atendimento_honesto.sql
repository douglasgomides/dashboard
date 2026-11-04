-- Atendimento honesto (auditoria 2 de 01/11/2026).
--
-- 1. "Espera até a 1ª resposta" mostrava o timeWait da WTS/Helena. A doc oficial (helena.readme.io, GET /chat/v2/session,
--    PublicSessionDTOV2) não define o campo, e medido nas mesmas sessões ele dá cerca de metade do tempo real até a 1ª
--    resposta (Dra. Juliana Paola, 30 dias: mediana 5.014 s de timeWait contra 10.955 s de firstResponseAt - startAt).
--    Agora:
--      - wts_sessions.wait_seconds = 1ª resposta calculada pelas MENSAGENS (1ª mensagem do paciente até a 1ª mensagem
--        de uma pessoa da clínica, sem robô, campanha, integração nem registro do sistema). O Digisac já gravava assim;
--        a WTS passa a gravar em api/_lib/conversas-wts.ts (primeiraRespostaWts). Todas as leituras que já usavam
--        wait_seconds (wts_resumo, wts_por_departamento, wts_por_agente, wts_volume_diario, tracker do SAP) passam a
--        mostrar a 1ª resposta de verdade sem mudar de assinatura.
--      - wts_sessions.fila_segundos = o timeWait da WTS, com o nome do que é ("tempo na fila, medido pela WTS"). O valor
--        que estava em wait_seconds nas contas WTS é MOVIDO para cá (não se perde). As sessões ficam sem 1ª resposta até
--        a conversa ser relida pelo sync (primeira_resposta_conferida_em nulo entra na fila de releitura).
--      - wts_resumo ganha fila_mediana_seg e fila_cobertura no fim (a tela mostra a fila com o rótulo certo quando a 1ª
--        resposta ainda não tem amostra).
-- 2. Sessão v2: type (INDIVIDUAL/GROUP), origin e utm (origem do anúncio de clique para WhatsApp) passam a ser gravados
--    em sessao_tipo, sessao_origem e sessao_utm (prefixo para não colidir com tipo/origem de outras tabelas nas funções
--    que leem wts_sessions com select s.*).
-- 3. primeira_resposta_conferida_em: quando a 1ª resposta foi calculada pelas mensagens (mesmo que sem resultado). Nulo =
--    ainda não calculada pela regra nova; WTS e Digisac relêem essas conversas aos poucos.
--
-- Não destrutiva: só colunas novas, cópia de wait_seconds para fila_segundos antes de limpar wait_seconds nas contas WTS,
-- e a troca da assinatura de wts_resumo (colunas novas no fim; as antigas com o mesmo nome e tipo).
-- Ordem de publicação: aplicar ANTES do código (o sync grava as colunas novas).
-- Reversão: update wts_sessions set wait_seconds = fila_segundos where fila_segundos is not null; e recriar wts_resumo
-- de 20261102150000 (drop function public.wts_resumo(uuid, date, date) antes).

alter table public.wts_sessions add column if not exists fila_segundos integer;
alter table public.wts_sessions add column if not exists sessao_tipo text;
alter table public.wts_sessions add column if not exists sessao_origem text;
alter table public.wts_sessions add column if not exists sessao_utm jsonb;
alter table public.wts_sessions add column if not exists primeira_resposta_conferida_em timestamptz;

comment on column public.wts_sessions.wait_seconds is '1ª resposta em segundos, calculada pelas mensagens: 1ª mensagem do paciente até a 1ª mensagem de uma pessoa da clínica (sem robô, campanha, integração nem registro do sistema). Nulo = não medido.';
comment on column public.wts_sessions.fila_segundos is 'timeWait da WTS/Helena: tempo na fila medido pela própria WTS. A doc não define o campo; NÃO é o tempo até a 1ª resposta.';
comment on column public.wts_sessions.sessao_tipo is 'Tipo da sessão na WTS v2: INDIVIDUAL ou GROUP.';
comment on column public.wts_sessions.sessao_origem is 'origin da sessão na WTS v2.';
comment on column public.wts_sessions.sessao_utm is 'utm da sessão na WTS v2 (sourceId, source, clid, medium, campaign, content, headline, term, referralUrl).';
comment on column public.wts_sessions.primeira_resposta_conferida_em is 'Quando a 1ª resposta foi calculada pelas mensagens. Nulo = ainda não; o sync relê a conversa.';

-- Contas WTS: o timeWait sai da coluna da 1ª resposta e vai para a da fila. Só onde a fila ainda está vazia (rodar de
-- novo não sobrescreve nada) e nunca em cliente sem conta WTS (Digisac grava wait_seconds pelas mensagens).
update public.wts_sessions s
   set fila_segundos = s.wait_seconds,
       wait_seconds = null
 where s.wait_seconds is not null
   and s.fila_segundos is null
   and s.primeira_resposta_conferida_em is null
   and exists (select 1 from public.clients c where c.id = s.client_id and c.wts_company_id is not null);

-- Digisac: a 1ª resposta já gravada saiu das mensagens; conta como conferida. As demais entram na fila de releitura.
update public.wts_sessions s
   set primeira_resposta_conferida_em = coalesce(s.updated_at, now())
 where s.primeira_resposta_conferida_em is null
   and s.wait_seconds is not null
   and exists (select 1 from public.crm_connections k where k.client_id = s.client_id and k.provider = 'digisac')
   and exists (select 1 from public.clients c where c.id = s.client_id and c.wts_company_id is null);

-- Resumo do atendimento: a 1ª resposta (espera_*) vem de wait_seconds; a fila da WTS vem à parte, com o nome certo.
drop function if exists public.wts_resumo(uuid, date, date);
create function public.wts_resumo(p_client_id uuid, p_start date, p_end date)
returns table(atendimentos bigint, concluidos bigint, em_andamento bigint, espera_mediana_seg numeric, espera_cobertura bigint,
              atendimento_mediano_seg numeric, atendimento_cobertura bigint, sem_roteamento bigint, contatos_distintos bigint,
              fila_mediana_seg numeric, fila_cobertura bigint)
language sql stable security definer set search_path = public, pg_temp
as $function$
  with base as (
    select s.*, d.name as departamento
    from public.wts_sessoes_do_cliente(p_client_id) s
    left join wts_departments d
      on d.client_id = s.client_id and d.department_id = s.department_id
    where s.client_id = p_client_id
      and (public.is_app_admin() or public.is_client_member(p_client_id))
      and s.started_at >= (p_start::timestamp at time zone 'America/Sao_Paulo')
      and s.started_at < ((p_end + 1)::timestamp at time zone 'America/Sao_Paulo')
  )
  select count(*),
         count(*) filter (where status = 'COMPLETED'),
         -- Aguardando sem atendente (PENDING) é conversa aberta: o paciente escreveu e espera.
         count(*) filter (where status in ('IN_PROGRESS', 'PENDING') and ended_at is null),
         -- 1ª resposta pelas mensagens (ver comentário de wait_seconds).
         round((percentile_cont(0.5) within group (order by wait_seconds))::numeric, 0),
         count(wait_seconds),
         round((percentile_cont(0.5) within group (order by service_seconds))::numeric, 0),
         count(service_seconds),
         count(*) filter (where department_id is null or departamento = 'Geral'),
         count(distinct contact_id),
         -- Tempo na fila medido pela WTS (timeWait). Não é a 1ª resposta.
         round((percentile_cont(0.5) within group (order by fila_segundos))::numeric, 0),
         count(fila_segundos)
  from base;
$function$;
revoke all on function public.wts_resumo(uuid, date, date) from public, anon;
grant execute on function public.wts_resumo(uuid, date, date) to authenticated, service_role;
