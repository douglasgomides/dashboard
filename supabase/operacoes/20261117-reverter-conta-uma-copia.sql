-- NÃO é migração: rodar à mão, só o João, se for preciso desfazer 20261117100000_conta_compartilhada_uma_copia.sql.
-- Rodar DEPOIS de 20261117-reverter-agendou-retorno.sql e de 20261117-reverter-conta-dividida.sql quando as três forem
-- desfeitas (ordem inversa da aplicação). Agentes não rodam este arquivo.
-- O que faz: tira os dois gatilhos de crm_leads e as funções da cópia única; devolve qualidade_dados_calc ao texto de antes
-- (os MESMOS pares da migração, copiados entre [trocas:início] e [trocas:fim], ao contrário). Os cards e eventos que o
-- espelho já tem ficam como estão; sem os gatilhos, a conexão do espelho volta a gravar a própria cópia no próximo sync.
-- A chave config.espelho_de pode ficar: sem esta migração, nada a lê.

begin;
drop trigger if exists crm_leads_a_espelho_guarda on public.crm_leads;
drop trigger if exists crm_leads_espelho_copia_ins on public.crm_leads;
drop trigger if exists crm_leads_espelho_copia_upd on public.crm_leads;
drop function if exists public.crm_espelho_alinhar(uuid);
drop function if exists public.crm_leads_espelho_copia();
drop function if exists public.crm_leads_espelho_guarda();
drop function if exists public.crm_espelho_gravar(uuid, uuid, public.crm_leads[]);
drop function if exists public.crm_espelho_de(uuid);

create or replace function pg_temp.uma_copia_desfazer(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
  novo text;
begin
  if position('[conta-uma-copia]' in d) = 0 then return; end if;  -- já está sem a troca
  for i in reverse array_length(p_trocas, 1) .. 1 loop
    novo := p_trocas[i][2];
    n := (length(d) - length(replace(d, novo, ''))) / length(novo);
    if n <> p_trocas[i][3]::int then
      raise exception 'reverter %: trecho % aparece % vezes (esperado %). Nada foi alterado: %', p_fn, i, n, p_trocas[i][3], left(novo, 120);
    end if;
    d := replace(d, novo, p_trocas[i][1]);
  end loop;
  if position('[conta-uma-copia]' in d) > 0 then raise exception 'reverter %: a marca [conta-uma-copia] continua lá', p_fn; end if;
  execute d;
end
$f$;

-- [trocas:início]
select pg_temp.uma_copia_desfazer('public.qualidade_dados_calc(uuid)'::regprocedure, array[
  array[$t$    where c.client_id = p_client_id and c.active and c.subdomain is not null and not public.crm_tem_filtro(p_client_id)$t$,
        $t$    where c.client_id = p_client_id and c.active and c.subdomain is not null and not public.crm_tem_filtro(p_client_id)
      -- [conta-uma-copia] conta lida de uma cópia só (config.espelho_de): ler a conta inteira em cada painel foi a decisão.
      and not (c.config ? 'espelho_de' or exists (select 1 from crm_connections e where e.config->>'espelho_de' = c.id::text))$t$, '1']
]);
-- [trocas:fim]

delete from public.resultado_pronto where funcao = 'qualidade_dados';
commit;
