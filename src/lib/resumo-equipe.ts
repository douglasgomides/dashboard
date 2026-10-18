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

const ROTULOS: [keyof PendenciasClinica, string][] = [
  ["recuperacao", "pacientes para recuperar"],
  ["anuncios", "ajustes de anúncio"],
  ["conteudo", "roteiros prontos"],
  ["campanhas", "estratégias"],
  ["brain", "itens do Brain para aprovar"],
  ["aprovacoes", "aprovações na Central"],
  ["falhas", "falhas de agente"],
];

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function montarResumoEquipe(xs: PendenciasClinica[], baseUrl: string, data: string): { assunto: string; texto: string; html: string; total: number } {
  const linhas = xs
    .map((c) => ({ c, itens: ROTULOS.filter(([k]) => Number(c[k]) > 0).map(([k, r]) => `${c[k]} ${r}`), peso: c.falhas * 1000 + c.recuperacao * 3 + c.anuncios * 2 + c.aprovacoes * 2 + c.conteudo + c.campanhas + c.brain }))
    .filter((l) => l.itens.length || l.c.agendaram)
    .sort((a, b) => b.peso - a.peso);
  const soma = (k: keyof PendenciasClinica) => xs.reduce((s, c) => s + Number(c[k] || 0), 0);
  const total = ROTULOS.reduce((s, [k]) => s + soma(k), 0);
  const agendaram = soma("agendaram");
  const assunto = total ? `Agentes: ${total} itens esperando a equipe (${data})` : `Agentes: nada pendente hoje (${data})`;
  const topo = [`${soma("recuperacao")} pacientes para recuperar`, `${soma("anuncios")} ajustes de anúncio`, `${soma("conteudo")} roteiros`, `${soma("campanhas") + soma("brain")} estratégias e itens do Brain`].join(" · ");
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
