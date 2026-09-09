import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { runKommoReconcile } from "../_lib/kommo-reconcile.js";

// Descobre quais leads sumiram do Kommo e os marca como removidos na origem.
//
// Roda separado do sync diário de propósito: é uma varredura completa da conta
// (dezenas de milhares de leads, ~40 requisições) e não precisa acontecer todo
// dia. Semanal é suficiente para o total na tela não descolar da realidade.
//
// Parâmetros:
//   client_id=     limita a um cliente (recomendado)
//   confirmar=1    marca mesmo quando a fatia passa do limite de segurança
//
// Sem confirmar=1, uma varredura que encontraria mais de 30% da base ausente
// não marca nada e devolve o número para conferência — é a diferença entre
// "a cliente apagou leads" e "o token expirou e a API devolveu vazio".

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SYNC_SECRET = process.env.SYNC_SECRET;
  const KOMMO_API_TOKEN = process.env.KOMMO_API_TOKEN;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SYNC_SECRET || !KOMMO_API_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({
      error: "Servidor sem SYNC_SECRET/KOMMO_API_TOKEN/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configurados",
    });
    return;
  }

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || token !== SYNC_SECRET) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  const clientId = typeof req.query.client_id === "string" ? req.query.client_id : undefined;
  const confirmar = req.query.confirmar === "1" || req.query.confirmar === "true";

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let q = admin
      .from("crm_connections")
      .select("id, client_id, subdomain")
      .eq("provider", "kommo")
      .eq("active", true);
    if (clientId) q = q.eq("client_id", clientId);

    const { data: conexoes, error } = await q;
    if (error) throw new Error(error.message);
    if (!conexoes || conexoes.length === 0) {
      res.status(200).json({ nada_a_fazer: "Nenhuma conexão Kommo ativa encontrada.", conexoes: [] });
      return;
    }

    const resultados = [];
    for (const c of conexoes) {
      if (!c.subdomain) {
        resultados.push({ crm_connection_id: c.id, errors: ["conexão sem subdomain"] });
        continue;
      }
      const r = await runKommoReconcile({
        accessToken: KOMMO_API_TOKEN,
        // O campo guarda só o subdomínio; o host completo é montado aqui.
        kommoDomain: c.subdomain.includes(".") ? c.subdomain : `${c.subdomain}.kommo.com`,
        supabaseUrl: SUPABASE_URL,
        supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        crmConnectionId: c.id,
        clientId: c.client_id,
        confirmar,
      });
      resultados.push({ crm_connection_id: c.id, client_id: c.client_id, ...r });
    }

    const problema = resultados.some((r) => (r.errors?.length ?? 0) > 0 || (r as any).precisaConfirmar);
    res.status(problema ? 207 : 200).json({ reconciliado_em: new Date().toISOString(), conexoes: resultados });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
