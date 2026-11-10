import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, Clock, ListChecks, Loader2, RefreshCw, Unplug, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { marcarNaoUsa } from "@/lib/saude-fontes";
import { ConferenciaAoVivoResumo } from "@/components/conferencia-ao-vivo-resumo";
import { UsoDasTelas } from "@/components/uso-das-telas";
import {
  ETAPAS,
  ROTULO_GRAVIDADE,
  ROTULO_VERIFICADO,
  estadoDaEtapa,
  filtrarAchados,
  ordenarAchados,
  resumirConferencia,
  separarAchados,
  NOME_FONTE_OBRIG,
  type FonteObrigatoria,
  type LinhaSemFonte,
  type Achado,
  type Conferencia,
  type EtapaId,
  type Gravidade,
  type RegistroEtapa,
  type Verificado,
} from "@/lib/conferencia";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";
import { NxAlertaCurto, NxComoCalcula, NxNota, NxTopo } from "@/components/nx/anuncios-graficos";
import { AdmChip, AdmContador, AdmContadores, type AdmTom } from "@/components/nx/admin-base";

export const Route = createFileRoute("/_authenticated/admin/conferencia")({
  component: ConferenciaPage,
});

const TOM: Record<Gravidade, AdmTom> = { alta: "critico", media: "atencao", baixa: "neutro" };

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
  if (estado === "rodando") return <Loader2 className="animate-spin" aria-hidden style={{ color: "var(--b1)" }} />;
  if (estado === "ok") return <CheckCircle2 aria-hidden style={{ color: "var(--good)" }} />;
  if (estado === "erro") return <XCircle aria-hidden style={{ color: "var(--crit)" }} />;
  return <Circle aria-hidden style={{ color: "var(--muted)" }} />;
}

