-- Conferência diária do Nexo contra o CRM ao vivo (api/_lib/conferencia-crm.ts, rota api/sync/clint?conferencia=1).
-- Uma linha por conexão e dia: quantos leads o Nexo tem, quantos o CRM tem, como foi contado e se passou do limite.
-- Só a equipe Doctor Creator lê; só o servidor grava. qualidade_dados ganha o alerta "crm-diverge-origem".
-- Reversão: drop table public.crm_conferencia; e tirar o bloco "crm-diverge-origem" de qualidade_dados
-- (trocar de volta o "novo" pelo "antigo" do bloco abaixo).

create table if not exists public.crm_conferencia (
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  dia date not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null,
  nexo integer not null,
  crm integer,
  metodo text not null check (metodo in ('total', 'so_abertos', 'contatos')),
  alerta boolean not null default false,
  aviso text,
  criado_em timestamptz not null default now(),
  primary key (crm_connection_id, dia)
);
create index if not exists crm_conferencia_cliente_idx on public.crm_conferencia (client_id, dia desc);
alter table public.crm_conferencia enable row level security;
revoke all on table public.crm_conferencia from public, anon, authenticated;
grant select on table public.crm_conferencia to authenticated;
grant select, insert, update, delete on table public.crm_conferencia to service_role;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'crm_conferencia' and policyname = 'crm_conferencia_admin') then
    create policy crm_conferencia_admin on public.crm_conferencia for select to authenticated using (public.is_app_admin());
  end if;
end $$;
comment on table public.crm_conferencia is 'Conferência diária: leads no Nexo x leads no CRM ao vivo, por conexão. metodo so_abertos/contatos não alerta.';

-- Alerta em qualidade_dados: a última conferência dos últimos 3 dias com divergência acima do limite.
do $migra$
declare
  def text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  antigo text := '  return out;
end;';
  novo text := '  -- Conferência diária contra o CRM ao vivo (crm_conferencia).
  for r in
    select k.nexo, k.crm, k.dia, k.provider from crm_conferencia k
    where k.client_id = p_client_id and k.alerta and k.dia >= hoje - 3
    order by k.dia desc limit 1
  loop
    out := out || jsonb_build_object(
      ''id'', ''crm-diverge-origem'', ''fonte'', ''crm'', ''severidade'', ''alta'',
      ''titulo'', format(''O Nexo tem %s leads deste CRM e o CRM tem %s'', r.nexo, r.crm),
      ''evidencia'', format(''Conferência de %s contra a API do CRM (contagem completa): diferença de %s leads.'', to_char(r.dia, ''DD/MM''), abs(r.nexo - r.crm)),
      ''causa'', case when r.nexo > r.crm then ''Leads apagados ou arquivados no CRM continuam contando no Nexo.''
                     else ''Leads que existem no CRM ainda não foram trazidos para o Nexo.'' end,
      ''correcao'', ''Equipe Doctor Creator: rodar a reconciliação do CRM deste cliente e conferir o resultado antes de ler os números.'',
      ''responsavel'', ''equipe_hub'',
      ''afeta'', ''Todos os números do CRM deste cliente.'');
  end loop;

  return out;
end;';
begin
  if position('crm-diverge-origem' in def) > 0 then
    return; -- já aplicada
  end if;
  if position(antigo in def) = 0 then
    raise exception 'qualidade_dados: final da função não encontrado; revisar a migration';
  end if;
  execute replace(def, antigo, novo);
end
$migra$;
