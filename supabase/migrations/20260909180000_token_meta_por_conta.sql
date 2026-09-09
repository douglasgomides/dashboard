-- Token da Meta por conta de Instagram, em tabela separada e só de admin.
--
-- Motivo do desenho: existem DUAS Business Managers em jogo. O token que
-- está em META_ACCESS_TOKEN cobre a Lana Torres; o do usuário de sistema do
-- Victor cobre Doctor Creator e Douglas Gomides, e não cobre a Lana. Uma
-- variável de ambiente única obriga a escolher um dos lados, e trocá-la
-- quebra o outro silenciosamente na madrugada seguinte — mesma classe de
-- erro que o sync_source passou a impedir nos posts.
--
-- Por que NÃO em instagram_accounts: aquela tabela é legível por qualquer
-- membro do cliente (política "read own or admin reads all"), então um
-- médico com login leria pelo navegador um token com ads_management,
-- instagram_content_publish e whatsapp_business_messaging sobre a BM
-- inteira. Aqui o SELECT é só de admin, como já é em crm_connections.
-- O service role dos syncs ignora RLS e continua lendo normalmente.

create table if not exists public.instagram_account_secrets (
  instagram_account_id uuid primary key
    references public.instagram_accounts(id) on delete cascade,
  meta_access_token text,
  nota text,
  updated_at timestamptz not null default now()
);

comment on table public.instagram_account_secrets is
  'Credenciais por conta de Instagram. Só admin lê. Quando vazio, o sync cai no META_ACCESS_TOKEN do ambiente.';
comment on column public.instagram_account_secrets.nota is
  'De qual Business Manager/usuário de sistema veio o token — ajuda a saber o que rotacionar.';

alter table public.instagram_account_secrets enable row level security;

create policy "admin reads instagram account secrets"
  on public.instagram_account_secrets for select
  using (public.is_app_admin());

create policy "admin inserts instagram account secrets"
  on public.instagram_account_secrets for insert
  with check (public.is_app_admin());

create policy "admin updates instagram account secrets"
  on public.instagram_account_secrets for update
  using (public.is_app_admin());

create policy "admin deletes instagram account secrets"
  on public.instagram_account_secrets for delete
  using (public.is_app_admin());
