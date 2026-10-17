import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Fictional accounts and local responses only. Never loads a production session.
const CID='11111111-1111-4111-8111-111111111111';
const SID='22222222-2222-4222-8222-222222222222';
const base=process.env.INTERFACE_BASE_URL||'http://127.0.0.1:5591';
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
async function account(profile='anonymous',{sap=false,tokenFailure=false,tokenNetworkFailure=false,recoveryFailure=false}={}){
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
      requests.push({path,method:req.method()});
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
      if(path==='/rest/v1/client_members')return respond(single?{client_id:CID,user_id:user.id,role:'viewer',clients:client}:[{client_id:CID,user_id:user.id,role:'viewer',clients:client}]);
      if(path==='/rest/v1/clients')return respond(single?client:[client]);
      if(path==='/rest/v1/sap_clinicas'){
        const clinic={id:SID,client_id:CID,nome:client.name,d0:new Date(Date.now()-7*86400000).toISOString().slice(0,10),status:'onboarding',ticket_medio:4500,consulta_paga:true,servicos:[],sap_pausas:[]};
        return respond(sap||profile==='admin'?(single?clinic:[clinic]):(single?null:[]));
      }
      if(path==='/rest/v1/rpc/client_fontes')return respond([{tem_instagram:true,tem_anuncios:true,tem_crm:true,tem_atendimento:true}]);
      if(path==='/rest/v1/rpc/sap_fontes_etapas')return respond([{client_id:CID,tem_crm:true,tem_atendimento:true,tem_anuncios:true,marcos:['agendado']}]);
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
async function accessible(page,label){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${label}: horizontal overflow`);
  const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
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
      await page.goto(base);await expect(page).toHaveURL(/\/conhecer$/);await page.getByRole('link',{name:'Entrar no Nexo',exact:true}).click();await expect(page.locator('.nx-login-form')).toBeVisible();
      for(const path of ['/admin',`/${CID}/conteudo`,`/sap/${CID}`]){
        await page.goto(base+path);await expect(page).toHaveURL(/\/login\?/);await expect(page.getByRole('button',{name:'Entrar no Nexo',exact:true})).toBeVisible();
      }
      await page.goto(origins.sap);await expect(page).toHaveURL(/\/conhecer$/);await expect(page.getByRole('heading',{level:1})).toContainText('Com método, dados e direção.');
    }finally{await context.close();}
  });
  await run('product screenshots load, enlarge accessibly and provide both platform logins',async()=>{
    const {context,page}=await account();try{
      for(const [product,origin] of Object.entries(origins))for(const width of [375,1440]){
        await page.setViewportSize({width,height:1000});await page.goto(origin+'/conhecer');
        const open=page.getByRole('button',{name:`Ampliar a tela do ${product==='nexo'?'Nexo':'SAP'}`,exact:true});
        await open.scrollIntoViewIfNeeded();await expect(open.locator('img')).toHaveJSProperty('naturalWidth',1440);
        await open.click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button',{name:'Fechar prévia',exact:true})).toBeFocused();
        await accessible(page,`${product}/image-dialog/${width}`);
        await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(open).toBeFocused();
        await open.click();await dialog.getByRole('button',{name:'Fechar prévia',exact:true}).click();await expect(open).toBeFocused();
        const access=page.getByRole('navigation',{name:'Acesso às plataformas',exact:true});
        await expect(access.getByRole('link')).toHaveCount(2);
        await expect(access.getByRole('link',{name:/Acessar Nexo/})).toHaveAttribute('href','https://nexo.doctorcreator.com.br/login');
        await expect(access.getByRole('link',{name:/Acessar SAP/})).toHaveAttribute('href','https://sap.doctorcreator.com.br/login');
        await page.getByRole('navigation',{name:'Navegação pública',exact:true}).getByRole('link',{name:`Acessar ${product==='nexo'?'Nexo':'SAP'}`,exact:true}).click();
        await expect(page.locator('.nx-login-form')).toBeVisible();await expect(page).toHaveURL(origin+'/login');
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
        if(recoveryFailure){await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByText('Link enviado. Confira seu e-mail para recuperar o acesso.',{exact:true})).not.toBeVisible();}
        else await expect(page.getByRole('status')).toContainText('Link enviado');
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
      await page.goto(origins.sap+`/sap/${CID}/cronograma`);await expect(page.locator('.app')).toBeVisible();await expect(page.getByRole('navigation',{name:'Produto',exact:true})).not.toBeVisible();
      await expect(page.getByRole('link',{name:'Acompanhamento no Doctor Creator Hub',exact:true})).not.toBeVisible();
    }finally{await context.close();}
  });
  await run('keyboard access works through presentation, login and return navigation',async()=>{
    const {context,page}=await account();try{
      await page.goto(base+'/conhecer');await expect(page.locator('.nx-hero')).toBeVisible();await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Ir para o conteúdo',exact:true})).toBeFocused();
      await page.keyboard.press('Enter');await expect(page.locator('#presentation-main')).toBeFocused();
      await page.getByRole('link',{name:'Entrar no Nexo',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.nx-login-form')).toBeVisible();
      await page.getByRole('link',{name:'Voltar à apresentação',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.locator('.nx-hero')).toBeVisible();
    }finally{await context.close();}
  });
  await writeFile(new URL('report.json',output),JSON.stringify({passed:cases.length,failed:0,cases,filter:process.env.INTERFACE_CASE||null,errors,unexpected,scope:'Fictional accounts; intercepted provider/API responses. No production writes or messages.',viewports:[375,768,1440]},null,2)+'\n');
  console.log(`${cases.length} interface checks passed`);
}catch(error){
  await writeFile(new URL('report.json',output),JSON.stringify({passed:cases.length,failed:1,cases,error:String(error),errors,unexpected},null,2)+'\n');throw error;
}finally{await browser.close();server?.kill();}
