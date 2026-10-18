import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CalendarPlus, ChevronDown, Megaphone, ShieldAlert, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getAcompanhamentos, getAdsDiagnosticoPorObjetivo, getClient, getPostsForAnalytics, salvarAcompanhamento } from "@/lib/client-data";
import { useLeituraConversas } from "@/components/atendimento-resumo";
import { usePautas } from "@/components/planejador-conteudo";
import { useClientRole } from "@/hooks/use-client-role";
import { BotaoCopiar } from "@/components/botao-copiar";
import { EstrategiasIA } from "@/components/estrategias-ia";
import { Carregando, ResumoExecutivo } from "@/components/sem-fonte";
import { resumirAtendimento } from "@/lib/conversa-leitura";
import { datasDoMes, potencial, sugerirCampanhas, NOME_MES, type BaseCampanhas, type Campanha } from "@/lib/campanhas";
import { formatoDe } from "@/lib/pauta";
import type { Acompanhamento, Status } from "@/lib/oportunidades";

export const Route = createFileRoute("/_authenticated/$clientId/campanhas")({
  component: CampanhasPage,
});

// Status da campanha, guardado em acoes_acompanhamento com id "camp:AAAA-MM:<id>".
type StatusCamp = "sugerida" | "aprovada" | "em_execucao" | "medida" | "dispensada";
const PARA_BANCO: Record<StatusCamp, Status> = { sugerida: "nova", aprovada: "em_analise", em_execucao: "em_execucao", medida: "resultado_avaliado", dispensada: "dispensada" } as Record<StatusCamp, Status>;
const DO_BANCO = (s?: string | null): StatusCamp => (s === "em_analise" ? "aprovada" : s === "em_execucao" ? "em_execucao" : s === "resultado_avaliado" || s === "concluida" ? "medida" : s === "dispensada" ? "dispensada" : "sugerida");
const ROTULO_STATUS: Record<StatusCamp, string> = { sugerida: "Sugerida", aprovada: "Aprovada", em_execucao: "Em execução", medida: "Medida", dispensada: "Dispensada" };
const COR_TIPO: Record<Campanha["tipo"], string> = { atendimento: "var(--crit)", ativacao: "var(--warn)", reativacao: "var(--warn)", retorno: "var(--accent)", conteudo: "var(--s1, var(--accent))", anuncio: "var(--accent)" };
const ROTULO_TIPO: Record<Campanha["tipo"], string> = { atendimento: "Atendimento", ativacao: "Ativação de leads", reativacao: "Reativação de leads", retorno: "Retorno de pacientes", conteudo: "Conteúdo da data", anuncio: "Anúncio" };

const n = (x: number) => Math.round(x).toLocaleString("pt-BR");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const isoMenos = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

async function lerBase(clientId: string): Promise<BaseCampanhas | null> {
  const { data, error } = await (supabase as any).rpc("campanhas_base", { p_client_id: clientId });
  if (error) return null;
  const j = Array.isArray(data) ? data[0] : data;
  if (!j) return null;
  const num = (k: string) => Number(j[k] ?? 0);
  return { tem_crm: !!j.tem_crm, abertos: num("abertos"), parados_90d: num("parados_90d"), parados_30_90d: num("parados_30_90d"), novos_parados_14d: num("novos_parados_14d"), ganhos_ha_um_ano: num("ganhos_ha_um_ano"), perdidos_180d: num("perdidos_180d"), leads_90d: num("leads_90d"), agendados_90d: num("agendados_90d"), ganhos_90d: num("ganhos_90d") };
}

function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

