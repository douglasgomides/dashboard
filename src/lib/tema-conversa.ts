/**
 * Tema da conversa pelo lado do paciente: o que ele pediu, ligado ao vocabulário de temas dos posts da própria
 * clínica. Serve para cruzar conteúdo × comercial (que tema de post vira conversa e agendamento). Vale também para o
 * Kommo, que só entrega o texto do paciente. Nada aqui julga o atendimento: isso continua em conversas_resumos.
 * Funções puras (prompt e validação); a chamada à IA e a gravação ficam em api/_lib/tema-conversa.ts.
 */
import { z } from "zod";

export const OBJECOES = ["preco", "convenio", "distancia", "adiamento", "agenda", "medo", "desconfianca", "outro"] as const;
export const INTENCOES = ["agendar", "informacao", "retorno", "administrativo", "outro"] as const;

export interface ConversaParaTema { i: number; mensagens: string[] }

export const SISTEMA_TEMA = `Você lê só as mensagens do PACIENTE em conversas de WhatsApp de uma clínica médica e devolve JSON.
Não há texto da clínica. Não julgue o atendimento. Não invente: se não der para saber, use null ou lista vazia.
Formato: {"itens":[{"i": número da conversa,
 "tema": "um tema EXATAMENTE como está na lista de temas da clínica, ou null se nenhum se encaixa",
 "assunto": "o que o paciente quer, em até 8 palavras (ex.: consulta para emagrecimento, valor do implante), sem nome nem dado pessoal",
 "intencao": "agendar" | "informacao" | "retorno" | "administrativo" | "outro",
 "comercial": true | false,
 "preco_pedido": true | false,
 "objecoes": ["só destas, quando o paciente declarou: preco, convenio, distancia, adiamento, agenda, medo, desconfianca, outro"]}]}
"comercial" = false para assunto administrativo (nota fiscal, boleto, reembolso, documento, resultado de exame já feito, fornecedor).
"retorno" = paciente que já é da clínica falando de tratamento em andamento. Devolva um item para cada conversa recebida.`;

const mascarar = (t: string) =>
  t
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, "[telefone]");

/** Entrada do lote: temas da clínica + mensagens do paciente, mascaradas e cortadas (300 caracteres, 12 por conversa). */
export function montarEntradaTema(temas: string[], conversas: ConversaParaTema[]): string {
  const lista = temas.length ? temas.map((t) => `- ${t}`).join("\n") : "(a clínica ainda não tem temas: use null)";
  const blocos = conversas.map((c) => {
    const linhas = c.mensagens.slice(0, 12).map((m) => `  - ${mascarar(m.replace(/\s+/g, " ").trim()).slice(0, 300)}`);
    return `Conversa ${c.i}:\n${linhas.join("\n")}`;
  });
  return `Temas da clínica:\n${lista}\n\n${blocos.join("\n\n")}`.slice(0, 40_000);
}

const itemSchema = z.object({
  i: z.coerce.number().int(),
  tema: z.string().nullable().optional(),
  assunto: z.string().nullable().optional(),
  intencao: z.string().nullable().optional(),
  comercial: z.boolean().optional(),
  preco_pedido: z.boolean().optional(),
  objecoes: z.array(z.string()).nullable().optional(),
});

export interface TemaConversa {
  i: number;
  tema: string | null;
  assunto: string | null;
  intencao: (typeof INTENCOES)[number];
  comercial: boolean;
  preco_pedido: boolean;
  objecoes: (typeof OBJECOES)[number][];
}

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Valida a resposta: tema só se estiver na lista (sem diferença de acento/caixa), objeções e intenção só do vocabulário. */
export function lerRespostaTema(json: unknown, temas: string[], indices: number[]): TemaConversa[] {
  const bruto = json && typeof json === "object" && "itens" in json ? (json as { itens: unknown }).itens : null;
  if (!Array.isArray(bruto)) return [];
  const porNome = new Map(temas.map((t) => [normal(t), t]));
  const validos = new Set(indices);
  const saida = new Map<number, TemaConversa>();
  for (const b of bruto) {
    const p = itemSchema.safeParse(b);
    if (!p.success || !validos.has(p.data.i) || saida.has(p.data.i)) continue;
    const d = p.data;
    const intencao = INTENCOES.find((x) => x === d.intencao) ?? "outro";
    saida.set(d.i, {
      i: d.i,
      tema: d.tema ? porNome.get(normal(d.tema)) ?? null : null,
      assunto: d.assunto ? mascarar(d.assunto).trim().slice(0, 80) || null : null,
      intencao,
      comercial: d.comercial ?? intencao !== "administrativo",
      preco_pedido: d.preco_pedido ?? false,
      objecoes: [...new Set((d.objecoes ?? []).filter((o): o is (typeof OBJECOES)[number] => (OBJECOES as readonly string[]).includes(o)))],
    });
  }
  return [...saida.values()];
}
