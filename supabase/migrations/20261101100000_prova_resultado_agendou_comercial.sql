-- Prova de resultado: "agendou" passa a contar só as conversas que a IA também marcou como comerciais.
-- Antes, a taxa "Agendaram (das conversas de venda)" dividia todas as conversas com agendamento pelas conversas de
-- venda, e passava de 100% (Dr. Sergio, 05/10 a 26/10: 294 de 252). Agora o numerador é parte do denominador.
-- O investimento por agendamento usa o mesmo número (agendamentos em conversas de venda).
-- Só troca uma linha da função; assinatura, permissões e search_path ficam iguais.
-- Reversão: na função prova_resultado, trocar "count(*) filter (where l.agendou and l.comercial) as agendou"
-- de volta para "count(*) filter (where l.agendou) as agendou" (mesmo padrão pg_get_functiondef + replace).

do $migra$
declare
  d text := pg_get_functiondef('public.prova_resultado(uuid,integer)'::regprocedure);
  a1 text := $a$count(*) filter (where l.agendou) as agendou$a$;
  n1 text := $n$count(*) filter (where l.agendou and l.comercial) as agendou$n$;
begin
  if position(n1 in d) > 0 then return; end if;
  if position(a1 in d) = 0 then raise exception 'prova_resultado: trecho não encontrado'; end if;
  execute replace(d, a1, n1);
end
$migra$;
