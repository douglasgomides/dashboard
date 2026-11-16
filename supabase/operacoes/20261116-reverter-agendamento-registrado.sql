-- NÃO é migração: rodar à mão, só o João, se for preciso desfazer 20261116170000_agendamento_registrado_por_clinica.sql.
-- A função é nova e só a Carteira a chama; sem ela a Carteira volta ao rótulo de antes ("Agendaram"), sem erro.
begin;
drop function if exists public.crm_agendamento_registrado();
commit;
