const diaDaClinica = (instant = Date.now()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect as playwrightExpect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const expect=playwrightExpect.configure({timeout:15_000});

// Fictional accounts and local responses only. Never loads a production session.
const CID='11111111-1111-4111-8111-111111111111';
const SID='22222222-2222-4222-8222-222222222222';
const base=process.env.INTERFACE_BASE_URL||'http://127.0.0.1:5591';
assert.ok(new URL(base).protocol==='http:'&&['127.0.0.1','localhost','sap.localhost'].includes(new URL(base).hostname),'Interface verification only targets a local fixture server');
const port=new URL(base).port;
const origins={nexo:base,sap:`http://sap.localhost:${port}`};
const output=new URL('../test-results/nexo-interface/',import.meta.url);
await mkdir(output,{recursive:true});
let server;
if(!process.env.INTERFACE_BASE_URL){
  server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port',port,'--strictPort'],{stdio:'ignore'});
  let ready=false;
  for(let i=0;i<60;i++){
    try{if((await fetch(base)).ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!ready){server.kill();throw new Error('Preview server did not start');}
}
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
const cases=[],errors=[],unexpected=[];
const client={id:CID,name:'Clínica Aurora',specialty:'Dermatologia',active:true,created_at:'2026-01-01T12:00:00Z',em_onboarding:false};
const PILOT={proposal:'44444444-4444-4444-8444-444444444444',work:'55555555-5555-4555-8555-555555555555',conversation:'66666666-6666-4666-8666-666666666666',message:'77777777-7777-4777-8777-777777777777'};
function pilotFixture({started=false,blocked=false,sapPrepared=false}={}){
  const now=Date.now(),approved=new Date(now-60_000).toISOString(),sent=new Date(now-30_000).toISOString();
  const state={blocked,work:null,outcome:null,actions:[],link:null};
  const makeWork=prazo=>({id:PILOT.work,client_id:CID,sugestao_id:PILOT.proposal,conversa_id:PILOT.conversation,
    responsavel_id:'33333333-3333-4333-8333-333333333333',responsavel_nome:'Jordan QA',prazo:prazo||new Date(now+86400000).toISOString(),
    estado:blocked?'bloqueada':'pronta',motivo:blocked?'Mensagens sem coleta completa. Atualize a fonte antes de retomar.':null,mensagem_id:null,
    aprovado_em:approved,criado_em:approved,atualizado_em:approved,observacao:{eventos_crm:[]},conversa:{pessoa:{nome:'Pessoa fictícia Aurora'}},sugestao:{mensagem:state.proposal.mensagem,titulo:state.proposal.titulo}});
  state.proposal={id:PILOT.proposal,client_id:CID,agente:'recuperacao',tipo:'sem_continuidade',titulo:'Retomar o interesse após a revisão da equipe',
    detalhe:'Proposta fictícia para validar o acompanhamento.',evidencias:[],brain:[],conteudo:{},mensagem:'Olá, [nome]. Podemos ajudar com o próximo passo?',conversa_id:PILOT.conversation,
    campanha_id:null,prioridade:1,estado:'proposta',resultado:null,medido_em:null,medicao:{versao:2},criado_em:new Date(now-2*3600000).toISOString(),conversa:{canal:'whatsapp',pessoa:{nome:'Pessoa fictícia Aurora'}}};
  state.messages=[
    {id:'88888888-8888-4888-8888-888888888888',enviada_em:new Date(now-120_000).toISOString(),texto:'Contato anterior à aprovação',externo_id:'provider-before',direcao:'saida',tipo:'texto'},
    {id:'99999999-9999-4999-8999-999999999999',enviada_em:sent,texto:'Resposta automática fictícia',externo_id:'provider-bot',direcao:'saida',tipo:'kommo_robo'},
    {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',enviada_em:approved,texto:'Interesse fictício no atendimento',externo_id:'provider-incoming',direcao:'entrada',tipo:'texto'},
    {id:PILOT.message,enviada_em:sent,texto:'Contato revisado pela equipe fictícia',externo_id:'provider-outgoing-qa',direcao:'saida',tipo:'texto'},
  ];
  state.assume=prazo=>{state.work??=makeWork(prazo);return state.work.id;};
  state.prepareSap=()=>{state.actions=[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',clinica_id:SID,semana:diaDaClinica(now),origem:'outro',codigo:'agente_acesso_A2',
    texto:'Confirmar acesso: Doctor Creator como parceira',lado:'dc',responsavel:'Gestor de Tráfego · Jordan QA',prazo:diaDaClinica(now+86400000),status:'aberta',resultado:'Falta confirmação com data e responsável.'}];};
  if(started)state.assume();if(sapPrepared)state.prepareSap();
  state.accesses=[{clinica_id:SID,item:'A1',status:'confirmado',confirmado_em:diaDaClinica(now),confirmado_por:'Equipe fictícia',observacao:'Acesso testado no ambiente fictício.',revogado_em:null}];
  return state;
}
async function account(profile='anonymous',{sap=false,tokenFailure=false,tokenNetworkFailure=false,recoveryFailure=false,tracker=null,pilot=null}={}){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  let signedIn=profile!=='anonymous';
  const requests=[];
  const user={id:'33333333-3333-4333-8333-333333333333',email:'qa@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
  const claims=Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url');
  const session={access_token:`eyJhbGciOiJIUzI1NiJ9.${claims}.fake-signature`,refresh_token:'fake-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user};
  await context.addInitScript(({session,profile})=>{if(profile!=='anonymous')localStorage.setItem('sb-localhost-auth-token',JSON.stringify(session));},{session,profile});
  await context.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com')return route.fulfill({status:200,body:'',contentType:'text/css'});
    if(url.origin==='http://localhost:9'){
      const body=req.method()==='POST'&&path.includes('/rpc/')?req.postDataJSON():null;
      requests.push({path,method:req.method(),body,query:Object.fromEntries(url.searchParams)});
      const single=(req.headers().accept||'').includes('vnd.pgrst.object');
      const respond=(json,status=200)=>route.fulfill({status,json});
      if(path==='/auth/v1/token'){
        if(tokenNetworkFailure)return route.abort('failed');
        if(tokenFailure)return respond({message:'Invalid login credentials',error_code:'invalid_credentials'},400);
        signedIn=true;return respond(session);
      }
      if(path==='/auth/v1/user')return respond(signedIn?user:{message:'No session'},signedIn?200:401);
      if(path==='/auth/v1/recover')return respond(recoveryFailure?{message:'Recovery unavailable'}:{},recoveryFailure?503:200);
      if(path.startsWith('/auth/v1/'))return respond(session);
      if(path==='/rest/v1/rpc/is_app_admin')return respond(profile==='admin');
      if(path==='/rest/v1/client_members'){
        const member={client_id:CID,user_id:user.id,role:profile==='owner'?'owner':'viewer',clients:client};
        return respond(single?member:[member]);
      }
      if(path==='/rest/v1/clients')return respond(single?client:[client]);
      if(path==='/rest/v1/sap_clinicas'){
        const clinic={id:SID,client_id:CID,nome:client.name,d0:diaDaClinica(Date.now()-7*86400000),status:'onboarding',ticket_medio:4500,consulta_paga:true,servicos:[],sap_pausas:[]};
        return respond(sap||profile==='admin'?(single?clinic:[clinic]):(single?null:[]));
      }
      if(path==='/rest/v1/rpc/client_fontes')return respond([{tem_instagram:true,tem_anuncios:true,tem_crm:true,tem_atendimento:true}]);
      if(path==='/rest/v1/rpc/sap_fontes_etapas')return respond([{client_id:CID,tem_crm:true,tem_atendimento:true,tem_anuncios:true,marcos:['agendado']}]);
      if(path==='/rest/v1/rpc/sap_tracker_auto')return respond(tracker);
      if(path==='/rest/v1/rpc/tem_modulo')return respond(true);
      if(pilot){
        if(path==='/rest/v1/sugestoes_agentes')return respond(url.searchParams.get('agente')==='eq.conteudo'||url.searchParams.get('agente')==='eq.anuncios'?[]:[pilot.proposal]);
        if(path==='/rest/v1/operacao_recuperacao')return respond(pilot.work?(url.searchParams.get('select')==='sugestao_id'?[{sugestao_id:pilot.work.sugestao_id}]:[pilot.work]):[]);
        if(path==='/rest/v1/rpc/operacao_fontes')return respond({apto:!pilot.blocked,limite_horas:36,fontes:['mensagens','crm'].map(fonte=>({fonte,sucesso_em:pilot.blocked?null:new Date().toISOString(),dados_ate:null,erro_posterior:pilot.blocked,atual:!pilot.blocked}))});
        if(path==='/rest/v1/rpc/operacao_mensagens'){
          assert.equal(body.p_trabalho_id,PILOT.work);return respond(pilot.messages);
        }
        if(path==='/rest/v1/sap_acessos')return respond(pilot.accesses);
        if(path==='/rest/v1/sap_acoes')return respond(pilot.actions);
        if(path==='/rest/v1/sap_marco_vinculos')return respond(single?pilot.link:pilot.link?[pilot.link]:[]);
        const mutation=path.startsWith('/rest/v1/rpc/operacao_')||path==='/rest/v1/rpc/sap_vincular_marco';
        if(mutation&&profile!=='admin'&&profile!=='owner')return respond({message:'Leitura apenas'},403);
        if(path==='/rest/v1/rpc/operacao_iniciar'){
          assert.equal(body.p_sugestao_id,PILOT.proposal);assert.ok(Number.isFinite(Date.parse(body.p_prazo)));
          return respond(pilot.assume(body.p_prazo));
        }
        if(path==='/rest/v1/rpc/operacao_vincular_mensagem'){
          assert.deepEqual(body,{p_trabalho_id:PILOT.work,p_mensagem_id:PILOT.message});
          pilot.work.mensagem_id=PILOT.message;pilot.work.estado='aguardando_resposta';
          pilot.work.observacao.contato_vinculado={id:PILOT.message,externo_id:'provider-outgoing-qa',em:pilot.messages.at(-1).enviada_em,fonte:'mensagens'};
          return respond(null);
        }
        if(path==='/rest/v1/rpc/operacao_verificar'){
          assert.equal(body.p_client_id,CID);
          if(pilot.work&&pilot.outcome){
            pilot.work.estado='resolvida';pilot.work.observacao.resposta={id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',em:new Date().toISOString(),fonte:'mensagens'};
            if(pilot.outcome==='agendamento')pilot.work.observacao.eventos_crm=[{tipo:'agendado',fonte:'crm_etapa_mapeada',id:'event-qa-1',em:new Date().toISOString()}];
          }
          return respond(pilot.work?1:0);
        }
        if(path==='/rest/v1/rpc/operacao_sap_conferir'){
          assert.equal(profile,'admin');assert.equal(body.p_clinica_id,SID);pilot.prepareSap();
          return respond({pendentes:8,resolvidos:1,acoes:pilot.actions,proximo_passo:'Responsáveis conferem os acessos na Ficha e acessos.'});
        }
        if(path==='/rest/v1/rpc/sap_vincular_marco'){
          assert.equal(profile,'admin');assert.deepEqual(body,{p_clinica_id:SID,p_task_id:'task-qa123'});
          pilot.link={clinica_id:SID,marco:5,clickup_task_id:body.p_task_id,atualizado_em:new Date().toISOString()};return respond(null);
        }
      }
      if(path.startsWith('/rest/v1/rpc/'))return respond([]);
      return respond(single?null:[]);
    }
    if(!Object.values(origins).includes(url.origin)||req.method()!=='GET'){
      unexpected.push({url:req.url(),method:req.method()});return route.abort();
    }
    if(path.startsWith('/api/'))return route.fulfill({status:503,json:{error:'API offline in interface tests'}});
    return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',error=>errors.push(error.message));
  return {context,page,requests};
}
async function run(name,fn){
  if(process.env.INTERFACE_CASE&&!name.includes(process.env.INTERFACE_CASE))return;
  await fn();assert.deepEqual(errors,[],'No browser runtime exceptions');assert.deepEqual(unexpected,[],'No real API calls or unapproved requests');
  cases.push({name,passed:true});console.log('PASS',name);
}
async function accessible(page,label,include){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${label}: horizontal overflow`);
  const builder=new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']);
  if(include)for(const selector of include)builder.include(selector);
  const result=await builder.analyze();
  assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],`${label}: accessibility`);
}
try{
  await run('presentations and real login render on Nexo and SAP at mobile tablet desktop sizes',async()=>{
    const {context,page}=await account();
    try{
      for(const [product,origin] of Object.entries(origins))for(const width of [375,768,1440])for(const path of ['/conhecer','/login']){
        await page.setViewportSize({width,height:1000});await page.goto(origin+path);
        await expect(page.locator(path==='/login'?'.nx-login-form':'.nx-hero')).toBeVisible();
        await expect(page).toHaveTitle(product==='sap'?'SAP · Doctor Creator':'Nexo · Doctor Creator');
        await accessible(page,`${product}/${path}/${width}`);
        if(width!==768)await page.screenshot({path:new URL(`${product}-${path.slice(1)}-${width}.png`,output).pathname,fullPage:true});
      }
    }finally{await context.close();}
  });
  await run('guest root opens product presentation while protected deep links retain their login destination',async()=>{
    const {context,page}=await account();try{
      await page.goto(base);await expect(page).toHaveURL(/\/conhecer$/);await page.getByRole('navigation',{name:'Navegação pública',exact:true}).getByRole('link',{name:'Acessar Nexo',exact:true}).click();await expect(page.locator('.nx-login-form')).toBeVisible();
      for(const path of ['/admin',`/${CID}/conteudo`,`/sap/${CID}`]){
        await page.goto(base+path);await expect(page).toHaveURL(/\/login\?/);await expect(page.getByRole('button',{name:'Entrar no Nexo',exact:true})).toBeVisible();
      }
      await page.goto(origins.sap);await expect(page).toHaveURL(/\/conhecer$/);await expect(page.getByRole('heading',{level:1})).toContainText('Uma equipe para colocar em prática.');
    }finally{await context.close();}
  });
  await run('product screenshots load, enlarge accessibly and provide both platform logins',async()=>{
    const {context,page}=await account();try{
      for(const [product,origin] of Object.entries(origins))for(const width of [375,1440]){
        await page.setViewportSize({width,height:1000});await page.goto(origin+'/conhecer');
        const open=page.getByRole('button',{name:`Ampliar a tela do ${product==='nexo'?'Nexo':'SAP'}`,exact:true});
        await open.scrollIntoViewIfNeeded();await expect(open.locator('img')).toHaveJSProperty('naturalWidth',1440);
        const picker=page.getByRole('group',{name:`Escolha uma tela do ${product==='nexo'?'Nexo':'SAP'}`,exact:true});
        const screens=product==='sap'?[['Prioridades da semana','sap-semana'],['Agenda e entregas','sap-cronograma'],['Evolução da clínica','sap']]:[['Conhecimento da clínica','nexo-brain'],['Auditoria comercial','nexo'],['Frentes agênticas','nexo-agentes']];
        for(const [label,file] of screens){
          const choice=picker.getByRole('button',{name:new RegExp(label)});await choice.focus();await page.keyboard.press('Enter');
          await expect(choice).toHaveAttribute('aria-pressed','true');await expect(open.locator('img')).toHaveAttribute('src',`/product-previews/${file}.jpg`);await expect(open.locator('img')).toHaveJSProperty('naturalWidth',1440);
        }
        await open.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button',{name:'Fechar prévia',exact:true})).toBeFocused();
        await accessible(page,`${product}/image-dialog/${width}`);
        await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(open).toBeFocused();
        await open.click();await dialog.getByRole('button',{name:'Fechar prévia',exact:true}).click();await expect(open).toBeFocused();
        const access=page.getByRole('navigation',{name:'Acesso às plataformas',exact:true});
        await expect(access.getByRole('link')).toHaveCount(2);
        await expect(access.getByRole('link',{name:/Entrar no Nexo/})).toHaveAttribute('href','https://nexo.doctorcreator.com.br/login');
        await expect(access.getByRole('link',{name:/Entrar no SAP/})).toHaveAttribute('href','https://sap.doctorcreator.com.br/login');
        await page.getByRole('navigation',{name:'Navegação pública',exact:true}).getByRole('link',{name:`Acessar ${product==='nexo'?'Nexo':'SAP'}`,exact:true}).click();
        await expect(page.locator('.nx-login-form')).toBeVisible();await expect(page).toHaveURL(origin+'/login');
      }
    }finally{await context.close();}
  });
  await run('commercial calls to action and decision examples work independently of customer access',async()=>{
    const {context,page}=await account();try{
      for(const [product,origin] of Object.entries(origins)){
        await page.goto(origin+'/conhecer');
        const call=page.locator('.nx-hero .nx-button--primary');
        const url=new URL(await call.getAttribute('href'));
        assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/552192339218');
        assert.match(url.searchParams.get('text'),product==='sap'?/SAP/:/Nexo/);
        if(product==='nexo'){
          const choices=page.getByRole('group',{name:'Explore uma decisão de negócio',exact:true});
          await choices.getByRole('button',{name:/Conversão no atendimento/}).click();
          await expect(choices.getByRole('button',{name:/Conversão no atendimento/})).toHaveAttribute('aria-pressed','true');
          await expect(page.getByRole('heading',{name:'O que a conversa revela além do motivo de perda no CRM?',exact:true})).toBeVisible();
          await choices.getByRole('button',{name:/Evolução da equipe/}).focus();await page.keyboard.press('Enter');
          await expect(page.getByRole('heading',{name:'A equipe está aplicando o que foi combinado?',exact:true})).toBeVisible();
          await accessible(page,'decision-example-selected');
          await page.getByRole('button',{name:/Conhecimento da clínica/}).click();
          await expect(page.locator('.nx-screen-button img')).toHaveAttribute('src','/product-previews/nexo-brain.jpg');
          await expect(page.locator('.nx-screen-button img')).toHaveJSProperty('naturalWidth',1440);
          await page.getByRole('button',{name:'Ampliar a tela do Nexo',exact:true}).click();
          await expect(page.getByRole('dialog').locator('img')).toHaveAttribute('src','/product-previews/nexo-brain.jpg');
          await page.keyboard.press('Escape');
        }
      }
    }finally{await context.close();}
  });
  await run('password visibility and invalid credentials remain usable',async()=>{
    const {context,page}=await account('anonymous',{tokenFailure:true});try{
      await page.goto(base+'/login');await page.getByLabel('E-mail',{exact:true}).fill('qa@example.test');await page.getByLabel('Senha',{exact:true}).fill('incorrect-password');
      await page.getByRole('button',{name:'Mostrar senha',exact:true}).click();await expect(page.getByLabel('Senha',{exact:true})).toHaveAttribute('type','text');
      await page.getByRole('button',{name:'Esconder senha',exact:true}).click();await expect(page.getByLabel('Senha',{exact:true})).toHaveAttribute('type','password');
      await page.getByRole('button',{name:'Entrar no Nexo',exact:true}).click();await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos.');await expect(page.getByRole('button',{name:'Entrar no Nexo',exact:true})).toBeEnabled();
    }finally{await context.close();}
  });
  await run('network login failure releases the form instead of leaving it busy',async()=>{
    const {context,page}=await account('anonymous',{tokenNetworkFailure:true});try{
      await page.goto(base+'/login');await page.getByLabel('E-mail',{exact:true}).fill('qa@example.test');await page.getByLabel('Senha',{exact:true}).fill('fake-password');
      await page.getByRole('button',{name:'Entrar no Nexo',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible({timeout:25000});await expect(page.getByRole('button',{name:'Entrar no Nexo',exact:true})).toBeEnabled();
    }finally{await context.close();}
  });
  await run('accepted login reaches its protected destination and logout returns to the public experience',async()=>{
    const {context,page,requests}=await account();try{
      await page.goto(base+`/login?redirect=${encodeURIComponent(`/${CID}/conteudo`)}`);
      await page.getByLabel('E-mail',{exact:true}).fill('qa@example.test');await page.getByLabel('Senha',{exact:true}).fill('fake-password');
      await page.getByRole('button',{name:'Entrar no Nexo',exact:true}).click();
      await expect(page).toHaveURL(base+`/${CID}/conteudo`,{timeout:25000});await expect(page.locator('.app')).toBeVisible();
      assert.equal(requests.filter(r=>r.path==='/auth/v1/token').length,1);
      await page.getByRole('button',{name:'Sair',exact:true}).click();await expect(page.locator('.nx-login-form')).toBeVisible();
      await page.goto(base+`/${CID}/conteudo`);await expect(page).toHaveURL(/\/login\?/);
    }finally{await context.close();}
  });
  await run('recovery shows success only after its mocked provider accepts the request',async()=>{
    for(const recoveryFailure of [false,true]){
      const {context,page,requests}=await account('anonymous',{recoveryFailure});try{
        await page.goto(base+'/login');await page.getByRole('button',{name:'Esqueci minha senha',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Digite seu e-mail');assert.equal(requests.filter(r=>r.path==='/auth/v1/recover').length,0);
        await page.getByLabel('E-mail',{exact:true}).fill('qa@example.test');await page.getByRole('button',{name:'Esqueci minha senha',exact:true}).click();
        if(recoveryFailure){await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByText('Solicitação recebida. Se este e-mail tiver acesso, você receberá um link para criar uma nova senha. Confira também a caixa de spam.',{exact:true})).not.toBeVisible();}
        else await expect(page.getByRole('status')).toContainText('Solicitação recebida.');
      }finally{await context.close();}
    }
  });
  await run('internal login copy never grants administrative permissions to a clinic viewer',async()=>{
    const {context,page}=await account('viewer');try{
      await page.goto(base+'/admin');await expect(page.getByRole('heading',{name:'Clientes do Nexo',exact:true})).not.toBeVisible();await expect(page).not.toHaveURL(/\/admin$/);
      await page.goto(base+`/${CID}/conteudo`);await expect(page.locator('.app')).toBeVisible();await expect(page.getByRole('navigation',{name:'Produto',exact:true})).not.toBeVisible();
      await page.goto(base+'/login?acesso=admin');await expect(page).not.toHaveURL(/\/login/);await expect(page.getByRole('heading',{name:'Clientes do Nexo',exact:true})).not.toBeVisible();
    }finally{await context.close();}
  });
  await run('administration and operational shells preserve real menus on mobile and desktop',async()=>{
    const {context,page}=await account('admin');try{
      for(const width of [375,1440]){
        await page.setViewportSize({width,height:1000});
        for(const path of ['/admin',`/${CID}/conteudo`,`/${CID}/anuncios`,`/${CID}/crm-painel`,`/sap/${CID}/cronograma`,`/sap/${CID}/leitura`]){
          await page.goto(base+path);await expect(page.locator('.app')).toBeVisible();await expect(page.locator('body')).not.toContainText('Essa página não carregou');
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${path}/${width}: overflow`);
          if(path==='/admin'||path.endsWith('/conteudo')||path.endsWith('/cronograma'))await page.screenshot({path:new URL(`${path==='/admin'?'admin':path.includes('/sap/')?'sap-panel':'nexo-panel'}-${width}.png`,output).pathname,fullPage:true});
        }
      }
    }finally{await context.close();}
  });
  await run('SAP clinic menu has its programme and no product switch',async()=>{
    const {context,page}=await account('viewer',{sap:true});try{
      await page.goto(origins.sap+`/sap/${CID}/cronograma`);
      await expect(page.locator('.app')).toBeVisible().catch(async error=>{
        await writeFile(new URL('sap-clinic-load-failure.json',output),JSON.stringify({url:page.url(),body:await page.locator('body').innerText(),requests},null,2));
        throw error;
      });
      await expect(page.getByRole('navigation',{name:'Produto',exact:true})).not.toBeVisible();
      await expect(page.getByRole('link',{name:'Acompanhamento no Doctor Creator Hub',exact:true})).not.toBeVisible();
    }finally{await context.close();}
  });
  await run('SAP grouped navigation preserves clinic boundaries and keyboard access on mobile tablet desktop',async()=>{
    for(const width of [375,768]){
      const {context,page}=await account('viewer',{sap:true});try{
        await page.setViewportSize({width,height:1000});
        await page.goto(origins.sap+`/sap/${CID}`);
        await expect(page.getByRole('heading',{name:'Sua implantação, com prioridades claras.',exact:true})).toBeVisible();
        const opener=page.getByRole('button',{name:'Abrir o menu',exact:true});
        await opener.click();const menu=page.getByRole('dialog',{name:'Menu do Sistema de Aquisição',exact:true});
        await expect(menu).toBeVisible();await expect(menu.getByRole('button',{name:'Fechar o menu',exact:true})).toBeFocused();
        await expect(menu.getByRole('link',{name:/Equipe e acessos/})).not.toBeVisible();
        await expect(menu.getByRole('navigation',{name:'Produto',exact:true})).not.toBeVisible();
        await page.keyboard.press('Escape');await expect(menu).not.toBeVisible();await expect(opener).toBeFocused();
        await opener.click();await page.getByRole('dialog').getByRole('link',{name:/^Resultados/}).click();
        await expect(page).toHaveURL(origins.sap+`/sap/${CID}/painel`);await expect(page.getByRole('dialog')).not.toBeVisible();
        const tabs=page.getByRole('navigation',{name:'Telas de Resultados',exact:true});
        await expect(tabs.getByRole('link')).toHaveCount(3);
        await expect(tabs.getByRole('link',{name:'Números da semana',exact:true})).toHaveAttribute('href',`/sap/${CID}/leitura`);
        await opener.click();await expect(page.getByRole('dialog').getByRole('link',{name:/^Para revisar/})).toHaveAttribute('href',`/sap/${CID}/agentes`);await page.keyboard.press('Escape');
        await tabs.getByRole('link',{name:'Metas e garantia',exact:true}).click();
        await expect(page).toHaveURL(origins.sap+`/sap/${CID}/metas`);
        await expect(page.getByRole('heading',{name:'Metas e garantia',level:1,exact:true})).toBeVisible();
        await opener.click();await expect(page.getByRole('navigation',{name:'Áreas do SAP',exact:true}).getByRole('link',{name:/^Entregas e agenda/})).not.toHaveAttribute('data-status','active');await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'SAP grouped tabs do not overflow');
        await page.emulateMedia({colorScheme:'dark'});await page.goto(origins.sap+`/sap/${CID}`);
        await expect(page.locator('.sap-week-overview')).toBeVisible();
        const result=await new AxeBuilder({page}).include('.sap-week-overview').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
        assert.deepEqual(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],'SAP overview is accessible in dark mode');
      }finally{await context.close();}
    }
    const {context,page}=await account('admin',{sap:true});try{
      await page.goto(origins.sap+`/sap/${CID}/cronograma`);
      const tabs=page.getByRole('navigation',{name:'Telas de Implantação',exact:true});
      for(const [label,path] of [['Cronograma','cronograma'],['Reuniões','sessao'],['Rastreamento','rastreamento'],['Banco de anúncios','anuncios'],['Etapas do funil','etapas']]){
        await expect(tabs.getByRole('link',{name:label,exact:true})).toHaveAttribute('href',`/sap/${CID}/${path}`);
      }
      await page.getByRole('navigation',{name:'Áreas do SAP',exact:true}).getByRole('link',{name:/Equipe e acessos/}).click();
      await expect(page).toHaveURL(origins.sap+`/sap/${CID}/papeis`);
      await expect(page.getByRole('navigation',{name:'Telas de Equipe e acessos',exact:true}).getByRole('link',{name:'Ficha e acessos',exact:true})).toHaveAttribute('href',`/sap/${CID}/onboarding`);
      await page.goto(origins.sap+'/sap');
      const operation=page.getByRole('group',{name:'Visão da operação',exact:true});
      await expect(page.getByRole('region',{name:'Clínicas e resultados',exact:true})).toBeVisible();
      await expect(page.getByRole('region',{name:'Prioridades da equipe',exact:true})).not.toBeVisible();
      await operation.getByRole('button',{name:'Minhas prioridades',exact:true}).click();
      await expect(page.getByRole('region',{name:'Prioridades da equipe',exact:true})).toBeVisible();
      await expect(page.getByRole('region',{name:'Clínicas e resultados',exact:true})).not.toBeVisible();
      await operation.getByRole('button',{name:'Clínicas e resultados',exact:true}).click();
      await expect(page.getByRole('region',{name:'Clínicas e resultados',exact:true})).toBeVisible();
    }finally{await context.close();}
  });
  await run('SAP overview displays recorded volumes only after required source configuration',async()=>{
    const measured={tem_crm:true,tem_whatsapp:true,marcos_marcados:8,marcos:['qualificado','desqualificado','agendado','compareceu','faltou','pensando','nao_fechou','fechou'],leads:50,qualificados:40,agendados:20,compareceram:16,faltaram:4,fechados:6,fechados_com_valor:6,com_origem:49,linhas_completas:49,resposta_conversas:40,resposta_mediana_min:4,resposta_ate_5min:32};
    for(const complete of [true,false]){
      const {context,page}=await account('viewer',{sap:true,tracker:complete?measured:{...measured,marcos_marcados:0,marcos:[]}});try{
        await page.goto(origins.sap+`/sap/${CID}/painel`);
        await expect(page.getByRole('region',{name:'Resumo do programa',exact:true})).toBeVisible();
        const funnel=page.getByRole('region',{name:'O caminho dos seus pacientes',exact:true});
        if(complete){
          await expect(funnel).toBeVisible();await expect(funnel.getByRole('listitem')).toHaveCount(5);
          await expect(funnel).toContainText('50');await expect(funnel).toContainText('40');
          for(const width of [375,768,1440]){await page.setViewportSize({width,height:1000});
            assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'SAP measured overview fits viewport');
            const a=await new AxeBuilder({page}).include('.sap-clinic-summary').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();assert.deepEqual(a.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],'SAP measured overview accessibility');
          }
        }else{await expect(funnel).not.toBeVisible();await expect(page.getByText('Dado incompleto',{exact:true}).first()).toBeVisible();}
      }finally{await context.close();}
    }
  });
  await run('keyboard access works through presentation, login and return navigation',async()=>{
    const {context,page}=await account();try{
      await page.goto(base+'/conhecer');await expect(page.locator('.nx-hero')).toBeVisible();await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Ir para o conteúdo',exact:true})).toBeFocused();
      await page.keyboard.press('Enter');await expect(page.locator('#presentation-main')).toBeFocused();
      await page.getByRole('navigation',{name:'Navegação pública',exact:true}).getByRole('link',{name:'Acessar Nexo',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.nx-login-form')).toBeVisible();
      await page.getByRole('link',{name:'Voltar à apresentação',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.nx-hero')).toBeVisible();
    }finally{await context.close();}
  });
  await run('Nexo pilot owner assumes a proposal, links a provider message through the history RPC and observes outcomes',async()=>{
    for(const width of [375,1440]){
      const pilot=pilotFixture();
      const {context,page,requests}=await account('owner',{pilot});try{
        await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
        await page.setViewportSize({width,height:1000});await page.goto(base+`/${CID}/atendimento`);
        const operation=page.getByRole('region',{name:'Do próximo contato ao desfecho registrado.',exact:true});
        await expect(operation).toBeVisible();
        await page.getByRole('combobox',{name:'Prazo para realizar o contato',exact:true}).selectOption('4');
        const before=Date.now();await page.getByRole('button',{name:'Assumir e acompanhar',exact:true}).click();
        const work=operation.getByRole('article').filter({has:page.getByRole('heading',{name:'Pessoa fictícia Aurora',exact:true})});
        await expect(work).toContainText('Jordan QA · Prazo:');await expect(work).toContainText('Contato a realizar');
        const assumed=requests.filter(r=>r.path==='/rest/v1/rpc/operacao_iniciar');assert.equal(assumed.length,1);
        assert.equal(assumed[0].body.p_sugestao_id,PILOT.proposal);
        const deadline=Date.parse(assumed[0].body.p_prazo);assert.ok(deadline>=before+4*3600000&&deadline<=Date.now()+4*3600000,'selected deadline is sent to the real UI contract');
        await expect(page.getByRole('button',{name:'Assumir e acompanhar',exact:true})).not.toBeVisible();
        await page.reload();
        await expect(work).toContainText('Contato a realizar');await expect(work).toContainText('Rascunho para a equipe revisar');
        await expect(page.locator('#ag-recuperacao')).toContainText('Nenhuma proposta pendente de revisão. Os casos assumidos ficam no acompanhamento acima.');
        await expect(page.locator('#ag-recuperacao').getByRole('article')).toHaveCount(0);
        await expect(page.getByRole('button',{name:'Assumir e acompanhar',exact:true})).not.toBeVisible();
        await expect(operation.getByRole('article')).toHaveCount(1);
        assert.equal(requests.filter(r=>r.path==='/rest/v1/rpc/operacao_iniciar').length,1,'reloading an assumed case never starts it again');
        assert.ok(requests.some(r=>r.path==='/rest/v1/operacao_recuperacao'&&r.query.select==='sugestao_id'),'proposal filtering reads existing work identifiers');
        await work.getByRole('button',{name:'Copiar rascunho do caso',exact:true}).click();
        await expect(work.getByRole('button',{name:'Copiado',exact:true})).toBeVisible();
        assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),pilot.proposal.mensagem,'the original draft remains copyable before linking contact');
        await expect(operation.getByText('Contatos vinculados',{exact:true}).locator('..').locator('dd')).toHaveText('0');
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:new URL(`nexo-pilot-active-${width}.png`,output).pathname,fullPage:true});
        assert.equal(requests.filter(r=>r.path==='/rest/v1/rpc/operacao_mensagens').length,0,'history is read only when explicitly opened');
        await work.getByRole('button',{name:'Revisar histórico e vincular contato',exact:true}).click();
        const selection=work.getByRole('combobox',{name:'Mensagem confirmada na conversa',exact:true});
        await expect(selection).toBeVisible();await expect(selection.locator('option')).toHaveCount(2);
        const history=requests.filter(r=>r.path==='/rest/v1/rpc/operacao_mensagens');assert.equal(history.length,1);assert.deepEqual(history[0].body,{p_trabalho_id:PILOT.work});
        assert.equal(requests.filter(r=>r.path==='/rest/v1/mensagens').length,0,'messages must not be read directly from the table');
        await work.locator('summary').click();await expect(work.getByText('Contato revisado pela equipe fictícia',{exact:true})).toBeVisible();
        await expect(work.getByText('Interesse fictício no atendimento',{exact:true})).toBeVisible();
        await expect(work.getByRole('button',{name:'Confirmo o contato da equipe',exact:true})).toBeDisabled();
        await selection.selectOption(PILOT.message);await work.getByRole('button',{name:'Confirmo o contato da equipe',exact:true}).click();
        await expect(work).toContainText('Aguardando resposta');await expect(work).toContainText('mensagem provider-outgoing-qa');
        const linked=requests.filter(r=>r.path==='/rest/v1/rpc/operacao_vincular_mensagem');assert.equal(linked.length,1);assert.deepEqual(linked[0].body,{p_trabalho_id:PILOT.work,p_mensagem_id:PILOT.message});
        await expect(operation.getByText('Contatos vinculados',{exact:true}).locator('..').locator('dd')).toHaveText('1');
        await accessible(page,`nexo-pilot-linked/${width}`,['[aria-labelledby="operacao-recuperacao-titulo"]','#ag-recuperacao']);
        pilot.outcome='resposta';await operation.getByRole('button',{name:'Verificar desfechos agora',exact:true}).click();
        await expect(operation.getByText('Respostas observadas',{exact:true}).locator('..').locator('dd')).toHaveText('1');
        await expect(work).not.toBeVisible();await operation.getByRole('button',{name:'Incluir casos que avançaram ou foram encerrados',exact:true}).click();
        await expect(work).toContainText('Caso avançou');await expect(work).toContainText('Resposta recebida');
        pilot.outcome='agendamento';await operation.getByRole('button',{name:'Verificar desfechos agora',exact:true}).click();
        await expect(operation.getByText('Agendamentos no CRM',{exact:true}).locator('..').locator('dd')).toHaveText('1');
        await expect(work).toContainText('Agendamento registrado');await expect(work).toContainText('CRM, evento event-qa-1');
        await expect(operation).toContainText('sem atribuição automática de crescimento ao agente');
        await accessible(page,`nexo-pilot-outcomes/${width}`,['[aria-labelledby="operacao-recuperacao-titulo"]']);
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:new URL(`nexo-pilot-${width}.png`,output).pathname,fullPage:true});
      }finally{await context.close();}
    }
  });
  await run('Nexo pilot blocks contact linking when message coverage is unavailable',async()=>{
    const pilot=pilotFixture({started:true,blocked:true});
    const {context,page,requests}=await account('owner',{pilot});try{
      await page.goto(base+`/${CID}/atendimento`);
      const operation=page.getByRole('region',{name:'Do próximo contato ao desfecho registrado.',exact:true});
      await expect(operation).toContainText('Atualizar fontes antes de retomar contato');await expect(operation).toContainText('Fonte precisa de atenção');
      await expect(operation.getByRole('button',{name:'Revisar histórico e vincular contato',exact:true})).not.toBeVisible();
      await expect(operation.getByRole('button',{name:'Confirmo o contato da equipe',exact:true})).not.toBeVisible();
      assert.equal(requests.filter(r=>['/rest/v1/rpc/operacao_mensagens','/rest/v1/rpc/operacao_vincular_mensagem'].includes(r.path)).length,0);
      await accessible(page,'nexo-pilot-blocked',['[aria-labelledby="operacao-recuperacao-titulo"]']);
    }finally{await context.close();}
  });
  await run('Nexo pilot viewer reads evidence without assuming, linking, replanning or closing cases',async()=>{
    const pilot=pilotFixture({started:true});
    const {context,page,requests}=await account('viewer',{pilot});try{
      await page.goto(base+`/${CID}/atendimento`);
      const operation=page.getByRole('region',{name:'Do próximo contato ao desfecho registrado.',exact:true});
      await expect(operation).toContainText('Jordan QA · Prazo:');await expect(operation).toContainText('Contato ainda sem mensagem vinculada');
      for(const label of ['Assumir e acompanhar','Verificar desfechos agora','Revisar histórico e vincular contato','Encerrar acompanhamento','Assumir revisão em 24h'])await expect(page.getByRole('button',{name:label,exact:true})).not.toBeVisible();
      for(const width of [375,1440]){await page.setViewportSize({width,height:1000});await accessible(page,`nexo-pilot-viewer/${width}`,['[aria-labelledby="operacao-recuperacao-titulo"]','#ag-recuperacao']);}
      assert.equal(requests.filter(r=>r.path.startsWith('/rest/v1/rpc/operacao_')&&r.path!=='/rest/v1/rpc/operacao_fontes').length,0,'viewer sends no operational mutation or message-history request');
      assert.equal(requests.filter(r=>r.path==='/rest/v1/mensagens').length,0);
    }finally{await context.close();}
  });
  await run('SAP pilot admin organizes native actions and saves a ClickUp URL as its exact task ID',async()=>{
    for(const width of [375,1440]){
      const pilot=pilotFixture();
      const {context,page,requests}=await account('admin',{sap:true,pilot});try{
        await page.setViewportSize({width,height:1000});await page.goto(origins.sap+`/sap/${CID}/agentes`);
        const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Operação de acessos críticos',exact:true})}).first();
        await expect(panel).toContainText('8 acesso(s) pendente(s)');
        await expect(page.getByRole('heading',{name:'Recuperação de pacientes',exact:true})).not.toBeVisible();
        await expect(page.getByRole('heading',{name:'Do próximo contato ao desfecho registrado.',exact:true})).not.toBeVisible();
        await expect(page.getByRole('heading',{name:'Atendente de IA · piloto em modo sombra',exact:true})).not.toBeVisible();
        await expect(page.getByRole('heading',{name:'O que os agentes aprenderam com os dados desta clínica',exact:true})).not.toBeVisible();
        await expect(page.locator('.agent-intro')).toContainText('O SAP conduz a implantação com tarefas, responsáveis e evidências.');
        await expect(page.locator('.agent-intro')).not.toContainText('oportunidades do Nexo');
        const organize=panel.getByRole('button',{name:'Conferir e organizar pendências',exact:true});
        await organize.click();const actions=panel.getByRole('region',{name:'Ações de acesso do SAP',exact:true});
        await expect(actions).toContainText('Confirmar acesso: Doctor Creator como parceira');await expect(actions).toContainText('Gestor de Tráfego · Jordan QA');await expect(actions).toContainText('prazo:');
        await organize.click();await expect(actions.getByRole('listitem')).toHaveCount(1);
        await expect.poll(()=>requests.filter(r=>r.path==='/rest/v1/rpc/operacao_sap_conferir').length).toBe(2);
        assert.ok(requests.some(r=>r.path==='/rest/v1/sap_acoes'&&r.method==='GET'),'native SAP actions are read back after organization');
        assert.equal(requests.filter(r=>r.path==='/rest/v1/sap_acoes'&&r.method!=='GET').length,0,'UI creates no parallel action records');
        await expect(panel).toContainText('Esta conferência não conclui o marco nem confirma acessos');
        await panel.locator('summary').click();await expect(panel).toContainText('confirmado por: Equipe fictícia');
        const field=panel.getByRole('textbox',{name:'ID ou URL da tarefa do ClickUp',exact:true});
        await field.fill('https://example.test/t/task-qa123');await expect(panel.getByRole('button',{name:'Salvar vínculo do ClickUp',exact:true})).toBeDisabled();
        await field.fill('https://app.clickup.com/t/task-qa123');await panel.getByRole('button',{name:'Salvar vínculo do ClickUp',exact:true}).click();
        await expect(panel.getByRole('link',{name:'Abrir tarefa vinculada',exact:true})).toHaveAttribute('href','https://app.clickup.com/t/task-qa123');
        const saved=requests.filter(r=>r.path==='/rest/v1/rpc/sap_vincular_marco');assert.equal(saved.length,1);assert.deepEqual(saved[0].body,{p_clinica_id:SID,p_task_id:'task-qa123'});
        await expect(panel).toContainText('Vínculo salvo. A tarefa ainda precisa ser conferida pelo fluxo');
        assert.equal(requests.filter(r=>r.path==='/rest/v1/rpc/sap_marcar_tarefa'||r.path==='/rest/v1/sap_marco_status'&&r.method!=='GET').length,0,'organizing and linking never confirm the milestone');
        await accessible(page,`sap-pilot-admin/${width}`,['section:has(> header h2)']);
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:new URL(`sap-pilot-${width}.png`,output).pathname,fullPage:true});
      }finally{await context.close();}
    }
  });
  await run('SAP pilot clinic reads the same native actions with no operational edit buttons or Nexo recovery',async()=>{
    const pilot=pilotFixture({sapPrepared:true});
    const {context,page,requests}=await account('viewer',{sap:true,pilot});try{
      await page.goto(origins.sap+`/sap/${CID}/agentes`);
      const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Operação de acessos críticos',exact:true})}).first();
      await expect(panel).toContainText('Gestor de Tráfego · Jordan QA');
      await expect(panel.getByRole('button',{name:'Conferir e organizar pendências',exact:true})).not.toBeVisible();
      await expect(panel.getByRole('button',{name:'Salvar vínculo do ClickUp',exact:true})).not.toBeVisible();
      await expect(panel.getByRole('textbox',{name:'ID ou URL da tarefa do ClickUp',exact:true})).not.toBeVisible();
      await expect(page.getByRole('heading',{name:'Recuperação de pacientes',exact:true})).not.toBeVisible();
      await expect(page.getByRole('heading',{name:'Do próximo contato ao desfecho registrado.',exact:true})).not.toBeVisible();
      await expect(page.getByRole('heading',{name:'Atendente de IA · piloto em modo sombra',exact:true})).not.toBeVisible();
      await expect(page.getByRole('heading',{name:'O que os agentes aprenderam com os dados desta clínica',exact:true})).not.toBeVisible();
      await expect(panel.getByRole('link',{name:'Ficha e acessos',exact:true})).toHaveAttribute('href',`/sap/${CID}/onboarding`);
      await expect(panel.getByRole('link',{name:'Minhas tarefas',exact:true})).toHaveAttribute('href',`/sap/${CID}`);
      for(const width of [375,1440]){await page.setViewportSize({width,height:1000});await accessible(page,`sap-pilot-clinic/${width}`,['section:has(> header h2)']);}
      assert.equal(requests.filter(r=>['/rest/v1/rpc/operacao_sap_conferir','/rest/v1/rpc/sap_vincular_marco','/rest/v1/rpc/operacao_iniciar'].includes(r.path)).length,0);
    }finally{await context.close();}
  });
  await writeFile(new URL('report.json',output),JSON.stringify({passed:cases.length,failed:0,cases,filter:process.env.INTERFACE_CASE||null,errors,unexpected,scope:'Fictional accounts; intercepted provider/API responses. No production writes or messages.',viewports:[375,768,1440]},null,2)+'\n');
  console.log(`${cases.length} interface checks passed`);
}catch(error){
  await writeFile(new URL('report.json',output),JSON.stringify({passed:cases.length,failed:1,cases,error:String(error),errors,unexpected},null,2)+'\n');throw error;
}finally{await browser.close();server?.kill();}
