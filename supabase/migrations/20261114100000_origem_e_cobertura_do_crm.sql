-- [dados-do-crm] Origem que o CRM já manda e cobertura por clínica (fase 03.1.1.1.1.1, plano 07).
-- Aplicada só pelo João (D-03): colar o arquivo inteiro no SQL editor de produção entre "begin;" e "commit;".
-- Agentes não rodam este arquivo. Antes e depois: supabase/audits/dados-do-crm-conferencia.sql (só leitura).
-- Marca de tudo que muda aqui: "[dados-do-crm]". Rodar de novo não muda nada.
-- Não depende de scripts/banco/aplicar.sh nem de tabela de registro de migrações.
--
-- O que muda:
--  1. Tabela crm_canais_kommo: nome de cada canal de entrada do Kommo (source_id), gravado pelo sync (plano 02).
--  2. crm_definir_canal_origem: a equipe confirma a origem de um canal do Kommo ou de um funil da Clint
--     ('funil:<id>') na tela Configurar CRM > Guia. Vale para todas as conexões ativas da mesma conta (mesmo provider
--     e subdomínio) e refaz a origem só dos leads daquele canal ou funil que estão sem origem ou que já vinham do
--     canal/funil. Nada vira origem sem uma pessoa confirmar (D-02). "Genérico (não diz a origem)" fica guardado como
--     não conclusivo e não preenche nada.
--  3. Gatilho de origem (crm_leads_origem_gatilho), com o campo de origem vazio: canal confirmado -> leitura do
--     próprio lead (crm_origem_inferida) -> funil confirmado ('funil') -> mantém a origem achada pela mensagem, pela
--     etapa ou pelo anúncio da conversa. O resto do gatilho não muda.
--  4. crm_origem_inferida lê também: Kommo META_AD_ID com valor -> 'Anúncio' (utm); Clint id_do_anuncio ou
--     link_do_anuncio -> 'Anúncio' (formulario); FlwChat card_tags (etiquetas do card) junto com as do contato.
--     Os dois campos de anúncio só entram quando nenhuma regra antiga achou nada: tudo o que já tinha origem continua
--     com a mesma origem.
--  5. crm_aplicar_origem_externa: lead sem origem cuja conversa veio de anúncio (conversas_origem_anuncio) ->
--     'Anúncio' (origem_como 'anuncio'), depois da mensagem e da etapa (que continuam primeiro).
--  6. crm_canais_para_confirmar e crm_cobertura: leitura da tela da equipe (só admin), pelo recorte da clínica
--     (crm_leads_do_cliente). Nenhuma tela de médico chama essas funções.
--  7. pacientes_periodo_calc, um trecho só (adendo de 13/11): Fecharam "não se aplica" quando o CRM não marca venda
--     (antes, um 0 medido falso). Nunca apaga um número acima de 0.
--
-- Trava: as três funções trocadas inteiras (itens 3, 4 e 5) só são trocadas se o corpo atual (pg_proc.prosrc) for o
-- esperado (md5 abaixo, o mesmo das migrações 20261030150000 e 20261030205000). Se não for, a migração para e nada
-- muda (a transação inteira volta); a mensagem de erro traz o md5 encontrado. O trecho de pacientes_periodo_calc tem
-- de aparecer exatamente uma vez, senão também para.
--
-- Reversão:
--  - crm_leads_origem_gatilho e crm_aplicar_origem_externa: corpos de 20261030205000_origem_pela_mensagem_e_etapa.sql;
--    crm_origem_inferida: corpo de 20261030150000_origem_tags_contato_clint.sql.
--  - pacientes_periodo_calc: tirar o bloco marcado "[dados-do-crm]" (entre o Agendaram "não se aplica" e
--    "-- [tela-honesta] início").
--  - drop function public.crm_definir_canal_origem(uuid, text, text, text, boolean),
--    public.crm_canais_para_confirmar(uuid), public.crm_cobertura(uuid); drop table public.crm_canais_kommo.
--  - As linhas que a equipe confirmou em crm_canais_origem ficam (são confirmação de pessoa).

