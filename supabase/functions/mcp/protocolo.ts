/**
 * Doctor Creator MCP: a parte do protocolo que não depende de banco (JSON-RPC 2.0 sobre Streamable HTTP, modo sem
 * sessão, respostas em JSON). Separada para ser testada fora do Deno (scripts/test-mcp-protocolo.ts).
 */

export const VERSOES = ["2025-06-18", "2025-03-26", "2024-11-05"];

export type Ferramenta = { name: string; title: string; description: string; inputSchema: Record<string, unknown> };

const PERIODO = {
  de: { type: "string", format: "date", description: "Início do período (AAAA-MM-DD). Padrão: 30 dias atrás." },
  ate: { type: "string", format: "date", description: "Fim do período (AAAA-MM-DD). Padrão: hoje." },
};
const CLINICA = { clinica_id: { type: "string", format: "uuid", description: "Id da clínica (use listar_clinicas)." } };
const comClinica = (extra: Record<string, unknown> = PERIODO) => ({
  type: "object", properties: { ...CLINICA, ...extra }, required: ["clinica_id"], additionalProperties: false,
});

/** Só leitura. Cada uma usa dados e regras de acesso que o Hub já tem; nada é escrito. */
export const FERRAMENTAS: Ferramenta[] = [
  { name: "listar_clinicas", title: "Listar clínicas", description: "Clínicas que a pessoa conectada pode consultar (id e nome).", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_instagram_overview", title: "Visão geral do Instagram", description: "Posts, alcance, salvamentos, compartilhamentos e engajamento por alcance no período, com a última sincronização.", inputSchema: comClinica() },
  { name: "list_top_performing_content", title: "Conteúdos com melhor desempenho", description: "Até 10 posts com mais engajamento no período (formato, tema, alcance, salvos, link).", inputSchema: comClinica({ ...PERIODO, limite: { type: "integer", minimum: 1, maximum: 10 } }) },
  { name: "get_content_performance", title: "Desempenho por formato", description: "Alcance e engajamento médios por formato de post (Reels, carrossel, imagem) no período.", inputSchema: comClinica() },
  { name: "get_marketing_campaigns", title: "Campanhas de anúncio", description: "Investimento e resultados dos anúncios Meta no período, por objetivo.", inputSchema: comClinica() },
  { name: "get_conversion_funnel", title: "Funil de conversão", description: "Funil da jornada do paciente (lead, conversa, agendamento, venda) no período.", inputSchema: comClinica() },
  { name: "get_appointment_metrics", title: "Atendimento e agendamentos", description: "Conversas lidas pela IA, funil até o agendamento, objeções, falhas e pacientes recuperáveis no período (só números agregados).", inputSchema: comClinica() },
  { name: "get_brand_brain_summary", title: "Brand Brain", description: "Itens aprovados da memória de marca da clínica (identidade, audiência, comercial, criativa, decisões).", inputSchema: comClinica({}) },
  { name: "get_growth_recommendations", title: "Recomendações de crescimento", description: "Falha comercial mais frequente, experimento da semana, valor em jogo e de onde vem quem agenda (só números agregados).", inputSchema: comClinica() },
];

export type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };

export const resposta = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
export const erro = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Valida os argumentos de uma ferramenta. Devolve a mensagem de erro, ou null se estiver tudo certo. */
export function validarArgumentos(nome: string, args: Record<string, unknown>): string | null {
  const f = FERRAMENTAS.find((x) => x.name === nome);
  if (!f) return `ferramenta desconhecida: ${nome}`;
  const schema = f.inputSchema as { properties: Record<string, any>; required?: string[] };
  for (const k of Object.keys(args)) if (!(k in schema.properties)) return `parâmetro não aceito: ${k}`;
  for (const k of schema.required ?? []) if (args[k] == null || args[k] === "") return `parâmetro obrigatório: ${k}`;
  if (args.clinica_id != null && (typeof args.clinica_id !== "string" || !UUID.test(args.clinica_id))) return "clinica_id inválido";
  for (const k of ["de", "ate"]) if (args[k] != null && (typeof args[k] !== "string" || !DATA.test(args[k] as string) || isNaN(Date.parse(args[k] as string)))) return `${k} deve ser uma data AAAA-MM-DD`;
  if (args.de && args.ate && (args.de as string) > (args.ate as string)) return "de deve ser anterior a ate";
  if (args.limite != null && (!Number.isInteger(args.limite) || (args.limite as number) < 1 || (args.limite as number) > 10)) return "limite deve ser um inteiro de 1 a 10";
  return null;
}

/** Período padrão: últimos 30 dias, em datas de São Paulo. */
export function periodo(args: Record<string, unknown>, hoje = new Date()): { de: string; ate: string } {
  const sp = (d: Date) => new Date(d.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  return { de: (args.de as string) ?? sp(new Date(hoje.getTime() - 30 * 86_400_000)), ate: (args.ate as string) ?? sp(hoje) };
}

/** Lê as claims do JWT sem validar (a validação é feita pelo Supabase Auth em getUser). */
export function claims(token: string): Record<string, unknown> | null {
  try {
    const p = token.split(".")[1];
    const json = atob(p.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (p.length % 4)) % 4));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
