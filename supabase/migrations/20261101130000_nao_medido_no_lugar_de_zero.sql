-- Pacientes do período: "não medido" no lugar de zero (diagnóstico de medição, PR 4).
--   1. engajaram_instagram: só vale quando a fonte das conversas traz comentário e reação do Instagram (hoje só a
--      Clint traz). Na Dra. Lana Torres (Kommo) a tela mostrava 0 em outubro com 1.081 comentários nos posts; no
--      Dr. Sergio Maia (WTS Chat, só WhatsApp) também 0. Agora: valor null, com o motivo e os comentários do período.
--   2. Período antes do início das conversas: Dra. Marcella Brasil (conversas desde 01/10) e Dra. Samira (desde
--      17/09) mostravam 0 em "Mandaram mensagem" e "Pacientes antigos" de 01 a 15/09. Agora: valor null, com a data
--      em que as conversas começam. Quando o período começa antes e termina depois, o número continua e ganha
--      'cobertura_desde' (a tela avisa que conta só a partir dessa data).
--   3. Período antes do primeiro registro do CRM: os números que vêm só do CRM ficam null com a data, em vez de 0.
-- Como: um bloco no fim da função, que só mexe no jsonb já montado. Não depende dos trechos que as migrações
-- 20261031160000, 20261031162000 e 20261031170000 trocam, e essas continuam aplicáveis depois desta.
-- Segurança: a função continua security definer com a mesma checagem de acesso no começo; grants não mudam.
-- Reversão: rodar o bloco abaixo com o replace invertido (tirar o trecho entre os marcadores
--   "-- [nao-medido] início" e "-- [nao-medido] fim" e as variáveis v_conv_desde, v_crm_desde, v_k, v_ig e v_motivo),
--   ou recriar pacientes_periodo pelas migrações 20261031150000 + 20261031160000 (+ 162000 e 170000, se aplicadas).

do $migra$
declare
  d text := pg_get_functiondef('public.pacientes_periodo(uuid,date,date)'::regprocedure);
  a1 text := E'  v jsonb;\nbegin\n';
  n1 text := E'  v jsonb;\n  v_conv_desde date;\n  v_crm_desde date;\n  v_k text;\n  v_ig bigint;\n  v_motivo text;\nbegin\n';
  a2 text := E'  return v;\nend;';
  n2 text := $n$  -- [nao-medido] início: zero só quando a fonte mede; senão null com o motivo (20261101130000).
  if coalesce((v->>'tem_conversas')::boolean, false) then
    -- Início das conversas: o índice (client_id, ultima_msg_em) responde rápido; iniciada_em só é lida quando
    -- o período começa antes da primeira última mensagem.
    select (min(cv.ultima_msg_em) at time zone 'America/Sao_Paulo')::date into v_conv_desde
      from conversas cv where cv.client_id = p_client;
    if v_conv_desde is not null and p_de < v_conv_desde then
      select (min(coalesce(cv.iniciada_em, cv.ultima_msg_em)) at time zone 'America/Sao_Paulo')::date into v_conv_desde
        from conversas cv where cv.client_id = p_client;
    end if;
    if v_conv_desde is not null and p_ate < v_conv_desde then
      v_motivo := format('As conversas da clínica só chegam ao Nexo desde %s. Antes disso, não dá para contar.',
                         to_char(v_conv_desde, 'DD/MM/YYYY'));
      foreach v_k in array array['mandaram_mensagem', 'engajaram_instagram', 'antigos'] loop
        if jsonb_typeof(v #> array['numeros', v_k, 'valor']) = 'number' then
          v := jsonb_set(v, array['numeros', v_k], jsonb_build_object('valor', null, 'fonte', v #>> array['numeros', v_k, 'fonte'],
                 'motivo_sem_dado', v_motivo, 'responsavel', null, 'medido_desde', v_conv_desde));
        end if;
      end loop;
    elsif v_conv_desde is not null and p_de < v_conv_desde then
      foreach v_k in array array['mandaram_mensagem', 'engajaram_instagram', 'antigos'] loop
        if jsonb_typeof(v #> array['numeros', v_k, 'valor']) = 'number' then
          v := jsonb_set(v, array['numeros', v_k, 'cobertura_desde'], to_jsonb(v_conv_desde));
        end if;
      end loop;
    end if;
    -- Comentário e reação só chegam quando a fonte traz (Clint). Zero com fonte que não traz é "não medido".
    if (v #>> '{numeros,engajaram_instagram,valor}') = '0'
       and not exists (select 1 from mensagens m join conversas cv on cv.id = m.conversa_id
                        where m.client_id = p_client and cv.client_id = p_client and cv.canal = 'instagram'
                          and m.direcao = 'entrada' and public.mensagem_eh_interacao(m.tipo)) then
      select count(*) into v_ig from instagram_comments ic
       where ic.client_id = p_client and ic.commented_at >= v_ini and ic.commented_at < v_fim;
      v := jsonb_set(v, '{numeros,engajaram_instagram}', jsonb_build_object('valor', null, 'fonte', 'conversas',
             'motivo_sem_dado', 'As conversas ligadas ao Nexo não trazem comentários nem reações do Instagram.'
               || case when v_ig > 0 then format(' No período, os posts tiveram %s comentários, mas sem ligar cada pessoa a uma conversa.', v_ig) else '' end,
             'responsavel', 'equipe_hub', 'comentarios_instagram', v_ig));
    end if;
  end if;
  if coalesce((v->>'tem_crm')::boolean, false) then
    select (min(cl.occurred_at) at time zone 'America/Sao_Paulo')::date into v_crm_desde
      from crm_leads cl join crm_connections cc on cc.id = cl.crm_connection_id and cc.active
     where cl.client_id = p_client and cl.removido_na_origem is null;
    if v_crm_desde is not null and p_ate < v_crm_desde then
      v_motivo := format('O CRM da clínica só tem registros desde %s. Antes disso, não dá para contar.',
                         to_char(v_crm_desde, 'DD/MM/YYYY'));
      foreach v_k in array array['leads_novos', 'abordados', 'compareceram', 'fecharam', 'agendaram', 'negociacao'] loop
        continue when v_k = 'fecharam' and (v #>> '{numeros,fecharam,fonte}') is distinct from 'crm';
        -- Agendaram e negociação também leem a conversa: só ficam sem dado se a conversa também não cobre o período.
        continue when v_k in ('agendaram', 'negociacao') and coalesce((v->>'tem_conversas')::boolean, false)
                      and (v_conv_desde is null or p_ate >= v_conv_desde);
        if jsonb_typeof(v #> array['numeros', v_k, 'valor']) = 'number' then
          v := jsonb_set(v, array['numeros', v_k], jsonb_build_object('valor', null, 'fonte', v #>> array['numeros', v_k, 'fonte'],
                 'motivo_sem_dado', v_motivo, 'responsavel', null, 'medido_desde', v_crm_desde));
        end if;
      end loop;
    end if;
  end if;
  -- [nao-medido] fim
  return v;
end;$n$;
begin
  if position('[nao-medido] início' in d) > 0 then return; end if;
  if position(a1 in d) = 0 or position(a2 in d) = 0 then
    raise exception 'pacientes_periodo: trechos "v jsonb; begin" ou "return v; end;" não encontrados; a função mudou e esta migração precisa ser revista';
  end if;
  execute replace(replace(d, a1, n1), a2, n2);
end
$migra$;
