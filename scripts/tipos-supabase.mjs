// Atualiza src/integrations/supabase/types.ts a partir do arquivo gerado pelo Supabase (generate_typescript_types),
// mantendo os tipos de domínio do Hub: o banco guarda essas colunas como texto com check, e o gerador as tipa como
// string. Uso: node scripts/tipos-supabase.mjs caminho/do/gerado.ts
import { readFileSync, writeFileSync } from "node:fs";

const DOMINIO = `// Tipos de domínio usados pelo Hub (valores aceitos nas colunas de texto; o banco usa check, não enum).
export type FunnelStage = "C0" | "C1" | "C2" | "C3";
export type MethodologyStage = "percepcao" | "confianca" | "venda" | "multiplicacao";
export type ContentFormat = "reels" | "carrossel" | "estatico" | "stories";
export type SuggestionStatus = "suggested" | "accepted" | "dismissed";
export type CfmScoreStatus = "verde" | "amarelo" | "vermelho";
export type ClientMemberRole = "owner" | "strategist" | "viewer";
export type CrmProvider = "kommo" | "feegow" | "ninsaude" | "clint" | "rdstation" | "flwchat" | "digisac";
`;
// tabela (ou função) → coluna → tipo de domínio
const COLUNAS = {
  client_members: { role: "ClientMemberRole" },
  clients: { cfm_score_status: "CfmScoreStatus" },
  content_angle_suggestions: { format: "ContentFormat", funnel_stage: "FunnelStage", methodology_stage: "MethodologyStage", status: "SuggestionStatus" },
  crm_connections: { provider: "CrmProvider" },
  crm_leads: { provider: "CrmProvider" },
  instagram_posts: { format: "ContentFormat", funnel_stage: "FunnelStage", methodology_stage: "MethodologyStage" },
  suggest_next_angles: { format: "ContentFormat", funnel_stage: "FunnelStage", methodology_stage: "MethodologyStage" },
};

const gerado = readFileSync(process.argv[2], "utf8");
const linhas = gerado.split("\n");
let tabela = null;
const saida = linhas.map((l) => {
  const m = l.match(/^      ([a-z_0-9]+): \{/);
  if (m) tabela = m[1];
  const cols = tabela && COLUNAS[tabela];
  if (!cols) return l;
  return l.replace(/^(\s+)([a-z_]+)(\??): string(\s|$)/, (s, ind, col, opc, fim) => (cols[col] ? `${ind}${col}${opc}: ${cols[col]}${fim}` : s));
});
const texto = `// Gerado pelo Supabase (generate_typescript_types) e ajustado por scripts/tipos-supabase.mjs. Não edite à mão.\n${saida.join("\n").replace("export type Database = {", `${DOMINIO}\nexport type Database = {`)}`;
writeFileSync("src/integrations/supabase/types.ts", texto);
console.log("tipos atualizados");