-- ---------------------------------------------------------------------------------------------------------------
-- 0) Trava: as três funções trocadas inteiras ainda são as que foram lidas.
-- ---------------------------------------------------------------------------------------------------------------
do $guarda$
declare
  r record;
  corpo text;
begin
  for r in select * from (values
      ('public.crm_leads_origem_gatilho()', 'da996b804fcfd108f6c532795058920e'),
      ('public.crm_origem_inferida(text,jsonb)', 'fae09308cd933f62a652aae20264a471'),
      ('public.crm_aplicar_origem_externa(uuid)', '5e7d1228f21ed80fea9d9dc61b782f8b')) v(fn, md5_esperado) loop
    select p.prosrc into corpo from pg_proc p where p.oid = r.fn::regprocedure;
    continue when position('[dados-do-crm]' in corpo) > 0;  -- já aplicada
    -- Produção guarda o corpo sem comentários nem linhas em branco (conferido em 13/11/2026: igual, tirando espaços).
    if md5(corpo) <> r.md5_esperado
       and not (r.fn = 'public.crm_origem_inferida(text,jsonb)' and md5(corpo) = 'abac46c8930b0ba14779ae73439b09e9') then
      raise exception '[dados-do-crm] % mudou desde a leitura (md5 do corpo %, esperado %). Nada foi alterado.',
        r.fn, md5(corpo), r.md5_esperado;
    end if;
  end loop;
end
$guarda$;

