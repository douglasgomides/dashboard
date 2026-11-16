-- [historico-regravado] O histórico diário (Carteira e Hoje) regrava os últimos 7 dias toda noite e guarda o erro de
-- cada clínica, em vez de engolir (debug numeros-nao-batem-fonte, 16/11/2026: M11 e CRM-1).
-- Aplicada só pelo João, no SQL editor, entre begin; e commit;, DEPOIS de 20261116100000_chamaram_por_pessoa.sql.
-- Agentes não rodam este arquivo. Reversão: supabase/operacoes/20261116-reverter-historico-regravado.sql.
--
-- O que muda:
--  1. resultados_gravar_dia: o `exception when others then null` vira uma linha em resultados_diarios_erros (dia,
--     clínica, mensagem e código do erro). Gravar o dia com sucesso apaga o erro daquele dia. O cron dizia "succeeded"
--     mesmo quando uma clínica falhava; agora a falha fica à vista (SELECT na tabela). O resto da função não muda.
--  2. Cron: além do dia de ontem às 03:30 (como hoje, com a fila de negociação medida), os 6 dias antes de ontem são
--     regravados toda noite, um por job, do mais antigo para o mais novo (03:00, 03:04, ..., 03:20 em Brasília), sem
--     mexer na fila (p_fila = false: a negociação de um dia passado é a que foi medida naquele dia). Card que chega
--     atrasado (até 7 dias), etiqueta posta depois das 03:30 e card removido depois entram no histórico sozinhos, sem
--     refazer à mão. A ordem crescente importa: Chamaram e Agendaram de um dia olham os 30 dias antes dele, então
--     regravar D obriga a regravar D+1..ontem depois, e é isso que os jobs seguintes fazem na mesma noite.
--     Um job por dia de propósito: o cron roda com limite de 120 s por comando (o aquecimento do resultado_pronto caiu
--     nele em 06-07/11) e um dia leva de 27 a 52 s para todas as clínicas; 7 dias num comando só passariam do limite.
--  3. Nada é apagado nem recalculado na hora: o primeiro efeito é na noite seguinte.
--
-- Velocidade (D-07): a função por clínica não muda; o custo novo é 6 execuções a mais por noite (~3 a 5 min de banco
-- entre 03:00 e 03:25, fora do horário de uso). Medir com supabase/audits/velocidade-conferencia.sql se quiser.

-- Guarda: só troca a versão lida em produção em 16/11 (md5 conferido); já trocada, não faz nada.
do $guarda$
declare
  d text := pg_get_functiondef('public.resultados_gravar_dia(date,boolean)'::regprocedure);
begin
  if position('[historico-regravado]' in d) = 0 and md5(d) <> '57e0cea04087219052b939c8e8a1e869' then
    raise exception 'resultados_gravar_dia não é a versão esperada (md5 %): nada foi mudado', md5(d);
  end if;
end
$guarda$;

create table if not exists public.resultados_diarios_erros (
  client_id uuid not null references public.clients(id) on delete cascade,
  dia date not null,
  erro text not null,
  codigo text,
  em timestamptz not null default now(),
  primary key (client_id, dia)
);
comment on table public.resultados_diarios_erros is
  'Dia do histórico diário que falhou para uma clínica (resultados_gravar_dia). Some quando o dia é gravado com sucesso.';
alter table public.resultados_diarios_erros enable row level security;
revoke all on table public.resultados_diarios_erros from public, anon, authenticated;
grant select on table public.resultados_diarios_erros to authenticated;
grant all on table public.resultados_diarios_erros to service_role;
drop policy if exists "resultados diarios erros: admin le" on public.resultados_diarios_erros;
create policy "resultados diarios erros: admin le" on public.resultados_diarios_erros for select to authenticated
  using (public.is_app_admin());

