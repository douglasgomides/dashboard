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
  auditoria_comercial: "Auditoria comercial das conversas (objeções e falhas em %)",
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

const NOME_OBJECAO: Record<string, string> = { preco: "preço", convenio: "convênio", distancia: "distância", adiamento: "adiamento", agenda: "agenda", medo: "medo", desconfianca: "desconfiança", outro: "outra" };
const NOME_FALHA: Record<string, string> = {
  sem_resposta: "sem resposta", demora: "demora", desvio_preco: "desviou do preço", preco_sem_ancoragem: "preço sem ancoragem", sem_cta: "sem chamada para agendar",
  sem_follow_up: "sem follow-up", nome_errado: "nome errado", informacao_inconsistente: "informação inconsistente", pressao: "pressão", so_emoji: "só emoji",
  desconto_reativo: "desconto reativo", excesso_audio: "excesso de áudio",
};

/**
 * Padrões da auditoria comercial (leitura por IA de cada conversa) em %, para o Brand Brain: objeções do paciente,
 * falhas da clínica e quantos não agendaram. Só conversas comerciais. Abaixo de 10 conversas não sai nada
 * (amostra pequena demais para virar memória). Texto agregado: nenhum dado de paciente.
 */
export function padroesComerciais(resumos: unknown[], dias: number): string | null {
  const com = resumos.filter((r): r is Record<string, any> => !!r && typeof r === "object" && (r as any).comercial !== false);
  const n = com.length;
  if (n < 10) return null;
  const pct = (x: number) => `${Math.round((100 * x) / n)}%`;
  const contar = (campo: string, nomes: Record<string, string>) => {
    const c = new Map<string, number>();
    for (const r of com) for (const v of new Set(Array.isArray(r[campo]) ? (r[campo] as unknown[]).map(String) : [])) if (nomes[v]) c.set(v, (c.get(v) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, x]) => `${nomes[k]} ${pct(x)} (${x})`);
  };
  const agendou = com.filter((r) => r.etapa === "agendou" || r.situacao === "agendou").length;
  const recup = com.filter((r) => r.recuperavel === true && r.etapa !== "agendou" && r.situacao !== "agendou").length;
  const precoPedido = com.filter((r) => r.preco_pedido === true).length;
  const precoDado = com.filter((r) => r.preco_pedido === true && r.preco_apresentado === true).length;
  const linhas = [
    `${n} conversas comerciais lidas nos últimos ${dias} dias.`,
    `Agendaram: ${pct(agendou)} (${agendou}). Interesse real sem agendar (recuperáveis): ${pct(recup)} (${recup}).`,
    precoPedido ? `Pediram preço: ${pct(precoPedido)} (${precoPedido}); a clínica apresentou o preço em ${Math.round((100 * precoDado) / precoPedido)}% desses.` : null,
  ];
  const ob = contar("objecoes", NOME_OBJECAO);
  if (ob.length) linhas.push(`Objeções do paciente (% das conversas): ${ob.join("; ")}.`);
  const fa = contar("falhas", NOME_FALHA);
  if (fa.length) linhas.push(`Falhas da clínica (% das conversas): ${fa.join("; ")}.`);
  return linhas.filter(Boolean).join("\n");
}
