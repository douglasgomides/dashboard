// Onde os pacientes travam › Jornada (quick-ver-tudo-abas, João 13/11/2026). A "Leitura do período" saiu da aba: o que ela dizia e a aba
// ainda não mostra virou descoberta (leitura-em-descobertas.ts), e cada bloco que ficou nos Detalhes abre com UMA frase daqui, tirada dos
// dados do PRÓPRIO bloco, com o número em destaque. Sem dado, "Falta dado". Só números desta clínica, sem jargão, sem promessa. Módulo puro.
import { enfase, faltaDado, inteiro, maiorItem, porCento, primeiraQueCabe, type CabecaDoBloco } from "./cabeca-do-bloco";

/** Muda quando uma regra daqui muda. */
export const VERSAO_REGRAS_VER_TUDO_JORNADA = 1;

/** O id da descoberta que diz que a maioria dos contatos não está ligada a uma pessoa (o fato "sem-pessoa" da leitura). */
export const DESCOBERTA_SEM_PESSOA = "leitura-sem-pessoa";

type IdEtapa = "alcance" | "engajamento" | "comentario" | "conversa" | "lead" | "agendamento" | "venda";
const NOME: Record<IdEtapa, string> = {
  alcance: "alcance",
  engajamento: "engajamento",
  comentario: "comentário",
  conversa: "conversa",
  lead: "lead",
  agendamento: "agendamento",
  venda: "venda",
};
const ANTES_DA_CONVERSA: IdEtapa[] = ["engajamento", "comentario", "conversa"];

/**
 * "Funil do período: do alcance à venda" (a lista das 7 etapas): o topo já mostra os números e a maior queda do comercial; esta frase diz
 * o que só a lista tem, a passagem que mais perde ANTES da conversa (com a taxa medida). Sem taxa medida ali, quantas etapas têm dado.
 */
export function cabecaDoFunilDe7(funil: { medidas: number; etapas: readonly { id: string; taxa: number | null }[] } | null): CabecaDoBloco {
  if (!funil) return faltaDado("o funil da jornada não carregou");
  if (funil.medidas === 0) return faltaDado("nenhuma das 7 etapas pode ser medida ainda");
  const ids = funil.etapas.map((e) => e.id);
  const antes = funil.etapas
    .map((e, k) => ({ e, de: ids[k - 1] as IdEtapa | undefined }))
    .filter((x): x is { e: { id: string; taxa: number }; de: IdEtapa } => x.de != null && ANTES_DA_CONVERSA.includes(x.e.id as IdEtapa) && x.e.taxa != null);
  const pior = antes.reduce<(typeof antes)[number] | null>((a, b) => (a == null || b.e.taxa < a.e.taxa ? b : a), null);
  return primeiraQueCabe(
    [
      pior ? [{ texto: `Antes da conversa, de ${NOME[pior.de]} para ${NOME[pior.e.id as IdEtapa]} passam só ` }, enfase(porCento(pior.e.taxa)), { texto: "." }] : null,
      [enfase(`${inteiro(funil.medidas)} de 7`), { texto: " etapas da jornada têm dado neste período." }],
    ],
    "neutro",
    "nenhuma das 7 etapas pode ser medida ainda",
  );
}

/** "Jornada: do post à venda": onde as pessoas se cruzam (o que os cartões do topo não mostram). */
export function cabecaDosCruzamentos(r: { pessoas: number; comentaram_e_lead: number; conversaram_e_lead: number; comentaram_e_conversaram: number } | null): CabecaDoBloco {
  if (!r || !(r.pessoas > 0)) return faltaDado("nenhuma pessoa identificada no período");
  return primeiraQueCabe(
    [
      [enfase(inteiro(r.conversaram_e_lead)), { texto: ` pessoas conversaram e viraram lead; ${inteiro(r.comentaram_e_lead)} comentaram e viraram lead.` }],
      [enfase(inteiro(r.conversaram_e_lead)), { texto: " pessoas conversaram no WhatsApp e viraram lead." }],
    ],
    "neutro",
    "nenhuma pessoa identificada no período",
  );
}

/** "O que limita esta leitura". */
export function cabecaDasLimitacoesDaJornada(n: number): CabecaDoBloco {
  if (n <= 0) return faltaDado("sem lista de limitações neste período");
  return primeiraQueCabe([[enfase(inteiro(n)), { texto: ` ${n === 1 ? "coisa limita" : "coisas limitam"} o que a jornada consegue dizer.` }]], "atencao", "sem lista");
}

/** Resultado por origem do lead: a origem que mais trouxe leads (ganhos só quando a venda é confirmada). */
export function cabecaDaOrigem(linhas: readonly { o: string; leads: number; ganhos: number }[], vendaConfirmada: boolean): CabecaDoBloco {
  const maior = maiorItem(linhas.map((l) => ({ nome: l.o, valor: l.leads })), 1);
  if (!maior) return faltaDado("nenhuma origem registrada no CRM");
  const ganhos = linhas.find((l) => l.o === maior.nome)?.ganhos ?? 0;
  return primeiraQueCabe(
    [
      vendaConfirmada ? [{ texto: `"${maior.nome}" trouxe mais leads: ` }, enfase(`${inteiro(maior.valor)} de ${inteiro(maior.total)}`), { texto: `, com ${inteiro(ganhos)} vendas.` }] : null,
      [{ texto: `"${maior.nome}" trouxe mais leads: ` }, enfase(`${inteiro(maior.valor)} de ${inteiro(maior.total)}`), { texto: "." }],
    ],
    "neutro",
    "nenhuma origem registrada no CRM",
  );
}

/** Posts que geraram gente de verdade: quantos comentaristas viraram lead, somando os posts. */
export function cabecaDosPostsQueGeram(posts: readonly { comentaristas: number; viraram_lead: number }[]): CabecaDoBloco {
  if (!posts.length) return faltaDado("nenhum comentário ligado a um lead");
  const lead = posts.reduce((s, p) => s + (Number(p.viraram_lead) || 0), 0);
  const com = posts.reduce((s, p) => s + (Number(p.comentaristas) || 0), 0);
  return primeiraQueCabe(
    [[enfase(`${inteiro(lead)} de ${inteiro(com)}`), { texto: ` pessoas que comentaram em ${inteiro(posts.length)} ${posts.length === 1 ? "post" : "posts"} viraram lead.` }]],
    "neutro",
    "nenhum comentário ligado a um lead",
  );
}

/** Links rastreados da jornada: quantas conversas os links trouxeram. */
export function cabecaDosLinksDaJornada(links: readonly { conversas: number; viraram_lead: number }[]): CabecaDoBloco {
  if (!links.length) return faltaDado("nenhum link rastreado no período");
  const conversas = links.reduce((s, l) => s + (Number(l.conversas) || 0), 0);
  const lead = links.reduce((s, l) => s + (Number(l.viraram_lead) || 0), 0);
  return primeiraQueCabe(
    [[enfase(`${inteiro(conversas)} conversas`), { texto: ` vieram de ${inteiro(links.length)} ${links.length === 1 ? "link rastreado" : "links rastreados"}; ${inteiro(lead)} viraram lead.` }]],
    "neutro",
    "nenhum link rastreado no período",
  );
}
