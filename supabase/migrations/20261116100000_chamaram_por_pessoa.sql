-- [chamaram-por-pessoa] Chamaram no histórico diário conta cada pessoa uma vez em 30 dias, como o Agendaram.
--
-- Por quê (erro nosso, auditoria de 16/11/2026): resultados_diarios.mandaram_mensagem guardava as pessoas que mandaram
-- mensagem NAQUELE dia. A Carteira e a tela Hoje somam os dias do período, então quem conversou em 5 dias diferentes
-- contava 5 vezes (numa clínica grande, a soma dos dias passava de 1,5 vez o número de pessoas diferentes).
--
-- O que muda:
--  1. pacientes_periodo_calc: num período de UM dia, as listas devolvem até 5000 itens (antes 200). Sem isso, dia com
--     mais de 200 pessoas (acontece nas clínicas grandes) não daria para saber quem já tinha contado. Período de vários dias não muda.
--  2. resultados_gravar_dia: Chamaram do dia = pessoas da lista do dia que não foram contadas nos 30 dias anteriores
--     (resultados_diarios_pessoas, lista 'mandaram'), igual ao Agendaram. Nulo quando a lista veio cortada.
--     O resto da função fica igual ao corpo de produção (md5 conferido abaixo).
--
-- Aplicada só pelo João. Agentes não rodam este arquivo. Roda numa transação: se o trecho de pacientes_periodo_calc não
-- aparecer exatamente uma vez, ou se resultados_gravar_dia não for a versão esperada, para e nada muda.
-- Rodar de novo não muda nada (marcador "[chamaram-por-pessoa]").
-- Depois de aplicar: refazer o histórico (supabase/operacoes/20261116-refazer-chamaram.sql).
--
-- Reversão: supabase/operacoes/20261116-reverter-chamaram.sql.

-- ------------------------------------------------------------ 1. listas maiores num dia só
do $migra$
declare
  d text := pg_get_functiondef('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure);
  de text := 'filter (where o.rn <= 200) as itens';
  para text := 'filter (where o.rn <= case when p_ate = p_de then 5000 else 200 end /* [chamaram-por-pessoa] */) as itens';
  n int;
begin
  if position('[chamaram-por-pessoa]' in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, de, ''))) / length(de);
  if n <> 1 then
    raise exception 'pacientes_periodo_calc: trecho das listas aparece % vezes (esperado 1)', n;
  end if;
  execute replace(d, de, para);
end
$migra$;

-- ------------------------------------------------------------ 2. resultados_gravar_dia com Chamaram por pessoa
do $guarda$
declare
  d text := pg_get_functiondef('public.resultados_gravar_dia(date,boolean)'::regprocedure);
begin
  if position('[chamaram-por-pessoa]' in d) = 0 and md5(d) <> 'e522c7bff907b15c699a76ede8e5e008' then
    raise exception 'resultados_gravar_dia não é a versão esperada (md5 %): nada foi mudado', md5(d);
  end if;
end
$guarda$;

create or replace function public.resultados_gravar_dia(p_dia date, p_fila boolean default true)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare adm uuid; c record; r jsonb; nums jsonb; ag jsonb; mm jsonb; v_ag integer; v_mm integer; v_neg integer; n integer := 0;
begin
  -- [chamaram-por-pessoa] Chamaram e Agendaram contam cada pessoa uma vez em 30 dias.
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
      n := n + 1;
    exception when others then
      null;
    end;
  end loop;
  return n;
end
$function$;

revoke all on function public.resultados_gravar_dia(date, boolean) from public, anon, authenticated;
grant execute on function public.resultados_gravar_dia(date, boolean) to service_role;
