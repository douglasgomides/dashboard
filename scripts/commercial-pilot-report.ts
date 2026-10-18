import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  qualidadeComercialSchema,
  eventosComerciaisSchema,
} from "../src/lib/jornada-comercial.js";

// Só lê o recorte de homologação. Não busca conteúdo de mensagens, PII ou APIs
// externas. A RPC de detalhe registra o acesso na própria homologação.
process.loadEnvFile(".env.creative.local");
assert.equal(
  new URL(process.env.SUPABASE_URL!).hostname,
  "tezpmowkupeoabzzbxpf.supabase.co",
  "somente homologação autorizada",
);
const qa = JSON.parse(await readFile(".creative-pilot-auth.local", "utf8")) as {
  email: string;
  password: string;
  clientId: string;
  userId: string;
};
assert.equal(qa.clientId, "f8ced257-8df7-4e1a-9e88-a7409fbd4b6b");
const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
try {
  const auth = await db.auth.signInWithPassword({
    email: qa.email,
    password: qa.password,
  });
  if (auth.error)
    throw new Error("Não foi possível autenticar o usuário de homologação");
  assert.equal(auth.data.user?.id, qa.userId);
  const started = performance.now();
  const result = await db.rpc("jornada_qualidade", {
    p_client: qa.clientId,
    p_de: "2026-10-01",
    p_ate: "2026-10-31",
    p_offset: 0,
  });
  if (result.error)
    throw new Error("Falha no contrato de qualidade em homologação");
  const quality = qualidadeComercialSchema.parse(result.data);
  const elapsed = performance.now() - started;
  assert.equal(quality.resumo.registros_crm, 40);
  assert.equal(quality.resumo.com_conversa_verificada, 1);
  assert.equal(quality.resumo.sem_origem, 40);
  assert.equal(quality.resumo.receita_atribuida, null);
  assert.equal(quality.resumo.receita_recebida, null);
  const links = await db
    .from("jornada_vinculos")
    .select("lead_id,metodo")
    .eq("client_id", qa.clientId)
    .eq("estado", "verificado");
  if (links.error) throw new Error("Falha ao conferir vínculos privados");
  assert.equal(links.data.length, 1);
  assert.equal(links.data[0].metodo, "flwchat_session");
  const detailResult = await db.rpc("jornada_eventos_comerciais", {
    p_client: qa.clientId,
    p_lead: links.data[0].lead_id,
  });
  if (detailResult.error) throw new Error("Falha ao conferir eventos privados");
  const detail = eventosComerciaisSchema.parse(detailResult.data);
  assert.ok(detail.eventos.some((x) => x.tipo === "conversa"));
  assert.ok(
    detail.eventos.some((x) => x.tipo === "entrou" || x.tipo === "entrada_crm"),
  );
  assert.ok(detail.eventos.some((x) => x.tipo === "primeira_saida_observada"));
  const report = {
    executado_em: new Date().toISOString(),
    ambiente: "Supabase homologação tezpmowkupeoabzzbxpf",
    fonte:
      "Recorte real de metadados já sincronizados: 40 oportunidades FlwChat, 1 sessão WTS e 43 eventos de mensagem sem texto.",
    limites:
      "Não testa uma nova chamada ao fornecedor nem comprova a cobertura total da conta. Fonte WTS conferida somente neste recorte pelo provider da conversa e sessionId exato; nenhuma associação legada em produção foi promovida.",
    identidade:
      "Autenticação com usuário restrito à clínica; nenhuma chamada de leitura usa o JWT service_role após login.",
    tempo_rpc_ms: Math.round(elapsed),
    qualidade: quality,
    linha_do_tempo: detail,
  };
  const out = resolve(
    process.argv.find((x) => x.startsWith("--out="))?.slice(6) ??
      "work/commercial-pilot-report.json",
  );
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  console.log(
    JSON.stringify({
      ok: true,
      registros: quality.resumo.registros_crm,
      vinculos_verificados: quality.resumo.com_conversa_verificada,
      sem_origem: quality.resumo.sem_origem,
      eventos: detail.total_eventos,
      tempo_rpc_ms: Math.round(elapsed),
      out,
    }),
  );
} finally {
  await db.auth.signOut({ scope: "local" });
}
