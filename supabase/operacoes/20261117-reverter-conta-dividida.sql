-- NÃO é migração: rodar à mão, só o João, se for preciso desfazer 20261117110000_conta_dividida_sem_medico.sql.
-- Rodar DEPOIS de 20261117-reverter-agendou-retorno.sql quando as duas forem desfeitas. Agentes não rodam este arquivo.
-- O que faz: tira crm_sem_divisao (só as telas a chamam; sem ela, o "sem médico" some da tela, sem erro) e devolve
-- crm_compartilhado_com ao texto de antes (os MESMOS pares da migração, ao contrário).

begin;
drop function if exists public.crm_sem_divisao(uuid, date, date);

create or replace function pg_temp.dividida_desfazer(p_fn regprocedure, p_trocas text[])
returns void
language plpgsql
as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
  novo text;
begin
  if position('[conta-dividida]' in d) = 0 then return; end if;  -- já está sem a troca
  for i in reverse array_length(p_trocas, 1) .. 1 loop
    novo := p_trocas[i][2];
    n := (length(d) - length(replace(d, novo, ''))) / length(novo);
    if n <> p_trocas[i][3]::int then
      raise exception 'reverter %: trecho % aparece % vezes (esperado %). Nada foi alterado: %', p_fn, i, n, p_trocas[i][3], left(novo, 120);
    end if;
    d := replace(d, novo, p_trocas[i][1]);
  end loop;
  if position('[conta-dividida]' in d) > 0 then raise exception 'reverter %: a marca [conta-dividida] continua lá', p_fn; end if;
  execute d;
end
$f$;

-- [trocas:início]
select pg_temp.dividida_desfazer('public.crm_compartilhado_com(uuid)'::regprocedure, array[
  array[$t$     where k.client_id = p_client and k.active), '[]'::jsonb);$t$,
        $t$     where k.client_id = p_client and k.active
       and not public.crm_tem_filtro(p_client) /* [conta-dividida] com a divisão ligada, os números já são só deste cliente */), '[]'::jsonb);$t$, '1']
]);
-- [trocas:fim]
commit;
