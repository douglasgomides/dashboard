import type { VercelRequest, VercelResponse } from "../_lib/http-types.js";
import { createClient } from "@supabase/supabase-js";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { recordSyncStatusPorCliente } from "../_lib/sync-status.js";
import { runWtsSync } from "../_lib/wts-sync.js";
import { ingerirConversasWts } from "../_lib/conversas-wts.js";
import { analisarConversasPendentes } from "../_lib/resumo-conversa.js";
import { rodarAtendenteSombra } from "../_lib/atendente.js";
import { atribuirLinks } from "../_lib/redirecionar.js";
import { transcreverReels } from "../_lib/transcrever-reels.js";
import { ingerirConversasDigisac } from "../_lib/conversas-digisac.js";
import { sondarConversasCrm } from "../_lib/sonda-conversas-crm.js";

// Atendimento no WhatsApp via WTS Chat.
// Roda para todo cliente ativo com wts_company_id preenchido.
// Protegido pelo mesmo SYNC_SECRET dos outros endpoints de sync.
//
// Parâmetros opcionais:
//   sync_days=7          janela móvel (padrão 7)
//   full=1               backfill completo, sem corte de data
//   client_id=           limita a um cliente
//
// O backfill completo tem teto de 400 páginas por execução (~40 mil sessões).
// Se a conta for maior que isso, chame de novo: o upsert é idempotente e a
// segunda passada só regrava o que já existe até alcançar o resto.

