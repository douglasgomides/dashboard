-- Transcrição da fala dos Reels (api/_lib/transcrever-reels.ts): os agentes leem o roteiro falado, não só a legenda.
-- Reversão: alter table instagram_posts drop column transcricao, drop column transcricao_em, drop column transcricao_erro;
alter table public.instagram_posts add column if not exists transcricao text,
  add column if not exists transcricao_em timestamptz,
  add column if not exists transcricao_erro text;
create index if not exists instagram_posts_reels_sem_transcricao on public.instagram_posts (posted_at desc) where format = 'reels' and transcricao_em is null;
