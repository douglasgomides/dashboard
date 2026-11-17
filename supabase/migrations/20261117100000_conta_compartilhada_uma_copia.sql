-- [conta-uma-copia] Conta de CRM compartilhada lida de UMA cópia só (debug numeros-nao-batem-fonte, decisões do João de
-- 17/11/2026: os painéis da mesma conta mostram os mesmos números da conta, e nenhuma tela soma os painéis).
-- Aplicada só pelo João, no SQL editor, entre begin; e commit;, DEPOIS de 20261116170000_agendamento_registrado_por_clinica.sql.
-- Agentes não rodam este arquivo. Reversão: supabase/operacoes/20261117-reverter-conta-uma-copia.sql.
--
-- Por quê: quando a mesma conta do CRM (mesmo provedor e mesmo subdomínio) está ligada a mais de um cliente, cada conexão
-- grava a SUA cópia da conta inteira, cada uma na sua hora (sync, webhook, telefones, varredura de ausentes). As cópias
-- se desencontram: etapa e telefone lidos em horas diferentes, o evento de mudança de etapa datado na hora em que cada
-- cópia viu a mudança. Então dois painéis da mesma conta não davam o mesmo número, nem sem nenhuma divisão.
--
-- O que muda (regra geral, nada muda sem a chave; nenhuma clínica citada):
--  1. crm_connections.config->>'espelho_de' = '<id de outra conexão>': esta conexão é ESPELHO da outra (a cópia que vale).
--     Só vale quando as duas estão ativas, são do mesmo provedor e do mesmo subdomínio, e a cópia que vale não é espelho
--     de outra. Chave inválida = nada muda (a conexão segue gravando a própria cópia).
--  2. Todo card gravado na cópia que vale (insert ou update, por qualquer caminho) é copiado, na mesma transação, para cada
--     espelho, com o cliente e a conexão do espelho. O evento de etapa do espelho sai do mesmo gatilho de sempre
--     (crm_registrar_evento), na mesma transação: mesma hora, mesmo evento. O pessoa_id de cada cliente fica o do espelho.
--     Erro ao copiar não derruba a gravação da cópia que vale: fica em crm_eventos_falhas (operacao 'espelho').
--  3. Gravação direta num espelho (o sync, o webhook, os telefones e a varredura da própria conexão do espelho) é
--     ignorada: o card do espelho vem só da cópia. Apagar card continua como antes (não é copiado nem bloqueado).
--  4. crm_espelho_alinhar(<espelho>): acerta UMA vez o que já estava gravado (cards iguais aos da cópia que vale, card que
--     só o espelho tinha marcado como removido na origem, eventos do espelho trocados pela cópia dos eventos da que vale).
--     Roda pelo arquivo supabase/operacoes/20261117-alinhar-copias-e-refazer-historico.sql, depois da configuração.
--  5. qualidade_dados: a conta compartilhada com espelho deixa de aparecer como problema ("Este CRM está ligado a mais N
--     clientes ... separar"): ler a conta inteira em cada painel foi a decisão.
--  6. Leitura da IA da conversa (conversas_resumos), uma por conversa na conta: cada cópia grava a sua conversa (mesmo
--     provedor e externo_id) e a IA lia cada uma à parte, então o "pela conversa" de dois painéis podia discordar sobre a
--     mesma conversa (consultas-ciclo5.sql, Q3c). Agora, quando qualquer cópia grava a leitura, vale a mais nova (a que leu
--     até a mensagem mais recente, ate_msg_em; empate = a que acabou de gravar) e ela vai, na mesma transação, para a mesma
--     conversa nas outras cópias da conta (a que vale e os espelhos válidos). Leitura mais velha que a da conta não
--     sobrescreve: a cópia fica com a da conta. crm_espelho_alinhar acerta as leituras do passado do mesmo jeito.
--
-- Velocidade: o guarda roda em cada card gravado de qualquer clínica (uma busca pela chave primária em crm_connections);
-- a cópia roda uma vez por comando (lê as ~20 linhas de crm_connections; sem espelho configurado, para aí). Na cópia que
-- vale, cada comando grava os mesmos cards mais uma vez por espelho, num comando só (o que o sync de cada espelho já
-- fazia, e deixa de fazer). A leitura da IA: um gatilho por leitura gravada (dezenas por hora), que sai já, por
-- crm_connections, no cliente sem conta espelhada. Medido em pglite: scripts/test-conta-compartilhada.ts. Nenhuma função
-- de leitura muda (só qualidade_dados_calc, 1 condição).

-- 1. A cópia que vale para uma conexão espelho (null: a conexão não é espelho válido).
create or replace function public.crm_espelho_de(p_cx uuid)
returns uuid
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select k.id
    from public.crm_connections m
    join public.crm_connections k on k.id::text = m.config->>'espelho_de'
   where m.id = p_cx and m.active and m.config ? 'espelho_de'
     and k.id <> m.id and k.active and k.provider = m.provider
     and coalesce(k.subdomain, '') <> '' and k.subdomain = m.subdomain
     and not (k.config ? 'espelho_de')
$$;
revoke all on function public.crm_espelho_de(uuid) from public, anon, authenticated;
grant execute on function public.crm_espelho_de(uuid) to service_role;

-- 2. Grava no espelho a cópia de cards da conexão que vale (de uma vez, um comando por lote). Só escreve o card que mudou
--    (sem evento à toa). O pessoa_id fica o do espelho (as pessoas são por cliente).
create or replace function public.crm_espelho_gravar(p_cx uuid, p_client uuid, p_linhas public.crm_leads[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare n integer;
begin
  insert into public.crm_leads as x (crm_connection_id, client_id, provider, external_lead_id, event_type, status_id,
         old_status_id, pipeline_id, price, raw_payload, received_at, removido_na_origem, occurred_at, outcome, source,
         origem_como, canal_id, contact_name, contact_phone, contact_email)
  select p_cx, p_client, r.provider, r.external_lead_id, r.event_type, r.status_id, r.old_status_id, r.pipeline_id, r.price,
         r.raw_payload, r.received_at, r.removido_na_origem, r.occurred_at, r.outcome, r.source, r.origem_como, r.canal_id,
         r.contact_name, r.contact_phone, r.contact_email
    from unnest(p_linhas) r
  on conflict (crm_connection_id, external_lead_id) do update set
    provider = excluded.provider, event_type = excluded.event_type, status_id = excluded.status_id,
    old_status_id = excluded.old_status_id, pipeline_id = excluded.pipeline_id, price = excluded.price,
    raw_payload = excluded.raw_payload, received_at = excluded.received_at, removido_na_origem = excluded.removido_na_origem,
    occurred_at = excluded.occurred_at, outcome = excluded.outcome, source = excluded.source, origem_como = excluded.origem_como,
    canal_id = excluded.canal_id, contact_name = excluded.contact_name, contact_phone = excluded.contact_phone,
    contact_email = excluded.contact_email
  where (x.provider, x.event_type, x.status_id, x.old_status_id, x.pipeline_id, x.price, x.raw_payload, x.received_at,
         x.removido_na_origem, x.occurred_at, x.outcome, x.source, x.origem_como, x.canal_id, x.contact_name, x.contact_phone,
         x.contact_email)
        is distinct from
        (excluded.provider, excluded.event_type, excluded.status_id, excluded.old_status_id, excluded.pipeline_id,
         excluded.price, excluded.raw_payload, excluded.received_at, excluded.removido_na_origem, excluded.occurred_at,
         excluded.outcome, excluded.source, excluded.origem_como, excluded.canal_id, excluded.contact_name,
         excluded.contact_phone, excluded.contact_email);
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.crm_espelho_gravar(uuid, uuid, public.crm_leads[]) from public, anon, authenticated;
grant execute on function public.crm_espelho_gravar(uuid, uuid, public.crm_leads[]) to service_role;

-- 3. Guarda: gravação direta num espelho é ignorada (o nome começa com "a" para rodar antes dos outros gatilhos "before").
create or replace function public.crm_leads_espelho_guarda()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('nexo.copiando_espelho', true), '') = '1' then return new; end if;
  -- Conexão sem a chave (quase todas): sai já, pela chave primária, sem chamar outra função.
  if not exists (select 1 from public.crm_connections m where m.id = new.crm_connection_id and m.config ? 'espelho_de') then
    return new;
  end if;
  if public.crm_espelho_de(new.crm_connection_id) is not null then return null; end if;
  return new;
end
$$;
revoke all on function public.crm_leads_espelho_guarda() from public, anon, authenticated;
drop trigger if exists crm_leads_a_espelho_guarda on public.crm_leads;
create trigger crm_leads_a_espelho_guarda before insert or update on public.crm_leads
  for each row execute function public.crm_leads_espelho_guarda();

-- 4. Cópia: os cards que um comando gravou na conexão que vale vão para cada espelho, no mesmo comando (um gatilho por
--    comando, com a tabela de transição: insert e update têm um gatilho cada, como o Postgres exige).
create or replace function public.crm_leads_espelho_copia()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  m record;
  v_antes text;
  v_linhas public.crm_leads[];
begin
  for m in select x.id, x.client_id, public.crm_espelho_de(x.id) as k
             from public.crm_connections x where x.config ? 'espelho_de' loop
    continue when m.k is null;
    select array_agg(n) into v_linhas from novos n where n.crm_connection_id = m.k;
    continue when v_linhas is null;
    v_antes := current_setting('nexo.copiando_espelho', true);
    perform set_config('nexo.copiando_espelho', '1', true);
    begin
      perform public.crm_espelho_gravar(m.id, m.client_id, v_linhas);
    exception when others then
      insert into public.crm_eventos_falhas (client_id, crm_connection_id, external_lead_id, operacao, erro)
      values (m.client_id, m.id, cardinality(v_linhas) || ' cards', 'espelho', left(sqlerrm, 500));
    end;
    perform set_config('nexo.copiando_espelho', coalesce(v_antes, ''), true);
  end loop;
  return null;
end
$$;
revoke all on function public.crm_leads_espelho_copia() from public, anon, authenticated;
drop trigger if exists crm_leads_espelho_copia_ins on public.crm_leads;
create trigger crm_leads_espelho_copia_ins after insert on public.crm_leads
  referencing new table as novos for each statement execute function public.crm_leads_espelho_copia();
drop trigger if exists crm_leads_espelho_copia_upd on public.crm_leads;
create trigger crm_leads_espelho_copia_upd after update on public.crm_leads
  referencing new table as novos for each statement execute function public.crm_leads_espelho_copia();

-- 5. Acerto único do que já estava gravado num espelho. Devolve quantos cards e eventos copiou.
create or replace function public.crm_espelho_alinhar(p_cx uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  k uuid := public.crm_espelho_de(p_cx);
  v_client uuid;
  v_antes text;
  r public.crm_leads;
  lote public.crm_leads[] := '{}';
  n_cards int := 0;
  n_fora int;
  n_ev int;
  n_leit int;
begin
  if k is null then
    raise exception '[conta-uma-copia] a conexão não é espelho válido (config.espelho_de, mesma conta, as duas ativas)';
  end if;
  select c.client_id into v_client from public.crm_connections c where c.id = p_cx;
  v_antes := current_setting('nexo.copiando_espelho', true);
  perform set_config('nexo.copiando_espelho', '1', true);
  -- Em lotes de 500 cards (o raw_payload de uma conta inteira não cabe bem num array só).
  for r in select * from public.crm_leads l where l.crm_connection_id = k loop
    lote := lote || r;
    if cardinality(lote) >= 500 then
      n_cards := n_cards + public.crm_espelho_gravar(p_cx, v_client, lote);
      lote := '{}';
    end if;
  end loop;
  if cardinality(lote) > 0 then n_cards := n_cards + public.crm_espelho_gravar(p_cx, v_client, lote); end if;
  -- Card que só o espelho tem: a cópia que vale não o conhece (sumiu da conta ou nunca existiu nela).
  update public.crm_leads x set removido_na_origem = now()
   where x.crm_connection_id = p_cx and x.removido_na_origem is null
     and not exists (select 1 from public.crm_leads y where y.crm_connection_id = k and y.external_lead_id = x.external_lead_id);
  get diagnostics n_fora = row_count;
  -- Eventos: os do espelho (inclusive os que o acerto acima acabou de gerar) dão lugar à cópia dos da conexão que vale.
  delete from public.crm_lead_eventos where crm_connection_id = p_cx;
  insert into public.crm_lead_eventos (client_id, crm_connection_id, external_lead_id, tipo, pipeline_de, status_de,
                                       pipeline_para, status_para, ocorreu_em, registrado_em)
  select v_client, p_cx, e.external_lead_id, e.tipo, e.pipeline_de, e.status_de, e.pipeline_para, e.status_para,
         e.ocorreu_em, e.registrado_em
    from public.crm_lead_eventos e where e.crm_connection_id = k;
  get diagnostics n_ev = row_count;
  -- Leituras da IA: em cada conversa da conta, a mais nova (ate_msg_em) vale para todas as cópias (a que vale e os espelhos).
  with grupo as (
    select distinct g.client_id from public.crm_connections g
     where g.active and (g.id = k or public.crm_espelho_de(g.id) = k)
  ),
  convs as (
    select c.id, c.client_id, c.externo_id from public.conversas c
     where c.client_id in (select client_id from grupo)
       and c.provider = (select x.provider from public.crm_connections x where x.id = k)
  ),
  mais_nova as (
    select distinct on (c.externo_id) c.externo_id, lr.resumo, lr.modelo, lr.ate_msg_em, lr.gerado_em, lr.gerado_por
      from convs c join public.conversas_resumos lr on lr.conversa_id = c.id
     order by c.externo_id, lr.ate_msg_em desc nulls last, lr.gerado_em desc
  )
  insert into public.conversas_resumos as x (conversa_id, client_id, resumo, modelo, ate_msg_em, gerado_em, gerado_por)
  select c.id, c.client_id, m.resumo, m.modelo, m.ate_msg_em, m.gerado_em, m.gerado_por
    from convs c join mais_nova m on m.externo_id = c.externo_id
  on conflict (conversa_id) do update set resumo = excluded.resumo, modelo = excluded.modelo,
    ate_msg_em = excluded.ate_msg_em, gerado_em = excluded.gerado_em, gerado_por = excluded.gerado_por
  where (x.resumo, x.modelo, x.ate_msg_em, x.gerado_em, x.gerado_por)
        is distinct from (excluded.resumo, excluded.modelo, excluded.ate_msg_em, excluded.gerado_em, excluded.gerado_por);
  get diagnostics n_leit = row_count;
  perform set_config('nexo.copiando_espelho', coalesce(v_antes, ''), true);
  delete from public.resultado_pronto where client_id in (select g.client_id from public.crm_connections g
                                                          where g.id = k or public.crm_espelho_de(g.id) = k);
  return jsonb_build_object('cards_mudados', n_cards, 'so_no_espelho_marcados', n_fora, 'eventos', n_ev, 'leituras_ia', n_leit);
end
$$;
revoke all on function public.crm_espelho_alinhar(uuid) from public, anon, authenticated;
grant execute on function public.crm_espelho_alinhar(uuid) to service_role;

-- 6. Leitura da IA, uma por conversa na conta. As outras cópias da mesma conversa: mesmo provedor e externo_id, nos
--    clientes da conta (a conexão que vale e os espelhos válidos dela). Conta sem espelho: nenhuma.
create or replace function public.crm_conversa_copias(p_conversa uuid)
returns table (conversa_id uuid, client_id uuid)
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select distinct t.id, t.client_id
    from public.conversas c
    join public.crm_connections x on x.client_id = c.client_id and x.provider = c.provider and x.active
    cross join lateral (select coalesce(public.crm_espelho_de(x.id), x.id) as vale) v
    join public.crm_connections g on g.active and (g.id = v.vale or public.crm_espelho_de(g.id) = v.vale)
    join public.conversas t on t.client_id = g.client_id and t.provider = c.provider and t.externo_id = c.externo_id
   where c.id = p_conversa and t.id <> c.id
$$;
revoke all on function public.crm_conversa_copias(uuid) from public, anon, authenticated;
grant execute on function public.crm_conversa_copias(uuid) to service_role;

-- Antes de gravar a leitura de uma cópia: se a conta já tem leitura mais nova da conversa, a cópia fica com ela; senão,
-- esta vai para as outras cópias (na mesma transação). Erro ao copiar não derruba a gravação (crm_eventos_falhas).
create or replace function public.conversas_resumos_da_conta()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
  v_ids uuid[];
  v_clientes uuid[];
  v_antes text;
begin
  if coalesce(current_setting('nexo.copiando_espelho', true), '') = '1' then return new; end if;
  -- Quase todo cliente: nenhuma conexão dele está numa conta com espelho; sai já.
  if not exists (select 1 from public.crm_connections x
                  where x.client_id = new.client_id
                    and (x.config ? 'espelho_de'
                         or exists (select 1 from public.crm_connections m where m.config->>'espelho_de' = x.id::text))) then
    return new;
  end if;
  -- Upsert de uma leitura que já existe: a conta é acertada na passada do update (uma vez só).
  if tg_op = 'INSERT' and exists (select 1 from public.conversas_resumos e where e.conversa_id = new.conversa_id) then
    return new;
  end if;
  select array_agg(k.conversa_id), array_agg(k.client_id) into v_ids, v_clientes
    from public.crm_conversa_copias(new.conversa_id) k;
  if v_ids is null then return new; end if;
  select s.resumo, s.modelo, s.ate_msg_em, s.gerado_em, s.gerado_por into r
    from public.conversas_resumos s
   where s.conversa_id = any(v_ids)
   order by s.ate_msg_em desc nulls last, s.gerado_em desc
   limit 1;
  if found and r.ate_msg_em is not null and (new.ate_msg_em is null or r.ate_msg_em > new.ate_msg_em) then
    new.resumo := r.resumo; new.modelo := r.modelo; new.ate_msg_em := r.ate_msg_em;
    new.gerado_em := r.gerado_em; new.gerado_por := r.gerado_por;
    return new;
  end if;
  v_antes := current_setting('nexo.copiando_espelho', true);
  perform set_config('nexo.copiando_espelho', '1', true);
  begin
    insert into public.conversas_resumos as x (conversa_id, client_id, resumo, modelo, ate_msg_em, gerado_em, gerado_por)
    select u.id, u.cliente, new.resumo, new.modelo, new.ate_msg_em, new.gerado_em, new.gerado_por
      from unnest(v_ids, v_clientes) u(id, cliente)
    on conflict (conversa_id) do update set resumo = excluded.resumo, modelo = excluded.modelo,
      ate_msg_em = excluded.ate_msg_em, gerado_em = excluded.gerado_em, gerado_por = excluded.gerado_por
    where (x.resumo, x.modelo, x.ate_msg_em, x.gerado_em, x.gerado_por)
          is distinct from (excluded.resumo, excluded.modelo, excluded.ate_msg_em, excluded.gerado_em, excluded.gerado_por);
  exception when others then
    insert into public.crm_eventos_falhas (client_id, crm_connection_id, external_lead_id, operacao, erro)
    values (new.client_id, null, new.conversa_id::text, 'espelho_leitura', left(sqlerrm, 500));
  end;
  perform set_config('nexo.copiando_espelho', coalesce(v_antes, ''), true);
  return new;
end
$$;
revoke all on function public.conversas_resumos_da_conta() from public, anon, authenticated;
drop trigger if exists conversas_resumos_a_conta on public.conversas_resumos;
create trigger conversas_resumos_a_conta before insert or update on public.conversas_resumos
  for each row execute function public.conversas_resumos_da_conta();

-- 7. qualidade_dados_calc: conta compartilhada com espelho não é problema de dado (troca de trecho, como em 150000).
create or replace function pg_temp.uma_copia_trocar(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  if position('[conta-uma-copia]' in d) > 0 then return; end if;
  for i in 1 .. array_length(p_trocas, 1) loop
    n := (length(d) - length(replace(d, p_trocas[i][1], ''))) / length(p_trocas[i][1]);
    if n <> p_trocas[i][3]::int then
      raise exception '[conta-uma-copia] %: trecho % aparece % vezes (esperado %). Nada foi alterado: %',
        p_fn, i, n, p_trocas[i][3], left(p_trocas[i][1], 120);
    end if;
    d := replace(d, p_trocas[i][1], p_trocas[i][2]);
  end loop;
  if position('[conta-uma-copia]' in d) = 0 then
    raise exception '[conta-uma-copia] %: a troca não deixou a marca', p_fn;
  end if;
  execute d;
end
$f$;

-- [trocas:início] (o arquivo de reversão usa os mesmos pares, ao contrário)
select pg_temp.uma_copia_trocar('public.qualidade_dados_calc(uuid)'::regprocedure, array[
  array[$t$    where c.client_id = p_client_id and c.active and c.subdomain is not null and not public.crm_tem_filtro(p_client_id)$t$,
        $t$    where c.client_id = p_client_id and c.active and c.subdomain is not null and not public.crm_tem_filtro(p_client_id)
      -- [conta-uma-copia] conta lida de uma cópia só (config.espelho_de): ler a conta inteira em cada painel foi a decisão.
      and not (c.config ? 'espelho_de' or exists (select 1 from crm_connections e where e.config->>'espelho_de' = c.id::text))$t$, '1']
]);
-- [trocas:fim]

delete from public.resultado_pronto where funcao = 'qualidade_dados';
