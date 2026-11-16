-- NÃO é migração: rodar à mão, só o João, se for preciso desfazer 20261116100000_chamaram_por_pessoa.sql.
-- Volta as listas de um dia para 200 itens e o Chamaram do histórico para "pessoas do dia" (a soma dos dias repete
-- pessoas). Depois de reverter, refazer o histórico com 20261116-refazer-chamaram.sql.

begin;
do $rev$
declare
  d text := pg_get_functiondef('public.pacientes_periodo_calc(uuid,date,date)'::regprocedure);
begin
  execute replace(d, 'filter (where o.rn <= case when p_ate = p_de then 5000 else 200 end /* [chamaram-por-pessoa] */) as itens',
                     'filter (where o.rn <= 200) as itens');
end
$rev$;

create or replace function public.resultados_gravar_dia(p_dia date, p_fila boolean default true)
returns integer
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare adm uuid; c record; r jsonb; nums jsonb; ag jsonb; v_ag integer; v_neg integer; n integer := 0;
begin
  select user_id into adm from public.app_admins limit 1;
  if adm is null then raise exception 'sem admin cadastrado'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', adm::text, 'role', 'authenticated')::text, true);
  delete from public.resultados_diarios_pessoas where dia < p_dia - 60;
  for c in select id from public.clients loop
    begin
      r := public.pacientes_periodo(c.id, p_dia, p_dia);
      delete from public.resultado_pronto x
       where x.client_id = c.id and x.funcao = 'pacientes_periodo' and x.de = p_dia and x.ate = p_dia;
      nums := r -> 'numeros';
      ag := r -> 'listas' -> 'agendaram';
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
        v_ag, v_neg,
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
delete from public.resultados_diarios_pessoas where lista = 'mandaram';
commit;