create or replace function public.resultados_gravar_dia(p_dia date, p_fila boolean default true)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare adm uuid; c record; r jsonb; nums jsonb; ag jsonb; mm jsonb; v_ag integer; v_mm integer; v_neg integer; n integer := 0;
begin
  -- [chamaram-por-pessoa] Chamaram e Agendaram contam cada pessoa uma vez em 30 dias.
  -- [historico-regravado] O erro de cada clínica fica em resultados_diarios_erros (antes: engolido em silêncio).
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
      mm := r -> 'listas' -> 'mandaram_mensagem';

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
        -- Lista cortada: não dá para saber quem já tinha contado. Não medido.
        if coalesce((ag ->> 'total')::integer, 0)
           > jsonb_array_length(case when jsonb_typeof(ag -> 'itens') = 'array' then ag -> 'itens' else '[]'::jsonb end) then
          v_ag := null;
        end if;
      end if;

      -- Chamaram: a mesma regra, lista 'mandaram'. Sem conversa ligada (valor nulo) continua nulo.
      delete from public.resultados_diarios_pessoas p where p.client_id = c.id and p.lista = 'mandaram' and p.dia = p_dia;
      v_mm := null;
      if jsonb_typeof(nums -> 'mandaram_mensagem' -> 'valor') = 'number' then
        insert into public.resultados_diarios_pessoas (client_id, dia, lista, pessoa_md5)
        select distinct c.id, p_dia, 'mandaram', i ->> 'pessoa'
          from jsonb_array_elements(case when jsonb_typeof(mm -> 'itens') = 'array' then mm -> 'itens' else '[]'::jsonb end) i
         where i ->> 'pessoa' is not null
           and not exists (select 1 from public.resultados_diarios_pessoas p
                            where p.client_id = c.id and p.lista = 'mandaram' and p.pessoa_md5 = i ->> 'pessoa'
                              and p.dia between p_dia - 30 and p_dia - 1)
        on conflict do nothing;
        get diagnostics v_mm = row_count;
        if coalesce((mm ->> 'total')::integer, 0)
           > jsonb_array_length(case when jsonb_typeof(mm -> 'itens') = 'array' then mm -> 'itens' else '[]'::jsonb end) then
          v_mm := null;
        end if;
      end if;
      v_neg := case when p_fila then nullif(nums -> 'negociacao' ->> 'valor', '')::numeric::integer end;

      insert into public.resultados_diarios as d (client_id, dia, mandaram_mensagem, leads_novos, antigos, agendaram, negociacao, compareceram, fecharam, fila_medida_em)
      values (c.id, p_dia,
        v_mm,
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
      -- [historico-regravado] Gravou: o erro antigo deste dia some.
      delete from public.resultados_diarios_erros e where e.client_id = c.id and e.dia = p_dia;
      n := n + 1;
    exception when others then
      -- [historico-regravado] Antes: `null` (a clínica ficava sem o dia, ou com o dia velho, e ninguém sabia). O bloco já
      -- desfez o que a clínica gravou neste dia; o erro fica registrado e o laço segue para a próxima clínica.
      insert into public.resultados_diarios_erros as e (client_id, dia, erro, codigo)
      values (c.id, p_dia, left(sqlerrm, 500), sqlstate)
      on conflict (client_id, dia) do update set erro = excluded.erro, codigo = excluded.codigo, em = now();
    end;
  end loop;
  return n;
end
$function$;
revoke all on function public.resultados_gravar_dia(date, boolean) from public, anon, authenticated;
grant execute on function public.resultados_gravar_dia(date, boolean) to service_role;

-- Cron: os 6 dias antes de ontem, do mais antigo para o mais novo, antes do job de ontem (06:30 UTC = 03:30 Brasília).
-- Só onde há pg_cron (produção); no banco de teste local o passo é pulado.
do $cron$
declare
  k int;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    for k in 2 .. 7 loop
      perform cron.unschedule(jobid) from cron.job where jobname = format('resultados-diarios-regravar-%s', k);
      -- k = 7 às 06:00 UTC, k = 6 às 06:04, ..., k = 2 às 06:20; o de ontem (k = 1) continua às 06:30.
      perform cron.schedule(format('resultados-diarios-regravar-%s', k), format('%s 6 * * *', (7 - k) * 4),
        format($q$select public.resultados_gravar_dia((now() at time zone 'America/Sao_Paulo')::date - %s, false)$q$, k));
    end loop;
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end
$cron$;
