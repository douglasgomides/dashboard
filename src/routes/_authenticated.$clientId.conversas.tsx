import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, MessageSquare, ShieldCheck, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import {
  situacaoDa, frasesDa, resumirAtendimento, duracao, ROTULO_SITUACAO, TOM_SITUACAO, ROTULO_SITUACAO_IA,
  type LeituraConversaBanco, type Situacao, type ResumoIA,
} from "@/lib/conversa-leitura";
import { useLeituraConversas } from "@/components/atendimento-resumo";
import { supabase } from "@/integrations/supabase/client";
import { Painel, Selo } from "@/components/visual";

export const Route = createFileRoute("/_authenticated/$clientId/conversas")({
  // ?conversa=<id> abre a conversa direto (link vindo do lead / do CRM).
  validateSearch: (s: Record<string, unknown>): { conversa?: string } => ({ conversa: typeof s.conversa === "string" ? s.conversa : undefined }),
  component: ConversasPage,
});

const COR_SIT: Record<string, string> = { ruim: "var(--crit)", atencao: "var(--warn)", bom: "var(--good)", neutro: "var(--muted)" };
type Filtro = "todas" | "sem_resposta" | "demorou" | "sem_lead";

function Numero({ rotulo, valor, detalhe, cor }: { rotulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className="min-w-0 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="text-xs" style={{ color: "var(--text-dim)" }}>{rotulo}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums" style={{ color: cor ?? "var(--ink)" }}>{valor}</div>
      {detalhe && <div className="mt-0.5 text-xs" style={{ color: "var(--text-dim)" }}>{detalhe}</div>}
    </div>
  );
}

