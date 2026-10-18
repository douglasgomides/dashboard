import type { VercelRequest, VercelResponse } from "./http-types.js";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

// Entrada do Tracker do Sistema de Aquisição de Pacientes (SAP).
//
// Fica em _lib e não em api/sap/ de propósito: o plano da Vercel deste projeto
// já está no limite de 12 funções. Hoje quem grava no Tracker são os workflows
// "SAP |" do n8n, direto no Supabase. Para expor como endpoint, junte as
// funções de sync num roteador único e importe este handler de lá.
//
// Máquina chamando máquina (n8n, formulário, CRM), então autoriza pelo
// SYNC_SECRET no header Authorization: Bearer, igual aos endpoints de sync.
//
// POST  /api/sap/lead          cria um lead (gera o ID L-AAAAMMDD-NNN se vier sem)
// PATCH /api/sap/lead?id=L-... atualiza status (agendou, compareceu, decisão...)
//
// Telefone e e-mail crus nunca são gravados: viram SHA-256 aqui e o original
// é descartado (LGPD e o mesmo formato que a Meta pede na API de Conversões).

const CANAIS = ["Meta Ads", "Google Ads", "Orgânico", "Indicação", "Impulsionamento", "Outro"];
const PONTUACOES = ["A", "B", "C"];
const COMPARECEU = ["Sim", "Não", "Remarcou"];
const DECISOES = ["Fechou", "Não fechou", "Pensando"];
const MOTIVOS = [
  "Preço",
  "Tempo para decidir",
  "Cônjuge ou família",
  "Medo ou insegurança",
  "Comparando com outro profissional",
  "Sem indicação clínica",
  "Outro",
];
const TOQUES = ["Consulta", "F1", "F2", "F3", "F4", "F5"];
const CADENCIAS = ["Ativa", "Pausada", "Encerrada"];

type Body = Record<string, unknown>;

function txt(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "string" ? v.replace(",", ".") : v);
  return Number.isFinite(n) ? n : null;
}

function umDe(v: unknown, lista: string[]): string | null {
  const t = txt(v);
  return t && lista.includes(t) ? t : null;
}

export function hashTelefone(v: unknown): string | null {
  const t = txt(v);
  if (!t) return null;
  let d = t.replace(/\D/g, "");
  if (!d) return null;
  // Número brasileiro sem DDI: soma o 55, como a Meta espera.
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return createHash("sha256").update(d).digest("hex");
}

export function hashEmail(v: unknown): string | null {
  const t = txt(v);
  if (!t) return null;
  return createHash("sha256").update(t.toLowerCase()).digest("hex");
}

// Dia no fuso de Fortaleza (as clínicas pensam no dia local, não em UTC).
function diaLocal(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d)
    .replace(/-/g, "");
}

function camposDeStatus(b: Body): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ("pontuacao" in b) out.pontuacao = umDe(b.pontuacao, PONTUACOES);
  if ("tempo_primeira_resposta_min" in b) out.tempo_primeira_resposta_min = num(b.tempo_primeira_resposta_min);
  if ("agendou" in b) out.agendou = b.agendou === true || b.agendou === "Sim" || b.agendou === "true";
  if ("data_consulta" in b) out.data_consulta = txt(b.data_consulta);
  if ("compareceu" in b) out.compareceu = umDe(b.compareceu, COMPARECEU);
  if ("decisao" in b) out.decisao = umDe(b.decisao, DECISOES);
  if ("motivo_categoria" in b) out.motivo_categoria = umDe(b.motivo_categoria, MOTIVOS);
  if ("motivo_literal" in b) out.motivo_literal = txt(b.motivo_literal);
  if ("valor_apresentado" in b) out.valor_apresentado = num(b.valor_apresentado);
  if ("valor_fechado" in b) out.valor_fechado = num(b.valor_fechado);
  if ("toque_fechamento" in b) out.toque_fechamento = umDe(b.toque_fechamento, TOQUES);
  if ("status_cadencia" in b) out.status_cadencia = umDe(b.status_cadencia, CADENCIAS);
  if ("servico" in b) out.servico = txt(b.servico);
  return out;
}