-- Troca guardada (mesmo formato de [contas-certas]): aplica as trocas só se cada trecho antigo existir uma vez;
-- já aplicada, não faz nada.
create or replace function pg_temp.dados_do_crm_trocar(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position('[dados-do-crm]' in d) > 0 then return; end if;
  for i in 1 .. array_length(p_trocas, 1) loop
    n := (length(d) - length(replace(d, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    if n <> 1 then
      raise exception '%: trecho % aparece % vezes (esperado 1): %', p_fn, i, n, left(p_trocas[i][1], 100);
    end if;
    d := replace(d, p_trocas[i][1], p_trocas[i][2]);
  end loop;
  if position('[dados-do-crm]' in d) = 0 then
    raise exception '%: a troca não deixou a marca [dados-do-crm]', p_fn;
  end if;
  execute d;
end
$f$;

-- ---------------------------------------------------------------------------------------------------------------
-- 1) Nomes dos canais do Kommo (o sync grava; a tela lê pela função da equipe).
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.crm_canais_kommo (
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  canal_id text not null,
  nome text not null,
  tipo text,
  lido_em timestamptz not null default now(),
  primary key (crm_connection_id, canal_id)
);
comment on table public.crm_canais_kommo is
  '[dados-do-crm] Nome de cada canal de entrada do Kommo (source_id), lido pelo sync em /api/v4/sources e no _embedded.source dos leads. Só o nome: a origem só muda quando a equipe confirma (crm_definir_canal_origem).';
alter table public.crm_canais_kommo enable row level security;
revoke all on table public.crm_canais_kommo from public, anon, authenticated;
grant select on table public.crm_canais_kommo to authenticated;
grant all on table public.crm_canais_kommo to service_role;
drop policy if exists crm_canais_kommo_leitura on public.crm_canais_kommo;
create policy crm_canais_kommo_leitura on public.crm_canais_kommo for select to authenticated using (public.is_app_admin());

-- ---------------------------------------------------------------------------------------------------------------
-- 4) crm_origem_inferida (antes do gatilho, que a usa). Mesma assinatura, IMMUTABLE, mesmo search_path.
--    Tudo igual a 20261030150000, mais: card_tags junto com contato_tags; no fim, só quando nada antes achou origem,
--    Kommo META_AD_ID com valor e Clint id_do_anuncio/link_do_anuncio.
-- ---------------------------------------------------------------------------------------------------------------
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
  -- [dados-do-crm] versão com card_tags, META_AD_ID e campos de anúncio da Clint.
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

  -- Etiquetas: Kommo (_embedded.tags[].name), FlwChat (contato_tags[] e, [dados-do-crm], card_tags[] do card),
  -- Digisac (etiquetas[]).
  if jsonb_typeof(p_raw->'_embedded'->'tags') = 'array' then
    tags := tags || array(select coalesce(x->>'name', '') from jsonb_array_elements(p_raw->'_embedded'->'tags') x);
  end if;
  if jsonb_typeof(p_raw->'contato_tags') = 'array' then
    tags := tags || array(select x from jsonb_array_elements_text(p_raw->'contato_tags') x);
  end if;
  if jsonb_typeof(p_raw->'card_tags') = 'array' then
    tags := tags || array(select case when jsonb_typeof(x) = 'object' then coalesce(x->>'name', '') else x #>> '{}' end
                          from jsonb_array_elements(p_raw->'card_tags') x);
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
  -- Lead de formulário de anúncio (Clint recebe do Meta com ad_id/form_id): vale antes das etiquetas genéricas
  -- (20261030240000_clint_formulario_antes_das_tags, que já está em produção).
  if p_provider = 'clint' and jsonb_typeof(p_raw->'fields') = 'object'
     and (p_raw->'fields' ?| array['formulario_facebook', 'ad_id', 'form_id']) then
    origem := 'Anúncio'; como := 'formulario'; return;
  end if;
  foreach v in array tags loop
    origem := public.crm_origem_classifica(v);
    if origem is not null then como := 'etiqueta'; return; end if;
  end loop;

  -- [dados-do-crm] Campos de anúncio que o CRM manda, só quando nada acima achou origem.
  -- Clint: campos de anúncio com nome em português.
  if p_provider = 'clint' and jsonb_typeof(p_raw->'fields') = 'object'
     and (nullif(btrim(coalesce(p_raw->'fields'->>'id_do_anuncio', '')), '') is not null
          or nullif(btrim(coalesce(p_raw->'fields'->>'link_do_anuncio', '')), '') is not null) then
    origem := 'Anúncio'; como := 'formulario'; return;
  end if;
  -- Kommo: rastreio do Meta (field_code META_AD_ID) com valor = o lead veio de anúncio do Meta.
  if p_provider = 'kommo' and jsonb_typeof(p_raw->'custom_fields_values') = 'array'
     and exists (select 1 from jsonb_array_elements(p_raw->'custom_fields_values') x
                  where x->>'field_code' = 'META_AD_ID' and btrim(coalesce(x->'values'->0->>'value', '')) <> '') then
    origem := 'Anúncio'; como := 'utm'; return;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3) Gatilho de origem: canal -> leitura do lead -> funil confirmado -> mantém mensagem/etapa/anúncio.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.crm_leads_origem_gatilho()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
begin
  -- [dados-do-crm] funil confirmado pela equipe ('funil:<pipeline_id>') e origem do anúncio da conversa.
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
    -- Funil confirmado pela equipe (Clint: o funil não é a origem; só vale o que uma pessoa confirmou).
    if new.source is null and new.pipeline_id is not null then
      select co.origem into new.source from crm_canais_origem co
      where co.crm_connection_id = new.crm_connection_id and co.canal_id = 'funil:' || new.pipeline_id and co.conclusivo;
      if new.source is not null then new.origem_como := 'funil'; end if;
    end if;
    -- Sem nada no CRM, a origem lida da mensagem, da etapa ou do anúncio da conversa (crm_aplicar_origem_externa)
    -- continua.
    if new.source is null and tg_op = 'UPDATE' and old.origem_como in ('mensagem', 'etapa', 'anuncio') then
      new.source := old.source;
      new.origem_como := old.origem_como;
    end if;
  elsif tg_op = 'INSERT' or new.source is distinct from old.source then
    -- crm_aplicar_origem_externa grava já com origem_como 'mensagem'/'etapa'/'anuncio': não vira "do CRM".
    if not (tg_op = 'UPDATE' and new.origem_como in ('mensagem', 'etapa', 'anuncio') and new.origem_como is distinct from old.origem_como) then
      new.origem_como := 'crm';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.crm_leads_origem_gatilho() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 5) crm_aplicar_origem_externa: mensagem, depois etapa, depois anúncio da conversa. Mesmas permissões.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.crm_aplicar_origem_externa(p_client_id uuid default null)