function CartaoCampanha({ c, status, podeEditar, onStatus, onPauta, salvando, pautaCriada }: { c: Campanha; status: StatusCamp; podeEditar: boolean; onStatus: (s: StatusCamp) => void; onPauta?: () => void; salvando: boolean; pautaCriada: boolean }) {
  const [aberto, setAberto] = useState(false);
  const p = c.projecao;
  return (
    <article className="flex flex-col rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)", borderLeft: `3px solid ${COR_TIPO[c.tipo]}`, opacity: status === "dispensada" ? 0.6 : 1 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: COR_TIPO[c.tipo] }}>{ROTULO_TIPO[c.tipo]}</span>
        {podeEditar ? (
          <select aria-label="Status da campanha" value={status} disabled={salvando} onChange={(e) => onStatus(e.target.value as StatusCamp)} autoComplete="off" className="min-h-[32px] rounded-md border px-1.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            {(Object.keys(ROTULO_STATUS) as StatusCamp[]).map((s) => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
          </select>
        ) : (
          <span className="text-xs" style={{ color: "var(--muted)" }}>{ROTULO_STATUS[status]}</span>
        )}
      </div>
      <h3 className="mt-1 text-[15px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>{c.titulo}</h3>
      <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>{c.porque}</p>

      {c.faltaDado ? (
        <p className="mt-2 rounded-md p-2 text-xs" style={{ background: "var(--surface-2)", color: "var(--ink-2)" }}><b>Falta dado:</b> {c.faltaDado}</p>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Público", p.publico != null ? n(p.publico) : "—"],
            ["Respostas", p.resposta ? n(p.resposta.n) : "—"],
            ["Consultas (estimativa)", p.consultas != null ? n(p.consultas) : "—"],
            ["Investimento", p.custo != null ? brl(p.custo) : "sem custo de mídia"],
          ].map(([r, v]) => (
            <div key={r} className="rounded-md p-2" style={{ background: "var(--surface-2)" }}>
              <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{v}</div>
              <div className="text-[11px]" style={{ color: "var(--muted)" }}>{r}</div>
            </div>
          ))}
        </div>
      )}
      {!c.faltaDado && p.regua && <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>Projeção: {p.regua}</p>}
      {c.data?.cuidado && (
        <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: "var(--warn-text, var(--ink-2))" }}><ShieldAlert size={13} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} /> {c.data.cuidado}</p>
      )}

      {!c.faltaDado && (
        <>
          <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="mt-2 inline-flex min-h-[36px] items-center gap-1 self-start text-xs font-semibold" style={{ color: "var(--accent)" }}>
            <ChevronDown size={14} aria-hidden style={{ transform: aberto ? "rotate(180deg)" : undefined }} /> {aberto ? "Fechar" : "Como fazer"}{c.mensagem ? " e mensagem pronta" : ""}
          </button>
          {aberto && (
            <div className="mt-1 space-y-2 text-sm">
              <ol className="list-decimal space-y-1 pl-5 leading-relaxed" style={{ color: "var(--ink)" }}>{c.passos.map((s) => <li key={s}>{s}</li>)}</ol>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Canal: {c.canal} · Quem faz: {c.responsavel}</p>
              {c.mensagem && (
                <div className="rounded-lg p-3" style={{ background: "var(--surface-2)" }}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Mensagem pronta (troque o que está entre colchetes)</div>
                  <p className="mt-1 italic leading-relaxed">{c.mensagem}</p>
                  <div className="mt-2"><BotaoCopiar texto={c.mensagem} rotulo="Copiar mensagem" /></div>
                </div>
              )}
            </div>
          )}
          {onPauta && podeEditar && (
            <button type="button" className="btn mt-2 inline-flex items-center gap-1.5 self-start" disabled={pautaCriada} onClick={onPauta}>
              <CalendarPlus size={14} aria-hidden /> {pautaCriada ? "Já está no planejador" : "Adicionar ao planejador de conteúdo"}
            </button>
          )}
        </>
      )}
    </article>
  );
}

