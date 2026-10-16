-- Atendimento por atendente: "null" ou "undefined" vindos da IA contam como "Sem assinatura" (nunca aparece "null").
create or replace function public.sap_atendimento_por_atendente(p_client_id uuid, p_de date, p_ate date)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
  with base as (
    select
      coalesce(nullif(case when lower(trim(r.resumo->>'atendente')) in ('null', 'undefined') then '' else trim(r.resumo->>'atendente') end, ''), 'Sem assinatura') as atendente,
      r.resumo
    from conversas c
    join conversas_resumos r on r.conversa_id = c.id
    where public.is_app_admin()
      and c.client_id = p_client_id
      and c.ultima_msg_em >= p_de::timestamptz and c.ultima_msg_em < (p_ate + 1)::timestamptz
      and coalesce(r.resumo->>'etapa', '') not in ('so_robo', 'nao_e_paciente')
  ),
  falhas as (
    select atendente, f, count(*) n,
      row_number() over (partition by atendente order by count(*) desc, f) rk
    from base, jsonb_array_elements_text(coalesce(resumo->'falhas', '[]'::jsonb)) f
    group by atendente, f
  )
  select coalesce(jsonb_agg(x order by (x->>'conversas')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'atendente', b.atendente,
      'conversas', count(*),
      'nota_media', round(avg((b.resumo->'atendimento'->>'nota_0a10')::numeric) filter (where (b.resumo->'atendimento'->>'nota_0a10') ~ '^\d+(\.\d+)?$'), 1),
      'agendou', count(*) filter (where b.resumo->>'situacao' = 'agendou'),
      'recuperaveis', count(*) filter (where (b.resumo->>'recuperavel')::boolean is true and b.resumo->>'situacao' <> 'agendou'),
      'falhas', coalesce((select jsonb_agg(jsonb_build_object('falha', f.f, 'n', f.n) order by f.rk) from falhas f where f.atendente = b.atendente and f.rk <= 3), '[]'::jsonb)
    ) as x
    from base b group by b.atendente
  ) t;
$function$;
