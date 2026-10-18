import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAccount, CID } from "./fixtures";

const lead = "00000000-0000-4000-8000-000000000024";
const payload = {
  versao: 1,
  periodo: {
    de: "2026-10-01",
    ate: "2026-10-18",
    fuso: "America/Sao_Paulo",
    base: "coorte_entrada_crm_estado_atual",
  },
  resumo: {
    registros_crm: 25,
    com_conversa_verificada: 1,
    com_saida_observada: 1,
    sem_origem: 24,
    data_origem_ausente: 0,
    referencias_rastreadas: 0,
    sinal_agendamento_crm: 0,
    negocios_ganhos: 2,
    valor_negocios_ganhos: 1200,
    ganhos_sem_valor: 1,
    comparecimentos: null,
    receita_faturada: null,
    receita_recebida: null,
    receita_atribuida: null,
  },
  conversas: {
    total_periodo: 1,
    conflitos: 1,
    vinculos_invalidos: 0,
    sessoes_sem_provedor: 5,
  },
  por_fonte: [
    {
      provider: "flwchat",
      registros: 25,
      sem_origem: 24,
      sem_data_origem: 0,
      sem_etapa_mapeada: 0,
      com_conversa_verificada: 1,
      somente_identidade_legada: 0,
    },
  ],
  fontes: [
    {
      conexao_id: "00000000-0000-4000-8000-000000000010",
      provider: "flwchat",
      ativa: true,
      registros_historicos: 25,
      historico_desde: "2026-10-01T12:00:00Z",
      ultima_gravacao: "2026-10-18T12:00:00Z",
      backfill_concluido: null,
      ultimo_sucesso_compartilhado: "2026-10-18T12:00:00Z",
      erro_sync_compartilhado: false,
      sem_origem: 24,
      sem_data_origem: 0,
    },
  ],
  registros: [
    {
      id: lead,
      provider: "flwchat",
      etapa: "Novo lead",
      desfecho: "open",
      origem_crm: "Não atribuída",
      entrada_em: "2026-10-10T12:00:00Z",
      data_origem_ausente: false,
      conversas_verificadas: 1,
      com_saida: 1,
      referencias_rastreadas: 0,
      identidade_legada: false,
    },
  ],
  paginacao: { offset: 0, limite: 20, total: 25 },
  limitacoes: [
    "Mensagem de saída pode ser automática.",
    "Identidade legada não comprova atribuição.",
  ],
};
for (const width of [375, 1280])
  test(`jornada comercial tem evidência e navegação em ${width}px`, async ({
    context,
    page,
  }) => {
    await mockAccount(context, "viewer");
    await page.setViewportSize({ width, height: 900 });
    await context.route("**/rest/v1/rpc/jornada_qualidade", (route) => {
      const args = route.request().postDataJSON();
      expect(args.p_client).toBe(CID);
      return route.fulfill({
        json: args.p_offset
          ? {
              ...payload,
              registros: [],
              paginacao: { offset: 20, limite: 20, total: 25 },
            }
          : payload,
      });
    });
    await context.route(
      "**/rest/v1/rpc/jornada_eventos_comerciais",
      (route) => {
        expect(route.request().postDataJSON()).toEqual({
          p_client: CID,
          p_lead: lead,
        });
        return route.fulfill({
          json: {
            lead_id: lead,
            provider: "flwchat",
            origem_crm: null,
            total_eventos: 1,
            limitado: false,
            eventos: [
              {
                chave: "fixture:1",
                ocorreu_em: "2026-10-10T12:00:00Z",
                fonte: "crm_leads",
                tipo: "entrada_crm",
                certeza: "verificado",
                associacao: "ID da própria fonte",
                observacao: "Data informada na origem",
              },
            ],
          },
        });
      },
    );
    await page.goto(`/${CID}/jornada`);
    const section = page.getByRole("region", {
      name: "Inteligência comercial 360",
    });
    await expect(
      section.getByText("Comparecimento e receita: indisponíveis"),
    ).toBeVisible();
    await expect(section.getByText("Lacunas no preenchimento")).toBeVisible();
    await section
      .getByRole("button", { name: /Ver eventos do registro/ })
      .click();
    await expect(
      section.getByText("Verificado na fonte", { exact: false }),
    ).toBeVisible();
    await expect(
      section.getByText("Não comprova origem de campanha.", { exact: false }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const axe = await new AxeBuilder({ page })
      .include('section[aria-label="Inteligência comercial 360"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    await section
      .getByRole("button", { name: "Próximos", exact: true })
      .click();
    await expect(section.getByText("21–25 de 25")).toBeVisible();
    await expect(
      section.getByLabel("Eventos comerciais do registro"),
    ).toHaveCount(0);
  });
test("fonte indisponível ou contrato antigo não é tratado como zero", async ({
  context,
  page,
}) => {
  await mockAccount(context, "admin");
  let fail = true;
  await context.route("**/rest/v1/rpc/jornada_qualidade", (route) =>
    route.fulfill(
      fail ? { status: 503, json: { message: "offline" } } : { json: [] },
    ),
  );
  await page.goto(`/${CID}/jornada`);
  const section = page.getByRole("region", {
    name: "Inteligência comercial 360",
  });
  await expect(section.getByRole("alert")).toContainText(
    "Não foi possível conferir",
  );
  fail = false;
  await section.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(section.getByRole("alert")).toContainText(
    "contrato de qualidade esperado",
  );
  await expect(
    section.getByText("Registros no CRM", { exact: true }),
  ).toHaveCount(0);
});
