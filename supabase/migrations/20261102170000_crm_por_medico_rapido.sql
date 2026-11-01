-- CRM por médico, rápido e fechado também na leitura direta.
--
-- (1) Desempenho. A regra de tipo 'campo' (Kommo, campo "MÉDICO") abria o raw_payload de cada card e percorria
-- custom_fields_values várias vezes por consulta: Pacientes do período do HOMS, do Dr. Antônio Eduardo e da
-- Dra. Ana Claudia passou de 8 s (limite do papel authenticated) com as regras ligadas. Agora cada card guarda as
-- chaves que a regra compara (crm_leads.filtro_chaves, mantida por gatilho), e a regra vira comparação de arrays:
--   'campo:<field_id>=<enum_id>', 'campo:<field_id>=<texto em minúsculas>', 'tag:<etiqueta em minúsculas>',
--   'resp:<responsible_user_id>'; o funil ('pipe:<pipeline_id>') entra na hora, a partir da coluna pipeline_id.
-- A semântica é a mesma de crm_filtro_casa_card (20261102160000): mesmas comparações, mesmas normalizações.
-- crm_leads_do_cliente, conversas_do_cliente e wts_sessoes_do_cliente passam a ler as regras do cliente uma vez por
-- consulta e a decidir cada linha por junção e comparação de arrays, sem chamar função por linha.
--
-- (2) Segurança. A regra valia só dentro das RPCs (definer). Na leitura direta pelo PostgREST:
--   crm_leads, conversas e mensagens já são só do admin (policies "admin reads crm leads", "conversas: so admin le
--   direto", "mensagens: so admin le direto"): nada muda nelas.
--   wts_sessions e pessoas eram "membro do cliente": o médico lia as sessões e as pessoas da clínica inteira.
--   As duas policies de leitura são trocadas por versões que aplicam a regra do cliente ao membro que não é admin.
--   Sem regra para o cliente, o membro continua lendo tudo do cliente, como antes. Admin e service_role sem mudança.
--   Pessoa: passa se tem algum card ou conversa que passa na regra; pessoa sem card e sem conversa fica visível
--   (veio de outra fonte, ex.: Instagram, que é do próprio cliente).
--
-- Não destrutiva: coluna nova (nula até o preenchimento), funções recriadas com a mesma assinatura, duas policies
-- trocadas (drop só dos nomes exatos substituídos, com a nova criada na mesma transação). O preenchimento é um
-- UPDATE só da coluna nova (nenhum outro gatilho de crm_leads dispara: eles olham outras colunas).
--
-- Reversão: recriar crm_filtro_casa_card, crm_lead_no_filtro, crm_conversa_no_filtro, crm_sessao_no_filtro,
-- crm_leads_do_cliente, conversas_do_cliente e wts_sessoes_do_cliente pela 20261102160000; recriar as policies "pessoas: admin ou membro le" e
-- "read own or admin reads all wts sessions" com (is_app_admin() or is_client_member(client_id)) e dropar as novas;
-- o gatilho e a coluna podem ficar (ou: drop trigger crm_leads_filtro_chaves; alter table crm_leads drop column filtro_chaves).

-- Chaves do card a partir do payload. Imutável: só depende do jsonb.
create or replace function public.crm_chaves_do_card(p_raw jsonb)
returns text[]
language sql immutable parallel safe
as $$
  select coalesce(array_agg(distinct k) filter (where k is not null), '{}'::text[])
    from (
      select 'resp:' || (p_raw->>'responsible_user_id') as k
      union all
      select 'campo:' || (cf->>'field_id') || '=' || (v->>'enum_id')
        from jsonb_array_elements(case when jsonb_typeof(p_raw->'custom_fields_values') = 'array' then p_raw->'custom_fields_values' else '[]'::jsonb end) cf,
             jsonb_array_elements(case when jsonb_typeof(cf->'values') = 'array' then cf->'values' else '[]'::jsonb end) v
      union all
      select 'campo:' || (cf->>'field_id') || '=' || lower(btrim(v->>'value'))
        from jsonb_array_elements(case when jsonb_typeof(p_raw->'custom_fields_values') = 'array' then p_raw->'custom_fields_values' else '[]'::jsonb end) cf,
             jsonb_array_elements(case when jsonb_typeof(cf->'values') = 'array' then cf->'values' else '[]'::jsonb end) v
      union all
      select 'tag:' || lower(btrim(t->>'name'))
        from jsonb_array_elements(case when jsonb_typeof(p_raw->'_embedded'->'tags') = 'array' then p_raw->'_embedded'->'tags' else '[]'::jsonb end) t
      union all
      select 'tag:' || lower(btrim(case when jsonb_typeof(t) = 'string' then t #>> '{}' else coalesce(t->>'label', t->>'name') end))
        from jsonb_array_elements(case when jsonb_typeof(p_raw->'etiquetas') = 'array' then p_raw->'etiquetas' else '[]'::jsonb end) t
    ) x
$$;

-- Chaves do card na hora da comparação: as guardadas (ou, se faltarem, calculadas do payload) mais o funil.
create or replace function public.crm_chaves_da_linha(p_pipeline text, p_chaves text[])
returns text[]
language sql immutable parallel safe
as $$
  select case when p_pipeline is null then coalesce(p_chaves, '{}'::text[]) else coalesce(p_chaves, '{}'::text[]) || ('pipe:' || p_pipeline) end
$$;

-- Chaves que uma regra procura (qualquer uma casando, a regra casa).
create or replace function public.crm_filtro_chaves_da_regra(p_tipo text, p_valor text)
returns text[]
language sql immutable parallel safe
as $$
  select case p_tipo
    when 'pipeline' then array['pipe:' || p_valor]
    when 'responsavel' then array['resp:' || p_valor]
    when 'tag' then array['tag:' || lower(btrim(p_valor))]
    when 'campo' then array[
      'campo:' || split_part(p_valor, '=', 1) || '=' || substr(p_valor, strpos(p_valor, '=') + 1),
      'campo:' || split_part(p_valor, '=', 1) || '=' || lower(btrim(substr(p_valor, strpos(p_valor, '=') + 1)))]
    else '{}'::text[]
  end
$$;

alter table public.crm_leads add column if not exists filtro_chaves text[];
comment on column public.crm_leads.filtro_chaves is
  'Chaves do card para a regra de separação por médico (crm_filtro_cliente): campo, etiqueta e responsável, tiradas do raw_payload pelo gatilho crm_leads_filtro_chaves. Nula = calcular do payload.';

-- Preenche os cards que já existem (só a coluna nova; idempotente). Em produção, em 01/11/2026: 74.359 linhas,
-- alguns segundos; a tabela fica travada para escrita enquanto a migração roda (o sync espera e segue).
update public.crm_leads set filtro_chaves = public.crm_chaves_do_card(raw_payload) where filtro_chaves is null;

create or replace function public.crm_leads_filtro_chaves_gatilho()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  new.filtro_chaves := public.crm_chaves_do_card(new.raw_payload);
  return new;
end
$$;
revoke all on function public.crm_leads_filtro_chaves_gatilho() from public, anon, authenticated;
drop trigger if exists crm_leads_filtro_chaves on public.crm_leads;
create trigger crm_leads_filtro_chaves before insert or update of raw_payload, filtro_chaves on public.crm_leads
  for each row execute function public.crm_leads_filtro_chaves_gatilho();

-- Mesma assinatura de antes (compõe com quem já chama), agora pela comparação de chaves.
create or replace function public.crm_filtro_casa_card(p_tipo text, p_valor text, p_pipeline text, p_raw jsonb)
returns boolean
language sql immutable
as $$
  select public.crm_filtro_chaves_da_regra(p_tipo, p_valor) && public.crm_chaves_da_linha(p_pipeline, public.crm_chaves_do_card(p_raw))
$$;

-- O card passa na regra do cliente? p_chaves = crm_chaves_da_linha(pipeline_id, filtro_chaves).
create or replace function public.crm_lead_no_filtro_chaves(p_client uuid, p_cx uuid, p_chaves text[])
returns boolean
language sql stable
as $$
  select (not exists (select 1 from public.crm_filtro_cliente f
                       where f.client_id = p_client and f.crm_connection_id = p_cx and f.modo = 'incluir'
                         and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))
          or exists (select 1 from public.crm_filtro_cliente f
                      where f.client_id = p_client and f.crm_connection_id = p_cx and f.modo = 'incluir'
                        and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo')
                        and public.crm_filtro_chaves_da_regra(f.tipo, f.valor) && p_chaves))
     and not exists (select 1 from public.crm_filtro_cliente f
                      where f.client_id = p_client and f.crm_connection_id = p_cx and f.modo = 'excluir'
                        and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo')
                        and public.crm_filtro_chaves_da_regra(f.tipo, f.valor) && p_chaves)
$$;

create or replace function public.crm_lead_no_filtro(p_client uuid, p_cx uuid, p_pipeline text, p_raw jsonb)
returns boolean
language sql stable
as $$
  select public.crm_lead_no_filtro_chaves(p_client, p_cx, public.crm_chaves_da_linha(p_pipeline, public.crm_chaves_do_card(p_raw)))
$$;

create or replace function public.crm_conversa_no_filtro(p_client uuid, p_lead uuid, p_externo text)
returns boolean
language sql stable
as $$
  select (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))
          or coalesce((select public.crm_lead_no_filtro_chaves(p_client, l.crm_connection_id,
                                public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))))
                         from public.crm_leads l where l.id = p_lead and l.client_id = p_client),
                      not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.modo = 'incluir'
                                     and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))))
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.tipo in ('departamento', 'equipe'))
          or coalesce((select public.crm_departamento_no_filtro(p_client, s.department_id)
                         from public.wts_sessions s where s.client_id = p_client and s.session_id = p_externo),
                      not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client and f.modo = 'incluir'
                                     and f.tipo in ('departamento', 'equipe'))))
