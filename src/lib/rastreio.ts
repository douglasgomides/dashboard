// Rastreio de origem (link da bio, story, destaque, post, QR, parceiro...). Regras puras; testes em
// scripts/test-rastreio.ts e scripts/test-links-piloto.ts. Servidor: api/_lib/redirecionar.ts (clique em
// redirecionarLink e conversa em atribuirLinks).
//
// Como funciona:
// 1. Cada lugar ganha um link curto no nosso domínio (LINK_BASE_URL/r/<nome>, ex.: /r/juliana-bio). O clique é
//    registrado (sem dado pessoal) e a pessoa segue para o WhatsApp da clínica com uma mensagem já escrita em linguagem
//    natural e um código curto no fim ("Olá! Vim pelo link da bio (R27)"). Links antigos usam "(ref A7K9QX)".
// 2. Quando a conversa chega, ligamos ao link: pela referência; se a pessoa apagou, pela frase; se apagou tudo, pelo
//    horário (um único link clicado nos 15 minutos antes da conversa começar), marcado como "provável".
// 3. O funil por origem soma cliques → conversas → agendou (leitura da IA) → venda (CRM).

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");
const norm = (s: string) => (s ?? "").toLowerCase().normalize("NFD").replace(DIACRITICOS, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export type Posicao = "bio" | "story" | "destaque" | "post" | "reels" | "parceiro" | "qr" | "anuncio" | "email" | "site" | "outro";
/** Valor gravado em links_rastreados.tipo (o banco aceita esta lista). */
export const POSICOES: Record<Posicao, { rotulo: string; frase: string; medium: string; curto: string }> = {
  bio: { rotulo: "Link da bio", frase: "Olá! Vim pelo link da bio", medium: "bio", curto: "bio" },
  story: { rotulo: "Story", frase: "Olá! Vim pelo story", medium: "story", curto: "story" },
  destaque: { rotulo: "Destaque do perfil", frase: "Olá! Vim pelos destaques do perfil", medium: "destaque", curto: "destaque" },
  post: { rotulo: "Post ou carrossel", frase: "Olá! Vim por um post do Instagram", medium: "post", curto: "post" },
  reels: { rotulo: "Reels", frase: "Olá! Vim por um vídeo do Instagram", medium: "reels", curto: "reels" },
  parceiro: { rotulo: "Parceiro ou indicação", frase: "Olá! Vim por indicação", medium: "parceiro", curto: "indicacao" },
  qr: { rotulo: "QR code (consultório, evento, impresso)", frase: "Olá! Peguei o contato de vocês pelo QR code", medium: "qr", curto: "qr" },
  anuncio: { rotulo: "Anúncio (fora do clique para WhatsApp)", frase: "Olá! Vi o anúncio de vocês", medium: "anuncio", curto: "anuncio" },
  email: { rotulo: "E-mail ou lista", frase: "Olá! Recebi a mensagem de vocês", medium: "email", curto: "email" },
  site: { rotulo: "Site ou página", frase: "Olá! Vim pelo site", medium: "site", curto: "site" },
  outro: { rotulo: "Outro", frase: "Olá! Vim pelo Instagram", medium: "outro", curto: "link" },
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

/** Final do link aceito no endereço: 3 a 30 letras minúsculas, números e hífen, sem hífen nas pontas. Vale para links
 * já criados (aleatórios e escolhidos antes do limite de 24). */
export const slugValido = (s: string) => /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(s);
/** Nome novo escolhido pela equipe: curto para caber na bio e ser digitado. */
export const NOME_MAX = 24;
// Palavras que confundem quem lê o link ou parecem página do sistema.
const RESERVADOS = new Set(["api", "admin", "login", "assets", "r", "app", "sap", "www"]);
/** Texto digitado ("Juliana Bio", "Mariela_Story!") em final de link ("juliana-bio"). Não confere o tamanho. */
export function normalizarNome(texto: string): string {
  return (texto ?? "").normalize("NFD").replace(DIACRITICOS, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export type NomeLink = { ok: true; slug: string } | { ok: false; motivo: string };
/** Confere o nome escolhido pela equipe. Devolve o final já ajustado ou o motivo em português simples. */
export function validarNomeLink(texto: string): NomeLink {
  const slug = normalizarNome(texto);
  if (!slug) return { ok: false, motivo: "Escreva um nome para o link, por exemplo juliana-bio." };
  if (slug.length < 3) return { ok: false, motivo: "Use pelo menos 3 letras ou números." };
  if (slug.length > NOME_MAX) return { ok: false, motivo: `Use no máximo ${NOME_MAX} letras ou números (este tem ${slug.length}).` };
  if (RESERVADOS.has(slug)) return { ok: false, motivo: "Esse nome é reservado pelo sistema. Escolha outro." };
  if (!slugValido(slug)) return { ok: false, motivo: "Use só letras, números e hífen." };
  return { ok: true, slug };
}
/** Transforma o texto digitado pela equipe ("Dra. Júlia Bio") em final de link ("dra-julia-bio"); null se não servir. */
export function slugPersonalizado(texto: string): string | null {
  const v = validarNomeLink(texto);
  return v.ok ? v.slug : null;
}

// Títulos e palavras que não ajudam a reconhecer a clínica no link.
const PALAVRAS_FRACAS = new Set(["dra", "dr", "doutora", "doutor", "clinica", "consultorio", "instituto", "centro", "de", "da", "do", "das", "dos", "e"]);
/** Sugere um nome curto: primeiro nome da clínica + lugar ("Dra. Juliana Paola" + bio = "juliana-bio"). Se o nome já
 * estiver na lista recebida, acrescenta 2, 3... */
export function sugerirNomeLink(nomeClinica: string | null | undefined, posicao: Posicao, existentes: Iterable<string> = []): string {
  const usados = new Set(existentes);
  const palavras = normalizarNome(nomeClinica ?? "").split("-").filter((p) => p && !PALAVRAS_FRACAS.has(p));
  const base = (palavras[0] ?? "clinica").slice(0, 12);
  const raiz = `${base}-${POSICOES[posicao]?.curto ?? "link"}`.slice(0, NOME_MAX).replace(/-+$/, "");
  const livre = (c: string) => !usados.has(c) && slugPersonalizado(c) === c;
  if (livre(raiz)) return raiz;
  for (let n = 2; n < 100; n++) {
    const c = `${raiz.slice(0, NOME_MAX - String(n).length - 1).replace(/-+$/, "")}-${n}`;
    if (livre(c)) return c;
  }
  return `${raiz.slice(0, NOME_MAX - 8).replace(/-+$/, "")}-${novoSlug()}`;
}

// ---------------------------------------------------------------- endereço

/** Domínio dos links quando nada for configurado. */
export const LINK_BASE_PADRAO = "https://dash.doctorcreator.com.br";
/** Domínio curto dos links (LINK_BASE_URL no servidor, VITE_LINK_BASE_URL na tela). Só aceita https sem caminho;
 * qualquer outra coisa volta ao padrão, para nunca exibir um endereço quebrado. */
export function baseDoLink(valor?: string | null): string {
  const t = (valor ?? "").trim();
  if (!t) return LINK_BASE_PADRAO;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== "https:" || u.username || u.password || u.pathname !== "/" || u.search || u.hash) return LINK_BASE_PADRAO;
    return u.origin;
  } catch { return LINK_BASE_PADRAO; }
}
/** Endereço completo do link: <domínio>/r/<nome>. */
export const urlDoLink = (slug: string, base?: string | null) => `${baseDoLink(base)}/r/${slug}`;
/** O mesmo endereço sem "https://", para escrever na bio ou no story. */
export const urlCurta = (slug: string, base?: string | null) => urlDoLink(slug, base).replace(/^https:\/\//, "");

// ---------------------------------------------------------------- código na mensagem

/** Código curto que vai no fim da mensagem: "R" + 2 a 4 números (R27, R318). Precisa ser único entre todas as clínicas,
 * porque duas clínicas podem dividir o mesmo WhatsApp: o servidor sorteia candidatos e fica com o primeiro livre. */
export function candidatosCodigo(qtd = 12): string[] {
  const out = new Set<string>();
  const b = new Uint32Array(qtd * 2);
  crypto.getRandomValues(b);
  for (let i = 0; out.size < qtd && i < b.length; i++) {
    const digitos = out.size < qtd / 3 ? 2 : out.size < (2 * qtd) / 3 ? 3 : 4;
    const min = 10 ** (digitos - 1);
    out.add(`R${min + (b[i] % (9 * min))}`);
  }
  return [...out];
}
/** Formato do código curto (R + 2 a 4 números). */
export const codigoCurtoValido = (c: string) => /^R\d{2,4}$/.test(c);
const CODIGO_CURTO = /\bR(\d{2,4})\b/g;
const CODIGO_ANTIGO = /\b([ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6})\b/g;
/** Códigos que aparecem na mensagem do paciente: os curtos (R27) e os antigos de 6 letras (A7K9QX). */
export function codigosNaMensagem(texto: string | null | undefined): string[] {
  const t = (texto ?? "").toUpperCase();
  const achados = new Set<string>();
  for (const m of t.matchAll(CODIGO_CURTO)) achados.add(`R${m[1]}`);
  for (const m of t.matchAll(CODIGO_ANTIGO)) achados.add(m[1]);
  return [...achados];
}
// "(R27)", "(ref A7K9QX)", "(cód. A7K9QX)": código de link com certeza (de outra clínica, se não for desta).
const CODIGO_ENTRE_PARENTESES = /\((?:(?:REF |C[OÓ]D\. )?R\d{2,4}|(?:REF |C[OÓ]D\. )[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6})\)/;
const FIM_COM_CODIGO = /\s*\((?:ref |c[oó]d\. )?(?:R\d{2,4}|[A-Z0-9]{6})\)\s*$/i;

/** Mensagem pronta: a frase da equipe + o código entre parênteses ("Olá! Vim pelo link da bio (R27)").
 * Se a equipe deixou um código antigo no fim da frase, ele sai antes. */
export function mensagemComRef(frase: string, ref: string): string {
  const limpa = (frase ?? "").replace(/\s+/g, " ").replace(FIM_COM_CODIGO, "").trim();
  return `${limpa || POSICOES.outro.frase} (${ref})`;
}
/** Frase sem o código do fim (para mostrar e editar). */
export const fraseSemCodigo = (mensagem: string | null | undefined) => (mensagem ?? "").replace(FIM_COM_CODIGO, "").trim();
/** Número de WhatsApp gravado no destino wa.me (para reescrever a mensagem sem perguntar o número de novo). */
export function numeroDoDestino(destino: string | null | undefined): string | null {
  const m = /^https:\/\/wa\.me\/(\d{12,13})(?:\?|$)/.exec(destino ?? "");
  return m ? m[1] : null;
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

/** Liga a conversa a um link: código → frase → horário. */
export function atribuirConversa(primeiraMsg: string | null, inicio: string, links: LinkAtrib[], cliques: CliqueAtrib[]): { link_id: string; como: ComoAtribuiu } | null {
  const texto = primeiraMsg ?? "";
  const porRef = new Map(links.map((l) => [l.codigo_ref.toUpperCase(), l]));
  for (const cod of codigosNaMensagem(texto)) {
    const l = porRef.get(cod);
    if (l) return { link_id: l.id, como: "ref" };
  }
  // Código entre parênteses que não é desta clínica: veio do link de outra clínica no mesmo WhatsApp. Não chuta.
  if (CODIGO_ENTRE_PARENTESES.test(texto.toUpperCase())) return null;
  const t = norm(texto);
  if (t.length >= 12) {
    const frase = (l: LinkAtrib) => norm((l.mensagem_modelo ?? "").replace(FIM_COM_CODIGO, ""));
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
  if (!b) return "sem dados";
  return `${Math.round((100 * a) / b)}%`;
}
