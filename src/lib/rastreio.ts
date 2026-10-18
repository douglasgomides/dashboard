// Rastreio de origem (link da bio, story, destaque, post, QR, parceiro...). Regras puras; testes em
// scripts/test-rastreio.ts. Servidor: api/_lib/redirecionar.ts (clique) e api/_lib/atribuir-links.ts (conversa).
//
// Como funciona:
// 1. Cada lugar ganha um link próprio no nosso domínio (/r/<slug>). O clique é registrado (sem dado pessoal) e a pessoa
//    segue para o WhatsApp da clínica com uma mensagem já escrita em linguagem natural ("Oi! Vi o link na bio...")
//    e uma referência curta no fim ("ref A7K9QX").
// 2. Quando a conversa chega, ligamos ao link: pela referência; se a pessoa apagou, pela frase; se apagou tudo, pelo
//    horário (um único link clicado nos 15 minutos antes da conversa começar), marcado como "provável".
// 3. O funil por origem soma cliques → conversas → agendou (leitura da IA) → venda (CRM).

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(DIACRITICOS, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export type Posicao = "bio" | "story" | "destaque" | "post" | "reels" | "parceiro" | "qr" | "anuncio" | "email" | "site" | "outro";
/** Valor gravado em links_rastreados.tipo (o banco aceita esta lista). */
export const POSICOES: Record<Posicao, { rotulo: string; frase: string; medium: string }> = {
  bio: { rotulo: "Link da bio", frase: "Oi! Vi o link na bio e quero saber mais.", medium: "bio" },
  story: { rotulo: "Story", frase: "Oi! Vi o seu story e quero saber mais.", medium: "story" },
  destaque: { rotulo: "Destaque do perfil", frase: "Oi! Vi os destaques do perfil e quero saber mais.", medium: "destaque" },
  post: { rotulo: "Post ou carrossel", frase: "Oi! Vi o seu post e quero saber mais.", medium: "post" },
  reels: { rotulo: "Reels", frase: "Oi! Vi o seu vídeo e quero saber mais.", medium: "reels" },
  parceiro: { rotulo: "Parceiro ou indicação", frase: "Oi! Vim por indicação e quero saber mais.", medium: "parceiro" },
  qr: { rotulo: "QR code (consultório, evento, impresso)", frase: "Oi! Peguei o contato de vocês e quero saber mais.", medium: "qr" },
  anuncio: { rotulo: "Anúncio (fora do clique para WhatsApp)", frase: "Oi! Vi o anúncio de vocês e quero saber mais.", medium: "anuncio" },
  email: { rotulo: "E-mail ou lista", frase: "Oi! Recebi a mensagem de vocês e quero saber mais.", medium: "email" },
  site: { rotulo: "Site ou página", frase: "Oi! Vi o site de vocês e quero saber mais.", medium: "site" },
  outro: { rotulo: "Outro", frase: "Oi! Quero saber mais.", medium: "outro" },
};

// Sem 0/O e 1/I/L (ninguém erra ao ler). Slug em minúsculas para o endereço; referência em maiúsculas para a mensagem.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function aleatorio(n: number, alfabeto = ALFABETO): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => alfabeto[x % alfabeto.length]).join("");
}
export const novoSlug = () => aleatorio(7).toLowerCase();
export const novaRef = () => aleatorio(6);

export function mensagemComRef(frase: string, ref: string): string {
  return `${frase.trim()} (ref ${ref})`;
}

