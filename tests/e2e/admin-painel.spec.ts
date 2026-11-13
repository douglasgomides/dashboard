import { test, expect, type Page } from "@playwright/test";
import { CID, mockAccount } from "./fixtures";
import { mockCarteira, mockConferencia, mockIntegracoes } from "./admin-dados";
import { abrirVerTudo } from "./apoio-cinco-segundos";

// Telas da equipe no desenho do painel: contadores em cartões no topo, lista com chips de status e próxima ação,
// método recolhido e nenhuma rolagem lateral em 375 e 1440.

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

async function abrir(page: Page, context: import("@playwright/test").BrowserContext, caminho: string, width: number) {
  await mockAccount(context, "admin");
  await mockCarteira(context);
  await mockConferencia(context);
  await mockIntegracoes(context);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(caminho);
}

for (const width of [375, 1440]) {
  test(`Carteira: veredito, clínicas por urgência e, em Ver tudo, contadores e filtros em ${width}px`, async ({ page, context }) => {
    await abrir(page, context, "/admin", width);
    const linhas = page.getByRole("region", { name: "Clínicas da carteira" }).locator(".adm-linha");
    await expect(linhas).toHaveCount(6);
    // Mais problemas abertos primeiro (padrão): Dra. Carla (2 alertas, nota mais baixa), Dra. Ana (2), e a sem alerta por último.
    await expect(linhas.nth(0)).toContainText("Dra. Carla Mendes");
    await expect(linhas.nth(1)).toContainText("Dra. Ana Souza");
    // "Sem acesso criado" não conta como urgência (13/11/2026): as duas sem problema urgente (Sorriso e Dr. Diego, que só não tem
    // acesso) ficam no fim, em qualquer ordem entre si.
    await expect(linhas.nth(3)).toContainText("Clínica Sorriso");
    await expect(linhas.first().locator(".nx-tag").first()).toHaveText(/Problema/);
    await expect(linhas.first()).toHaveClass(/adm-linha--alerta/);

    // Os 6 contadores de antes moram no "Ver tudo", fechado até alguém abrir.
    const verTudo = page.locator("details.adm-urgencia__ver-tudo");
    await expect(verTudo).toHaveJSProperty("open", false);
    await abrirVerTudo(page, ".adm-carteira");
    await expect(verTudo).toHaveJSProperty("open", true);
    const resumo = page.getByRole("group", { name: "Resumo da carteira" });
    await expect(resumo.locator(".adm-cont")).toHaveCount(6);
    await expect(resumo.getByRole("button", { name: /^Fonte parada/ })).toHaveCount(0);
    await expect(resumo.locator(".adm-cont", { hasText: "Fonte parada ou com erro" }).locator(".adm-cont__valor")).toHaveText("2");
    expect(await semRolagemLateral(page)).toBe(true);

    // O cartão "Fonte com problema" filtra a lista, também pelo teclado.
    const atencao = resumo.getByRole("button", { name: /^Fonte com problema/ });
    await atencao.focus();
    await page.keyboard.press("Enter");
    await expect(atencao).toHaveAttribute("aria-pressed", "true");
    await expect(linhas).toHaveCount(3);
    // quick-ver-tudo: os chips Todos, Com problema, Sem ROI e Não entra saíram (eram os mesmos filtros dos contadores); fica só "Sem acesso criado".
    await expect(page.getByRole("button", { name: /^Com problema/ })).toHaveCount(0);

    // Acesso do médico: o alerta real (não entra há mais de 14 dias) e, ao lado, o fato neutro da equipe (sem acesso criado).
    await resumo.getByRole("button", { name: /^Clínicas na carteira/ }).click();
    const naoEntra = resumo.locator(".adm-cont", { hasText: "Médico não entra" });
    await expect(naoEntra.locator(".adm-cont__valor")).toHaveText("1");
    await expect(naoEntra).toContainText("2 sem acesso criado");
    await expect(page.getByText(/KOMMO_API_TOKEN/).first()).toBeVisible();
    const cartaoNaoEntra = resumo.getByRole("button", { name: /^Médico não entra/ });
    await cartaoNaoEntra.click();
    await expect(cartaoNaoEntra).toHaveAttribute("aria-pressed", "true");
    await expect(linhas).toHaveCount(1);
    await expect(linhas.first()).toContainText("Dra. Ana Souza");
    await expect(linhas.first()).toContainText("Não entra há 37 dias");
    await page.getByRole("button", { name: /^Sem acesso criado/ }).click();
    await expect(linhas).toHaveCount(2);
    await resumo.getByRole("button", { name: /^Clínicas na carteira/ }).click();

    // Sem ROI calculável: separa cliente (CRM), equipe (fonte ou etapa) e "não se aplica" (0 vendas). Só os dois primeiros contam.
    const semRoi = resumo.locator(".adm-cont", { hasText: "Sem ROI calculável" });
    await expect(semRoi.locator(".adm-cont__valor")).toHaveText("4");
    await expect(semRoi).toContainText("1 cliente (CRM)");
    await expect(semRoi).toContainText("3 equipe");
    await expect(semRoi).toContainText("1 não se aplica");
    await resumo.getByRole("button", { name: /^Sem ROI calculável/ }).click();
    await expect(linhas).toHaveCount(4);
    await resumo.getByRole("button", { name: /^Clínicas na carteira/ }).click();

    // Busca visível e ligada à lista.
    await resumo.getByRole("button", { name: /^Clínicas na carteira/ }).click();
    await page.getByRole("searchbox", { name: "Buscar cliente" }).fill("sorriso");
    await expect(linhas).toHaveCount(1);
    await expect(linhas.first()).toContainText("Clínica Sorriso");
    expect(await semRolagemLateral(page)).toBe(true);

    // O aviso de dado incompleto continua na tela, curto.
    await expect(page.getByText(/Retorno \(ROI\) e nota das fontes só aparecem quando há dado para calcular/)).toBeVisible();
  });

  test(`Conferência: cartões do que está ok e com problema, próximo passo em cada ponto e método recolhido em ${width}px`, async ({ page, context }) => {
    await abrir(page, context, "/admin/conferencia", width);
    const resumo = page.getByRole("group", { name: "Resumo da conferência" });
    await expect(resumo.locator(".adm-cont")).toHaveCount(6);
    await expect(resumo.locator(".adm-cont", { hasText: "Conferidos e ok" }).locator(".adm-cont__valor")).toHaveText("1");
    await expect(page.locator(".adm-item")).toHaveCount(3);
    await expect(page.locator(".adm-item").first()).toContainText("O que fazer:");
    // A etapa que falhou continua avisada.
    await expect(page.getByText(/Uma etapa falhou \(Fontes obrigatórias\)/)).toBeVisible();

    const metodo = page.locator("details.nx-metodo", { hasText: "Como a conferência funciona" });
    await expect(metodo).not.toHaveAttribute("open", "");
    await metodo.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(metodo).toHaveAttribute("open", "");
    await expect(metodo).toContainText("Só leitura");

    await resumo.getByRole("button", { name: /^Gravidade alta/ }).click();
    await expect(page.locator(".adm-item")).toHaveCount(1);
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Integrações: cartões de em dia e com erro, conector com chip e atalho para corrigir pelo teclado em ${width}px`, async ({ page, context }) => {
    await abrir(page, context, "/admin/integracoes", width);
    const resumo = page.getByRole("group", { name: "Resumo das conexões" });
    await expect(resumo.locator(".adm-cont")).toHaveCount(5);
    await expect(resumo.locator(".adm-cont", { hasText: "Com erro" }).locator(".adm-cont__valor")).toHaveText("2");
    const ads = page.getByRole("button", { name: "Ver clientes de Anúncios Meta", exact: true });
    await expect(ads).toContainText("1 para corrigir");
    await ads.focus();
    await page.keyboard.press("Enter");
    await expect(ads).toHaveAttribute("aria-expanded", "true");
    const lista = ads.locator("..");
    await expect(lista.locator(".adm-conector__cli").first()).toContainText("Com erro");
    await expect(lista.getByRole("link", { name: /Configurar/ }).first()).toHaveAttribute("href", /\/admin\//);
    expect(await semRolagemLateral(page)).toBe(true);
  });

  test(`Configurar cliente: seções em cartão, rótulos ligados aos campos e índice das seções em ${width}px`, async ({ page, context }) => {
    await abrir(page, context, `/admin/${CID}`, width);
    for (const nome of ["Tarefas da equipe neste cliente", "Perfil do cliente", "Conta Instagram", "CRM", "Dar acesso ao médico", "Usuários vinculados"]) {
      await expect(page.getByRole("heading", { name: nome, exact: true })).toBeVisible();
    }
    await expect(page.getByLabel("ID da conta Instagram")).toBeVisible();
    await expect(page.getByLabel("E-mail", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Criar acesso", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Conectar conta", exact: true })).toBeVisible();
    await expect(page.locator("section#acesso")).toHaveCount(1);
    await page.getByRole("navigation", { name: "Seções desta tela" }).getByRole("link", { name: "Dar acesso" }).click();
    await expect.poll(() => new URL(page.url()).hash).toBe("#acesso");
    expect(await semRolagemLateral(page)).toBe(true);
  });
}
