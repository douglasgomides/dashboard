-- NÃO é migração: rodar à mão, só o João, se for preciso desfazer 20261116120000_historico_regravado_e_erros.sql.
-- Volta resultados_gravar_dia para a versão de antes (a de 20261116100000, que engole o erro de cada clínica), tira os
-- 6 jobs que regravam os dias antes de ontem e apaga a tabela de erros. O job de ontem (resultados-diarios) fica.

begin;
do $cron$
declare k int;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    for k in 2 .. 7 loop
      perform cron.unschedule(jobid) from cron.job where jobname = format('resultados-diarios-regravar-%s', k);
    end loop;
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end
$cron$;

CREATE OR REPLACE FUNCTION public.resultados_gravar_dia(p_dia date, p_fila boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

drop table if exists public.resultados_diarios_erros;
commit;
