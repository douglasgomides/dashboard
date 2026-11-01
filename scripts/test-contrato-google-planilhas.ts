// Contrato da planilha de anúncios (CSV público do Google Planilhas). Doc: docs/apis/google-planilhas.md.
// Ao vivo: CONTRATO_AO_VIVO=1 CONTRATO_PLANILHA_URL=<link de exportação CSV> npx tsx scripts/test-contrato-google-planilhas.ts
// Só confere o cabeçalho (nomes das colunas). Nenhuma linha é impressa.
import assert from "node:assert/strict";
import { campos, rodarContrato } from "./contrato/comum";
import { interpretarPlanilha, lerCsv, SEM_DATA } from "../api/_lib/ads-planilha-sync";

const COLUNAS = [
  "Dia da Análise", "Status", "Ações", "Nome da Campanha", "Link do Post", "Tipo", "Orçamento", "Valor Investido Total",
  "Seguidores Antes", "Valor no Período", "Seguidores Após", "Seguidores Periodo", "Custo por Seguidor", "Custo por Mensagem",
  "Mensagens Antes", "Mensagens Depois", "Mensagens Período",
];
/** CSV → { "<coluna em minúsculas>": true }. Página de login (HTML) vira { html: true } e falha no contrato. */
function cabecalho(corpo: unknown): Record<string, boolean> {
  const texto = typeof corpo === "string" ? corpo : String((corpo as { csv?: unknown })?.csv ?? "");
  if (texto.trimStart().startsWith("<")) return { html: true };
  return Object.fromEntries((lerCsv(texto)[0] ?? []).map((c) => [c.trim().toLowerCase(), true]));
}

await rodarContrato({
  api: "google-planilhas",
  variaveis: ["CONTRATO_PLANILHA_URL"],
  endpoints: [
    {
      nome: "csv",
      transformar: cabecalho,
      hosts: /^docs\.google\.com$/,
      campos: campos(COLUNAS.map((c) => `${c.toLowerCase()}: boolean`)),
      aoVivo: (env) => {
        const u = env.CONTRATO_PLANILHA_URL;
        if (!u) return null;
        if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(u)) return "link não é do Google Planilhas";
        // Sem cabeçalho de autenticação: o link é público, então pode seguir o redirecionamento do Google.
        return { url: u, corpo: "texto", seguir: true };
      },
    },
  ],
  normalizadores: (f: any) => {
    const r = interpretarPlanilha(f.csv, "2026-11-01");
    assert.equal(r.linhas.length, 3, "duas linhas datadas e uma do bloco sem data");
    const [a, b, semData] = r.linhas;
    assert.equal(a.valor_periodo, 70);
    assert.equal(a.seguidores_periodo, 10);
    assert.equal(b.nome, "Campanha com vírgula, no nome", "aspas no CSV");
    assert.equal(b.seguidores_periodo, null, "período que não fecha com antes/depois é anulado");
    assert.equal(semData.analise_em, SEM_DATA);
    assert.throws(() => interpretarPlanilha("Status,Tipo\nAtivo,Reels\n", "2026-11-01"), /mudou de formato/);
  },
});
