// Relatório pronto para enviar ao cliente, em 3 versões do MESMO conteúdo validado:
//   1. curta para WhatsApp (até ~900 caracteres, *negrito* do WhatsApp);
//   2. executiva para reunião (5 a 8 pontos + 3 decisões);
//   3. detalhada em PDF (pdf-relatorio-completo.tsx usa `conteudo` daqui).
//
// Estrutura igual nas três: resumo do período; principais vitórias; pontos de
// atenção; ações recomendadas; próximos testes; dados incompletos ou limitações.
//
// Antes de montar o texto, a "Checagem antes de enviar" roda 4 verificações:
//   - dado completo: dias com dado por fonte e o que não está conectado;
//   - recomendação faz sentido: cada recomendação precisa de evidência e de
//     amostra mínima; a que não tem sai (e aparece como descartada);
//   - ruído dos comentários: comentário nunca é citado; só vira pauta a dúvida
//     feita por 2+ pessoas diferentes; emoji, @, link e spam são ignorados;
//   - linguagem segura (CFM 2.336/2023): frase com promessa, preço, remédio,
//     superlativo ou sensacionalismo recebe uma reescrita segura (aplicada por padrão)
//     e fica listada com o original; a equipe pode manter o original. Nada é apagado.
//
// A equipe escolhe o que entra (`excluir`, por seção ou por bloco), como no relatório
// antigo; a escolha vale para as 3 versões. O que ficou de fora por falta de dado
// vai em `omitidos` (card "Não incluído por falta de dado").
//
// Lógica pura e determinística (sem IA, sem banco): testável com `npx tsx`.
import { conversaMaisBarata, GRUPOS, MIN_IMPRESSOES, MIN_GASTO, type DiagnosticoAds } from "@/lib/anuncios-objetivo";
import { analyzeFollowers, daysBetween, fmtDiaBR } from "@/lib/hub-conteudo";
import { confiancaPorAmostra, type Area, type Impacto, type Insight, type Limitacao, type Responsavel, type Tom } from "@/lib/insight";
import { checarLinguagemCFM, tornarSeguro } from "@/lib/linguagem-cfm";
import { fmtFormatKey, median } from "@/lib/report-metrics";

// ---------------------------------------------------------------- tipos

export interface FontesEnvio {
  tem_instagram: boolean;
  tem_anuncios: boolean;
  tem_crm: boolean;
  tem_atendimento: boolean;
}

export interface EnvioInput {
  clientName: string;
  periodLabel: string;
  start: string; // YYYY-MM-DD (Brasília)
  end: string;
  hoje?: string; // para saber se o último dia ainda está sendo coletado
  fontes: FontesEnvio;
  metrics: any[]; // instagram_account_daily_metrics
  posts: any[];
  perguntas: { id?: string; text: string; author_username?: string | null }[];
  alcanceUnico?: number | null; // getResumoPeriodo (contas únicas do período), quando a Meta responde
  ads: { diag: DiagnosticoAds; diasComDado: string[] } | null;
  wts: { resumo: any | null; diasComDado: string[] } | null;
  crm: { resumo: { novos: number; ganhos: number; perdidos: number } | null; diasComDado: string[] } | null;
  // O que a equipe tirou do envio (vale para WhatsApp, executiva e PDF). Cada entrada é
  // "secao:<SecaoId>" (a seção inteira) ou "<SecaoId>:<id do item>" (um bloco). Ver `blocos`.
  excluir?: string[];
  // Frases sinalizadas pela checagem CFM que a equipe decidiu manter como foram geradas
  // (chave = `AlteracaoLinguagem.original`). As demais recebem a reescrita segura.
  manterOriginal?: string[];
}

export interface BlocoEnvio {
  chave: string; // "<SecaoId>:<id do item>"
  secao: SecaoId;
  rotulo: string;
}

export type SecaoId = "resumo" | "vitorias" | "atencao" | "acoes" | "testes" | "limitacoes";
export const SECOES: { id: SecaoId; titulo: string; curto: string }[] = [
  { id: "resumo", titulo: "Resumo do período", curto: "Resumo" },
  { id: "vitorias", titulo: "Principais vitórias", curto: "Vitória" },
  { id: "atencao", titulo: "Pontos de atenção", curto: "Atenção" },
  { id: "acoes", titulo: "Ações recomendadas", curto: "Ação" },
  { id: "testes", titulo: "Próximos testes", curto: "Teste" },
  { id: "limitacoes", titulo: "Dados incompletos ou limitações", curto: "Limitação" },
];

export interface ItemEnvio {
  id: string;
  curto: string; // uma linha, para WhatsApp e executiva
  texto: string; // frase completa, para o PDF
  evidencia?: string; // números que sustentam (PDF)
}
export type ConteudoEnvio = Record<SecaoId, ItemEnvio[]>;

export type StatusChecagem = "ok" | "atencao";
export interface ChecagemItem {
  id: "dado_completo" | "recomendacao" | "comentarios" | "linguagem";
  titulo: string;
  status: StatusChecagem;
  resumo: string;
  detalhes: string[];
}

export interface AlteracaoLinguagem {
  secao: string;
  original: string; // frase como foi gerada (chave para "manter original")
  corrigido: string; // reescrita segura sugerida; nada é apagado
  motivos: string[];
  trechos: string[]; // palavras marcadas na frase original
  mantido: boolean; // a equipe escolheu manter o original
}

export interface RelatorioEnvio {
  conteudo: ConteudoEnvio; // o que vai nas 3 versões (já sem o que a equipe desmarcou)
  conteudoCompleto: ConteudoEnvio; // tudo que tem dado, antes das escolhas de "O que entra"
  blocos: BlocoEnvio[]; // itens que podem ser incluídos/excluídos
  excluidos: string[]; // rótulos do que a equipe tirou (para o PDF registrar)
  omitidos: string[]; // "Não incluído por falta de dado"
  manterOriginal: string[];
  checagem: ChecagemItem[];
  insights: Insight[]; // recomendações aprovadas, no contrato do Hub
  limitacoes: Limitacao[];
  descartadas: { titulo: string; motivo: string }[];
  alteracoes: AlteracaoLinguagem[];
  whatsapp: string;
  executiva: string;
}

// ---------------------------------------------------------------- formatação

