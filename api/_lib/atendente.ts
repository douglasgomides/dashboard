/**
 * Atendente de IA, piloto em modo sombra (regras em src/lib/atendente.ts). Roda junto da leitura das conversas
 * (api/sync/wts.ts, ?so_analisar=1, a cada 20 min pelo n8n). Para cada clínica com atendente_config.modo = 'sombra':
 *  1. se ainda não há fatos de atendimento no Brain, lê as respostas da secretária e PROPÕE os fatos (endereço,
 *     horário, convênios...) para a equipe aprovar no Brand Brain;
 *  2. para cada mensagem de paciente ainda sem resposta da clínica (últimas 3 h), escreve o que o atendente responderia,
 *     só com fatos APROVADOS; risco (urgência, clínico, reclamação) vai sempre para uma pessoa;
 *  3. preenche, nos rascunhos anteriores, o que a secretária respondeu e quanto demorou.
 * NADA é enviado ao paciente: não existe chamada de envio neste arquivo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { chamarIAJson, iaDisponivel } from "./ia.js";
import { mascararDadosPessoais } from "./mascarar-pii.js";
import {
  ehFatoAtendimento, gatilhosRecentes, MENSAGEM_URGENCIA, respostaHumana, riscoDaMensagem, SISTEMA_FATOS, sistemaAtendente, validarFatos, validarRascunho, type Msg,
} from "../../src/lib/atendente.js";

type Admin = SupabaseClient<any, any, any>;
const H = 3_600_000;
const corta = (t: unknown, n: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
// Tudo que sai daqui para a IA passa por este corte: telefone, e-mail e CPF viram marcadores (LGPD, auditoria de
// 01/11/2026: o resumo e o tema já mascaravam; o atendente sombra mandava o texto do paciente como estava).
const paraIA = (t: unknown, n: number) => corta(mascararDadosPessoais(String(t ?? "")), n);
async function persistir(consulta: PromiseLike<{ error: unknown }>) {
  const { error } = await consulta;
  if (error) throw new Error("Não foi possível persistir o rascunho do atendente");
}
async function auditar(admin: Admin, clientId: string, conversaId: string | null, acao: string) {
  const { error } = await admin.from("acessos_conversas").insert({ user_id: null, client_id: clientId, conversa_id: conversaId, acao });
  if (error) throw new Error("Não foi possível registrar o acesso do atendente antes da IA");
}

async function fatosAprovados(admin: Admin, clientId: string) {
  const { data, error } = await admin.from("brain_itens").select("memoria, chave, valor").eq("client_id", clientId).eq("estado", "aprovado");
  if (error) throw new Error("Não foi possível ler os fatos aprovados");
  const itens = (data ?? []) as { memoria: string; chave: string; valor: string }[];
  const fatos: Record<string, string> = {};
  for (const i of itens) if (i.memoria === "comercial" && ehFatoAtendimento(i.chave)) fatos[i.chave] = i.valor;
  const tom = itens.filter((i) => i.memoria === "identidade").map((i) => `- ${i.chave}: ${corta(i.valor, 200)}`).join("\n");
  return { fatos, tom };
}

/** Propõe os fatos de atendimento no Brain a partir das respostas da secretária (uma vez a cada 14 dias). */
export async function proporFatosAtendimento(admin: Admin, clientId: string): Promise<{ propostos: number; motivo?: string }> {
  const { data: ja, error: erroAnteriores } = await admin.from("brain_itens").select("chave, estado, criado_em").eq("client_id", clientId).eq("memoria", "comercial").like("chave", "atend_%");
  if (erroAnteriores) throw new Error("Não foi possível conferir os fatos anteriores");
  const xs = (ja ?? []) as { chave: string; estado: string; criado_em: string }[];
  if (xs.some((x) => x.estado === "aprovado") && xs.length >= 4) return { propostos: 0, motivo: "fatos já aprovados" };
  if (xs.some((x) => Date.now() - Date.parse(x.criado_em) < 14 * 24 * H)) return { propostos: 0, motivo: "proposta recente esperando aprovação" };
  const { data: msgs, error: erroMensagens } = await admin.from("mensagens").select("texto").eq("client_id", clientId).eq("direcao", "saida").gte("enviada_em", new Date(Date.now() - 60 * 24 * H).toISOString())
    .order("enviada_em", { ascending: false }).limit(2500);
  if (erroMensagens) throw new Error("Não foi possível ler as respostas para propor fatos");
  const vistos = new Set<string>();
  const textos: string[] = [];
  for (const m of (msgs ?? []) as { texto: string | null }[]) {
    const t = paraIA(m.texto, 500);
    if (t.length < 40) continue;
    const k = t.toLowerCase().slice(0, 60);
    if (vistos.has(k)) continue;
    vistos.add(k);
    textos.push(t);
    if (textos.join("\n").length > 15_000) break;
  }
  if (textos.length < 15) return { propostos: 0, motivo: "poucas respostas da secretária para extrair fatos" };
  await auditar(admin, clientId, null, "atendente_fatos_ia");
  const r = await chamarIAJson(admin, { sistema: SISTEMA_FATOS, entrada: textos.map((t) => `- ${t}`).join("\n"), finalidade: "atendente_fatos", clientId, maxTokens: 1500, qualidade: "forte" });
  const fatos = validarFatos(r.json);
  if (!fatos.length) return { propostos: 0, motivo: "nenhum fato consistente encontrado" };
  const { data: n, error } = await admin.rpc("brain_propor", { p_client_id: clientId, p_itens: fatos.map((f) => ({
    memoria: "comercial", chave: f.chave, valor: f.valor, fonte: "conversas", fonte_detalhe: `respostas da secretária no WhatsApp (60 dias; apareceu ${f.vezes} vezes)`, confianca: f.vezes >= 4 ? "alta" : "media",
  })) });
  if (error) throw new Error(error.message);
  return { propostos: Number(n ?? 0) };
}

