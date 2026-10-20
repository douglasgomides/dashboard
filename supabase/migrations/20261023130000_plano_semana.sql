-- Plano da semana: 3 a 5 ações por clínica, priorizadas pelo dinheiro em jogo, conferidas na semana seguinte.
-- Um motor só para o SAP (entrada) e o Nexo (continuidade): o histórico fica na clínica, não no produto.
-- A geração e a conferência rodam no servidor (api/_lib/plano-semana.ts, service_role); aqui ficam a tabela e
-- duas funções de apoio. Leitura para admin e membros da clínica; escrita só pelo servidor. Sem gatilho.
-- Reversão: drop function plano_ticket(uuid), plano_taxa(uuid,text,numeric), plano_agendou(uuid,timestamptz);
--   drop table plano_itens;

create table if not exists public.plano_itens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  semana date not null,
  ordem int not null default 0,
  origem text not null check (origem in ('responder','recuperar','preco','anuncio','conteudo')),
  titulo text not null,
  porque text not null,
  acao text not null,
  onde text,
  n int not null default 0,
  valor_brl numeric,
  valor_calculo text,
  refs jsonb not null default '{}',
  estado text not null default 'proposta' check (estado in ('proposta','feita','nao_feita','descartada')),
  verificado boolean not null default false,
  medicao jsonb not null default '{}',
  resultado_brl numeric,
  resultado_texto text,
  medido_em timestamptz,
  nota text,
  decidido_por uuid,
  decidido_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (client_id, semana, origem)
);
create index if not exists plano_itens_cliente on public.plano_itens (client_id, semana desc);
alter table public.plano_itens enable row level security;
create policy plano_itens_leitura on public.plano_itens for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
revoke all on public.plano_itens from public, anon, authenticated;
grant select on public.plano_itens to authenticated;
grant all on public.plano_itens to service_role;

-- Ticket: SAP primeiro, CRM depois (mediana das vendas ganhas em 180 dias, 5+ vendas). Null = mostrar pacientes.
create or replace function public.plano_ticket(p_client uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select s.ticket_medio from sap_clinicas s where s.client_id = p_client and s.ticket_medio > 0 order by s.ticket_medio desc limit 1),
    (select percentile_cont(0.5) within group (order by l.price)::numeric from crm_leads l
      where l.client_id = p_client and l.outcome = 'won' and l.price > 0 and l.occurred_at > now() - interval '180 days'
      having count(*) >= 5));
$$;

-- Taxa de agendamento aprendida (20+ pacientes medidos em 120 dias) ou a padrão.
create or replace function public.plano_taxa(p_client uuid, p_origem text, p_padrao numeric)
returns numeric language sql stable security definer set search_path = public, pg_temp
as $$
  select case when sum((medicao->>'n')::int) >= 20
    then round(sum((medicao->>'agendaram')::int)::numeric / sum((medicao->>'n')::int), 3) else p_padrao end
  from plano_itens
  where client_id = p_client and origem = p_origem and medido_em is not null and semana < (date_trunc('week', now() at time zone 'America/Sao_Paulo'))::date
    and semana > current_date - 120 and medicao ? 'n';
$$;

-- A conversa agendou depois de um momento? (leitura da conversa ou etapa/venda no CRM)
create or replace function public.plano_agendou(p_conversa uuid, p_desde timestamptz)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from conversas_resumos r where r.conversa_id = p_conversa and r.ate_msg_em > p_desde
                  and (r.resumo->>'situacao' = 'agendou' or r.resumo->>'etapa' = 'agendou'))
      or exists (select 1 from conversas c join crm_leads l on l.id = c.lead_id
                 left join crm_pipeline_statuses s on s.crm_connection_id = l.crm_connection_id and s.pipeline_id = l.pipeline_id and s.status_id = l.status_id
                 where c.id = p_conversa and l.occurred_at > p_desde
                   and (l.outcome = 'won' or coalesce(s.status_name, '') ~* '(agendad|confirmad|realizad|compareceu)'));
$$;

revoke all on function public.plano_ticket(uuid) from public, anon, authenticated;
revoke all on function public.plano_taxa(uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.plano_agendou(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.plano_ticket(uuid), public.plano_taxa(uuid, text, numeric), public.plano_agendou(uuid, timestamptz) to service_role;