/** Leitura da conversa aberta: fatos (regras fixas) + resumo por IA sob demanda. */
function LeituraDaConversa({ l, conversaId }: { l: LeituraConversaBanco | undefined; conversaId: string }) {
  const qc = useQueryClient();
  const resumo = useQuery({
    queryKey: ["conversa-resumo", conversaId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("conversas_resumos").select("resumo, modelo, ate_msg_em, gerado_em").eq("conversa_id", conversaId).maybeSingle();
      if (error) return null;
      return data as { resumo: ResumoIA; modelo: string; ate_msg_em: string | null; gerado_em: string } | null;
    },
    retry: false,
  });
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  async function gerar() {
    setGerando(true);
    setErro("");
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const resp = await fetch("/api/conversas/resumo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session?.access_token ?? ""}` },
        body: JSON.stringify({ conversa_id: conversaId }),
      });
      const j = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(j?.error ?? `Falha (${resp.status})`);
      await qc.invalidateQueries({ queryKey: ["conversa-resumo", conversaId] });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(false);
    }
  }
  const r = resumo.data?.resumo;
  const desatualizado = !!(resumo.data?.ate_msg_em && l?.ultima_msg_em && l.ultima_msg_em > resumo.data.ate_msg_em);
  const sit = l ? situacaoDa(l) : null;
  return (
    <section className="mb-3 space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2, var(--surface))" }} aria-label="Leitura da conversa">
      {l && sit && (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Leitura da conversa</span>
            <Selo cor={COR_SIT[TOM_SITUACAO[sit]]}>{ROTULO_SITUACAO[sit]}</Selo>
          </div>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm" style={{ color: "var(--ink-2)" }}>
            {frasesDa(l).map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}
      <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={14} aria-hidden /> Resumo por IA</span>
          <button
            type="button"
            onClick={gerar}
            disabled={gerando}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1 text-sm disabled:opacity-50"
            style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--surface)" }}
          >
            {gerando ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}
            {gerando ? "Lendo a conversa…" : r ? (desatualizado ? "Atualizar (tem mensagem nova)" : "Gerar de novo") : "Resumir com IA"}
          </button>
        </div>
        {erro && <p className="mt-1 text-sm" style={{ color: "var(--crit)" }}>{erro}</p>}
        {!r && !gerando && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>
            A IA lê a conversa (telefone, e-mail e CPF mascarados, sem o nome do paciente) e diz o motivo do contato, as objeções, como foi o atendimento e o próximo passo. Fica registrado quem gerou.
          </p>
        )}
        {r && (
          <div className="mt-2 space-y-2 text-sm" style={{ color: "var(--ink-2)" }}>
            {r.alerta && (
              <p className="flex items-start gap-1.5 rounded-md border px-2 py-1.5" style={{ borderColor: "var(--danger-border, var(--crit))", color: "var(--ink)" }}>
                <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--crit)" }} aria-hidden /> {r.alerta}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {r.situacao && <Selo cor="var(--accent)">{ROTULO_SITUACAO_IA[r.situacao] ?? r.situacao}</Selo>}
              {r.atendimento?.nota && (
                <Selo cor={r.atendimento.nota === "bom" ? "var(--good)" : r.atendimento.nota === "ruim" ? "var(--crit)" : "var(--warn)"}>Atendimento {r.atendimento.nota}</Selo>
              )}
              {r.interesse && <Selo>{r.interesse}</Selo>}
            </div>
            {r.motivo && <p><b style={{ color: "var(--ink)" }}>Motivo:</b> {r.motivo}</p>}
            {r.resumo && <p>{r.resumo}</p>}
            {!!r.objecoes?.length && <p><b style={{ color: "var(--ink)" }}>Objeções:</b> {r.objecoes.join("; ")}</p>}
            {!!r.atendimento?.pontos_fortes?.length && <p><b style={{ color: "var(--ink)" }}>Ponto forte:</b> {r.atendimento.pontos_fortes.join("; ")}</p>}
            {!!r.atendimento?.pontos_a_melhorar?.length && <p><b style={{ color: "var(--ink)" }}>A melhorar:</b> {r.atendimento.pontos_a_melhorar.join("; ")}</p>}
            {r.proximo_passo && (
              <p className="rounded-md px-2 py-1.5" style={{ background: "var(--surface)", color: "var(--ink)" }}><b>Próximo passo:</b> {r.proximo_passo}</p>
            )}
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              Gerado em {quando(resumo.data!.gerado_em)}{desatualizado ? " · chegou mensagem depois disso" : ""}. Leitura automática: confira na conversa antes de agir.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

type Conversa = {
  id: string;
  pessoa_nome: string;
  telefone_final: string | null;
  provider: string;
  ultima_msg_em: string | null;
  ultima_msg_texto: string | null;
  total_msgs: number;
  lead_id: string | null;
  codigo_ref: string | null;
};

type Mensagem = {
  id: string;
  direcao: "entrada" | "saida" | "sistema";
  autor: string | null;
  texto: string | null;
  tipo: string | null;
  enviada_em: string;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

function quando(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const ROTULO_TIPO: Record<string, string> = {
  AUDIO: "🎤 áudio",
  IMAGE: "🖼 imagem",
  VIDEO: "🎬 vídeo",
  DOCUMENT: "📎 documento",
  STICKER: "figurinha",
};

function ConversasPage() {
  const { clientId } = Route.useParams();
  const busca = Route.useSearch();
  const [aberta, setAberta] = useState<string | null>(busca.conversa ?? null);
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const leitura = useLeituraConversas(clientId);
  const porId = new Map((leitura.data ?? []).map((l) => [l.conversa_id, l]));
  const geral = leitura.data?.length ? resumirAtendimento(leitura.data) : null;
  const passa = (id: string) => {
    if (filtro === "todas") return true;
    const l = porId.get(id);
    if (!l) return false;
    const s: Situacao = situacaoDa(l);
    if (filtro === "sem_resposta") return s === "sem_resposta" || s === "so_robo";
    if (filtro === "demorou") return s === "demorou";
    return l.msgs_paciente > 0 && !l.lead_etapa && !l.lead_resultado;
  };

  const lista = useQuery({
    queryKey: ["conversas", clientId],
    queryFn: async () => {
      const { data, error } = await rpc("listar_conversas", { p_client: clientId, p_limite: 200, p_offset: 0 });
      if (error) throw new Error(error.message);
      return (data ?? []) as Conversa[];
    },
  });

  const msgs = useQuery({
    queryKey: ["mensagens", aberta],
    enabled: !!aberta,
    queryFn: async () => {
      const { data, error } = await rpc("ler_mensagens", { p_conversa: aberta });
      if (error) throw new Error(error.message);
      return (data ?? []) as Mensagem[];
    },
  });

  const qc = useQueryClient();
  const [puxando, setPuxando] = useState<null | "mais" | "todas">(null);
  const [status, setStatus] = useState<string>("");

  // Cada chamada traz até 150 conversas novas; "todas" repete até não sobrar nenhuma.
  async function puxar(modo: "mais" | "todas") {
    setPuxando(modo);
    setStatus("Buscando…");
    let total = 0;
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      for (let rodada = 1; rodada <= 60; rodada++) {
        const resp = await fetch("/api/sync/manual", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ client_id: clientId, alvo: "conversas", limite: 150 }),
        });
        const j = await resp.json().catch(() => null);
        if (!resp.ok || !j) throw new Error(j?.error ?? `Falha (${resp.status})`);
        total += j.sessoes ?? 0;
        await qc.invalidateQueries({ queryKey: ["conversas", clientId] });
        const falta = j.restantes ?? 0;
        setStatus(falta > 0 ? `${total} conversas trazidas… faltam ${falta}` : `${total} conversas trazidas. Nada mais a buscar.`);
        if (modo === "mais" || falta === 0 || (j.sessoes ?? 0) === 0) break;
      }
    } catch (e) {
      setStatus(`Parou: ${(e as Error).message}. ${total} trazidas até aqui.`);
    } finally {
      setPuxando(null);
    }
  }

  const atual = lista.data?.find((c) => c.id === aberta);

  return (
    <div className="space-y-4">
      <Painel
        icone={MessageSquare}
        titulo="Conversas do WhatsApp"
        resumo="O que o paciente escreveu e o que a clínica respondeu, ligado ao lead e ao link de origem."
        ajuda="Telefone aparece só com os 4 últimos dígitos. Cada abertura de conversa fica registrada (quem, quando)."
      >
        <div className="mb-3 flex items-center gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
          <ShieldCheck size={14} /> Acesso restrito e registrado. Atualiza sozinho todo dia.
        </div>
        {geral && geral.comPaciente > 0 && (
          <section className="mb-4 space-y-3" aria-label="Como está o atendimento">
            <h2 className="text-[15px] font-semibold">Como está o atendimento (últimas {geral.conversas} conversas)</h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Numero rotulo="Paciente sem resposta" valor={`${geral.semResposta}`} detalhe={`${Math.round((geral.semResposta / geral.comPaciente) * 100)}% das conversas${geral.soRobo ? ` · ${geral.soRobo} só com robô` : ""}`} cor={geral.semResposta ? "var(--crit)" : undefined} />
              <Numero rotulo="1ª resposta humana (mediana)" valor={duracao(geral.medianaPrimeiraResposta)} detalhe="sem contar robô/menu" cor={(geral.medianaPrimeiraResposta ?? 0) > 3600 ? "var(--crit)" : undefined} />
              <Numero rotulo="Resposta em horário comercial" valor={duracao(geral.medianaComercial)} detalhe="seg–sex 8h–18h, sáb 8h–12h" />
              <Numero rotulo="Conversas sem lead no CRM" valor={`${geral.semLead}`} detalhe="telefone não bate com nenhum lead" cor={geral.semLead ? "var(--warn)" : undefined} />
            </div>
            {geral.porAtendente.length > 1 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                      <th className="py-1 pr-3 font-medium">Atendente (assinatura)</th>
                      <th className="py-1 pr-3 font-medium">Conversas</th>
                      <th className="py-1 pr-3 font-medium">Resposta típica</th>
                      <th className="py-1 font-medium">Sem resposta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {geral.porAtendente.slice(0, 8).map((a) => (
                      <tr key={a.nome} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-1 pr-3">{a.nome}</td>
                        <td className="py-1 pr-3 tabular-nums">{a.conversas}</td>
                        <td className="py-1 pr-3 tabular-nums">{duracao(a.mediana)}</td>
                        <td className="py-1 tabular-nums">{a.semResposta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              Como se calcula: mensagem automática = texto sem assinatura de atendente que se repete igual em muitas conversas (menu, boas-vindas); não conta como resposta. Espera = da primeira mensagem do paciente até a próxima resposta de uma pessoa (tempo corrido). “Sem resposta” = a última mensagem é do paciente e não é só um “ok/obrigada”. Referência: responder na primeira hora dá ~7x mais chance de qualificar o lead (Harvard Business Review, 2011).
            </p>
          </section>
        )}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            disabled={!!puxando}
            onClick={() => puxar("mais")}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <Download size={14} /> Puxar mais conversas
          </button>
          <button
            disabled={!!puxando}
            onClick={() => puxar("todas")}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50"
            style={{ borderColor: "var(--accent)", background: "var(--surface)" }}
          >
            <Download size={14} /> Puxar todas
          </button>
          {status && <span className="text-xs" style={{ color: "var(--text-dim)" }}>{status}</span>}
        </div>
        {lista.isLoading && <p className="text-sm">Carregando…</p>}
        {lista.error && <p className="text-sm" style={{ color: "var(--danger, #c0392b)" }}>{(lista.error as Error).message}</p>}
        {lista.data && lista.data.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Nenhuma conversa guardada ainda para este cliente. Elas entram a cada sincronização do WhatsApp.
          </p>
        )}
        {!!leitura.data?.length && (
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar conversas">
            {([["todas", "Todas"], ["sem_resposta", "Sem resposta"], ["demorou", "Demorou"], ["sem_lead", "Sem lead no CRM"]] as [Filtro, string][]).map(([f, rot]) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                aria-pressed={filtro === f}
                className="min-h-[36px] rounded-full border px-3 text-sm"
                style={{ borderColor: filtro === f ? "var(--accent)" : "var(--border)", background: filtro === f ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--surface)" }}
              >
                {rot}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <ul className="max-h-[70vh] min-w-0 space-y-1 overflow-y-auto pr-1">
            {lista.data?.filter((c) => c.total_msgs > 0 && passa(c.id)).map((c) => {
              const l = porId.get(c.id);
              const sit = l ? situacaoDa(l) : null;
              return (
              <li key={c.id}>
                <button
                  onClick={() => setAberta(c.id)}
                  className="w-full rounded-lg border p-2.5 text-left"
                  style={{
                    background: c.id === aberta ? "var(--surface-2, var(--surface))" : "var(--surface)",
                    borderColor: c.id === aberta ? "var(--accent)" : "var(--border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.pessoa_nome}</span>
                    <span className="shrink-0 text-xs" style={{ color: "var(--text-faint)" }}>{quando(c.ultima_msg_em)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-dim)" }}>
                    {c.ultima_msg_texto || "(mídia)"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.telefone_final && <Selo>{c.telefone_final}</Selo>}
                    <Selo>{c.total_msgs} msgs</Selo>
                    {c.lead_id && <Selo cor="var(--accent)">lead</Selo>}
                    {c.codigo_ref && <Selo cor="var(--accent)" titulo="Veio de um link rastreado">via link</Selo>}
                    {sit && sit !== "ok" && sit !== "sem_dado" && (
                      <Selo cor={COR_SIT[TOM_SITUACAO[sit]]}>
                        {sit === "demorou" ? `1ª resposta ${duracao(l!.primeira_resposta_seg)}` : `${ROTULO_SITUACAO[sit]} · ${duracao(l!.aguardando_seg)}`}
                      </Selo>
                    )}
                  </div>
                </button>
              </li>
              );
            })}
          </ul>

          <div className="min-w-0 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            {!aberta && <p className="text-sm" style={{ color: "var(--text-dim)" }}>Escolha uma conversa à esquerda.</p>}
            {aberta && (
              <>
                <div className="mb-2 text-sm font-semibold">{atual?.pessoa_nome ?? "Conversa"}</div>
                <LeituraDaConversa l={porId.get(aberta)} conversaId={aberta} />
                {msgs.isLoading && <p className="text-sm">Abrindo…</p>}
                {msgs.error && <p className="text-sm">{(msgs.error as Error).message}</p>}
                <div className="flex max-h-[62vh] flex-col gap-1.5 overflow-y-auto">
                  {msgs.data?.map((m) => {
                    const paciente = m.direcao === "entrada";
                    const corpo = m.texto || ROTULO_TIPO[m.tipo ?? ""] || m.tipo || "";
                    return (
                      <div key={m.id} className={`flex ${paciente ? "justify-start" : "justify-end"}`}>
                        <div
                          className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-1.5 text-sm"
                          style={{
                            background: paciente ? "var(--muted, #eee)" : "var(--accent)",
                            color: paciente ? "var(--text)" : "var(--accent-fg, #fff)",
                          }}
                        >
                          {corpo}
                          <div className="mt-0.5 text-[10px] opacity-70">
                            {paciente ? "Paciente" : m.autor || "Clínica"} · {quando(m.enviada_em)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </Painel>
    </div>
  );
}
