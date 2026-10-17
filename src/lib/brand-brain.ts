// Brand Brain: regras compartilhadas entre a tela (/admin/brain) e o agente que propõe itens (api/_lib/agentes.ts).
// O banco confere de novo (brain_texto_ok, brain_propor); aqui a validação serve para descartar cedo o que a IA errar.

export type Memoria = "identidade" | "audiencia" | "comercial" | "criativa" | "decisao";
export type Confianca = "baixa" | "media" | "alta";

export const MEMORIAS: { id: Memoria; nome: string; resumo: string }[] = [
  { id: "identidade", nome: "Identidade", resumo: "Quem é a clínica: especialidade, diferencial, tom de voz, o que não fala." },
  { id: "audiencia", nome: "Audiência", resumo: "Paciente ideal: dores, desejos, dúvidas e objeções que aparecem de verdade." },
  { id: "comercial", nome: "Comercial", resumo: "Serviços, ticket, motivos de perda, como a clínica vende e agenda." },
  { id: "criativa", nome: "Criativa", resumo: "Temas, ganchos e formatos que funcionaram ou não, peças aprovadas." },
  { id: "decisao", nome: "Decisão", resumo: "O que foi decidido nas sessões e ainda vale (metas, restrições, combinados)." },
];
export const NOME_MEMORIA = Object.fromEntries(MEMORIAS.map((m) => [m.id, m.nome])) as Record<Memoria, string>;

/** Fontes que o agente lê hoje. A proposta precisa citar uma delas (ou "equipe", quando escrita à mão). */
export const FONTES = {
  ficha_sap: "Ficha da clínica no SAP",
  sessoes: "Registros das sessões",
  conversas: "Resumos de conversas do WhatsApp",
  mensagens_kommo: "Mensagens recebidas no Kommo (WhatsApp e Direct, só o lado do paciente)",
  instagram_posts: "Posts do Instagram",
  instagram_duvidas: "Perguntas nos comentários",
  banco_anuncios: "Banco de anúncios",
  equipe: "Escrito pela equipe",
} as const;
export type Fonte = keyof typeof FONTES;

export interface PropostaBrain { memoria: Memoria; chave: string; valor: string; fonte: Fonte; fonte_detalhe?: string | null; confianca: Confianca }

/** Mesmo critério do banco (brain_texto_ok): sem e-mail, telefone ou CPF. */
export function textoSemDadoPessoal(t: string): boolean {
  return !/[^\s@]+@[^\s@]+\.[a-zA-Z]/.test(t) && !/\(?\d{2}\)?\s?9?\d{4}[-.\s]?\d{4}/.test(t) && !/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(t);
}

export function chaveValida(c: string): boolean {
  return /^[a-z0-9_]{3,60}$/.test(c);
}

/** Transforma um rótulo livre em chave ("Objeção de preço" → "objecao_de_preco"). */
export function paraChave(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

/** Filtra a resposta da IA: só fica o que tem memória, chave, fonte lida, texto curto e sem dado pessoal.
 *  Devolve também o motivo de cada descarte, para o log do passo. */
export function validarPropostas(bruto: unknown, fontesLidas: Fonte[]): { ok: PropostaBrain[]; descartes: string[] } {
  const ok: PropostaBrain[] = [];
  const descartes: string[] = [];
  const lista = Array.isArray((bruto as { itens?: unknown })?.itens) ? ((bruto as { itens: unknown[] }).itens) : [];
  const vistos = new Set<string>();
  for (const x of lista) {
    const i = x as Record<string, unknown>;
    const memoria = String(i?.memoria ?? "") as Memoria;
    const chave = paraChave(String(i?.chave ?? ""));
    const valor = String(i?.valor ?? "").trim();
    const fonte = String(i?.fonte ?? "") as Fonte;
    const confianca = (["baixa", "media", "alta"].includes(String(i?.confianca)) ? i.confianca : "media") as Confianca;
    if (!NOME_MEMORIA[memoria]) { descartes.push(`memória inválida (${memoria || "vazia"})`); continue; }
    if (!chaveValida(chave)) { descartes.push(`chave inválida (${String(i?.chave ?? "")})`); continue; }
    if (valor.length < 3 || valor.length > 600) { descartes.push(`${chave}: texto vazio ou longo demais`); continue; }
    if (!fontesLidas.includes(fonte)) { descartes.push(`${chave}: fonte não lida (${fonte || "vazia"})`); continue; }
    if (!textoSemDadoPessoal(valor)) { descartes.push(`${chave}: parece ter dado pessoal`); continue; }
    const k = `${memoria}:${chave}`;
    if (vistos.has(k)) { descartes.push(`${chave}: repetido`); continue; }
    vistos.add(k);
    const det = typeof i.fonte_detalhe === "string" ? i.fonte_detalhe.slice(0, 200) : null;
    ok.push({ memoria, chave, valor, fonte, fonte_detalhe: det && textoSemDadoPessoal(det) ? det : null, confianca });
  }
  return { ok, descartes };
}
