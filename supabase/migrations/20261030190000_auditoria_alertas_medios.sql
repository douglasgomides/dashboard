-- Auditoria dos alertas de gravidade média (30/10/2026). Correções do que era nosso, cada uma com o caso que motivou:
--
-- 1. Tags do contato do FlwChat não chegavam aos cards antigos. A API do FlwChat só relista os cards ABERTOS, então o
--    card que já tinha saído do painel nunca recebia a tag lida depois. Dra. Marcella Brasil: 244 leads com a etiqueta
--    "pacientes base" e 34 com "RENOVAÇÃO ..." apareciam sem origem. crm_aplicar_tags_contato passa a valer também
--    para o FlwChat (contato = raw_payload.contactIds[0]); o sync chama ao fim de cada rodada.
-- 2. "Leads parados há 90+ dias" contava:
--    - o Digisac, que não tem funil nem data de movimentação: caía na data de criação do contato, e todo contato
--      antigo virava "parado" mesmo conversando ontem (IGM Palmas: 1.007 de 2.058);
--    - etapas de arquivo e de consulta já confirmada (HOMS: 849 em "LEADS ANTIGOS DO OUTRO FUNIL" e 820 em
--      "CONFIRMADO" dos 2.370). Lead esquecido de verdade no HOMS são ~560 (Contato inicial, Negociação, follow-up).
--    crm_conta_como_aberto tira os dois casos da conta.
-- 3. "Nenhum ganho em 90 dias" no Digisac: o Digisac não tem etapa de venda, então o alerta não tem o que a equipe
--    corrigir no CRM. Fica baixa (informativo) quando o cliente só tem Digisac.
-- 4. "CRM ligado a mais clientes": HOMS + 2 médicos e os 2 cadastros da IGM são de propósito. Fica baixa
--    (informativo); continua aparecendo para quem abre o detalhe.
--
-- Reversão: recriar crm_aplicar_tags_contato como em 20261030150000; trocar de volta os pares de qualidade_dados
-- abaixo (novo -> antigo); drop function crm_conta_como_aberto(text, uuid, text, text).

create or replace function public.crm_aplicar_tags_contato(p_connection_id uuid)
returns integer
language sql security definer
set search_path to 'public', 'pg_temp'
as $$
  with feito as (
    update crm_leads l
       set raw_payload = l.raw_payload || jsonb_build_object('contato_tags', to_jsonb(t.tags))
      from crm_contato_tags t
     where l.crm_connection_id = p_connection_id
       and l.provider in ('clint', 'flwchat')
       and t.crm_connection_id = p_connection_id
       and t.contato_id = case l.provider when 'clint' then l.raw_payload->'contact'->>'id' else l.raw_payload->'contactIds'->>0 end
       and t.tags <> '{}'
       and (l.raw_payload->'contato_tags') is distinct from to_jsonb(t.tags)
    returning 1
  )
  select count(*)::int from feito;
$$;
revoke all on function public.crm_aplicar_tags_contato(uuid) from public, anon, authenticated;
grant execute on function public.crm_aplicar_tags_contato(uuid) to service_role;

-- O card conta como "aberto em negociação" para o alerta de parados? Não, quando é Digisac (sem funil) ou quando a
-- etapa é de arquivo, base antiga ou consulta já confirmada/realizada.
create or replace function public.crm_conta_como_aberto(p_provider text, p_connection_id uuid, p_pipeline_id text, p_status_id text)
returns boolean
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select p_provider is distinct from 'digisac'
     and not exists (
       select 1 from crm_pipeline_statuses s
        where s.crm_connection_id = p_connection_id and s.pipeline_id = p_pipeline_id and s.status_id = p_status_id
          and s.status_name ~* '(antig|arquiv|base\M|confirmad|realizad|finalizad|conclu[ií]d|atendid)'
     );
$$;
revoke all on function public.crm_conta_como_aberto(text, uuid, text, text) from public, anon;
grant execute on function public.crm_conta_como_aberto(text, uuid, text, text) to authenticated, service_role;

do $migra$
declare
  def text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  a1 text := '  select count(*) filter (where coalesce(outcome, ''open'') = ''open''),
         count(*) filter (where coalesce(outcome, ''open'') = ''open''
                          and public.lead_ultima_movimentacao(provider, raw_payload, occurred_at) < now() - interval ''90 days''),';
  n1 text := '  select count(*) filter (where coalesce(outcome, ''open'') = ''open'' and public.crm_conta_como_aberto(provider, crm_connection_id, pipeline_id, status_id)),
         count(*) filter (where coalesce(outcome, ''open'') = ''open'' and public.crm_conta_como_aberto(provider, crm_connection_id, pipeline_id, status_id)
                          and public.lead_ultima_movimentacao(provider, raw_payload, occurred_at) < now() - interval ''90 days''),';
  a2 text := '''Leads abertos sem nenhuma mudança no CRM há 90+ dias: %s.';
  n2 text := '''Leads abertos sem nenhuma mudança no CRM há 90+ dias: %s (sem contar etapas de arquivo, base antiga ou consulta confirmada, nem o Digisac).';
  a3 text := '''id'', ''crm-sem-ganho'', ''fonte'', ''crm'', ''severidade'', ''media'',';
  n3 text := '''id'', ''crm-sem-ganho'', ''fonte'', ''crm'', ''severidade'', case when exists (select 1 from crm_connections x where x.client_id = p_client_id and x.active and x.provider <> ''digisac'') then ''media'' else ''baixa'' end,';
  a4 text := '''id'', ''crm-compartilhado'', ''fonte'', ''crm'', ''severidade'', ''media'',';
  n4 text := '''id'', ''crm-compartilhado'', ''fonte'', ''crm'', ''severidade'', ''baixa'',';
begin
  if position('crm_conta_como_aberto' in def) > 0 then return; end if;
  if position(a1 in def) = 0 or position(a2 in def) = 0 or position(a3 in def) = 0 or position(a4 in def) = 0 then
    raise exception 'qualidade_dados: trechos dos alertas médios não encontrados; revisar a migration';
  end if;
  execute replace(replace(replace(replace(def, a1, n1), a2, n2), a3, n3), a4, n4);
end
$migra$;
