import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CID, mockAccount } from "./fixtures";
import type { CardCrm, EventoCrm, SugestaoCrm } from "../../src/lib/crm-kanban";

test.afterEach(async({page},info)=>{
 if(info.status!==info.expectedStatus) {
  console.log("CRM_FAILURE:"+JSON.stringify(info.errors.map(e=>e.message)));
  console.log("CRM_DOM:"+(await page.locator("body").innerText().catch(()=>"page unavailable")));
  await info.attach("falha-kanban",{body:await page.screenshot().catch(()=>Buffer.from("")),contentType:"image/png"});
 }
});
for (const width of [375,1440]) {
 test(`Kanban: create, move, AI review, undo and reload at ${width}px`,async({page,context})=>{
  await mockAccount(context,"admin");
  await page.setViewportSize({width,height:1000});
  let cards:CardCrm[]=[];
  let history:EventoCrm[]=[];
  let suggestions:SugestaoCrm[]=[];
  await context.route("**/rest/v1/rpc/crm_operacao",async route=>{
   const b=route.request().postDataJSON(),d=b.p_dados;
   expect(b.p_client).toBe(CID);
   const reply=(json:unknown)=>route.fulfill({json});
   if(b.p_acao==="config")return reply({ativo:true,pode_editar:true,usuario_id:"33333333-3333-4333-8333-333333333333",equipe:[{id:"33333333-3333-4333-8333-333333333333",nome:"Equipe QA"}]});
   if(b.p_acao==="contatos")return reply([{id:"66666666-6666-4666-8666-666666666666",nome:"Pessoa fictícia QA",origem:"indicacao",telefone_final:"…0000",conversa_id:"77777777-7777-4777-8777-777777777777"}]);
   if(b.p_acao==="listar")return reply({total:cards.length,filtradas:cards.length,atrasadas:0,por_etapa:Object.fromEntries(cards.map(c=>[c.etapa,1])),cards});
   if(b.p_acao==="detalhe")return reply({card:cards[0],ia_disponivel:true,ia_motivo:null,historico:history,sugestoes:suggestions});
   if(b.p_acao==="criar"){
    cards=[{...d,client_id:CID,pessoa_id:d.pessoa_id,conversa_id:d.conversa_id,origem:d.origem||"Não identificada",responsavel:"Equipe QA",etapa:"novo",versao:1,atualizado_em:new Date().toISOString()}];
    return reply(cards[0]);
   }
   expect(d.id).toBe(cards[0].id);
   expect(d.versao).toBe(cards[0].versao);
   if(b.p_acao==="sugerir"){
    suggestions=[{id:"99999999-9999-4999-8999-999999999999",etapa:"agendamento",versao:cards[0].versao,motivo:"Conversa sobre agendamento. Confirme o horário.",evidencia:"Gostaria de marcar uma consulta amanhã",estado:"pendente",criado_em:new Date().toISOString()}];
    return reply({aviso:"Sugestão preparada para revisão."});
   }
   const before={...cards[0]};
   if(b.p_acao==="mover")cards[0].etapa=d.etapa;
   else if(b.p_acao==="aprovar"){cards[0].etapa="agendamento";suggestions[0].estado="aprovada";}
   else if(b.p_acao==="desfazer")cards[0].etapa=history[0].antes!.etapa;
   else throw new Error("Unexpected action "+b.p_acao);
   cards[0].versao++;
   history.unshift({id:crypto.randomUUID(),autor:"33333333-3333-4333-8333-333333333333",acao:b.p_acao,origem:b.p_acao==="aprovar"?"ia_aprovada":"manual",motivo:d.motivo||"Movimentação revisada pela equipe",antes:before,depois:{...cards[0]},criado_em:new Date().toISOString()});
   return reply(cards[0]);
  });
  await context.route("**/rest/v1/rpc/ler_mensagens**",route=>{
   expect(route.request().postDataJSON().p_conversa).toBe("77777777-7777-4777-8777-777777777777");
   return route.fulfill({json:[{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",direcao:"entrada",texto:"Gostaria de marcar uma consulta amanhã",tipo:"texto",enviada_em:new Date().toISOString()}]});
  });
  await context.route("**/api/sync/manual",route=>route.fulfill({json:{ok:true}}));
  await page.goto(`/${CID}/crm-contatos`);
  await expect(page.getByRole("button",{name:"Nova oportunidade",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Nova oportunidade",exact:true}).click();
  const create=page.getByRole("dialog",{name:"Nova oportunidade",exact:true});
  await create.getByRole("button",{name:/Pessoa fictícia QA/}).click();
  await create.getByRole("combobox",{name:"Responsável",exact:true}).selectOption("33333333-3333-4333-8333-333333333333");
  await create.getByLabel("Próxima ação",{exact:true}).fill("Entender o melhor horário");
  await create.getByRole("button",{name:"Criar oportunidade",exact:true}).click();
  await expect(create).not.toBeVisible();
  await page.getByRole("button",{name:"Abrir oportunidade de Pessoa fictícia QA",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Pessoa fictícia QA",exact:true});
  await expect(dialog.getByRole("heading",{name:"Histórico da oportunidade",exact:true})).toBeVisible();
  await dialog.getByRole("button",{name:"Ver conversa vinculada",exact:true}).click();
  await expect(dialog.getByRole("region",{name:"Conversa vinculada",exact:true}).getByText("Gostaria de marcar uma consulta amanhã",{exact:true})).toBeVisible();
  await dialog.getByRole("button",{name:"Recolher conversa",exact:true}).click();
  await dialog.getByLabel("Mover para",{exact:true}).selectOption("interesse");
  await dialog.getByLabel("Motivo da mudança",{exact:true}).fill("Interesse confirmado em conversa fictícia");
  await dialog.getByRole("button",{name:"Mover oportunidade",exact:true}).click();
  await expect(dialog.getByText("Demonstrou interesse",{exact:true}).first()).toBeVisible();
  await dialog.getByRole("button",{name:"Analisar conversa com IA",exact:true}).click();
  const suggestion=dialog.getByRole("region",{name:"Sugestão da IA",exact:true});
  await expect(suggestion.getByText("Gostaria de marcar uma consulta amanhã",{exact:true})).toBeVisible();
  expect(cards[0].etapa).toBe("interesse");
  await suggestion.getByRole("button",{name:"Aprovar mudança",exact:true}).click();
  await expect(dialog.getByText("IA com aprovação da equipe",{exact:true})).toBeVisible();
  expect(cards[0].etapa).toBe("agendamento");
  await expect(dialog.getByLabel("Mover para",{exact:true})).toHaveValue("agendamento");
  await expect(dialog.getByLabel("Motivo da mudança",{exact:true})).toHaveValue("");
  await dialog.getByRole("button",{name:"Desfazer última movimentação",exact:true}).click();
  await expect.poll(()=>cards[0].etapa).toBe("interesse");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("button",{name:"Abrir oportunidade de Pessoa fictícia QA",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await test.info().attach("kanban-"+width,{body:await page.screenshot({fullPage:true}),contentType:"image/png"});
  const audit=await new AxeBuilder({page}).include(".crm-board-scroll").withTags(["wcag2a","wcag2aa"]).analyze();
  expect(audit.violations).toEqual([]);
 });
}
test("Kanban: denied pilot and viewer do not expose editing",async({page,context})=>{
 await mockAccount(context,"viewer");
 let active=false;
 await context.route("**/rest/v1/rpc/crm_operacao",route=>{
  const b=route.request().postDataJSON();
  return route.fulfill({json:b.p_acao==="config"?{ativo:active,pode_editar:false}:{total:0,filtradas:0,atrasadas:0,por_etapa:{},cards:[]}});
 });
 await page.goto(`/${CID}/crm-contatos`);
 await expect(page.getByRole("heading",{name:"Kanban em preparação",exact:true})).toBeVisible();
 active=true;await page.reload();
 await expect(page.getByText("Nenhuma oportunidade encontrada.",{exact:false})).toBeVisible();
 await expect(page.getByRole("button",{name:"Nova oportunidade",exact:true})).toHaveCount(0);
});

test("Kanban: incomplete imported conversations do not trigger AI requests",async({page,context})=>{
 await mockAccount(context,"admin");
 let aiCalls=0;
 const card={id:"88888888-8888-4888-8888-888888888888",client_id:CID,pessoa_id:"66666666-6666-4666-8666-666666666666",conversa_id:"77777777-7777-4777-8777-777777777777",titulo:"Pessoa fictícia sem cobertura",origem:"Não identificada",etapa:"novo",responsavel:"Equipe QA",proxima_acao:"Conferir importação",prazo:null,versao:1,atualizado_em:new Date().toISOString()};
 await context.route("**/rest/v1/rpc/crm_operacao",route=>{
  const b=route.request().postDataJSON();
  if(b.p_acao==="config")return route.fulfill({json:{ativo:true,pode_editar:true,usuario_id:"33333333-3333-4333-8333-333333333333",equipe:[{id:"33333333-3333-4333-8333-333333333333",nome:"Equipe QA"}]}});
  if(b.p_acao==="listar")return route.fulfill({json:{total:1,filtradas:1,atrasadas:0,por_etapa:{novo:1},cards:[card]}});
  if(b.p_acao==="detalhe")return route.fulfill({json:{card,ia_disponivel:false,ia_motivo:"A importação da conversa ainda precisa ser conferida pela equipe.",historico:[],sugestoes:[]}});
  throw new Error("No mutation expected");
 });
 await context.route("**/api/sync/manual",route=>{aiCalls++;return route.fulfill({json:{ok:true}});});
 await page.goto(`/${CID}/crm-contatos`);
 await page.getByRole("button",{name:"Abrir oportunidade de Pessoa fictícia sem cobertura",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Pessoa fictícia sem cobertura",exact:true});
 await expect(dialog.getByRole("button",{name:"Analisar conversa com IA",exact:true})).toBeDisabled();
 await expect(dialog.getByText(/A importação da conversa ainda precisa ser conferida/)).toBeVisible();
 await expect(dialog.getByRole("button",{name:"Salvar acompanhamento",exact:true})).toBeEnabled();
 expect(aiCalls).toBe(0);
});

const OWNER="33333333-3333-4333-8333-333333333333";
function fixtureCard(id:string,titulo:string,etapa:CardCrm["etapa"]="novo"):CardCrm {
 return {id,client_id:CID,pessoa_id:null,conversa_id:null,titulo,origem:"indicacao",etapa,responsavel:"Equipe QA",responsavel_id:OWNER,proxima_acao:"Retornar ao contato",prazo:"2020-01-01T12:00:00Z",versao:1,atualizado_em:"2026-10-01T12:00:00Z"};
}
for(const width of [375,1440]) {
 test(`Rotina da clínica: filtros e paginação por coluna em ${width}px`,async({page,context})=>{
  await mockAccount(context,"admin");await page.setViewportSize({width,height:1000});
  let last:Record<string,any>={};
  await context.route("**/rest/v1/rpc/crm_operacao",route=>{
   const {p_acao,p_dados:d}=route.request().postDataJSON();
   if(p_acao==="config")return route.fulfill({json:{ativo:true,pode_editar:true,usuario_id:OWNER,equipe:[{id:OWNER,nome:"Equipe QA"}]}});
   expect(p_acao).toBe("listar");last=d;
   let cards=[fixtureCard("a","Primeiro retorno"),fixtureCard("b","Interesse de outra coluna","interesse")];
   if(d.paginas?.novo===12)cards=[fixtureCard("c","Retorno da segunda página"),cards[1]];
   const empty=d.filtro_responsavel==="sem";
   return route.fulfill({json:{total:53,hoje:2,atrasadas:2,sem_acao:0,agendados:1,entrada_total:3,limite_coluna:12,
    filtradas:empty?0:53,por_etapa:empty?{}:{novo:52,interesse:1},cards:empty?[]:cards}});
  });
  await page.goto(`/${CID}/crm-contatos`);
  await expect(page.getByRole("combobox",{name:"Mostrar",exact:true})).toHaveValue("hoje");
  await expect(page.getByRole("button",{name:"Abrir oportunidade de Interesse de outra coluna",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Mais em Novo contato",exact:true}).click();
  await expect(page.getByRole("button",{name:"Abrir oportunidade de Retorno da segunda página",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Abrir oportunidade de Interesse de outra coluna",exact:true})).toBeVisible();
  expect(last.paginas).toEqual({novo:12});
  await page.getByRole("combobox",{name:"Filtrar responsável",exact:true}).selectOption("meus");
  await expect.poll(()=>last.filtro_responsavel).toBe("meus");
  expect(last.paginas).toEqual({});
  await page.getByRole("combobox",{name:"Filtrar responsável",exact:true}).selectOption("sem");
  await expect(page.getByText("Nenhuma oportunidade encontrada.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Ver todas as oportunidades",exact:true}).click();
  await expect.poll(()=>last.rotina).toBe("todas");expect(last.filtro_responsavel).toBe("todos");
  await page.getByRole("combobox",{name:"Filtrar etapa",exact:true}).selectOption("interesse");
  await expect.poll(()=>last.filtro_etapa).toBe("interesse");
  await expect(page.getByRole("region",{name:"Novo contato",exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await test.info().attach("rotina-"+width,{body:await page.screenshot({fullPage:true}),contentType:"image/png"});
  console.log("CRM_VISUAL_"+width+":"+(await page.screenshot()).toString("base64"));
 });
 test(`Fila: consultar e escolher contato não altera registros até confirmar em ${width}px`,async({page,context})=>{
  await mockAccount(context,"admin");await page.setViewportSize({width,height:1000});
  let writes=0;let created:CardCrm|null=null;
  const contact={id:"66666666-6666-4666-8666-666666666666",nome:"Contato fictício da fila",telefone_final:"…0000",origem:"indicacao",conversa_id:"77777777-7777-4777-8777-777777777777",ultima_msg_em:"2026-10-01T12:00:00Z"};
  await context.route("**/rest/v1/rpc/crm_operacao",route=>{
   const {p_acao,p_dados:d}=route.request().postDataJSON();
   if(p_acao==="config")return route.fulfill({json:{ativo:true,pode_editar:true,usuario_id:OWNER,equipe:[{id:OWNER,nome:"Equipe QA"}]}});
   if(p_acao==="entrada")return route.fulfill({json:{total:created?0:1,contatos:created?[]:[contact]}});
   if(p_acao==="contatos")return route.fulfill({json:[contact]});
   if(p_acao==="listar")return route.fulfill({json:{total:created?1:0,hoje:0,atrasadas:0,sem_acao:created?1:0,entrada_total:created?0:1,agendados:0,filtradas:created?1:0,por_etapa:created?{novo:1}:{},cards:created?[created]:[]}});
   if(p_acao==="criar"){writes++;expect(d.responsavel_id).toBe(OWNER);expect(d.prazo).toBe("2030-11-01T11:30:00.000Z");expect(d.pessoa_id).toBe(contact.id);
    created={...fixtureCard(d.id,contact.nome),pessoa_id:contact.id,conversa_id:contact.conversa_id,prazo:null};return route.fulfill({json:created});}
   throw Error("Unexpected mutation "+p_acao);
  });
  await page.goto(`/${CID}/crm-contatos`);
  await page.getByRole("button",{name:"Ver contatos para acompanhar",exact:true}).click();
  const fila=page.getByRole("region",{name:"Fila de contatos para acompanhar",exact:true});
  await expect(fila.getByText("Contato fictício da fila …0000",{exact:true})).toBeVisible();
  expect(writes).toBe(0);
  await fila.getByRole("button",{name:"Acompanhar Contato fictício da fila",exact:true}).click();
  let modal=page.getByRole("dialog",{name:"Nova oportunidade",exact:true});
  await expect(modal.getByLabel("Nome do contato ou oportunidade",{exact:true})).toHaveValue(contact.nome);
  expect(writes).toBe(0);await page.keyboard.press("Escape");await expect(modal).not.toBeVisible();
  await fila.getByRole("button",{name:"Acompanhar Contato fictício da fila",exact:true}).click();
  modal=page.getByRole("dialog",{name:"Nova oportunidade",exact:true});
  await modal.getByRole("combobox",{name:"Responsável",exact:true}).selectOption(OWNER);
  await modal.getByLabel("Prazo da próxima ação",{exact:false}).fill("2030-11-01T08:30");
  await modal.getByRole("button",{name:"Criar oportunidade",exact:true}).click();
  await expect(modal).not.toBeVisible();expect(writes).toBe(1);
  await expect(fila.getByText("Nenhum contato sem oportunidade corresponde à busca.",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Abrir oportunidade de Contato fictício da fila",exact:true})).toBeVisible();
  await expect(page.getByRole("combobox",{name:"Mostrar",exact:true})).toHaveValue("todas");
 });
}
