-- Metas mensais por clínica (inspirado nas metas do Databox): a equipe define quanto a clínica quer no mês e o Nexo
-- mostra o ritmo (no prazo, em risco, fora do prazo). Uma meta por métrica; vale para todo mês até ser mudada.
-- Aditiva: tabela nova, sem efeito em nada existente. Reversão: drop table public.clinica_metas;
create table if not exists public.clinica_metas (
  client_id uuid not null references public.clients(id) on delete cascade,
  metrica text not null check (metrica in ('mandaram_mensagem', 'agendaram', 'fecharam')),
  valor integer not null check (valor > 0 and valor <= 1000000),
  definido_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (client_id, metrica)
);
comment on table public.clinica_metas is 'Meta mensal por clínica e métrica da tela Resultados. Leitura: admin e membros do cliente. Escrita: só admin.';
alter table public.clinica_metas enable row level security;
revoke all on table public.clinica_metas from public, anon;
grant select, insert, update, delete on table public.clinica_metas to authenticated;
grant all on table public.clinica_metas to service_role;
drop policy if exists "metas: admin ou membro le" on public.clinica_metas;
create policy "metas: admin ou membro le" on public.clinica_metas for select to authenticated
  using (public.is_app_admin() or public.is_client_member(client_id));
drop policy if exists "metas: admin escreve" on public.clinica_metas;
create policy "metas: admin escreve" on public.clinica_metas for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
