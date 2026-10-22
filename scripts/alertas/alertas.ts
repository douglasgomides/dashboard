/**
 * Alertas de produção numa issue do GitHub (sem fornecedor novo: o GitHub já avisa por e-mail e no app).
 * Uma issue aberta com o rótulo "alerta-producao" enquanto houver problema; comentário só quando surge alerta novo;
 * fecha sozinha quando tudo volta ao normal. Funções puras aqui; a chamada à API fica em publicar.ts.
 */
export interface Alerta { gravidade: "critico" | "atencao"; chave: string; texto: string }
export type Acao =
  | { tipo: "nada" }
  | { tipo: "abrir"; titulo: string; corpo: string }
  | { tipo: "atualizar"; corpo: string; comentario: string | null }
  | { tipo: "fechar"; comentario: string };

export const ROTULO = "alerta-producao";
const MARCA = /<!-- chaves: (.*?) -->/;

export function chavesDoCorpo(corpo: string | null | undefined): string[] {
  const m = corpo?.match(MARCA);
  return m && m[1] ? m[1].split(",").filter(Boolean) : [];
}

export function corpo(alertas: Alerta[], agora: Date): string {
  const secao = (g: Alerta["gravidade"], titulo: string) => {
    const itens = alertas.filter((a) => a.gravidade === g);
    return itens.length ? [`### ${titulo} (${itens.length})`, ...itens.map((a) => `- ${a.texto}`), ""] : [];
  };
  return [
    `Conferência automática de ${agora.toISOString().slice(0, 16).replace("T", " ")} UTC. Esta issue fecha sozinha quando tudo voltar ao normal.`,
    "",
    ...secao("critico", "Crítico: coleta parada para todas as clínicas"),
    ...secao("atencao", "Atenção"),
    "Fonte que a clínica não usa: marque como \"não usa\" na Conferência de dados e o alerta some.",
    "",
    `<!-- chaves: ${alertas.map((a) => a.chave).sort().join(",")} -->`,
  ].join("\n");
}

export function decidir(alertas: Alerta[], aberta: { corpo: string | null } | null, agora: Date): Acao {
  if (!alertas.length) return aberta ? { tipo: "fechar", comentario: "Tudo normal na conferência automática. Fechando." } : { tipo: "nada" };
  const novo = corpo(alertas, agora);
  const criticos = alertas.filter((a) => a.gravidade === "critico").length;
  if (!aberta) return { tipo: "abrir", titulo: `Alertas de produção: ${criticos ? `${criticos} crítico(s), ` : ""}${alertas.length} no total`, corpo: novo };
  const antes = new Set(chavesDoCorpo(aberta.corpo));
  const surgiram = alertas.filter((a) => !antes.has(a.chave));
  const mudou = surgiram.length > 0 || alertas.length !== antes.size;
  if (!mudou) return { tipo: "nada" };
  return { tipo: "atualizar", corpo: novo, comentario: surgiram.length ? ["Novos alertas:", ...surgiram.map((a) => `- ${a.gravidade === "critico" ? "**Crítico:** " : ""}${a.texto}`)].join("\n") : null };
}
