-- Central operacional: canais oficiais, fila e envios manuais. Sem envio automático por IA.
create schema atendimento_operacional;
revoke all on schema atendimento_operacional from public,anon;
grant usage on schema atendimento_operacional to authenticated,service_role;
create unique index central_conversas_identity on public.conversas(client_id,id);
create unique index central_pessoas_identity on public.pessoas(client_id,id);
create table atendimento_operacional.canais (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
 canal text not null check(canal in ('instagram','whatsapp')), conta_externa text not null check(conta_externa ~ '^[0-9]{4,40}$'),
 nome text not null, credencial jsonb not null, ativo boolean not null default true,
 criado_por uuid not null references auth.users(id), criado_em timestamptz not null default now(),
 ultimo_evento_em timestamptz, unique(canal,conta_externa), unique(client_id,id)
);
create index central_canais_cliente on atendimento_operacional.canais(client_id);
create index central_canais_autor on atendimento_operacional.canais(criado_por);
create table atendimento_operacional.participantes (
 client_id uuid not null, canal_id uuid not null, identificador text not null check(identificador ~ '^[0-9]{4,40}$'),
 pessoa_id uuid not null, primary key(canal_id,identificador),
 foreign key(client_id,canal_id) references atendimento_operacional.canais(client_id,id),
 foreign key(client_id,pessoa_id) references public.pessoas(client_id,id)
);
create index central_participantes_pessoa on atendimento_operacional.participantes(client_id,pessoa_id);
create index central_participantes_canal on atendimento_operacional.participantes(client_id,canal_id);
create table atendimento_operacional.conversas (
 conversa_id uuid primary key, client_id uuid not null, canal_id uuid, destinatario text,
 estado text not null default 'aberta' check(estado in ('aberta','pendente','resolvida')),
 responsavel_id uuid references auth.users(id), versao integer not null default 0,
 resolvida_em timestamptz, atualizado_em timestamptz not null default now(),
 foreign key(client_id,conversa_id) references public.conversas(client_id,id),
 foreign key(client_id,canal_id) references atendimento_operacional.canais(client_id,id),
 unique(canal_id,destinatario)
);
create index central_conversas_cliente on atendimento_operacional.conversas(client_id,conversa_id);
create index central_conversas_canal on atendimento_operacional.conversas(client_id,canal_id);
create index central_conversas_responsavel on atendimento_operacional.conversas(responsavel_id);
create table atendimento_operacional.envios (
 id uuid primary key, client_id uuid not null, conversa_id uuid not null, canal_id uuid not null,
 texto text not null check(length(btrim(texto)) between 1 and 1000), autor uuid not null references auth.users(id),
 estado text not null default 'preparada' check(estado in ('preparada','enviando','aceita','incerta','falhou','confirmada_equipe','nao_enviada_equipe')),
 entrega text check(entrega in ('enviada','entregue','lida','falhou')), entrega_em timestamptz,
 mensagem_externa text, erro text, criado_em timestamptz not null default now(), tentativa_em timestamptz,
 foreign key(client_id,conversa_id) references public.conversas(client_id,id),
 foreign key(client_id,canal_id) references atendimento_operacional.canais(client_id,id)
);
create index central_envios_conversa on atendimento_operacional.envios(client_id,conversa_id,criado_em desc);
create index central_envios_canal on atendimento_operacional.envios(client_id,canal_id);
create index central_envios_autor on atendimento_operacional.envios(autor);
create unique index central_envios_externo on atendimento_operacional.envios(canal_id,mensagem_externa) where mensagem_externa is not null;
create table atendimento_operacional.eventos (
 id bigint generated always as identity primary key, client_id uuid not null references public.clients(id),
 conversa_id uuid, autor uuid, acao text not null, dados jsonb not null default '{}', em timestamptz not null default now()
);
create index central_eventos_cliente on atendimento_operacional.eventos(client_id,em desc);
do $$ declare t text; begin
 foreach t in array array['canais','participantes','conversas','envios','eventos'] loop
  execute format('alter table atendimento_operacional.%I enable row level security',t);
  execute format('revoke all on atendimento_operacional.%I from public,anon,authenticated',t);
  execute format('grant all on atendimento_operacional.%I to service_role',t);
  execute format('create policy central_service on atendimento_operacional.%I for all to service_role using (true) with check (true)',t);
 end loop;
