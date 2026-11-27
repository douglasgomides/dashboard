// Complemento para a imagem existente: mantém o servidor e os arquivos legados.
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import type { IncomingMessage, ServerResponse, RequestListener } from 'node:http';
import type { VercelRequest, VercelResponse } from '../api/_lib/http-types.js';
import deployment from '../vercel.json';

try { process.loadEnvFile('/run/secrets/hub.env'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
const { default: acompanhamento } = await import('../api/_lib/acompanhamento.js');
// @ts-expect-error arquivo da imagem original, preservado durante a publicação
const { createHubServer } = await import('/app/build/vps.mjs');
const server = createHubServer();
const originais = server.listeners('request') as RequestListener[];
server.removeAllListeners('request');
const raiz = resolve('/app/acompanhamento-dist');
const prefixo = '/acompanhamento-app/';
const mime: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
function cabecalhos(res: ServerResponse) { for (const h of deployment.headers[0].headers) res.setHeader(h.key, h.value); }
async function html(res: ServerResponse, req: IncomingMessage, novo: boolean) {
  const arquivo = novo ? resolve(raiz, 'index.html') : '/app/dist/index.html';
  const script = novo ? 'acompanhamento-navegacao.js' : 'acompanhamento-menu.js';
  const conteudo = (await readFile(arquivo, 'utf8')).replace('</body>', `<script src="${prefixo}${script}"></script></body>`);
  cabecalhos(res); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Content-Length', Buffer.byteLength(conteudo)); res.end(req.method === 'HEAD' ? undefined : conteudo);
}
async function api(req: IncomingMessage, response: ServerResponse, url: URL) {
  const res = response as VercelResponse;
  cabecalhos(res); res.setHeader('Cache-Control', 'no-store');
  res.status = function(code) { this.statusCode = code; return this; };
  res.json = function(value) { this.setHeader('Content-Type', 'application/json; charset=utf-8'); this.end(JSON.stringify(value)); return this; };
  const pedido = req as VercelRequest;
  pedido.query = Object.fromEntries(url.searchParams);
  if (req.method === 'POST') {
    const partes: Buffer[] = []; let tamanho = 0;
    for await (const chunk of req) { tamanho += chunk.length; if (tamanho > 1000000) { res.status(413).json({ error: 'Revisão muito grande.' }); return; } partes.push(Buffer.from(chunk)); }
    try { pedido.body = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { res.status(400).json({ error: 'Pedido inválido.' }); return; }
  }
  await acompanhamento(pedido, res);
}
server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (path.includes('\0') || path.includes('\\') || path.split('/').some(p => p.startsWith('.'))) { res.statusCode = 404; res.end(); return; }
    if (path === '/api/sync/manual' && url.searchParams.get('_central') === 'acompanhamento') { await api(req, res, url); return; }
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (path === '/admin/acompanhamento' || path === '/admin/acompanhamento/') { await html(res, req, true); return; }
      if (path.startsWith(prefixo)) {
        const file = resolve(raiz, path.slice(prefixo.length));
        if (!file.startsWith(raiz + sep) || !(await stat(file).catch(() => null))?.isFile()) { res.statusCode = 404; res.end(); return; }
        cabecalhos(res); res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream'); res.setHeader('Cache-Control', path.includes('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache');
        if (req.method === 'HEAD') res.end(); else createReadStream(file).on('error', () => res.destroy()).pipe(res);
        return;
      }
      if (!extname(path) && !path.startsWith('/api') && !path.startsWith('/r/') && !['/healthz', '/readyz'].includes(path)) { await html(res, req, false); return; }
    }
    for (const listener of originais) await listener.call(server, req, res);
  } catch { if (!res.headersSent) { res.statusCode = 500; res.end('Não foi possível carregar esta página.'); } else res.destroy(); }
});
server.listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.info('Nexo com acompanhamento pronto'));
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 310000).unref(); });
