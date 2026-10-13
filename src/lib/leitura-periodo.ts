// Leitura do período: transforma os números das abas em conclusão.
//
// A Visão geral mostrava O QUE aconteceu (alcance, seguidores, salvos) mas não
// respondia as três perguntas de quem abre o painel: foi bom ou ruim? por quê?
// o que eu faço agora? Cada regra aqui responde isso para um assunto e devolve
// um "achado" com tom (bom/ruim/atenção), a explicação em linguagem de gente,
// a ação que decorre dele e os números que sustentam a frase.
//
// Lógica pura e determinística (sem IA, sem banco), igual hub-conteudo.ts.
// Toda regra tem amostra mínima: quando não dá para afirmar, ela não inventa,
// registra em `semLeitura` o que faltou.
import { fmtFormatKey, median } from "@/lib/report-metrics";
import { conversaMaisBarata, GRUPOS, type DiagnosticoAds } from "@/lib/anuncios-objetivo";
import { BENCHMARKS, avaliar } from "@/lib/benchmarks";

export type Tom = "bom" | "ruim" | "atencao";
export type RotaAcao = "posts" | "anuncios" | "atendimento" | "ideias" | "conteudo";

export interface Achado {
  id: string;
  tom: Tom;
  peso: number; // 1..3 — ordena e decide o veredito
  titulo: string; // a conclusão em uma frase
  porque: string; // o que isso significa / de onde vem
  acao?: { texto: string; rota?: RotaAcao };
  base: string; // números usados, para conferir
}

export interface Leitura {
  veredito: { tom: "bom" | "ruim" | "misto" | "neutro"; frase: string };
  achados: Achado[];
  acoes: { texto: string; rota?: RotaAcao; tom: Tom }[];
  semLeitura: string[];
}

export interface EntradaLeitura {
  diario: { date: string; reach?: number | null; new_followers?: number | null }[];
  diarioAnterior?: { date: string; reach?: number | null; new_followers?: number | null }[];
  posts: any[];
  adsDiag?: DiagnosticoAds | null;
  wts?: { atendimentos?: number | null; espera_mediana_seg?: number | null; sem_roteamento?: number | null } | null;
}

