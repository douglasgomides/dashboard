-- Lead que sumiu do CRM de origem.
--
-- Todos os syncs são insert/upsert: nada some do nosso lado quando some de lá.
-- A Lana apagou milhares de leads no Kommo e o dashboard seguiu mostrando o
-- total antigo — número que não existe mais na origem, o que é pior do que
-- dado velho, porque parece certo.
--
-- Marca em vez de apagar: se a varredura da origem vier incompleta, um DELETE
-- seria irreversível. Assim dá para desmarcar, e quem já foi lead continua
-- consultável.

alter table public.crm_leads add column if not exists removido_na_origem timestamptz;

create index if not exists crm_leads_vivos
  on public.crm_leads (client_id, received_at desc)
  where removido_na_origem is null;

comment on column public.crm_leads.removido_na_origem is
  'Quando a varredura de reconciliação deixou de encontrar este lead no CRM de origem. Nulo = ainda existe lá.';

-- As seis funções do CRM passam a ignorar lead removido.
--
-- Cada uma referencia crm_leads exatamente uma vez e sempre com o apelido
-- "cl", em duas formas: "from crm_leads cl" e "left join crm_leads cl".
-- Trocar a tabela por uma subconsulta filtrada mantém o apelido e não exige
-- tocar em mais nada do corpo. Feito por reescrita da própria definição para
-- não perder nenhuma diferença de corpo no caminho.

do $$
declare
  f record;
  novo text;
begin
  for f in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'crm_atividade_recente', 'crm_funil_por_campo', 'crm_leads_por_dia',
        'crm_leads_por_etapa', 'crm_metricas_essenciais', 'crm_pipeline_kanban'
      )
  loop
    if position('crm_leads cl' in f.def) = 0 then
      -- Já migrada, ou o corpo mudou: parar é melhor que reescrever no escuro.
      continue;
    end if;
    novo := replace(
      f.def,
      'crm_leads cl',
      '(select * from crm_leads where removido_na_origem is null) cl'
    );
    execute novo;
  end loop;
end $$;
