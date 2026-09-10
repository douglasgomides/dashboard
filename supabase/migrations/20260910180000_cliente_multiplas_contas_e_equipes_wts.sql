-- Dois limites do cadastro apareceram ao separar Dra. Juliana Paola e Mariela
-- Muniz, que dividem a mesma conta da WTS e a mesma clínica.
--
-- 1) meta_ad_account_id é uma coluna só, e a Juliana tem DUAS contas de anúncio
--    ("Juliana Paola" e "Dr. Juliana"). Não cabia.
-- 2) as duas médicas compartilham uma conta da WTS. Separar o atendimento só é
--    possível por EQUIPE — "Recepção Dra Juliana" e "Recepção Dra Mariela".

create table if not exists public.client_ad_accounts (
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id text not null,
  name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (client_id, ad_account_id)
);

alter table public.client_ad_accounts enable row level security;

drop policy if exists "read own or admin reads all ad accounts" on public.client_ad_accounts;
create policy "read own or admin reads all ad accounts" on public.client_ad_accounts
  for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));

drop policy if exists "admin writes ad accounts" on public.client_ad_accounts;
create policy "admin writes ad accounts" on public.client_ad_accounts
  for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

-- Traz o que já existia em clients.meta_ad_account_id. A coluna antiga fica:
-- o sync e as telas ainda a leem, e derrubar coluna em uso quebra produção.
insert into public.client_ad_accounts (client_id, ad_account_id)
select id, meta_ad_account_id
from public.clients
where meta_ad_account_id is not null and meta_ad_account_id <> ''
on conflict (client_id, ad_account_id) do nothing;

-- Quais equipes da conta da WTS pertencem a este cliente.
--
-- NULL tem significado próprio e é intencional: o cliente com company_id
-- preenchido e department_ids NULL é o "resto da clínica" — fica com tudo que
-- nenhuma médica reivindicou, inclusive o balde "Geral", que hoje é 60% do
-- volume e não é de ninguém. Sem esse curinga, 21 mil conversas ficariam
-- órfãs e sumiriam de todas as telas.
alter table public.clients add column if not exists wts_department_ids text[];

comment on column public.clients.wts_department_ids is
  'Equipes da WTS que pertencem a este cliente. NULL = recebe todas as equipes que nenhum outro cliente da mesma conta reivindicou.';
