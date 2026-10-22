
-- Operação nativa: não reescreve pessoas, leads importados, mensagens ou resultados financeiros.
create schema if not exists crm_operacional;
revoke all on schema crm_operacional from public, anon, authenticated;
grant usage on schema crm_operacional to authenticated, service_role;
create table if not exists crm_operacional.pilotos (
 client_id uuid primary key references public.clients(id) on delete cascade,
 ativo boolean not null default false
);
create table if not exists crm_operacional.cards (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 pessoa_id uuid references public.pessoas(id) on delete set null,
 conversa_id uuid references public.conversas(id) on delete set null,
 titulo text not null check (length(btrim(titulo)) between 1 and 160),
 origem text not null default 'Não identificada' check(length(origem)<=160),
 etapa text not null default 'novo' check(etapa in ('novo','atendimento','interesse','agendamento','agendado','encerrado')),
 responsavel text not null default '' check(length(responsavel)<=100),
 responsavel_id uuid references auth.users(id) on delete set null,
 proxima_acao text not null default '' check(length(proxima_acao)<=500),
 prazo timestamptz,
 versao integer not null default 1,
 criado_em timestamptz not null default clock_timestamp(),
 atualizado_em timestamptz not null default now()
);
-- Idempotente também na homologação que recebeu a primeira versão deste PR ainda não publicado.
alter table crm_operacional.cards add column if not exists responsavel_id uuid references auth.users(id) on delete set null;
create index if not exists crm_operacional_cards_rotina on crm_operacional.cards(client_id,responsavel_id,prazo) where etapa not in ('agendado','encerrado');
create unique index if not exists crm_operacional_conversa_unica on crm_operacional.cards(client_id,conversa_id) where conversa_id is not null;
create index if not exists crm_operacional_cards_lista on crm_operacional.cards(client_id,atualizado_em desc,id);
create index if not exists crm_operacional_cards_pessoa on crm_operacional.cards(pessoa_id);
create table if not exists crm_operacional.eventos (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 card_id uuid not null references crm_operacional.cards(id) on delete cascade,
 autor uuid not null,
 acao text not null,
 origem text not null check(origem in ('manual','ia_aprovada')),
 motivo text not null,
 antes jsonb,
 depois jsonb not null,
 criado_em timestamptz not null default clock_timestamp()
);
create index if not exists crm_operacional_eventos_card on crm_operacional.eventos(card_id,criado_em desc);
create table if not exists crm_operacional.sugestoes (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 card_id uuid not null references crm_operacional.cards(id) on delete cascade,
 etapa text not null check(etapa in ('atendimento','interesse','agendamento')),
 versao integer not null,
 ate_msg_em timestamptz not null,
 motivo text not null,
 evidencia text not null,
 criado_por uuid not null,
 revisado_por uuid,
 revisado_em timestamptz,
 estado text not null default 'pendente' check(estado in ('pendente','aprovada','recusada')),
 criado_em timestamptz not null default clock_timestamp()
);
create index if not exists crm_operacional_sugestoes_card on crm_operacional.sugestoes(card_id,criado_em desc);
alter table crm_operacional.pilotos enable row level security;
alter table crm_operacional.cards enable row level security;
alter table crm_operacional.eventos enable row level security;
alter table crm_operacional.sugestoes enable row level security;
revoke all on all tables in schema crm_operacional from public,anon,authenticated;
grant all on all tables in schema crm_operacional to service_role;

