-- Rótulos de origem corrigidos depois da primeira leitura em produção (29/10/2026):
--  - "{{placement}}" (69 leads da Dra. Lana): variável do link do anúncio que o Meta não preencheu. O lead veio de
--    anúncio; antes ficava com o texto da variável como origem.
--  - "meta_ads" (45 leads da Dra. Lana): não era agrupado como Anúncio.
--  - Clint: "resgate" (base reativada, Dra. Marcelly) vira Paciente antigo; "disparo_..." (Douglas) vira Disparo para
--    lista; "import_..." vira Base importada.
-- No fim, relê a base (só quem não tem o campo de origem do CRM preenchido).
-- Reversão: recriar crm_origem_classifica como em 20261030150000 e reler a base
--   (update crm_leads set source = null where origem_como is distinct from 'crm').

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
    when t ~* '\{\{' then 'Anúncio'                         -- variável do link do anúncio que o Meta não preencheu ({{placement}})
    when t ~* '(^fb[0-9]|lead ?forms?|formul[aá]rio|an[uú]ncio|tr[aá]fego|remarketing|meta[ _-]?ads|facebook|patrocinad)' then 'Anúncio'
    when t ~* 'social ?sell' then 'Prospecção ativa'
    when t ~* '(instagram|^insta$|^ig$|^ig[\s_-]|_ig$|^post\M|\mdirect\M)' then 'Instagram'
    when t ~* '(^site$|^site[\s_-]|_site$|landing|p[aá]gina de captura|(^|_)lp[0-9]*(_|$))' then 'Site'
    when t ~* '^forms?([\s_-]|$)' then 'Formulário'
    when t ~* 'disparo' then 'Disparo para lista'
    when t ~* '^import' then 'Base importada'
    when t ~* '(resgate|paciente ?antig|pacientes? (da )?base|paciente ativ|^paciente d|j[aá] (é|e|sou) paciente|recorrente|reativad|renova[cç][aã]o)' then 'Paciente antigo'
    else null
  end
  from (select btrim(coalesce(p, '')) as t) x;
$$;

update public.crm_leads set source = null where origem_como is distinct from 'crm';