end $$;
revoke all on all sequences in schema atendimento_operacional from public,anon,authenticated;
grant usage,select on all sequences in schema atendimento_operacional to service_role;

create function atendimento_operacional.executar(p_client uuid,p_acao text,p_dados jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); edita boolean; c public.conversas; s atendimento_operacional.conversas; e atendimento_operacional.envios;
 canal_reg atendimento_operacional.canais; resultado jsonb; pedido uuid; pessoa public.pessoas; card uuid; ultima_entrada timestamptz;
 offset_ integer:=greatest(0,least(coalesce((p_dados->>'offset')::integer,0),100000));
 busca text:=left(btrim(coalesce(p_dados->>'busca','')),100); estado_ text:=coalesce(p_dados->>'estado','todas');
 canal_ text:=coalesce(p_dados->>'canal','todos'); equipe_ text:=coalesce(p_dados->>'responsavel','todos'); alvo uuid;
begin
 if u is null or p_client is null or not (public.is_app_admin() or public.is_client_member(p_client)) or not public.tem_modulo(p_client,'hub') then
  raise exception 'Sem acesso à central desta clínica' using errcode='42501';
 end if;
 edita:=public.pode_editar_acoes(p_client);
 if pg_column_size(p_dados)>16000 then raise exception 'Solicitação muito grande'; end if;
 if p_acao='config' then
  return jsonb_build_object('pode_atender',edita,'usuario_id',u,'crm',public.crm_operacao(p_client,'config'),
   'canais',case when edita then (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'canal',x.canal,'nome',x.nome,'ativo',x.ativo,'ultimo_evento_em',x.ultimo_evento_em) order by x.criado_em),'[]') from atendimento_operacional.canais x where x.client_id=p_client) else '[]'::jsonb end,
   'equipe',case when edita then (select coalesce(jsonb_agg(jsonb_build_object('id',x.user_id,'nome',coalesce(nullif(public.sap_nome_usuario(x.user_id),''),'Pessoa da equipe'))),'[]') from (select user_id from public.client_members where client_id=p_client and role in ('owner','strategist') union select u where public.is_app_admin()) x) else '[]'::jsonb end);
 end if;
 if not edita then raise exception 'Seu acesso permite consultar indicadores; o atendimento requer permissão de operação' using errcode='42501'; end if;
 if p_acao='listar' then
  insert into public.acessos_conversas(user_id,client_id,acao) values(u,p_client,'central_listar');
  with base as materialized (
   select v.id,v.pessoa_id,coalesce(nullif(p.nome,''),'Contato sem nome') pessoa_nome,
    case when p.telefone is not null then '…'||right(regexp_replace(p.telefone,'\D','','g'),4) end telefone_final,
    coalesce(nullif(v.canal,''),'whatsapp') canal,v.provider,v.ultima_msg_em,
    left(m.texto,200) ultima_msg_texto,coalesce(m.direcao='entrada',false) sem_resposta,
    coalesce(t.estado,'aberta') estado,t.responsavel_id,coalesce(t.versao,0) versao,
    case when t.responsavel_id is not null then public.sap_nome_usuario(t.responsavel_id) end responsavel_nome,
    t.canal_id is not null oficial
   from public.conversas v left join public.pessoas p on p.id=v.pessoa_id and p.client_id=p_client
   left join atendimento_operacional.conversas t on t.conversa_id=v.id and t.client_id=p_client
   left join lateral (select texto,direcao from public.mensagens where conversa_id=v.id and client_id=p_client and direcao in ('entrada','saida') order by enviada_em desc,id desc limit 1) m on true
   where v.client_id=p_client and (v.canal in ('instagram','whatsapp') or v.provider in ('wts','flwchat','kommo','digisac','meta_whatsapp','meta_instagram'))
  ), filtradas as materialized (
   select * from base where (busca='' or position(lower(busca) in lower(pessoa_nome))>0)
    and (canal_='todos' or canal=canal_) and (estado_='todas' or estado=estado_ or (estado_='sem_resposta' and sem_resposta and estado<>'resolvida'))
    and (equipe_='todos' or (equipe_='minhas' and responsavel_id=u) or (equipe_='sem_responsavel' and responsavel_id is null))
  ) select jsonb_build_object('contadores',jsonb_build_object('total',(select count(*) from base),'abertas',(select count(*) from base where estado='aberta'),'sem_resposta',(select count(*) from base where sem_resposta and estado<>'resolvida'),'sem_responsavel',(select count(*) from base where responsavel_id is null and estado<>'resolvida'),'pendentes',(select count(*) from base where estado='pendente')),
   'total_filtradas',(select count(*) from filtradas),'conversas',(select coalesce(jsonb_agg(to_jsonb(x) order by x.ultima_msg_em desc nulls last,x.id),'[]') from (select * from filtradas order by ultima_msg_em desc nulls last,id limit 40 offset offset_) x)) into resultado;
  return resultado;
 end if;
 select * into c from public.conversas where id=(p_dados->>'conversa_id')::uuid and client_id=p_client;
 if not found then raise exception 'Conversa indisponível nesta clínica' using errcode='42501'; end if;
 if p_acao='mensagens' then
  insert into public.acessos_conversas(user_id,client_id,conversa_id,acao) values(u,p_client,c.id,'central_abrir');
  update atendimento_operacional.envios set estado='incerta',erro='Envio sem confirmação; confira no canal antes de repetir.' where client_id=p_client and conversa_id=c.id and estado='enviando' and tentativa_em<now()-interval '90 seconds';
  select * into s from atendimento_operacional.conversas where conversa_id=c.id and client_id=p_client;
  select * into canal_reg from atendimento_operacional.canais where id=s.canal_id and client_id=p_client and ativo;
  select max(enviada_em) into ultima_entrada from public.mensagens where conversa_id=c.id and client_id=p_client and direcao='entrada';
  select id into card from crm_operacional.cards where client_id=p_client and (conversa_id=c.id or (c.pessoa_id is not null and pessoa_id=c.pessoa_id)) order by atualizado_em desc limit 1;
  with pagina as (select m.* from public.mensagens m where m.conversa_id=c.id and m.client_id=p_client and (nullif(p_dados->>'antes','') is null or (m.enviada_em,m.id)<((p_dados->>'antes')::timestamptz,(p_dados->>'antes_id')::uuid)) order by enviada_em desc,id desc limit 101)
  select jsonb_build_object('conversa_id',c.id,'pessoa_id',c.pessoa_id,'card_id',card,'provider',c.provider,'canal',coalesce(c.canal,'whatsapp'),'oficial',canal_reg.id is not null,
   'estado',coalesce(s.estado,'aberta'),'versao',coalesce(s.versao,0),'responsavel_id',s.responsavel_id,
   'janela_aberta',coalesce(ultima_entrada>now()-interval '24 hours' and ultima_entrada<=now(),false),
   'mensagens',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'direcao',m.direcao,'autor',m.autor,'texto',m.texto,'tipo',m.tipo,'enviada_em',m.enviada_em,'entrega',(select entrega from atendimento_operacional.envios item where item.client_id=p_client and item.conversa_id=c.id and item.mensagem_externa=m.externo_id limit 1)) order by m.enviada_em,m.id),'[]') from (select * from pagina order by enviada_em desc,id desc limit 100) m),
   'tem_anteriores',(select count(*)>100 from pagina),
   'envios',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'estado',x.estado,'erro',x.erro,'texto',x.texto,'criado_em',x.criado_em) order by x.criado_em),'[]') from atendimento_operacional.envios x where x.client_id=p_client and x.conversa_id=c.id and x.estado in ('preparada','enviando','incerta','falhou')))
   into resultado;
  return resultado;
 end if;
 if p_acao='criar_card' then
  perform 1 from public.conversas where id=c.id and client_id=p_client for update;
  select * into pessoa from public.pessoas where id=c.pessoa_id and client_id=p_client for update;
  if not found then raise exception 'Esta conversa ainda não tem um contato associado'; end if;
  select id into card from crm_operacional.cards where client_id=p_client and (conversa_id=c.id or pessoa_id=pessoa.id) order by atualizado_em desc limit 1;
  if card is not null then return jsonb_build_object('id',card); end if;
  resultado:=public.crm_operacao(p_client,'criar',jsonb_build_object('id',gen_random_uuid(),'pessoa_id',pessoa.id,'conversa_id',c.id,'titulo',coalesce(pessoa.nome,'Contato'),'responsavel_id',u,'proxima_acao','Conferir o atendimento e definir o próximo passo'));
  return jsonb_build_object('id',resultado->>'id');
 end if;
 if p_acao='preparar_envio' then
  pedido:=(p_dados->>'pedido_id')::uuid;
  if pedido is null or length(btrim(coalesce(p_dados->>'texto',''))) not between 1 and 1000 then raise exception 'Confira o texto da resposta'; end if;
  perform 1 from public.conversas where id=c.id and client_id=p_client for update;
  select * into e from atendimento_operacional.envios where id=pedido;
  if found then
   if e.client_id<>p_client or e.conversa_id<>c.id or e.autor<>u or e.texto<>btrim(p_dados->>'texto') then raise exception 'Identificador de envio indisponível' using errcode='42501'; end if;
   return jsonb_build_object('id',e.id,'estado',e.estado);
  end if;
  select * into s from atendimento_operacional.conversas where conversa_id=c.id and client_id=p_client;
  select * into canal_reg from atendimento_operacional.canais where id=s.canal_id and client_id=p_client and ativo;
  if canal_reg.id is null then raise exception 'Esta conversa é de consulta. Conecte o canal oficial e receba uma mensagem para responder por aqui.'; end if;
  select max(enviada_em) into ultima_entrada from public.mensagens where client_id=p_client and conversa_id=c.id and direcao='entrada';
  if ultima_entrada is null or ultima_entrada<=now()-interval '24 hours' or ultima_entrada>now() then raise exception 'A janela para resposta de texto está encerrada. Não é possível iniciar uma conversa por este envio.'; end if;
  if exists(select 1 from atendimento_operacional.envios where client_id=p_client and conversa_id=c.id and estado in ('preparada','enviando','incerta')) then raise exception 'Há um envio aguardando confirmação. Confira o resultado antes de enviar outra mensagem.'; end if;
  insert into atendimento_operacional.envios(id,client_id,conversa_id,canal_id,texto,autor) values(pedido,p_client,c.id,canal_reg.id,btrim(p_dados->>'texto'),u);
  insert into atendimento_operacional.eventos(client_id,conversa_id,autor,acao,dados) values(p_client,c.id,u,'preparar_envio',jsonb_build_object('pedido_id',pedido));
  return jsonb_build_object('id',pedido,'estado','preparada');
 end if;
 if p_acao='conferir_envio' then
  select * into e from atendimento_operacional.envios where id=(p_dados->>'pedido_id')::uuid and client_id=p_client and conversa_id=c.id for update;
  if not found or e.estado<>'incerta' or length(btrim(coalesce(p_dados->>'observacao',''))) not between 10 and 500 or coalesce(p_dados->>'resultado','') not in ('confirmada_equipe','nao_enviada_equipe') then raise exception 'Confira o envio no canal e registre o resultado'; end if;
  update atendimento_operacional.envios set estado=p_dados->>'resultado',erro=null where id=e.id;
  if p_dados->>'resultado'='confirmada_equipe' then insert into public.mensagens(conversa_id,client_id,direcao,autor,texto,tipo,enviada_em,externo_id)
   values(c.id,p_client,'saida','Confirmação manual da equipe',e.texto,'envio_confirmado_manualmente',coalesce(e.tentativa_em,e.criado_em),'manual:'||e.id) on conflict(conversa_id,externo_id) do nothing; end if;
  insert into atendimento_operacional.eventos(client_id,conversa_id,autor,acao,dados) values(p_client,c.id,u,'conferir_envio',jsonb_build_object('pedido_id',e.id,'resultado',p_dados->>'resultado','observacao',p_dados->>'observacao'));
  return jsonb_build_object('ok',true);
 end if;
 if p_acao not in ('assumir','atribuir','estado') then raise exception 'Ação indisponível'; end if;
 insert into atendimento_operacional.conversas(conversa_id,client_id) values(c.id,p_client) on conflict do nothing;
 select * into s from atendimento_operacional.conversas where conversa_id=c.id and client_id=p_client for update;
 if s.versao is distinct from (p_dados->>'versao')::integer then raise exception 'A conversa foi atualizada por outra pessoa. Atualize a fila e tente novamente.' using errcode='40001'; end if;
 if p_acao in ('assumir','atribuir') then
  alvo:=case when p_acao='assumir' then u else nullif(p_dados->>'responsavel_id','')::uuid end;
  if alvo is not null and not exists(select 1 from public.client_members where client_id=p_client and user_id=alvo and role in ('owner','strategist')) and not (alvo=u and public.is_app_admin()) then raise exception 'Escolha uma pessoa da equipe desta clínica'; end if;
  update atendimento_operacional.conversas set responsavel_id=alvo,versao=versao+1,atualizado_em=now() where conversa_id=c.id;
 else
  if coalesce(p_dados->>'estado','') not in ('aberta','pendente','resolvida') then raise exception 'Estado de atendimento inválido'; end if;
  update atendimento_operacional.conversas set estado=p_dados->>'estado',resolvida_em=case when p_dados->>'estado'='resolvida' then now() end,versao=versao+1,atualizado_em=now() where conversa_id=c.id;
 end if;
 insert into atendimento_operacional.eventos(client_id,conversa_id,autor,acao,dados) values(p_client,c.id,u,p_acao,p_dados-'texto');
 return jsonb_build_object('ok',true);