const querySchema = z.object({
  client_id: z.string().uuid().optional(), sync_days: z.coerce.number().int().min(1).max(365).optional(),
  dias: z.coerce.number().int().min(1).max(90).optional(), full: z.enum(["0", "1", "true", "false"]).optional(),
  sonda_crm: z.literal("1").optional(), digisac_conversas: z.literal("1").optional(), so_analisar: z.literal("1").optional(),
}).refine((q) => [q.sonda_crm, q.digisac_conversas, q.so_analisar].filter(Boolean).length <= 1, "Escolha apenas um modo");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST" && req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }
  const entrada = querySchema.safeParse(req.query);
  if (!entrada.success) { res.status(400).json({ error: "Parâmetros de sincronização inválidos" }); return; }
  const query = entrada.data;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET, WTS_API_TOKEN } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { res.status(500).json({ error: "Servidor sem Supabase configurado" }); return; }
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) { res.status(401).json({ error: "Token inválido" }); return; }
  const maquina = !!SYNC_SECRET && timingSafeEqual(createHash("sha256").update(token).digest(), createHash("sha256").update(SYNC_SECRET).digest());
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const clientId = query.client_id;
  const syncDays = query.sync_days;
  const full = query.full === "1" || query.full === "true";
  const inicio = Date.now();

  if (query.sonda_crm) {
    if (maquina) { res.status(403).json({ error: "A sonda exige sessão de administrador" }); return; }
    const { data: usuario, error: erroUsuario } = await admin.auth.getUser(token);
    if (erroUsuario || !usuario.user) { res.status(401).json({ error: "Sessão inválida" }); return; }
    const { data: acesso, error: erroAcesso } = await admin.from("app_admins").select("user_id").eq("user_id", usuario.user.id).maybeSingle();
    if (erroAcesso) { res.status(503).json({ error: "Não foi possível conferir a permissão" }); return; }
    if (!acesso) { res.status(403).json({ error: "A sonda exige sessão de administrador" }); return; }
    try { res.status(200).json({ ok: true, sonda: await sondarConversasCrm(admin, { onlyClientId: clientId }) }); }
    catch { res.status(500).json({ error: "Não foi possível executar a sonda" }); }
    return;
  }
  if (!SYNC_SECRET) { res.status(500).json({ error: "Servidor sem SYNC_SECRET configurado" }); return; }
  if (!maquina) { res.status(401).json({ error: "Token inválido" }); return; }

  try {
    // Digisac é independente da credencial WTS e respeita o cliente solicitado.
    if (query.digisac_conversas) {
      const digisac = await ingerirConversasDigisac(admin, { limite: 250, orcamentoMs: 240_000, dias: query.dias ?? 30, onlyClientId: clientId });
      const ok = Object.values(digisac).every((r) => r.erros.length === 0);
      res.status(ok ? 200 : 207).json({ ok, digisac });
      return;
    }
    if (query.so_analisar) {
      const corte30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const vistos = new Set<string>();
      let completa = false;
      for (let de = 0; de < 50_000; de += 1000) {
        let q = admin.from("conversas").select("client_id").gte("ultima_msg_em", corte30).order("id").range(de, de + 999);
        if (clientId) q = q.eq("client_id", clientId);
        const { data, error } = await q;
        if (error) throw new Error("Não foi possível listar os clientes com conversas pendentes");
        for (const r of (data ?? []) as { client_id: string }[]) vistos.add(r.client_id);
        if ((data?.length ?? 0) < 1000) { completa = true; break; }
      }
      if (!completa) throw new Error("Lista de conversas incompleta: limite de paginação atingido");
      const clientes = [...vistos];
      const analise: Record<string, Awaited<ReturnType<typeof analisarConversasPendentes>>> = {};
      const fim = inicio + 225_000;
      let cursor = 0;
      async function trabalhador() {
        while (cursor < clientes.length && fim - Date.now() >= 15_000) {
          const id = clientes[cursor++];
          analise[id] = await analisarConversasPendentes(admin, id, { limite: 200, orcamentoMs: Math.min(60_000, fim - Date.now()) });
        }
      }
      const extra = async (acao: () => Promise<unknown>) => {
        try { return await acao(); } catch { return { erro: "Rotina auxiliar não concluída" }; }
      };
      const [_, atendente, links, reels] = await Promise.all([
        Promise.all(Array.from({ length: Math.min(3, clientes.length) }, () => trabalhador())),
        extra(() => rodarAtendenteSombra(admin, Math.max(1, Math.min(150_000, fim - Date.now())), clientId)),
        extra(() => atribuirLinks(admin, clientId)),
        extra(() => transcreverReels(admin, Math.max(1, Math.min(150_000, fim - Date.now())), 8, clientId)),
      ]);
      const pendentes = clientes.length - Object.keys(analise).length;
      const falhou = (v: unknown): boolean => !!v && typeof v === "object" && ("erro" in v || ("erros" in v && Array.isArray(v.erros) && v.erros.length > 0) || Object.values(v).some(falhou));
      const ok = pendentes === 0 && !falhou({ analise, atendente, links, reels });
      res.status(ok ? 200 : 207).json({ ok, analise, clientes_pendentes: pendentes, atendente, links, reels });
      return;
    }
    if (!WTS_API_TOKEN) { res.status(500).json({ error: "Servidor sem WTS_API_TOKEN configurado" }); return; }
    const results = await runWtsSync({
      wtsToken: WTS_API_TOKEN,
      supabaseUrl: SUPABASE_URL,
      supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
      syncDays,
      full,
      clientId,
    });

    await recordSyncStatusPorCliente(
      createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }),
      "atendimento",
      results.map((r) => ({ clientId: r.client_id, rows: r.sessoes, errors: r.errors })),
    );
    // Conversas: depois do sync das sessões, traz as mensagens das novas (até ~100s). Nunca derruba o sync.
    const conversas: Record<string, unknown> = {};
    try {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const clientes = [...new Set(results.map((r) => r.client_id))];
      for (const id of clientes) {
        const { data: lig, error: erroLigacoes } = await admin.from("crm_connections").select("access_token").eq("client_id", id).eq("provider", "flwchat").eq("active", true);
        if (erroLigacoes) throw new Error("Não foi possível ler as credenciais adicionais de conversas");
        const extras = (lig ?? []).map((l) => l.access_token as string).filter(Boolean);
        const c = await ingerirConversasWts(admin, WTS_API_TOKEN, id, { tokensExtras: extras, limite: 80, orcamentoMs: Math.floor(100_000 / Math.max(1, clientes.length)), dias: 7 });
        conversas[id] = { sessoes: c.sessoes, mensagens: c.mensagens, com_anuncio: c.comAnuncio ?? 0, campos_primeira_msg: c.valoresVistos.chaves, erros: c.erros.slice(0, 3) };
      }
    } catch (e) {
      conversas.erro = e instanceof Error ? e.message : String(e);
    }
    // Leitura por IA das conversas novas, com o tempo que sobrar da função (até ~270s no total).
    const analise: Record<string, unknown> = {};
    try {
      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const clientes = [...new Set(results.map((r) => r.client_id))];
      for (const id of clientes) {
        const resta = 260_000 - (Date.now() - inicio);
        if (resta < 15_000) break;
        analise[id] = await analisarConversasPendentes(admin, id, { limite: 60, orcamentoMs: Math.floor(resta / Math.max(1, clientes.length - Object.keys(analise).length)) });
      }
    } catch (e) {
      analise.erro = e instanceof Error ? e.message : String(e);
    }
    const erroAuxiliar = (r: unknown) => !!r && typeof r === "object" && ("erro" in r || ("erros" in r && Array.isArray(r.erros) && r.erros.length > 0));
    const hasErrors = results.some((r) => r.errors.length > 0) || typeof conversas.erro === "string" || typeof analise.erro === "string" || Object.values(conversas).some(erroAuxiliar) || Object.values(analise).some(erroAuxiliar);
    res.status(hasErrors ? 207 : 200).json({ synced_at: new Date().toISOString(), contas: results, conversas, analise });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
