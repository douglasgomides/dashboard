-- [historico-diario] Histórico diário por entrada: Agendaram conta quem ENTROU no dia (uma vez por pessoa em 30 dias)
-- e Negociação é a fila medida só pelo cron da manhã seguinte.
--
-- Por quê (erro nosso, achado 2 da fase 03.1.1.1.1): resultados_diarios é pacientes_periodo de um dia só. Nesse
-- cálculo, Agendaram somava (a) o card que HOJE está numa etapa de agendamento e foi criado no dia, e (b) toda conversa
-- que atravessa o dia com a leitura de HOJE dizendo "agendou". A pessoa que agendou e continuou conversando
-- (confirmação, lembrete) voltava a contar em cada dia, e a maior parte do passado foi preenchida depois, com o
-- estado de hoje. A soma dos dias repetia as mesmas pessoas; a Negociação somava a fila aberta de cada dia.
--
-- O que muda:
--  1. Tabela resultados_diarios_pessoas: quem foi contado em Agendaram em cada dia (só o md5 da pessoa, o mesmo que já
--     sai nas listas; nunca nome). Guarda 60 dias. Sem acesso pelo site.
--  2. pacientes_periodo_calc, SÓ os dois ramos de Agendaram de um dia: o ramo "card que está hoje na etapa de
--     agendamento" passa a valer só para período de mais de um dia; o ramo da leitura das conversas, num dia só,
--     conta a conversa só no dia da última mensagem lida (conversas_resumos.ate_msg_em). Período de vários dias
--     (o cartão do período) não muda.
--  3. resultados_gravar_dia(p_dia, p_fila default true): Agendaram do dia = pessoas da lista do dia menos as já
--     contadas nos 30 dias anteriores (nulo quando a lista do dia veio cortada); Negociação só quando p_fila (o cron
--     da manhã seguinte); com p_fila = false, a fila já medida pelo cron naquele dia é mantida e a não medida fica
--     nula. A versão de um argumento é removida, e a chamada do cron (texto igual) passa a usar esta.
--  4. resultados_diarios.fila_medida_em: quando a fila foi medida pelo cron. As linhas que o cron gravou na manhã
--     seguinte ao dia ganham a data; as preenchidas depois ficam nulas (a fila delas era o estado de hoje).
--  5. resultados_preencher(p_de, p_ate): mesma assinatura e limite de 14 dias; grava cada dia em ordem com p_fila =
--     false. Use janelas de 7 dias.
--  6. No fim, apaga do resultado_pronto os resultados de um dia só de pacientes_periodo (calculados antes da troca).
--
-- Aplicada só pelo João (D-03), depois de 20261113100000_contas_certas_no_banco.sql. Agentes não rodam este arquivo.
-- Roda numa transação: se um trecho de pacientes_periodo_calc não aparecer exatamente uma vez, para e nada muda.
-- Rodar de novo não muda nada (marcador "[historico-diario]").
-- O preenchimento do passado e o reprocesso do Kommo NÃO estão aqui: roteiros de uma vez só em supabase/operacoes/.
--
-- Reversão:
--  - resultados_gravar_dia(date) e resultados_preencher: corpos de 20261106130000_resultados_diarios.sql
--    (drop function public.resultados_gravar_dia(date, boolean) antes de recriar a de um argumento).
--  - pacientes_periodo_calc: trocar de volta os dois trechos marcados "[historico-diario]" pelos textos originais
--    (20261031150000_pacientes_do_periodo.sql, ramos ag_crm e ag_ia).
--  - drop table public.resultados_diarios_pessoas; alter table public.resultados_diarios drop column fila_medida_em.

-- ------------------------------------------------------------ 1. quem foi contado em cada dia
create table if not exists public.resultados_diarios_pessoas (
  client_id uuid not null references public.clients(id) on delete cascade,
  dia date not null,
  lista text not null,
  pessoa_md5 text not null,
  primary key (client_id, lista, pessoa_md5, dia)
);
comment on table public.resultados_diarios_pessoas is
  '[historico-diario] Pessoas contadas em cada dia do histórico (md5 da pessoa, igual ao das listas de pacientes_periodo). Usada para contar cada pessoa uma vez em 30 dias. Guarda 60 dias. Só resultados_gravar_dia escreve.';
create index if not exists resultados_diarios_pessoas_dia on public.resultados_diarios_pessoas (client_id, lista, dia);
alter table public.resultados_diarios_pessoas enable row level security;
revoke all on table public.resultados_diarios_pessoas from public, anon, authenticated;
grant all on table public.resultados_diarios_pessoas to service_role;