const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
export const fmtN = (n: number) => Math.round(n).toLocaleString("pt-BR");
export const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n >= 1000 ? 0 : 2 });
export function fmtCompacto(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${v >= 2 ? "milhões" : "milhão"}`;
  }
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  return fmtN(n);
}
export function fmtDuracao(seg: number): string {
  if (seg < 90) return `${Math.round(seg)} segundos`;
  if (seg < 5400) return `${Math.round(seg / 60)} minutos`;
  return `${(seg / 3600).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} horas`;
}
const minusc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

function trechos(dias: string[]): string {
  const ranges: { de: string; ate: string }[] = [];
  for (const d of dias) {
    const ult = ranges[ranges.length - 1];
    if (ult && new Date(d + "T12:00:00Z").getTime() - new Date(ult.ate + "T12:00:00Z").getTime() === 86400000) ult.ate = d;
    else ranges.push({ de: d, ate: d });
  }
  const p = ranges.slice(0, 4).map((r) => (r.de === r.ate ? fmtDiaBR(r.de) : `${fmtDiaBR(r.de)} a ${fmtDiaBR(r.ate)}`));
  if (ranges.length > 4) p.push(`e mais ${ranges.length - 4} trecho(s)`);
  return p.join(", ");
}

const DIAC = new RegExp("[\\u0300-\\u036f]", "g");
const dobra = (s: string) => s.toLowerCase().normalize("NFD").replace(DIAC, "");

export function saudacao(nome: string): string {
  const m = nome.trim().match(/^(dra?\.?)\s+(\S+)/i);
  if (m) return `${m[1].toLowerCase().startsWith("dra") ? "Dra." : "Dr."} ${m[2]}`;
  return nome.trim().split(/\s+/)[0] ?? nome;
}

// ---------------------------------------------------------------- comentários (guarda local)

const STOP = new Set(
  (
    "como qual quais quando onde porque pq por que pode posso podem fazer faz faco tomar tomo toma tratar trata tratamento saber sei sobre esse essa esses essas isso isto " +
    "para pra pro com sem mais muito muita tambem tbm tem tenho ter estou esta estao sou minha meu minhas meus dra doutora doutor gente ainda depois antes entao mesmo " +
    "todos todas tudo coisa coisas alguem dias anos vezes sinto sentir normal possivel existe seria sera vale aqui assim agora hoje vida deus obrigada obrigado favor ideal " +
    "melhor alguma algum nada pois outra outro quem sempre nunca dois duas usar uso usando devo deve precisa preciso fiz feito voce voces vcs dela dele elas eles pessoa pessoas " +
    "acontece serve ajuda ajudar bom boa certo verdade gostaria queria quero sabe tipo nossa senhora caso qual idade fase forma pouco cada tempo mulher mulheres ficar fica " +
    "cade comeca comecar medico medicos medica medicas estas estes abaixo acima alto alta altos altas baixo baixa sintoma sintomas problema problemas resultado resultados " +
    "porem mas pela pelo pelos pelas numa num uma umas uns ate apos desde entre sendo seja estar estava teria tinha seus suas nosso nossa dessa desse disso nisso"
  ).split(/\s+/),
);

const SPAM: RegExp[] = [
  /https?:\/\/|www\.|\.com\b|chat\.whatsapp/,
  /\bsorteio\b|\bparticip(?:ar|e) do\b|\bsegue (?:a|o) (?:pagina|perfil)\b|\bme segue\b|\blink (?:na|da) bio\b|\bcupom\b/,
  /\bsistema de gestao\b|\bparceria\b|\bdivulga|\bseguidores gratis\b|\bganhe\b|\bpix\b/,
];
const INTERROGATIVA = /^(?:e\s+)?(?:como|qual|quais|quando|onde|por ?que|porque|o que|oq|quem|quanto|quantos|quantas|sera|pode|posso|tem|existe|e)\b/;

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface DuvidaRepetida {
  tema: string; // palavra-chave da dúvida, nunca o comentário
  pessoas: number; // pessoas diferentes
}
export interface ResultadoComentarios {
  considerados: number;
  ruido: number; // emoji/@/link/spam/sem pergunta
  semRepeticao: number; // perguntas feitas por uma pessoa só
  autoresDesconhecidos: number;
  duvidas: DuvidaRepetida[];
}

/** Agrupa perguntas por palavra-chave e conta pessoas diferentes. Nunca devolve o texto do comentário. */
export function duvidasRepetidas(
  perguntas: { id?: string; text: string; author_username?: string | null }[],
  minPessoas = 2,
  temasDoPerfil: string[] = [],
): ResultadoComentarios {
  // Palavra que está em 1 de cada 4 temas do perfil é o nicho inteiro ("menopausa" para quem só fala
  // de menopausa): não diz qual é a dúvida, então não vira tema.
  const nicho = new Set<string>();
  if (temasDoPerfil.length > 0) {
    const cont = new Map<string, number>();
    for (const t of temasDoPerfil) for (const w of new Set(dobra(t).match(/[a-z]{4,}/g) ?? [])) cont.set(w, (cont.get(w) ?? 0) + 1);
    for (const [w, n] of cont) if (n / temasDoPerfil.length >= 0.25) nicho.add(w);
  }
  let ruido = 0;
  let autoresDesconhecidos = 0;
  const validas: { pessoa: string; tokens: Set<string> }[] = [];
  const formaOriginal = new Map<string, Map<string, number>>();
  const vistos = new Set<string>();
  for (const q of perguntas) {
    const bruto = String(q.text ?? "");
    const semMarca = bruto
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/@[\w.]+/g, " ")
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    const d = dobra(bruto);
    const limpo = dobra(semMarca);
    const palavras = limpo.match(/[a-z]{2,}/g) ?? [];
    const ehPergunta = limpo.includes("?") || INTERROGATIVA.test(limpo);
    // Começa com @: é conversa entre seguidores, não pergunta ao perfil.
    if (SPAM.some((r) => r.test(d)) || /^\s*@/.test(bruto) || palavras.length < 2 || !ehPergunta) {
      ruido++;
      continue;
    }
    const autor = q.author_username ? dobra(q.author_username) : null;
    if (!autor) autoresDesconhecidos++;
    // Sem autor: o mesmo texto repetido conta uma vez só.
    const pessoa = autor ?? `texto:${palavras.join(" ")}`;
    const chave = `${pessoa}|${palavras.join(" ")}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const tokens = new Set<string>();
    const originais = semMarca.match(/[\p{L}]{4,}/gu) ?? [];
    for (const o of originais) {
      const t = dobra(o);
      if (t.length < 4 || STOP.has(t) || nicho.has(t)) continue;
      tokens.add(t);
      const m = formaOriginal.get(t) ?? new Map<string, number>();
      m.set(o.toLowerCase(), (m.get(o.toLowerCase()) ?? 0) + 1);
      formaOriginal.set(t, m);
    }
    // Sem autor, textos quase iguais (mesmas palavras-chave) contam como a mesma pessoa.
    if (!autor) {
      const parecida = validas.find((v) => v.pessoa.startsWith("texto:") && jaccard(v.tokens, tokens) >= 0.5);
      if (parecida) {
        validas.push({ pessoa: parecida.pessoa, tokens });
        continue;
      }
    }
    validas.push({ pessoa, tokens });
  }
  // Escolha gulosa: a palavra com mais pessoas vira uma dúvida; tira essas perguntas; repete.
  const restantes = [...validas];
  const duvidas: DuvidaRepetida[] = [];
  while (duvidas.length < 5) {
    const porToken = new Map<string, Set<string>>();
    for (const v of restantes) for (const t of v.tokens) (porToken.get(t) ?? porToken.set(t, new Set()).get(t)!).add(v.pessoa);
    const melhor = [...porToken.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))[0];
    if (!melhor || melhor[1].size < minPessoas) break;
    const forma = [...(formaOriginal.get(melhor[0]) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? melhor[0];
    duvidas.push({ tema: forma, pessoas: melhor[1].size });
    for (let i = restantes.length - 1; i >= 0; i--) if (restantes[i].tokens.has(melhor[0])) restantes.splice(i, 1);
  }
  return { considerados: perguntas.length, ruido, semRepeticao: restantes.length, autoresDesconhecidos, duvidas };
}

// Evidência de uma campanha em linguagem simples (o `motivo` do diagnóstico fala em mediana e CTR).
function evidenciaCampanha(c: DiagnosticoAds["campanhas"][number], d: DiagnosticoAds): string {
  const G = GRUPOS[c.grupo];
  const un = (v: number) => (G.porMil ? `${fmtBRL(v)} para aparecer mil vezes` : `${fmtBRL(v)} por ${G.resultado}`);
  const tipica = d.grupos.find((g) => g.grupo === c.grupo)?.medianaCusto ?? null;
  if (c.veredito === "Sem resultado") return `${c.campanha}: ${fmtBRL(c.gasto)} investidos e nenhum(a) ${G.resultado}.`;
  if (c.custoPorResultado == null) return `${c.campanha}: ${fmtBRL(c.gasto)} investidos.`;
  return `${c.campanha}: ${un(c.custoPorResultado)}${tipica != null ? `, contra ${un(tipica)} da campanha típica de ${G.curto}` : ""} (${fmtBRL(c.gasto)} investidos).`;
}

// ---------------------------------------------------------------- recomendações

interface Candidata {
  id: string;
  area: Area;
  tom: Tom;
  impacto: Impacto;
  responsavel: Responsavel;
  titulo: string;
  diagnostico: string;
  evidencia: string;
  amostra: number;
  minimo: number;
  unidadeAmostra: string; // "posts", "pessoas"...
  cobertura?: number;
  acao: string;
  acaoCurta: string;
  rota?: string;
  botao?: string;
  teste?: { curto: string; texto: string };
  risco?: string;
}

