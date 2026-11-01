-- Instagram certo por dia (auditoria de confiabilidade de 01/11/2026). Só acrescenta; nada é apagado.
--   1. instagram_posts.removido_em: post apagado ou arquivado no Instagram (sumiu da listagem /media da Meta) fica
--      marcado em vez de seguir contando nos "posts do período" e nas médias. O sync (api/_lib/meta-graph-sync.ts,
--      marcarPostsRemovidos) marca e desmarca; as telas e os agentes filtram removido_em is null. Nenhuma linha é
--      apagada e as métricas guardadas ficam como estavam.
--   2. instagram_posts.transcricao_proxima_em: erro passageiro da transcrição dos Reels (token, permissão, chave da
--      transcrição) agenda nova tentativa em vez de marcar o vídeo para sempre.
--   3. Os Reels marcados como erro permanente por causa do token errado ("Graph respondeu 400 ao pedir o vídeo") ou da
--      chave da transcrição ("transcrição respondeu 401") voltam para a fila: só transcricao_em volta a null, o texto
--      do erro fica para histórico. Em 01/11/2026 eram 241 + 5 Reels sem transcrição.
-- Segurança: as colunas novas seguem os grants da tabela (authenticated continua sem update nelas; só o service role
-- do sync escreve). Nenhuma policy muda.
-- Reversão: alter table public.instagram_posts drop column if exists removido_em, drop column if exists transcricao_proxima_em;
--   drop index if exists public.instagram_posts_conta_ativos;
--   (os Reels devolvidos à fila voltam a ser marcados sozinhos se o erro se repetir).

alter table public.instagram_posts
  add column if not exists removido_em timestamptz,
  add column if not exists transcricao_proxima_em timestamptz;

comment on column public.instagram_posts.removido_em is
  'Quando o sync viu que o post não volta mais na listagem da Meta (apagado ou arquivado). Null = no ar. Telas e contas filtram removido_em is null.';
comment on column public.instagram_posts.transcricao_proxima_em is
  'Próxima tentativa de transcrição depois de um erro passageiro (token, permissão, chave). Null = sem espera.';

create index if not exists instagram_posts_conta_ativos
  on public.instagram_posts (instagram_account_id, posted_at desc)
  where removido_em is null;

update public.instagram_posts
   set transcricao_em = null
 where transcricao is null
   and transcricao_em is not null
   and transcricao_erro in ('Graph respondeu 400 ao pedir o vídeo', 'transcrição respondeu 401');
