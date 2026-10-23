/**
 * Processa uma reunião com a clínica (botão "Processar reunião" na tela Reuniões; alvo "reuniao" em manual.ts, só admin).
 * Lê as notas (e a transcrição, se colada), o Brain aprovado e o plano da semana; a IA devolve resumo, combinados,
 * ações de cada lado, o que entregar nesta semana e propostas de memória. As memórias entram no Brain como PROPOSTAS
 * (brain_propor): uma pessoa aprova em /admin/brain. Nada é enviado à clínica. Custo em ia_execucoes (finalidade reuniao).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chamarIAJson } from "./ia.js";
import { lerResultado, montarEntrada, type ResultadoReuniao } from "../../src/lib/reunioes.js";
import { semanaDe } from "../../src/lib/plano-semana.js";

type Admin = SupabaseClient<any, any, any>;

const SISTEMA = `Você é o estrategista da Doctor Creator que acompanha clínicas médicas no Brasil (marketing, anúncios e atendimento). Recebe as notas que a equipe anotou depois de uma reunião com a clínica, às vezes a transcrição, o que já sabemos da clínica (Brain) e o plano da semana.
Regras: português do Brasil, frases curtas, sem jargão, sem travessão. Use só o que está nas notas, na transcrição e no Brain. Não invente número, nome ou prazo. Não prometa resultado, faturamento ou cura. Sem preço, desconto ou promoção em conteúdo (regra do CFM); antes e depois só como relato autorizado. Nenhum dado de paciente. Nenhuma decisão clínica.
"memorias": só o que vale guardar sobre a clínica por semanas (decisões, restrições, foco, tom, público, serviços, o que não fazer). Não repita o que o Brain já diz igual. memoria é uma de: identidade, audiencia, comercial, criativa, decisao. chave curta em snake_case. valor: uma frase.
"entregas": o que a equipe pode entregar NESTA semana a partir da reunião e de tudo que sabemos (ex.: roteiro de conteúdo, ajuste de anúncio, script de atendimento). Cada uma com o porquê ligado ao que foi falado.
Responda SOMENTE um JSON:
{"resumo": "3 a 5 frases",
 "combinados": ["o que ficou combinado"],
 "acoes_clinica": ["o que a clínica faz, com dono e prazo se dito"],
 "acoes_equipe": ["o que a Doctor Creator faz, com prazo se dito"],
 "entregas": [{"tipo": "conteudo|anuncio|atendimento|comercial|outro", "titulo": "...", "detalhe": "o que entregar, concreto", "porque": "ligação com a reunião"}],
 "memorias": [{"memoria": "decisao", "chave": "foco_trimestre", "valor": "...", "confianca": "baixa|media|alta"}],
 "pendencias": ["o que ficou em aberto ou precisa ser conferido"]}`;

export async function processarReuniao(admin: Admin, clientId: string, reuniaoId: string, userId: string | null): Promise<{ resultado: ResultadoReuniao; memorias_propostas: number; brain_erro: string | null }> {
  const { data: reu, error } = await admin.from("reunioes").select("id, titulo, data, participantes, notas, transcricao").eq("id", reuniaoId).eq("client_id", clientId).maybeSingle();
  if (error) throw new Error("Não foi possível ler a reunião");
  if (!reu) throw new Error("Reunião não encontrada nesta clínica");
  const r = reu as { id: string; titulo: string; data: string; participantes: string | null; notas: string; transcricao: string | null };
  if (!r.notas.trim() && !r.transcricao?.trim()) throw new Error("Anote o que foi falado (ou cole a transcrição) antes de processar.");

  const [{ data: cli }, { data: brain }, { data: plano }] = await Promise.all([
    admin.from("clients").select("name, specialty").eq("id", clientId).maybeSingle(),
    admin.from("brain_itens").select("memoria, chave, valor").eq("client_id", clientId).eq("estado", "aprovado").order("memoria").limit(80),
    admin.from("plano_itens").select("titulo").eq("client_id", clientId).eq("semana", semanaDe(new Date())).order("ordem").limit(5),
  ]);
  const c = (cli ?? {}) as { name?: string; specialty?: string | null };
  const entrada = montarEntrada(r, {
    nome: c.name ?? "Clínica", especialidade: c.specialty ?? null,
    brain: (brain ?? []) as { memoria: string; chave: string; valor: string }[],
    plano: ((plano ?? []) as { titulo: string }[]).map((p) => p.titulo),
  });

  const resposta = await chamarIAJson(admin, { sistema: SISTEMA, entrada, finalidade: "reuniao", clientId, maxTokens: 3000, qualidade: "forte" });
  const resultado = lerResultado(resposta.json);
  if (!resultado) throw new Error("A IA devolveu a reunião fora do formato. Tente processar de novo.");

  // Memórias viram propostas no Brain; uma falha aqui não perde o resto do processamento.
  let memorias_propostas = 0, brain_erro: string | null = null;
  if (resultado.memorias.length) {
    const detalhe = `Reunião de ${r.data.split("-").reverse().join("/")}: ${r.titulo}`.slice(0, 200);
    const { data: n, error: e } = await admin.rpc("brain_propor", {
      p_client_id: clientId,
      p_itens: resultado.memorias.map((m) => ({ ...m, fonte: "reunioes", fonte_detalhe: detalhe })),
    });
    if (e) brain_erro = "As memórias não entraram no Brain agora; o resto foi salvo. Processe de novo para tentar outra vez.";
    else memorias_propostas = Number(n ?? 0);
  }

  const { error: e2 } = await admin.from("reunioes").update({
    resultado: { ...resultado, modelo: resposta.modelo }, memorias_propostas, processada_em: new Date().toISOString(), processada_por: userId, atualizado_em: new Date().toISOString(),
  }).eq("id", r.id).eq("client_id", clientId);
  if (e2) throw new Error("Processado, mas não foi possível salvar o resultado. Tente de novo.");
  return { resultado, memorias_propostas, brain_erro };
}
