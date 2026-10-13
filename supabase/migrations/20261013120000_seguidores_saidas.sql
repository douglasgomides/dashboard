-- Seguidor bruto x líquido: guarda quantos deixaram de seguir por dia.
-- new_followers já é o bruto (novos seguidores do dia, igual ao "Seguidores" do Insights da Meta).
-- unfollowers = deixaram de seguir ou saíram do Instagram no dia. Líquido = new_followers - unfollowers.
-- null = a Meta ainda não fechou o dia (atraso de ~2 dias) ou o dia é anterior à coleta.
alter table public.instagram_account_daily_metrics
  add column if not exists unfollowers integer;

comment on column public.instagram_account_daily_metrics.unfollowers is
  'Deixaram de seguir no dia (Meta: follows_and_unfollows menos novos seguidores). null = dia ainda não fechado ou sem coleta.';
