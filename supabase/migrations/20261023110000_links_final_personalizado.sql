-- Links rastreados com final escolhido pela equipe (/r/drajulia) e editável depois. O final anterior fica em
-- slugs_antigos e continua redirecionando, para o link já colocado na bio ou impresso não quebrar.
-- Reversão: drop index links_rastreados_slugs_antigos; alter table links_rastreados drop column slugs_antigos;
alter table public.links_rastreados add column if not exists slugs_antigos text[] not null default '{}';
create index if not exists links_rastreados_slugs_antigos on public.links_rastreados using gin (slugs_antigos);
