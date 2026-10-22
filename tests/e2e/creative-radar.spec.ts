import { test, expect } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(readFileSync(new URL("./creative-fixture.json", import.meta.url), "utf8")) as typeof import("./creative-fixture.json");

test("Radar preserves real publication links, rejects invalid hashtags and gates TikTok until configured", async ({page,context}) => {
  await mockAccount(context,"admin");
  let tiktok=false;
  const enqueued: any[]=[];
  await context.route("**/rest/v1/**", async route=>{
    const name=new URL(route.request().url()).pathname.split("/").at(-1)!;
    if(name === "creative_enqueue") {enqueued.push(route.request().postDataJSON());return route.fulfill({json:fixture.analysis.job_id});}
    const rows: Record<string,unknown>={
      instagram_accounts:[{id:fixture.source.account_id,client_id:CID,active:true,ig_username:"qa_ficticia"}],instagram_posts:[],
      creative_sources:[],creative_analyses:[],creative_structures:[],creative_adaptations:[],creative_jobs:[],
      creative_worker_health:{seen_at:new Date().toISOString(),capabilities:{external_search:true,external_search_instagram:true,external_search_tiktok:tiktok}},
      creative_discoveries:[
        {id:"bad",platform:"instagram",canonical_url:"https://www.instagram.com/explore/tags/chadson",title:"Hashtag incorreta não é publicação",metadata:{}},
        {id:"valid",platform:"instagram",canonical_url:"https://www.instagram.com/p/QA/",title:"Referência pública fictícia válida",metadata:{views:100,likes:5}},
      ],
    };
    if(name in rows)return route.fulfill({json:rows[name]});return route.fallback();
  });
  await context.route("**/api/sync/manual",route=>route.fulfill({json:{ok:true}}));
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page.getByRole("button",{name:"Radar de mercado",exact:true}).click();
  await expect(page.getByText("Hashtag incorreta não é publicação",{exact:true})).toHaveCount(0);
  await expect(page.getByText("Referência pública fictícia válida",{exact:true})).toBeVisible();
  const platform=page.getByRole("combobox",{name:"Plataforma",exact:true});
  await expect(platform.locator('option[value="tiktok"]')).toBeDisabled();
  const query=page.getByRole("textbox",{name:"Hashtag do Instagram",exact:true});
  await query.fill("marketing médico");
  await page.getByRole("button",{name:"Pesquisar referências públicas",exact:true}).click();
  expect(enqueued).toHaveLength(0);
  await query.fill("marketingmedico");
  await page.getByRole("button",{name:"Pesquisar referências públicas",exact:true}).click();
  await expect.poll(()=>enqueued.length).toBe(1);
  expect(enqueued[0].p_input).toMatchObject({platform:"instagram",query:"marketingmedico"});
  tiktok=true;await page.reload();
  await page.getByRole("button",{name:"Radar de mercado",exact:true}).click();
  await expect(platform.locator('option[value="tiktok"]')).toBeEnabled();
  await platform.selectOption("tiktok");
  await page.getByRole("textbox",{name:"Tema ou palavra-chave do TikTok",exact:true}).fill("marketing médico");
  await page.getByRole("button",{name:"Pesquisar referências públicas",exact:true}).click();
  await expect.poll(()=>enqueued.length).toBe(2);
  expect(enqueued[1].p_input).toMatchObject({platform:"tiktok",query:"marketing médico"});
});
