/**
 * short.gy (Short.io): links curtos rastreados para bio, posts, stories e anúncios.
 * O destino é o WhatsApp da clínica com uma mensagem pré-preenchida que carrega um CÓDIGO curto.
 * Quando a conversa chega com o código, ligamos a pessoa ao link (e ao post de onde ele saiu).
 *
 * Plano gratuito: cria link e lê o TOTAL de cliques por consulta. Clique individual (webhook) exige o plano Pro,
 * então o clique aqui é número agregado; quem liga a pessoa é o código na mensagem.
 */
const API = "https://api.short.io";
const STATS = "https://api-v2.short.io";

// Sem 0/O e 1/I/L, para o paciente não errar ao ver o código.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function novoCodigoRef(tamanho = 6): string {
  let s = "";
  const bytes = new Uint8Array(tamanho);
  crypto.getRandomValues(bytes);
  for (const b of bytes) s += ALFABETO[b % ALFABETO.length];
  return s;
}

export function destinoWhatsApp(numero: string, mensagem: string, codigo: string): string {
  const digitos = numero.replace(/\D/g, "");
  const texto = `${mensagem.trim()} (cód. ${codigo})`;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}

// Acha códigos dentro do texto de uma primeira mensagem: "(cód. A7K9QX)" ou o código solto.
export function extrairCodigos(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const achados = new Set<string>();
  for (const m of texto.toUpperCase().matchAll(/\b([ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6})\b/g)) achados.add(m[1]);
  return [...achados];
}

export async function criarLinkShort(opts: { chave: string; dominio: string; destino: string; titulo?: string; tags?: string[] }) {
  const r = await fetch(`${API}/links`, {
    method: "POST",
    headers: { authorization: opts.chave, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ domain: opts.dominio, originalURL: opts.destino, title: opts.titulo, tags: opts.tags }),
    signal: AbortSignal.timeout(20_000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`short.gy respondeu ${r.status}: ${String(j?.error ?? j?.message ?? "").slice(0, 160)}`);
  return { id: String(j.idString ?? j.id ?? ""), shortUrl: String(j.secureShortURL ?? j.shortURL ?? "") };
}

export async function cliquesDoLink(chave: string, linkId: string): Promise<number | null> {
  const r = await fetch(`${STATS}/statistics/link/${encodeURIComponent(linkId)}?period=total&tzOffset=-180`, {
    headers: { authorization: chave, accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) return null;
  const j: any = await r.json().catch(() => ({}));
  const n = Number(j?.humanClicks ?? j?.totalClicks);
  return Number.isFinite(n) ? n : null;
}
