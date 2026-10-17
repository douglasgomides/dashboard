// Operations Agent · item 5 do cronograma ("Acessos críticos confirmados"). Lógica pura do fluxo, sem banco nem IA,
// para testar (scripts/test-agente-acessos.ts). O motor (api/_lib/agentes) usa estas funções nos passos.
import { ITENS_ACESSO, type RegistroAcesso } from "./sap-acessos.js";

export const MARCO_ACESSOS = 5;

export interface ItemPendente { id: string; nome: string; quem: string; dica: string }
export interface ItemConfirmado { id: string; nome: string; status: "confirmado" | "nao_se_aplica"; em: string | null; por: string | null; obs: string | null }

/** Críticos (prazo "C") que faltam e os que já estão resolvidos (confirmado ou não se aplica, sem revogação). */
export function situacaoCriticos(regs: RegistroAcesso[]): { pendentes: ItemPendente[]; resolvidos: ItemConfirmado[] } {
  const m = new Map(regs.map((r) => [r.item, r]));
  const pendentes: ItemPendente[] = [];
  const resolvidos: ItemConfirmado[] = [];
  for (const it of ITENS_ACESSO.filter((i) => i.prazo === "C")) {
    const r = m.get(it.id);
    const ok = r && !r.revogado_em && (r.status === "confirmado" || r.status === "nao_se_aplica");
    if (ok) resolvidos.push({ id: it.id, nome: it.nome, status: r.status as ItemConfirmado["status"], em: r.confirmado_em, por: r.confirmado_por, obs: r.observacao });
    else pendentes.push({ id: it.id, nome: it.nome, quem: it.quem, dica: it.dica });
  }
  return { pendentes, resolvidos };
}

/** Mensagem de cobrança sem IA (usada quando a IA não está disponível). Só lista o que falta; nada de paciente. */
export function mensagemPadrao(nomeClinica: string, pendentes: ItemPendente[]): string {
  const linhas = pendentes.map((p) => `• ${p.nome}`);
  return [
    `Olá, equipe ${nomeClinica}! Para seguirmos com o programa, ainda faltam estes acessos:`,
    ...linhas,
    "",
    "Se precisarem de ajuda em algum, é só responder aqui que a gente faz junto. Obrigado!",
  ].join("\n");
}

/** Evidência do item 5, montada só com o que está registrado no SAP (quem confirmou e quando). */
export function evidenciaCriticos(resolvidos: ItemConfirmado[]): string {
  const partes = resolvidos.map((r) => `${r.id} ${r.status === "nao_se_aplica" ? "não se aplica" : "confirmado"}${r.em ? ` em ${r.em}` : ""}${r.por ? ` por ${r.por}` : ""}`);
  return `Checklist 02.05: ${resolvidos.length} acessos críticos resolvidos (${partes.join("; ")}).`;
}

/** A mensagem que a IA devolveu é usável? Tem de citar todos os itens pendentes e não pode trazer número de telefone. */
export function mensagemValida(texto: unknown, pendentes: ItemPendente[]): texto is string {
  if (typeof texto !== "string" || texto.trim().length < 20 || texto.length > 1500) return false;
  if (/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/.test(texto)) return false;
  const baixo = texto.toLowerCase();
  return pendentes.every((p) => baixo.includes(p.nome.toLowerCase().slice(0, 18)));
}
