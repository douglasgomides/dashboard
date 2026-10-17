-- Brand Brain como beta interno nos clientes do Hub (autorizado pelo fundador em 17/10). É uma tela só do admin:
-- o cliente não vê nada e o plano dele não muda. Reversão:
-- delete from cliente_modulos where modulo = 'brand_brain' and origem = 'beta interno (autorizado em 17/10)';
insert into public.cliente_modulos (client_id, modulo, status, origem)
select m.client_id, 'brand_brain', 'beta', 'beta interno (autorizado em 17/10)'
from public.cliente_modulos m
where m.modulo = 'hub' and m.status = 'ativo'
on conflict (client_id, modulo) do nothing;
