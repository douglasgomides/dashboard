-- Métricas de retenção de reels + sinais de perfil por post.
--
-- Motivo: o time pediu "hook rate / body rate / hold rate". A Meta não expõe
-- nenhuma das três prontas, mas expõe os ingredientes:
--   * skip rate  — FRAÇÃO (0-1) de views em que a pessoa pulou o reel nos 3
--                  primeiros segundos. Hook rate = (1 - skip_rate) x 100.
--                  A Windsor declara o campo como PERCENT mas devolve fração
--                  (0.515 = 51,5%) — conferido contra a conta do Douglas.
--   * watch time — tempo médio e total assistido, em milissegundos.
-- "Body rate" e "hold rate" no sentido estrito (retenção em N% do vídeo)
-- exigem a duração do vídeo, que nem a Windsor nem a Graph API entregam —
-- ver README. Por isso guardamos o dado cru e derivamos só o que é honesto.
--
-- profile_visits e media_follows são por post e NÃO são suportados para
-- reels pela Meta — ficam null em reel, e isso é esperado, não é falha de
-- sync.

alter table public.instagram_posts
  add column if not exists reel_skip_rate numeric,
  add column if not exists reel_avg_watch_time_ms integer,
  add column if not exists reel_total_watch_time_ms bigint,
  add column if not exists profile_visits integer,
  add column if not exists media_follows integer;

comment on column public.instagram_posts.reel_skip_rate is
  'Fração (0-1) de views que pularam o reel nos 3 primeiros segundos. Hook rate = (1 - valor) * 100. Só reels.';
comment on column public.instagram_posts.reel_avg_watch_time_ms is
  'Tempo médio assistido do reel, em ms. Só reels.';
comment on column public.instagram_posts.reel_total_watch_time_ms is
  'Tempo total assistido do reel (inclui replays), em ms. Só reels.';
comment on column public.instagram_posts.profile_visits is
  'Visitas ao perfil originadas neste post. A Meta não suporta para reels — null em reel é esperado.';
comment on column public.instagram_posts.media_follows is
  'Novos seguidores originados neste post. A Meta não suporta para reels — null em reel é esperado.';

-- Qual caminho de sync serve cada conta ------------------------------------
--
-- Existem dois: a Windsor.ai (serve todas as 33 contas conectadas) e a Meta
-- Graph API direta (só as contas dentro da Business Manager cobertas pelo
-- META_ACCESS_TOKEN). Até aqui a distinção só existia na cabeça de quem
-- montou o n8n — nada no banco dizia qual conta é qual.
--
-- Isso vira um problema no momento em que existe um botão "Atualizar dados"
-- na tela: rodar a Windsor numa conta que é servida pela Graph API
-- sobrescreveria dados bons por dados com buraco (a Windsor já perdeu os
-- reels da Lana Torres uma vez — ver comentário em instagram-sync.ts).
--
-- A marcação inicial é derivada do dado, não chutada: só o sync da Graph API
-- escreve em instagram_backfill_state, então quem tem linha lá é Graph.

alter table public.instagram_accounts
  add column if not exists sync_source text not null default 'windsor'
    check (sync_source in ('windsor', 'meta_graph'));

update public.instagram_accounts a
set sync_source = 'meta_graph'
where exists (
  select 1 from public.instagram_backfill_state s
  where s.instagram_account_id = a.id
);

comment on column public.instagram_accounts.sync_source is
  'Qual sync alimenta esta conta: windsor (padrão) ou meta_graph (dentro da Business Manager).';
