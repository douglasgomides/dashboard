// Resumo diário dos agentes para a equipe Doctor Creator (e-mail das 7h30, via n8n + Brevo). Puro: recebe as contagens
// por clínica e devolve assunto, texto e HTML. Só números e nomes de clínica: nenhum dado de paciente vai no e-mail.

export interface PendenciasClinica {
  client_id: string;
  nome: string;
  recuperacao: number; // pacientes com mensagem pronta esperando a secretária
  anuncios: number; // recomendações do Gestor de anúncios
  conteudo: number; // roteiros prontos
  campanhas: number; // estratégias propostas
  brain: number; // itens do Brand Brain para aprovar
  aprovacoes: number; // aprovações pendentes na Central
  falhas: number; // execuções de agente que falharam nas últimas 24 h
  agendaram: number; // pacientes recuperados que agendaram (7 dias, medido sozinho)
}

// Prioridade de hoje (perde dinheiro se esperar) e "quando puder" (planejamento).
const ROTULOS: [keyof PendenciasClinica, string, string, boolean][] = [
  ["falhas", "falha de agente", "falhas de agente", true],
  ["recuperacao", "paciente para recuperar", "pacientes para recuperar", true],
  ["anuncios", "ajuste de anúncio", "ajustes de anúncio", true],
  ["aprovacoes", "aprovação na Central", "aprovações na Central", true],
  ["conteudo", "roteiro pronto", "roteiros prontos", false],
  ["campanhas", "estratégia", "estratégias", false],
  ["brain", "item do Brain para aprovar", "itens do Brain para aprovar", false],
];

/** Clínica de teste ou de dados fictícios não entra no resumo nem na Caixa de entrada. */
export const ehClinicaTeste = (nome: string) => /\b(teste|test|fict[íi]ci[oa]s?|demo)\b/i.test(nome);

type Cliente = { from: (t: string) => any };

/** Junta as pendências por clínica. Serve ao servidor (chave de serviço) e à Caixa de entrada (admin logado).
 *  Falha só conta se a última rodada daquele agente na clínica falhou (uma rodada boa depois apaga o alerta). */