const MIN_POSTS_FORMATO = 8; // posts no período para comparar formatos
const MIN_POR_FORMATO = 3;
const MIN_POSTS_TEMA = 3;
const MARGEM = 1.25;
const MIN_PESSOAS_DUVIDA = 2;
const MIN_ESPERA_MEDIDA = 10;
const ESPERA_ALTA_SEG = 15 * 60;
const MIN_LEADS_CRM = 30;

function cobertura(diasComDado: string[], start: string, end: string) {
  const todos = daysBetween(start, end);
  const set = new Set(diasComDado.map((d) => String(d).slice(0, 10)));
  const faltando = todos.filter((d) => !set.has(d));
  return { com: todos.length - faltando.length, total: todos.length, faltando, fracao: todos.length ? (todos.length - faltando.length) / todos.length : 0 };
}

const temaValido = (t: unknown) => {
  const s = String(t ?? "").trim();
  return s && !/^(nulo|null|n\/a|sem tema)$/i.test(s) ? s : null;
};

export function buildRelatorioEnvio(inp: EnvioInput): RelatorioEnvio {
  const { start, end } = inp;
  const hoje = inp.hoje ?? new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const diasPeriodo = daysBetween(start, end).length;
  const resumo: ItemEnvio[] = [];
  const vitorias: ItemEnvio[] = [];
  const atencao: ItemEnvio[] = [];
  const limitacoesItens: ItemEnvio[] = [];
  const limitacoes: Limitacao[] = [];
  const candidatas: Candidata[] = [];
  const detalhesDado: string[] = [];
  // "Não incluído por falta de dado": os mesmos avisos do relatório antigo (hub-relatorio.ts)
  // e os novos (CRM, espera não medida, recomendações descartadas).
  const omitidos: string[] = [];
  let dadoOk = true;

  const limitar = (l: Limitacao, curto: string) => {
    limitacoes.push(l);
    limitacoesItens.push({ id: l.id, curto, texto: l.texto + (l.comoResolver ? ` Como resolver: ${l.comoResolver}` : "") });
  };

  // ---------- Instagram
  const f = inp.fontes;
  const posts = (inp.posts ?? []).filter((p) => p.reach != null);
  const temasDoPerfil = (inp.posts ?? []).map((p) => temaValido(p.tema)).filter((t): t is string => !!t);
  if (f.tem_instagram) {
    const metrics = (inp.metrics ?? []).filter((m) => m.date >= start && m.date <= end);
    const cov = cobertura(metrics.filter((m) => m.reach != null).map((m) => m.date), start, end);
    detalhesDado.push(`Instagram: ${cov.com} de ${cov.total} dias com dado${cov.faltando.length ? ` (sem dado: ${trechos(cov.faltando)})` : ""}.`);
    if (cov.fracao < 0.9) {
      dadoOk = false;
      limitar(
        { id: "ig-dias", area: "conteudo", texto: `O Instagram tem dado em ${cov.com} de ${cov.total} dias do período; faltam ${trechos(cov.faltando)}. Os totais do Instagram estão subestimados.`, resolve: "equipe_hub", comoResolver: "Rodar a sincronização do Instagram para os dias faltantes." },
        `Instagram com dado em ${cov.com} de ${cov.total} dias`,
      );
    }
    if (end >= hoje) {
      detalhesDado.push(`O dia ${fmtDiaBR(hoje)} ainda está sendo coletado (números parciais).`);
      limitar({ id: "hoje-parcial", area: "resumo", texto: `O período termina hoje (${fmtDiaBR(hoje)}): os números de hoje ainda são parciais.`, resolve: "equipe_hub" }, `${fmtDiaBR(hoje)} ainda parcial`);
    }
    const somaAlcance = metrics.reduce((a, m) => a + num(m.reach), 0);
    if (inp.alcanceUnico != null && inp.alcanceUnico > 0) {
      resumo.push({ id: "alcance", curto: `${fmtCompacto(inp.alcanceUnico)} de contas alcançadas`, texto: `O conteúdo chegou a ${fmtN(inp.alcanceUnico)} contas diferentes no período, segundo o Instagram.`, evidencia: `Alcance do período lido da Meta (conta cada pessoa uma vez).` });
    } else if (somaAlcance > 0) {
      resumo.push({
        id: "alcance",
        curto: `${fmtCompacto(somaAlcance)} na soma dos alcances diários`,
        texto: `Somando o alcance de cada dia, o conteúdo teve ${fmtN(somaAlcance)} (a mesma pessoa pode ter sido contada em mais de um dia, então não é o número de pessoas diferentes).`,
        evidencia: `${cov.com} dias com alcance coletado.`,
      });
      limitar(
        { id: "alcance-unico", area: "conteudo", texto: "O número de pessoas diferentes alcançadas no período não veio da Meta; o relatório usa a soma dos alcances diários, que conta a mesma pessoa mais de uma vez.", resolve: "equipe_hub", comoResolver: "Abrir a Visão geral para ler o alcance do período direto da Meta." },
        "alcance é a soma dos dias, não pessoas únicas",
      );
    } else {
      omitidos.push("alcance (nenhum dia com alcance coletado no período)");
    }
    if (posts.length > 0) resumo.push({ id: "posts", curto: `${posts.length} ${plural(posts.length, "publicação", "publicações")}`, texto: `${posts.length} ${plural(posts.length, "publicação", "publicações")} no período.` });

    const seg = analyzeFollowers(metrics, start, end, hoje);
    if (seg.delta != null && seg.points.length >= 2) {
      const de = seg.points[0];
      const ate = seg.points[seg.points.length - 1];
      const texto = `O perfil ${seg.delta >= 0 ? "ganhou" : "perdeu"} ${fmtN(Math.abs(seg.delta))} seguidores entre ${fmtDiaBR(de.date)} e ${fmtDiaBR(ate.date)} e está com ${fmtN(ate.followers)}.`;
      if (seg.delta > 0) {
        vitorias.push({ id: "seguidores", curto: `+${fmtN(seg.delta)} seguidores (agora ${fmtCompacto(ate.followers)})`, texto, evidencia: `Contagem de seguidores em ${seg.daysWithData} dias.` });
      } else if (seg.delta < 0) {
        atencao.push({ id: "seguidores", curto: `${fmtN(seg.delta)} seguidores no período`, texto, evidencia: `Contagem de seguidores em ${seg.daysWithData} dias.` });
      } else {
        // Sem ganho nem perda: o relatório antigo mostrava mesmo assim ("ganhou 0"); continua no resumo.
        resumo.push({
          id: "seguidores",
          curto: `seguidores estáveis (${fmtCompacto(ate.followers)})`,
          texto: `O perfil não ganhou nem perdeu seguidores entre ${fmtDiaBR(de.date)} e ${fmtDiaBR(ate.date)} e está com ${fmtN(ate.followers)}.`,
          evidencia: `Contagem de seguidores em ${seg.daysWithData} dias.`,
        });
      }
    } else {
      omitidos.push("seguidores (menos de 2 dias com contagem gravada no período)");
    }

    // Post de maior alcance
    const top = [...posts].sort((a, b) => num(b.reach) - num(a.reach))[0];
    if (top && num(top.reach) > 0) {
      const leg = String(top.caption ?? "").split("\n")[0].replace(/\s+/g, " ").trim();
      const trecho = leg ? `"${leg.length > 70 ? leg.slice(0, 67).trimEnd() + "..." : leg}"` : "";
      vitorias.push({
        id: "post-top",
        curto: `post de maior alcance: ${fmtCompacto(num(top.reach))} contas${top.format ? ` (${fmtFormatKey(top.format).toLowerCase()})` : ""}`,
        texto: `A publicação de maior alcance foi ${trecho ? trecho + " " : ""}(${top.format ? fmtFormatKey(top.format) : "post"}), com ${fmtN(num(top.reach))} contas alcançadas${top.saved != null ? ` e ${fmtN(num(top.saved))} salvamentos` : ""}.`,
        evidencia: top.permalink ?? undefined,
      });
    } else {
      omitidos.push("post destaque (nenhum post com alcance no período)");
    }

    // Formato que mais alcança
    const porFormato = new Map<string, number[]>();
    for (const p of posts) if (p.format) (porFormato.get(p.format) ?? porFormato.set(p.format, []).get(p.format)!).push(num(p.reach));
    const formatos = [...porFormato.entries()].map(([k, v]) => ({ k, n: v.length, med: median(v) })).filter((x) => x.n >= MIN_POR_FORMATO).sort((a, b) => b.med - a.med);
    const geral = median(posts.map((p) => num(p.reach)));
    if (formatos.length >= 1) {
      const b = formatos[0];
      const outro = formatos.find((x) => x.k !== b.k);
      const nome = fmtFormatKey(b.k);
      const destaca = b.med >= geral * MARGEM;
      if (destaca) {
        candidatas.push({
          id: "formato",
          area: "conteudo",
          tom: "bom",
          impacto: "medio",
          responsavel: "social_media",
          titulo: `${nome} é o formato que mais alcança`,
          diagnostico: `O ${nome.toLowerCase()} típico do período alcançou ${fmtN(b.med)} contas, contra ${fmtN(geral)} do post típico da conta.`,
          evidencia: `${b.n} posts em ${nome.toLowerCase()}; ${posts.length} posts no período${outro ? `; ${fmtFormatKey(outro.k).toLowerCase()} típico: ${fmtN(outro.med)}` : ""}.`,
          amostra: formatos.length >= 2 ? posts.length : 0,
          minimo: MIN_POSTS_FORMATO,
          unidadeAmostra: "posts com alcance, em 2+ formatos",
          acao: `Fazer pelo menos metade das próximas publicações em ${nome.toLowerCase()}, mantendo os temas que já funcionam.`,
          acaoCurta: `priorizar ${nome.toLowerCase()} nas próximas publicações`,
          rota: "/$clientId/conteudo",
          botao: "Ver alcance por formato",
          teste: outro
            ? { curto: `mesmo tema em ${nome.toLowerCase()} e em ${fmtFormatKey(outro.k).toLowerCase()}`, texto: `Publicar o mesmo tema em ${nome.toLowerCase()} e em ${fmtFormatKey(outro.k).toLowerCase()} na mesma semana e comparar o alcance depois de 7 dias.` }
            : undefined,
          risco: "Um post fora da curva pode puxar o formato para cima; por isso a comparação usa o post típico, não a média.",
        });
        if (destaca && formatos.length >= 2 && posts.length >= MIN_POSTS_FORMATO) {
          vitorias.push({ id: "formato", curto: `${nome.toLowerCase()} alcança ${(b.med / Math.max(1, geral)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x o post típico`, texto: `O ${nome.toLowerCase()} típico alcançou ${fmtN(b.med)} contas, contra ${fmtN(geral)} do post típico da conta.`, evidencia: `${b.n} posts em ${nome.toLowerCase()}, ${posts.length} no total.` });
        }
      }
    }

    // Tema com mais salvamentos (salvar = a pessoa quer rever: sinal de conteúdo útil)
    const comSalvo = posts.filter((p) => p.saved != null);
    const baseSalvo = median(comSalvo.map((p) => num(p.saved)));
    const porTema = new Map<string, { nome: string; salvos: number[] }>();
    for (const p of comSalvo) {
      const t = temaValido(p.tema);
      if (!t) continue;
      const k = dobra(t);
      const g = porTema.get(k) ?? { nome: t, salvos: [] };
      g.salvos.push(num(p.saved));
      porTema.set(k, g);
    }
    const temas = [...porTema.values()].map((g) => ({ ...g, med: median(g.salvos) })).filter((g) => g.med > 0 && g.med >= baseSalvo * MARGEM).sort((a, b) => b.med - a.med || b.salvos.length - a.salvos.length);
    const temaTop = temas.find((t) => t.salvos.length >= MIN_POSTS_TEMA) ?? temas[0];
    if (temaTop) {
      candidatas.push({
        id: "tema",
        area: "conteudo",
        tom: "bom",
        impacto: "medio",
        responsavel: "social_media",
        titulo: `O tema "${temaTop.nome}" é o mais salvo`,
        diagnostico: `Os posts sobre "${temaTop.nome}" foram salvos, no caso típico, ${fmtN(temaTop.med)} vezes, contra ${fmtN(baseSalvo)} do post típico da conta. Salvar indica que a pessoa quer rever: é conteúdo útil.`,
        evidencia: `${temaTop.salvos.length} posts sobre o tema; ${comSalvo.length} posts com salvamento medido.`,
        amostra: temaTop.salvos.length,
        minimo: MIN_POSTS_TEMA,
        unidadeAmostra: "posts no tema",
        acao: `Fazer mais 2 publicações sobre "${temaTop.nome}" com outro ângulo (dúvida comum, mito ou passo a passo).`,
        acaoCurta: `mais 2 posts sobre "${temaTop.nome}"`,
        rota: "/$clientId/ideias",
        botao: "Ver ideias de pauta",
        teste: { curto: `"${temaTop.nome}" com outro ângulo`, texto: `Testar "${temaTop.nome}" num ângulo novo (mito x verdade ou passo a passo) e comparar os salvamentos com os posts anteriores do tema.` },
      });
    }

    // Dúvidas repetidas
    const com = duvidasRepetidas(inp.perguntas ?? [], 1, temasDoPerfil);
    const d1 = com.duvidas[0];
    if (d1) {
      candidatas.push({
        id: "duvida",
        area: "ideias",
        tom: "atencao",
        impacto: "medio",
        responsavel: "medico",
        titulo: `${d1.pessoas} ${plural(d1.pessoas, "pessoa perguntou", "pessoas diferentes perguntaram")} sobre ${d1.tema}`,
        diagnostico: "A mesma dúvida em pessoas diferentes mostra um assunto que o público quer entender e que ainda não foi respondido.",
        evidencia: `${d1.pessoas} ${plural(d1.pessoas, "pessoa", "pessoas diferentes")} nos comentários do período (comentários não são citados).`,
        amostra: d1.pessoas,
        minimo: MIN_PESSOAS_DUVIDA,
        unidadeAmostra: "pessoa(s) diferente(s)",
        acao: `Responder em uma publicação educativa a dúvida sobre ${d1.tema}, sem citar quem perguntou.`,
        acaoCurta: `post respondendo a dúvida sobre ${d1.tema}`,
        rota: "/$clientId/duvidas",
        botao: "Ver dúvidas dos pacientes",
        teste: { curto: `responder ${d1.tema} em reels e ver se a dúvida diminui`, texto: `Responder a dúvida sobre ${d1.tema} em um reels e conferir, no mês seguinte, se a pergunta aparece menos nos comentários.` },
        risco: com.autoresDesconhecidos > 0 ? `${com.autoresDesconhecidos} comentários vieram sem o nome do autor; nesses, textos diferentes foram contados como pessoas diferentes.` : undefined,
      });
    }
  } else {
    dadoOk = false;
    omitidos.push("alcance, seguidores e post destaque (Instagram não conectado)");
    detalhesDado.push("Instagram: não conectado.");
    limitar({ id: "sem-ig", area: "conteudo", texto: "O Instagram não está conectado: alcance, seguidores e conteúdo ficam fora do relatório.", resolve: "equipe_hub", comoResolver: "Conectar o perfil profissional em Fontes." }, "Instagram não conectado");
  }

  // ---------- Anúncios (só pelo diagnóstico por objetivo)
  if (f.tem_anuncios && inp.ads) {
    const { diag } = inp.ads;
    const cov = cobertura(inp.ads.diasComDado, start, end);
    detalhesDado.push(`Anúncios: ${cov.com} de ${cov.total} dias com dado${cov.faltando.length ? ` (sem linha: ${trechos(cov.faltando)}; pode ser dia sem campanha ativa)` : ""}.`);
    if (diag.gasto <= 0) {
      omitidos.push("anúncios (conta conectada, mas sem investimento no período)");
      limitar({ id: "ads-sem-gasto", area: "anuncios", texto: "A conta de anúncios está conectada, mas não houve investimento no período.", resolve: "gestor_trafego" }, "sem investimento em anúncios");
    } else {
      const msg = diag.custoPorConversaMensagem;
      resumo.push({
        id: "ads",
        curto: `${fmtBRL(diag.gasto)} em anúncios${diag.conversas > 0 ? `; ${fmtN(diag.conversas)} conversas no total (${fmtBRL(diag.gasto / diag.conversas)} cada)` : ""}${msg != null ? `; nas campanhas de mensagem, ${fmtBRL(msg)} cada` : ""}`,
        texto: `${fmtBRL(diag.gasto)} investidos em anúncios${diag.conversas > 0 ? `, com ${fmtN(diag.conversas)} conversas somando todas as campanhas (${fmtBRL(diag.gasto / diag.conversas)} por conversa na conta toda)` : ""}.${msg != null ? ` Só as campanhas de mensagem abriram ${fmtN(diag.conversasMensagem)} conversas, a ${fmtBRL(msg)} cada (${fmtBRL(diag.gastoMensagem)} ÷ ${fmtN(diag.conversasMensagem)}).` : ""}`,
        // O total de conversas de TODAS as campanhas (o número do relatório antigo) continua na evidência.
        evidencia: `${diag.campanhas.length} campanhas. Conta toda: ${fmtBRL(diag.gasto)} ÷ ${fmtN(diag.conversas)} conversas. Campanhas de mensagem: ${fmtBRL(diag.gastoMensagem)} ÷ ${fmtN(diag.conversasMensagem)} conversas.`,
      });
      if (msg == null) {
        limitar(
          { id: "ads-sem-mensagem", area: "anuncios", texto: "Nenhuma campanha de mensagem (WhatsApp/Direct) no período: o custo por conversa não se aplica. As campanhas foram medidas pelo resultado do objetivo de cada uma.", resolve: "gestor_trafego" },
          "sem campanha de mensagem: custo por conversa não se aplica",
        );
      }
      const ruins = diag.campanhas.filter((c) => c.veredito === "Cortar" || c.veredito === "Sem resultado");
      if (ruins.length > 0) {
        const pct = Math.round((diag.desperdicio / diag.gasto) * 100);
        atencao.push({
          id: "ads-desperdicio",
          curto: `${fmtBRL(diag.desperdicio)} (${pct}% da verba) em ${ruins.length} ${plural(ruins.length, "campanha", "campanhas")} sem resultado ou caras demais`,
          texto: `${fmtBRL(diag.desperdicio)} (${pct}% do investimento) foram para ${ruins.length} ${plural(ruins.length, "campanha", "campanhas")} que não trouxeram o resultado do objetivo ou custaram 2 vezes ou mais que as campanhas parecidas.`,
          evidencia: ruins.slice(0, 3).map((c) => evidenciaCampanha(c, diag)).join(" "),
        });
        candidatas.push({
          id: "ads-cortar",
          area: "anuncios",
          tom: "ruim",
          impacto: diag.desperdicio / diag.gasto >= 0.15 ? "alto" : "medio",
          responsavel: "gestor_trafego",
          titulo: `${ruins.length} ${plural(ruins.length, "campanha consome", "campanhas consomem")} verba sem retorno`,
          diagnostico: "Cada campanha foi comparada só com as do mesmo objetivo; estas ficaram sem resultado ou com custo 2 vezes ou mais acima das parecidas.",
          evidencia: `${fmtBRL(diag.desperdicio)} em ${ruins.length} campanhas, todas com pelo menos ${MIN_IMPRESSOES} impressões e R$ ${MIN_GASTO} de gasto.`,
          amostra: ruins.length,
          minimo: 1,
          unidadeAmostra: "campanhas com volume",
          acao: `Pausar ou trocar o anúncio de ${ruins.length} ${plural(ruins.length, "campanha", "campanhas")} e passar a verba (${fmtBRL(diag.desperdicio)}) para as que entregam resultado.`,
          acaoCurta: `pausar ou trocar ${ruins.length} ${plural(ruins.length, "campanha", "campanhas")} (${fmtBRL(diag.desperdicio)})`,
          rota: "/$clientId/anuncios",
          botao: "Ver campanhas para cortar",
        });
      }
      const escalar = diag.campanhas.filter((c) => c.veredito === "Escalar");
      if (escalar.length > 0) {
        vitorias.push({
          id: "ads-escalar",
          curto: `${escalar.length} ${plural(escalar.length, "campanha entrega", "campanhas entregam")} resultado bem mais barato`,
          texto: `${escalar.length} ${plural(escalar.length, "campanha entregou", "campanhas entregaram")} o resultado do objetivo por 60% ou menos do custo das campanhas parecidas.`,
          evidencia: escalar.slice(0, 3).map((c) => evidenciaCampanha(c, diag)).join(" "),
        });
      }
      const cmp = conversaMaisBarata(diag);
      if (cmp) {
        const caro = minusc(GRUPOS[cmp.caro.grupo].nome);
        const barato = minusc(GRUPOS[cmp.barato.grupo].nome);
        candidatas.push({
          id: "ads-objetivo",
          area: "anuncios",
          tom: "atencao",
          impacto: "alto",
          responsavel: "gestor_trafego",
          titulo: `A conversa sai mais barata em campanhas de ${barato}`,
          diagnostico: `Cada conversa vinda de ${barato} custou ${fmtBRL(cmp.barato.custoPorConversa!)}; ${cmp.vezes != null ? `vinda de ${caro} custou ${cmp.vezes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} vezes mais` : `${caro} quase não gerou conversa`}.`,
          evidencia: `${fmtN(cmp.barato.conversas)} conversas em ${barato}; ${fmtBRL(cmp.caro.gasto)} investidos em ${caro}.`,
          amostra: cmp.barato.conversas,
          minimo: 10,
          unidadeAmostra: "conversas na referência",
          acao: `Mover 20% da verba de ${caro} para campanhas de mensagem por 2 semanas e comparar o custo por conversa.`,
          acaoCurta: `mover 20% da verba de ${caro} para mensagem`,
          rota: "/$clientId/anuncios",
          botao: "Ver custo por objetivo",
          teste: { curto: `20% da verba de ${caro} em mensagem por 2 semanas`, texto: `Por 2 semanas, mover 20% da verba de ${caro} para mensagem e comparar quantas conversas cada real trouxe.` },
          risco: "Campanha de tráfego e de alcance têm outro propósito (levar ao perfil, ser visto); a comparação só olha conversa.",
        });
      }
      if (escalar.length > 0) {
        candidatas.push({
          id: "ads-escalar",
          area: "anuncios",
          tom: "bom",
          impacto: "medio",
          responsavel: "gestor_trafego",
          titulo: `${escalar.length} ${plural(escalar.length, "campanha cabe", "campanhas cabem")} mais verba`,
          diagnostico: "Entregam o resultado por bem menos que as parecidas; é onde um real a mais rende mais.",
          evidencia: escalar.slice(0, 2).map((c) => evidenciaCampanha(c, diag)).join(" "),
          amostra: escalar.length,
          minimo: 1,
          unidadeAmostra: "campanhas comparáveis",
          acao: `Aumentar em 20% a verba de ${escalar.length} ${plural(escalar.length, "campanha", "campanhas")} e conferir o custo em 7 dias.`,
          acaoCurta: `+20% de verba nas ${escalar.length} campanhas mais baratas`,
          rota: "/$clientId/anuncios",
          botao: "Ver campanhas para escalar",
          teste: { curto: `+20% de verba nas campanhas mais baratas por 7 dias`, texto: `Aumentar em 20% a verba das campanhas mais baratas e ver, em 7 dias, se o custo por resultado se mantém.` },
        });
      }
    }
  } else if (!f.tem_anuncios) {
    dadoOk = false;
    omitidos.push("anúncios (conta de anúncios não conectada)");
    detalhesDado.push("Anúncios: conta não conectada.");
    limitar({ id: "sem-ads", area: "anuncios", texto: "A conta de anúncios não está conectada: investimento e custo por conversa ficam fora.", resolve: "equipe_hub", comoResolver: "Ligar a conta de anúncios do cliente." }, "anúncios não conectados");
  } else {
    omitidos.push("anúncios (conta conectada, mas os dados do período não foram lidos)");
  }

  // ---------- WhatsApp de atendimento
  if (f.tem_atendimento && inp.wts) {
    const r = inp.wts.resumo;
    const cov = cobertura(inp.wts.diasComDado, start, end);
    detalhesDado.push(`WhatsApp de atendimento: atendimentos em ${cov.com} de ${cov.total} dias.`);
    const at = num(r?.atendimentos);
    if (at <= 0) {
      dadoOk = false;
      omitidos.push("atendimento (conectado, mas sem atendimentos no período)");
      limitar({ id: "wts-vazio", area: "comercial", texto: "O WhatsApp de atendimento está conectado, mas não registrou atendimentos no período. Pode ser falha na sincronização.", resolve: "equipe_hub", comoResolver: "Conferir a sincronização do WhatsApp de atendimento." }, "WhatsApp sem atendimentos registrados");
    } else {
      const medidos = num(r.espera_cobertura); // wts_resumo: quantos atendimentos têm espera medida
      const esp = r.espera_mediana_seg != null ? num(r.espera_mediana_seg) : null;
      // Espera dentro do aceitável: o relatório antigo mostrava sempre que medida; continua no resumo.
      // Acima de 15 min ela vira ponto de atenção (abaixo), como já era.
      const esperaBoa = esp != null && medidos > 0 && esp <= ESPERA_ALTA_SEG;
      resumo.push({
        id: "wts",
        curto: `${fmtN(at)} atendimentos no WhatsApp${esperaBoa ? `; metade respondida em até ${fmtDuracao(esp!)}` : ""}`,
        texto: `${fmtN(at)} atendimentos no WhatsApp, de ${fmtN(num(r.contatos_distintos))} pessoas diferentes.${esperaBoa ? ` Metade dos pacientes recebeu a primeira resposta em até ${fmtDuracao(esp!)}.` : ""}`,
        evidencia: esperaBoa ? `${medidos} atendimentos com tempo de espera medido, de ${fmtN(at)}.` : undefined,
      });
      if (esp == null || medidos <= 0) omitidos.push("tempo até a primeira resposta no WhatsApp (nenhum atendimento com espera medida)");
      if (cov.fracao < 0.5) {
        dadoOk = false;
        limitar({ id: "wts-dias", area: "comercial", texto: `Houve atendimento registrado em só ${cov.com} de ${cov.total} dias. Se a clínica atende todo dia útil, parte das conversas pode não estar chegando ao painel.`, resolve: "equipe_hub", comoResolver: "Conferir se todos os números e departamentos estão ligados." }, `WhatsApp com registro em ${cov.com} de ${cov.total} dias`);
      }
      if (esp != null && esp > ESPERA_ALTA_SEG) {
        atencao.push({ id: "wts-espera", curto: `metade dos pacientes esperou mais de ${fmtDuracao(esp)} pela 1ª resposta`, texto: `Metade dos pacientes esperou mais de ${fmtDuracao(esp)} pela primeira resposta no WhatsApp.`, evidencia: `${medidos} atendimentos com tempo de espera medido, de ${fmtN(at)}.` });
        candidatas.push({
          id: "wts-espera",
          area: "comercial",
          tom: "ruim",
          impacto: "alto",
          responsavel: "atendimento",
          titulo: "Primeira resposta no WhatsApp está lenta",
          diagnostico: `Metade dos pacientes esperou mais de ${fmtDuracao(esp)} pela primeira resposta. Quem espera muito procura outro consultório.`,
          evidencia: `${medidos} atendimentos com espera medida, de ${fmtN(at)} no período.`,
          amostra: medidos,
          minimo: MIN_ESPERA_MEDIDA,
          unidadeAmostra: "atendimentos com espera medida",
          cobertura: at > 0 ? medidos / at : 0,
          acao: "Definir quem responde a primeira mensagem em até 15 minutos no horário comercial e usar uma mensagem de boas-vindas fora dele.",
          acaoCurta: "primeira resposta no WhatsApp em até 15 minutos",
          rota: "/$clientId/atendimento",
          botao: "Ver tempos de atendimento",
        });
      }
    }
  } else if (!f.tem_atendimento) {
    dadoOk = false;
    omitidos.push("atendimento (WhatsApp de atendimento não conectado)");
    detalhesDado.push("WhatsApp de atendimento: não conectado.");
    limitar({ id: "sem-wts", area: "comercial", texto: "O WhatsApp de atendimento não está conectado: não dá para saber quantas conversas viraram atendimento nem o tempo de resposta.", resolve: "equipe_hub", comoResolver: "Conectar a plataforma de atendimento." }, "WhatsApp de atendimento não conectado");
  } else {
    omitidos.push("atendimento (conectado, mas os dados do período não foram lidos)");
  }

  // ---------- CRM
  if (f.tem_crm && inp.crm) {
    const r = inp.crm.resumo;
    const cov = cobertura(inp.crm.diasComDado, start, end);
    detalhesDado.push(`CRM: novos contatos registrados em ${cov.com} de ${cov.total} dias.`);
    const novos = num(r?.novos);
    if (novos > 0) {
      resumo.push({ id: "crm", curto: `${fmtN(novos)} novos contatos no CRM`, texto: `${fmtN(novos)} novos contatos no CRM, ${fmtN(num(r!.ganhos))} marcados como ganhos e ${fmtN(num(r!.perdidos))} como perdidos.` });
      if (num(r!.ganhos) > 0) vitorias.push({ id: "crm-ganhos", curto: `${fmtN(num(r!.ganhos))} ${plural(num(r!.ganhos), "contato fechado", "contatos fechados")} no CRM`, texto: `${fmtN(num(r!.ganhos))} contatos foram marcados como ganhos no CRM.` });
      if (num(r!.ganhos) === 0) {
        candidatas.push({
          id: "crm-ganhos",
          area: "comercial",
          tom: "atencao",
          impacto: "alto",
          responsavel: "comercial",
          titulo: "Nenhum contato marcado como ganho no CRM",
          diagnostico: `Entraram ${fmtN(novos)} contatos e nenhum foi marcado como ganho. Ou os fechamentos não estão sendo registrados, ou nenhum fechou; sem isso não dá para saber quanto o marketing trouxe de paciente.`,
          evidencia: `${fmtN(novos)} novos, 0 ganhos, ${fmtN(num(r!.perdidos))} perdidos no período.`,
          amostra: novos,
          minimo: MIN_LEADS_CRM,
          unidadeAmostra: "contatos novos",
          acao: "Marcar no CRM, toda semana, quem agendou consulta (ganho) e quem desistiu (perdido).",
          acaoCurta: "registrar no CRM quem agendou consulta",
          rota: "/$clientId/crm-painel",
          botao: "Abrir o CRM",
        });
      }
    } else {
      dadoOk = false;
      omitidos.push("CRM (conectado, mas sem contatos novos no período)");
      limitar({ id: "crm-vazio", area: "comercial", texto: "O CRM está conectado, mas não registrou contatos novos no período.", resolve: "comercial", comoResolver: "Conferir se os contatos estão sendo lançados no CRM." }, "CRM sem contatos novos");
    }
  } else if (!f.tem_crm) {
    dadoOk = false;
    omitidos.push("CRM (não conectado)");
    detalhesDado.push("CRM: não conectado.");
    limitar({ id: "sem-crm", area: "comercial", texto: "O CRM não está conectado: não dá para ligar o marketing a consultas fechadas.", resolve: "equipe_hub", comoResolver: "Conectar o CRM da clínica." }, "CRM não conectado");
  } else {
    omitidos.push("CRM (conectado, mas os dados do período não foram lidos)");
  }

  // ---------- validação das recomendações
  const insights: Insight[] = [];
  const descartadas: { titulo: string; motivo: string }[] = [];
  const acoes: ItemEnvio[] = [];
  const testes: ItemEnvio[] = [];
  for (const c of candidatas) {
    if (!c.evidencia.trim()) {
      descartadas.push({ titulo: c.titulo, motivo: "sem evidência que sustente a recomendação" });
      continue;
    }
    if (c.amostra < c.minimo) {
      descartadas.push({ titulo: c.titulo, motivo: `amostra pequena: ${c.amostra} ${c.unidadeAmostra} (mínimo ${c.minimo})` });
      continue;
    }
    const confianca = confiancaPorAmostra(c.amostra, c.minimo, c.cobertura ?? 1);
    insights.push({
      id: c.id,
      area: c.area,
      tom: c.tom,
      titulo: c.titulo,
      diagnostico: c.diagnostico,
      evidencia: c.evidencia,
      confianca,
      motivoConfianca: `${c.amostra} ${c.unidadeAmostra} (mínimo ${c.minimo})`,
      impacto: c.impacto,
      acao: { texto: c.acao, rota: c.rota, botao: c.botao },
      responsavel: c.responsavel,
      risco: c.risco,
    });
    if (c.id !== "ads-escalar") acoes.push({ id: c.id, curto: c.acaoCurta, texto: `${c.acao} Por quê: ${c.diagnostico}`, evidencia: c.evidencia });
    if (c.teste) testes.push({ id: `teste-${c.id}`, curto: c.teste.curto, texto: c.teste.texto, evidencia: c.evidencia });
    if (c.id === "duvida") atencao.push({ id: "duvida", curto: c.titulo.charAt(0).toLowerCase() + c.titulo.slice(1), texto: `${c.titulo} nos comentários.`, evidencia: c.evidencia });
  }
  // Ordem das ações: impacto, depois tom
  const peso = (id: string) => {
    const i = insights.find((x) => x.id === id);
    if (!i) return 0;
    return ({ alto: 3, medio: 2, baixo: 1 })[i.impacto] * ({ ruim: 3, atencao: 2, bom: 1 })[i.tom];
  };
  acoes.sort((a, b) => peso(b.id) - peso(a.id));
  if (acoes.length === 0) {
    omitidos.push(
      f.tem_instagram
        ? "ações recomendadas (sem dado suficiente: nenhuma recomendação teve evidência e amostra mínima)"
        : "ações recomendadas de conteúdo (dependem do Instagram)",
    );
  }
  for (const d of descartadas) omitidos.push(`recomendação "${d.titulo}" (${d.motivo})`);

  // ---------- linguagem segura (em cada item, antes de montar as versões)
  // Nada é apagado: a frase de risco recebe a reescrita segura (padrão) ou fica como foi gerada,
  // se a equipe clicou em "Manter original". Toda frase sinalizada fica listada na checagem.
  const manter = inp.manterOriginal ?? [];
  const alteracoes: AlteracaoLinguagem[] = [];
  const registrar = (secao: string, lista: ReturnType<typeof tornarSeguro>["alteracoes"]) => {
    for (const a of lista) if (!alteracoes.some((x) => x.original === a.original)) alteracoes.push({ secao, ...a });
  };
  const bruto: ConteudoEnvio = { resumo, vitorias, atencao, acoes, testes: testes.slice(0, 3), limitacoes: limitacoesItens };
  const conteudoCompleto = {} as ConteudoEnvio;
  for (const s of SECOES) {
    conteudoCompleto[s.id] = [];
    for (const it of bruto[s.id]) {
      const c = tornarSeguro(it.curto, { manter });
      const t = tornarSeguro(it.texto, { manter });
      registrar(s.titulo, [...c.alteracoes, ...t.alteracoes]);
      // Evidência também passa pela checagem (pode trazer nome de campanha/legenda).
      const e = it.evidencia ? tornarSeguro(it.evidencia, { manter }) : null;
      registrar(`${s.titulo} (evidência)`, e?.alteracoes ?? []);
      // Nunca some um item: se a reescrita esvaziar o texto, fica o original.
      conteudoCompleto[s.id].push({ ...it, curto: (c.texto || it.curto).replace(/[.]$/, ""), texto: t.texto || it.texto, evidencia: e ? e.texto || it.evidencia : undefined });
    }
  }

  // ---------- o que entra (escolha da equipe; vale para WhatsApp, executiva e PDF)
  const blocos: BlocoEnvio[] = SECOES.flatMap((s) => conteudoCompleto[s.id].map((it) => ({ chave: `${s.id}:${it.id}`, secao: s.id, rotulo: rotuloBloco(s.id, it) })));
  const excluir = new Set(inp.excluir ?? []);
  const conteudo = {} as ConteudoEnvio;
  const excluidos: string[] = [];
  for (const s of SECOES) {
    const secaoFora = excluir.has(`secao:${s.id}`);
    if (secaoFora && conteudoCompleto[s.id].length > 0) excluidos.push(`${s.titulo} (seção inteira)`);
    conteudo[s.id] = conteudoCompleto[s.id].filter((it) => {
      const fora = secaoFora || excluir.has(`${s.id}:${it.id}`);
      if (fora && !secaoFora) excluidos.push(`${s.titulo}: ${rotuloBloco(s.id, it)}`);
      return !fora;
    });
  }

  // ---------- checagem
  const com = duvidasRepetidas(f.tem_instagram ? inp.perguntas ?? [] : [], MIN_PESSOAS_DUVIDA, temasDoPerfil);
  const checagem: ChecagemItem[] = [
    {
      id: "dado_completo",
      titulo: "Dado completo",
      status: dadoOk ? "ok" : "atencao",
      resumo: dadoOk ? `Todas as fontes conectadas e com dado nos ${diasPeriodo} dias.` : "Há fonte desconectada ou dias sem dado; isso vai escrito no relatório.",
      detalhes: detalhesDado,
    },
    {
      id: "recomendacao",
      titulo: "Recomendação faz sentido",
      status: descartadas.length === 0 && insights.length > 0 ? "ok" : "atencao",
      resumo:
        insights.length === 0
          ? "Nenhuma recomendação passou: nenhuma tinha evidência e amostra mínima."
          : `${insights.length} ${plural(insights.length, "recomendação tem", "recomendações têm")} evidência e amostra mínima${descartadas.length ? `; ${descartadas.length} ${plural(descartadas.length, "foi descartada", "foram descartadas")}` : ""}.`,
      detalhes: [
        ...insights.map((i) => `Mantida: ${i.titulo} (${i.motivoConfianca}).`),
        ...descartadas.map((d) => `Descartada: ${d.titulo}, ${d.motivo}.`),
      ],
    },
    {
      id: "comentarios",
      titulo: "Ruído dos comentários",
      status: com.autoresDesconhecidos > 0 ? "atencao" : "ok",
      resumo: f.tem_instagram
        ? `${com.considerados} perguntas lidas; ${com.ruido} ignoradas como ruído; ${com.duvidas.length} ${plural(com.duvidas.length, "dúvida repetida", "dúvidas repetidas")} por 2+ pessoas. Nenhum comentário é citado.`
        : "Sem Instagram, sem comentários para ler.",
      detalhes: [
        `Ignorado: emoji sozinho, @ de outra pessoa, link, sorteio/divulgação e comentário que não é pergunta (${com.ruido}).`,
        `Pergunta feita por uma pessoa só não vira pauta (${com.semRepeticao}).`,
        ...com.duvidas.map((d) => `Dúvida repetida: ${d.tema}, ${d.pessoas} pessoas diferentes.`),
        ...(com.autoresDesconhecidos > 0 ? [`${com.autoresDesconhecidos} comentários vieram sem o nome do autor: textos diferentes contaram como pessoas diferentes e textos iguais, como uma só.`] : []),
        NOTA_ALGORITMO_DUVIDAS,
      ],
    },
    {
      id: "linguagem",
      titulo: "Linguagem segura (CFM)",
      status: alteracoes.length === 0 ? "ok" : "atencao",
      resumo:
        alteracoes.length === 0
          ? "Nenhuma promessa de resultado, preço, nome de remédio ou superlativo."
          : `${alteracoes.length} ${plural(alteracoes.length, "trecho sinalizado", "trechos sinalizados")}: ${alteracoes.filter((a) => !a.mantido).length} com a reescrita segura aplicada${alteracoes.some((a) => a.mantido) ? `, ${alteracoes.filter((a) => a.mantido).length} mantido(s) como no original por escolha da equipe` : ""}. Nada foi apagado.`,
      detalhes: alteracoes.map((a) =>
        a.mantido
          ? `Mantido como no original (${a.motivos.join("; ")}): "${a.original}". Sugestão não usada: "${a.corrigido}"`
          : `Reescrito (${a.motivos.join("; ")}): "${a.original}" → "${a.corrigido}"`,
      ),
    },
  ];

  const whatsapp = montarWhatsapp(inp, conteudo);
  const executiva = montarExecutiva(inp, conteudo);
  return { conteudo, conteudoCompleto, blocos, excluidos, omitidos, manterOriginal: [...manter], checagem, insights, limitacoes, descartadas, alteracoes, whatsapp, executiva };
}

