import { test, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAccount, CID } from "./fixtures";
import {
  newDocument,
  type ProductionDocument,
} from "../../src/lib/creative-intelligence/production";
const ACCOUNT = "44444444-4444-4444-8444-444444444444",
  PROJECT = "55555555-5555-4555-8555-555555555555";
async function studio(
  context: BrowserContext,
  role: "admin" | "viewer",
  options: {
    conflict?: boolean;
    video?: boolean;
    reference?: "passed" | "failed";
  } = {},
) {
  await mockAccount(context, role);
  const d = newDocument(options.video ? "reels" : "carrossel");
  d.title = "Projeto de conteúdo da clínica";
  if (d.format === "carrossel") {
    d.slides[0].copy = "Sua saúde merece informação clara.";
    d.brand.name = "Clínica de teste";
    d.brand.signature = "Equipe médica";
  }
  const revisions: {
    id: string;
    project_id: string;
    revision: number;
    document: ProductionDocument;
    created_at: string;
  }[] = [
    {
      id: "first",
      project_id: PROJECT,
      revision: 1,
      document: d,
      created_at: new Date().toISOString(),
    },
  ];
  let saved = 0;
  await context.route("**/rest/v1/instagram_accounts**", (r) =>
    r.fulfill({
      json: [
        {
          id: ACCOUNT,
          client_id: CID,
          ig_username: "clinicadeteste",
          active: true,
        },
      ],
    }),
  );
  await context.route("**/rest/v1/rpc/creative_worker_health", (r) =>
    r.fulfill({
      json: {
        seen_at: new Date().toISOString(),
        capabilities: {
          vision: true,
          production_render: true,
          production_video_plan: true,
          production_image: false,
          production_reference: !!options.reference,
        },
      },
    }),
  );
  await context.route("**/rest/v1/creative_productions**", (r) =>
    r.fulfill({
      json: [
        {
          id: PROJECT,
          client_id: CID,
          account_id: ACCOUNT,
          adaptation_id: null,
          source_id: options.reference
            ? "66666666-6666-4666-8666-666666666666"
            : null,
          title: d.title,
          format: d.format,
          current_revision: revisions[0].revision,
          created_at: new Date().toISOString(),
        },
      ],
    }),
  );
  await context.route("**/rest/v1/creative_production_revisions**", (r) =>
    r.fulfill({ json: revisions }),
  );
  await context.route("**/rest/v1/rpc/creative_production_save", async (r) => {
    const body = r.request().postDataJSON();
    expect(body.p_client_id).toBe(CID);
    expect(body.p_project_id).toBe(PROJECT);
    if (options.conflict)
      return r.fulfill({
        status: 409,
        json: { code: "40001", message: "Outra pessoa salvou uma revisão" },
      });
    saved++;
    const revision = revisions[0].revision + 1;
    revisions.unshift({
      id: `revision-${revision}`,
      project_id: PROJECT,
      revision,
      document: body.p_document,
      created_at: new Date().toISOString(),
    });
    return r.fulfill({ json: revision });
  });
  if (options.reference && d.format === "carrossel") {
    const source = "66666666-6666-4666-8666-666666666666",
      original = "77777777-7777-4777-8777-777777777777",
      image = "88888888-8888-4888-8888-888888888888";
    await context.route("**/rest/v1/creative_sources**", (r) =>
      r.fulfill({
        json:
          new URL(r.request().url()).searchParams.get("select") === "origin"
            ? (r.request().headers()["accept"] || "").includes(
                "vnd.pgrst.object",
              )
              ? { origin: "own" }
              : [{ origin: "own" }]
            : [],
      }),
    );
    await context.route("**/rest/v1/creative_assets**", (r) =>
      r.fulfill({
        json: [
          {
            id: original,
            kind: "image",
            position: 1,
            storage_path: "original.png",
            source_id: source,
          },
        ],
      }),
    );
    await context.route("**/rest/v1/creative_production_media**", (r) =>
      r.fulfill({
        json: [
          {
            id: image,
            client_id: CID,
            account_id: ACCOUNT,
            project_id: PROJECT,
            purpose: "image",
            mime: "image/png",
            storage_path: "candidate.png",
            status: "ready",
            bytes: 100,
          },
        ],
      }),
    );
    await context.route("**/storage/v1/object/sign/**", (r) =>
      r.fulfill({ json: { signedURL: "/object/sign/test.png?token=fake" } }),
    );
    await context.route("**/rest/v1/creative_production_outputs**", (r) =>
      r.fulfill({
        json: [
          {
            job_id: "proposal",
            revision: 1,
            kind: "production_image",
            result: {
              media_ids: [image],
              reference_slides: [
                {
                  slide_index: 0,
                  media_id: image,
                  copy: d.slides[0].copy,
                  reference: { origin: "creative", id: original },
                  quality: {
                    content_text: d.slides[0].copy,
                    footer_text: "Equipe médica",
                    readable: true,
                    layout_preserved: true,
                    identity_preserved: true,
                    text_matches: options.reference === "passed",
                    issues:
                      options.reference === "passed"
                        ? []
                        : ["Texto incompleto"],
                  },
                },
              ],
            },
          },
        ],
      }),
    );
  }
  return {
    revisions,
    get saved() {
      return saved;
    },
  };
}
for (const width of [375, 1280])
  test(`estúdio de carrossel edita, salva e mantém revisão em ${width}px`, async ({
    context,
    page,
  }) => {
    const fixture = await studio(context, "admin");
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/${CID}/inteligencia-criativa`);
    await page
      .getByRole("button", { name: "Estúdio de produção", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Projeto de conteúdo da clínica/ })
      .click();
    const editor = page.getByRole("region", { name: "Estúdio de produção" });
    await expect(
      editor.getByRole("img", { name: /Prévia do slide 1/ }),
    ).toBeVisible();
    await editor
      .getByRole("textbox", { name: "Texto do slide 1", exact: true })
      .fill("Conteúdo claro para decisões melhores.");
    await expect(
      editor.getByRole("img", { name: /Conteúdo claro/ }),
    ).toBeVisible();
    await editor
      .getByRole("button", { name: "Salvar revisão", exact: true })
      .click();
    await expect.poll(() => fixture.saved).toBe(1);
    expect(fixture.revisions.at(-1)?.document).toMatchObject({
      slides: [{ copy: "Sua saúde merece informação clara." }],
    });
    await editor.getByRole("button", { name: "Desfazer edição" }).click();
    await expect(
      editor.getByRole("textbox", { name: "Texto do slide 1", exact: true }),
    ).toHaveValue("Sua saúde merece informação clara.");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const axe = await new AxeBuilder({ page })
      .include('section[aria-label="Estúdio de produção"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
  });
test("viewer lê a peça e não pode editar, enviar ou renderizar", async ({
  context,
  page,
}) => {
  await studio(context, "viewer");
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page
    .getByRole("button", { name: "Estúdio de produção", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Projeto de conteúdo da clínica/ })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Texto do slide 1", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Gerar prévia / exportação" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Salvar revisão", exact: true }),
  ).toBeDisabled();
});
test("conflito não apaga edição local nem declara salvamento", async ({
  context,
  page,
}) => {
  await studio(context, "admin", { conflict: true });
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page
    .getByRole("button", { name: "Estúdio de produção", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Projeto de conteúdo da clínica/ })
    .click();
  await page
    .getByRole("textbox", { name: "Texto do slide 1", exact: true })
    .fill("Minha edição preservada.");
  await page
    .getByRole("button", { name: "Salvar revisão", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Outra pessoa");
  await expect(
    page.getByRole("textbox", { name: "Texto do slide 1", exact: true }),
  ).toHaveValue("Minha edição preservada.");
});
test("vídeo exige gravação e distingue roteiro de fala real", async ({
  context,
  page,
}) => {
  await studio(context, "admin", { video: true });
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page
    .getByRole("button", { name: "Estúdio de produção", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Projeto de conteúdo da clínica/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Preparar edição com IA" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Gerar prévia / exportação" }),
  ).toBeDisabled();
  await expect(
    page.getByText("A IA propõe cortes sobre a fala real.", { exact: false }),
  ).toBeVisible();
});

test("estúdio reconhece worker reconectado sem recarregar ou apagar a edição", async ({
  context,
  page,
}) => {
  await studio(context, "admin");
  let connected = false;
  await context.route("**/rest/v1/rpc/creative_worker_health", (r) =>
    r.fulfill({
      json: {
        seen_at: new Date(Date.now() - (connected ? 0 : 180000)).toISOString(),
        capabilities: { vision: true, production_render: true },
      },
    }),
  );
  await page.clock.install();
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page
    .getByRole("button", { name: "Estúdio de produção", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Projeto de conteúdo da clínica/ })
    .click();
  const render = page.getByRole("button", {
    name: "Gerar prévia / exportação",
    exact: true,
  });
  await expect(render).toBeDisabled();
  connected = true;
  await page.clock.fastForward(31000);
  await expect(render).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "Texto do slide 1", exact: true }),
  ).toHaveValue("Sua saúde merece informação clara.");
});

test("referência usa arte inteira e impede exportar copy desatualizada", async ({
  context,
  page,
}) => {
  const fixture = await studio(context, "admin", { reference: "passed" });
  let input: any;
  await context.route("**/rest/v1/rpc/creative_enqueue", (r) => {
    input = r.request().postDataJSON();
    return r.fulfill({ json: "99999999-9999-4999-8999-999999999999" });
  });
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page
    .getByRole("button", { name: "Estúdio de produção", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Projeto de conteúdo da clínica/ })
    .click();
  const editor = page.getByRole("region", { name: "Estúdio de produção" });
  await expect(
    editor.getByRole("img", { name: "Modelo original do slide 1" }),
  ).toBeVisible();
  await expect(editor.getByLabel("Tamanho do texto")).toHaveCount(0);
  const exportButton = editor.getByRole("button", {
    name: "Gerar prévia / exportação",
  });
  await expect(exportButton).toBeDisabled();
  await editor
    .getByRole("button", { name: "Gerar slide mantendo o modelo" })
    .click();
  await expect.poll(() => input?.p_input?.full_slide).toBe(true);
  expect(input.p_input.reference).toEqual({
    origin: "creative",
    id: "77777777-7777-4777-8777-777777777777",
  });
  await editor
    .getByRole("button", { name: "Aplicar arte ao slide 1", exact: true })
    .click();
  await expect(exportButton).toBeEnabled();
  await expect(editor.locator(".production-slide svg image")).toHaveCount(1);
  await expect(editor.locator(".production-slide svg text")).toHaveCount(0);
  await editor
    .getByRole("button", { name: "Salvar revisão", exact: true })
    .click();
  await expect.poll(() => fixture.saved).toBe(1);
  await editor
    .getByRole("textbox", { name: "Texto do slide 1", exact: true })
    .fill("Nova copy exige nova arte.");
  await expect(
    editor.getByText(
      "A copy mudou. Gere uma nova arte antes de exportar este slide.",
    ),
  ).toBeVisible();
  await expect(exportButton).toBeDisabled();
  await expect(
    editor.getByRole("button", {
      name: "Aplicar arte ao slide 1",
      exact: true,
    }),
  ).toBeDisabled();
});
test("conferência com texto divergente não permite aplicar a arte", async ({
  context,
  page,
}) => {
  await studio(context, "admin", { reference: "failed" });
  await page.goto(`/${CID}/inteligencia-criativa`);
  await page
    .getByRole("button", { name: "Estúdio de produção", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Projeto de conteúdo da clínica/ })
    .click();
  await expect(
    page.getByRole("button", { name: "Aplicar arte ao slide 1", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Revise e gere outra prévia. Texto incompleto/),
  ).toBeVisible();
});
