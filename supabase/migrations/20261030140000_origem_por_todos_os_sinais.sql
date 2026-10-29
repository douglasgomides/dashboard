-- Origem do lead lida de TODOS os sinais do CRM, não só do campo "Fonte do lead".
--
-- Auditoria de 29/10/2026: a Dra. Samira aparecia com 100% dos leads sem origem, e a Dra. Lana com 58%. Nos dois casos
-- o CRM já dizia de onde a pessoa veio, mas em outro lugar: etiqueta ("Origem-Instagram", "Indicação", "Site", "fb123…",
-- "lead forms…"), campo de rastreio (UTM_SOURCE), canal de entrada que identifica a origem, formulário de anúncio.
-- Cada sincronização tinha a sua regra parcial (Digisac lia "[Origem]", FlwChat algumas etiquetas, Kommo só o campo).
--
-- Agora há UMA regra, no banco, aplicada a todo CRM:
--   1. o campo de origem do CRM, quando preenchido, vale (origem_como = 'crm');
--   2. vazio: canal de entrada conclusivo (crm_canais_origem) -> 'canal';
--   3. vazio: campo de origem ou rastreio no payload (Origem/Fonte, UTM_SOURCE, fonte/origem da Clint, deal_source do RD)
--      -> 'utm' quando é UTM, senão 'campo';
--   4. vazio: etiqueta/tag que nomeia a origem (Kommo, FlwChat, Digisac) -> 'etiqueta';
--   5. vazio: lead de formulário de anúncio (campos ad_id/form_id/formulario_facebook) -> 'formulario'.
-- O resultado é gravado em crm_leads.source (todas as telas e funções já leem source) e o caminho em origem_como,
-- para a tela poder dizer "origem pela etiqueta". Nada é escrito no CRM do cliente.
-- Um gatilho refaz a leitura a cada sincronização, então a origem acompanha o CRM (etiqueta nova, campo preenchido).
--
-- Reversão: drop trigger crm_leads_origem on crm_leads; update crm_leads set source = null
--   where origem_como is not null and origem_como <> 'crm'; alter table crm_leads drop column origem_como;
--   drop function crm_leads_origem_gatilho(), crm_origem_inferida(text, jsonb), crm_origem_classifica(text);
--   e trocar de volta os trechos de qualidade_dados (bloco no fim).

alter table public.crm_leads add column if not exists origem_como text;
comment on column public.crm_leads.origem_como is
  'De onde veio a origem (source): crm = campo do CRM; canal, campo, utm, etiqueta, formulario = lida de outro sinal do CRM pelo Nexo; null = sem origem.';

-- Texto livre -> origem padronizada. null quando o texto não diz origem.
create or replace function public.crm_origem_classifica(p text)
returns text
language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when t is null or t = '' then null
    when t ~* '^tipo\s*[·:-]' then null                      -- "Tipo · Paciente" é tipo de contato, não origem
    when t ~* 'indica' then 'Indicação'
    when t ~* 'google' then 'Google'
    when t ~* 'tik ?tok' then 'TikTok'
    when t ~* 'youtube' then 'YouTube'
    when t ~* '(^fb[0-9]|lead ?forms?|formul[aá]rio|an[uú]ncio|tr[aá]fego|remarketing|meta ?ads|facebook|patrocinad)' then 'Anúncio'
    when t ~* '(instagram|^insta$|^ig$|^post\M|\mdirect\M)' then 'Instagram'
    when t ~* '(^site$|^site\M|landing|p[aá]gina de captura)' then 'Site'
    when t ~* '(paciente antig|pacientes? (da )?base|paciente ativ|^paciente d|j[aá] (é|e|sou) paciente|recorrente|reativad|renova[cç][aã]o)' then 'Paciente antigo'
    else null
  end
  from (select btrim(coalesce(p, '')) as t) x;
$$;

-- Origem lida do payload do CRM (sem o campo source e sem o canal). Devolve a origem e o caminho.
create or replace function public.crm_origem_inferida(p_provider text, p_raw jsonb, out origem text, out como text)
language plpgsql immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v text;
  k text;
  f jsonb;
  tags text[] := '{}';
