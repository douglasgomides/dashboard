-- Vendas do checkout (Hubla, Hotmart, Eduzz, Kiwify) como fonte de "fecharam" em Pacientes do período.
-- Caso que motivou: na Doctor Creator a venda acontece no checkout da Hubla, e não no CRM Clint. Em outubro a Hubla
-- tinha 22 vendas pagas e R$ 8.020,34 brutos; o Nexo mostrava 17 pessoas e R$ 4.826 pelo CRM.
--
-- O que entra:
--   1. vendas_checkout: uma linha por fatura do checkout (upsert por cliente + provedor + id da fatura), gravada só pelo
--      servidor (api/sync/manual.ts?checkout=hubla, chamado pelo n8n com SYNC_SECRET). Sem nome, e-mail, telefone,
--      documento nem endereço do comprador: só telefone_chave (public.chave_telefone) para ligar à pessoa do Nexo.
--      Order bump e combo chegam como fatura pai + faturas filhas (id com "-offer-" ou parentInvoiceId): a filha
--      guarda parent_externo_id; a venda conta uma vez, pela pai, e o valor das filhas pagas soma na pai.
--   2. cliente_usa_checkout(client): há venda do checkout nos últimos 180 dias.
--   3. pacientes_periodo: com checkout, "fecharam" vem de vendas_checkout (status paid no período), fonte 'checkout',
--      com os reembolsos e chargebacks do período à parte em 'reembolsos'. Sem checkout, nada muda.
-- Reversão:
--   recriar pacientes_periodo pelas migrações 20261031150000 + 20261031160000 + 20261031162000;
--   drop function public.cliente_usa_checkout(uuid);
--   drop table public.vendas_checkout;

create table if not exists public.vendas_checkout (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  provider text not null check (provider in ('hubla', 'hotmart', 'eduzz', 'kiwify')),
  externo_id text not null,
  parent_externo_id text,
  status text not null,
  tipo text,
  metodo text,
  valor_centavos bigint not null check (valor_centavos >= 0),
  moeda text default 'BRL',
  pago_em timestamptz,
  reembolsado_em timestamptz,
  produto text,
  oferta_id text,
  utm jsonb,
  telefone_chave text,
  pessoa_id uuid references public.pessoas(id) on delete set null,
  bruto jsonb,
  recebido_em timestamptz default now(),
  unique (client_id, provider, externo_id)
);
create index if not exists vendas_checkout_cliente_pago on public.vendas_checkout (client_id, pago_em);
create index if not exists vendas_checkout_pai on public.vendas_checkout (client_id, provider, parent_externo_id)
  where parent_externo_id is not null;

alter table public.vendas_checkout enable row level security;
revoke all on table public.vendas_checkout from public, anon, authenticated;
grant select on table public.vendas_checkout to authenticated;
grant select, insert, update, delete on table public.vendas_checkout to service_role;

do $pol$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vendas_checkout'
                   and policyname = 'read own or admin reads all checkout sales') then
    create policy "read own or admin reads all checkout sales" on public.vendas_checkout
      for select to authenticated
      using (public.is_app_admin() or public.is_client_member(client_id));
  end if;
end $pol$;

-- Invoker: quem não é da clínica não enxerga as linhas (RLS) e recebe false. pacientes_periodo é definer e enxerga.
create or replace function public.cliente_usa_checkout(p_client uuid)
returns boolean
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.vendas_checkout v
     where v.client_id = p_client
       and coalesce(v.pago_em, v.recebido_em) >= now() - interval '180 days'
  )
$$;
revoke all on function public.cliente_usa_checkout(uuid) from public, anon;
grant execute on function public.cliente_usa_checkout(uuid) to authenticated, service_role;

do $migra$
declare
  d text := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  -- 1. vendas: com checkout, as faturas pai pagas no período (valor das filhas pagas somado); sem checkout, o CRM.
  a1 text := '  vendas as (select * from vend where not prospec_sem_valor),';
  n1 text := $n$  ck as (select public.cliente_usa_checkout(p_client) as usa),
  ck_pagas as (
    select v.*,
           coalesce((select sum(f.valor_centavos) from vendas_checkout f
                      where f.client_id = v.client_id and f.provider = v.provider and f.parent_externo_id = v.externo_id
                        and f.status = 'paid'), 0) as filhas_centavos
      from vendas_checkout v
     where v.client_id = p_client and v.parent_externo_id is null and v.status = 'paid'
       and v.pago_em >= v_ini and v.pago_em < v_fim
  ),
  ck_reemb as (
    select v.* from vendas_checkout v
     where v.client_id = p_client and v.status in ('refunded', 'chargeback')
       and coalesce(v.reembolsado_em, v.pago_em) >= v_ini and coalesce(v.reembolsado_em, v.pago_em) < v_fim
  ),
  vendas as (
    select * from vend where not prospec_sem_valor and not (select usa from ck)
    union all
    select v.id,
           coalesce('p:' || v.pessoa_id::text, 't:' || v.telefone_chave, 'x:' || v.provider || ':' || v.externo_id) as u,
           v.pago_em as quando, round((v.valor_centavos + v.filhas_centavos) / 100.0, 2)::numeric as price,
           null::text as funil, v.produto as procedimento, false as prospec_sem_valor
      from ck_pagas v where (select usa from ck)
  ),$n$;
  -- 2. lista "fecharam": a fonte e o produto.
  a2 text := $a$    select 'fecharam', v.u, v.quando, 'crm',
           jsonb_build_object('valor', v.price, 'funil', v.funil, 'procedimento', v.procedimento,$a$;
  n2 text := $n$    select 'fecharam', v.u, v.quando, case when (select usa from ck) then 'checkout' else 'crm' end,
           jsonb_build_object('valor', v.price, 'funil', v.funil, 'procedimento', v.procedimento,
                              'produto', case when (select usa from ck) then v.procedimento end,$n$;
  -- 3. número "fecharam": com checkout, sai das vendas pagas e traz os reembolsos à parte.
  a3 text := $a$      'fecharam', case
        when not f.tem_crm then$a$;
  n3 text := $n$      'fecharam', case
        when (select usa from ck) then jsonb_build_object('valor', (select count(distinct u) from vendas), 'fonte', 'checkout',
            'motivo_sem_dado', null, 'responsavel', null,
            'provedor', (select string_agg(distinct provider, ',' order by provider) from vendas_checkout where client_id = p_client),
            'vendas', (select count(*) from vendas),
            'valor_total', (select coalesce(sum(price), 0) from vendas),
            'sem_valor', (select count(*) from vendas where coalesce(price, 0) = 0),
            'ganho_prospeccao_sem_valor', 0,
            'reembolsos', jsonb_build_object(
              'vendas', (select count(*) from ck_reemb where parent_externo_id is null),
              'valor_total', (select coalesce(round(sum(valor_centavos) / 100.0, 2), 0) from ck_reemb)))
        when not f.tem_crm then$n$;
begin
  if position('ck_pagas as' in d) > 0 then return; end if;
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 then
    raise exception 'pacientes_periodo: trechos não encontrados; revisar a migration';
  end if;
  execute replace(replace(replace(d, a1, n1), a2, n2), a3, n3);
end
$migra$;
