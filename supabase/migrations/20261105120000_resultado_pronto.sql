-- Resultado pronto: as telas mais pesadas recalculavam tudo a cada abertura. A lista de clientes dispara
-- qualidade_dados e roi_periodo para cada clínica ao mesmo tempo (~40 contas de 0,5 a 2 s); a tela Pacientes da
-- Dra. Lana leva 3 a 4 s sozinha e passava do limite de 8 s quando rodava junto. Resultado: "Lendo as fontes..."
-- sem fim e erro 500 na primeira tentativa (04/11/2026).
--
-- Agora as três funções guardam o resultado em resultado_pronto por (clínica, função, período):
--  - Resultado com menos de 20 minutos volta na hora.
--  - Mais velho (ou ausente): calcula, guarda e devolve.
--  - Um agendamento (pg_cron, a cada 10 min) recalcula em segundo plano o que alguém abriu nas últimas 24 horas,
--    para a próxima abertura já encontrar o resultado pronto.
-- O resultado não depende de quem pede (admin ou membro): is_app_admin só libera o acesso, conferido antes de ler.
-- As versões que calculam continuam como *_calc, sem acesso direto pelo site.
-- Reversão: dropar os três wrappers, renomear *_calc de volta e devolver os grants; cron.unschedule('resultado-pronto').

create table if not exists public.resultado_pronto (
  client_id uuid not null references public.clients(id) on delete cascade,
  funcao text not null,
  de date not null default '1900-01-01',
  ate date not null default '1900-01-01',
  resultado jsonb,
  calculado_em timestamptz not null default now(),
  usado_em timestamptz not null default now(),
  primary key (client_id, funcao, de, ate)
);
comment on table public.resultado_pronto is
  'Resultado guardado de pacientes_periodo, qualidade_dados e roi_periodo (vale 20 min; recalculado em segundo plano). Só as funções escrevem.';
alter table public.resultado_pronto enable row level security;
revoke all on table public.resultado_pronto from public, anon, authenticated;
grant select, insert, update, delete on table public.resultado_pronto to service_role;

-- Grava sem falhar em transação só de leitura (a leitura continua valendo).
create or replace function public.resultado_pronto_guardar(p_client uuid, p_funcao text, p_de date, p_ate date, p_resultado jsonb)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
begin
  insert into resultado_pronto (client_id, funcao, de, ate, resultado, calculado_em, usado_em)
  values (p_client, p_funcao, coalesce(p_de, '1900-01-01'), coalesce(p_ate, '1900-01-01'), p_resultado, now(), now())
  on conflict (client_id, funcao, de, ate)
  do update set resultado = excluded.resultado, calculado_em = excluded.calculado_em, usado_em = excluded.usado_em;
exception when read_only_sql_transaction then null;
end
$$;

create or replace function public.resultado_pronto_ler(p_client uuid, p_funcao text, p_de date, p_ate date)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare r jsonb; v_em timestamptz;
begin
  select x.resultado, x.calculado_em into r, v_em from resultado_pronto x
   where x.client_id = p_client and x.funcao = p_funcao
     and x.de = coalesce(p_de, '1900-01-01') and x.ate = coalesce(p_ate, '1900-01-01');
  if not found or v_em < now() - interval '20 minutes' then return null; end if;
  begin
    update resultado_pronto x set usado_em = now()
     where x.client_id = p_client and x.funcao = p_funcao
       and x.de = coalesce(p_de, '1900-01-01') and x.ate = coalesce(p_ate, '1900-01-01')
       and x.usado_em < now() - interval '1 minute';
  exception when read_only_sql_transaction then null;
  end;
  return r;
end
$$;

revoke all on function public.resultado_pronto_guardar(uuid, text, date, date, jsonb) from public, anon, authenticated;
revoke all on function public.resultado_pronto_ler(uuid, text, date, date) from public, anon, authenticated;
grant execute on function public.resultado_pronto_guardar(uuid, text, date, date, jsonb) to service_role;
grant execute on function public.resultado_pronto_ler(uuid, text, date, date) to service_role;

-- ------------------------------------------------------------ as três funções
alter function public.pacientes_periodo(uuid, date, date) rename to pacientes_periodo_calc;
alter function public.qualidade_dados(uuid) rename to qualidade_dados_calc;
alter function public.roi_periodo(uuid, date, date) rename to roi_periodo_calc;
revoke all on function public.pacientes_periodo_calc(uuid, date, date) from public, anon, authenticated;
revoke all on function public.qualidade_dados_calc(uuid) from public, anon, authenticated;
revoke all on function public.roi_periodo_calc(uuid, date, date) from public, anon, authenticated;
grant execute on function public.pacientes_periodo_calc(uuid, date, date) to service_role;
grant execute on function public.qualidade_dados_calc(uuid) to service_role;
grant execute on function public.roi_periodo_calc(uuid, date, date) to service_role;

