// Onde os pacientes travam › Funil › No CRM (quick-ver-tudo-abas, João 13/11/2026: "essa leitura do período eu não to gostando... muito
// pequeno, muita informação pra ler e não passa nada de informação"). A "Leitura do período" saiu da aba: o que ela dizia e a aba ainda
// não mostra virou descoberta (leitura-em-descobertas.ts), e cada bloco que ficou nos Detalhes abre com UMA frase daqui, tirada dos dados
// do PRÓPRIO bloco, com o número em destaque. Sem dado, "Falta dado". Só números desta clínica (nunca outras), sem jargão, sem promessa.
// Módulo puro: sem React, banco ou rede.
import { ABRIR_VER_TUDO } from "./leitura-em-descobertas";
import { barrasDoPorque, caberEm90, checarDescoberta, type Descoberta } from "./cinco-segundos";
import { enfase, faltaDado, inteiro, maiorItem, porCento, primeiraQueCabe, reais, type CabecaDoBloco } from "./cabeca-do-bloco";
import { montarTexto } from "./texto";
import type { FatosDaTela } from "./tipos";

/** Muda quando uma regra daqui muda. */
export const VERSAO_REGRAS_VER_TUDO_CRM_PAINEL = 1;

/** Abaixo disso a conta mostra "N de M" e nunca porcentagem (a mesma régua do funil). */
const BASE_MINIMA_DA_TAXA = 30;

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);
const semPonto = (t: string) => t.replace(/\s+/g, " ").trim().replace(/[.]+$/, "");

/**
 * A leitura negada (portão fechado ou nenhum dado) dizia "Falta dado: motivo" e o passo para resolver. Sem a leitura, isso vira UMA
 * descoberta à vista, com o passo como ação: a aba nunca fica em branco nem finge um número. `carregando` ou leitura aberta: null.
 */
export function descobertaDaFaltaDeDado(fatos: FatosDaTela | null, carregando: boolean): Descoberta | null {
  if (carregando) return null;
  const texto = fatos ? montarTexto(fatos) : null;
  const motivo = !texto ? "não há dado neste período" : texto.tipo === "sem_leitura" ? texto.motivo : null;
  if (motivo == null) return null;
  const passo = texto?.tipo === "sem_leitura" ? texto.passo : null;
  const d: Descoberta = {
    id: "leitura-falta-dado",
    tom: "atencao",
    selo: "Falta dado",
    frase: caberEm90(`Falta dado: ${motivo}`),
    quem: passo?.rotuloQuem ?? "Equipe Doctor Creator",
    acao: { rotulo: passo ? semPonto(passo.frase) : "Conferir a conexão das fontes", local: ABRIR_VER_TUDO },
    origem: "proximo-passo",
    porque: { titulo: "O que falta para esta aba responder", barras: barrasDoPorque(undefined) },
  };
  return checarDescoberta(d).length === 0 ? d : null;
}

/** Até quantos caracteres cabe a pílula da ação de uma descoberta numa linha só, a 375 px (no computador a coluna da ação é "auto": texto maior espreme a frase). */
export const MAX_DA_ACAO = 30;

/**
 * O passo da leitura, quando vira a ação da descoberta, pode ser longo ("Revisar uma pessoa de plantão no WhatsApp em cada turno e ligar a
 * mensagem automática..."): a pílula ficaria do tamanho do cartão e a frase viraria uma coluna de letras. A pílula leva o começo do passo
 * (cortado na fronteira de uma palavra, com "…") e o passo inteiro abre o "Por quê?". Nada some: o texto inteiro continua no cartão.
 */
export function comAcaoCurta(d: Descoberta): Descoberta {
  const rotulo = d.acao.rotulo;
  if (rotulo.length <= MAX_DA_ACAO) return d;
  const ate = rotulo.slice(0, MAX_DA_ACAO - 1);
  const espaco = ate.lastIndexOf(" ");
  const curto = `${(espaco > 0 ? ate.slice(0, espaco) : ate).replace(/[\s,;:—-]+$/, "")}…`;
  const inteiro = `${semPonto(rotulo)}.`;
  return { ...d, acao: { ...d.acao, rotulo: curto }, porque: { ...d.porque, titulo: `O que fazer: ${inteiro}` } };
}

