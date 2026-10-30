-- Leitura por IA relia as mesmas conversas a cada hora (auditoria de 30/10/2026: Mariela com 3.060 tentativas em 48 h,
-- até 196 numa só conversa). Esta tabela guarda as falhas por conversa (formato inválido, sem mensagens): o lote só
-- tenta de novo quando chega mensagem nova, e no máximo 3 vezes. Escrita só pelo servidor.
-- Reversão: drop table public.conversas_ia_falhas;

create table if not exists public.conversas_ia_falhas (
  conversa_id uuid primary key references public.conversas(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  falhas integer not null default 1,
  ultimo_erro text,
  ate_msg_em timestamptz,
  ultima_em timestamptz not null default now()
);
alter table public.conversas_ia_falhas enable row level security;
revoke all on public.conversas_ia_falhas from anon, authenticated;
