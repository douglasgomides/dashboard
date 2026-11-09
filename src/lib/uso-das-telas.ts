// Regras puras da aba "Uso das telas" (Phase 2, plano 02-03). Não importa supabase, React nem router: roda em tsx.
//
// A lista de telas vem da árvore de rotas, não do banco: assim a tabela mostra também as telas com 0 aberturas no período
// (D-12, CD-11), que é o que impede ler "sem dado" como "sem uso". São 81 telas e não 90: 90 é o número de arquivos em
// src/routes, e entre eles há layouts (/_authenticated, /_authenticated/$clientId, /_authenticated/admin, /_authenticated/sap),
// /login, /conhecer, /reset-password e /qa/layout, que não entram no log. As 81 são as 80 folhas de /_authenticated mais /sem-acesso.
import { rotaRegistravel } from "./rota-log";

// Rotas que só redirecionam (CD-04, D-16): nunca ganham linha própria por redirecionarem, então o registro não as vê como
// abertura. Vêm de `throw redirect` em src/routes. Atenção: "só redireciona" não quer dizer linha sempre zerada. Três delas ficam
// sob os guardas do admin e do SAP (/_authenticated/admin/aquisicao, /_authenticated/sap/$clientId/semana e
// /_authenticated/sap/$clientId/passo-a-passo), e uma visita negada a elas ainda aparece na coluna Bloqueada (regra a da D-16).
export const ROTAS_SO_REDIRECIONAM: ReadonlySet<string> = new Set([
  "/_authenticated/",
  "/_authenticated/$clientId/aquisicao",
  "/_authenticated/$clientId/conversas",
  "/_authenticated/$clientId/marketing",
  "/_authenticated/$clientId/sap/",
  "/_authenticated/$clientId/sap/etapas",
  "/_authenticated/$clientId/sap/execucao",
  "/_authenticated/$clientId/sap/leitura",
  "/_authenticated/$clientId/sap/metas",
  "/_authenticated/admin/aquisicao",
  "/_authenticated/sap/$clientId/semana",
  "/_authenticated/sap/$clientId/passo-a-passo",
]);

// Períodos da aba, em dias (D-12). O banco limita a 90 (CD-09).
export const PERIODOS = [7, 30, 90] as const;

// Uma linha de public.rota_acessos_resumo: só contagens e a data da última abertura, nunca quem abriu (LOG-03).
export interface LinhaResumo {
  rota: string;
  aberturas: number;
  pessoas: number;
  ultima: string | null;
  menu: number;
  busca: number;
  link: number;
  direto: number;
  redirecionamento: number;
  bloqueada: number;
}

export interface LinhaTabela extends LinhaResumo {
  soRedireciona: boolean;
  foraDaArvore: boolean;
}

// Telas da árvore: ids registráveis que não são layout. Um id X é layout quando algum outro id começa com X + "/";
// ids que terminam em barra (rotas índice) são folhas.
export function folhasDaArvore(ids: readonly string[]): string[] {
  const registraveis = ids.filter((id) => rotaRegistravel(id));
  return registraveis.filter((id) => id.endsWith("/") || !ids.some((outro) => outro !== id && outro.startsWith(`${id}/`)));
}

// Nome para a tabela: tira o prefixo /_authenticated e troca $clientId por [clínica].
export function rotaLegivel(routeId: string): string {
  const semPrefixo = routeId.startsWith("/_authenticated") ? routeId.slice("/_authenticated".length) : routeId;
  const legivel = semPrefixo.split("$clientId").join("[clínica]");
  return legivel === "" ? "/" : legivel;
}

const numero = (valor: unknown): number => {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
};

function normalizar(linha: Partial<LinhaResumo> & { rota: string }): LinhaResumo {
  return {
    rota: linha.rota,
    aberturas: numero(linha.aberturas),
    pessoas: numero(linha.pessoas),
    ultima: linha.ultima ?? null,
    menu: numero(linha.menu),
    busca: numero(linha.busca),
    link: numero(linha.link),
    direto: numero(linha.direto),
    redirecionamento: numero(linha.redirecionamento),
    bloqueada: numero(linha.bloqueada),
  };
}

// Uma linha por tela da árvore (com zeros quando o resumo não tem a rota) mais as rotas do resumo que saíram da árvore.
export function montarTabela(folhas: readonly string[], resumo: readonly LinhaResumo[] | null | undefined): LinhaTabela[] {
  const porRota = new Map<string, LinhaResumo>();
  for (const linha of resumo ?? []) porRota.set(linha.rota, normalizar(linha));
  const naArvore = new Set(folhas);
  const tabela: LinhaTabela[] = folhas.map((rota) => ({
    ...(porRota.get(rota) ?? normalizar({ rota })),
    soRedireciona: ROTAS_SO_REDIRECIONAM.has(rota),
    foraDaArvore: false,
  }));
  for (const [rota, linha] of porRota) {
    if (!naArvore.has(rota)) tabela.push({ ...linha, soRedireciona: false, foraDaArvore: true });
  }
  return tabela.sort((a, b) => {
    if (b.aberturas !== a.aberturas) return b.aberturas - a.aberturas;
    const [x, y] = [rotaLegivel(a.rota), rotaLegivel(b.rota)];
    return x < y ? -1 : x > y ? 1 : 0;
  });
}