/**
 * Três algoritmos contam dúvidas no Hub; o relatório não muda o seu (regra: não mexer em cálculo),
 * mas diz a diferença. A troca pelo da tela Dúvidas não foi feita porque ele descarta mais
 * (profissionais de saúde, conversa entre seguidores, pergunta sem "?") e agrupa por assunto,
 * o que tiraria dúvidas que hoje aparecem aqui.
 */
export const NOTA_ALGORITMO_DUVIDAS =
  "Como as dúvidas são contadas aqui: o relatório agrupa as perguntas do período por palavra-chave (a palavra dita pelo maior número de pessoas diferentes vira uma dúvida, até 5). A tela Dúvidas dos pacientes (e as ideias de conteúdo que saem das dúvidas) agrupa por assunto e intenção e lê também comentários comerciais sem \"?\". Por isso a mesma dúvida pode aparecer com números diferentes nas duas telas; nenhum dos dois cita o comentário.";

const ROTULO_BLOCO: Record<string, string> = {
  alcance: "Alcance",
  posts: "Publicações",
  seguidores: "Seguidores",
  "post-top": "Post destaque",
  formato: "Formato que mais alcança",
  ads: "Anúncios",
  "ads-desperdicio": "Anúncios: verba sem retorno",
  "ads-escalar": "Anúncios: campanhas mais baratas",
  wts: "Atendimento",
  "wts-espera": "Atendimento: espera",
  crm: "CRM",
  "crm-ganhos": "CRM: contatos fechados",
  duvida: "Dúvida repetida",
};

