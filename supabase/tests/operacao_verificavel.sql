-- Integração real em banco de TESTE. Tudo é fictício e a transação é desfeita.
-- Exercer RLS como authenticated/anon e funções como service_role, sem chamar provedores.
begin;
create temporary table resultado_operacao(caso text);
do $teste$
declare
  ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid(); dono uuid:=gen_random_uuid(); outro uuid:=gen_random_uuid();
  viewer uuid:=gen_random_uuid(); adm uuid:=gen_random_uuid(); cc uuid:=gen_random_uuid(); lead uuid:=gen_random_uuid();
  conv uuid:=gen_random_uuid(); convb uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid();
  msg uuid:=gen_random_uuid(); entrada uuid:=gen_random_uuid(); tarefa uuid; cid uuid:=gen_random_uuid();
  ex uuid:=gen_random_uuid(); ap uuid:=gen_random_uuid(); negado boolean; n integer; j jsonb; antes integer;
begin
  insert into auth.users(id,email,role,aud,raw_user_meta_data) values
    (dono,dono||'@example.invalid','authenticated','authenticated','{"name":"Teste dono"}'),
    (outro,outro||'@example.invalid','authenticated','authenticated','{}'),
    (viewer,viewer||'@example.invalid','authenticated','authenticated','{}'),
    (adm,adm||'@example.invalid','authenticated','authenticated','{}');
  insert into public.clients(id,name,active) values(ca,'TESTE OPERACIONAL A',false),(cb,'TESTE OPERACIONAL B',false);
  insert into public.client_members(client_id,user_id,role) values(ca,dono,'owner'),(ca,viewer,'viewer'),(cb,outro,'owner');
  insert into public.app_admins(user_id) values(adm);
  insert into public.cliente_modulos(client_id,modulo,status) values(ca,'hub','beta'),(cb,'hub','beta'),(ca,'sap','beta');
  insert into public.crm_connections(id,client_id,provider,active) values(cc,ca,'kommo',true);
  insert into public.crm_leads(id,crm_connection_id,client_id,provider,external_lead_id,event_type,status_id,pipeline_id,raw_payload,outcome,occurred_at)
    values(lead,cc,ca,'kommo','123456789','add','10','1','{}','open',now()-interval '5 days');
  insert into public.conversas(id,client_id,lead_id,provider,externo_id,mensagens_cobertura,mensagens_conferidas_em,mensagens_conferencia_em)
    values(conv,ca,lead,'wts','TESTE_A','completa',now(),now()),(convb,cb,null,'wts','TESTE_B','completa',now(),now());
  insert into public.sync_status(client_id,fonte,last_success_at,last_attempt_at,data_ate)
    values(ca,'crm',now(),now(),current_date);
  insert into public.sugestoes_agentes(id,client_id,agente,tipo,titulo,conversa_id,criado_em)
    values(s,ca,'recuperacao','interesse','TESTE oportunidade',conv,now()-interval '2 hours'),
      (sb,cb,'recuperacao','interesse','TESTE outra clínica',convb,now()-interval '2 hours');

  perform set_config('request.jwt.claims',jsonb_build_object('sub',dono,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  tarefa:=public.operacao_iniciar(s,now()+interval '1 day');
  assert tarefa=public.operacao_iniciar(s,now()+interval '1 day'),'Retry criou outro trabalho';
  assert (select count(*) from public.operacao_recuperacao where id=tarefa)=1,'Dono não lê seu caso';
  negado:=false; begin perform public.operacao_iniciar(sb,now()+interval '1 day'); exception when others then negado:=true; end;
  assert negado,'Dono criou caso de outra clínica';
  negado:=false; begin update public.operacao_recuperacao set estado='resolvida' where id=tarefa; exception when insufficient_privilege then negado:=true; end;
  assert negado,'Escrita direta de resultado permitida';
  negado:=false; begin perform public.sugestao_decidir(s,'feita','agendou'); exception when others then negado:=true; end;
  assert negado,'RPC legada falsificou agendamento';
  negado:=false; begin perform public.sugestao_decidir(s,'feita',null); exception when others then negado:=true; end;
  assert negado,'RPC legada marcou recuperação feita sem evidência';
  execute 'reset role';
  insert into resultado_operacao values('Idempotência, editor, isolamento de escrita e resultado não falsificável');

  perform set_config('request.jwt.claims',jsonb_build_object('sub',outro,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  assert (select count(*) from public.operacao_recuperacao)=0,'RLS vazou outra clínica';
  negado:=false; begin perform public.operacao_mensagens(tarefa); exception when others then negado:=true; end;
  assert negado,'Leitura de mensagens entre clínicas permitida';
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  assert (select count(*) from public.operacao_recuperacao where id=tarefa)=1,'Viewer perdeu leitura autorizada';
  negado:=false; begin perform public.operacao_verificar(ca); exception when others then negado:=true; end;
  assert negado,'Viewer executou ações';
  execute 'reset role';
  execute 'set local role anon';
  negado:=false; begin perform * from public.operacao_recuperacao; exception when insufficient_privilege then negado:=true; end;
  assert negado,'Anon leu fila privada';
  execute 'reset role';
  delete from public.cliente_modulos where client_id=cb and modulo='hub';
  insert into public.cliente_modulos(client_id,modulo,status) values(cb,'sap','beta');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outro,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  assert not public.tem_modulo(cb,'hub') and public.tem_modulo(cb,'sap'),'SAP concedeu acesso implícito ao Nexo';
  negado:=false; begin perform public.operacao_iniciar(sb,now()+interval '1 day'); exception when others then negado:=true; end;
  assert negado,'Contrato SAP executou piloto exclusivo Nexo';
  execute 'reset role';
  insert into resultado_operacao values('RLS entre clínicas, viewer e anon; contratos SAP e Nexo separados');

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  update public.operacao_recuperacao set aprovado_em=now()-interval '1 hour' where id=tarefa;
  update public.conversas set mensagens_cobertura='parcial' where id=conv;
  perform public.operacao_verificar(ca);
  assert (select estado='bloqueada' from public.operacao_recuperacao where id=tarefa),'Sessões recentes esconderam coleta incompleta';
  update public.conversas set mensagens_cobertura='completa',mensagens_conferidas_em=now()-interval '2 days' where id=conv;
  perform public.operacao_verificar(ca);
  assert (select estado='bloqueada' from public.operacao_recuperacao where id=tarefa),'Conversa vencida permitiu continuidade';
  update public.conversas set mensagens_conferidas_em=now() where id=conv;
  perform public.operacao_verificar(ca);
  assert (select estado='pronta' from public.operacao_recuperacao where id=tarefa),'Coleta reparada não liberou o caso';
  insert into resultado_operacao values('Cobertura real por conversa, vencimento e reparação');

  insert into public.mensagens(id,conversa_id,client_id,direcao,tipo,externo_id,texto,enviada_em)
    values(msg,conv,ca,'saida','texto','TESTE_SAIDA','Contato fictício',now()-interval '30 minutes');
  perform public.operacao_verificar(ca);
  assert (select estado='escalada' and mensagem_id is null from public.operacao_recuperacao where id=tarefa),'Qualquer saída contou como ação do agente';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',dono,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  negado:=false; begin perform public.operacao_vincular_mensagem(tarefa,gen_random_uuid()); exception when others then negado:=true; end;
  assert negado,'Referência inexistente foi aceita';
  perform public.operacao_vincular_mensagem(tarefa,msg);
  perform public.operacao_vincular_mensagem(tarefa,msg);
  assert (select mensagem_id=msg and estado='aguardando_resposta' from public.operacao_recuperacao where id=tarefa),'Contato vinculado não iniciou observação';
  perform public.operacao_mensagens(tarefa);
  execute 'reset role';
  assert exists(select 1 from public.acessos_conversas where user_id=dono and conversa_id=conv and acao='operacao_revisar'),'Leitura sem auditoria';
  assert (select count(*) from public.operacao_historico where trabalho_id=tarefa and acao='contato_vinculado')=1,'Retry duplicou vínculo';
  insert into resultado_operacao values('Intervenção da equipe, vínculo explícito, auditoria e retry');

  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  insert into public.mensagens(id,conversa_id,client_id,direcao,tipo,externo_id,texto,enviada_em)
    values(entrada,conv,ca,'entrada','texto','TESTE_RESPOSTA','Resposta fictícia',now()-interval '20 minutes');
  perform public.operacao_verificar(ca);
  assert (select estado='resolvida' and observacao->'resposta'->>'id'=entrada::text from public.operacao_recuperacao where id=tarefa),'Resposta não interrompeu cadência';
  insert into public.crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,pipeline_para,status_para,ocorreu_em)
    values(ca,cc,'123456789','ganhou','1','99',now()-interval '15 minutes');
  update public.sugestoes_agentes set estado='feita',resultado='agendou',medido_em=now()-interval '1 hour' where id=s;
  perform public.sugestoes_medir();
  assert (select estado='proposta' and medicao->'legado'->>'resultado'='agendou' from public.sugestoes_agentes where id=s),'Feito automático legado não foi arquivado para revisão';
  assert (select resultado='fechou' and not medicao->'eventos_crm' @> '[{"tipo":"agendado"}]' from public.sugestoes_agentes where id=s),'Ganho virou agendamento';
  insert into public.sap_etapa_marco(crm_connection_id,pipeline_id,status_id,marco) values(cc,'1','20','agendado');
  insert into public.crm_lead_eventos(client_id,crm_connection_id,external_lead_id,tipo,pipeline_para,status_para,ocorreu_em)
    values(ca,cc,'123456789','mudou_etapa','1','20',now()-interval '10 minutes');
  perform public.operacao_verificar(ca);
  assert (select observacao->'eventos_crm' @> '[{"tipo":"agendado"}]' from public.operacao_recuperacao where id=tarefa),'Parou de observar agendamento após resposta';
  insert into resultado_operacao values('Resposta interrompe contato; ganho é venda; etapa explícita comprova agendamento');

  -- Resposta entre detecção e aprovação: o caso não pode voltar à fila de contato.
  delete from public.operacao_recuperacao where id=tarefa;
  update public.mensagens set enviada_em=now()-interval '40 minutes' where id=entrada;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',dono,'role','authenticated')::text,true);
  tarefa:=public.operacao_iniciar(s,now()+interval '1 day');
  assert (select estado='resolvida' from public.operacao_recuperacao where id=tarefa),'Resposta anterior à aprovação foi ignorada';
  insert into resultado_operacao values('Revalidação desde a detecção evita contato depois do avanço');

  -- SAP: tarefas nativas, prazo em feriado, evidência e revogação.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',adm,'role','authenticated')::text,true);
  insert into public.sap_clinicas(id,client_id,nome,d0,status,clickup_folder_id)
    values(cid,ca,'TESTE SAP','2026-10-05','onboarding','FOLDER_TESTE');
  j:=public.operacao_sap_conferir(cid);
  perform public.operacao_sap_conferir(cid);
  assert (select count(*) from public.sap_acoes where clinica_id=cid and codigo like 'agente_acesso_%')=9,'SAP duplicou tarefas';
  assert (select bool_and(prazo='2026-10-09'::date) from public.sap_acoes where clinica_id=cid),'Prazo não respeitou feriado';
  assert (j->>'pendentes')::integer=9,'SAP completou acessos ausentes';
  insert into public.sap_acessos(clinica_id,item,status,confirmado_em,confirmado_por,observacao,atualizado_em)
    select cid,item,'confirmado',current_date,'Pessoa fictícia','Conferido',now()-interval '2 hours' from public.operacao_acessos_catalogo();
  j:=public.operacao_sap_conferir(cid);
  assert (j->>'pendentes')::integer=0,'SAP não resolveu acessos com evidência';
  update public.sap_acessos set status='nao_se_aplica',observacao=null where clinica_id=cid and item='A5';
  j:=public.operacao_sap_conferir(cid);
  assert (j->>'pendentes')::integer=1,'Dispensa sem justificativa aceita';
  update public.sap_acessos set status='confirmado',observacao='Testado' where clinica_id=cid and item='A5';
  perform public.sap_vincular_marco(cid,'TASK_TESTE');
  update public.sap_marco_vinculos set atualizado_em=now()-interval '2 hours' where clinica_id=cid;
  insert into public.agente_execucoes(id,client_id,agente,fluxo,objetivo,estado,passo_atual,contexto)
    values(ex,ca,'operations','acessos_criticos','TESTE','rodando',7,jsonb_build_object('clinica_id',cid,'rodada_marco',1,'aprovacao_marco',ap,
      'clickup_confirmado',jsonb_build_object('task_id','TASK_TESTE','folder_id','FOLDER_TESTE','status','closed','em',now())));
  insert into public.aprovacoes(id,execucao_id,client_id,passo,risco,resumo,proposta,estado,decidido_por,criado_em)
    values(ap,ex,ca,'aprovar_marco','medio','TESTE',jsonb_build_object('marco',5,'rodada',1,'evidencia','Evidência fictícia validada'),'aprovada',adm,now()-interval '1 hour');
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  negado:=false; begin perform public.agentes_marcar_marco(ap,cid,6,'Evidência fictícia validada'); exception when others then negado:=true; end;
  assert negado,'Aprovação aplicada em outro marco';
  negado:=false; begin perform public.agentes_marcar_marco(ap,gen_random_uuid(),5,'Evidência fictícia validada'); exception when others then negado:=true; end;
  assert negado,'Aprovação aplicada em outra clínica';
  update public.agente_execucoes set estado='cancelada' where id=ex;
  negado:=false; begin perform public.agentes_marcar_marco(ap,cid,5,'Evidência fictícia validada'); exception when others then negado:=true; end;
  assert negado,'Execução cancelada concluiu o marco';
  update public.agente_execucoes set estado='rodando' where id=ex;
  update public.sap_acessos set revogado_em=current_date where clinica_id=cid and item='A1';
  negado:=false; begin perform public.agentes_marcar_marco(ap,cid,5,'Evidência fictícia validada'); exception when others then negado:=true; end;
  assert negado,'Revogação após aprovação permitiu conclusão';
  update public.sap_acessos set revogado_em=null where clinica_id=cid and item='A1';
  perform public.agentes_marcar_marco(ap,cid,5,'Evidência fictícia validada');
  perform public.agentes_marcar_marco(ap,cid,5,'Evidência fictícia validada');
  assert (select count(*) from public.sap_tarefa_historico where clinica_id=cid and marco=5 and acao='feito')=1,'Retry duplicou conclusão SAP';
  update public.sap_marco_status set concluido_em=null where clinica_id=cid and marco=5;
  negado:=false; begin perform public.agentes_marcar_marco(ap,cid,5,'Evidência fictícia validada'); exception when others then negado:=true; end;
  assert negado,'Aprovação consumida declarou vigente um marco desfeito';
  update public.sap_marco_status set concluido_em=current_date where clinica_id=cid and marco=5;
  update public.sap_acessos set revogado_em=current_date where clinica_id=cid and item='A1';
  j:=public.operacao_sap_conferir(cid);
  assert (select concluido_em is null from public.sap_marco_status where clinica_id=cid and marco=5),'Acesso revogado não reabriu marco';
  assert (select status='aberta' from public.sap_acoes where clinica_id=cid and codigo='agente_acesso_A1'),'Acesso revogado não reabriu tarefa';
  insert into resultado_operacao values('SAP idempotente, prazo com feriado, evidência, escopo e revogação');
end;
$teste$;
select caso as teste_aprovado from resultado_operacao;
rollback;