async function exemplosAvaliados(admin: Admin, clientId: string): Promise<string> {
  const { data, error } = await admin.from("atendente_rascunhos").select("gatilho_texto, mensagem, avaliacao, avaliacao_motivo").eq("client_id", clientId).not("avaliacao", "is", null)
    .order("criado_em", { ascending: false }).limit(12);
  if (error) throw new Error("Não foi possível ler as avaliações do atendente");
  const xs = (data ?? []) as { gatilho_texto: string; mensagem: string | null; avaliacao: string; avaliacao_motivo: string | null }[];
  if (!xs.length) return "";
  return `### Avaliações da equipe sobre respostas anteriores (siga as boas, evite o erro das ruins)\n${xs.map((x) => `- [${x.avaliacao.toUpperCase()}${x.avaliacao_motivo ? `: ${corta(x.avaliacao_motivo, 140)}` : ""}] Paciente: "${paraIA(x.gatilho_texto, 120)}" → Resposta: "${paraIA(x.mensagem, 200)}"`).join("\n")}`;
}

/** Uma clínica: escreve os rascunhos pendentes e completa a comparação com a resposta humana. */
export async function atenderClinicaSombra(admin: Admin, clientId: string, fim: number) {
  const out = { rascunhos: 0, passou_humano: 0, descartados: 0, comparados: 0, fatos: 0, erros: [] as string[] };
  // 3. comparação dos rascunhos anteriores
  const { data: abertos, error: erroAbertos } = await admin.from("atendente_rascunhos").select("id, conversa_id, gatilho_em").eq("client_id", clientId).is("resposta_humana", null)
    .gte("gatilho_em", new Date(Date.now() - 72 * H).toISOString()).limit(200);
  if (erroAbertos) throw new Error("Não foi possível ler os rascunhos em aberto");
  for (const a of (abertos ?? []) as { id: string; conversa_id: string; gatilho_em: string }[]) {
    const { data: ms, error: erroMs } = await admin.from("mensagens").select("id, direcao, texto, tipo, enviada_em").eq("client_id", clientId).eq("conversa_id", a.conversa_id).gt("enviada_em", a.gatilho_em).order("enviada_em").limit(20);
    if (erroMs) throw new Error("Não foi possível ler as mensagens do atendente");
    const h = respostaHumana((ms ?? []) as Msg[], a.gatilho_em);
    if (!h) continue;
    await persistir(admin.from("atendente_rascunhos").update({ resposta_humana: h.texto, resposta_humana_em: h.em, tempo_humano_s: h.segundos }).eq("client_id", clientId).eq("id", a.id));
    out.comparados++;
  }
  // 1. fatos
  try { out.fatos = (await proporFatosAtendimento(admin, clientId)).propostos; } catch (e) { out.erros.push(`fatos: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)); }
  // 2. rascunhos novos
  const { data: cli, error: erroCliente } = await admin.from("clients").select("name").eq("id", clientId).maybeSingle();
  if (erroCliente) throw new Error("Não foi possível ler a clínica do atendente");
  const { fatos, tom } = await fatosAprovados(admin, clientId);
  const exemplos = await exemplosAvaliados(admin, clientId);
  const { data: convs, error: erroConversas } = await admin.from("conversas").select("id, ultima_msg_em").eq("client_id", clientId).gte("ultima_msg_em", new Date(Date.now() - 3 * H).toISOString())
    .order("ultima_msg_em", { ascending: false }).limit(40);
  if (erroConversas) throw new Error("Não foi possível ler as conversas do atendente");
  let feitos = 0;
  const desde = new Date(Date.now() - 3 * H).toISOString();
  for (const c of (convs ?? []) as { id: string }[]) {
    if (Date.now() > fim || feitos >= 20) break;
    const { data: ms, error: erroMs } = await admin.from("mensagens").select("id, direcao, texto, tipo, enviada_em").eq("client_id", clientId).eq("conversa_id", c.id).order("enviada_em", { ascending: false }).limit(40);
    if (erroMs) throw new Error("Não foi possível ler as mensagens do atendente");
    const msgs = ((ms ?? []) as Msg[]).reverse();
    for (const g of gatilhosRecentes(msgs, desde)) {
      if (Date.now() > fim || feitos >= 20) break;
      const { data: existe, error: erroExiste } = await admin.from("atendente_rascunhos").select("id").eq("client_id", clientId).eq("conversa_id", c.id).eq("gatilho_mensagem_id", g.mensagem_id).maybeSingle();
      if (erroExiste) throw new Error("Não foi possível conferir a duplicação do rascunho");
      if (existe) continue;
      feitos++;
      const h = respostaHumana(msgs, g.em);
      const base = { client_id: clientId, conversa_id: c.id, gatilho_mensagem_id: g.mensagem_id, gatilho_em: g.em, gatilho_texto: g.texto,
        ...(h ? { resposta_humana: h.texto, resposta_humana_em: h.em, tempo_humano_s: h.segundos } : {}) };
      const risco = riscoDaMensagem(g.texto);
      if (risco) {
        // Risco não passa pela IA: vai para uma pessoa, com a mensagem de segurança quando é urgência.
        await persistir(admin.from("atendente_rascunhos").insert({ ...base, acao: "passar_humano", risco, mensagem: risco === "urgencia" ? MENSAGEM_URGENCIA : "Obrigada por avisar. Já chamei a equipe da clínica para falar com você.", motivo: `risco: ${risco}` }));
        out.passou_humano++;
        continue;
      }
      if (!iaDisponivel()) { out.erros.push("IA não configurada"); return out; }
      const historico = g.antes.slice(-14).map((m) => `${m.direcao === "entrada" ? "Paciente" : "Clínica"}: ${paraIA(m.texto || `[${m.tipo}]`, 300)}`).join("\n");
      const entrada = [
        `### Fatos aprovados da clínica (use só estes)\n${Object.keys(fatos).length ? Object.entries(fatos).map(([k, v]) => `- ${k}: ${v}`).join("\n") : "(nenhum fato aprovado ainda: não informe endereço, horário, valor nem convênio; diga que a equipe confirma)"}`,
        tom && `### Tom da clínica (Brand Brain)\n${tom}`,
        exemplos,
        `### Conversa até agora (mais recente por último)\n${historico}`,
        `### Responda à(s) última(s) mensagem(ns) do paciente\n${mascararDadosPessoais(g.texto)}`,
      ].filter(Boolean).join("\n\n");
      const t0 = Date.now();
      try {
        await auditar(admin, clientId, c.id, "atendente_sombra_ia");
        const r = await chamarIAJson(admin, { sistema: sistemaAtendente(String(cli?.name ?? "")), entrada: entrada.slice(0, 14_000), finalidade: "atendente_sombra", clientId, maxTokens: 500, qualidade: "forte" });
        const v = validarRascunho(r.json, fatos);
        if (!v.ok) {
          await persistir(admin.from("atendente_rascunhos").insert({ ...base, acao: "descartado", erro: v.erro, mensagem: corta((r.json as { mensagem?: string })?.mensagem, 700) || null, modelo: r.modelo, ms: Date.now() - t0 }));
          out.descartados++;
          continue;
        }
        await persistir(admin.from("atendente_rascunhos").insert({ ...base, acao: v.ok.acao, mensagem: v.ok.mensagem, motivo: v.ok.motivo, fatos: v.ok.fatos, faltou: v.ok.faltou, modelo: r.modelo, ms: Date.now() - t0 }));
        if (v.ok.acao === "responder") out.rascunhos++; else out.passou_humano++;
      } catch (e) {
        out.erros.push(`${c.id.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
      }
    }
  }
  return out;
}

/** Todas as clínicas com o atendente em modo sombra. */
export async function rodarAtendenteSombra(admin: Admin, orcamentoMs = 90_000, onlyClientId?: string) {
  const fim = Date.now() + orcamentoMs;
  let consulta = admin.from("atendente_config").select("client_id").eq("modo", "sombra");
  if (onlyClientId) consulta = consulta.eq("client_id", onlyClientId);
  const { data, error } = await consulta;
  if (error) return { erro: error.message };
  const res: Record<string, unknown> = {};
  for (const { client_id } of (data ?? []) as { client_id: string }[]) {
    if (Date.now() > fim) break;
    try { res[client_id] = await atenderClinicaSombra(admin, client_id, fim); } catch (e) { res[client_id] = { erro: e instanceof Error ? e.message : String(e) }; }
  }
  return res;
}