function rotuloBloco(secao: SecaoId, it: ItemEnvio): string {
  const base = secao === "testes" || secao === "acoes" || secao === "limitacoes" ? null : ROTULO_BLOCO[it.id];
  if (base) return base;
  const t = it.curto.charAt(0).toUpperCase() + it.curto.slice(1);
  return t.length > 70 ? t.slice(0, 67).trimEnd() + "..." : t;
}

// ---------------------------------------------------------------- versões

export const LIMITE_WHATSAPP = 900;
const semTravessao = (s: string) => s.replace(/\s*[—–]\s*/g, ", ");

// Estilo opcional (tom do texto e blocos extras, como pendências do cliente). Sem estilo, o texto é o de sempre.
export interface EstiloTexto {
  abertura?: string;
  cab?: Partial<Record<SecaoId, string>>;
  fechamento?: string;
  extras?: { titulo: string; itens: string[] }[];
}

export function montarWhatsapp(inp: Pick<EnvioInput, "clientName" | "periodLabel">, c: ConteudoEnvio, limite = LIMITE_WHATSAPP, estilo: EstiloTexto = {}): string {
  // Emoji com parcimônia: só em dois títulos.
  const cab: Record<SecaoId, string> = {
    resumo: "*Resumo do período*",
    vitorias: "*✅ Vitórias*",
    atencao: "*⚠️ Atenção*",
    acoes: "*Ações recomendadas*",
    testes: "*Próximos testes*",
    limitacoes: "*Dados incompletos*",
  };
  const max: Record<SecaoId, number> = { resumo: 3, vitorias: 2, atencao: 2, acoes: 3, testes: 1, limitacoes: 2 };
  const montar = () => {
    const blocos: string[] = [estilo.abertura ?? `Olá, ${saudacao(inp.clientName)}! Segue o resumo de ${inp.periodLabel}.`];
    for (const s of SECOES) {
      const itens = c[s.id].slice(0, max[s.id]);
      if (itens.length === 0) continue;
      const resto = c[s.id].length - itens.length;
      const linhas = itens.map((i) => `• ${i.curto.charAt(0).toUpperCase()}${i.curto.slice(1)}`);
      if (s.id === "limitacoes" && resto > 0) linhas.push(`• e mais ${resto} no PDF`);
      blocos.push(`${estilo.cab?.[s.id] ?? cab[s.id]}\n${linhas.join("\n")}`);
    }
    for (const x of estilo.extras ?? []) if (x.itens.length) blocos.push(`*${x.titulo}*\n${x.itens.slice(0, 3).map((i) => `• ${i}`).join("\n")}`);
    blocos.push(estilo.fechamento ?? "O relatório completo vai em PDF. Qualquer dúvida, estou à disposição.");
    return semTravessao(blocos.join("\n\n"));
  };
  // Corta do menos importante até caber.
  const ordemCorte: SecaoId[] = ["testes", "resumo", "vitorias", "limitacoes", "atencao", "acoes", "testes", "resumo", "vitorias", "limitacoes", "atencao", "acoes"];
  let texto = montar();
  for (const s of ordemCorte) {
    if (texto.length <= limite) break;
    if (max[s] > (s === "testes" ? 0 : 1)) max[s] -= 1;
    texto = montar();
  }
  return texto;
}

