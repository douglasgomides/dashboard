import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { CID, mockAccount } from "./fixtures";
import type { CardCrm, EventoCrm, SugestaoCrm } from "../../src/lib/crm-kanban";

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
   if(b.p_acao==="config")return reply({ativo:true,pode_editar:true});
   if(b.p_acao==="contatos")return reply([{id:"66666666-6666-4666-8666-666666666666",nome:"Pessoa fictícia QA",origem:"indicacao",telefone_final:"…0000",conversa_id:"77777777-7777-4777-8777-777777777777"}]);
   if(b.p_acao==="listar")return reply({total:cards.length,filtradas:cards.length,atrasadas:0,por_etapa:Object.fromEntries(cards.map(c=>[c.etapa,1])),cards});
   if(b.p_acao==="detalhe")return reply({card:cards[0],historico:history,sugestoes:suggestions});
   if(b.p_acao==="criar"){
    cards=[{...d,client_id:CID,pessoa_id:d.pessoa_id,conversa_id:d.conversa_id,origem:d.origem||"Não identificada",etapa:"novo",versao:1,atualizado_em:new Date().toISOString()}];
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
  await context.route("**/api/sync/manual",route=>route.fulfill({json:{ok:true}}));
  await page.goto(`/${CID}/crm-contatos`);
  await expect(page.getByRole("button",{name:"Nova oportunidade",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Nova oportunidade",exact:true}).click();
  const create=page.getByRole("dialog",{name:"Nova oportunidade",exact:true});
  await create.getByRole("button",{name:/Pessoa fictícia QA/}).click();
  await create.getByLabel("Responsável (nome)",{exact:true}).fill("Equipe QA");
  await create.getByLabel("Próxima ação",{exact:true}).fill("Entender o melhor horário");
  await create.getByRole("button",{name:"Criar oportunidade",exact:true}).click();
  await expect(create).not.toBeVisible();
  await page.getByRole("button",{name:"Abrir oportunidade de Pessoa fictícia QA",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Pessoa fictícia QA",exact:true});
  await expect(dialog.getByRole("heading",{name:"Histórico da oportunidade",exact:true})).toBeVisible();
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
  await dialog.getByRole("button",{name:"Desfazer última movimentação",exact:true}).click();
  await expect.poll(()=>cards[0].etapa).toBe("interesse");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole("button",{name:"Abrir oportunidade de Pessoa fictícia QA",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
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
