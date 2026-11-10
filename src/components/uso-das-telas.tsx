import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { MousePointerClick } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Painel, Selo } from "@/components/visual";
import { ehTabelaAusente } from "@/lib/rota-log";
import { folhasDaArvore, montarTabela, PERIODOS, rotaLegivel, type LinhaResumo } from "@/lib/uso-das-telas";

// Aba "Uso das telas" de /admin/conferencia (Phase 2, D-11 e D-12). Só contagens e datas: nunca mostra quem abriu (LOG-03).
// A lista de telas vem da árvore de rotas, então telas com 0 aberturas no período aparecem (CD-11).

interface ErroDeLeitura extends Error {
  code?: string;
  status?: number;
}

function erroDe(error: { message?: string; code?: string } | null, status: number | undefined): ErroDeLeitura {
  return Object.assign(new Error(error?.message ?? "Falha ao ler o registro"), { code: error?.code, status });
}

async function lerResumo(dias: number, equipe: boolean, incluirTeste: boolean): Promise<LinhaResumo[]> {
  const { data, error, status } = await (supabase as any).rpc("rota_acessos_resumo", { p_dias: dias, p_equipe: equipe, p_incluir_teste: incluirTeste });
  if (error) throw erroDe(error, status);
  return (data ?? []) as LinhaResumo[];
}

// Registro ligado desde: a abertura mais antiga gravada (a policy de select já é só admin).
async function lerInicio(): Promise<string | null> {
  const { data, error, status } = await (supabase as any).from("rota_acessos").select("criado_em").order("criado_em", { ascending: true }).limit(1);
  if (error) throw erroDe(error, status);
  return (data as { criado_em?: string }[] | null)?.[0]?.criado_em ?? null;
}

const FUSO = "America/Sao_Paulo";
const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: FUSO });
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: FUSO });

const COLUNAS_ORIGEM = [
  ["menu", "Menu"],
  ["busca", "Busca"],
  ["link", "Link"],
  ["direto", "Direto"],
  ["redirecionamento", "Redirecionamento"],
  ["bloqueada", "Bloqueada"],
] as const;

const TAMANHO = { fontSize: 14 } as const;

export function UsoDasTelas() {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(7);
  const [equipe, setEquipe] = useState(false);
  const [incluirTeste, setIncluirTeste] = useState(false);
  const router = useRouter();

  const resumo = useQuery({
    queryKey: ["rota-acessos-resumo", dias, equipe, incluirTeste],
    queryFn: () => lerResumo(dias, equipe, incluirTeste),
    staleTime: 60_000,
    retry: false,
  });
  const inicio = useQuery({ queryKey: ["rota-acessos-inicio"], queryFn: lerInicio, staleTime: 5 * 60_000, retry: false });

  const folhas = folhasDaArvore(Object.keys(router.routesById));
  const tabela = montarTabela(folhas, resumo.data);
  const semAberturas = resumo.isSuccess && tabela.every((linha) => linha.aberturas === 0);
  const erro = resumo.error as ErroDeLeitura | null;
  const legendaPeriodo = `Últimos ${dias} dias · uso ${equipe ? "da equipe" : "das clínicas"}`;

  return (
    <Painel icone={MousePointerClick} titulo="Uso das telas" resumo="Quantas vezes cada tela foi aberta no período. Mostra só a contagem.">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="seg" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p} type="button" aria-pressed={dias === p} onClick={() => setDias(p)}>{p} dias</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Quem abriu">
            <button type="button" aria-pressed={!equipe} onClick={() => setEquipe(false)}>Clínicas</button>
            <button type="button" aria-pressed={equipe} onClick={() => setEquipe(true)}>Equipe</button>
          </div>
          <label className="inline-flex items-center gap-2" style={TAMANHO}>
            <input type="checkbox" checked={incluirTeste} onChange={(e) => setIncluirTeste(e.target.checked)} />
            Incluir clínicas de teste
          </label>
        </div>

        <p className="mb-3" style={{ ...TAMANHO, color: "var(--text-dim)" }}>
          {inicio.isSuccess
            ? inicio.data
              ? `Registro ligado desde ${dataCurta(inicio.data)}`
              : "Nenhuma abertura gravada ainda"
            : null}
        </p>

        {resumo.isLoading ? (
          <p style={TAMANHO}>Lendo o registro…</p>
        ) : erro ? (
          <p role="status" style={TAMANHO}>
            {ehTabelaAusente(erro)
              ? "A tabela do registro ainda não foi criada. As aberturas aparecem aqui depois que ela for criada no banco."
              : "Não foi possível ler o registro agora."}
          </p>
        ) : (
          <>
            {semAberturas && <p className="mb-2" style={TAMANHO}>Nenhuma abertura registrada neste período.</p>}
            <div style={{ overflowX: "auto", maxWidth: "100%" }}>
              <table className="t" style={TAMANHO}>
                <caption className="mb-1 text-left" style={{ ...TAMANHO, color: "var(--text-dim)" }}>{legendaPeriodo}</caption>
                <thead>
                  <tr>
                    <th scope="col">Tela</th>
                    <th scope="col">Aberturas</th>
                    <th scope="col">Pessoas</th>
                    <th scope="col">Última abertura</th>
                    {COLUNAS_ORIGEM.map(([chave, rotulo]) => <th key={chave} scope="col">{rotulo}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tabela.map((linha) => (
                    <tr key={linha.rota}>
                      <td className="l" style={{ whiteSpace: "nowrap" }}>
                        <span>{rotaLegivel(linha.rota)}</span>
                        {linha.soRedireciona && <> <Selo titulo="Esta tela só leva para outra; a abertura conta na tela de destino">só redireciona</Selo></>}
                        {linha.foraDaArvore && <> <Selo titulo="Tela que tem registro mas não está mais nas rotas atuais">fora das rotas atuais</Selo></>}
                      </td>
                      <td>{linha.aberturas}</td>
                      <td>{linha.pessoas}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{linha.ultima ? dataHora(linha.ultima) : "—"}</td>
                      {COLUNAS_ORIGEM.map(([chave]) => <td key={chave}>{linha[chave]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Painel>
  );
}