export function montarExecutiva(inp: Pick<EnvioInput, "clientName" | "periodLabel">, c: ConteudoEnvio, estilo: EstiloTexto = {}): string {
  const rot = (s: SecaoId) => SECOES.find((x) => x.id === s)!.curto;
  const pega: [SecaoId, number][] = [["resumo", 3], ["vitorias", 2], ["atencao", 2], ["limitacoes", 1]];
  const pontos: string[] = [];
  for (const [s, n] of pega) for (const i of c[s].slice(0, n)) pontos.push(`• ${rot(s)}: ${i.curto}`);
  // Completa até 5 com o que sobrou; corta em 8.
  for (const s of ["resumo", "vitorias", "atencao", "limitacoes"] as SecaoId[]) {
    for (const i of c[s]) {
      if (pontos.length >= 5) break;
      const linha = `• ${rot(s)}: ${i.curto}`;
      if (!pontos.includes(linha)) pontos.push(linha);
    }
  }
  const decisoes: string[] = [];
  for (const i of c.acoes) if (decisoes.length < 3) decisoes.push(`Aprovar: ${i.curto}?`);
  for (const i of c.testes) if (decisoes.length < 3 && !decisoes.some((d) => d.includes(i.curto))) decisoes.push(`Testar: ${i.curto}?`);
  for (const i of c.limitacoes) if (decisoes.length < 3 && /não conectad/.test(i.curto)) decisoes.push(`Resolver: ${i.curto}?`);
  const linhas = [
    `Relatório executivo: ${inp.clientName}`,
    `Período: ${inp.periodLabel}`,
    "",
    "Pontos principais",
    ...pontos.slice(0, 8),
    "",
    "Decisões para a reunião",
    ...(decisoes.length ? decisoes.map((d, i) => `${i + 1}. ${d}`) : ["Nenhuma decisão pendente: não houve recomendação com evidência suficiente."]),
  ];
  if (c.testes.length > 0) linhas.push("", "Próximos testes", ...c.testes.slice(0, 2).map((t) => `• ${t.curto}`));
  for (const x of estilo.extras ?? []) if (x.itens.length) linhas.push("", x.titulo, ...x.itens.slice(0, 5).map((i) => `• ${i}`));
  if (estilo.fechamento) linhas.push("", estilo.fechamento);
  return semTravessao(linhas.join("\n"));
}

/** Confere um texto final (inclusive depois de editado à mão). */
export function checarTextoFinal(texto: string) {
  return checarLinguagemCFM(texto);
}