export async function coletarPendencias(db: Cliente): Promise<PendenciasClinica[]> {
  const desde = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const [clientes, sug, camp, brain, apr, execs, rec] = await Promise.all([
    db.from("clients").select("id, name").eq("active", true).eq("eh_teste", false),
    db.from("sugestoes_agentes").select("client_id, agente").eq("estado", "proposta").limit(10000),
    db.from("campanhas_ideias").select("client_id").eq("estado", "proposta").limit(5000),
    db.from("brain_itens").select("client_id").eq("estado", "proposto").limit(10000),
    db.from("aprovacoes").select("client_id").eq("estado", "pendente").limit(1000),
    db.from("agente_execucoes").select("client_id, fluxo, estado, criado_em").gte("criado_em", desde(24 * 3)).order("criado_em", { ascending: false }).limit(5000),
    db.from("sugestoes_agentes").select("client_id").eq("agente", "recuperacao").eq("resultado", "agendou").gte("medido_em", desde(24 * 7)).limit(5000),
  ]);
  for (const r of [clientes, sug, camp, brain, apr, execs, rec]) if (r.error) throw new Error(r.error.message);
  const por = new Map<string, PendenciasClinica>();
  for (const c of clientes.data as { id: string; name: string }[]) if (!ehClinicaTeste(c.name))
    por.set(c.id, { client_id: c.id, nome: c.name, recuperacao: 0, anuncios: 0, conteudo: 0, campanhas: 0, brain: 0, aprovacoes: 0, falhas: 0, agendaram: 0 });
  const mais = (id: string, k: Exclude<keyof PendenciasClinica, "client_id" | "nome">) => { const p = por.get(id); if (p) p[k] += 1; };
  for (const x of sug.data as { client_id: string; agente: "recuperacao" | "anuncios" | "conteudo" }[]) mais(x.client_id, x.agente);
  for (const x of camp.data as { client_id: string }[]) mais(x.client_id, "campanhas");
  for (const x of brain.data as { client_id: string }[]) mais(x.client_id, "brain");
  for (const x of apr.data as { client_id: string }[]) mais(x.client_id, "aprovacoes");
  const ultima = new Set<string>();
  for (const x of execs.data as { client_id: string; fluxo: string; estado: string }[]) {
    const k = `${x.client_id}:${x.fluxo}`;
    if (ultima.has(k)) continue;
    ultima.add(k);
    if (x.estado === "falhou") mais(x.client_id, "falhas");
  }
  for (const x of rec.data as { client_id: string }[]) mais(x.client_id, "agendaram");
  return [...por.values()];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function montarResumoEquipe(xs: PendenciasClinica[], baseUrl: string, data: string): { assunto: string; texto: string; html: string; total: number } {
  const linhas = xs
    .map((c) => ({ c, itens: ROTULOS.filter(([k]) => Number(c[k]) > 0).map(([k, um, varios]) => plural(Number(c[k]), um, varios)), peso: c.falhas * 1000 + c.recuperacao * 3 + c.anuncios * 2 + c.aprovacoes * 2 + c.conteudo + c.campanhas + c.brain }))
    .filter((l) => l.itens.length || l.c.agendaram)
    .sort((a, b) => b.peso - a.peso);
  const soma = (k: keyof PendenciasClinica) => xs.reduce((s, c) => s + Number(c[k] || 0), 0);
  const total = ROTULOS.reduce((s, [k]) => s + soma(k), 0);
  const agendaram = soma("agendaram");
  const hoje = soma("recuperacao") + soma("anuncios") + soma("aprovacoes");
  const assunto = !total ? `Agentes: nada pendente hoje (${data})` : hoje ? `Agentes: ${plural(hoje, "prioridade", "prioridades")} para hoje (${data})` : `Agentes: nada urgente, ${plural(total, "item", "itens")} para revisar (${data})`;
  const topo = `Prioridade de hoje: ${plural(soma("recuperacao"), "paciente para recuperar", "pacientes para recuperar")}, ${plural(soma("anuncios"), "ajuste de anúncio", "ajustes de anúncio")}${soma("aprovacoes") ? `, ${plural(soma("aprovacoes"), "aprovação", "aprovações")}` : ""}. Quando puder: ${plural(soma("conteudo"), "roteiro", "roteiros")}, ${plural(soma("campanhas"), "estratégia", "estratégias")}, ${plural(soma("brain"), "item do Brain", "itens do Brain")}.`;
  const texto = [
    `Resumo dos agentes, ${data}.`, topo,
    agendaram ? `Nos últimos 7 dias, ${agendaram} pacientes recuperados pelos agentes agendaram (medido sozinho pelas conversas e pelo CRM).` : "",
    soma("falhas") ? `Atenção: ${soma("falhas")} execuções de agente falharam nas últimas 24 h. Veja a Central de Agentes.` : "",
    "", ...linhas.map((l) => `- ${l.c.nome}: ${l.itens.join(", ") || "nada pendente"}${l.c.agendaram ? ` (${l.c.agendaram} agendaram)` : ""}. ${baseUrl}/${l.c.client_id}/agentes`),
  ].filter((t) => t !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:640px">
<h2 style="font-size:18px;margin:0 0 8px">Resumo dos agentes · ${esc(data)}</h2>
<p style="margin:0 0 12px">${esc(topo)}</p>
${agendaram ? `<p style="margin:0 0 12px;color:#047857"><b>${agendaram} pacientes recuperados agendaram</b> nos últimos 7 dias (medido sozinho).</p>` : ""}
${soma("falhas") ? `<p style="margin:0 0 12px;color:#b91c1c"><b>${soma("falhas")} execuções falharam</b> nas últimas 24 h. Veja a <a href="${esc(baseUrl)}/admin/agentes">Central de Agentes</a>.</p>` : ""}
<table style="border-collapse:collapse;width:100%">${linhas.map((l) => `<tr><td style="padding:8px 0;border-top:1px solid #e5e7eb"><a href="${esc(baseUrl)}/${l.c.client_id}/agentes" style="color:#111827;font-weight:bold;text-decoration:none">${esc(l.c.nome)}</a><br><span style="color:#4b5563">${esc(l.itens.join(" · ") || "nada pendente")}${l.c.agendaram ? ` · ${l.c.agendaram} agendaram` : ""}</span></td></tr>`).join("")}</table>
<p style="margin:16px 0 0;color:#6b7280;font-size:12px">Os agentes só preparam; nada é enviado a paciente nem alterado em anúncio sem a equipe.</p></div>`;
  return { assunto, texto, html, total };
}