-- ------------------------------------------------------------ 4. quando a fila foi medida
alter table public.resultados_diarios add column if not exists fila_medida_em timestamptz;
comment on column public.resultados_diarios.fila_medida_em is
  '[historico-diario] Quando a fila de Negociação foi medida pelo cron (manhã seguinte ao dia). Nulo = fila não medida.';
-- Gravada pelo cron: até o fim do dia seguinte (o cron grava às 03:30 em Brasília do dia seguinte). Rodar de novo não
-- muda nada: a linha que já tem a data fica fora, e a preenchida depois nunca entra.
update public.resultados_diarios
   set fila_medida_em = gravado_em
 where fila_medida_em is null and negociacao is not null
   and gravado_em < ((dia + 2)::timestamp at time zone 'America/Sao_Paulo');

-- ------------------------------------------------------------ 2. pacientes_periodo_calc: os dois ramos de um dia
do $migra$
declare
  d text := pg_get_functiondef('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure);
  trocas text[][] := array[
    -- Card que está hoje na etapa de agendamento: só no período de vários dias (num dia só vale o evento de entrada).
    array['     where x.quando is not null or (c.em_agendamento and c.d between p_de and p_ate)' || chr(10),
          '     where x.quando is not null or (p_ate > p_de and c.em_agendamento and c.d between p_de and p_ate)' || chr(10)],
    -- Leitura das conversas: num dia só, a conversa conta no dia da última mensagem lida.
    array[$t$  ag_ia as (select u, min(ultima_msg_em) as quando from ia where etapa = 'agendou' group by u),$t$,
          $t$  -- [historico-diario] num dia só, a leitura conta no dia da última mensagem lida (ate_msg_em), e não em todo dia
  -- que a conversa atravessa; o card que está hoje na etapa de agendamento só conta no período de vários dias.
  ag_ia as (select ia.u, min(ia.ultima_msg_em) as quando from ia
             where ia.etapa = 'agendou'
               and (p_ate > p_de or exists (select 1 from conversas_resumos rl where rl.conversa_id = ia.conversa_id
                                              and rl.ate_msg_em >= v_ini and rl.ate_msg_em < v_fim))
             group by ia.u),$t$]
  ];
  i int;
  n int;
begin
  if position('[historico-diario]' in d) > 0 then return; end if;
  for i in 1 .. array_length(trocas, 1) loop
    n := (length(d) - length(replace(d, trocas[i][1], ''))) / length(trocas[i][1]);
    if n <> 1 then
      raise exception 'pacientes_periodo_calc: trecho % aparece % vezes (esperado 1): %', i, n, left(trocas[i][1], 80);
    end if;
    d := replace(d, trocas[i][1], trocas[i][2]);
  end loop;
  execute d;
end
$migra$;

-- ------------------------------------------------------------ 3. resultados_gravar_dia(p_dia, p_fila)
-- A de um argumento sai: a chamada do cron (resultados_gravar_dia(<ontem>)) passa a usar esta, com p_fila = true.
drop function if exists public.resultados_gravar_dia(date);

-- Grava um dia para todas as clínicas. pacientes_periodo confere quem chama (admin ou membro); dentro desta função,
-- que só o service_role e o cron executam, a chamada vai com a identidade do primeiro admin (linha que já existia em
-- 20261106130000, mantida igual). Uma clínica com erro não derruba as outras. Devolve quantas clínicas foram gravadas.
-- Agendaram do dia: pessoas da lista do dia que não foram contadas nos 30 dias anteriores (resultados_diarios_pessoas);
-- nulo quando a lista do dia veio cortada (mais pessoas que itens). Negociação: só p_fila (o cron da manhã seguinte);
-- com p_fila = false, mantém a fila que o cron já mediu naquele dia, senão nula.
create or replace function public.resultados_gravar_dia(p_dia date, p_fila boolean default true)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare adm uuid; c record; r jsonb; nums jsonb; ag jsonb; v_ag integer; v_neg integer; n integer := 0;
begin
  select user_id into adm from public.app_admins limit 1;
  if adm is null then raise exception 'sem admin cadastrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  -- Guarda 60 dias antes do dia gravado (o preenchimento anda em ordem crescente e só olha 30 dias para trás).
  delete from public.resultados_diarios_pessoas where dia < p_dia - 60;
  for c in select id from public.clients loop
    begin
      r := public.pacientes_periodo(c.id, p_dia, p_dia);
      -- O resultado de um dia só não fica guardado: o aquecimento do resultado_pronto não precisa recalcular o histórico.
      delete from public.resultado_pronto x
       where x.client_id = c.id and x.funcao = 'pacientes_periodo' and x.de = p_dia and x.ate = p_dia;
      nums := r -> 'numeros';
      ag := r -> 'listas' -> 'agendaram';

      -- Regravar o dia refaz a lista dele; os dias seguintes são refeitos na ordem do preenchimento.
      delete from public.resultados_diarios_pessoas p where p.client_id = c.id and p.lista = 'agendaram' and p.dia = p_dia;
      v_ag := null;
      if jsonb_typeof(nums -> 'agendaram' -> 'valor') = 'number' then
        insert into public.resultados_diarios_pessoas (client_id, dia, lista, pessoa_md5)
        select distinct c.id, p_dia, 'agendaram', i ->> 'pessoa'
          from jsonb_array_elements(case when jsonb_typeof(ag -> 'itens') = 'array' then ag -> 'itens' else '[]'::jsonb end) i
         where i ->> 'pessoa' is not null
           and not exists (select 1 from public.resultados_diarios_pessoas p
                            where p.client_id = c.id and p.lista = 'agendaram' and p.pessoa_md5 = i ->> 'pessoa'
                              and p.dia between p_dia - 30 and p_dia - 1)
        on conflict do nothing;
        get diagnostics v_ag = row_count;
        -- Lista cortada (o cálculo devolve até 200 itens): não dá para saber quem já tinha contado. Não medido.
        if coalesce((ag ->> 'total')::integer, 0)
           > jsonb_array_length(case when jsonb_typeof(ag -> 'itens') = 'array' then ag -> 'itens' else '[]'::jsonb end) then
          v_ag := null;
        end if;
      end if;
      v_neg := case when p_fila then nullif(nums -> 'negociacao' ->> 'valor', '')::numeric::integer end;

      insert into public.resultados_diarios as d (client_id, dia, mandaram_mensagem, leads_novos, antigos, agendaram, negociacao, compareceram, fecharam, fila_medida_em)
      values (c.id, p_dia,
        nullif(nums -> 'mandaram_mensagem' ->> 'valor', '')::numeric::integer,
        nullif(nums -> 'leads_novos' ->> 'valor', '')::numeric::integer,
        nullif(nums -> 'antigos' ->> 'valor', '')::numeric::integer,
        v_ag,
        v_neg,
        nullif(nums -> 'compareceram' ->> 'valor', '')::numeric::integer,
        nullif(nums -> 'fecharam' ->> 'valor', '')::numeric::integer,
        case when p_fila then now() end)
      on conflict (client_id, dia) do update set
        mandaram_mensagem = excluded.mandaram_mensagem, leads_novos = excluded.leads_novos, antigos = excluded.antigos,
        agendaram = excluded.agendaram,
        negociacao = case when p_fila or d.fila_medida_em is null then excluded.negociacao else d.negociacao end,
        fila_medida_em = case when p_fila then excluded.fila_medida_em else d.fila_medida_em end,
        compareceram = excluded.compareceram, fecharam = excluded.fecharam, gravado_em = now();
      n := n + 1;
    exception when others then
      null;
    end;
  end loop;
  return n;
end
$$;
revoke all on function public.resultados_gravar_dia(date, boolean) from public, anon, authenticated;
grant execute on function public.resultados_gravar_dia(date, boolean) to service_role;

-- ------------------------------------------------------------ 5. resultados_preencher
-- Preenche o passado, um intervalo por vez, em ordem crescente, sem medir a fila (p_fila = false). Cada dia leva alguns
-- segundos por clínica: use janelas de 7 dias (de 3 se estourar o tempo). Roteiro: supabase/operacoes/.
create or replace function public.resultados_preencher(p_de date, p_ate date)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare d date; total integer := 0;
begin
  if p_ate - p_de > 14 then raise exception 'use janelas de no máximo 14 dias'; end if;
  for d in select generate_series(p_de, p_ate, interval '1 day')::date order by 1 loop
    total := total + public.resultados_gravar_dia(d, false);
  end loop;
  return total;
end
$$;
comment on function public.resultados_preencher(date, date) is
  '[historico-diario] Preenche o histórico em ordem crescente, sem medir a fila de Negociação. Janelas de 7 dias (limite 14).';
revoke all on function public.resultados_preencher(date, date) from public, anon, authenticated;
grant execute on function public.resultados_preencher(date, date) to service_role;

-- ------------------------------------------------------------ 6. resultados de um dia guardados antes da troca
delete from public.resultado_pronto where funcao = 'pacientes_periodo' and de = ate;
