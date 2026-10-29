-- Origem pelas tags do CONTATO da Clint, e regra de etiquetas ajustada ao que os CRMs usam de verdade.
--
-- Na Clint a origem muitas vezes fica nas tags do contato ("instagram_douglas", "site_doctor", "facebook_leads",
-- "forms_hi", "black_lp1_autoridade", "ig-social", "Social Selling"), que a API de negócios não traz. As tags passam a
-- ser lidas por api/_lib/clint-tags.ts (crm_contato_tags) e aplicadas nos leads por crm_aplicar_tags_contato.
-- A regra de etiquetas também passa a: ignorar as etiquetas do próprio Nexo ("Nexo | Origem não documentada"),
-- reconhecer "ig-", "site_", "_lp1_", "forms_", "Social Selling" e "PacienteAntigo" junto.
-- No fim, a base é relida pela regra nova (só quem não tem o campo de origem do CRM preenchido).
--
-- Reversão: drop function crm_aplicar_tags_contato(uuid); recriar crm_origem_classifica e crm_origem_inferida como
-- em 20261030140000 e reler a base (update crm_leads set raw_payload = raw_payload where origem_como is distinct from 'crm').

create or replace function public.crm_origem_classifica(p text)
returns text
language sql immutable
set search_path to 'public', 'pg_temp'
as $$
  select case
    when t is null or t = '' then null
    when t ~* '^tipo\s*[·:-]' then null                      -- "Tipo · Paciente" é tipo de contato, não origem
    when t ~* '^nexo\M' then null                            -- etiquetas que o próprio Nexo escreve no CRM
    when t ~* '(n[aã]o documentad|sem origem|origem desconhecid)' then null
    when t ~* 'indica' then 'Indicação'
    when t ~* 'google' then 'Google'
    when t ~* 'tik ?tok' then 'TikTok'
    when t ~* 'youtube' then 'YouTube'
    when t ~* '(^fb[0-9]|lead ?forms?|formul[aá]rio|an[uú]ncio|tr[aá]fego|remarketing|meta ?ads|facebook|patrocinad)' then 'Anúncio'
    when t ~* 'social ?sell' then 'Prospecção ativa'
    when t ~* '(instagram|^insta$|^ig$|^ig[\s_-]|_ig$|^post\M|\mdirect\M)' then 'Instagram'
    when t ~* '(^site$|^site[\s_-]|_site$|landing|p[aá]gina de captura|(^|_)lp[0-9]*(_|$))' then 'Site'
    when t ~* '^forms?([\s_-]|$)' then 'Formulário'
    when t ~* '(paciente ?antig|pacientes? (da )?base|paciente ativ|^paciente d|j[aá] (é|e|sou) paciente|recorrente|reativad|renova[cç][aã]o)' then 'Paciente antigo'
    else null
  end
  from (select btrim(coalesce(p, '')) as t) x;
$$;

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
    if v ~* 'origem' and v !~* '^nexo\M' and v !~* '(n[aã]o documentad|sem origem|desconhecid)' then
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

-- Junta as tags lidas do contato (crm_contato_tags) nos leads da Clint da conexão. O gatilho de origem relê a origem.
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
       and l.provider = 'clint'
       and t.crm_connection_id = p_connection_id
       and t.contato_id = l.raw_payload->'contact'->>'id'
       and t.tags <> '{}'
       and (l.raw_payload->'contato_tags') is distinct from to_jsonb(t.tags)
    returning 1
  )
  select count(*)::int from feito;
$$;
revoke all on function public.crm_aplicar_tags_contato(uuid) from public, anon, authenticated;
grant execute on function public.crm_aplicar_tags_contato(uuid) to service_role;
comment on table public.crm_contato_tags is 'Tags dos contatos (FlwChat/WTS e Clint) por conexão, lidas em partes pelo sync. Lista vazia = contato lido sem tag.';

-- Relê a base com a regra nova (quem tem o campo do CRM preenchido não muda).
update public.crm_leads set source = null where origem_como is distinct from 'crm';
