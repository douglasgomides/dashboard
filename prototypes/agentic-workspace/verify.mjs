import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Exercises the offline prototype, never the application's auth/API or providers.
const html = await readFile(new URL('./index.html', import.meta.url));
const output = fileURLToPath(new URL('../../test-results/prototype/', import.meta.url));
await mkdir(output, { recursive: true });
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  if (request.method !== 'GET' || request.url !== '/') {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const cases = [];
const unexpectedRequests = [];
const runtimeErrors = [];
try {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || request.method() !== 'GET') {
      unexpectedRequests.push({ url: request.url(), method: request.method() });
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => runtimeErrors.push(error.message));
  const fresh = () => page.goto(origin);
  const nav = name => page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name, exact: true });
  const product = name => page.getByRole('group', { name: 'Produto' }).getByRole('button', { name, exact: true });
  const reviewButton = () => page.getByRole('button', { name: 'Revisar relatório', exact: true });
  const run = async (name, check) => {
    await fresh();
    await check();
    assert.deepEqual(runtimeErrors, [], 'No runtime errors');
    assert.deepEqual(unexpectedRequests, [], 'No external requests or writes');
    cases.push({ name, passed: true });
    console.log(`PASS ${name}`);
  };

  await run('product navigation retains selected clinic and keeps separate work', async () => {
    await page.getByLabel('Clínica selecionada').selectOption('horizonte');
    await product('SAP').click();
    await expect(page.getByLabel('Clínica selecionada')).toHaveValue('horizonte');
    await expect(page.getByText('D46 de 90 · próximo passo', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revisar evidências', exact: true })).toBeVisible();
    await product('HUB').click();
    await expect(reviewButton()).toBeVisible();
    await nav('Resultados').click();
    await expect(page.getByRole('heading', { name: 'Resultados', exact: true })).toBeVisible();
    await nav('Plano de ação').click();
    await expect(page.getByRole('heading', { name: 'Prioridades do período' })).toBeVisible();
  });

  await run('evidence to review preserves modal context and approval requires acknowledgment', async () => {
    await page.getByRole('button', { name: 'Ver evidências', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('CRM · 12 a 16');
    await page.getByRole('button', { name: 'Revisar proposta', exact: true }).click();
    const approve = page.getByRole('button', { name: 'Aprovar e publicar', exact: true });
    await expect(approve).toBeDisabled();
    await expect(page.getByRole('dialog')).toContainText('Depois da aprovação');
    await expect(page.getByRole('dialog')).toContainText('Clínica Aurora');
    await page.getByLabel('Conferi o conteúdo, a clínica e o efeito desta ação.').check();
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByText('Publicação do relatório simulada', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Simulação concluída. Nenhuma ação foi enviada à operação.')).toBeVisible();
    await expect(reviewButton()).not.toBeVisible();
  });

  await run('approved asynchronous work never leaks to another clinic or product', async () => {
    await reviewButton().click();
    await page.getByLabel('Conferi o conteúdo, a clínica e o efeito desta ação.').check();
    await page.getByRole('button', { name: 'Aprovar e publicar', exact: true }).click();
    await page.getByLabel('Clínica selecionada').selectOption('horizonte');
    await expect(reviewButton()).toBeVisible();
    await expect(page.getByText('Publicação do relatório simulada', { exact: true })).toHaveCount(0);
    await product('SAP').click();
    await expect(page.getByRole('button', { name: 'Revisar evidências', exact: true })).toBeVisible();
    await product('HUB').click();
    await page.getByLabel('Clínica selecionada').selectOption('aurora');
    await expect(page.getByText('Simulação concluída. Nenhuma ação foi enviada à operação.')).toBeVisible();
    await expect(reviewButton()).not.toBeVisible();
  });

  await run('request changes requires a reason and renders user text safely', async () => {
    await reviewButton().click();
    await page.getByRole('button', { name: 'Solicitar ajuste', exact: true }).click();
    await page.getByRole('button', { name: 'Enviar solicitação', exact: true }).click();
    await expect(page.getByText('Descreva o ajuste antes de enviar.')).toBeVisible();
    const feedback = '<img src=x onerror=alert(1)> Revisar cobertura do período';
    await page.getByLabel('O que o agente precisa ajustar?').fill(feedback);
    await page.getByRole('button', { name: 'Enviar solicitação', exact: true }).click();
    await nav('Atividade').click();
    await expect(page.getByText(feedback, { exact: true })).toBeVisible();
    await expect(page.locator('img')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Trabalho em andamento' })).toBeVisible();
    await expect(page.getByText('Ajuste solicitado', { exact: true }).first()).toBeVisible();
  });

  await run('clinic view has no operator approval and owns its review task', async () => {
    await page.getByRole('button', { name: 'Ver tarefa da clínica', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Registrar minha revisão', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByLabel('Visualização', { exact: true }).selectOption('clinic');
    await expect(page.getByLabel('Clínica selecionada')).toBeDisabled();
    await expect(reviewButton()).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pedir análise', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Abrir minha tarefa', exact: true }).click();
    await page.getByLabel('Observações da revisão', { exact: false }).fill('Prioridades conferidas.');
    await page.getByRole('button', { name: 'Registrar minha revisão', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Nenhuma decisão pendente' })).toBeVisible();
    await page.getByLabel('Visualização', { exact: true }).selectOption('team');
    await expect(reviewButton()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ver tarefa da clínica', exact: true })).toHaveCount(0);
  });

  await run('operator can pause and resume an agent with a visible history', async () => {
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    await expect(page.getByText('Pausado por você', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retomar', exact: true }).click();
    await nav('Atividade').click();
    await expect(page.getByText('Retomada: Análise do atendimento', { exact: true })).toBeVisible();
    await expect(page.getByText('Pausa: Análise do atendimento', { exact: true })).toBeVisible();
  });

  await run('analysis requests explain scope, validate input and remain bounded to the clinic', async () => {
    await page.getByRole('button', { name: 'Pedir análise', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Clínica Aurora');
    await page.getByRole('button', { name: 'Preparar análise', exact: false }).click();
    await expect(page.getByText('Descreva o objetivo da análise.')).toBeVisible();
    await page.getByLabel('Objetivo da análise').fill('Conferir a evolução dos agendamentos');
    await page.getByRole('button', { name: 'Preparar análise', exact: false }).click();
    await expect(page.getByRole('heading', { name: 'Atividade dos agentes', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Análise solicitada por você', exact: true })).toBeVisible();
    await page.getByLabel('Clínica selecionada').selectOption('horizonte');
    await expect(page.getByRole('heading', { name: 'Análise solicitada por você', exact: true })).toHaveCount(0);
  });

  await run('source failure blocks approval and never presents missing results as zero', async () => {
    await page.getByLabel('Simular falha da fonte').check();
    await expect(reviewButton()).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('recomendações estão suspensas');
    await nav('Resultados').click();
    await expect(page.locator('.metric strong')).toHaveText(['—','—','—']);
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.locator('.metric strong')).toHaveText(['120','36','24']);
    await nav('Hoje').click();
    await expect(reviewButton()).toBeEnabled();
  });

  await run('approval dialog supports Escape and restores focus', async () => {
    await reviewButton().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(reviewButton()).toBeFocused();
  });

  await run('SAP approval describes the actual milestone change and completes its simulation', async () => {
    await product('SAP').click();
    await page.getByRole('button', { name: 'Revisar evidências', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Etapa marcada como concluída no cronograma.');
    await page.getByLabel('Conferi o conteúdo, a clínica e o efeito desta ação.').check();
    await page.getByRole('button', { name: 'Aprovar e concluir etapa', exact: true }).click();
    await expect(page.getByText('Simulação concluída. Nenhuma ação foi enviada à operação.')).toBeVisible();
  });

  await run('both products render accessibly in light/dark and at mobile/tablet/desktop widths', async () => {
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const name of ['HUB', 'SAP']) {
        await product(name).click();
        for (const theme of ['light', 'dark']) {
          if (await page.locator('html').getAttribute('data-theme') !== theme) {
            await page.getByRole('button', { name: `Ativar tema ${theme === 'dark' ? 'escuro' : 'claro'}` }).click();
          }
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
          assert.equal(overflow, false, `${name}/${width}/${theme} must not overflow`);
          const result = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
          assert.deepEqual(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], `${name}/${width}/${theme} accessibility`);
          if (theme === 'light' && width === 1440) {
            await page.screenshot({ path: `${output}/${name.toLowerCase()}-hoje-desktop.png`, fullPage: true });
          }
        }
      }
    }
  });

  await run('mobile clinic view and approval dialog have no overflow or accessibility violations', async () => {
    await page.setViewportSize({ width: 375, height: 850 });
    await product('SAP').click();
    await page.getByLabel('Visualização', { exact: true }).selectOption('clinic');
    const taskBox = await page.getByRole('button', { name: 'Abrir minha tarefa', exact: true }).boundingBox();
    const navigationBox = await page.getByRole('navigation', { name: 'Navegação principal' }).boundingBox();
    assert.ok(taskBox && navigationBox && taskBox.y >= 0 && taskBox.y + taskBox.height <= navigationBox.y, 'The clinic primary action must be visible above the mobile navigation without scrolling');
    const result = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(result.violations.map(v => v.id), []);
    await page.screenshot({ path: `${output}/sap-clinica-mobile.png`, fullPage: false });
    await page.getByLabel('Visualização', { exact: true }).selectOption('team');
    await page.getByRole('button', { name: 'Revisar evidências', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const dialogResult = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(dialogResult.violations.map(v => ({ id:v.id,nodes:v.nodes.map(n=>n.target) })), []);
    assert.equal(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth+1), true);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: 'Fechar painel', exact: true }).focus();
    await page.screenshot({ path: `${output}/aprovacao-agente.png`, fullPage: false });
  });

  await run('reset clears demo decisions, timers, source errors and requests', async () => {
    await page.getByRole('button', { name: 'Pausar', exact: true }).click();
    await page.getByLabel('Simular falha da fonte').check();
    await page.getByRole('button', { name: 'Reiniciar demonstração', exact: true }).click();
    await expect(page.getByLabel('Simular falha da fonte')).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retomar', exact: true })).toHaveCount(0);
    await expect(reviewButton()).toBeEnabled();
  });

  await writeFile(`${output}/report.json`, JSON.stringify({
    suite:'agentic-workspace-prototype', passed:cases.length, failed:0, cases,
    viewports:[375,768,1440],themes:['light','dark'],products:['hub','sap'],
    externalRequests:unexpectedRequests,runtimeErrors,data:'fictional, in memory only',
    api:'not connected; no writes or AI/provider calls',
  },null,2)+'\n');
  console.log(`${cases.length}/${cases.length} prototype checks passed`);
} catch (error) {
  await writeFile(`${output}/report.json`, JSON.stringify({passed:cases.length,failed:1,cases,error:String(error),runtimeErrors,unexpectedRequests},null,2)+'\n');
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