// ---------- cabeças dos blocos dos Detalhes ----------

/** "No período selecionado": só o que os cartões do topo não mostram (pessoas e cards, ou perdidos e valor). */
export function cabecaDoPeriodoNoCrm(e: {
  carregando: boolean;
  erro: boolean;
  pessoas: { pessoas: number; cards: number; max_cards_por_pessoa: number } | null;
  periodo: { perdidos: number; valor: number } | null;
}): CabecaDoBloco {
  if (e.carregando) return faltaDado("carregando os números do período");
  if (e.erro) return faltaDado("o CRM não respondeu os números deste período");
  if (e.pessoas) {
    const p = e.pessoas;
    return primeiraQueCabe(
      [
        [enfase(`${inteiro(p.cards)} ${plural(p.cards, "card", "cards")}`), { texto: ` de ${inteiro(p.pessoas)} ${plural(p.pessoas, "pessoa", "pessoas")} no período; até ${inteiro(p.max_cards_por_pessoa)} por pessoa.` }],
        [enfase(`${inteiro(p.cards)} ${plural(p.cards, "card", "cards")}`), { texto: ` de ${inteiro(p.pessoas)} ${plural(p.pessoas, "pessoa", "pessoas")} no período.` }],
      ],
      "neutro",
      "o CRM não devolveu os números deste período",
    );
  }
  if (e.periodo) {
    const p = e.periodo;
    return primeiraQueCabe(
      [[enfase(`${inteiro(p.perdidos)} ${plural(p.perdidos, "perdido", "perdidos")}`), { texto: ` no período; os cards somam ${reais(p.valor)}.` }]],
      p.perdidos > 0 ? "atencao" : "neutro",
      "o CRM não devolveu os números deste período",
    );
  }
  return faltaDado("o CRM não devolveu os números deste período");
}

/** "O que está travando": quantos problemas, de que tipo. */
export function cabecaDoQueTrava(contagem: { performance: number; operacao: number; rastreamento: number }): CabecaDoBloco {
  const total = contagem.performance + contagem.operacao + contagem.rastreamento;
  if (total <= 0) return faltaDado("nenhum problema com dado suficiente para afirmar");
  const tipos = [
    contagem.performance ? `${inteiro(contagem.performance)} de resultado` : null,
    contagem.operacao ? `${inteiro(contagem.operacao)} de operação` : null,
    contagem.rastreamento ? `${inteiro(contagem.rastreamento)} de registro` : null,
  ].filter((x): x is string => x != null);
  const lista = tipos.length > 1 ? `${tipos.slice(0, -1).join(", ")} e ${tipos[tipos.length - 1]}` : tipos[0];
  return primeiraQueCabe(
    [
      [enfase(inteiro(total)), { texto: ` ${plural(total, "problema trava", "problemas travam")} o funil: ${lista}.` }],
      [enfase(inteiro(total)), { texto: ` ${plural(total, "problema trava", "problemas travam")} o funil.` }],
    ],
    "atencao",
    "nenhum problema com dado suficiente para afirmar",
  );
}

/** "O que o painel ainda não consegue dizer". */
export function cabecaDasLimitacoes(n: number): CabecaDoBloco {
  if (n <= 0) return primeiraQueCabe([[enfase("Nada"), { texto: " que o painel ainda não consiga dizer neste período." }]], "bom", "sem lista");
  return primeiraQueCabe([[enfase(inteiro(n)), { texto: ` ${plural(n, "coisa", "coisas")} que o painel ainda não consegue dizer.` }]], "atencao", "sem lista");
}

/** Base geral (histórico inteiro): o tamanho da base e o que entrou em 7 dias. */
export function cabecaDaBaseGeral(e: { total: number; novos7d: number }): CabecaDoBloco {
  if (!(e.total > 0)) return faltaDado("ainda sem leads sincronizados do CRM");
  return primeiraQueCabe(
    [[enfase(`${inteiro(e.total)} leads`), { texto: ` no histórico do CRM; ${inteiro(e.novos7d)} ${plural(e.novos7d, "card novo", "cards novos")} em 7 dias.` }]],
    "neutro",
    "ainda sem leads sincronizados do CRM",
  );
}