$$;

create or replace function public.crm_sessao_no_filtro(p_client uuid, p_dep text, p_contato text)
returns boolean
language sql stable
as $$
  select public.crm_departamento_no_filtro(p_client, p_dep)
     and (not exists (select 1 from public.crm_filtro_cliente f join public.crm_connections k on k.id = f.crm_connection_id and k.provider = 'digisac'
                       where f.client_id = p_client and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))
          or coalesce((select public.crm_lead_no_filtro_chaves(p_client, l.crm_connection_id,
                                public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))))
                         from public.crm_connections k join public.crm_leads l on l.crm_connection_id = k.id and l.external_lead_id = p_contato
                        where k.client_id = p_client and k.provider = 'digisac' and l.client_id = p_client
                        order by l.removido_na_origem nulls first, l.occurred_at desc nulls last limit 1),
                      not exists (select 1 from public.crm_filtro_cliente f join public.crm_connections k on k.id = f.crm_connection_id and k.provider = 'digisac'
                                   where f.client_id = p_client and f.modo = 'incluir' and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo'))))
$$;

-- Leituras por cliente, em conjunto: as regras do cliente são lidas uma vez por consulta (agregadas) e cada linha só
-- compara arrays. Sem chamada de função por linha (funções com subconsulta não são embutidas pelo Postgres e custavam
-- ~0,5 ms por linha). Mesma regra das funções card a card acima (crm_lead_no_filtro, crm_conversa_no_filtro,
-- crm_sessao_no_filtro), que ficam para quem precisa decidir uma linha só.

-- Cards: conexão sem regra de card, todos os cards dela passam.
create or replace function public.crm_leads_do_cliente(p_client uuid)
returns setof public.crm_leads
language sql stable
as $$
  select l.* from public.crm_leads l
    left join (select f.crm_connection_id as cx,
                      bool_or(f.modo = 'incluir') as tem_incluir,
                      coalesce(array_agg(k) filter (where f.modo = 'incluir'), '{}'::text[]) as incluir,
                      coalesce(array_agg(k) filter (where f.modo = 'excluir'), '{}'::text[]) as excluir
                 from public.crm_filtro_cliente f
                 cross join lateral unnest(public.crm_filtro_chaves_da_regra(f.tipo, f.valor)) k
                where f.client_id = p_client and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo') and f.crm_connection_id is not null
                group by f.crm_connection_id) r on r.cx = l.crm_connection_id
   where l.client_id = p_client
     and (r.cx is null or ((not r.tem_incluir or public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))) && r.incluir) and not (public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))) && r.excluir)))
