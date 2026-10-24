import {test,expect,type BrowserContext} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {CID,mockAccount} from './fixtures';
const UID='33333333-3333-4333-8333-333333333333',CONV='77777777-7777-4777-8777-777777777777',CARD='88888888-8888-4888-8888-888888888888';
async function setup(context:BrowserContext,options:{official?:boolean;viewer?:boolean;uncertain?:boolean;empty?:boolean}={}){
 await mockAccount(context,options.viewer?'viewer':'admin');
 const state={official:options.official!==false,estado:'aberta',versao:0,responsavel:null as string|null,card:null as string|null,send:0,uncertain:options.uncertain===true,viewed:0,writes:[] as string[],messages:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',direcao:'entrada',autor:'Contato',texto:'Olá! Esta é uma mensagem fictícia para QA.',tipo:'text',enviada_em:new Date().toISOString(),entrega:null as string|null}],envios:options.uncertain?[{id:'99999999-9999-4999-8999-999999999999',estado:'incerta',texto:'Resposta fictícia sem confirmação',erro:'Timeout fictício',criado_em:new Date().toISOString()}]:[] as any[]};
 const equipe=[{id:UID,nome:'Equipe QA'}];
 await context.route('**/rest/v1/rpc/central_cancelar_preparado',r=>{const b=r.request().postDataJSON();expect(b.p_client_id).toBe(CID);expect(b.p_pedido_id).toBe(state.envios[0].id);expect(b.p_observacao.trim().length).toBeGreaterThanOrEqual(10);state.envios=[];return r.fulfill({json:{ok:true}});});
 await context.route('**/rest/v1/rpc/central_atendimento',async r=>{
  const b=r.request().postDataJSON(),d=b.p_dados;expect(b.p_client_id).toBe(CID);
  const reply=(json:unknown)=>r.fulfill({json});
  if(b.p_acao==='config')return reply({pode_atender:!options.viewer,usuario_id:UID,equipe,crm:{ativo:true,pode_editar:true},canais:state.official?[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',canal:'whatsapp',nome:'Canal fictício',ativo:true,ultimo_evento_em:new Date().toISOString()}]:[]});
  expect(options.viewer).not.toBe(true);
  if(b.p_acao==='listar'){
   const match=!options.empty&&(!d.busca||'Contato fictício QA'.toLowerCase().includes(d.busca.toLowerCase()))&&['todos','whatsapp'].includes(d.canal)&&(d.estado==='todas'||d.estado===state.estado||d.estado==='sem_resposta'&&state.messages.at(-1)?.direcao==='entrada'&&state.estado!=='resolvida')&&(d.responsavel!=='minhas'||state.responsavel===UID)&&(d.responsavel!=='sem_responsavel'||!state.responsavel);
   return reply({contadores:{total:options.empty?0:1,abertas:state.estado==='aberta'?1:0,sem_resposta:state.messages.at(-1)?.direcao==='entrada'&&state.estado!=='resolvida'?1:0,sem_responsavel:state.responsavel?0:1,pendentes:state.estado==='pendente'?1:0},total_filtradas:match?1:0,conversas:match?[{id:CONV,pessoa_id:'66666666-6666-4666-8666-666666666666',pessoa_nome:'Contato fictício QA',telefone_final:'…0000',canal:'whatsapp',provider:state.official?'meta_whatsapp':'flwchat',ultima_msg_em:state.messages.at(-1)?.enviada_em,ultima_msg_texto:state.messages.at(-1)?.texto,sem_resposta:state.messages.at(-1)?.direcao==='entrada',estado:state.estado,responsavel_id:state.responsavel,responsavel_nome:state.responsavel?'Equipe QA':null,versao:state.versao,oficial:state.official}]:[]});
  }
  expect(d.conversa_id).toBe(CONV);
  if(b.p_acao==='mensagens'){state.viewed++;return reply({conversa_id:CONV,pessoa_id:'66666666-6666-4666-8666-666666666666',card_id:state.card,provider:state.official?'meta_whatsapp':'flwchat',canal:'whatsapp',oficial:state.official,estado:state.estado,versao:state.versao,responsavel_id:state.responsavel,janela_aberta:true,mensagens:state.messages,tem_anteriores:false,envios:state.envios});}
  state.writes.push(b.p_acao);
  if(b.p_acao==='criar_card'){state.card=CARD;return reply({id:CARD});}
  if(b.p_acao==='conferir_envio'){expect(d.observacao.length).toBeGreaterThanOrEqual(10);state.envios=[];return reply({ok:true});}
  expect(d.versao).toBe(state.versao);state.versao++;
  if(b.p_acao==='assumir')state.responsavel=UID;else if(b.p_acao==='atribuir')state.responsavel=d.responsavel_id;else if(b.p_acao==='estado')state.estado=d.estado;else throw new Error('Unexpected central action '+b.p_acao);
  return reply({ok:true});
 });
 await context.route('**/api/atendimento/canais**',r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{configurada:false,webhook:'https://dash.doctorcreator.com.br/api/atendimento/meta-webhook'}});
  const b=r.request().postDataJSON();expect(b.acao).toBe('enviar');expect(b.client_id).toBe(CID);expect(b.conversa_id).toBe(CONV);expect(b.pedido_id).toMatch(/^[a-f0-9-]{36}$/);
  state.send++;state.messages.push({id:crypto.randomUUID(),direcao:'saida',autor:'Equipe',texto:b.texto,tipo:'text',enviada_em:new Date().toISOString(),entrega:null});return r.fulfill({json:{ok:true,estado:'aceita'}});
 });
 await context.route('**/rest/v1/rpc/crm_operacao',r=>{
  const b=r.request().postDataJSON();
  const card={id:CARD,client_id:CID,pessoa_id:'66666666-6666-4666-8666-666666666666',conversa_id:CONV,titulo:'Contato fictício QA',origem:'whatsapp',etapa:'novo',responsavel:'Equipe QA',responsavel_id:UID,proxima_acao:'Conferir atendimento',prazo:null,versao:1,atualizado_em:new Date().toISOString()};
  if(b.p_acao==='config')return r.fulfill({json:{ativo:true,pode_editar:true,usuario_id:UID,equipe}});
  if(b.p_acao==='listar')return r.fulfill({json:{total:state.card?1:0,filtradas:0,hoje:0,atrasadas:0,sem_acao:0,por_etapa:{},cards:[]}});
  if(b.p_acao==='detalhe'){expect(b.p_dados.id).toBe(CARD);return r.fulfill({json:{card,ia_disponivel:false,ia_motivo:'Histórico parcial',historico:[],sugestoes:[]}});}
  return r.fulfill({json:[]});
 });
 return state;
}
for(const width of [1440,375])test(`Central: assign, reply, resolve, reload and open CRM at ${width}px`,async({page,context})=>{
 const state=await setup(context);await page.setViewportSize({width,height:1000});
 await page.goto(`/${CID}/central-atendimento`);
 await expect(page.getByRole('heading',{name:'Central de atendimento',exact:true})).toBeVisible();
 await expect(page.getByRole('combobox',{name:'Período',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Canais e conexão',exact:true}).click();await expect(page.getByRole('heading',{name:'Ativação oficial pendente'})).toBeVisible();
 await page.getByRole('button',{name:/Contato fictício QA/}).click();
 await expect(page.getByRole('region',{name:'Mensagens da conversa'}).getByText('Olá! Esta é uma mensagem fictícia para QA.',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Assumir conversa',exact:true}).click();await expect(page.getByRole('combobox',{name:'Responsável pela conversa',exact:true})).toHaveValue(UID);
 await page.getByLabel('Resposta para o contato',{exact:true}).fill('Resposta fictícia de QA, não enviar a pacientes.');
 await page.getByRole('button',{name:'Enviar resposta',exact:true}).click();await expect(page.getByText('Resposta aceita pelo canal. A entrega depende da confirmação do provedor.',{exact:true})).toBeVisible();expect(state.send).toBe(1);
 await expect(page.getByRole('region',{name:'Mensagens da conversa'}).getByText('Resposta fictícia de QA, não enviar a pacientes.',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Situação da conversa',exact:true}).selectOption('resolvida');await expect(page.getByRole('combobox',{name:'Situação da conversa',exact:true})).toHaveValue('resolvida');
 await page.getByRole('button',{name:'Acompanhar este contato no CRM',exact:true}).click();await expect(page.getByRole('link',{name:'Abrir oportunidade no CRM'})).toBeVisible();
 const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>['critical','serious'].includes(v.impact??''))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/central-${width}.png`,fullPage:true});
 await page.reload();await page.getByRole('combobox',{name:'Situação',exact:true}).selectOption('todas');await page.getByRole('button',{name:/Contato fictício QA/}).click();await expect(page.getByRole('combobox',{name:'Situação da conversa',exact:true})).toHaveValue('resolvida');
 await page.getByRole('link',{name:'Abrir oportunidade no CRM'}).click();await expect(page).toHaveURL(new RegExp(`crm-contatos\\?.*card=${CARD}`));await expect(page.getByRole('dialog',{name:'Contato fictício QA',exact:true})).toBeVisible();
 expect(state.writes).toEqual(['assumir','estado','criar_card']);
});
test('Imported history stays read-only and uncertain sends require an explicit review',async({page,context})=>{
 const state=await setup(context,{official:false});await page.goto(`/${CID}/central-atendimento`);await page.getByRole('button',{name:/Contato fictício QA/}).click();
 await expect(page.getByText('Consulta de histórico',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Enviar resposta',exact:true})).toHaveCount(0);expect(state.send).toBe(0);
 state.official=true;state.envios=[{id:'99999999-9999-4999-8999-999999999999',estado:'incerta',texto:'Resposta sem confirmação',erro:'Timeout',criado_em:new Date().toISOString()}];
 await page.reload();await page.getByRole('button',{name:/Contato fictício QA/}).click();await page.getByLabel('Resposta para o contato',{exact:true}).fill('Não duplicar');await expect(page.getByRole('button',{name:'Enviar resposta',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Registrar conferência no aplicativo',exact:true}).click();await expect(page.getByRole('button',{name:'Conferi: não foi enviada',exact:true})).toBeDisabled();
 await page.getByLabel('Como você conferiu o envio?',{exact:true}).fill('Conferido no aplicativo fictício, sem mensagem enviada.');await page.getByRole('button',{name:'Conferi: não foi enviada',exact:true}).click();await expect(page.getByRole('button',{name:'Enviar resposta',exact:true})).toBeEnabled();expect(state.send).toBe(0);
});
test('Viewers cannot open patient histories or see the operational navigation',async({page,context})=>{
 const state=await setup(context,{viewer:true});await page.goto(`/${CID}/central-atendimento`);await expect(page.getByRole('heading',{name:'Acesso de consulta',exact:true})).toBeVisible();expect(state.viewed).toBe(0);await expect(page.getByRole('link',{name:'Central de atendimento',exact:true})).toHaveCount(0);
});
test('An operator can discard an abandoned prepared answer without sending it',async({page,context})=>{
 const state=await setup(context);state.envios=[{id:'99999999-9999-4999-8999-999999999999',estado:'preparada',texto:'Resposta fictícia abandonada',erro:null,criado_em:new Date().toISOString()}];
 await page.goto(`/${CID}/central-atendimento`);await page.getByRole('button',{name:/Contato fictício QA/}).click();await page.getByLabel('Resposta para o contato',{exact:true}).fill('Nova resposta da equipe');await expect(page.getByRole('button',{name:'Enviar resposta',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Descartar resposta preparada',exact:true}).click();await expect(page.getByRole('button',{name:'Confirmar descarte sem envio',exact:true})).toBeDisabled();await page.getByLabel('Motivo para descartar a resposta',{exact:true}).fill('Resposta fictícia abandonada, conferida pela equipe.');await page.getByRole('button',{name:'Confirmar descarte sem envio',exact:true}).click();await expect(page.getByText('Resposta preparada descartada. Nenhuma mensagem foi enviada.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Enviar resposta',exact:true})).toBeEnabled();expect(state.send).toBe(0);
});
test('Empty and unavailable queues never invent successful connections or zero counts',async({page,context})=>{
 await setup(context,{empty:true});await page.goto(`/${CID}/central-atendimento`);await expect(page.getByText('Nenhuma conversa com estes filtros.',{exact:true})).toBeVisible();
 await context.route('**/rest/v1/rpc/central_atendimento',r=>r.request().postDataJSON().p_acao==='listar'?r.fulfill({status:503,json:{message:'offline'}}):r.fallback());await page.reload();await expect(page.getByRole('alert').filter({hasText:'A fila não foi atualizada'})).toBeVisible();await expect(page.getByRole('button',{name:/Esperam resposta/})).toContainText('—');
});
test('The queue shows whether the contact is already a patient, from CRM history only, and a failure never blocks the queue',async({page,context})=>{
 await setup(context);
 let pedido:{p_client:string;p_pessoas:string[]}|undefined;
 await context.route('**/rest/v1/rpc/relacionamento_pessoas',r=>{pedido=r.request().postDataJSON();return r.fulfill({json:[{pessoa_id:'66666666-6666-4666-8666-666666666666',ja_paciente:true,compras:2,ultima_compra:'2026-03-12',conversou_antes:true,primeiro_contato:'2025-11-02'}]});});
 await page.goto(`/${CID}/central-atendimento`);
 const fila=page.getByRole('region',{name:'Conversas da fila'});
 await expect(fila.getByText('Já é paciente',{exact:true})).toBeVisible();
 expect(pedido).toEqual({p_client:CID,p_pessoas:['66666666-6666-4666-8666-666666666666']});
 await fila.getByRole('button',{name:/Contato fictício QA/}).click();
 await expect(page.getByRole('region',{name:'Conversa com Contato fictício QA'})).toContainText('Já é paciente · 2 compras · última compra em 12/03/2026');
 await page.unroute('**/rest/v1/rpc/relacionamento_pessoas');
});
test('A relationship lookup failure leaves the queue usable without a label',async({page,context})=>{
 await setup(context);
 await context.route('**/rest/v1/rpc/relacionamento_pessoas',r=>r.fulfill({status:503,json:{message:'fictional failure'}}));
 await page.goto(`/${CID}/central-atendimento`);
 const fila=page.getByRole('region',{name:'Conversas da fila'});
 await expect(fila.getByRole('button',{name:/Contato fictício QA/})).toBeVisible();
 await expect(fila.getByText(/Já é paciente|Primeiro contato|Já falou com a clínica/)).toHaveCount(0);
});
