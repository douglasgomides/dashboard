-- Gerada pelo CLI em 18/10 e ordenada após as dependências já existentes nesta branch.
-- Extensão da campanha existente; sem novo módulo, permissão ou ação externa.
alter table public.campanhas_ideias add column if not exists estrategia jsonb;
alter table public.campanhas_ideias add constraint campanhas_estrategia_documento
  check (estrategia is null or coalesce(
    jsonb_typeof(estrategia)='object' and estrategia @> '{"versao":1}'::jsonb
    and octet_length(estrategia::text)<=65536, false));
comment on column public.campanhas_ideias.estrategia is
  'Proposta de estratégia integrada: online, presencial, jornada, recursos e medição. Validada pelo servidor; revisão humana antes da execução. NULL preserva ideias legadas.';