// ---------- limites ----------
export const MIN_DIAS_TENDENCIA = 10;
export const VARIACAO_RELEVANTE = 0.25; // ±25%
export const MIN_POSTS_LEITURA = 5;
export const MIN_POSTS_GRUPO = 3;
export const CONCENTRACAO_VIRAL = 0.4; // 1 post com 40%+ do alcance dos posts
export const LACUNA_DIAS = 7;
export const DIFERENCA_SALVO = 1.3; // taxa de salvamento 30% maior para afirmar diferença
export const DESPERDICIO_RELEVANTE = 0.2; // 20% da verba
export const ESPERA_RUIM_SEG = 30 * 60;
export const ESPERA_BOA_SEG = 5 * 60;

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");
const pct = (v: number, casas = 0) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const resumoLegenda = (p: any) => {
  const t = String(p?.caption ?? "").split("\n")[0].trim();
  return t ? `“${t.slice(0, 50)}${t.length > 50 ? "…" : ""}”` : "um post";
};
function dur(seg: number): string {
  const s = Math.max(0, Math.trunc(seg));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

// ---------- regras ----------

// 1. Ritmo do alcance: contra o período anterior quando ele existe; senão,
// segunda metade contra a primeira (o Instagram só guarda ~30 dias diários).
function regraRitmo(e: EntradaLeitura, out: Achado[], falta: string[]) {
  const dias = e.diario.filter((d) => d.reach != null).sort((a, b) => a.date.localeCompare(b.date));
  const ant = (e.diarioAnterior ?? []).filter((d) => d.reach != null);
  const usaAnterior = ant.length >= Math.ceil(dias.length * 0.8) && dias.length >= 7;

  let antes: number, depois: number, rotulo: string, base: string;
  if (usaAnterior) {
    antes = median(ant.map((d) => n(d.reach)));
    depois = median(dias.map((d) => n(d.reach)));
    rotulo = "em relação ao período anterior";
    base = `alcance diário mediano ${int(depois)} contra ${int(antes)} no período anterior (${dias.length} e ${ant.length} dias)`;
  } else {
    if (dias.length < MIN_DIAS_TENDENCIA) {
      falta.push(`Ritmo do alcance: precisa de ${MIN_DIAS_TENDENCIA}+ dias com dado (tem ${dias.length}).`);
      return;
    }
    const meio = Math.floor(dias.length / 2);
    antes = median(dias.slice(0, meio).map((d) => n(d.reach)));
    depois = median(dias.slice(dias.length - meio).map((d) => n(d.reach)));
    rotulo = "da primeira para a segunda metade do período";
    base = `alcance diário mediano ${int(antes)} na 1ª metade e ${int(depois)} na 2ª (${dias.length} dias com dado)`;
  }
  if (antes <= 0) return;
  const v = (depois - antes) / antes;
  if (Math.abs(v) < VARIACAO_RELEVANTE) {
    out.push({
      id: "ritmo",
      tom: "atencao",
      peso: 1,
      titulo: `O alcance ficou estável ${rotulo} (${v >= 0 ? "+" : ""}${pct(v)}).`,
      porque: "Nem cresceu nem caiu de forma relevante: o que está sendo feito mantém o patamar. Para subir de nível, algo precisa mudar (formato, tema ou frequência).",
      base,
    });
    return;
  }
  const sobe = v > 0;
  out.push({
    id: "ritmo",
    tom: sobe ? "bom" : "ruim",
    peso: 3,
    titulo: sobe
      ? `O alcance subiu ${pct(v)} ${rotulo}.`
      : `O alcance caiu ${pct(Math.abs(v))} ${rotulo}.`,
    porque: sobe
      ? "Mais gente nova está vendo o perfil todo dia. Os posts publicados nesse trecho estão sendo distribuídos melhor pelo Instagram."
      : "Menos gente está vendo o perfil por dia. Normalmente é queda de frequência, troca de formato ou o fim do efeito de um post que viralizou.",
    acao: sobe
      ? { texto: "Veja quais posts puxaram a alta e repita o tema/formato deles.", rota: "posts" }
      : { texto: "Compare os posts do trecho fraco com os do forte e volte ao que funcionava.", rota: "posts" },
    base,
  });
}

// 2. Dependência de um post só.
function regraConcentracao(posts: any[], out: Achado[], falta: string[]) {
  const comAlcance = posts.filter((p) => n(p.reach) > 0);
  if (comAlcance.length < MIN_POSTS_LEITURA) {
    falta.push(`Dependência de viral: precisa de ${MIN_POSTS_LEITURA}+ posts com alcance (tem ${comAlcance.length}).`);
    return;
  }
  const total = comAlcance.reduce((a, p) => a + n(p.reach), 0);
  const top = [...comAlcance].sort((a, b) => n(b.reach) - n(a.reach))[0];
  const fatia = n(top.reach) / total;
  const tipico = median(comAlcance.filter((p) => p !== top).map((p) => n(p.reach)));
  if (fatia < CONCENTRACAO_VIRAL) return;
  out.push({
    id: "concentracao",
    tom: "atencao",
    peso: 2,
    titulo: `${pct(fatia)} do alcance dos posts veio de um único post.`,
    porque: `${resumoLegenda(top)} alcançou ${int(n(top.reach))} contas; sem ele, o post típico alcança ${int(tipico)}. O resultado do período depende de um acerto, não de um padrão, e tende a cair quando esse post parar de circular.`,
    acao: { texto: `Transforme ${resumoLegenda(top)} em série: mesmo tema em 2 ou 3 formatos diferentes.`, rota: "ideias" },
    base: `${int(n(top.reach))} de ${int(total)} contas somadas em ${comAlcance.length} posts`,
  });
}

// 3. Alcance x profundidade por formato: quem leva longe e quem faz guardar.
function regraFormatos(posts: any[], out: Achado[], falta: string[]) {
  const g = new Map<string, { reach: number[]; taxaSalvo: number[] }>();
  for (const p of posts) {
    if (!p.format || n(p.reach) <= 0) continue;
    const e = g.get(p.format) ?? { reach: [], taxaSalvo: [] };
    e.reach.push(n(p.reach));
    e.taxaSalvo.push(n(p.saved) / n(p.reach));
    g.set(p.format, e);
  }
  const grupos = Array.from(g.entries())
    .filter(([, e]) => e.reach.length >= MIN_POSTS_GRUPO)
    .map(([f, e]) => ({ f, nome: fmtFormatKey(f), count: e.reach.length, alcance: median(e.reach), salvo: median(e.taxaSalvo) }));
  if (grupos.length < 2) {
    falta.push(`Comparação de formatos: precisa de 2+ formatos classificados com ${MIN_POSTS_GRUPO}+ posts cada.`);
    return;
  }
  const porAlcance = [...grupos].sort((a, b) => b.alcance - a.alcance);
  const porSalvo = [...grupos].sort((a, b) => b.salvo - a.salvo);
  const A = porAlcance[0];
  const S = porSalvo[0];
  const base = grupos.map((x) => `${x.nome}: alcance mediano ${int(x.alcance)}, salvamento ${pct(x.salvo, 1)} (${x.count} posts)`).join(" · ");

  // Diferença pequena de taxa de salvamento é ruído: só afirma "faz guardar" com folga de 30%.
  if (A.f !== S.f && S.salvo < A.salvo * DIFERENCA_SALVO) {
    const segundo = porAlcance[1];
    const vezes = segundo.alcance > 0 ? A.alcance / segundo.alcance : 0;
    if (vezes < 1 + VARIACAO_RELEVANTE) {
      falta.push("Comparação de formatos: os formatos tiveram desempenho parecido, nenhum se destacou.");
      return;
    }
    out.push({
      id: "formato",
      tom: "bom",
      peso: 2,
      titulo: `${A.nome} é o formato que mais leva o perfil a gente nova.`,
      porque: `Alcance mediano de ${int(A.alcance)} contas, ${vezes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x o de ${segundo.nome}. Na taxa de salvamento os formatos ficaram parecidos, então a diferença está em quantas pessoas cada um alcança.`,
      acao: { texto: `Use ${A.nome} para os assuntos que você quer que mais gente conheça.`, rota: "conteudo" },
      base,
    });
    return;
  }

  if (A.f === S.f) {
    const segundo = porAlcance[1];
    const vezes = segundo.alcance > 0 ? A.alcance / segundo.alcance : 0;
    out.push({
      id: "formato",
      tom: "bom",
      peso: 2,
      titulo: `${A.nome} ganha nas duas frentes: é o que mais alcança e o que mais é salvo.`,
      porque: `Alcança ${vezes >= 1.2 ? `${vezes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x mais que ${segundo.nome}` : "mais que os outros formatos"} e quem vê guarda para depois (${pct(A.salvo, 1)} salvam). É o formato em que a audiência deste perfil mais confia.`,
      acao: { texto: `Priorize ${A.nome} na grade das próximas semanas.`, rota: "conteudo" },
      base,
    });
    return;
  }
  out.push({
    id: "formato",
    tom: "bom",
    peso: 2,
    titulo: `${A.nome} leva longe, ${S.nome} faz guardar.`,
    porque: `${A.nome} tem o maior alcance mediano (${int(A.alcance)} contas): é o que apresenta o perfil a gente nova. ${S.nome} tem a maior taxa de salvamento (${pct(S.salvo, 1)} contra ${pct(A.salvo, 1)}): é o que gera confiança em quem já chegou. Os dois têm papéis diferentes no caminho até a consulta.`,
    acao: { texto: `Use ${A.nome} para atrair e ${S.nome} para aprofundar o mesmo assunto.`, rota: "conteudo" },
    base,
  });
}

// 4. O que faz seguir: post de maior alcance x post que mais converte alcance em seguidor.
function regraSeguir(posts: any[], out: Achado[], falta: string[]) {
  const com = posts.filter((p) => p.media_follows != null && n(p.reach) >= 200);
  if (com.length < MIN_POSTS_LEITURA) {
    falta.push(`O que faz seguir: precisa de ${MIN_POSTS_LEITURA}+ posts com “seguiram pelo post” medido (tem ${com.length}).`);
    return;
  }
  const taxa = (p: any) => n(p.media_follows) / n(p.reach);
  const melhorSeguir = [...com].sort((a, b) => taxa(b) - taxa(a))[0];
  const maiorAlcance = [...com].sort((a, b) => n(b.reach) - n(a.reach))[0];
  const tipica = median(com.map(taxa));
  if (taxa(melhorSeguir) <= 0 || n(melhorSeguir.media_follows) < 3) return;
  const vezes = tipica > 0 ? taxa(melhorSeguir) / tipica : 0;
  const base = `${int(n(melhorSeguir.media_follows))} seguidores em ${int(n(melhorSeguir.reach))} contas (${pct(taxa(melhorSeguir), 2)}); mediana dos posts ${pct(tipica, 2)}`;
  if (melhorSeguir !== maiorAlcance) {
    out.push({
      id: "seguir",
      tom: "bom",
      peso: 2,
      titulo: "O post que mais trouxe seguidor não foi o que mais alcançou.",
      porque: `${resumoLegenda(melhorSeguir)} converteu ${vezes >= 1.5 ? `${vezes.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x mais` : "mais"} gente em seguidor por pessoa alcançada. Alcance mostra o perfil; é esse tipo de assunto que faz a pessoa querer continuar acompanhando.`,
      acao: { texto: `Faça mais posts no assunto de ${resumoLegenda(melhorSeguir)}. Se for impulsionar, impulsione esse, não o de maior alcance.`, rota: "posts" },
      base,
    });
  } else {
    out.push({
      id: "seguir",
      tom: "bom",
      peso: 1,
      titulo: `O post de maior alcance também foi o que mais trouxe seguidor.`,
      porque: `${resumoLegenda(melhorSeguir)} alcançou e converteu ao mesmo tempo: é o candidato mais seguro para impulsionar ou refazer.`,
      acao: { texto: `Teste impulsionar ${resumoLegenda(melhorSeguir)} ou gravar uma versão nova dele.`, rota: "posts" },
      base,
    });
  }
}

// 5. Constância: maior intervalo sem publicar.
function regraConstancia(posts: any[], out: Achado[]) {
  const datas = posts
    .map((p) => (p.posted_at ? String(p.posted_at).slice(0, 10) : null))
    .filter(Boolean)
    .sort() as string[];
  if (datas.length < 3) return;
  let maior = 0;
  let de = "";
  let ate = "";
  for (let i = 1; i < datas.length; i++) {
    const d = (new Date(datas[i] + "T12:00:00Z").getTime() - new Date(datas[i - 1] + "T12:00:00Z").getTime()) / 86400000;
    if (d > maior) {
      maior = d;
      de = datas[i - 1];
      ate = datas[i];
    }
  }
  if (maior < LACUNA_DIAS) return;
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  out.push({
    id: "constancia",
    tom: "ruim",
    peso: 2,
    titulo: `O perfil ficou ${Math.round(maior)} dias sem publicar (${dm(de)} a ${dm(ate)}).`,
    porque: "O Instagram distribui menos o perfil que some. Depois de uma pausa, os primeiros posts costumam alcançar menos, e o seguidor que chegou deixa de ver o médico com frequência.",
    acao: { texto: "Deixe 2 ou 3 posts prontos de reserva para semanas cheias de consultório.", rota: "ideias" },
    base: `${datas.length} posts no período; maior intervalo entre dois posts: ${Math.round(maior)} dias`,
  });
}

// 6. Anúncios: quanto da verba trabalhou.
function regraAnuncios(e: EntradaLeitura, out: Achado[]) {
  const d = e.adsDiag;
  if (!d || d.gasto <= 0) return;
  const gasto = d.gasto;
  const fatia = d.desperdicio / gasto;
  const escalar = d.campanhas.filter((c) => c.veredito === "Escalar");
  const msg = d.grupos.find((g) => g.grupo === "mensagem");
  const base = `${brl(gasto)} investidos em ${d.campanhas.length} campanhas; cada campanha comparada só com as do mesmo objetivo; ${brl(d.desperdicio)} em campanhas que custam 2x o normal do objetivo ou não entregaram o que prometem`;

  // 1. Desperdício dentro do próprio objetivo.
  if (fatia >= DESPERDICIO_RELEVANTE) {
    out.push({
      id: "anuncios",
      tom: "ruim",
      peso: 3,
      titulo: `${pct(fatia)} da verba de anúncio foi para campanhas que não entregam.`,
      porque: `${brl(d.desperdicio)} foram para campanhas que custam o dobro ou mais do que as outras com o mesmo objetivo, ou que não entregaram nenhum resultado. O mesmo dinheiro nas campanhas que funcionam traria mais resultado.`,
      acao: {
        texto: escalar.length
          ? `Pausar as campanhas marcadas "Cortar" e passar a verba para ${escalar.length === 1 ? "a campanha marcada" : `as ${escalar.length} campanhas marcadas`} "Escalar".`
          : 'Pausar as campanhas marcadas "Cortar" e testar um anúncio novo.',
        rota: "anuncios",
      },
      base,
    });
  } else {
    out.push({
      id: "anuncios",
      tom: "bom",
      peso: 2,
      titulo: msg && msg.custoPorConversa != null
        ? `Os anúncios estão rendendo: cada conversa no WhatsApp custou ${brl(msg.custoPorConversa)}.`
        : "Os anúncios estão rendendo dentro do esperado para cada objetivo.",
      porque: `Menos de ${pct(DESPERDICIO_RELEVANTE)} da verba foi para campanhas ruins. ${escalar.length ? `${escalar.length === 1 ? "Uma campanha entrega" : `${escalar.length} campanhas entregam`} bem mais barato que as outras do mesmo tipo: é onde cabe mais dinheiro.` : "O próximo passo é saber quantas dessas conversas viraram consulta."}`,
      acao: escalar.length ? { texto: `Aumentar a verba das ${escalar.length} campanhas marcadas "Escalar".`, rota: "anuncios" } : undefined,
      base,
    });
  }

  // 2. Entre objetivos: de onde a conversa sai mais barata.
  const cmp = conversaMaisBarata(d);
  if (cmp) {
    const B = GRUPOS[cmp.barato.grupo];
    const C = GRUPOS[cmp.caro.grupo];
    out.push({
      id: "anuncios-objetivo",
      tom: "atencao",
      peso: 3,
      titulo: cmp.vezes
        ? `Conversa vinda de campanha de ${C.curto} custa ${cmp.vezes.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}x mais que de campanha de ${B.curto}.`
        : `${brl(cmp.caro.gasto)} em campanhas de ${C.curto} não trouxeram nenhuma conversa.`,
      porque: `Campanhas de ${B.curto} trouxeram ${int(cmp.barato.conversas)} conversas a ${brl(cmp.barato.custoPorConversa!)} cada. As de ${C.curto} receberam ${brl(cmp.caro.gasto)} e trouxeram ${int(cmp.caro.conversas)}${cmp.caro.custoPorConversa ? ` (${brl(cmp.caro.custoPorConversa)} cada)` : ""}. Campanha de ${C.curto} pode ter outro papel (fazer o perfil ser conhecido), mas se a meta é paciente chamando, o dinheiro rende mais em ${B.curto}.`,
      acao: { texto: `Testar mover parte da verba de ${C.curto} para campanhas de ${B.curto} por 2 semanas e comparar.`, rota: "anuncios" },
      base: `${B.nome}: ${brl(cmp.barato.gasto)} → ${int(cmp.barato.conversas)} conversas · ${C.nome}: ${brl(cmp.caro.gasto)} → ${int(cmp.caro.conversas)} conversas`,
    });
  }
}

// 7. WhatsApp: o paciente que chamou foi atendido a tempo?
function regraAtendimento(e: EntradaLeitura, out: Achado[]) {
  const at = n(e.wts?.atendimentos);
  if (at <= 0) return;
  const espera = n(e.wts?.espera_mediana_seg);
  const semRota = n(e.wts?.sem_roteamento) / at;
  const base = `${int(at)} atendimentos; espera mediana até a 1ª resposta ${espera > 0 ? dur(espera) : "não medida"}; ${pct(semRota)} sem equipe`;
  if (espera >= ESPERA_RUIM_SEG) {
    out.push({
      id: "atendimento",
      tom: "ruim",
      peso: 3,
      titulo: `Quem chama no WhatsApp espera ${dur(espera)} pela primeira resposta.`,
      porque: "O paciente que chama costuma chamar mais de uma clínica ao mesmo tempo. Quanto mais demora a resposta, maior a chance de ele marcar com quem respondeu primeiro: o conteúdo e o anúncio trouxeram a pessoa, e ela se perde aqui.",
      acao: { texto: "Defina uma mensagem automática de boas-vindas e uma meta de resposta em até 15 min.", rota: "atendimento" },
      base,
    });
  } else if (espera > 0 && espera <= ESPERA_BOA_SEG) {
    out.push({
      id: "atendimento",
      tom: "bom",
      peso: 1,
      titulo: `O WhatsApp responde rápido: ${dur(espera)} de espera mediana.`,
      porque: "O paciente que chega não esfria esperando. Essa parte do caminho não é gargalo.",
      base,
    });
  }
  if (semRota >= 0.3) {
    out.push({
      id: "roteamento",
      tom: "atencao",
      peso: 2,
      titulo: `${pct(semRota)} das conversas não foram encaminhadas para ninguém.`,
      porque: "Conversa sem responsável é conversa que ninguém acompanha até o agendamento.",
      acao: { texto: "Revise as regras de distribuição do atendimento.", rota: "atendimento" },
      base,
    });
  }
}

// ---------- veredito ----------
export function lerPeriodo(e: EntradaLeitura): Leitura {
  const achados: Achado[] = [];
  const semLeitura: string[] = [];
  const posts = e.posts ?? [];

  regraRitmo(e, achados, semLeitura);
  regraConcentracao(posts, achados, semLeitura);
  regraFormatos(posts, achados, semLeitura);
  regraSeguir(posts, achados, semLeitura);
  regraConstancia(posts, achados);
  regraAnuncios(e, achados);
  regraAtendimento(e, achados);

  const ordemTom: Record<Tom, number> = { ruim: 0, atencao: 1, bom: 2 };
  achados.sort((a, b) => b.peso - a.peso || ordemTom[a.tom] - ordemTom[b.tom]);

  const pontos = (t: Tom) => achados.filter((a) => a.tom === t).reduce((s, a) => s + a.peso, 0);
  const bom = pontos("bom");
  const ruim = pontos("ruim") + pontos("atencao") * 0.5;
  const melhor = achados.find((a) => a.tom === "bom");
  const pior = achados.find((a) => a.tom === "ruim") ?? achados.find((a) => a.tom === "atencao");

  let veredito: Leitura["veredito"];
  if (achados.length === 0) {
    veredito = { tom: "neutro", frase: "Ainda não há dado suficiente neste período para tirar uma conclusão com segurança." };
  } else if (bom > 0 && ruim === 0) {
    veredito = { tom: "bom", frase: `Período positivo. ${melhor!.titulo}` };
  } else if (bom === 0) {
    veredito = { tom: "ruim", frase: `Período pede ajuste. ${pior!.titulo}` };
  } else if (bom >= ruim * 1.5) {
    veredito = { tom: "bom", frase: `Período positivo, com um ponto a corrigir. ${melhor!.titulo} Mas: ${minuscula(pior!.titulo)}` };
  } else if (ruim >= bom * 1.5) {
    veredito = { tom: "ruim", frase: `Período pede ajuste. ${pior!.titulo} O que segura: ${minuscula(melhor!.titulo)}` };
  } else {
    veredito = { tom: "misto", frase: `Período misto. ${melhor!.titulo} Por outro lado, ${minuscula(pior!.titulo)}` };
  }

  // Ações: primeiro o que corrige (ruim/atenção), depois o que repete (bom). Máximo 3.
  const acoes = achados
    .filter((a) => a.acao)
    .sort((a, b) => ordemTom[a.tom] - ordemTom[b.tom] || b.peso - a.peso)
    .slice(0, 3)
    .map((a) => ({ texto: a.acao!.texto, rota: a.acao!.rota, tom: a.tom }));

  return { veredito, achados, acoes, semLeitura };
}

function minuscula(s: string) {
  // Não rebaixa sigla/número/nome próprio de formato no começo da frase.
  if (/^[0-9R$%]/.test(s) || /^(Reels|Carrossel|Estático|WhatsApp|O WhatsApp)/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