create or replace function public.pacientes_periodo(p_client uuid, p_de date, p_ate date)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare r jsonb;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client)) then
    raise exception 'sem acesso a esta clínica' using errcode = '42501';
  end if;
  r := public.resultado_pronto_ler(p_client, 'pacientes_periodo', p_de, p_ate);
  if r is not null then return r; end if;
  r := public.pacientes_periodo_calc(p_client, p_de, p_ate);
  perform public.resultado_pronto_guardar(p_client, 'pacientes_periodo', p_de, p_ate, r);
  return r;
end
$$;

create or replace function public.qualidade_dados(p_client_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare r jsonb;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client_id)) then return '[]'::jsonb; end if;
  r := public.resultado_pronto_ler(p_client_id, 'qualidade_dados', null, null);
  if r is not null then return r; end if;
  r := public.qualidade_dados_calc(p_client_id);
  perform public.resultado_pronto_guardar(p_client_id, 'qualidade_dados', null, null, r);
  return r;
end
$$;

create or replace function public.roi_periodo(p_client_id uuid, p_de date, p_ate date)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare r jsonb;
begin
  if not (public.is_app_admin() or public.is_client_member(p_client_id)) then return null; end if;
  r := public.resultado_pronto_ler(p_client_id, 'roi_periodo', p_de, p_ate);
  if r is not null then return r; end if;
  r := public.roi_periodo_calc(p_client_id, p_de, p_ate);
  perform public.resultado_pronto_guardar(p_client_id, 'roi_periodo', p_de, p_ate, r);
  return r;
end
$$;

revoke all on function public.pacientes_periodo(uuid, date, date) from public, anon;
revoke all on function public.qualidade_dados(uuid) from public, anon;
revoke all on function public.roi_periodo(uuid, date, date) from public, anon;
grant execute on function public.pacientes_periodo(uuid, date, date) to authenticated, service_role;
grant execute on function public.qualidade_dados(uuid) to authenticated, service_role;
grant execute on function public.roi_periodo(uuid, date, date) to authenticated, service_role;

-- ------------------------------------------------------------ recálculo em segundo plano
-- Recalcula o que alguém abriu nas últimas 24 h e tem mais de 10 min, do mais antigo para o mais novo, até 4 min
-- de trabalho por rodada. Roda como dono das funções; o acesso das *_calc é liberado com a identidade de um admin.
create or replace function public.resultado_pronto_aquecer()
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp
as $$
declare x record; r jsonb; n int := 0; t0 timestamptz := clock_timestamp();
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select user_id from app_admins order by user_id limit 1), 'role', 'authenticated')::text, true);
  delete from resultado_pronto where usado_em < now() - interval '3 days';
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

-- O agendamento só existe onde há pg_cron (produção). No teste local a extensão não existe e o passo é pulado.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'resultado-pronto';
    perform cron.schedule('resultado-pronto', '*/10 * * * *', 'select public.resultado_pronto_aquecer()');
  end if;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end
$cron$;

-- Mudou a configuração do CRM da clínica (perfil, marcação de etapa, resultado da etapa, papel do funil): o resultado
-- guardado dela sai na hora, para a mudança aparecer sem esperar os 20 minutos.
create or replace function public.resultado_pronto_invalidar()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  delete from resultado_pronto r
   using crm_connections c
   where c.id = coalesce(new.crm_connection_id, old.crm_connection_id) and r.client_id = c.client_id;
  return null;
end
$$;
revoke all on function public.resultado_pronto_invalidar() from public, anon, authenticated;

do $t$
declare tb text;
begin
  foreach tb in array array['crm_perfil_etapa', 'crm_etapa_kpi', 'crm_etapa_resultado', 'crm_funil_papel'] loop
    if to_regclass('public.' || tb) is not null then
      execute format('drop trigger if exists resultado_pronto_invalidar on public.%I', tb);
      execute format('create trigger resultado_pronto_invalidar after insert or update or delete on public.%I
                      for each row execute function public.resultado_pronto_invalidar()', tb);
    end if;
  end loop;
end
$t$;