begin
  if p_raw is null or jsonb_typeof(p_raw) <> 'object' then return; end if;

  -- Campos de origem e de rastreio.
  if p_provider = 'kommo' and jsonb_typeof(p_raw->'custom_fields_values') = 'array' then
    for f in select * from jsonb_array_elements(p_raw->'custom_fields_values') loop
      v := btrim(coalesce(f->'values'->0->>'value', ''));
      continue when v = '';
      if coalesce(f->>'field_code', '') = 'UTM_SOURCE' then
        origem := coalesce(public.crm_origem_classifica(v), left(v, 60)); como := 'utm'; return;
      elsif coalesce(f->>'field_name', '') ~* '^(origem|fonte|como (nos )?conheceu|canal de origem)' then
        origem := coalesce(public.crm_origem_classifica(v), left(v, 60)); como := 'campo'; return;
      end if;
    end loop;
  elsif p_provider = 'clint' and jsonb_typeof(p_raw->'fields') = 'object' then
    foreach k in array array['fonte', 'origem'] loop
      v := btrim(split_part(coalesce(p_raw->'fields'->>k, ''), '|', 1));
      if v <> '' then origem := coalesce(public.crm_origem_classifica(v), left(v, 60)); como := 'campo'; return; end if;
    end loop;
    foreach k in array array['utm_source', 'parameters_utm_source'] loop
      v := btrim(split_part(coalesce(p_raw->'fields'->>k, ''), '|', 1));
      if v <> '' then origem := coalesce(public.crm_origem_classifica(v), left(v, 60)); como := 'utm'; return; end if;
    end loop;
  elsif p_provider = 'rdstation' then
    v := btrim(coalesce(p_raw->'deal_source'->>'name', ''));
    if v <> '' then origem := coalesce(public.crm_origem_classifica(v), left(v, 60)); como := 'campo'; return; end if;
  end if;

  -- Etiquetas: Kommo (_embedded.tags[].name), FlwChat (contato_tags[]), Digisac (etiquetas[]).
  if jsonb_typeof(p_raw->'_embedded'->'tags') = 'array' then
    tags := tags || array(select coalesce(x->>'name', '') from jsonb_array_elements(p_raw->'_embedded'->'tags') x);
  end if;
  if jsonb_typeof(p_raw->'contato_tags') = 'array' then
    tags := tags || array(select x from jsonb_array_elements_text(p_raw->'contato_tags') x);
  end if;
  if jsonb_typeof(p_raw->'etiquetas') = 'array' then
    tags := tags || array(select case when jsonb_typeof(x) = 'object' then coalesce(x->>'name', '') else x #>> '{}' end
                          from jsonb_array_elements(p_raw->'etiquetas') x);
  end if;
  -- Etiqueta marcada como origem ("Unimed [Origem]", "Origem · Indicação", "Origem-Instagram") vem antes das outras.
  foreach v in array tags loop
    if v ~* 'origem' then
      origem := coalesce(
        public.crm_origem_classifica(v),
        nullif(btrim(regexp_replace(v, '\[?\s*origem\s*\]?\s*[·:\-]?\s*', '', 'gi')), '')
      );
      if origem is not null then como := 'etiqueta'; return; end if;
    end if;
  end loop;
  foreach v in array tags loop
    origem := public.crm_origem_classifica(v);
    if origem is not null then como := 'etiqueta'; return; end if;
  end loop;

  -- Lead de formulário de anúncio (Clint recebe do Meta com ad_id/form_id).
  if p_provider = 'clint' and jsonb_typeof(p_raw->'fields') = 'object'
     and (p_raw->'fields' ?| array['formulario_facebook', 'ad_id', 'form_id']) then
    origem := 'Anúncio'; como := 'formulario'; return;
  end if;
end;
$$;

create or replace function public.crm_leads_origem_gatilho()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
begin
  if nullif(btrim(new.source), '') is null then
    new.source := null;
    new.origem_como := null;
    if new.canal_id is not null then
      select co.origem into new.source from crm_canais_origem co
      where co.crm_connection_id = new.crm_connection_id and co.canal_id = new.canal_id and co.conclusivo;
      if new.source is not null then new.origem_como := 'canal'; end if;
    end if;
    if new.source is null then
      r := public.crm_origem_inferida(new.provider, new.raw_payload);
      new.source := r.origem;
      new.origem_como := case when r.origem is null then null else r.como end;
    end if;
  elsif tg_op = 'INSERT' or new.source is distinct from old.source then
    new.origem_como := 'crm';
  end if;
  return new;
end;
$$;

revoke all on function public.crm_leads_origem_gatilho() from public, anon, authenticated;
revoke all on function public.crm_origem_inferida(text, jsonb) from public, anon;
revoke all on function public.crm_origem_classifica(text) from public, anon;
grant execute on function public.crm_origem_inferida(text, jsonb) to authenticated, service_role;
grant execute on function public.crm_origem_classifica(text) to authenticated, service_role;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'crm_leads_origem' and tgrelid = 'public.crm_leads'::regclass) then
    create trigger crm_leads_origem before insert or update of source, raw_payload, canal_id on public.crm_leads
      for each row execute function public.crm_leads_origem_gatilho();
  end if;
end $$;

-- Base atual: quem tem o campo preenchido fica marcado 'crm'; quem não tem passa pelo gatilho (raw_payload no SET).
update public.crm_leads set origem_como = 'crm' where nullif(btrim(source), '') is not null and origem_como is null;
update public.crm_leads set raw_payload = raw_payload where nullif(btrim(source), '') is null;

-- qualidade_dados: "inferidos" passa a contar toda origem lida pelo Nexo (canal, etiqueta, campo, rastreio).
do $migra$
declare
  def text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  a1 text := 'count(*) filter (where nullif(btrim(l.source), '''') is null and co.canal_id is not null),';
  n1 text := 'count(*) filter (where l.origem_como is not null and l.origem_como <> ''crm''),';
  a2 text := 'mas o canal de entrada já mostra de onde vieram.';
  n2 text := 'mas o Nexo leu a origem em outro sinal do CRM (etiqueta, canal de entrada, campo de rastreio ou formulário).';
  a3 text := '%s de %s leads sem o campo de origem e sem canal de entrada que a identifique.';
  n3 text := '%s de %s leads sem origem: nem o campo, nem etiqueta, canal de entrada ou campo de rastreio dizem de onde vieram.';
  a4 text := 'Outros %s leads também não têm o campo preenchido,';
  n4 text := 'Outros %s leads não têm o campo preenchido,';
begin
  if position(n1 in def) > 0 then return; end if;
  if position(a1 in def) = 0 or position(a2 in def) = 0 or position(a3 in def) = 0 or position(a4 in def) = 0 then
    raise exception 'qualidade_dados: trecho do alerta sem origem não encontrado; revisar a migration';
  end if;
  execute replace(replace(replace(replace(def, a1, n1), a2, n2), a3, n3), a4, n4);
end
$migra$;
