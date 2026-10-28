import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

// Run against a local build using the fake provider from the interface suite.
// Every provider response below is fictional. Nothing contacts a live account.
const base = process.env.CAPTURE_BASE_URL || 'http://127.0.0.1:5592';
assert.equal(new URL(base).hostname, '127.0.0.1', 'Capture must use the local test application');
const onlyProduct = process.env.CAPTURE_PRODUCT;
assert.ok(!onlyProduct || ['nexo', 'sap'].includes(onlyProduct), 'Unknown capture product');
const onlyFile = process.env.CAPTURE_FILE;
assert.ok(!onlyFile || ['nexo', 'nexo-brain', 'nexo-agentes', 'sap', 'sap-cronograma', 'sap-semana', 'sap-semana-mobile'].includes(onlyFile), 'Unknown capture file');
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
  for (const { product, file, path: routePath, ready, width = 1440, proof = false, evolved = false } of [
    { product: 'nexo', file: 'nexo-agentes', path: `/${clientId}/agentes`, ready: 'Agentes de IA' },
    { product: 'nexo', file: 'nexo', path: `/${clientId}/atendimento?aba=conversas`, ready: 'Auditoria comercial do período' },
    { product: 'nexo', file: 'nexo-brain', path: '/admin/brain', ready: proposed[0][2] },
    { product: 'sap', file: 'sap', path: `/sap/${clientId}/painel`, ready: 'Resumo do programa', evolved: true },
    { product: 'sap', file: 'sap-cronograma', path: `/sap/${clientId}/cronograma`, ready: 'Cronograma do programa', evolved: true },
    { product: 'sap', file: 'sap-semana', path: `/sap/${clientId}`, ready: 'Minhas tarefas' },
    { product: 'sap', file: 'sap-semana-mobile', path: `/sap/${clientId}`, ready: 'Minhas tarefas', width: 375, proof: true },
  ].filter(capture => (!onlyProduct || capture.product === onlyProduct) && (!onlyFile || capture.file === onlyFile))) {
    const origin = origins[product];
    const context = await browser.newContext({ viewport: { width, height: 960 }, deviceScaleFactor: 1, locale: 'pt-BR', colorScheme: 'light' });
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
          const readRpc = ['sap_tracker_auto', 'sap_fontes_etapas', 'sap_papeis_pessoas', 'client_fontes', 'auditoria_comercial', 'cobertura_periodo', 'client_sync_status', 'experimento_atual', 'conversao_por_origem', 'textos_entrada_frequentes', 'receita_em_jogo', 'receita_por_canal', 'sap_sinais_auto', 'leitura_conversas', 'listar_conversas', 'listar_conversas_canal', 'custo_whatsapp'].map(name => `/rest/v1/rpc/${name}`);
          if (req.method() !== 'GET' && !readRpc.includes(path)) { unexpected.push({ path, method: req.method() }); return route.abort(); }
          if (path === '/rest/v1/rpc/client_sync_status') return respond(['instagram', 'anuncios', 'crm', 'atendimento'].map(fonte => ({ fonte, data_ate: '2026-10-16', last_attempt_at: date, last_success_at: date, last_error: null, last_rows: 80 })));
          if (path === '/rest/v1/instagram_comments') return rows([{ commented_at: date }]);
          if (path === '/rest/v1/rpc/auditoria_comercial') return respond({ conversas_periodo: 80, lidas: 72, nota_media: 7.2, funil: { engajou: 64, preco_pedido: 38, preco_apresentado: 29, agendamento_em_curso: 24, agendou: 19 }, objecoes: { preco: 12, adiamento: 8, agenda: 4 }, falhas: { sem_follow_up: 17, sem_cta: 12, demora: 8 }, origem: { anuncio: 30, instagram: 18, indicacao: 10, desconhecida: 14 }, por_atendente: [], resgate: [], exemplos: [] });
          if (path === '/rest/v1/rpc/experimento_atual') return respond({ atual: { id: 'demo-test', falha: 'sem_follow_up', acao: 'Combinar o próximo contato antes de encerrar cada conversa e registrar o retorno no CRM.', inicio: '2026-10-15', fim: '2026-10-22', estado: 'em_andamento', base_pct: 32, base_conversas: 50, agora: { pct: 24, n: 6, conversas: 25 } }, ultimo: null, sugestao: null });
          if (path === '/rest/v1/rpc/conversao_por_origem') return respond({ total: 72, pelo_texto: 48, origens: [{ origem: 'anuncio', conversas: 30, agendaram: 9, pct: 30 }, { origem: 'instagram', conversas: 18, agendaram: 4, pct: 22.2 }, { origem: 'indicacao', conversas: 10, agendaram: 4, pct: 40 }, { origem: 'desconhecida', conversas: 14, agendaram: 2, pct: 14.3 }] });
          if (['receita_em_jogo', 'receita_por_canal', 'custo_whatsapp'].some(name => path.endsWith(`/rpc/${name}`))) return respond(null);
          if (path === '/rest/v1/rpc/sap_sinais_auto') return respond({ perdidos_com_motivo: 20, motivos: [{ categoria: 'Preço', total: 14 }, { categoria: 'Tempo para decidir', total: 6 }] });
          if (path === '/rest/v1/clients') return rows([client]);
          if (path === '/rest/v1/client_members') return rows([{ client_id: clientId, user_id: user.id, role: 'viewer', clients: client }]);
          if (path === '/rest/v1/cliente_modulos') return rows([{ client_id: clientId, status: 'ativo', clients: { name: client.name } }]);
          if (path === '/rest/v1/brain_itens') return rows(items);
          if (path === '/rest/v1/sugestoes_agentes') return rows(['recuperacao', 'recuperacao', 'anuncios', 'anuncios', 'conteudo', 'conteudo'].map((agente, i) => ({ id: `demo-suggestion-${i}`, agente, estado: 'proposta', resultado: null, criado_em: date })));
          if (path === '/rest/v1/campanhas_ideias') return rows([{ id: 'demo-campaign', estado: 'proposta', criado_em: date }]);
          if (path === '/rest/v1/agente_execucoes') return rows([{ estado: 'concluida', erro: null, resultado: { propostas: 2 }, atualizado_em: date }]);
          if (path === '/rest/v1/sap_clinicas') return rows([{ ...clinic, d0: evolved ? '2026-09-02' : clinic.d0 }]);
          if (path === '/rest/v1/sap_kpi_plano') return rows([
            { kpi: 'resposta', baseline: 12, meta: 5, origem: 'Registro demonstrativo', amostra: 100 },
            { kpi: 'comparecimento', baseline: 0.68, meta: 0.8, origem: 'Registro demonstrativo', amostra: 50 },
            { kpi: 'conversao', baseline: 0.28, meta: 0.35, origem: 'Registro demonstrativo', amostra: 32 },
          ]);
          if (path === '/rest/v1/rpc/sap_tracker_auto') return respond({ tem_crm: true, tem_whatsapp: true, marcos_marcados: 8, marcos: ['qualificado', 'desqualificado', 'agendado', 'compareceu', 'faltou', 'pensando', 'nao_fechou', 'fechou'], leads: 168, qualificados: 120, agendados: 54, compareceram: 40, faltaram: 10, pensando: 14, nao_fecharam: 12, fechados: 14, fechados_com_valor: 14, perdidos: 26, perdidos_com_motivo: 24, perdidos_motivo_medivel: 24, receita: 63000, com_origem: 156, linhas_completas: 158, investido: 4800, leads_plataforma: 96, leads_crm_meta: 92, resposta_conversas: 140, resposta_mediana_min: 4, resposta_ate_5min: 112, canais: [], semanas: [] });
          if (path === '/rest/v1/sap_usuario_pref') return rows([{ tour_visto_em: date, comece_visto_em: date }]);
          if (path === '/rest/v1/sap_marco_status') return rows((evolved ? Array.from({ length: 24 }, (_, i) => i + 1) : [1, 2, 3, 6]).map(marco => ({ clinica_id: clinicId, marco, estado: 'feito', concluido_em: '2026-10-16', evidencia: 'Registro demonstrativo', detectado_em: date })));
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
      await page.goto(origin + routePath);
      try {
        const target = ready === 'Resumo do programa' ? page.getByRole('region', { name: ready, exact: true })
          : file === 'nexo-agentes' ? page.getByRole('heading', { name: ready, exact: true }) : page.getByText(ready, { exact: true });
        await expect(target).toBeVisible({ timeout: 25000 });
      } catch (error) {
        console.error({ url: page.url(), body: await page.locator('body').innerText(), errors, unexpected });
        throw error;
      }
      await expect(page.getByText('Carregando…', { exact: true })).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText('Essa página não carregou');
      const destination = proof ? new URL('../test-results/sap-workspace/', import.meta.url) : output;
      await mkdir(destination, { recursive: true });
      await page.screenshot({ path: new URL(`${file}.jpg`, destination).pathname, type: 'jpeg', quality: 88 });
      console.log(`Captured ${file}: actual application UI, fictional demonstration data.`);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, [], 'No rendering exceptions');
  assert.deepEqual(unexpected, [], 'No unapproved requests or mutations');
} finally { await browser.close(); }