function Etapas({ registros, rodando }: { registros: RegistroEtapa[]; rodando: EtapaId | null }) {
  return (
    <ol className="adm-etapas" aria-label="Etapas da conferência">
      {ETAPAS.map((e, i) => {
        const estado = estadoDaEtapa(e.id, registros, rodando);
        const r = registros.find((x) => x.etapa === e.id);
        return (
          <li key={e.id} className={`adm-etapa${estado === "rodando" ? " adm-etapa--rodando" : ""}`} title={e.oQue}>
            <span className="adm-etapa__nome">
              <IconeEtapa estado={estado} /> {i + 1}. {e.nome}
            </span>
            <span className="adm-etapa__nums">
              {estado === "rodando" ? (
                "Conferindo…"
              ) : estado === "pendente" ? (
                "Na fila"
              ) : estado === "erro" ? (
                <span style={{ color: "var(--crit)" }}>Falhou: {r?.erro ?? "erro"}</span>
              ) : (
                <>
                  <b>{r?.verificados ?? 0}</b> conferidos · <b>{r?.achados ?? 0}</b> {r?.achados === 1 ? "ponto" : "pontos"}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function CartaoAchado({ a, i }: { a: Achado; i: number }) {
  const etapa = ETAPAS.find((e) => e.id === a.etapa);
  return (
    <li className={`adm-item${a.gravidade === "alta" ? " adm-item--critico" : a.gravidade === "media" ? " adm-item--atencao" : ""}`} style={{ "--i": Math.min(i, 12) } as CSSProperties}>
      <div className="adm-item__corpo">
        <div className="adm-chips">
          <AdmChip tom={TOM[a.gravidade]} titulo={`Gravidade ${ROTULO_GRAVIDADE[a.gravidade].toLowerCase()}`}>{ROTULO_GRAVIDADE[a.gravidade]}</AdmChip>
          {etapa && <AdmChip tom="neutro" semIcone>{etapa.nome}</AdmChip>}
          {a.cliente && <AdmChip tom="marca" semIcone>{a.cliente}</AdmChip>}
        </div>
        <p className="adm-item__titulo">{a.titulo}</p>
        <dl className="grid gap-1" style={{ margin: 0 }}>
          <div className="adm-item__sub">
            <dt className="sr-only">O que aconteceu: </dt>
            <dd style={{ margin: 0 }}>{a.detalhe}</dd>
          </div>
          <div className="adm-item__passo">
            <ArrowRight aria-hidden />
            <span>
              <dt style={{ display: "inline" }}><b>O que fazer: </b></dt>
              <dd style={{ display: "inline", margin: 0 }}>{a.acao}</dd>
            </span>
          </div>
          {a.risco && (
            <div className="adm-item__mais">
              <dt style={{ display: "inline" }}><b>Risco: </b></dt>
              <dd style={{ display: "inline", margin: 0 }}>{a.risco}</dd>
            </div>
          )}
        </dl>
      </div>
    </li>
  );
}

// "Fonte não ligada": todos os clientes numa tabela só (cliente × fontes faltando), com "É intencional" por fonte.
function TabelaSemFonte({ linhas, onMarcar, marcando }: { linhas: LinhaSemFonte[]; onMarcar: (clientId: string, f: FonteObrigatoria) => void; marcando: string | null }) {
  const fontes: FonteObrigatoria[] = ["instagram", "anuncios", "crm"];
  return (
    <div>
      <p className="adm-grupo-titulo">
        Fonte não ligada · {linhas.length} cliente{linhas.length === 1 ? "" : "s"}
        <small>Pode ser intencional (cliente que não anuncia, CRM que não temos acesso). Marque e o ponto some daqui; no admin a fonte vira “não usa”.</small>
      </p>
      <div className="adm-rolagem">
        <table className="adm-tabela">
          <thead>
            <tr>
              <th>Cliente</th>
              {fontes.map((f) => (
                <th key={f}>{NOME_FONTE_OBRIG[f]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.achado.id}>
                <td>
                  <b style={{ fontWeight: 700 }}>{l.cliente}</b>
                  {l.achado.gravidade !== "baixa" && (
                    <div className="mt-1">
                      <AdmChip tom={TOM[l.achado.gravidade]}>Prioridade {ROTULO_GRAVIDADE[l.achado.gravidade].toLowerCase()}</AdmChip>
                    </div>
                  )}
                </td>
                {fontes.map((f) => (
                  <td key={f}>
                    {l.faltando.includes(f) ? (
                      <div className="grid justify-items-start gap-1">
                        <AdmChip tom={f === "instagram" ? "critico" : "atencao"}>Falta</AdmChip>
                        {l.clientId && (
                          <button type="button" className="adm-btn adm-btn--mini" disabled={marcando === `${l.clientId}:${f}`} onClick={() => onMarcar(l.clientId!, f)}>
                            É intencional, não mostrar mais
                          </button>
                        )}
                      </div>
                    ) : (
                      <AdmChip tom="ok">ok</AdmChip>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ListaVerificados({ itens }: { itens: Verificado[] }) {
  const [soProblema, setSoProblema] = useState(false);
  const vis = itens.filter((v) => !soProblema || !v.ok).sort((a, b) => Number(a.ok) - Number(b.ok));
  return (
    <details className="adm-det">
      <summary>
        O que foi conferido ({itens.length}, {itens.filter((v) => !v.ok).length} com problema)
      </summary>
      <div className="adm-det__corpo">
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-2)", fontWeight: 600 }}>
          <input type="checkbox" checked={soProblema} onChange={(e) => setSoProblema(e.target.checked)} /> Mostrar só o que tem problema
        </label>
        <div className="adm-rolagem">
          <table className="adm-tabela empilha">
            <thead>
              <tr>
                <th>Situação</th>
                <th>O quê</th>
                <th>Cliente</th>
                <th>Etapa</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {vis.map((v, i) => (
                <tr key={`${v.etapa}:${v.nome}:${i}`}>
                  <td data-label="Situação">{v.ok ? <AdmChip tom="ok">OK</AdmChip> : <AdmChip tom="atencao">Olhar</AdmChip>}</td>
                  <td data-label="O quê">
                    <span className="text-xs" style={{ color: "var(--muted)" }}>{ROTULO_VERIFICADO[v.tipo]}</span>
                    <div>{v.nome}</div>
                  </td>
                  <td data-label="Cliente">{v.cliente ?? "—"}</td>
                  <td data-label="Etapa">{ETAPAS.find((e) => e.id === v.etapa)?.nome}</td>
                  <td data-label="Nota" style={{ color: "var(--ink-2)" }}>{v.nota}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

// Abas (Phase 2): a conferência dos dados continua sendo a aba aberta por padrão; "Uso das telas" mostra o log por rota.
function ConferenciaPage() {
  const [aba, setAba] = useState<"dados" | "uso">("dados");
  return (
    <div className="adm adm-conferencia">
      <div className="adm-abas" role="tablist" aria-label="Conferência">
        <button type="button" role="tab" className="adm-pilula" aria-selected={aba === "dados"} aria-pressed={aba === "dados"} onClick={() => setAba("dados")}>Conferência dos dados</button>
        <button type="button" role="tab" className="adm-pilula" aria-selected={aba === "uso"} aria-pressed={aba === "uso"} onClick={() => setAba("uso")}>Uso das telas</button>
      </div>
      <div role="tabpanel" className="adm">{aba === "dados" ? <ConferenciaDados /> : <UsoDasTelas />}</div>
    </div>
  );
}

function ConferenciaDados() {
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
          reg = { etapa: e.id, status: "erro", erro: mensagemDeErroAcao(x) };
        }
        atual = { ...atual, etapas: [...atual.etapas, reg], achados: [...atual.achados, ...novos], verificados: [...atual.verificados, ...novosV] };
        setViva(atual);
      }
      setRodando(null);
      await chamar({ etapa: "fim", conferencia_id: atual.id }).catch(() => null);
      setViva({ ...atual, concluida_em: new Date().toISOString() });
      qc.invalidateQueries({ queryKey: ["conferencia-ultima"] });
    } catch (x) {
      setErro(mensagemDeErroAcao(x));
    } finally {
      setRodando(null);
      setOcupado(false);
    }
  }

  // Fontes marcadas como "não usa" e ids dos clientes (conferências antigas só guardavam o nome).
  const naoUsaQ = useQuery({
    queryKey: ["fontes-nao-usadas"],
    queryFn: async () => {
      const [{ data: nu }, { data: cs }] = await Promise.all([
        (supabase as any).from("fontes_nao_usadas").select("client_id, fonte"),
        supabase.from("clients").select("id, name").eq("eh_teste", false),
      ]);
      return {
        naoUsa: new Set<string>(((nu ?? []) as { client_id: string; fonte: string }[]).map((r) => `${r.client_id}:${r.fonte}`)),
        idPorNome: new Map<string, string>((cs ?? []).map((x) => [x.name, x.id])),
      };
    },
    staleTime: 60_000,
  });
  const [marcando, setMarcando] = useState<string | null>(null);
  async function marcar(clientId: string, f: FonteObrigatoria) {
    setMarcando(`${clientId}:${f}`);
    try {
      await marcarNaoUsa(clientId, f, true);
      await qc.invalidateQueries({ queryKey: ["fontes-nao-usadas"] });
      qc.invalidateQueries({ queryKey: ["status-das-fontes"] });
    } catch (x) {
      setErro(mensagemDeErroAcao(x));
    } finally {
      setMarcando(null);
    }
  }

  const achados = useMemo(() => ordenarAchados(c?.achados ?? []), [c]);
  const visiveis = filtrarAchados(achados, { gravidade: fGrav === "todas" ? undefined : fGrav, etapa: fEtapa || undefined, cliente: fCliente || undefined });
  const grupos = separarAchados(visiveis, naoUsaQ.data?.naoUsa ?? new Set(), naoUsaQ.data?.idPorNome);
  const r = c ? resumirConferencia(c) : null;
  const clientes = [...new Set(achados.map((a) => a.cliente).filter(Boolean) as string[])].sort();
  const incompleta = c && !c.concluida_em && !ocupado;

  const parados = achados.filter((a) => a.etapa === "parados").length;
  const okConferidos = r ? r.verificados - r.comProblema : 0;
  const filtroGrav = (g: Gravidade) => setFGrav(fGrav === g ? "todas" : g);

  return (
    <>
      <NxTopo
        pergunta="Os números do painel batem com a origem? O que está ok, o que tem problema e o que está parado."
        meta={
          ocupado ? (
            <AdmChip tom="marca" semIcone>Rodando etapa por etapa. Leva de alguns segundos a um minuto.</AdmChip>
          ) : c ? (
            <AdmChip tom={incompleta ? "atencao" : "neutro"} semIcone={!incompleta}>
              {viva ? "Conferência de agora" : "Última conferência salva"}: {quando(c.iniciada_em)}
              {incompleta ? " (interrompida antes do fim)" : ""}
            </AdmChip>
          ) : null
        }
        acao={
          <button type="button" className="adm-btn adm-btn--pri" onClick={rodar} disabled={ocupado}>
            {ocupado ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            {c ? "Conferir de novo" : "Rodar conferência"}
          </button>
        }
      />
      <NxComoCalcula titulo="Como a conferência funciona">
        <p>
          Auditoria da operação: procura o que a Meta mostra e o dashboard não (conta de anúncios com gasto e sem cliente), a mesma conta em dois
          clientes, gasto do painel que não bate com a Meta, sync que diz "sucesso" com o dado parado e cliente sem fonte obrigatória ligada.
        </p>
        <p>
          <b>Só leitura:</b> não muda nada nas contas.
        </p>
        <ul className="grid gap-1" style={{ margin: 0, paddingLeft: 18 }}>
          {ETAPAS.map((e) => (
            <li key={e.id}>
              <b>{e.nome}:</b> {e.oQue}
            </li>
          ))}
        </ul>
      </NxComoCalcula>

      {erro && <NxAlertaCurto titulo={erro} />}

      {salva.isLoading && !viva && <div className="h-24 animate-pulse rounded-xl" style={{ background: "var(--surface-2)" }} aria-busy="true" />}

      {!salva.isLoading && !c && !ocupado && <p className="adm-vazio adm-lista-card">Nenhuma conferência salva ainda. Rode a primeira para ver o retrato da operação.</p>}

      {c && r && (
        <AdmContadores rotulo="Resumo da conferência">
          <AdmContador i={0} icone={<ListChecks />} rotulo="Conferidos e ok" valor={okConferidos} nota={`de ${r.verificados} itens · ${r.comProblema} com problema`} tom={r.verificados ? "ok" : "neutro"} />
          <AdmContador i={1} icone={<AlertTriangle />} rotulo="Gravidade alta" valor={r.porGravidade.alta} nota="Resolver primeiro" tom={r.porGravidade.alta ? "critico" : "ok"} onClick={() => filtroGrav("alta")} ativo={fGrav === "alta"} />
          <AdmContador i={2} icone={<AlertTriangle />} rotulo="Gravidade média" valor={r.porGravidade.media} nota="Olhar nesta semana" tom={r.porGravidade.media ? "atencao" : "ok"} onClick={() => filtroGrav("media")} ativo={fGrav === "media"} />
          <AdmContador i={3} icone={<Circle />} rotulo="Gravidade baixa" valor={r.porGravidade.baixa} nota="Quando der" tom="neutro" onClick={() => filtroGrav("baixa")} ativo={fGrav === "baixa"} />
          <AdmContador i={4} icone={<Clock />} rotulo="Dado parado" valor={parados} nota="Sync diz sucesso, mas sem dado novo" tom={parados ? "atencao" : "ok"} />
          <AdmContador i={5} icone={<Unplug />} rotulo="Etapas que falharam" valor={r.etapasComErro.length} nota={r.etapasComErro.length ? "Rode de novo" : "Todas rodaram"} tom={r.etapasComErro.length ? "critico" : "ok"} />
        </AdmContadores>
      )}

      {c && (
        <>
          <Etapas registros={c.etapas ?? []} rodando={rodando} />
          {r && r.etapasComErro.length > 0 && (
            <NxNota icone={<AlertTriangle size={14} />}>
              {r.etapasComErro.length === 1 ? "Uma etapa falhou" : `${r.etapasComErro.length} etapas falharam`} ({r.etapasComErro.map((id) => ETAPAS.find((e) => e.id === id)?.nome).join(", ")}): o que ela confere não está nesta lista. Rode de novo.
            </NxNota>
          )}

          <section className="adm-lista-card" aria-labelledby="conf-pontos">
            <header className="adm-secao__head" style={{ paddingBottom: 12 }}>
              <span className="nx-tile" aria-hidden>
                <ListChecks />
              </span>
              <div className="adm-secao__texto">
                <h2 id="conf-pontos">
                  {ocupado ? `Conferindo… ${achados.length} ponto${achados.length === 1 ? "" : "s"} até agora` : achados.length ? `${achados.length} ponto${achados.length === 1 ? "" : "s"} para olhar` : "Nada encontrado"}
                </h2>
                <p>{`Conferido em ${quando(c.iniciada_em)}${c.contas_vistas_na_meta != null ? ` · ${c.contas_vistas_na_meta} contas de anúncios vistas na Meta` : ""}${r ? ` · ${r.verificados} itens conferidos` : ""}`}</p>
              </div>
            </header>
            <div className="adm-filtros adm-filtros--plano">
              <div className="adm-pilulas" role="group" aria-label="Gravidade">
                {(["todas", "alta", "media", "baixa"] as const).map((g) => (
                  <button key={g} type="button" onClick={() => setFGrav(g)} className="adm-pilula" aria-pressed={fGrav === g}>
                    {g === "todas" ? "Todas" : ROTULO_GRAVIDADE[g]} <small>{g === "todas" ? achados.length : (r?.porGravidade[g] ?? 0)}</small>
                  </button>
                ))}
              </div>
              <select value={fEtapa} onChange={(e) => setFEtapa(e.target.value as EtapaId | "")} aria-label="Etapa" autoComplete="off" className="adm-select">
                <option value="">Todas as etapas</option>
                {ETAPAS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
              {clientes.length > 0 && (
                <select value={fCliente} onChange={(e) => setFCliente(e.target.value)} aria-label="Cliente" autoComplete="off" className="adm-select">
                  <option value="">Todos os clientes</option>
                  {clientes.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {visiveis.length === 0 ? (
              <p className="adm-vazio adm-borda-topo">{achados.length ? "Nenhum ponto nesse filtro." : ocupado ? "Nada encontrado até agora." : "Nada encontrado: tudo o que foi conferido bate."}</p>
            ) : (
              <div className="adm-borda-topo">
                {grupos.destaque.length > 0 && (
                  <>
                    <p className="adm-grupo-titulo">Prioridade alta e média · {grupos.destaque.length}</p>
                    <ul className="adm-itens">
                      {grupos.destaque.map((a, i) => (
                        <CartaoAchado key={a.id} a={a} i={i} />
                      ))}
                    </ul>
                  </>
                )}
                {grupos.semFonte.length > 0 && <TabelaSemFonte linhas={grupos.semFonte} onMarcar={marcar} marcando={marcando} />}
                {grupos.demais.length > 0 && (
                  <>
                    <p className="adm-grupo-titulo">Prioridade baixa · {grupos.demais.length}</p>
                    <ul className="adm-itens">
                      {grupos.demais.map((a, i) => (
                        <CartaoAchado key={a.id} a={a} i={i} />
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </section>
          {(c.verificados ?? []).length > 0 && <ListaVerificados itens={c.verificados} />}
        </>
      )}

      <ConferenciaAoVivoResumo />
    </>
  );
}
