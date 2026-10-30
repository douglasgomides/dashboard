-- Cliente de teste: a clínica de dados fictícios (CLÍNICA TESTE SAP V2) deixa de contar como cliente real
-- nas listas e nos alertas do painel admin. Nada é apagado; ela continua acessível pelo link direto e no SAP.
-- Reversão: update public.clients set eh_teste = false where eh_teste; (a coluna pode ficar).
alter table public.clients add column if not exists eh_teste boolean not null default false;
comment on column public.clients.eh_teste is 'Clínica de teste (dados fictícios): fora das contagens, alertas e conferências do painel.';
-- clients libera leitura coluna a coluna (o token do WTS não pode chegar ao navegador): a nova precisa do grant.
grant select (eh_teste) on public.clients to authenticated;
update public.clients set eh_teste = true where id = '6e2efb0e-c817-49f3-b559-48cd66c1e80b' and name like 'CLÍNICA TESTE SAP V2%';
