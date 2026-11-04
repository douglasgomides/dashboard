-- Resultado pronto das contas gerais da lista de clientes (só admin): status_das_fontes (5 s) e sla_sem_resposta
-- (2,6 s) rodavam junto com ~40 contas por clínica e estouravam o limite de 8 s na primeira abertura (04/11/2026).
--  - status_das_fontes: resultado vale 15 min; recalculado em segundo plano a cada 10 min se foi aberto na última hora.
--  - sla_sem_resposta: vale 3 min (é a fila "sem resposta agora", precisa estar atual).
-- As duas só devolvem dado a admin (e, a de fontes, sem usuário: rotinas internas); a regra continua igual.
-- Reversão: dropar os wrappers, renomear *_calc de volta e devolver os grants.

create table if not exists public.resultado_pronto_geral (
  funcao text not null,
  param text not null default '',
  resultado jsonb,
  calculado_em timestamptz not null default now(),
  usado_em timestamptz not null default now(),
  primary key (funcao, param)
);
alter table public.resultado_pronto_geral enable row level security;
revoke all on table public.resultado_pronto_geral from public, anon, authenticated;
grant select, insert, update, delete on table public.resultado_pronto_geral to service_role;

create or replace function public.resultado_pronto_geral_guardar(p_funcao text, p_param text, p_resultado jsonb)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
begin
  insert into resultado_pronto_geral (funcao, param, resultado, calculado_em, usado_em)
  values (p_funcao, coalesce(p_param, ''), p_resultado, now(), now())
  on conflict (funcao, param) do update set resultado = excluded.resultado, calculado_em = excluded.calculado_em, usado_em = excluded.usado_em;
exception when read_only_sql_transaction then null;
end
$$;

create or replace function public.resultado_pronto_geral_ler(p_funcao text, p_param text, p_validade interval)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare r jsonb;
begin
  select x.resultado into r from resultado_pronto_geral x
   where x.funcao = p_funcao and x.param = coalesce(p_param, '') and x.calculado_em >= now() - p_validade;
  if r is not null then
    begin
      update resultado_pronto_geral x set usado_em = now()
       where x.funcao = p_funcao and x.param = coalesce(p_param, '') and x.usado_em < now() - interval '1 minute';
    exception when read_only_sql_transaction then null;
    end;
  end if;
  return r;
end
$$;
revoke all on function public.resultado_pronto_geral_guardar(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.resultado_pronto_geral_ler(text, text, interval) from public, anon, authenticated;
grant execute on function public.resultado_pronto_geral_guardar(text, text, jsonb) to service_role;
grant execute on function public.resultado_pronto_geral_ler(text, text, interval) to service_role;

alter function public.status_das_fontes() rename to status_das_fontes_calc;
alter function public.sla_sem_resposta(integer) rename to sla_sem_resposta_calc;
revoke all on function public.status_das_fontes_calc() from public, anon, authenticated;
revoke all on function public.sla_sem_resposta_calc(integer) from public, anon, authenticated;
grant execute on function public.status_das_fontes_calc() to service_role;
grant execute on function public.sla_sem_resposta_calc(integer) to service_role;

create or replace function public.status_das_fontes()
returns table(client_id uuid, fonte text, cadastro boolean, data_ate date, last_attempt_at timestamptz,
              last_success_at timestamptz, last_error text, motivo text, motivo_dono text, nao_usa boolean)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare r jsonb;
begin
  if not (public.is_app_admin() or auth.uid() is null) then return; end if;
  r := public.resultado_pronto_geral_ler('status_das_fontes', '', interval '15 minutes');
  if r is null then
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into r from public.status_das_fontes_calc() s;
    perform public.resultado_pronto_geral_guardar('status_das_fontes', '', r);
  end if;
  return query select * from jsonb_to_recordset(r) as t(client_id uuid, fonte text, cadastro boolean, data_ate date,
    last_attempt_at timestamptz, last_success_at timestamptz, last_error text, motivo text, motivo_dono text, nao_usa boolean);
end
$$;

create or replace function public.sla_sem_resposta(p_minutos integer)
returns table(client_id uuid, cliente text, conversa_id uuid, pessoa text, canal text, provider text,
              desde timestamptz, espera_min integer, em_horario boolean)
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare r jsonb;
begin
  if not public.is_app_admin() then return; end if;
  r := public.resultado_pronto_geral_ler('sla_sem_resposta', coalesce(p_minutos, 0)::text, interval '3 minutes');
  if r is null then
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into r from public.sla_sem_resposta_calc(p_minutos) s;
    perform public.resultado_pronto_geral_guardar('sla_sem_resposta', coalesce(p_minutos, 0)::text, r);
  end if;
  return query select * from jsonb_to_recordset(r) as t(client_id uuid, cliente text, conversa_id uuid, pessoa text,
    canal text, provider text, desde timestamptz, espera_min integer, em_horario boolean);
end
$$;

revoke all on function public.status_das_fontes() from public, anon;
revoke all on function public.sla_sem_resposta(integer) from public, anon;
grant execute on function public.status_das_fontes() to authenticated, service_role;
grant execute on function public.sla_sem_resposta(integer) to authenticated, service_role;

-- O recálculo em segundo plano passa a incluir a saúde das fontes (aberta na última hora e com mais de 10 min).
create or replace function public.resultado_pronto_aquecer()
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare x record; r jsonb; n int := 0; t0 timestamptz := clock_timestamp();
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select user_id from app_admins order by user_id limit 1), 'role', 'authenticated')::text, true);
  delete from resultado_pronto where usado_em < now() - interval '3 days';
  if exists (select 1 from resultado_pronto_geral g where g.funcao = 'status_das_fontes'
              and g.usado_em >= now() - interval '1 hour' and g.calculado_em < now() - interval '10 minutes') then
    begin
      select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into r from public.status_das_fontes_calc() s;
      update resultado_pronto_geral set resultado = r, calculado_em = now() where funcao = 'status_das_fontes' and param = '';
      n := n + 1;
    exception when others then
      raise warning 'resultado_pronto_aquecer status_das_fontes: %', sqlerrm;
    end;
  end if;
  for x in
    select client_id, funcao, de, ate from resultado_pronto
     where usado_em >= now() - interval '24 hours' and calculado_em < now() - interval '10 minutes'
     order by calculado_em
  loop
    exit when clock_timestamp() - t0 > interval '4 minutes';
    begin
      r := case x.funcao
        when 'pacientes_periodo' then public.pacientes_periodo_calc(x.client_id, x.de, x.ate)
        when 'qualidade_dados' then public.qualidade_dados_calc(x.client_id)
        when 'roi_periodo' then public.roi_periodo_calc(x.client_id, x.de, x.ate)
      end;
      update resultado_pronto set resultado = r, calculado_em = now()
       where client_id = x.client_id and funcao = x.funcao and de = x.de and ate = x.ate;
      n := n + 1;
    exception when others then
      raise warning 'resultado_pronto_aquecer % %: %', x.funcao, x.client_id, sqlerrm;
    end;
  end loop;
  return n;
end
$$;
revoke all on function public.resultado_pronto_aquecer() from public, anon, authenticated;
grant execute on function public.resultado_pronto_aquecer() to service_role;