$$;

-- Conversas: seguem o card ligado (sem card: só fica com quem não usa 'incluir' de card) e o departamento da sessão
-- (sem sessão: só fica com quem não usa 'incluir' de departamento).
create or replace function public.conversas_do_cliente(p_client uuid)
returns setof public.conversas
language sql stable
as $$
  select c.* from public.conversas c
    cross join (select coalesce(bool_or(f.tipo in ('pipeline', 'responsavel', 'tag', 'campo')), false) as tem_card,
                       coalesce(bool_or(f.tipo in ('pipeline', 'responsavel', 'tag', 'campo') and f.modo = 'incluir'), false) as tem_card_incluir,
                       coalesce(bool_or(f.tipo in ('departamento', 'equipe')), false) as tem_dep,
                       coalesce(bool_or(f.tipo in ('departamento', 'equipe') and f.modo = 'incluir'), false) as tem_dep_incluir,
                       coalesce(array_agg(f.valor) filter (where f.tipo in ('departamento', 'equipe') and f.modo = 'incluir'), '{}'::text[]) as dep_incluir,
                       coalesce(array_agg(f.valor) filter (where f.tipo in ('departamento', 'equipe') and f.modo = 'excluir'), '{}'::text[]) as dep_excluir
                  from public.crm_filtro_cliente f where f.client_id = p_client) g
    left join public.crm_leads l on g.tem_card and l.id = c.lead_id and l.client_id = p_client
    left join (select f.crm_connection_id as cx,
                      bool_or(f.modo = 'incluir') as tem_incluir,
                      coalesce(array_agg(k) filter (where f.modo = 'incluir'), '{}'::text[]) as incluir,
                      coalesce(array_agg(k) filter (where f.modo = 'excluir'), '{}'::text[]) as excluir
                 from public.crm_filtro_cliente f
                 cross join lateral unnest(public.crm_filtro_chaves_da_regra(f.tipo, f.valor)) k
                where f.client_id = p_client and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo') and f.crm_connection_id is not null
                group by f.crm_connection_id) r on r.cx = l.crm_connection_id
    left join public.wts_sessions s on g.tem_dep and s.client_id = p_client and s.session_id = c.externo_id
   where c.client_id = p_client
     and (not g.tem_card
          or case when l.id is null then not g.tem_card_incluir
                  else (r.cx is null or ((not r.tem_incluir or public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))) && r.incluir) and not (public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))) && r.excluir))) end)
     and (not g.tem_dep
          or case when s.session_id is null then not g.tem_dep_incluir
                  else ((not g.tem_dep_incluir or coalesce(s.department_id = any(g.dep_incluir), false))
                        and not coalesce(s.department_id = any(g.dep_excluir), false)) end)
