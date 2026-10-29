-- Tags dos contatos do FlwChat/WTS guardadas entre rodadas (origem pela tag "Origem · X").
-- A conta da Clinic Desk (Dra. Juliana Paola e Dra. Mariela Muniz) tem mais de 24 mil contatos: a leitura inteira não
-- cabia numa rodada e os cards cujo contato não foi lido perdiam a origem. Agora a leitura é feita em partes, com
-- retomada (config.tags_varredura / config.tags_ate), e o que já foi lido fica aqui. Só o sync (service_role) lê e grava.
-- Reversão: drop table public.crm_contato_tags;
create table if not exists public.crm_contato_tags (
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  contato_id text not null,
  tags text[] not null default '{}',
  atualizado_em timestamptz,
  lido_em timestamptz not null default now(),
  primary key (crm_connection_id, contato_id)
);
alter table public.crm_contato_tags enable row level security;
revoke all on table public.crm_contato_tags from public, anon, authenticated;
grant select, insert, update, delete on table public.crm_contato_tags to service_role;
comment on table public.crm_contato_tags is 'Tags dos contatos do FlwChat/WTS por conexão, lidas em partes pelo sync. Lista vazia = contato lido sem tag.';
