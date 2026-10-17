-- Módulos por cliente (Hub, SAP, Brand Brain, Agentes). Um cadastro só (clients); o módulo diz o que o cliente usa.
-- Regra de segurança para não tirar acesso de ninguém: SEM registro = comportamento de hoje. Nesta etapa nada lê
-- esta tabela para restringir tela; ela só registra. Situação em 17/10/2026 (confirmada pelo Fundador): os 19 clientes
-- usam só o Hub; a Dra. Juliana Paola tem o SAP como beta de teste (não implantado).
-- Reversão: drop function public.tem_modulo(uuid, text); drop table public.cliente_modulos;

create table if not exists public.cliente_modulos (
  client_id uuid not null references public.clients(id) on delete cascade,
  modulo text not null check (modulo in ('hub', 'sap', 'brand_brain', 'agentes')),
  status text not null default 'ativo' check (status in ('ativo', 'beta', 'pausado', 'encerrado')),
  inicio date,
  fim date,
  origem text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (client_id, modulo)
);
alter table public.cliente_modulos enable row level security;
create policy "ler modulos do cliente" on public.cliente_modulos for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
create policy "admin escreve modulos" on public.cliente_modulos for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
grant select on public.cliente_modulos to authenticated;
grant insert, update, delete on public.cliente_modulos to authenticated;

-- true se o cliente tem o módulo ativo ou em beta. Para 'hub', ausência de registro também conta como ativo.
create or replace function public.tem_modulo(p_client_id uuid, p_modulo text)
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select case
    when not (public.is_app_admin() or public.is_client_member(p_client_id)) then false
    when exists (select 1 from cliente_modulos m where m.client_id = p_client_id and m.modulo = p_modulo) then
      exists (select 1 from cliente_modulos m where m.client_id = p_client_id and m.modulo = p_modulo and m.status in ('ativo', 'beta'))
    else p_modulo = 'hub'
  end;
$function$;
revoke all on function public.tem_modulo(uuid, text) from public, anon;
grant execute on function public.tem_modulo(uuid, text) to authenticated;

-- Registro inicial: Hub para todos os clientes atuais; SAP em beta para quem já tem cadastro no SAP (hoje, só a beta).
insert into public.cliente_modulos (client_id, modulo, status, inicio, origem)
select c.id, 'hub', 'ativo', c.created_at::date, 'registro inicial 17/10/2026: cliente do Hub'
from public.clients c
on conflict do nothing;
insert into public.cliente_modulos (client_id, modulo, status, inicio, origem)
select s.client_id, 'sap', 'beta', s.d0, 'registro inicial 17/10/2026: beta de teste do SAP, não implantado'
from public.sap_clinicas s where s.client_id is not null
on conflict do nothing;
