-- Itens da verificação das APIs na doc oficial (01/11/2026, docs/apis/kommo.md).
--   Kommo: a venda passa a contar pela data em que o lead foi fechado. A doc do lead ("Get leads") traz closed_at, "The
--   time and date the lead was closed in the format of Unix Timestamp". O sync pela API grava o lead inteiro em
--   crm_leads.raw_payload, então o campo já está lá (conferido em produção: todo ganho e perda das contas Kommo tem
--   closed_at numérico, menos os leads importados por planilha, que ficam como estão). O webhook de etapa passa a gravar
--   closed_at também (api/integrations/kommo/webhook.ts).
--   crm_data_desfecho ganha o ramo "kommo" (mesma assinatura); pacientes_periodo deixa de limitar a data da fonte a Clint
--   e RD. crm_registrar_evento e crm_vendas_periodo já chamam crm_data_desfecho para qualquer provedor.
-- Não apaga nada. Os eventos "ganhou" antigos do Kommo são recalculados à parte, com supervisão (não é migração).
-- Reversão: recriar crm_data_desfecho como em 20261102120000 (sem o ramo kommo) e, em pacientes_periodo, voltar
--   "cl.provider in ('clint', 'rdstation', 'kommo')" para "cl.provider in ('clint', 'rdstation')".

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
  elsif p_provider = 'kommo' then
    -- Unix em segundos (número ou texto, conforme venha da API ou do webhook). 142/143 já dizem se ganhou ou perdeu.
    v := btrim(p_raw->>'closed_at');
    if v is null or v !~ '^\d{9,11}$' then return null; end if;
    t := to_timestamp(v::bigint);
    if t < timestamptz '2000-01-01 00:00:00+00' or t > now() + interval '1 day' then return null; end if;
    return t;
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

-- Pacientes do período ("Fecharam"): a data da fonte também vale para o Kommo.
do $migra$
declare
  def text := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  ancora text := 'and cl.provider in (''clint'', ''rdstation'')';
  novo text := 'and cl.provider in (''clint'', ''rdstation'', ''kommo'')';
begin
  if position(novo in def) > 0 then return; end if;
  if position(ancora in def) = 0 then raise exception 'pacientes_periodo: filtro de provedor de g_real não encontrado; revisar a migration'; end if;
  execute replace(def, ancora, novo);
end
$migra$;