function CampanhasPage() {
  const { clientId } = Route.useParams();
  const qc = useQueryClient();
  const { podeEditar } = useClientRole(clientId);
  const agora = new Date(Date.now() - 3 * 3600_000);
  const [offset, setOffset] = useState<0 | 1>(0);
  const mes = ((agora.getUTCMonth() + offset) % 12) + 1;
  const ano = agora.getUTCFullYear() + (agora.getUTCMonth() + offset > 11 ? 1 : 0);
  const chaveMes = `${ano}-${String(mes).padStart(2, "0")}`;

  const client = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId) });
  const base = useQuery({ queryKey: ["campanhas-base", clientId], queryFn: () => lerBase(clientId), staleTime: 10 * 60_000, retry: false });
  const leitura = useLeituraConversas(clientId);
  const posts = useQuery({ queryKey: ["campanhas-posts", clientId], queryFn: () => getPostsForAnalytics(clientId, isoMenos(90), isoMenos(0) + "T23:59:59"), staleTime: 10 * 60_000, retry: false });
  const ads = useQuery({ queryKey: ["campanhas-ads", clientId], queryFn: () => getAdsDiagnosticoPorObjetivo(clientId, isoMenos(30), isoMenos(0)), staleTime: 10 * 60_000, retry: false });
  const acomp = useQuery({ queryKey: ["acompanhamentos", clientId], queryFn: () => getAcompanhamentos(clientId) });
  const pautas = usePautas(clientId);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const temaForte = useMemo(() => {
    const ps = ((posts.data ?? []) as any[]).filter((p) => Number(p.reach) > 0);
    if (ps.length < 5) return null;
    const porTema = new Map<string, any[]>();
    for (const p of ps) if (p.tema) porTema.set(p.tema, [...(porTema.get(p.tema) ?? []), p]);
    const tema = [...porTema.entries()].filter(([, xs]) => xs.length >= 2).map(([t, xs]) => ({ t, v: mediana(xs.map((p) => Number(p.saved ?? 0) / Number(p.reach))) })).sort((a, b) => b.v - a.v)[0];
    const porFormato = new Map<string, any[]>();
    for (const p of ps) porFormato.set(p.format ?? "outro", [...(porFormato.get(p.format ?? "outro") ?? []), p]);
    const fmt = [...porFormato.entries()].filter(([, xs]) => xs.length >= 3).map(([f, xs]) => ({ f, salv: mediana(xs.map((p) => Number(p.saved ?? 0))), alc: mediana(xs.map((p) => Number(p.reach))) })).sort((a, b) => b.salv - a.salv)[0];
    if (!fmt) return null;
    const rot: Record<string, string> = { reels: "Reels", carrossel: "carrossel", estatico: "post estático" };
    return { tema: tema?.t ?? "o tema mais salvo", formato: rot[fmt.f] ?? fmt.f, alcanceMediano: fmt.alc, salvamentoMediano: fmt.salv };
  }, [posts.data]);

  const adsResumo = useMemo(() => {
    const d = ads.data;
    if (!d || !d.campanhas.length) return null;
    const melhor = d.campanhas.filter((c) => c.vereditoOficial === "Escalar" || c.vereditoOficial === "Manter").sort((a, b) => b.conversas - a.conversas)[0];
    return { custoPorConversa: d.custoPorConversaMensagem, gastoDiaMedio: d.gasto / 30, melhorCampanha: melhor?.campanha ?? null };
  }, [ads.data]);

  const campanhas = useMemo(() => {
    if (!client.data) return [];
    return sugerirCampanhas({
      mes,
      ano,
      especialidade: client.data.specialty ?? null,
      nomeMedico: client.data.name,
      base: base.data ?? null,
      semResposta: leitura.data ? resumirAtendimento(leitura.data).semResposta : undefined,
      temaForte,
      ads: adsResumo,
    });
  }, [client.data, mes, ano, base.data, leitura.data, temaForte, adsResumo]);

  const statusDe = (id: string): StatusCamp => DO_BANCO(acomp.data?.itens.find((x) => x.insightId === `camp:${chaveMes}:${id}`)?.status);
  async function mudarStatus(c: Campanha, s: StatusCamp) {
    setSalvando(c.id);
    setErro(null);
    const chave = `camp:${chaveMes}:${c.id}`;
    const atual = acomp.data?.itens.find((x) => x.insightId === chave);
    const quando = new Date().toISOString();
    const novo: Acompanhamento = {
      clientId,
      insightId: chave,
      titulo: `${c.titulo} (${NOME_MES[mes - 1]})`,
      status: PARA_BANCO[s],
      responsavel: c.tipo === "conteudo" ? "social_media" : c.tipo === "anuncio" ? "gestor_trafego" : "atendimento",
      prazo: atual?.prazo ?? null,
      checklist: atual?.checklist ?? c.passos.map((t) => ({ texto: t, feito: false })),
      historico: [...(atual?.historico ?? []), { em: quando, por: null, de: (atual?.status ?? null) as any, para: PARA_BANCO[s] }],
      feedback: atual?.feedback ?? null,
      resultado: atual?.resultado ?? null,
      criadoEm: atual?.criadoEm ?? quando,
      atualizadoEm: quando,
    };
    try {
      await salvarAcompanhamento(novo);
      await qc.invalidateQueries({ queryKey: ["acompanhamentos", clientId] });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  }

  function paraPlanejador(c: Campanha) {
    pautas.criar.mutate({
      client_id: clientId,
      ideia_id: `camp:${chaveMes}:${c.id}`,
      titulo: c.titulo,
      formato: formatoDe(temaForte?.formato ?? "reels"),
      objetivo: "salvamento",
      status: "escolhida",
      motivo: c.porque,
      origem_tipo: "dado",
      origem_texto: c.data ? `${c.data.nome}: ${c.data.angulo}` : null,
      gancho: null,
      roteiro: c.passos,
      cta: "Ficou com dúvida? Fale com a equipe no WhatsApp.",
      aviso: c.data?.cuidado ?? null,
      dia: null,
      post_id: null,
    });
  }

  const carregando = client.isLoading || base.isLoading;
  const datas = client.data ? datasDoMes(mes, client.data.specialty) : [];
  const pot = potencial(campanhas.filter((c) => statusDe(c.id) !== "dispensada"));
  const pautasIds = new Set((pautas.q.data?.pautas ?? []).map((p) => p.ideia_id));

  return (
    <div className="space-y-4">
      <div className="hpagehead">
        <h2>Campanhas de {NOME_MES[mes - 1]}</h2>
        <p>Planeje como atrair, atender e converter com ações digitais e presenciais conectadas. Revise os planos estratégicos e use os sinais do CRM, WhatsApp, Instagram e anúncios para escolher as ações do mês. A equipe confirma responsáveis, recursos e execução.</p>
        <div role="tablist" aria-label="Mês" className="mt-2 inline-grid grid-cols-2 gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
          {([0, 1] as const).map((o) => {
            const m = ((agora.getUTCMonth() + o) % 12) + 1;
            return (
              <button key={o} type="button" role="tab" aria-selected={offset === o} onClick={() => setOffset(o)} className="min-h-[38px] rounded-md px-4 text-sm font-semibold" style={offset === o ? { background: "var(--surface)", color: "var(--ink)" } : { color: "var(--text-dim)" }}>
                {o === 0 ? `Este mês (${NOME_MES[m - 1]})` : `Próximo (${NOME_MES[m - 1]})`}
              </button>
            );
          })}
        </div>
      </div>

      {carregando ? (
        <Carregando texto="Montando as campanhas do mês…" />
      ) : (
        <>
          <ResumoExecutivo
            frases={[
              `${campanhas.filter((c) => !c.faltaDado).length} ações táticas sugeridas para ${NOME_MES[mes - 1]}${datas.length ? `, com ${datas.length} data${datas.length === 1 ? "" : "s"} da especialidade` : ""}.`,
              pot.respostas > 0 ? `Potencial estimado: ${n(pot.respostas)} respostas ou conversas e cerca de ${n(pot.consultas)} consultas${pot.custo ? `, com ${brl(pot.custo)} em anúncio` : ""}.` : "",
              base.data?.tem_crm ? (base.data.parados_90d > 0 ? `O CRM tem ${n(base.data.parados_90d)} leads parados há mais de 90 dias: é a base mais barata para trabalhar.` : "") : "Sem CRM ligado: as campanhas de reativação e retorno precisam dele.",
            ]}
          />

          <EstrategiasIA clientId={clientId} podeEditar={podeEditar} />

          <section aria-labelledby="camp-datas" className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <h3 id="camp-datas" className="flex items-center gap-1.5 text-sm font-semibold"><CalendarDays size={16} aria-hidden /> Datas de {NOME_MES[mes - 1]} para esta especialidade</h3>
            {datas.length === 0 ? (
              <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>Nenhuma data marcante para a especialidade neste mês. Bom mês para as campanhas de base (reativação, retorno) e conteúdo de autoridade.</p>
            ) : (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {datas.map((d) => (
                  <li key={d.id} className="rounded-lg p-2.5 text-sm" style={{ background: "var(--surface-2)" }}>
                    <div className="font-semibold" style={{ color: "var(--ink)" }}>{d.dia ? `${String(d.dia).padStart(2, "0")}/${String(d.mes).padStart(2, "0")} · ` : ""}{d.nome}</div>
                    <div className="text-xs" style={{ color: "var(--ink-2)" }}>{d.angulo}</div>
                    {d.cuidado && <div className="mt-1 text-xs" style={{ color: "var(--warn-text, var(--muted))" }}>⚠ {d.cuidado}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div><h3 className="text-base font-semibold">Ações táticas sugeridas pelos dados</h3><p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>Estas ações e as datas acima seguem o mês selecionado. Use-as para compor a execução; elas não substituem o plano integrado da campanha.</p></div>
          {erro && <p className="text-sm" style={{ color: "var(--crit)" }}>{erro}</p>}
          {campanhas.length === 0 ? (
            <div className="hempty"><h2>Nenhuma campanha com base nos dados</h2><p>Sem CRM, WhatsApp e posts suficientes, o painel não inventa campanha. Ligue as fontes em Admin.</p></div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {campanhas.map((c) => (
                <CartaoCampanha
                  key={c.id}
                  c={c}
                  status={statusDe(c.id)}
                  podeEditar={podeEditar}
                  salvando={salvando === c.id}
                  onStatus={(s) => mudarStatus(c, s)}
                  onPauta={c.tipo === "conteudo" ? () => paraPlanejador(c) : undefined}
                  pautaCriada={pautasIds.has(`camp:${chaveMes}:${c.id}`)}
                />
              ))}
            </div>
          )}

          <section className="rounded-xl border p-4 text-xs" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-dim)" }}>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--text)" }}><Sparkles size={15} aria-hidden /> Como as campanhas são montadas</h3>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>Reativação: leads em aberto sem movimento há 90+ dias no CRM, em lotes de até 300 por mês. Ativação: leads dos últimos 45 dias parados há 14+ dias. Retorno: pacientes ganhos há 11 a 13 meses.</li>
              <li>Projeção: taxa de resposta de referência (conservadora) × taxa de agendamento do próprio cliente nos últimos 90 dias quando há base; senão, referência. Sempre é estimativa.</li>
              <li>Anúncio: orçamento do mês com base no gasto atual ÷ custo por conversa atual. Conteúdo: 3 posts × alcance típico do formato que mais é salvo.</li>
              <li className="flex items-start gap-1"><Megaphone size={12} aria-hidden className="mt-0.5 shrink-0" /> Nenhuma mensagem é enviada pelo painel. Textos sem preço, desconto ou promessa de resultado (CFM).</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