end $$;
revoke all on function atendimento_operacional.executar(uuid,text,jsonb) from public,anon;
grant execute on function atendimento_operacional.executar(uuid,text,jsonb) to authenticated;
create function public.central_atendimento(p_client_id uuid,p_acao text,p_dados jsonb default '{}')
returns jsonb language sql volatile security invoker set search_path='' as $$ select atendimento_operacional.executar(p_client_id,p_acao,p_dados) $$;
revoke all on function public.central_atendimento(uuid,text,jsonb) from public,anon;
grant execute on function public.central_atendimento(uuid,text,jsonb) to authenticated;

-- A credencial nunca sai desta função para o navegador. O worker usa a chave de serviço.
create function public.central_atendimento_worker(p_acao text,p_dados jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 ch atendimento_operacional.canais; envio atendimento_operacional.envios; s atendimento_operacional.conversas;
 cliente uuid; ator uuid; pessoa uuid; conversa uuid; instante timestamptz; participante_ text;
 chave text; mid text; direcao_ text; novo integer; entrega_ text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso exclusivo do servidor' using errcode='42501'; end if;
 if pg_column_size(p_dados)>64000 then raise exception 'Evento muito grande'; end if;
 if p_acao in ('salvar_canal','ativar_canal','desconectar') then
  cliente:=(p_dados->>'client_id')::uuid; ator:=(p_dados->>'autor')::uuid;
  if ator is null or not public.tem_modulo(cliente,'hub') or not (
   exists(select 1 from public.app_admins where user_id=ator) or
   exists(select 1 from public.client_members where client_id=cliente and user_id=ator and role in ('owner','strategist'))
  ) then raise exception 'Sem permissão para configurar este canal' using errcode='42501'; end if;
  if p_acao='salvar_canal' then
   if p_dados->>'canal' not in ('instagram','whatsapp') or coalesce(p_dados->>'conta_externa','') !~ '^[0-9]{4,40}$'
    or jsonb_typeof(p_dados->'credencial')<>'object' then raise exception 'Configuração inválida'; end if;
   -- Uma conta externa não pode ser transferida para outra clínica por um novo token.
   perform pg_advisory_xact_lock(hashtextextended('central:'||(p_dados->>'canal')||':'||(p_dados->>'conta_externa'),0));
   select * into ch from atendimento_operacional.canais where canal=p_dados->>'canal' and conta_externa=p_dados->>'conta_externa' for update;
   if found and ch.client_id<>cliente then raise exception 'Esta conta já está vinculada a outra clínica'; end if;
   insert into atendimento_operacional.canais(client_id,canal,conta_externa,nome,credencial,criado_por,ativo)
    values(cliente,p_dados->>'canal',p_dados->>'conta_externa',left(p_dados->>'nome',120),p_dados->'credencial',ator,false)
    on conflict(canal,conta_externa) do update set nome=excluded.nome,credencial=excluded.credencial,ativo=false
    returning * into ch;
  else
   select * into ch from atendimento_operacional.canais where id=(p_dados->>'canal_id')::uuid and client_id=cliente for update;
   if not found then raise exception 'Canal indisponível'; end if;
   update atendimento_operacional.canais set ativo=(p_acao='ativar_canal'),
    credencial=case when p_acao='desconectar' then '{}'::jsonb else credencial end where id=ch.id;
  end if;
  insert into atendimento_operacional.eventos(client_id,autor,acao,dados) values(cliente,ator,p_acao,jsonb_build_object('canal_id',ch.id));
  return jsonb_build_object('id',ch.id);
 end if;
 if p_acao='receber' then
  select * into ch from atendimento_operacional.canais where ativo and canal=p_dados->>'canal' and conta_externa=p_dados->>'conta_externa' for update;
  if not found then return jsonb_build_object('ignorado',true); end if;
  instante:=(p_dados->>'em')::timestamptz; participante_:=p_dados->>'participante'; mid:=p_dados->>'mid'; direcao_:=p_dados->>'direcao';
  if instante is null or instante>now()+interval '5 minutes' or coalesce(participante_,'') !~ '^[0-9]{4,40}$' or length(coalesce(mid,'')) not between 1 and 500 or direcao_ not in ('entrada','saida') then raise exception 'Evento inválido'; end if;
  select pessoa_id into pessoa from atendimento_operacional.participantes where canal_id=ch.id and identificador=participante_;
  if pessoa is null then
   if ch.canal='whatsapp' then
    chave:=public.chave_telefone(participante_);
    if chave is not null then select id into pessoa from public.pessoas where client_id=ch.client_id and telefone_chave=chave; end if;
   end if;
   if pessoa is null then
    insert into public.pessoas(client_id,nome,telefone,telefone_chave,origem_primeira,primeiro_toque_em)
     values(ch.client_id,coalesce(nullif(left(btrim(p_dados->>'nome'),100),''),case when ch.canal='instagram' then 'Contato do Instagram' else 'Contato do WhatsApp' end),
      case when ch.canal='whatsapp' then participante_ end,chave,ch.canal,instante)
     on conflict(client_id,telefone_chave) do update set atualizado_em=public.pessoas.atualizado_em returning id into pessoa;
   end if;
   insert into atendimento_operacional.participantes(client_id,canal_id,identificador,pessoa_id) values(ch.client_id,ch.id,participante_,pessoa);
  end if;
  insert into public.conversas(client_id,pessoa_id,provider,canal,externo_id,iniciada_em,ultima_msg_em,mensagens_cobertura)
   values(ch.client_id,pessoa,'meta_'||ch.canal,ch.canal,ch.id||':'||participante_,instante,instante,'parcial')
   on conflict(client_id,provider,externo_id) do update set ultima_msg_em=greatest(public.conversas.ultima_msg_em,excluded.ultima_msg_em) returning id into conversa;
  insert into atendimento_operacional.conversas(conversa_id,client_id,canal_id,destinatario) values(conversa,ch.client_id,ch.id,participante_) on conflict(conversa_id) do nothing;
  insert into public.mensagens(conversa_id,client_id,direcao,autor,texto,tipo,enviada_em,externo_id)
   values(conversa,ch.client_id,direcao_,case when direcao_='entrada' then 'Contato' else 'Equipe pelo canal oficial' end,left(p_dados->>'texto',12000),left(p_dados->>'tipo',80),instante,mid)
   on conflict(conversa_id,externo_id) do nothing;
  get diagnostics novo=row_count;
  if novo=1 and direcao_='entrada' then
   update atendimento_operacional.conversas set estado='aberta',resolvida_em=null,versao=versao+1,atualizado_em=now()
    where conversa_id=conversa and estado='resolvida' and instante>resolvida_em;
  end if;
  update atendimento_operacional.canais set ultimo_evento_em=greatest(ultimo_evento_em,instante) where id=ch.id;
  return jsonb_build_object('ok',true,'nova',novo=1);
 end if;
 if p_acao='recibo' then
  select * into ch from atendimento_operacional.canais where ativo and canal=p_dados->>'canal' and conta_externa=p_dados->>'conta_externa';
  if not found then return jsonb_build_object('ignorado',true); end if;
  entrega_:=p_dados->>'entrega'; instante:=(p_dados->>'em')::timestamptz;
  if entrega_ not in ('enviada','entregue','lida','falhou') or instante is null or instante>now()+interval '5 minutes' then raise exception 'Recibo inválido'; end if;
  select * into envio from atendimento_operacional.envios where canal_id=ch.id and
   (mensagem_externa=p_dados->>'mid' or (id::text=p_dados->>'pedido_id' and estado in ('enviando','incerta') and mensagem_externa is null)) for update;
  if not found then return jsonb_build_object('ignorado',true); end if;
  if envio.entrega='lida' or (envio.entrega='entregue' and entrega_ in ('enviada','falhou')) or (envio.entrega_em is not null and instante<envio.entrega_em) then return jsonb_build_object('ignorado',true); end if;
  update atendimento_operacional.envios set entrega=entrega_,entrega_em=instante,
   estado=case when entrega_='falhou' then 'falhou' else 'aceita' end,mensagem_externa=coalesce(mensagem_externa,p_dados->>'mid'),
   erro=case when entrega_='falhou' then 'O canal informou falha na entrega. Confira no aplicativo oficial.' end where id=envio.id;
  if entrega_<>'falhou' then
   insert into public.mensagens(conversa_id,client_id,direcao,autor,texto,tipo,enviada_em,externo_id)
    values(envio.conversa_id,envio.client_id,'saida','Equipe pela central',envio.texto,'text',coalesce(envio.tentativa_em,envio.criado_em),p_dados->>'mid') on conflict(conversa_id,externo_id) do nothing;
   update public.conversas set ultima_msg_em=greatest(ultima_msg_em,coalesce(envio.tentativa_em,envio.criado_em)) where id=envio.conversa_id;
  end if;
  return jsonb_build_object('ok',true);
 end if;
 if p_acao='reivindicar_envio' then
  select * into envio from atendimento_operacional.envios where id=(p_dados->>'pedido_id')::uuid and client_id=(p_dados->>'client_id')::uuid and autor=(p_dados->>'autor')::uuid for update;
  if not found then raise exception 'Envio indisponível'; end if;
  if envio.estado<>'preparada' then return jsonb_build_object('estado',envio.estado); end if;
  select * into ch from atendimento_operacional.canais where id=envio.canal_id and client_id=envio.client_id and ativo;
  select * into s from atendimento_operacional.conversas where conversa_id=envio.conversa_id and client_id=envio.client_id;
  if ch.id is null or not exists(select 1 from public.mensagens where conversa_id=envio.conversa_id and client_id=envio.client_id and direcao='entrada' and enviada_em>now()-interval '24 hours' and enviada_em<=now()) then
   update atendimento_operacional.envios set estado='falhou',erro='Canal desconectado ou janela de resposta encerrada.' where id=envio.id;
   return jsonb_build_object('estado','falhou');
  end if;
  update atendimento_operacional.envios set estado='enviando',tentativa_em=now() where id=envio.id;
  return jsonb_build_object('estado','enviando','canal',ch.canal,'conta_externa',ch.conta_externa,'client_id',ch.client_id,'credencial',ch.credencial,'destinatario',s.destinatario,'texto',envio.texto);
 end if;
 if p_acao='concluir_envio' then
  select * into envio from atendimento_operacional.envios where id=(p_dados->>'pedido_id')::uuid for update;
  if not found then raise exception 'Envio indisponível'; end if;
  -- Um recibo pode chegar antes da resposta HTTP. Nunca rebaixe a confirmação.
  if envio.estado not in ('enviando','incerta') then return jsonb_build_object('estado',envio.estado); end if;
  if p_dados->>'estado' not in ('aceita','incerta','falhou') then raise exception 'Resultado inválido'; end if;
  if p_dados->>'estado'='aceita' and length(coalesce(p_dados->>'mid','')) not between 1 and 500 then raise exception 'Falta confirmação do provedor'; end if;
  update atendimento_operacional.envios set estado=p_dados->>'estado',mensagem_externa=p_dados->>'mid',erro=left(p_dados->>'erro',300) where id=envio.id;
  if p_dados->>'estado'='aceita' then
   insert into public.mensagens(conversa_id,client_id,direcao,autor,texto,tipo,enviada_em,externo_id)
    values(envio.conversa_id,envio.client_id,'saida','Equipe pela central',envio.texto,'text',envio.tentativa_em,p_dados->>'mid') on conflict(conversa_id,externo_id) do nothing;
   update public.conversas set ultima_msg_em=greatest(ultima_msg_em,envio.tentativa_em) where id=envio.conversa_id;
  end if;
  return jsonb_build_object('estado',p_dados->>'estado');
 end if;
 raise exception 'Ação do servidor indisponível';
end $$;
revoke all on function public.central_atendimento_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.central_atendimento_worker(text,jsonb) to service_role;
