-- Remove "diferencial" e "narrativa" da metodologia — nenhum post usava
-- esses valores (methodology_stage estava 100% nulo), decisão do Douglas de
-- simplificar a lista pra 4 estágios.
alter table public.instagram_posts
  drop constraint instagram_posts_methodology_stage_check;

alter table public.instagram_posts
  add constraint instagram_posts_methodology_stage_check
  check (methodology_stage = any (array['percepcao', 'confianca', 'venda', 'multiplicacao']));
