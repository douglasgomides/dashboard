-- Auditoria comercial do período, a partir da leitura por IA de cada conversa (conversas_resumos).
-- Só leitura. Agrega: funil (engajou → preço → agendou), objeções declaradas, falhas da clínica,
-- origem, por atendente e a lista de resgate (recuperáveis sem agendamento). O tempo de resposta
-- vem de leitura_conversas (regra fixa), não daqui.
create or replace function public.auditoria_comercial(p_client uuid, p_de date, p_ate date)
returns jsonb
language sql stable security definer set search_path to 'public'
as $function$
  with base as (
    select c.id, c.lead_id, c.ultima_msg_em, r.resumo j, r.gerado_em,
      coalesce(p.nome, 'Sem nome') as nome
    from conversas c
    join conversas_resumos r on r.conversa_id = c.id
    left join pessoas p on p.id = c.pessoa_id
    where c.client_id = p_client
      and (c.ultima_msg_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (public.is_app_admin() or public.is_client_member(p_client))
      and coalesce(r.resumo->>'etapa', '') <> 'nao_e_paciente'
  ),
  b as (select *, coalesce(nullif(j->>'atendente', ''), 'Sem atendente (robô/sem dono)') as at from base),
  por_at as (select at as nome, count(*) conversas,
      count(*) filter (where j->>'etapa' = 'agendou' or j->>'situacao' = 'agendou') agendou,
      count(*) filter (where (j->>'preco_apresentado')::boolean) preco,
      round(avg(nullif(j->'atendimento'->>'nota_0a10', '')::numeric), 1) nota
    from b group by at),
  falha_at as (select distinct on (at) at as nome, f as falha from b, jsonb_array_elements_text(coalesce(j->'falhas', '[]')) f
    group by at, f order by at, count(*) desc),
  melhorar_at as (select at as nome, string_agg(m, ' · ') texto from (
      select at, m, row_number() over (partition by at order by count(*) desc) rn
      from b, jsonb_array_elements_text(coalesce(j->'atendimento'->'pontos_a_melhorar', '[]')) m group by at, m) z
    where rn <= 3 group by at),
  total as (select count(*) n from conversas c where c.client_id = p_client
      and (c.ultima_msg_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
      and (public.is_app_admin() or public.is_client_member(p_client)))
  select jsonb_build_object(
    'conversas_periodo', (select n from total),
    'lidas', (select count(*) from base),
    'funil', jsonb_build_object(
      'engajou', (select count(*) from base where j->>'etapa' not in ('so_robo', 'sem_resposta_paciente')),
      'preco_pedido', (select count(*) from base where (j->>'preco_pedido')::boolean),
      'preco_apresentado', (select count(*) from base where (j->>'preco_apresentado')::boolean),
      'agendamento_em_curso', (select count(*) from base where j->>'etapa' in ('agendamento_em_curso', 'agendou')),
      'agendou', (select count(*) from base where j->>'etapa' = 'agendou' or j->>'situacao' = 'agendou')
    ),
    'objecoes', coalesce((select jsonb_object_agg(o, n) from (select o, count(*) n from base, jsonb_array_elements_text(coalesce(j->'objecoes', '[]')) o group by o) x), '{}'),
    'falhas', coalesce((select jsonb_object_agg(f, n) from (select f, count(*) n from base, jsonb_array_elements_text(coalesce(j->'falhas', '[]')) f group by f) x), '{}'),
    'origem', coalesce((select jsonb_object_agg(o, n) from (select coalesce(j->>'origem', 'desconhecida') o, count(*) n from base group by 1) x), '{}'),
    'nota_media', (select round(avg(nullif(j->'atendimento'->>'nota_0a10', '')::numeric), 1) from base),
    'por_atendente', coalesce((select jsonb_agg(jsonb_build_object('nome', a.nome, 'conversas', a.conversas, 'agendou', a.agendou,
        'preco_apresentado', a.preco, 'nota', a.nota, 'falha_mais_comum', f.falha, 'a_melhorar', m.texto) order by a.conversas desc)
      from por_at a left join falha_at f on f.nome = a.nome left join melhorar_at m on m.nome = a.nome), '[]'),
    'resgate', coalesce((select jsonb_agg(jsonb_build_object('conversa_id', id, 'nome', nome, 'interesse', j->>'interesse',
        'situacao', j->>'situacao', 'proximo_passo', j->>'proximo_passo', 'ultima_msg_em', ultima_msg_em) order by ultima_msg_em desc)
      from (select * from base where (j->>'recuperavel')::boolean and coalesce(j->>'etapa', '') <> 'agendou' order by ultima_msg_em desc limit 50) r), '[]'),
    'exemplos', coalesce((select jsonb_agg(jsonb_build_object('conversa_id', id, 'atendente', j->>'atendente', 'evidencia', j->>'evidencia', 'como_deveria', j->>'como_deveria', 'falhas', j->'falhas'))
      from (select * from base where nullif(j->>'evidencia', '') is not null and nullif(j->>'como_deveria', '') is not null
        and jsonb_array_length(coalesce(j->'falhas', '[]')) > 0 order by ultima_msg_em desc limit 8) e), '[]')
  );
$function$;

revoke all on function public.auditoria_comercial(uuid, date, date) from public, anon;
grant execute on function public.auditoria_comercial(uuid, date, date) to authenticated;