function tipoDoEvento(c: Record<string, unknown>): string {
  if (c.decisao === "Fechou") return "fechou";
  if (c.decisao === "Não fechou") return "nao_fechou";
  if (c.decisao === "Pensando") return "follow_up";
  if (c.compareceu) return c.compareceu === "Sim" ? "compareceu" : c.compareceu === "Não" ? "faltou" : "remarcou";
  if (c.agendou === true) return "agendou";
  if (c.tempo_primeira_resposta_min !== undefined) return "respondeu";
  return "atualizou";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SYNC_SECRET = process.env.SYNC_SECRET;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SYNC_SECRET) {
    res.status(500).json({ error: "Servidor sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SYNC_SECRET configurados" });
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || token !== SYNC_SECRET) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  const b: Body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {});
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  if (req.method === "PATCH") {
    const id = txt(req.query.id) ?? txt(b.id);
    if (!id) {
      res.status(400).json({ error: "Informe o id do lead (?id=L-AAAAMMDD-NNN)" });
      return;
    }
    const campos = camposDeStatus(b);
    if (Object.keys(campos).length === 0) {
      res.status(400).json({ error: "Nenhum campo de status válido no corpo" });
      return;
    }
    const { data, error } = await db
      .from("sap_leads")
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, clinica_id")
      .maybeSingle();
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    if (!data) {
      res.status(404).json({ error: "Lead não encontrado" });
      return;
    }
    const tipo = txt(b.evento) ?? tipoDoEvento(campos);
    await db.from("sap_eventos").insert({ lead_id: id, clinica_id: data.clinica_id, tipo, payload: campos });
    res.status(200).json({ ok: true, id, evento: tipo, campos });
    return;
  }

  // POST: novo lead
  const clinicaId = txt(b.clinica_id);
  if (!clinicaId) {
    res.status(400).json({ error: "clinica_id é obrigatório" });
    return;
  }
  const entrada = txt(b.data_entrada) ? new Date(String(b.data_entrada)) : new Date();
  if (Number.isNaN(entrada.getTime())) {
    res.status(400).json({ error: "data_entrada inválida" });
    return;
  }

  const telefoneHash = txt(b.telefone_hash) ?? hashTelefone(b.telefone);
  const emailHash = txt(b.email_hash) ?? hashEmail(b.email);
  const metaLeadId = txt(b.meta_lead_id);

  // Dedupe: mesmo lead da Meta, ou mesmo telefone na mesma clínica em 30 dias.
  const desde = new Date(entrada.getTime() - 30 * 86400000).toISOString();
  let repetido: { id: string } | null = null;
  if (metaLeadId) {
    const r = await db.from("sap_leads").select("id").eq("meta_lead_id", metaLeadId).maybeSingle();
    repetido = r.data;
  }
  if (!repetido && telefoneHash) {
    const r = await db
      .from("sap_leads")
      .select("id")
      .eq("clinica_id", clinicaId)
      .eq("telefone_hash", telefoneHash)
      .gte("data_entrada", desde)
      .limit(1)
      .maybeSingle();
    repetido = r.data;
  }
  if (repetido) {
    await db.from("sap_eventos").insert({
      lead_id: repetido.id,
      clinica_id: clinicaId,
      tipo: "lead_repetido",
      payload: { canal: txt(b.canal), utm_campaign: txt(b.utm_campaign), utm_content: txt(b.utm_content) },
    });
    res.status(200).json({ ok: true, id: repetido.id, repetido: true });
    return;
  }

  const linha = {
    clinica_id: clinicaId,
    data_entrada: entrada.toISOString(),
    canal: umDe(b.canal, CANAIS) ?? "Outro",
    utm_source: txt(b.utm_source),
    utm_medium: txt(b.utm_medium),
    utm_campaign: txt(b.utm_campaign),
    utm_content: txt(b.utm_content),
    telefone_hash: telefoneHash,
    email_hash: emailHash,
    meta_lead_id: metaLeadId,
    fbclid: txt(b.fbclid),
    fbc: txt(b.fbc),
    fbp: txt(b.fbp),
    gclid: txt(b.gclid),
    wbraid: txt(b.wbraid),
    gbraid: txt(b.gbraid),
    ...camposDeStatus(b),
  };

  // ID L-AAAAMMDD-NNN. Duas entradas no mesmo instante podem disputar o mesmo
  // número: a chave primária barra a segunda e a gente tenta o próximo.
  const dia = diaLocal(entrada);
  const { count } = await db
    .from("sap_leads")
    .select("id", { count: "exact", head: true })
    .like("id", `L-${dia}-%`);
  let seq = (count ?? 0) + 1;
  let idFinal = txt(b.id);
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const id = idFinal ?? `L-${dia}-${String(seq).padStart(3, "0")}`;
    const { error } = await db.from("sap_leads").insert({ id, ...linha });
    if (!error) {
      await db.from("sap_eventos").insert({ lead_id: id, clinica_id: clinicaId, tipo: "lead_entrou", payload: { canal: linha.canal } });
      res.status(201).json({ ok: true, id });
      return;
    }
    if (error.code !== "23505" || idFinal) {
      res.status(500).json({ error: error.message });
      return;
    }
    seq += 1;
    idFinal = null;
  }
  res.status(409).json({ error: "Não consegui gerar um ID livre, tente de novo" });
}