$$;

-- Sessões de atendimento: departamento e, no Digisac, o card mais recente do contato.
create or replace function public.wts_sessoes_do_cliente(p_client uuid)
returns setof public.wts_sessions
language sql stable
as $$
  select s.* from public.wts_sessions s
    cross join (select coalesce(bool_or(f.tipo in ('departamento', 'equipe')), false) as tem_dep,
                       coalesce(bool_or(f.tipo in ('departamento', 'equipe') and f.modo = 'incluir'), false) as tem_dep_incluir,
                       coalesce(array_agg(f.valor) filter (where f.tipo in ('departamento', 'equipe') and f.modo = 'incluir'), '{}'::text[]) as dep_incluir,
                       coalesce(array_agg(f.valor) filter (where f.tipo in ('departamento', 'equipe') and f.modo = 'excluir'), '{}'::text[]) as dep_excluir,
                       coalesce(bool_or(k.provider = 'digisac' and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo')), false) as tem_dig,
                       coalesce(bool_or(k.provider = 'digisac' and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo') and f.modo = 'incluir'), false) as tem_dig_incluir
                  from public.crm_filtro_cliente f left join public.crm_connections k on k.id = f.crm_connection_id
                 where f.client_id = p_client) g
    left join lateral (select l.id, l.crm_connection_id, l.pipeline_id, l.filtro_chaves, l.raw_payload
                         from public.crm_connections k
                         join public.crm_leads l on l.crm_connection_id = k.id and l.external_lead_id = s.contact_id
                        where g.tem_dig and k.client_id = p_client and k.provider = 'digisac' and l.client_id = p_client
                        order by l.removido_na_origem nulls first, l.occurred_at desc nulls last limit 1) l on true
    left join (select f.crm_connection_id as cx,
                      bool_or(f.modo = 'incluir') as tem_incluir,
                      coalesce(array_agg(k) filter (where f.modo = 'incluir'), '{}'::text[]) as incluir,
                      coalesce(array_agg(k) filter (where f.modo = 'excluir'), '{}'::text[]) as excluir
                 from public.crm_filtro_cliente f
                 cross join lateral unnest(public.crm_filtro_chaves_da_regra(f.tipo, f.valor)) k
                where f.client_id = p_client and f.tipo in ('pipeline', 'responsavel', 'tag', 'campo') and f.crm_connection_id is not null
                group by f.crm_connection_id) r on r.cx = l.crm_connection_id
   where s.client_id = p_client
     and ((not g.tem_dep_incluir or coalesce(s.department_id = any(g.dep_incluir), false))
                        and not coalesce(s.department_id = any(g.dep_excluir), false))
     and (not g.tem_dig
          or case when l.id is null then not g.tem_dig_incluir
                  else (r.cx is null or ((not r.tem_incluir or public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))) && r.incluir) and not (public.crm_chaves_da_linha(l.pipeline_id, coalesce(l.filtro_chaves, public.crm_chaves_do_card(l.raw_payload))) && r.excluir))) end)
$$;

-- Leitura direta (policies). Definer porque o membro não lê crm_leads, conversas nem crm_connections; as leituras
-- acima são embutidas aqui dentro (e rodam com o dono). Cada função confere antes que quem lê é membro do cliente,
-- então não revela nada de cliente alheio.
create or replace function public.crm_membro_ve_sessao(p_client uuid, p_sessao text)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.is_client_member(p_client)
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client)
          or exists (select 1 from public.wts_sessoes_do_cliente(p_client) x where x.session_id = p_sessao))
