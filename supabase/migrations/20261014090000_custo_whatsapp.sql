-- Custo estimado da API do WhatsApp por cliente e período, a partir das mensagens guardadas.
-- A Meta cobra por mensagem ENTREGUE de modelo (template) desde jul/2025; resposta dentro de 24h da
-- última mensagem do paciente (janela de atendimento) é gratuita. Não sabemos a categoria real do
-- modelo enviado, então a regra é uma estimativa, dita na tela:
--   - mensagem da clínica até 24h depois da última mensagem do paciente: atendimento (grátis);
--   - fora da janela e AUTOMÁTICA (sem assinatura, repetida em várias conversas): marketing;
--   - fora da janela e de pessoa (com assinatura "*Nome:*"): utilidade (lembrete, confirmação, retorno).
-- Preços em whatsapp_precos (uma linha, editável pelo admin), com fonte e data.

create table if not exists public.whatsapp_precos (
  id int primary key default 1 check (id = 1),
  marketing_usd numeric not null default 0.0625,
  utilidade_usd numeric not null default 0.0068,
  autenticacao_usd numeric not null default 0.0068,
  cambio_brl numeric not null default 5.40,
  taxa_provedor_pct numeric not null default 0,
  fonte text not null default 'Tabela de preços da plataforma WhatsApp Business para o Brasil (por mensagem entregue), conferida em 14/10/2026 em fontes secundárias; confirmar na tabela oficial da Meta.',
  atualizado_em timestamptz not null default now()
);
insert into public.whatsapp_precos (id) values (1) on conflict (id) do nothing;
alter table public.whatsapp_precos enable row level security;
create policy "precos: autenticado le" on public.whatsapp_precos for select to authenticated using (true);
create policy "precos: admin edita" on public.whatsapp_precos for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
revoke all on public.whatsapp_precos from anon;

create table if not exists public.whatsapp_precos_atendimento (
  id int primary key default 1 check (id = 1),
  servico_usd numeric not null default 0.0068,       -- resposta dentro de 24h, depois da franquia
  servico_gratis_mes int not null default 1000,      -- franquia mensal por número
  servico_cobrado_desde date not null default '2026-10-01'
);
insert into public.whatsapp_precos_atendimento (id) values (1) on conflict (id) do nothing;
alter table public.whatsapp_precos_atendimento enable row level security;
create policy "precos atend: autenticado le" on public.whatsapp_precos_atendimento for select to authenticated using (true);
create policy "precos atend: admin edita" on public.whatsapp_precos_atendimento for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
revoke all on public.whatsapp_precos_atendimento from anon;

-- Desde 01/10/2026 a Meta cobra também a resposta dentro de 24h, a partir da 1.001ª do mês por número.
create or replace function public.custo_whatsapp(p_client uuid, p_de date, p_ate date)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client)) as pode),
  pa as (select * from whatsapp_precos_atendimento where id = 1),
  auto as (
    select left(regexp_replace(lower(m.texto), '\s+', ' ', 'g'), 60) as chave
    from mensagens m
    where m.client_id = p_client and m.direcao = 'saida' and m.texto is not null and m.texto !~ '^\s*\*[^*]{1,40}:\*'
      and (select pode from ok)
    group by 1 having count(distinct m.conversa_id) >= least(20, greatest(5, (select count(*) from conversas where client_id = p_client) / 10))
  ),
  msgs as (
    select m.conversa_id, m.direcao, m.enviada_em, m.texto,
      max(m.enviada_em) filter (where m.direcao = 'entrada') over (partition by m.conversa_id order by m.enviada_em rows between unbounded preceding and current row) as ult_paciente
    from mensagens m
    where m.client_id = p_client and (select pode from ok) and m.direcao in ('entrada', 'saida')
  ),
  saida_todas as (
    select *,
      (ult_paciente is not null and enviada_em - ult_paciente <= interval '24 hours') as na_janela,
      (texto is not null and texto !~ '^\s*\*[^*]{1,40}:\*' and left(regexp_replace(lower(texto), '\s+', ' ', 'g'), 60) in (select chave from auto)) as automatica,
      date_trunc('month', enviada_em at time zone 'America/Sao_Paulo')::date as mes
    from msgs where direcao = 'saida'
  ),
  janela as (
    -- Resposta dentro de 24h: grátis até servico_gratis_mes no mês (por número), cobrada depois, desde servico_cobrado_desde.
    select s.*, row_number() over (partition by mes order by enviada_em) as ordem_mes
    from saida_todas s where na_janela
  ),
  saida as (
    select s.*, coalesce(j.ordem_mes, 0) as ordem_mes
    from saida_todas s left join janela j on j.conversa_id = s.conversa_id and j.enviada_em = s.enviada_em and j.texto is not distinct from s.texto
    where (s.enviada_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  cont as (
    select count(*) total,
      count(*) filter (where na_janela and not (mes >= (select servico_cobrado_desde from pa) and ordem_mes > (select servico_gratis_mes from pa))) servico_gratis,
      count(*) filter (where na_janela and mes >= (select servico_cobrado_desde from pa) and ordem_mes > (select servico_gratis_mes from pa)) servico_pago,
      count(*) filter (where not na_janela and automatica) marketing,
      count(*) filter (where not na_janela and not automatica) utilidade,
      count(distinct conversa_id) conversas
    from saida
  ),
  pac as (
    select count(distinct conversa_id) n from msgs
    where direcao = 'entrada' and (enviada_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  p as (select * from whatsapp_precos where id = 1),
  v as (select (c.marketing * p.marketing_usd + c.utilidade * p.utilidade_usd + c.servico_pago * (select servico_usd from pa)) * (1 + p.taxa_provedor_pct / 100) as usd from cont c, p)
  select jsonb_build_object(
    'mensagens_clinica', c.total,
    'gratis_janela_24h', c.servico_gratis,
    'pagas_atendimento', c.servico_pago,
    'pagas_marketing', c.marketing,
    'pagas_utilidade', c.utilidade,
    'conversas_com_envio', c.conversas,
    'conversas_com_paciente', (select n from pac),
    'custo_usd', round((select usd from v), 2),
    'custo_brl', round((select usd from v) * p.cambio_brl, 2),
    'precos', jsonb_build_object('marketing_usd', p.marketing_usd, 'utilidade_usd', p.utilidade_usd, 'cambio_brl', p.cambio_brl,
      'taxa_provedor_pct', p.taxa_provedor_pct, 'fonte', p.fonte, 'atualizado_em', p.atualizado_em,
      'servico_usd', (select servico_usd from pa), 'servico_gratis_mes', (select servico_gratis_mes from pa), 'servico_cobrado_desde', (select servico_cobrado_desde from pa)),
    'primeira_msg', (select min(enviada_em) from mensagens where client_id = p_client)
  )
  from cont c, p
  where (select pode from ok);
$function$;

revoke all on function public.custo_whatsapp(uuid, date, date) from public, anon;
grant execute on function public.custo_whatsapp(uuid, date, date) to authenticated;
