import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Run against a local build using the fake provider from the interface suite.
// Every provider response below is fictional. Nothing contacts a live account.
const base = process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:5592';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Capture must use the local test application');
const origins = { nexo: base, sap: `http://sap.localhost:${new URL(base).port}` };
const output = new URL('../public/product-previews/', import.meta.url);
await mkdir(output, { recursive: true });
const clientId = '11111111-1111-4111-8111-111111111111';
const clinicId = '22222222-2222-4222-8222-222222222222';
const user = { id: '33333333-3333-4333-8333-333333333333', email: 'demo@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} };
const date = '2026-10-17T12:00:00Z';
const client = { id: clientId, name: 'Clínica Aurora · demonstração', specialty: 'Dermatologia', active: true, em_onboarding: false };
const clinic = { id: clinicId, client_id: clientId, nome: client.name, d0: '2026-10-14', status: 'onboarding', consulta_paga: true, ticket_medio: 4500, servicos: [], sap_pausas: [], decisor_nome: 'Responsável da clínica', coordenador: 'Coordenação Doctor Creator' };
const proposed = [
  ['audiencia', 'duvidas_sobre_o_tratamento', 'As dúvidas sobre o cuidado após o procedimento merecem uma resposta clara no conteúdo e no atendimento.', 'conversas'],
  ['criativa', 'conteudo_educativo', 'Priorizar conteúdos que expliquem as etapas do cuidado e ajudem o paciente a preparar suas perguntas para a consulta.', 'instagram_posts'],
];
const items = proposed.map(([memoria, chave, valor, fonte], i) => ({ id: `demo-${i}`, client_id: clientId, memoria, chave, valor, fonte, fonte_detalhe: 'Exemplo demonstrativo', confianca: 'media', estado: 'proposto', origem: 'agente', criado_em: date }));
items.push({ id: 'demo-approved', client_id: clientId, memoria: 'identidade', chave: 'tom_de_voz', valor: 'Comunicação clara, acolhedora e objetiva. Explicar as opções com responsabilidade, sem promessas de resultado.', fonte: 'ficha_sap', fonte_detalhe: 'Exemplo demonstrativo', confianca: 'alta', estado: 'aprovado', origem: 'manual', criado_em: date });
const errors = [], unexpected = [];
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
try {
  for (const [product, origin] of Object.entries(origins)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, locale: 'pt-BR', colorScheme: 'light' });
    try {
      const claims = Buffer.from(JSON.stringify({ sub: user.id, exp: 2000000000, role: 'authenticated' })).toString('base64url');
      const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${claims}.fake-signature`, refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 3600, expires_at: 2000000000, user };
      await context.addInitScript(session => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(session)); localStorage.setItem('dc:tema', 'light'); }, session);
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()), path = url.pathname;
        if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
        if (url.origin === 'http://localhost:9') {
          const single = (req.headers().accept || '').includes('vnd.pgrst.object');
          const respond = data => route.fulfill({ status: 200, json: data });
          const rows = data => respond(single ? data[0] ?? null : data);
          if (path === '/auth/v1/user') return respond(user);
          if (path.startsWith('/auth/')) return respond(session);
          if (path === '/rest/v1/rpc/is_app_admin') return respond(product === 'nexo');
          const readRpc = ['/rest/v1/rpc/sap_fontes_etapas', '/rest/v1/rpc/sap_papeis_pessoas', '/rest/v1/rpc/client_fontes'];
          if (req.method() !== 'GET' && !readRpc.includes(path)) { unexpected.push({ path, method: req.method() }); return route.abort(); }
          if (path === '/rest/v1/clients') return rows([client]);
          if (path === '/rest/v1/client_members') return rows([{ client_id: clientId, user_id: user.id, role: 'viewer', clients: client }]);
          if (path === '/rest/v1/cliente_modulos') return rows([{ client_id: clientId, status: 'ativo', clients: { name: client.name } }]);
          if (path === '/rest/v1/brain_itens') return rows(items);
          if (path === '/rest/v1/agente_execucoes') return rows([{ estado: 'concluida', erro: null, resultado: { propostas: 2 }, atualizado_em: date }]);
          if (path === '/rest/v1/sap_clinicas') return rows([clinic]);
          if (path === '/rest/v1/sap_usuario_pref') return rows([{ tour_visto_em: date, comece_visto_em: date }]);
          if (path === '/rest/v1/sap_marco_status') return rows([1, 2, 3, 4, 6].map(marco => ({ clinica_id: clinicId, marco, estado: 'feito', concluido_em: '2026-10-16', evidencia: 'Registro demonstrativo', detectado_em: date })));
          if (path === '/rest/v1/rpc/sap_fontes_etapas') return respond([{ client_id: clientId, tem_crm: true, tem_atendimento: true, tem_anuncios: true, marcos: ['agendado'] }]);
          if (path === '/rest/v1/rpc/sap_papeis_pessoas') return respond(['comercial', 'coordenador', 'onboarding', 'trafego', 'editor', 'cs', 'condutor', 'clinica', 'fundador'].map(papel => ({ clinica_id: clinicId, papel, pessoa_id: `demo-${papel}`, user_id: null, nome: papel === 'clinica' ? 'Equipe da clínica' : 'Equipe Doctor Creator' })));
          if (path === '/rest/v1/rpc/client_fontes') return respond([{ tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true }]);
          return rows([]);
        }
        if (!Object.values(origins).includes(url.origin) || req.method() !== 'GET') { unexpected.push({ url: req.url(), method: req.method() }); return route.abort(); }
        if (path.startsWith('/api/')) { unexpected.push({ path }); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      await page.clock.setFixedTime(new Date(date));
      await page.goto(origin + (product === 'nexo' ? '/admin/brain' : `/sap/${clientId}/cronograma`));
      try {
        await expect(page.getByText(product === 'nexo' ? proposed[0][2] : 'Cronograma do programa', { exact: true })).toBeVisible({ timeout: 25000 });
      } catch (error) {
        console.error({ url: page.url(), body: await page.locator('body').innerText(), errors, unexpected });
        throw error;
      }
      await expect(page.getByText('Carregando…', { exact: true })).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText('Essa página não carregou');
      await page.screenshot({ path: new URL(`${product}.jpg`, output).pathname, type: 'jpeg', quality: 88 });
      console.log(`Captured ${product}: actual application UI, fictional demonstration data.`);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, [], 'No rendering exceptions');
  assert.deepEqual(unexpected, [], 'No unapproved requests or mutations');
} finally { await browser.close(); }