/** "Funil: do lead ao resultado" (base inteira): quantos ainda estão em disputa. */
export function cabecaDoFunilDaBase(e: { total: number; emDisputa: number }): CabecaDoBloco {
  if (!(e.total > 0)) return faltaDado("ainda sem leads sincronizados do CRM");
  return primeiraQueCabe(
    [[enfase(`${inteiro(e.emDisputa)} de ${inteiro(e.total)}`), { texto: " leads da base ainda estão em disputa." }]],
    "neutro",
    "ainda sem leads sincronizados do CRM",
  );
}

/** Taxa de conversão da base: com poucos cards com resultado, "N de M" (nunca porcentagem). */
export function cabecaDaConversao(e: { ganhos: number; perdidos: number }): CabecaDoBloco {
  const decididos = e.ganhos + e.perdidos;
  if (decididos <= 0) return faltaDado("nenhum card ganho ou perdido ainda");
  const ndm = `${inteiro(e.ganhos)} de ${inteiro(decididos)}`;
  if (decididos < BASE_MINIMA_DA_TAXA) return primeiraQueCabe([[enfase(ndm), { texto: " cards com resultado foram ganhos." }]], "neutro", "nenhum card ganho ou perdido ainda");
  return primeiraQueCabe(
    [[enfase(porCento(e.ganhos / decididos)), { texto: ` dos cards com resultado foram ganhos: ${ndm}.` }]],
    "neutro",
    "nenhum card ganho ou perdido ainda",
  );
}

/** Checklist de dados: quantos itens já estão prontos. */
export function cabecaDoChecklist(status: readonly string[]): CabecaDoBloco {
  if (!status.length) return faltaDado("checklist sem itens");
  const feitos = status.filter((s) => s === "feito").length;
  return primeiraQueCabe(
    [[enfase(`${inteiro(feitos)} de ${inteiro(status.length)}`), { texto: " itens do CRM estão prontos para o painel responder." }]],
    feitos === status.length ? "bom" : "atencao",
    "checklist sem itens",
  );
}

/** Por funil, no período: o funil que mais trouxe gente. */
export function cabecaDosFunis(linhas: readonly { funil: string; entraram: number }[]): CabecaDoBloco {
  const comEntrada = linhas.filter((l) => l.entraram > 0);
  const maior = maiorItem(comEntrada.map((l) => ({ nome: l.funil, valor: l.entraram })));
  if (!maior) return faltaDado("menos de 2 funis com entrada no período");
  return primeiraQueCabe(
    [
      [{ texto: `"${maior.nome}" trouxe mais: ` }, enfase(`${inteiro(maior.valor)} de ${inteiro(maior.total)}`), { texto: " leads do período." }],
      [enfase(inteiro(comEntrada.length)), { texto: " funis tiveram entrada no período." }],
    ],
    "neutro",
    "menos de 2 funis com entrada no período",
  );
}

/** Orçamentos por tipo: quantos pacientes aprovaram algum orçamento. */
export function cabecaDosOrcamentos(e: { pessoas: number; pessoas_aprovadas: number }): CabecaDoBloco {
  if (!(e.pessoas > 0)) return faltaDado("sem orçamento com procedimento no período");
  return primeiraQueCabe(
    [[enfase(`${inteiro(e.pessoas_aprovadas)} de ${inteiro(e.pessoas)}`), { texto: " pacientes aprovaram algum orçamento no período." }]],
    "neutro",
    "sem orçamento com procedimento no período",
  );
}

/** Base viva: quantos leads em aberto se mexeram nos últimos 30 dias. */
export function cabecaDaBaseViva(e: { abertos: number; vivos_30d: number; parados_90d: number }): CabecaDoBloco {
  if (!(e.abertos > 0)) return faltaDado("nenhum lead em aberto no CRM");
  return primeiraQueCabe(
    [
      [enfase(`${inteiro(e.vivos_30d)} de ${inteiro(e.abertos)}`), { texto: ` leads em aberto se mexeram em 30 dias; ${inteiro(e.parados_90d)} parados há 90+.` }],
      [enfase(`${inteiro(e.vivos_30d)} de ${inteiro(e.abertos)}`), { texto: " leads em aberto se mexeram nos últimos 30 dias." }],
    ],
    e.parados_90d > e.vivos_30d ? "atencao" : "neutro",
    "nenhum lead em aberto no CRM",
  );
}

