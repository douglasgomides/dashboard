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
  await expect(platform.locator('option[value="tiktok"]')).toHaveJSProperty("disabled",true);
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
  await expect(platform.locator('option[value="tiktok"]')).toHaveJSProperty("disabled",false);
  await platform.selectOption("tiktok");
  await page.getByRole("textbox",{name:"Tema ou palavra-chave do TikTok",exact:true}).fill("marketing médico");
  await page.getByRole("button",{name:"Pesquisar referências públicas",exact:true}).click();
  await expect.poll(()=>enqueued.length).toBe(2);
  expect(enqueued[1].p_input).toMatchObject({platform:"tiktok",query:"marketing médico"});
});

test("Radar filters existing references, saves once and persists a pauta with the original source", async ({ page, context }) => {
  await mockAccount(context, "admin");
  const references = [
    { id: "44444444-4444-4444-8444-444444444444", platform: "instagram", canonical_url: "https://www.instagram.com/p/RADARPT/", title: "Pele e melasma: referência fictícia", format: "carrossel", observed_at: "2026-10-22T12:00:00Z", metadata: { views: 100, likes: 5, posted_at: "2026-10-20T23:59:59Z", caption: "Cuidados com a pele e prevenção do melasma. Entenda quais hábitos podem ajudar no cuidado diário e converse com a sua dermatologista antes de iniciar qualquer tratamento." } },
    { id: "55555555-5555-4555-8555-555555555555", platform: "instagram", canonical_url: "https://www.instagram.com/p/RADARES/", title: "Piel y manchas: referencia ficticia", format: "reels", observed_at: "2026-10-22T12:00:00Z", metadata: { posted_at: "2026-10-21T00:00:00Z", caption: "Cuidados de la piel y prevención de las manchas. Conoce los hábitos para cuidar tu rostro y habla con tu dermatóloga antes de iniciar cualquier tratamiento." } },
  ];
  const bookmarks: any[] = [], pautas: any[] = [], writes: string[] = [];
  await context.route("**/rest/v1/**", async route => {
    const req = route.request(), name = new URL(req.url()).pathname.split("/").at(-1)!;
    if (name === "creative_enqueue") throw new Error("Filters must not start a paid collection");
    if (name === "creative_save_reference") {
      writes.push(name); expect(req.postDataJSON()).toEqual({ p_client_id: CID, p_discovery_id: references[0].id });
      bookmarks[0] ??= { id: "66666666-6666-4666-8666-666666666666", client_id: CID, account_id: fixture.source.account_id, discovery_id: references[0].id, canonical_url: references[0].canonical_url, saved_at: "2026-10-22T12:00:00Z", pauta_id: null, discovery: references[0] };
      return route.fulfill({ json: bookmarks[0] });
    }
    if (name === "creative_reference_to_pauta") {
      writes.push(name); const body = req.postDataJSON(); expect(body.p_client_id).toBe(CID); expect(body.p_reference_id).toBe(bookmarks[0].id);
      pautas[0] ??= { id: "77777777-7777-4777-8777-777777777777", client_id: CID, ideia_id: `radar:${bookmarks[0].id}`, titulo: body.p_title, motivo: body.p_reason, formato: "carrossel", objetivo: body.p_objective, status: "escolhida", origem_tipo: "post", origem_texto: references[0].canonical_url, roteiro: ["Orientação fictícia da equipe"], dia: null, gancho: null, cta: null, aviso: "Revisar antes de produzir", post_id: null };
      bookmarks[0].pauta_id = pautas[0].id; return route.fulfill({ json: pautas[0].id });
    }
    const rows: Record<string, unknown> = {
      instagram_accounts: [{ id: fixture.source.account_id, client_id: CID, active: true, ig_username: "qa_ficticia" }], instagram_posts: [],
      creative_sources: [], creative_analyses: [], creative_structures: [], creative_adaptations: [], creative_jobs: [],
      creative_worker_health: { seen_at: new Date().toISOString(), capabilities: { external_search: true } },
      creative_discoveries: references, creative_reference_bookmarks: bookmarks, pautas_conteudo: pautas,
    };
    if (name in rows) return route.fulfill({ json: rows[name] }); return route.fallback();
  });
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page.getByRole("button", { name: "Radar de mercado", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 referência(s) nos filtros" })).toBeVisible();
  await page.getByRole("textbox", { name: "Tema na legenda", exact: true }).fill("melasma");
  await page.getByRole("combobox", { name: "Especialidade no texto", exact: true }).selectOption("dermatologia");
  await page.getByRole("combobox", { name: "Idioma estimado", exact: true }).selectOption("pt");
  await page.getByLabel("Publicação até", { exact: true }).fill("2026-10-20");
  await expect(page.getByRole("heading", { name: references[0].title, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: references[1].title, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar referência", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salva", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Preparar pauta", exact: true }).click();
  await page.getByRole("textbox", { name: "Tema da pauta", exact: true }).fill("QA fictício: dúvidas sobre proteção da pele");
  await page.getByRole("textbox", { name: "Por que faz sentido para a clínica", exact: true }).fill("A equipe fictícia escolheu responder às dúvidas de cuidados diários com a pele.");
  await page.getByRole("button", { name: "Salvar pauta no planejador", exact: true }).click();
  await expect(page.getByRole("link", { name: "Ver pauta no planejador", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Radar de mercado", exact: true }).click();
  await page.getByRole("checkbox", { name: "Somente referências salvas", exact: true }).check();
  await expect(page.getByRole("heading", { name: references[1].title, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Salva", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Ver pauta no planejador", exact: true }).click();
  await expect(page.getByText(pautas[0].titulo, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Motivo e roteiro", exact: true }).click();
  await expect(page.getByRole("link", { name: "Conferir referência original", exact: true })).toHaveAttribute("href", references[0].canonical_url);
  expect(writes).toEqual(["creative_save_reference", "creative_reference_to_pauta"]); expect(pautas).toHaveLength(1);
});
