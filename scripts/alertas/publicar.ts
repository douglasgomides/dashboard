/** Lê alertas.json (saída de verificar.sql) e abre, atualiza ou fecha a issue de alertas. Uso: tsx publicar.ts alertas.json */
import { readFileSync } from "node:fs";
import { decidir, ROTULO, type Alerta } from "./alertas";

const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
if (!repo || !token) throw new Error("Defina GITHUB_REPOSITORY e GITHUB_TOKEN");
const api = async (caminho: string, init: RequestInit = {}) => {
  const r = await fetch(`https://api.github.com/repos/${repo}${caminho}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" } });
  if (!r.ok) throw new Error(`GitHub ${r.status} em ${caminho}`);
  return r.json();
};

// Garante o rótulo antes de usar (a primeira execução cria).
const temRotulo = await fetch(`https://api.github.com/repos/${repo}/labels/${ROTULO}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } });
if (temRotulo.status === 404) await api("/labels", { method: "POST", body: JSON.stringify({ name: ROTULO, color: "d73a4a", description: "Alerta automático de produção" }) });
else if (!temRotulo.ok) throw new Error(`GitHub ${temRotulo.status} ao conferir o rótulo`);

const alertas = JSON.parse(readFileSync(process.argv[2], "utf8")) as Alerta[];
const abertas = (await api(`/issues?state=open&labels=${ROTULO}&per_page=5`)) as { number: number; body: string | null }[];
const aberta = abertas[0] ?? null;
const acao = decidir(alertas, aberta ? { corpo: aberta.body } : null, new Date());

if (acao.tipo === "abrir") {
  const i = (await api("/issues", { method: "POST", body: JSON.stringify({ title: acao.titulo, body: acao.corpo, labels: [ROTULO] }) })) as { number: number };
  console.log(`Issue #${i.number} aberta com ${alertas.length} alerta(s).`);
} else if (acao.tipo === "atualizar" && aberta) {
  await api(`/issues/${aberta.number}`, { method: "PATCH", body: JSON.stringify({ body: acao.corpo }) });
  if (acao.comentario) await api(`/issues/${aberta.number}/comments`, { method: "POST", body: JSON.stringify({ body: acao.comentario }) });
  console.log(`Issue #${aberta.number} atualizada.`);
} else if (acao.tipo === "fechar" && aberta) {
  await api(`/issues/${aberta.number}/comments`, { method: "POST", body: JSON.stringify({ body: acao.comentario }) });
  await api(`/issues/${aberta.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", state_reason: "completed" }) });
  console.log(`Issue #${aberta.number} fechada: tudo normal.`);
} else console.log(`Sem mudança (${alertas.length} alerta(s)).`);