returns integer
language sql security definer
set search_path to 'public', 'pg_temp'
as $$
  -- [dados-do-crm] a conversa que veio de anúncio (conversas_origem_anuncio) vira 'Anúncio', depois das outras.
  with sem as (
    select l.id, l.client_id, l.pessoa_id, l.provider, l.crm_connection_id, l.pipeline_id, l.status_id,
           l.raw_payload->>'sessionId' as sessao
    from crm_leads l
    where l.source is null and l.removido_na_origem is null
      and (p_client_id is null or l.client_id = p_client_id)
  ),
  primeira as (
    select s.id,
      (select m.texto from conversas v join mensagens m on m.conversa_id = v.id and m.direcao = 'entrada'
        where v.lead_id = s.id
           or (s.pessoa_id is not null and v.pessoa_id = s.pessoa_id)
           or (s.provider = 'flwchat' and s.sessao is not null and v.externo_id = s.sessao)
        order by m.enviada_em limit 1) as texto,
      exists (select 1 from conversas v join conversas_origem_anuncio a on a.conversa_id = v.id
               where v.lead_id = s.id
                  or (s.pessoa_id is not null and v.pessoa_id = s.pessoa_id)
                  or (s.provider = 'flwchat' and s.sessao is not null and v.externo_id = s.sessao)) as anuncio
    from sem s
  ),
  achado as (
    select s.id,
      coalesce(
        public.crm_origem_da_mensagem(p.texto),
        case when st.status_name ~* 'paciente recorrente' then 'Paciente antigo' end,
        case when p.anuncio then 'Anúncio' end
      ) as origem,
      case when public.crm_origem_da_mensagem(p.texto) is not null then 'mensagem'
           when st.status_name ~* 'paciente recorrente' then 'etapa'
           else 'anuncio' end as como
    from sem s
    left join primeira p on p.id = s.id
    left join crm_pipeline_statuses st on st.crm_connection_id = s.crm_connection_id and st.pipeline_id = s.pipeline_id and st.status_id = s.status_id
  ),
  feito as (
    update crm_leads l set source = a.origem, origem_como = a.como
      from achado a where a.id = l.id and a.origem is not null and l.source is null
    returning 1
  )
  select count(*)::int from feito;
$$;
revoke all on function public.crm_aplicar_origem_externa(uuid) from public, anon, authenticated;
grant execute on function public.crm_aplicar_origem_externa(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 2) A equipe confirma a origem de um canal (Kommo) ou funil (Clint, 'funil:<id>'). Devolve quantos leads foram
--    reavaliados. p_origem null apaga a tradução.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.crm_definir_canal_origem(p_connection uuid, p_canal text, p_nome text, p_origem text,
                                                           p_conclusivo boolean default true)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
-- [dados-do-crm]
declare
  v_conns uuid[];
  v_canal text := nullif(btrim(coalesce(p_canal, '')), '');
  v_origem text := nullif(btrim(coalesce(p_origem, '')), '');
  v_generico constant text := 'Genérico (não diz a origem)';
  v_conclusivo boolean;
  v_nome text;
  n integer := 0;