/** Atendimento no WhatsApp (últimas conversas): quantos pacientes estão sem resposta. */
export function cabecaDoAtendimento(e: { semResposta: number; conversas: number; contatos?: boolean }): CabecaDoBloco {
  if (!(e.conversas > 0)) return faltaDado("nenhuma conversa com paciente lida");
  const quem = e.contatos ? plural(e.semResposta, "contato", "contatos") : plural(e.semResposta, "paciente", "pacientes");
  if (e.semResposta <= 0) return primeiraQueCabe([[enfase("Ninguém"), { texto: ` sem resposta nas últimas ${inteiro(e.conversas)} conversas.` }]], "bom", "nenhuma conversa lida");
  return primeiraQueCabe(
    [[enfase(`${inteiro(e.semResposta)} ${quem}`), { texto: ` sem resposta nas últimas ${inteiro(e.conversas)} conversas.` }]],
    "atencao",
    "nenhuma conversa com paciente lida",
  );
}

/** Links rastreados: quantos e quantos cliques de pessoas. */
export function cabecaDosLinks(e: { links: number; cliques: number | null }): CabecaDoBloco {
  if (!(e.links > 0)) return faltaDado("nenhum link rastreado ligado a esta clínica");
  return primeiraQueCabe(
    [
      e.cliques != null ? [enfase(`${inteiro(e.cliques)} cliques`), { texto: ` de pessoas em ${inteiro(e.links)} ${plural(e.links, "link rastreado", "links rastreados")}, em 30 dias.` }] : null,
      [enfase(inteiro(e.links)), { texto: ` ${plural(e.links, "link rastreado ligado", "links rastreados ligados")} a esta clínica.` }],
    ],
    "neutro",
    "nenhum link rastreado ligado a esta clínica",
  );
}

/** Coorte, estoque e movimentos: quantos leads abertos já têm mais de 30 dias. */
export function cabecaDasVisoes(e: { abertos: number; parados30: number }): CabecaDoBloco {
  if (!(e.abertos > 0)) return faltaDado("nenhum lead aberto no estoque");
  return primeiraQueCabe(
    [[enfase(`${inteiro(e.parados30)} de ${inteiro(e.abertos)}`), { texto: " leads abertos entraram há mais de 30 dias." }]],
    e.parados30 * 2 >= e.abertos ? "atencao" : "neutro",
    "nenhum lead aberto no estoque",
  );
}

/** Atividade recente: quantos leads na lista e quando entrou o último. */
export function cabecaDaAtividade(e: { leads: number; ultimo: string | null }): CabecaDoBloco {
  if (!(e.leads > 0)) return faltaDado("nenhum lead recente");
  return primeiraQueCabe(
    [
      e.ultimo ? [{ texto: "O último lead entrou " }, enfase(e.ultimo), { texto: `; aqui estão os ${inteiro(e.leads)} mais recentes.` }] : null,
      [enfase(inteiro(e.leads)), { texto: " leads mais recentes do CRM." }],
    ],
    "neutro",
    "nenhum lead recente",
  );
}

/** Leads por um campo do CRM (fonte, procedimento): o valor que mais aparece. */
export function cabecaDoCampo(itens: readonly { chave: string; total: number }[], nome: string, motivoVazio: string): CabecaDoBloco {
  const maior = maiorItem(itens.map((i) => ({ nome: i.chave, valor: i.total })), 1);
  if (!maior) return faltaDado(motivoVazio);
  return primeiraQueCabe(
    [
      [{ texto: `"${maior.nome}" é ${nome} mais comum: ` }, enfase(`${inteiro(maior.valor)} de ${inteiro(maior.total)}`), { texto: " leads." }],
      [enfase(`${inteiro(maior.valor)} de ${inteiro(maior.total)}`), { texto: ` leads vêm de "${maior.nome}".` }],
    ],
    "neutro",
    motivoVazio,
  );
}
