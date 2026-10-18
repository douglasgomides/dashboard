import { test, expect } from "@playwright/test";
import { mockAccount, CID } from "./fixtures";
import { plan, idea } from "../fixtures/campaign-strategy";
for(const width of [375,1280]) test(`campanha mostra estratégia online e presencial em ${width}px`,async({context,page})=>{
 await mockAccount(context,"admin");
 await context.route("**/rest/v1/campanhas_ideias**",r=>{
  expect(new URL(r.request().url()).searchParams.get("client_id")).toBe(`eq.${CID}`);
  return r.fulfill({json:[{...idea,id:"campaign-test",client_id:CID,estado:"proposta",criado_em:new Date().toISOString(),resultado:null}]});
 });
 await page.setViewportSize({width,height:1000});await page.goto(`/${CID}/campanhas`);
 await page.getByRole("button",{name:"Abrir estratégia completa",exact:true}).click();
 for(const name of ["Estratégia online","Estratégia presencial","Da captação à continuidade","Sequência de execução","Recursos e orçamento","Medição e ajustes"])
  await expect(page.getByRole("region",{name,exact:true})).toBeVisible();
 await expect(page.getByRole("region",{name:"Estratégia presencial",exact:true})).toContainText(plan.presencial[0].rastreio);
 await expect(page.getByRole("button",{name:"Copiar plano completo",exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("sugestão antiga permanece acessível sem selo de plano completo",async({context,page})=>{
 await mockAccount(context,"viewer");
 await context.route("**/rest/v1/campanhas_ideias**",r=>r.fulfill({json:[{...idea,estrategia:null,id:"legacy",estado:"proposta",criado_em:new Date().toISOString()}]}));
 await page.goto(`/${CID}/campanhas`);
 await expect(page.getByText("Sugestão anterior · sem plano estratégico completo",{exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Abrir estratégia completa",exact:true})).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Gerar novas estratégias",exact:true})).toHaveCount(0);
});
test("erro de consulta de campanhas não vira ausência de estratégia",async({context,page})=>{
 await mockAccount(context,"admin");
 await context.route("**/rest/v1/campanhas_ideias**",r=>r.fulfill({status:503,json:{message:"Source unavailable"}}));
 await page.goto(`/${CID}/campanhas`);
 await expect(page.getByText("Não foi possível carregar as estratégias. Isso não confirma ausência de planos.",{exact:true})).toBeVisible();
 await expect(page.getByText("Ainda sem estratégias.",{exact:false})).toHaveCount(0);
});