-- Única entrada de escrita: valida clínica, papel, vínculos e versão antes de registrar a alteração e o histórico juntos.
create or replace function crm_operacional.executar(p_client uuid,p_acao text,p_dados jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user uuid := auth.uid();
 v_edita boolean;
 v_card crm_operacional.cards%rowtype;
 v_antes jsonb;
 v_pessoa public.pessoas%rowtype;
 v_conv public.conversas%rowtype;
 v_res public.conversas_resumos%rowtype;
 v_sug crm_operacional.sugestoes%rowtype;
 v_evento crm_operacional.eventos%rowtype;
 v_etapa text;
 v_motivo text;
 v_evidencia text;
 v_id uuid;
 v_origem text := 'manual';
 v_q text := left(btrim(coalesce(p_dados->>'busca','')),100);
 v_offset integer := greatest(0,least(coalesce((p_dados->>'offset')::integer,0),1000000));
 v_rotina text := coalesce(p_dados->>'rotina','todas');
 v_responsavel text := coalesce(p_dados->>'filtro_responsavel','todos');
 v_filtro_etapa text := coalesce(p_dados->>'filtro_etapa','todas');
 v_responsavel_id uuid;
 v_responsavel_nome text;
 v_fim timestamptz := (date_trunc('day',now() at time zone 'America/Sao_Paulo')+interval '1 day') at time zone 'America/Sao_Paulo';
 v_limit integer := 12;
 v_result jsonb;
begin
 if v_user is null or p_client is null or not (public.is_app_admin() or public.is_client_member(p_client)) then
  raise exception 'Sem acesso a esta clínica' using errcode='42501';
 end if;
 v_edita := public.is_app_admin() or exists(select 1 from public.client_members m where m.client_id=p_client and m.user_id=v_user and m.role in ('owner','strategist'));
 if p_acao='config' then
  return jsonb_build_object('ativo',exists(select 1 from crm_operacional.pilotos where client_id=p_client and ativo),'pode_editar',v_edita,'usuario_id',v_user,
   'equipe',case when exists(select 1 from crm_operacional.pilotos where client_id=p_client and ativo) then
    (select coalesce(jsonb_agg(jsonb_build_object('id',x.user_id,'nome',left(coalesce(nullif(public.sap_nome_usuario(x.user_id),''),'Pessoa da equipe'),100)) order by public.sap_nome_usuario(x.user_id),x.user_id),'[]'::jsonb)
     from (select user_id from public.client_members where client_id=p_client and role in ('owner','strategist')
      union select v_user where public.is_app_admin()) x)
    else '[]'::jsonb end);
 end if;
 if not exists(select 1 from crm_operacional.pilotos where client_id=p_client and ativo) then
  raise exception 'Kanban ainda não liberado para esta clínica' using errcode='42501';
 end if;
 if p_acao='listar' then
  if v_rotina not in ('todas','hoje','atrasadas','sem_acao') or
   v_filtro_etapa not in ('todas','novo','atendimento','interesse','agendamento','agendado','encerrado') then raise exception 'Filtro inválido'; end if;
  if v_responsavel not in ('todos','meus','sem') then v_responsavel_id:=v_responsavel::uuid; end if;
  with filtrados as materialized (
   select c.* from crm_operacional.cards c where c.client_id=p_client
    and (v_q='' or c.titulo ilike '%'||v_q||'%' or c.responsavel ilike '%'||v_q||'%')
    and (v_filtro_etapa='todas' or c.etapa=v_filtro_etapa)
    and (v_responsavel='todos' or (v_responsavel='meus' and c.responsavel_id=v_user) or (v_responsavel='sem' and c.responsavel_id is null) or c.responsavel_id=v_responsavel_id)
    and (v_rotina='todas' or (c.etapa not in ('agendado','encerrado') and (
     (v_rotina='hoje' and c.prazo<v_fim) or (v_rotina='atrasadas' and c.prazo<now()) or (v_rotina='sem_acao' and (c.proxima_acao='' or c.prazo is null))
    )))
  ), numerados as (
   select f.*,row_number() over(partition by etapa order by prazo asc nulls last,atualizado_em desc,id) rn from filtrados f
  ), pagina as (
   select n.* from numerados n where n.rn>greatest(0,least(coalesce((p_dados->'paginas'->>n.etapa)::integer,0),1000000))
    and n.rn<=greatest(0,least(coalesce((p_dados->'paginas'->>n.etapa)::integer,0),1000000))+v_limit
  )
  select jsonb_build_object(
   'total',(select count(*) from crm_operacional.cards where client_id=p_client),
   'atrasadas',(select count(*) from crm_operacional.cards where client_id=p_client and etapa not in ('agendado','encerrado') and prazo<now()),
   'hoje',(select count(*) from crm_operacional.cards where client_id=p_client and etapa not in ('agendado','encerrado') and prazo<v_fim),
   'sem_acao',(select count(*) from crm_operacional.cards where client_id=p_client and etapa not in ('agendado','encerrado') and (proxima_acao='' or prazo is null)),
   'agendados',(select count(*) from crm_operacional.cards where client_id=p_client and etapa='agendado'),
   'entrada_total',(select count(*) from public.pessoas p where p.client_id=p_client
    and exists(select 1 from public.conversas c where c.client_id=p_client and c.pessoa_id=p.id)
    and not exists(select 1 from crm_operacional.cards c where c.client_id=p_client and c.pessoa_id=p.id)),
   'por_etapa',(select coalesce(jsonb_object_agg(etapa,n),'{}'::jsonb) from (select etapa,count(*) n from filtrados group by etapa) x),
   'filtradas',(select count(*) from filtrados),
   'limite_coluna',v_limit,
   'cards',(select coalesce(jsonb_agg(to_jsonb(c)-'rn' order by c.etapa,c.rn),'[]'::jsonb) from pagina c)
  ) into v_result;
  return v_result;
 end if;
 if p_acao='entrada' then
  with disponiveis as materialized (
   select p.id,p.nome,case when p.telefone is not null then '…'||right(regexp_replace(p.telefone,'\D','','g'),4) end telefone_final,
    coalesce(nullif(p.origem_primeira,''),'Não identificada') origem,c.id conversa_id,c.ultima_msg_em
   from public.pessoas p join lateral (
    select id,ultima_msg_em from public.conversas where client_id=p_client and pessoa_id=p.id order by ultima_msg_em desc nulls last,id limit 1
   ) c on true
   where p.client_id=p_client and (v_q='' or coalesce(p.nome,'') ilike '%'||v_q||'%')
    and not exists(select 1 from crm_operacional.cards k where k.client_id=p_client and k.pessoa_id=p.id)
  )
  select jsonb_build_object('total',(select count(*) from disponiveis),
   'contatos',(select coalesce(jsonb_agg(to_jsonb(x) order by x.ultima_msg_em desc nulls last,x.id),'[]'::jsonb)
    from (select * from disponiveis order by ultima_msg_em desc nulls last,id limit 20 offset v_offset) x))
   into v_result;
  return v_result;
 end if;
 if p_acao='contatos' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_result from (
   select p.id,p.nome,case when p.telefone is not null then '…'||right(regexp_replace(p.telefone,'\D','','g'),4) end telefone_final,
     coalesce(nullif(p.origem_primeira,''),'Não identificada') origem,
     c.id conversa_id,c.ultima_msg_em
   from public.pessoas p left join lateral (
    select id,ultima_msg_em from public.conversas c where c.client_id=p_client and c.pessoa_id=p.id
    order by ultima_msg_em desc nulls last,id limit 1
   ) c on true
   where p.client_id=p_client and (v_q='' or coalesce(p.nome,'') ilike '%'||v_q||'%')
   order by p.atualizado_em desc,p.id limit 20 offset v_offset
  ) x;
  return v_result;
 end if;
 if p_acao='criar' then
  if not v_edita then raise exception 'Seu acesso é somente leitura' using errcode='42501'; end if;
  v_id := (p_dados->>'id')::uuid;
  if v_id is null then raise exception 'Informe o identificador do cartão'; end if;
  if nullif(p_dados->>'pessoa_id','') is not null then
   select * into v_pessoa from public.pessoas where id=(p_dados->>'pessoa_id')::uuid and client_id=p_client;
   if not found then raise exception 'Contato não encontrado nesta clínica'; end if;
  end if;
  if nullif(p_dados->>'conversa_id','') is not null then
   select * into v_conv from public.conversas where id=(p_dados->>'conversa_id')::uuid and client_id=p_client;
   if not found or v_pessoa.id is null or v_conv.pessoa_id is distinct from v_pessoa.id then raise exception 'Conversa não pertence a este contato'; end if;
  end if;
  v_responsavel_id:=nullif(p_dados->>'responsavel_id','')::uuid;
  if v_responsavel_id is not null then
   if not exists(select 1 from public.client_members where client_id=p_client and user_id=v_responsavel_id and role in ('owner','strategist')) and not (v_responsavel_id=v_user and public.is_app_admin()) then raise exception 'Escolha um responsável da equipe desta clínica'; end if;
   v_responsavel_nome:=left(coalesce(nullif(public.sap_nome_usuario(v_responsavel_id),''),'Pessoa da equipe'),100);
  elsif nullif(btrim(p_dados->>'responsavel'),'') is not null then raise exception 'Escolha um responsável da equipe desta clínica'; end if;
  insert into crm_operacional.cards(id,client_id,pessoa_id,conversa_id,titulo,origem,responsavel,responsavel_id,proxima_acao,prazo)
  values(v_id,p_client,v_pessoa.id,v_conv.id,coalesce(nullif(btrim(v_pessoa.nome),''),btrim(p_dados->>'titulo')),
   coalesce(nullif(v_pessoa.origem_primeira,''),nullif(btrim(p_dados->>'origem'),''),'Não identificada'),
   coalesce(v_responsavel_nome,''),v_responsavel_id,coalesce(btrim(p_dados->>'proxima_acao'),''),nullif(p_dados->>'prazo','')::timestamptz)
  on conflict(id) do nothing returning * into v_card;
  if not found then
   select * into v_card from crm_operacional.cards where id=v_id and client_id=p_client;
   if not found then raise exception 'Identificador indisponível'; end if;
   return to_jsonb(v_card);
  end if;
  insert into crm_operacional.eventos(client_id,card_id,autor,acao,origem,motivo,depois)
  values(p_client,v_card.id,v_user,'criar','manual','Cartão criado',to_jsonb(v_card));
  return to_jsonb(v_card);
 end if;
 select * into v_card from crm_operacional.cards where id=(p_dados->>'id')::uuid and client_id=p_client for update;
 if not found then raise exception 'Cartão não encontrado nesta clínica' using errcode='42501'; end if;
 if p_acao='detalhe' then
  select * into v_conv from public.conversas where id=v_card.conversa_id and client_id=p_client;
  return jsonb_build_object('card',to_jsonb(v_card),
   'ia_disponivel',coalesce(v_conv.id is not null and v_conv.mensagens_cobertura='completa' and v_conv.provider<>'kommo',false),
   'ia_motivo',case when v_card.conversa_id is null then 'Esta oportunidade não tem conversa vinculada.' when v_conv.provider='kommo' then 'Esta fonte não entrega o texto completo da clínica.' when v_conv.mensagens_cobertura is distinct from 'completa' then 'A importação da conversa ainda precisa ser conferida pela equipe.' else null end,
   'historico',(select coalesce(jsonb_agg(to_jsonb(e) order by e.criado_em desc,e.id),'[]'::jsonb) from (select * from crm_operacional.eventos where card_id=v_card.id and client_id=p_client order by criado_em desc,id limit 50) e),
   'sugestoes',(select coalesce(jsonb_agg(to_jsonb(s) order by s.criado_em desc,s.id),'[]'::jsonb) from (select * from crm_operacional.sugestoes where card_id=v_card.id and client_id=p_client order by criado_em desc,id limit 10) s));
 end if;
 if not v_edita then raise exception 'Seu acesso é somente leitura' using errcode='42501'; end if;
 if (p_dados->>'versao')::integer is distinct from v_card.versao then raise exception 'O cartão mudou. Atualize antes de salvar.' using errcode='40001'; end if;
 v_antes := to_jsonb(v_card);
 if p_acao='sugerir' then
  if v_card.conversa_id is null then raise exception 'Vincule uma conversa antes de pedir a leitura por IA'; end if;
  select * into v_conv from public.conversas where id=v_card.conversa_id and client_id=p_client;
  select * into v_res from public.conversas_resumos where conversa_id=v_conv.id and client_id=p_client;
  if not found or v_res.ate_msg_em is null or v_conv.ultima_msg_em is distinct from v_res.ate_msg_em then
   raise exception 'A leitura por IA está ausente ou desatualizada. Atualize a conversa.';
  end if;
  if v_conv.mensagens_cobertura is distinct from 'completa' or v_conv.provider='kommo' then raise exception 'Conversa incompleta: revise antes de sugerir uma etapa'; end if;
  if v_res.resumo->>'comercial' is distinct from 'true' or nullif(btrim(v_res.resumo->>'alerta'),'') is not null then
   return jsonb_build_object('aviso','Esta conversa precisa de revisão humana; nenhuma etapa foi sugerida.');
  end if;
  v_etapa := case v_res.resumo->>'etapa' when 'engajou' then 'atendimento' when 'qualificacao' then 'interesse' when 'preco_apresentado' then 'interesse' when 'agendamento_em_curso' then 'agendamento' when 'agendou' then 'agendamento' end;
  if v_etapa is null or v_card.etapa in ('agendado','encerrado') or
   array_position(array['novo','atendimento','interesse','agendamento'],v_etapa)<=array_position(array['novo','atendimento','interesse','agendamento'],v_card.etapa) then
   return jsonb_build_object('aviso','A leitura não justifica avançar este cartão. Confira a conversa.');
  end if;
  v_evidencia:=btrim(v_res.resumo->>'evidencia');
  if v_evidencia is null or length(v_evidencia)<8 or length(v_evidencia)>500 or
   v_evidencia ~ '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]+' or v_evidencia ~ '[0-9]{8,}' or
   not exists(select 1 from public.mensagens m where m.conversa_id=v_conv.id and m.client_id=p_client and m.direcao in ('entrada','saida')
    and strpos(lower(regexp_replace(coalesce(m.texto,''),'\s+',' ','g')),lower(regexp_replace(v_evidencia,'\s+',' ','g')))>0) then
   return jsonb_build_object('aviso','A evidência não pôde ser conferida. Revise a conversa manualmente.');
  end if;
  update crm_operacional.sugestoes set estado='recusada',revisado_por=v_user,revisado_em=clock_timestamp() where card_id=v_card.id and estado='pendente';
  insert into crm_operacional.sugestoes(client_id,card_id,etapa,versao,ate_msg_em,motivo,evidencia,criado_por)
  values(p_client,v_card.id,v_etapa,v_card.versao,v_res.ate_msg_em,
   case v_etapa when 'atendimento' then 'A IA identificou interação com a clínica.' when 'interesse' then 'A IA identificou interesse comercial.' else 'A IA identificou conversa sobre agendamento. Confirme o horário antes de marcar como agendado.' end,v_evidencia,v_user);
  return jsonb_build_object('aviso','Sugestão preparada para revisão. O cartão permanece na etapa atual.');
 elsif p_acao='recusar' then
  update crm_operacional.sugestoes set estado='recusada',revisado_por=v_user,revisado_em=clock_timestamp() where id=(p_dados->>'sugestao_id')::uuid and card_id=v_card.id and estado='pendente';
  if not found then raise exception 'Sugestão indisponível'; end if;
  return jsonb_build_object('ok',true);
 elsif p_acao='aprovar' then
  select * into v_sug from crm_operacional.sugestoes where id=(p_dados->>'sugestao_id')::uuid and card_id=v_card.id and client_id=p_client for update;
  if not found or v_sug.estado<>'pendente' or v_sug.versao<>v_card.versao or v_sug.criado_em<now()-interval '24 hours' then raise exception 'Sugestão vencida. Gere uma nova leitura.'; end if;
  select * into v_conv from public.conversas where id=v_card.conversa_id and client_id=p_client;
  if v_conv.ultima_msg_em is distinct from v_sug.ate_msg_em or v_conv.mensagens_cobertura is distinct from 'completa' then raise exception 'Chegou mensagem nova ou a cobertura mudou. Revise novamente.'; end if;
  v_card.etapa:=v_sug.etapa; v_motivo:=v_sug.motivo; v_origem:='ia_aprovada';
  update crm_operacional.sugestoes set estado='aprovada',revisado_por=v_user,revisado_em=clock_timestamp() where id=v_sug.id;
 elsif p_acao='mover' then
  v_etapa:=p_dados->>'etapa';
  if v_etapa is null or v_etapa not in ('novo','atendimento','interesse','agendamento','agendado','encerrado') then raise exception 'Etapa inválida'; end if;
  v_motivo:=btrim(p_dados->>'motivo');
  if v_motivo is null or length(v_motivo)<8 or length(v_motivo)>500 then raise exception 'Explique a mudança em pelo menos 8 caracteres'; end if;
  if v_etapa='agendado' and coalesce((p_dados->>'horario_confirmado')::boolean,false)=false then raise exception 'Confirme que o horário foi combinado com a pessoa'; end if;
  if v_etapa=v_card.etapa then return to_jsonb(v_card); end if;
  v_card.etapa:=v_etapa;
 elsif p_acao='salvar' then
  if p_dados ? 'responsavel_id' then
   v_responsavel_id:=nullif(p_dados->>'responsavel_id','')::uuid;
   if v_responsavel_id is not null and v_responsavel_id is distinct from v_card.responsavel_id then
    if not exists(select 1 from public.client_members where client_id=p_client and user_id=v_responsavel_id and role in ('owner','strategist')) and not (v_responsavel_id=v_user and public.is_app_admin()) then raise exception 'Escolha um responsável da equipe desta clínica'; end if;
   end if;
   v_card.responsavel_id:=v_responsavel_id;
   v_card.responsavel:=case when v_responsavel_id is null then '' else left(coalesce(nullif(public.sap_nome_usuario(v_responsavel_id),''),'Pessoa da equipe'),100) end;
  elsif nullif(btrim(p_dados->>'responsavel'),'') is not null then raise exception 'Escolha um responsável da equipe desta clínica';
  end if;
  v_card.proxima_acao:=coalesce(btrim(p_dados->>'proxima_acao'),'');
  v_card.prazo:=nullif(p_dados->>'prazo','')::timestamptz;
  v_motivo:='Responsável e próxima ação atualizados';
 elsif p_acao='desfazer' then
  select * into v_evento from crm_operacional.eventos where id=(p_dados->>'evento_id')::uuid and card_id=v_card.id and client_id=p_client;
  if not found or v_evento.acao not in ('mover','aprovar') or (v_evento.depois->>'versao')::integer<>v_card.versao then raise exception 'Só é possível desfazer a última movimentação sem alterações posteriores'; end if;
  v_card.etapa:=v_evento.antes->>'etapa';
  v_motivo:='Movimentação desfeita pela equipe';
 else raise exception 'Ação inválida'; end if;
 update crm_operacional.cards set etapa=v_card.etapa,responsavel=v_card.responsavel,responsavel_id=v_card.responsavel_id,proxima_acao=v_card.proxima_acao,prazo=v_card.prazo,
  versao=versao+1,atualizado_em=clock_timestamp() where id=v_card.id returning * into v_card;
 insert into crm_operacional.eventos(client_id,card_id,autor,acao,origem,motivo,antes,depois)
 values(p_client,v_card.id,v_user,p_acao,v_origem,v_motivo,v_antes,to_jsonb(v_card));
 return to_jsonb(v_card);
end; $$;
revoke all on function crm_operacional.executar(uuid,text,jsonb) from public,anon;
grant execute on function crm_operacional.executar(uuid,text,jsonb) to authenticated;

create or replace function public.crm_operacao(p_client uuid,p_acao text,p_dados jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select crm_operacional.executar(p_client,p_acao,p_dados)
$$;
revoke all on function public.crm_operacao(uuid,text,jsonb) from public,anon;
grant execute on function public.crm_operacao(uuid,text,jsonb) to authenticated;