export function destinoWhatsApp(numero: string, frase: string, ref: string): string | null {
  let d = (numero ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 13) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(mensagemComRef(frase, ref))}`;
}

/** Link para site/página com UTM (quando o destino não é o WhatsApp). */
export function destinoSite(url: string, posicao: Posicao, campanha: string, ref: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.searchParams.set("utm_source", posicao === "email" ? "email" : posicao === "qr" ? "offline" : "instagram");
  u.searchParams.set("utm_medium", POSICOES[posicao].medium);
  u.searchParams.set("utm_campaign", norm(campanha).replace(/ /g, "-").slice(0, 60) || "geral");
  u.searchParams.set("utm_content", ref);
  return u.toString();
}

/** Robôs que abrem o link para montar a prévia (Instagram, WhatsApp, Facebook) não são clique de gente. */
export function ehRobo(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").toLowerCase();
  if (!ua) return true;
  return /bot|crawl|spider|preview|facebookexternalhit|facebookcatalog|whatsapp\/|telegrambot|slackbot|discordbot|twitterbot|linkedinbot|skypeuripreview|curl\/|wget|python-requests|headless|lighthouse/.test(ua);
}
export function dispositivo(userAgent: string | null | undefined): "celular" | "computador" {
  return /mobile|android|iphone|ipad/i.test(userAgent ?? "") ? "celular" : "computador";
}
/** De onde veio o clique, quando o navegador conta (Instagram costuma mandar l.instagram.com). */
export function origemReferer(referer: string | null | undefined): string | null {
  if (!referer) return null;
  try {
    const h = new URL(referer).hostname.replace(/^www\./, "");
    if (/instagram\.com$/.test(h)) return "instagram";
    if (/facebook\.com$|fb\.com$/.test(h)) return "facebook";
    if (/google\./.test(h)) return "google";
    return h.slice(0, 60);
  } catch { return null; }
}

// ---------------------------------------------------------------- atribuição

export interface LinkAtrib { id: string; codigo_ref: string; mensagem_modelo: string | null; criado_em: string; destino_tipo?: string | null }
export interface CliqueAtrib { link_id: string; em: string }
export type ComoAtribuiu = "ref" | "frase" | "horario";

const REF = /\b([ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6})\b/g;

/** Liga a conversa a um link: referência → frase → horário. */
export function atribuirConversa(primeiraMsg: string | null, inicio: string, links: LinkAtrib[], cliques: CliqueAtrib[]): { link_id: string; como: ComoAtribuiu } | null {
  const texto = primeiraMsg ?? "";
  const porRef = new Map(links.map((l) => [l.codigo_ref.toUpperCase(), l]));
  for (const m of texto.toUpperCase().matchAll(REF)) {
    const l = porRef.get(m[1]);
    if (l) return { link_id: l.id, como: "ref" };
  }
  const t = norm(texto);
  if (t.length >= 12) {
    const frase = (l: LinkAtrib) => norm((l.mensagem_modelo ?? "").replace(/\(ref [A-Z0-9]+\)\s*$/i, ""));
    const casam = links.filter((l) => { const f = frase(l); return f.length >= 15 && (t.startsWith(f) || t.includes(f)); });
    // Mesma frase em vários links (ex.: dois stories): fica com o que teve clique mais perto do início da conversa.
    if (casam.length === 1) return { link_id: casam[0].id, como: "frase" };
    if (casam.length > 1) {
      const ini = Date.parse(inicio);
      const perto = cliques.filter((c) => casam.some((l) => l.id === c.link_id) && Date.parse(c.em) <= ini && ini - Date.parse(c.em) <= 30 * 60_000)
        .sort((a, b) => Date.parse(b.em) - Date.parse(a.em));
      if (perto.length) return { link_id: perto[0].link_id, como: "frase" };
      return { link_id: [...casam].sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0].id, como: "frase" };
    }
  }
  const ini = Date.parse(inicio);
  const janela = cliques.filter((c) => { const d = ini - Date.parse(c.em); return d >= 0 && d <= 15 * 60_000; });
  const ids = [...new Set(janela.map((c) => c.link_id))];
  if (ids.length === 1 && janela.length <= 3) return { link_id: ids[0], como: "horario" };
  return null;
}

// ---------------------------------------------------------------- funil

export interface LinhaFunil { link_id: string; cliques: number; conversas: number; agendou: number; vendas: number; receita: number }
export function taxa(a: number, b: number): string {
  if (!b) return "—";
  return `${Math.round((100 * a) / b)}%`;
}
