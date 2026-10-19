-- Trava de concorrência nas ações dos anúncios (api/_lib/anuncios-acoes.ts).
-- Antes: o servidor conferia o histórico e só depois aplicava na Meta, então dois cliques ao mesmo tempo passavam
-- juntos pela regra de "uma mudança a cada 24 h". Agora a ação reserva a campanha primeiro (estado em_andamento) e o
-- índice único parcial impede uma segunda reserva simultânea. O desfazer também reserva (estado desfazendo) para não
-- rodar duas vezes. Reservas que ficaram presas por queda do servidor são encerradas pelo código após 10 minutos.
-- Reversão: drop index anuncios_mudancas_uma_reserva; e recolocar o check original (aplicada, desfeita, falhou).
-- Remove o check antigo de estado seja qual for o nome que ele recebeu quando a tabela foi criada.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.anuncios_mudancas'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%estado%'
  loop
    execute format('alter table public.anuncios_mudancas drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.anuncios_mudancas
  add constraint anuncios_mudancas_estado_check
  check (estado in ('em_andamento', 'aplicada', 'desfazendo', 'desfeita', 'falhou'));

create unique index if not exists anuncios_mudancas_uma_reserva
  on public.anuncios_mudancas (campanha_id)
  where estado in ('em_andamento', 'desfazendo');
