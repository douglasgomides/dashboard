import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Circle, ClipboardCheck, ListChecks, Loader2, RefreshCw, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Painel, Selo } from "@/components/visual";
import {
  ETAPAS,
  ROTULO_GRAVIDADE,
  ROTULO_VERIFICADO,
  estadoDaEtapa,
  filtrarAchados,
  ordenarAchados,
  resumirConferencia,
  type Achado,
  type Conferencia,
  type EtapaId,
  type Gravidade,
  type RegistroEtapa,
  type Verificado,
} from "@/lib/conferencia";

export const Route = createFileRoute("/_authenticated/admin/conferencia")({
  component: ConferenciaPage,
});

const COR: Record<Gravidade, string> = { alta: "var(--crit)", media: "var(--warn)", baixa: "var(--text-dim)" };

async function chamar(corpo: Record<string, unknown>): Promise<any> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre de novo.");
  const r = await fetch("/api/sync/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ alvo: "conferencia", ...corpo }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.error ?? j?.erro ?? `Falha ${r.status}`);
  return j;
}

// Última rodada salva. Sem a tabela (migração não aplicada) devolve null e a tela segue.
async function ultimaConferencia(): Promise<Conferencia | null> {
  const { data, error } = await (supabase as any).from("conferencias_dados").select("*").order("iniciada_em", { ascending: false }).limit(1).maybeSingle();
  if (error) return null;
  return (data as Conferencia | null) ?? null;
}

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function IconeEtapa({ estado }: { estado: ReturnType<typeof estadoDaEtapa> }) {
  if (estado === "rodando") return <Loader2 size={16} className="animate-spin" aria-hidden style={{ color: "var(--accent)" }} />;
  if (estado === "ok") return <CheckCircle2 size={16} aria-hidden style={{ color: "var(--good)" }} />;
  if (estado === "erro") return <XCircle size={16} aria-hidden style={{ color: "var(--crit)" }} />;
  return <Circle size={16} aria-hidden style={{ color: "var(--muted)" }} />;
}