begin
  if not public.is_app_admin() then
    raise exception 'só a equipe pode confirmar a origem de um canal' using errcode = '42501';
  end if;
  if v_canal is null then raise exception 'canal vazio' using errcode = '22023'; end if;
  if v_origem is not null and v_origem <> all (array['Indicação', 'Google', 'TikTok', 'YouTube', 'Anúncio',
       'Prospecção ativa', 'Instagram', 'Site', 'Formulário', 'Disparo para lista', 'Base importada', 'Paciente antigo',
       v_generico]) then
    raise exception 'origem fora da lista: %', v_origem using errcode = '22023';
  end if;

  -- Todas as conexões ativas da mesma conta (mesmo provider e subdomínio), e a própria conexão.
  select array_agg(c.id) into v_conns
    from crm_connections b join crm_connections c
      on c.id = b.id
      or (c.active and c.provider = b.provider
          and nullif(lower(btrim(c.subdomain)), '') = nullif(lower(btrim(b.subdomain)), ''))
   where b.id = p_connection;
  if v_conns is null then raise exception 'conexão não encontrada' using errcode = '22023'; end if;

  if v_origem is null then
    delete from crm_canais_origem where crm_connection_id = any (v_conns) and canal_id = v_canal;
  else
    v_conclusivo := v_origem <> v_generico and coalesce(p_conclusivo, true);
    v_nome := coalesce(nullif(btrim(coalesce(p_nome, '')), ''),
                       (select k.nome from crm_canais_kommo k where k.crm_connection_id = p_connection and k.canal_id = v_canal),
                       v_canal);
    insert into crm_canais_origem (crm_connection_id, canal_id, canal_nome, origem, conclusivo, observacao)
    select x, v_canal, v_nome, v_origem, v_conclusivo, 'Confirmado pela equipe na tela Configurar CRM'
      from unnest(v_conns) x
    on conflict (crm_connection_id, canal_id) do update
      set canal_nome = excluded.canal_nome, origem = excluded.origem, conclusivo = excluded.conclusivo,
          observacao = excluded.observacao;
  end if;

  -- Refaz a origem (o gatilho relê): só leads sem origem ou que já vinham do canal/funil. Origem do CRM, da mensagem,
  -- da etapa, do anúncio ou da leitura do lead não é tocada.
  if v_canal like 'funil:%' then
    update crm_leads l set source = null
     where l.crm_connection_id = any (v_conns) and l.pipeline_id = substr(v_canal, 7)
       and (nullif(btrim(l.source), '') is null or l.origem_como in ('canal', 'funil'));
  else
    update crm_leads l set source = null
     where l.crm_connection_id = any (v_conns) and l.canal_id = v_canal
       and (nullif(btrim(l.source), '') is null or l.origem_como in ('canal', 'funil'));
  end if;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.crm_definir_canal_origem(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.crm_definir_canal_origem(uuid, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 6a) Canais do Kommo e funis da Clint com leads de 90 dias sem origem (ou já traduzidos), para a equipe confirmar.
--     sugestao = crm_origem_classifica(nome): só sugestão, nunca vira origem sozinha.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.crm_canais_para_confirmar(p_client uuid)
returns table(crm_connection_id uuid, tipo text, canal_id text, nome text, leads_90d integer, sem_origem_90d integer,
              origem_atual text, conclusivo boolean, sugestao text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
-- [dados-do-crm]
begin
  if not public.is_app_admin() then
    raise exception 'só a equipe vê os canais' using errcode = '42501';
  end if;
  return query
  with l as (
    select x.crm_connection_id as cx, x.provider, x.canal_id, x.pipeline_id,
           nullif(btrim(x.source), '') is null as sem
      from public.crm_leads_do_cliente(p_client) x
      join crm_connections c on c.id = x.crm_connection_id and c.active
     where x.client_id = p_client and x.removido_na_origem is null
       and x.occurred_at >= now() - interval '90 days'
       and x.provider in ('kommo', 'clint')
  ),
  g as (
    select l.cx, 'canal'::text as tipo, l.canal_id as id, count(*)::int as leads, count(*) filter (where l.sem)::int as sem
      from l where l.provider = 'kommo' and l.canal_id is not null group by 1, 3
    union all
    select l.cx, 'funil', 'funil:' || l.pipeline_id, count(*)::int, count(*) filter (where l.sem)::int
      from l where l.provider = 'clint' and l.pipeline_id is not null group by 1, 3
  ),
  n as (
    select g.*, co.origem, co.conclusivo as concl,
           coalesce(case when g.tipo = 'canal'
                         then (select k.nome from crm_canais_kommo k where k.crm_connection_id = g.cx and k.canal_id = g.id)
                         else (select max(s.pipeline_name) from crm_pipeline_statuses s
                                where s.crm_connection_id = g.cx and 'funil:' || s.pipeline_id = g.id) end,
                    co.canal_nome) as nome
      from g left join crm_canais_origem co on co.crm_connection_id = g.cx and co.canal_id = g.id
     where g.sem > 0 or co.origem is not null
  )
  select n.cx, n.tipo, n.id, n.nome, n.leads, n.sem, n.origem, n.concl, public.crm_origem_classifica(n.nome)
    from n
   order by n.sem desc, n.leads desc, n.id;
end
$$;
revoke all on function public.crm_canais_para_confirmar(uuid) from public, anon;
grant execute on function public.crm_canais_para_confirmar(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 6b) Cobertura da clínica (só a equipe, uma chamada por abertura da tela). Contrato do plano 04:
--   { origem: { leads, com_origem, por_como: { <origem_como>: n }, sem_traducao, checkout },
--     valor: { ganhos, com_valor }, etapas: { com_card, com_papel },
--     compareceu: { estado: sem_etapa | sem_uso | medido, etapas, entradas_30d }, tem_crm }
--   origem: leads de 30 dias. sem_traducao: sem origem, num canal (Kommo) ou funil (Clint) que a equipe ainda não
--   respondeu. checkout: sem origem e criado por compra (campos de checkout da Clint), lacuna do cliente.
--   valor: ganhos de 90 dias pela mesma regra de Fecharam (perfil de etapas quando a conexão tem perfil).
--   etapas: etapas com card hoje; com papel = perfil, KPI, resultado confirmado ou nome de agendamento,
--   comparecimento ou venda. compareceu: etapas de comparecimento (perfil ou nome, a regra atual do banco) e entradas
--   nelas em 30 dias.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.crm_cobertura(p_client uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
-- [dados-do-crm]
declare
  v jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'só a equipe vê a cobertura' using errcode = '42501';
  end if;
  with
  conns as (select c.id, c.provider from crm_connections c where c.client_id = p_client and c.active),
  todos as materialized (
    select x.* from public.crm_leads_do_cliente(p_client) x
     where x.client_id = p_client and x.removido_na_origem is null and x.crm_connection_id in (select id from conns)
  ),
  l30 as (
    select t.*, nullif(btrim(t.source), '') is not null as tem,
           t.provider = 'clint' and jsonb_typeof(t.raw_payload->'fields') = 'object'
             and exists (select 1 from jsonb_object_keys(t.raw_payload->'fields') k
                          where k in ('checkout_app', 'product_id') or k like 'purchase\_%') as compra
      from todos t where t.occurred_at >= now() - interval '30 days'
  ),
  pe as materialized (select * from public.crm_perfil_etapas(p_client)),
  com_perfil as (select distinct pe.crm_connection_id as cx from pe),
  ganhos as (
    -- Sem perfil: card ganho, pela data da venda (fonte, evento "ganhou", senão a criação).
    select t.id, coalesce(t.price, 0) > 0 as com_valor
      from todos t
     where t.outcome = 'won' and t.crm_connection_id not in (select cx from com_perfil)
       and coalesce(public.crm_data_desfecho(t.provider, t.raw_payload, 'won'),
                    (select max(e.ocorreu_em) from crm_lead_eventos e
                      where e.crm_connection_id = t.crm_connection_id and e.external_lead_id = t.external_lead_id
                        and e.tipo = 'ganhou'),
                    t.occurred_at) >= now() - interval '90 days'
    union
    -- Com perfil: a venda pelo perfil (sem a cópia do robô), do recorte da clínica.
    select v.lead_id, coalesce(v.price, 0) > 0
      from public.crm_perfil_vendas(p_client) v
     where not v.copia and v.quando >= now() - interval '90 days'
       and v.lead_id in (select id from todos)
  ),
  etapas as (
    select s.crm_connection_id as cx, s.pipeline_id, s.status_id, s.status_name, x.papel,
           exists (select 1 from todos t where t.crm_connection_id = s.crm_connection_id and t.pipeline_id = s.pipeline_id
                     and t.status_id = s.status_id) as com_card,
           coalesce(public.crm_papel_conta(x.papel, 'compareceu'),
                    s.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)') as comparece
      from crm_pipeline_statuses s join conns c on c.id = s.crm_connection_id
      left join pe x on x.crm_connection_id = s.crm_connection_id and x.pipeline_id = s.pipeline_id and x.status_id = s.status_id
  ),
  comp as (select * from etapas where comparece),
  entradas as (
    select count(*)::int as n
      from crm_lead_eventos e
      join comp on comp.cx = e.crm_connection_id and comp.pipeline_id = e.pipeline_para and comp.status_id = e.status_para
     where e.client_id = p_client and e.tipo in ('entrou', 'mudou_etapa') and e.ocorreu_em >= now() - interval '30 days'
       and exists (select 1 from todos t where t.crm_connection_id = e.crm_connection_id and t.external_lead_id = e.external_lead_id)
  )
  select jsonb_build_object(
    'origem', jsonb_build_object(
      'leads', (select count(*) from l30),
      'com_origem', (select count(*) from l30 where tem),
      'por_como', coalesce((select jsonb_object_agg(como, n) from (
          select coalesce(l30.origem_como, 'crm') as como, count(*)::int as n from l30 where tem group by 1) y), '{}'::jsonb),
      'sem_traducao', (select count(*) from l30 where not tem and not compra and (
          (l30.provider = 'kommo' and l30.canal_id is not null
            and not exists (select 1 from crm_canais_origem co where co.crm_connection_id = l30.crm_connection_id and co.canal_id = l30.canal_id))
          or (l30.provider = 'clint' and l30.pipeline_id is not null
            and not exists (select 1 from crm_canais_origem co where co.crm_connection_id = l30.crm_connection_id
                              and co.canal_id = 'funil:' || l30.pipeline_id)))),
      'checkout', (select count(*) from l30 where not tem and compra)),
    'valor', jsonb_build_object(
      'ganhos', (select count(*) from ganhos),
      'com_valor', (select count(*) from ganhos where com_valor)),
    'etapas', jsonb_build_object(
      'com_card', (select count(*) from etapas where com_card),
      'com_papel', (select count(*) from etapas e where e.com_card and (
          coalesce(e.papel, '') <> ''
          or exists (select 1 from crm_etapa_kpi k where k.crm_connection_id = e.cx and k.pipeline_id = e.pipeline_id and k.status_id = e.status_id)
          or exists (select 1 from crm_etapa_resultado r where r.crm_connection_id = e.cx and r.pipeline_id = e.pipeline_id and r.status_id = e.status_id)
          or e.status_name ~* '(agendad|agendament)'
          or e.status_name ~* '(compareceu|atendid[oa]|consulta realizada|p[oó]s[- ]?consulta)'
          or e.status_name ~* '(venda|vendid|fechad|ganh|pago|contrat)'))),
    'compareceu', jsonb_build_object(
      'estado', case when not exists (select 1 from comp) then 'sem_etapa'
                     when (select n from entradas) = 0 then 'sem_uso' else 'medido' end,
      'etapas', (select count(*) from comp),
      'entradas_30d', (select n from entradas)),
    'tem_crm', exists (select 1 from conns))
  into v;
  return v;
end
$$;
revoke all on function public.crm_cobertura(uuid) from public, anon;
grant execute on function public.crm_cobertura(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 7) pacientes_periodo_calc (adendo de 13/11): Fecharam "não se aplica" quando o CRM não marca venda, logo depois do
--    Agendaram "não se aplica" de [contas-certas] e antes de [tela-honesta]. Só troca um 0 do CRM; nunca apaga um
--    número acima de 0, nem o número do checkout.
-- ---------------------------------------------------------------------------------------------------------------
select pg_temp.dados_do_crm_trocar('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure, array[
  array[$t$           'motivo_sem_dado', 'o CRM não tem etapa de agendamento', 'responsavel', null, 'nao_se_aplica', true));
  end if;
  -- [tela-honesta] início$t$,
        $t$           'motivo_sem_dado', 'o CRM não tem etapa de agendamento', 'responsavel', null, 'nao_se_aplica', true));
  end if;
  -- [dados-do-crm] Fecharam "não se aplica": o CRM ligado não marca venda. Nenhuma etapa de venda (papel do perfil,
  -- etapa marcada como ganho pela equipe ou nome de venda), nenhuma conversa do período lida como "fechou" e nenhum
  -- card da clínica ganho nos últimos 180 dias. Um 0 aqui seria falso. Só o 0 do CRM; o do checkout continua medido.
  if coalesce((v->>'tem_crm')::boolean, false)
     and (v #>> '{numeros,fecharam,fonte}') = 'crm'
     and jsonb_typeof(v #> '{numeros,fecharam,valor}') = 'number'
     and (v #>> '{numeros,fecharam,valor}')::numeric = 0
     and not exists (
       select 1 from crm_pipeline_statuses s
         join crm_connections c on c.id = s.crm_connection_id and c.active
         left join public.crm_perfil_etapas(p_client) x
           on x.crm_connection_id = s.crm_connection_id and x.pipeline_id = s.pipeline_id and x.status_id = s.status_id
        where c.client_id = p_client
          and (coalesce(public.crm_papel_conta(x.papel, 'ganho'), false)
               or exists (select 1 from crm_etapa_resultado er where er.crm_connection_id = s.crm_connection_id
                            and er.pipeline_id = s.pipeline_id and er.status_id = s.status_id and er.outcome = 'won')
               or s.status_name ~* '(venda|vendid|fechad|ganh|pago|contrat)'))
     and not exists (
       select 1 from public.conversas_do_cliente(p_client) cv join conversas_resumos r on r.conversa_id = cv.id
        where cv.client_id = p_client and cv.ultima_msg_em >= v_ini and coalesce(cv.iniciada_em, cv.ultima_msg_em) < v_fim
          and r.resumo->>'etapa' = 'fechou')
     and not exists (
       select 1 from crm_lead_eventos e
        where e.client_id = p_client and e.tipo = 'ganhou' and e.ocorreu_em >= v_fim - interval '180 days')
     and not exists (
       select 1 from public.crm_leads_do_cliente(p_client) cl
        where cl.client_id = p_client and cl.outcome = 'won' and cl.removido_na_origem is null
          and cl.occurred_at >= v_fim - interval '180 days') then
    v := jsonb_set(v, '{numeros,fecharam}', jsonb_build_object('valor', null, 'fonte', 'crm_e_conversa',
           'motivo_sem_dado', 'o CRM não marca venda', 'responsavel', 'comercial', 'nao_se_aplica', true));
  end if;
  -- [tela-honesta] início$t$]
]);

drop function pg_temp.dados_do_crm_trocar(regprocedure, text[]);