$$;

create or replace function public.crm_membro_ve_pessoa(p_client uuid, p_pessoa uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.is_client_member(p_client)
     and (not exists (select 1 from public.crm_filtro_cliente f where f.client_id = p_client)
          or exists (select 1 from public.crm_leads_do_cliente(p_client) l where l.pessoa_id = p_pessoa)
          or exists (select 1 from public.conversas_do_cliente(p_client) c where c.pessoa_id = p_pessoa)
          or (not exists (select 1 from public.crm_leads l where l.client_id = p_client and l.pessoa_id = p_pessoa)
              and not exists (select 1 from public.conversas c where c.client_id = p_client and c.pessoa_id = p_pessoa)))
$$;

do $g$
declare f text;
begin
  foreach f in array array[
    'public.crm_chaves_do_card(jsonb)', 'public.crm_chaves_da_linha(text,text[])', 'public.crm_filtro_chaves_da_regra(text,text)',
    'public.crm_filtro_casa_card(text,text,text,jsonb)', 'public.crm_lead_no_filtro_chaves(uuid,uuid,text[])',
    'public.crm_lead_no_filtro(uuid,uuid,text,jsonb)', 'public.crm_conversa_no_filtro(uuid,uuid,text)',
    'public.crm_sessao_no_filtro(uuid,text,text)', 'public.crm_leads_do_cliente(uuid)', 'public.conversas_do_cliente(uuid)',
    'public.wts_sessoes_do_cliente(uuid)', 'public.crm_membro_ve_sessao(uuid,text)', 'public.crm_membro_ve_pessoa(uuid,uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$g$;

-- Policies de leitura direta: troca das duas que eram "membro do cliente" (drop só dos nomes antigos exatos).
drop policy if exists "read own or admin reads all wts sessions" on public.wts_sessions;
drop policy if exists "pessoas: admin ou membro le" on public.pessoas;
do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wts_sessions' and policyname = 'wts_sessions: admin ou membro dentro da regra') then
    create policy "wts_sessions: admin ou membro dentro da regra" on public.wts_sessions for select to authenticated
      using (public.is_app_admin() or public.crm_membro_ve_sessao(client_id, session_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pessoas' and policyname = 'pessoas: admin ou membro dentro da regra') then
    create policy "pessoas: admin ou membro dentro da regra" on public.pessoas for select to authenticated
      using (public.is_app_admin() or public.crm_membro_ve_pessoa(client_id, id));
  end if;
end $pol$;