function Etapas({ registros, rodando }: { registros: RegistroEtapa[]; rodando: EtapaId | null }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-5" aria-label="Etapas da conferência">
      {ETAPAS.map((e, i) => {
        const estado = estadoDaEtapa(e.id, registros, rodando);
        const r = registros.find((x) => x.etapa === e.id);
        return (
          <li key={e.id} className="rounded-lg border p-2.5 text-xs" style={{ borderColor: estado === "rodando" ? "var(--accent)" : "var(--border)", background: "var(--surface)" }}>
            <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
              <IconeEtapa estado={estado} /> {i + 1}. {e.nome}
            </div>
            <div className="mt-1 leading-snug" style={{ color: "var(--ink-2)" }}>{e.oQue}</div>
            <div className="mt-1" style={{ color: "var(--muted)" }}>
              {estado === "rodando" ? "Conferindo…" : estado === "pendente" ? "Na fila" : estado === "erro" ? `Falhou: ${r?.erro ?? "erro"}` : `${r?.verificados ?? 0} conferidos · ${r?.achados ?? 0} ${r?.achados === 1 ? "ponto" : "pontos"}`}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CartaoAchado({ a }: { a: Achado }) {
  const etapa = ETAPAS.find((e) => e.id === a.etapa);
  return (
    <div style={{ borderLeft: `3px solid ${COR[a.gravidade]}`, paddingLeft: 12 }}>
      <div className="flex flex-wrap items-center gap-2">
        <Selo cor={COR[a.gravidade]} titulo={`Gravidade ${ROTULO_GRAVIDADE[a.gravidade].toLowerCase()}`}>{ROTULO_GRAVIDADE[a.gravidade]}</Selo>
        {etapa && <span className="text-xs" style={{ color: "var(--muted)" }}>{etapa.nome}</span>}
        {a.cliente && <span className="text-xs" style={{ color: "var(--text-dim)" }}>· {a.cliente}</span>}
      </div>
      <div className="text-sm font-medium" style={{ marginTop: 4 }}>{a.titulo}</div>
      <dl className="mt-1 grid gap-1 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
        <div><dt className="inline font-semibold" style={{ color: "var(--ink)" }}>O que aconteceu: </dt><dd className="inline">{a.detalhe}</dd></div>
        {a.risco && <div><dt className="inline font-semibold" style={{ color: "var(--ink)" }}>Risco: </dt><dd className="inline">{a.risco}</dd></div>}
        <div><dt className="inline font-semibold" style={{ color: "var(--ink)" }}>O que fazer: </dt><dd className="inline">{a.acao}</dd></div>
      </dl>
    </div>
  );
}

function ListaVerificados({ itens }: { itens: Verificado[] }) {
  const [soProblema, setSoProblema] = useState(false);
  const vis = itens.filter((v) => !soProblema || !v.ok).sort((a, b) => Number(a.ok) - Number(b.ok));
  return (
    <details className="mt-4">
      <summary className="cursor-pointer select-none py-1 text-sm font-medium">
        O que foi conferido ({itens.length}, {itens.filter((v) => !v.ok).length} com problema)
      </summary>
      <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--ink-2)" }}>
        <input type="checkbox" checked={soProblema} onChange={(e) => setSoProblema(e.target.checked)} /> Mostrar só o que tem problema
      </label>
      <div className="mt-2 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm empilha">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--ink-2)", background: "var(--surface-2)" }}>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2">O quê</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Etapa</th>
              <th className="px-3 py-2">Nota</th>
            </tr>
          </thead>
          <tbody>
            {vis.map((v, i) => (
              <tr key={`${v.etapa}:${v.nome}:${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2" data-label="Situação">{v.ok ? <Selo cor="var(--good)">OK</Selo> : <Selo cor="var(--warn)">Olhar</Selo>}</td>
                <td className="px-3 py-2" data-label="O quê"><span className="text-xs" style={{ color: "var(--muted)" }}>{ROTULO_VERIFICADO[v.tipo]}</span><div>{v.nome}</div></td>
                <td className="px-3 py-2 text-xs" data-label="Cliente">{v.cliente ?? "—"}</td>
                <td className="px-3 py-2 text-xs" data-label="Etapa">{ETAPAS.find((e) => e.id === v.etapa)?.nome}</td>
                <td className="px-3 py-2 text-xs" data-label="Nota" style={{ color: "var(--ink-2)" }}>{v.nota}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ConferenciaPage() {
  const qc = useQueryClient();
  const salva = useQuery({ queryKey: ["conferencia-ultima"], queryFn: ultimaConferencia, staleTime: 60_000 });
  // Rodada em andamento nesta tela (vai sendo preenchida etapa a etapa).
  const [viva, setViva] = useState<Conferencia | null>(null);
  const [rodando, setRodando] = useState<EtapaId | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fGrav, setFGrav] = useState<Gravidade | "todas">("todas");
  const [fEtapa, setFEtapa] = useState<EtapaId | "">("");
  const [fCliente, setFCliente] = useState("");

  const c = viva ?? salva.data ?? null;

  async function rodar() {
    setErro(null);
    setOcupado(true);
    try {
      const ini = await chamar({ etapa: "inicio" });
      let atual: Conferencia = { id: ini.conferencia_id, iniciada_em: ini.iniciada_em, concluida_em: null, etapas: [], achados: [], verificados: [], contas_vistas_na_meta: null, tokens_testados: null };
      setViva(atual);
      for (const e of ETAPAS) {
        setRodando(e.id);
        let reg: RegistroEtapa;
        let novos: Achado[] = [];
        let novosV: Verificado[] = [];
        try {
          const r = await chamar({ etapa: e.id, conferencia_id: atual.id });
          reg = { etapa: e.id, status: r.status, achados: r.achados, verificados: r.verificados, ms: r.ms, erro: r.erro };
          novos = r.novos ?? [];
          novosV = r.novos_verificados ?? [];
        } catch (x) {
          reg = { etapa: e.id, status: "erro", erro: x instanceof Error ? x.message : "falhou" };
        }
        atual = { ...atual, etapas: [...atual.etapas, reg], achados: [...atual.achados, ...novos], verificados: [...atual.verificados, ...novosV] };
        setViva(atual);
      }
      setRodando(null);
      await chamar({ etapa: "fim", conferencia_id: atual.id }).catch(() => null);
      setViva({ ...atual, concluida_em: new Date().toISOString() });
      qc.invalidateQueries({ queryKey: ["conferencia-ultima"] });
    } catch (x) {
      setErro(x instanceof Error ? x.message : "Falha ao conferir.");
    } finally {
      setRodando(null);
      setOcupado(false);
    }
  }

  const achados = useMemo(() => ordenarAchados(c?.achados ?? []), [c]);
  const visiveis = filtrarAchados(achados, { gravidade: fGrav === "todas" ? undefined : fGrav, etapa: fEtapa || undefined, cliente: fCliente || undefined });
  const r = c ? resumirConferencia(c) : null;
  const clientes = [...new Set(achados.map((a) => a.cliente).filter(Boolean) as string[])].sort();
  const incompleta = c && !c.concluida_em && !ocupado;

  return (
    <div>
      <div className="hpagehead">
        <h2>Conferência de dados</h2>
        <p className="note" style={{ margin: 0 }}>
          Auditoria da operação: procura o que a Meta mostra e o dashboard não (conta de anúncios com gasto e sem cliente), a mesma conta em dois
          clientes, gasto do painel que não bate com a Meta, sync que diz "sucesso" com o dado parado e cliente sem fonte obrigatória ligada. Só
          leitura: não muda nada nas contas.
        </p>
        <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 10 }}>
          <button type="button" className="btn inline-flex items-center gap-1.5" onClick={rodar} disabled={ocupado}>
            {ocupado ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />}{c ? "Conferir de novo" : "Rodar conferência"}
          </button>
          {ocupado && <span className="note">Rodando etapa por etapa. Leva de alguns segundos a um minuto.</span>}
          {!ocupado && c && (
            <span className="note">
              {viva ? "Conferência de agora" : "Última conferência salva"}: {quando(c.iniciada_em)}
              {incompleta ? " (interrompida antes do fim)" : ""}
            </span>
          )}
        </div>
      </div>

      {erro && (
        <div className="mt-3 flex items-start gap-2 text-sm" style={{ color: "var(--crit)" }}>
          <AlertTriangle size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {salva.isLoading && !viva && <div className="mt-4 h-24 animate-pulse rounded-xl" style={{ background: "var(--surface-2)" }} aria-busy="true" />}

      {!salva.isLoading && !c && !ocupado && (
        <p className="note" style={{ marginTop: 16 }}>Nenhuma conferência salva ainda. Rode a primeira para ver o retrato da operação.</p>
      )}

      {c && (
        <div style={{ marginTop: 16 }} className="grid gap-4">
          <Etapas registros={c.etapas ?? []} rodando={rodando} />

          <Painel
            icone={ClipboardCheck}
            titulo={ocupado ? `Conferindo… ${achados.length} ponto${achados.length === 1 ? "" : "s"} até agora` : achados.length ? `${achados.length} ponto${achados.length === 1 ? "" : "s"} para olhar` : "Nada encontrado"}
            resumo={`Conferido em ${quando(c.iniciada_em)}${c.contas_vistas_na_meta != null ? ` · ${c.contas_vistas_na_meta} contas de anúncios vistas na Meta` : ""}${r ? ` · ${r.verificados} itens conferidos` : ""}`}
          >
            {r && (
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["alta", "media", "baixa"] as Gravidade[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={fGrav === g}
                    onClick={() => setFGrav(fGrav === g ? "todas" : g)}
                    className="rounded-lg border px-3 py-2 text-left"
                    style={{ borderColor: fGrav === g ? COR[g] : "var(--border)", background: "var(--surface)" }}
                  >
                    <div className="text-xl font-bold tabular-nums" style={{ color: r.porGravidade[g] ? COR[g] : "var(--muted)" }}>{r.porGravidade[g]}</div>
                    <div className="text-xs" style={{ color: "var(--ink-2)" }}>Gravidade {ROTULO_GRAVIDADE[g].toLowerCase()}</div>
                  </button>
                ))}
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-1.5 text-xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>
                    <ListChecks size={18} aria-hidden /> {r.verificados}
                  </div>
                  <div className="text-xs" style={{ color: "var(--ink-2)" }}>conferidos · {r.comProblema} com problema</div>
                </div>
              </div>
            )}
            {r && r.etapasComErro.length > 0 && (
              <p className="mb-3 text-xs" style={{ color: "var(--crit)" }}>
                {r.etapasComErro.length === 1 ? "Uma etapa falhou" : `${r.etapasComErro.length} etapas falharam`} ({r.etapasComErro.map((id) => ETAPAS.find((e) => e.id === id)?.nome).join(", ")}): o que ela confere não está nesta lista. Rode de novo.
              </p>
            )}

            <div className="flex flex-wrap gap-2" style={{ marginBottom: 12 }}>
              {(["todas", "alta", "media", "baixa"] as const).map((g) => (
                <button key={g} type="button" onClick={() => setFGrav(g)} className="btn" aria-pressed={fGrav === g} style={{ opacity: fGrav === g ? 1 : 0.6, fontWeight: fGrav === g ? 600 : 400 }}>
                  {g === "todas" ? `Todas (${achados.length})` : `${ROTULO_GRAVIDADE[g]} (${r?.porGravidade[g] ?? 0})`}
                </button>
              ))}
              <select value={fEtapa} onChange={(e) => setFEtapa(e.target.value as EtapaId | "")} aria-label="Etapa" autoComplete="off" className="min-h-[36px] rounded-lg border px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <option value="">Todas as etapas</option>
                {ETAPAS.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>
              {clientes.length > 0 && (
                <select value={fCliente} onChange={(e) => setFCliente(e.target.value)} aria-label="Cliente" autoComplete="off" className="min-h-[36px] rounded-lg border px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                  <option value="">Todos os clientes</option>
                  {clientes.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              )}
            </div>
            {visiveis.length === 0 ? (
              <p className="note" style={{ margin: 0 }}>{achados.length ? "Nenhum ponto nesse filtro." : ocupado ? "Nada encontrado até agora." : "Nada encontrado: tudo o que foi conferido bate."}</p>
            ) : (
              <div className="grid gap-3">
                {visiveis.map((a) => (
                  <CartaoAchado key={a.id} a={a} />
                ))}
              </div>
            )}
            {(c.verificados ?? []).length > 0 && <ListaVerificados itens={c.verificados} />}
          </Painel>
        </div>
      )}
    </div>
  );
}
