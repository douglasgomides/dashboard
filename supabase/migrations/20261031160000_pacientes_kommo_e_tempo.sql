-- Pacientes do período, ajustes com os dados reais da Dra. Lana Torres (Kommo, 13 mil cards):
--   1. Tempo: a tela levava 9 s e o banco corta a consulta do navegador em 8 s. As vendas eram calculadas por
--      pacientes_vendas_janela, que montava de novo a lista inteira de cards (2 s). Agora saem dos cards já montados.
--   2. Negociação: "Incoming leads" (caixa de entrada do Kommo), "Follow UP (Automação)" e o funil "Cadência" são
--      etapas automáticas, não negociação (Lana: 2.749 "em negociação" para 3.224 que mandaram mensagem).
--   3. Fecharam: zero venda com muita gente nova não é "0 vendas": o CRM quase não marca ganho. Vira "sem dado" com
--      o motivo, para a equipe comercial.
-- Reversão: recriar pacientes_periodo pela migração 20261031150000.

do $migra$
declare
  d text := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  a1 text := '  vend as (select * from public.pacientes_vendas_janela(p_client, p_de, p_ate)),';
  n1 text := $n$  g_jan as (
    select e.crm_connection_id as cx, e.external_lead_id as ext, count(*) as n,
           max(e.ocorreu_em) filter (where (e.ocorreu_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate) as no_periodo
      from crm_lead_eventos e
     where e.client_id = p_client and e.tipo = 'ganhou'
     group by 1, 2
  ),
  vend as (
    select c.id, c.u, coalesce(g.no_periodo, c.occurred_at) as quando, c.price, c.funil, c.procedimento,
           c.prospec and coalesce(c.price, 0) = 0 as prospec_sem_valor
      from cards c left join g_jan g on g.cx = c.cx and g.ext = c.ext
     where c.outcome = 'won' and not (c.em_agendamento and coalesce(c.price, 0) = 0)
       and (g.no_periodo is not null or (g.n is null and c.d between p_de and p_ate))
  ),$n$;
  a2 text := $a$       and coalesce(c.etapa, '') !~* '(caixa de leads|novo lead|^lead$|contato inicial|^base\M|selecionada para prospec|enviei a primeira|mensagem enviada|abordagem realizada|levantou a m)'$a$;
  n2 text := $n$       and coalesce(c.etapa, '') !~* '(caixa de leads|novo lead|^lead$|contato inicial|^base\M|selecionada para prospec|enviei a primeira|mensagem enviada|abordagem realizada|levantou a m|incoming leads|leads de entrada|^entrada|\(automa)'
       and coalesce(c.funil, '') !~* 'cad[eê]ncia'$n$;
  a3 text := $a$        when not exists (select 1 from vendas) and f.fechados_sem_resultado > 0$a$;
  n3 text := $n$        when not exists (select 1 from vendas) and (select count(*) from leads_novos) >= 50
          then jsonb_build_object('valor', null, 'fonte', 'crm',
            'motivo_sem_dado', format('Nenhuma venda marcada no CRM no período, com %s pessoas novas. A equipe pode não estar marcando o ganho.', (select count(*) from leads_novos)),
            'responsavel', 'comercial', 'alerta', 'crm-quase-sem-ganho')
        when not exists (select 1 from vendas) and f.fechados_sem_resultado > 0$n$;
begin
  if position('g_jan as' in d) > 0 then return; end if;
  if position(a1 in d) = 0 or position(a2 in d) = 0 or position(a3 in d) = 0 then
    raise exception 'pacientes_periodo: trechos não encontrados; revisar a migration';
  end if;
  execute replace(replace(replace(d, a1, n1), a2, n2), a3, n3);
end
$migra$;
