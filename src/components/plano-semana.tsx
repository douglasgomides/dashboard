import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CheckCircle2, CircleDollarSign, History, Loader2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Painel, Kpi, Selo } from "@/components/visual";
import { Carregando, ErroCarga } from "@/components/sem-fonte";
import { useClientRole } from "@/hooks/use-client-role";
import { ROTULO_ORIGEM, semanaDe, type EstadoPlano, type OrigemPlano } from "@/lib/plano-semana";

interface ItemPlano {
  id: string; semana: string; ordem: number; origem: OrigemPlano; titulo: string; porque: string; acao: string; onde: string | null;
  n: number; valor_brl: number | null; valor_calculo: string | null; estado: EstadoPlano; verificado: boolean;
  resultado_brl: number | null; resultado_texto: string | null; medicao: Record<string, number>;
}

const db = supabase as unknown as { from: (t: string) => any };
const brl = (v: number | null | undefined) => (v == null ? "—" : "R$ " + Math.round(Number(v)).toLocaleString("pt-BR"));
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ROTULO_ESTADO: Record<EstadoPlano, string> = { proposta: "A fazer", feita: "Feita", nao_feita: "Não foi feita", descartada: "Descartada" };

async function chamar(clientId: string, corpo: Record<string, unknown>) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const r = await fetch("/api/sync/manual", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` }, body: JSON.stringify({ client_id: clientId, ...corpo }) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) throw new Error(j?.erro ?? j?.error ?? `Falhou (${r.status})`);
  return j;
}

/**
 * Plano da semana: 3 a 5 ações priorizadas pelo dinheiro em jogo, conferidas na semana seguinte.
 * Mesmo componente no Nexo (Plano de ação) e no SAP (Minha semana); `base` é o prefixo das telas de destino.
 */
export function PlanoSemana({ clientId, base, contexto }: { clientId: string; base: string; contexto?: "sap" | "nexo" }) {
  const qc = useQueryClient();
  const { podeEditar } = useClientRole(clientId);
  const semana = semanaDe(new Date());
  const desde = new Date(Date.parse(semana) - 84 * 86_400_000).toISOString().slice(0, 10);
  const chave = ["plano-semana", clientId, semana];
  const q = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const { data, error } = await db.from("plano_itens").select("id, semana, ordem, origem, titulo, porque, acao, onde, n, valor_brl, valor_calculo, estado, verificado, resultado_brl, resultado_texto, medicao")
        .eq("client_id", clientId).gte("semana", desde).order("semana", { ascending: false }).order("ordem");
      if (error) throw new Error(error.message);
      return (data ?? []) as ItemPlano[];
    },
  });
  const [gerando, setGerando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const tentou = useRef(false);
  async function atualizar() {
    setGerando(true); setAviso(null);
    try { await chamar(clientId, { alvo: "plano_semana" }); await qc.invalidateQueries({ queryKey: chave }); }
    catch (e) { setAviso(e instanceof Error ? e.message : String(e)); }
    finally { setGerando(false); }
  }
  async function decidir(id: string, estado: EstadoPlano) {
    try { await chamar(clientId, { alvo: "plano_item", id, estado }); await qc.invalidateQueries({ queryKey: chave }); }
    catch (e) { setAviso(e instanceof Error ? e.message : String(e)); }
  }
  const itens = q.data ?? [];
  const atual = itens.filter((i) => i.semana === semana);
  // Primeira visita da semana sem plano: quem pode editar já monta (a rotina semanal também monta sozinha).
  useEffect(() => {
    if (q.isSuccess && !atual.length && podeEditar && !tentou.current) { tentou.current = true; void atualizar(); }
  }, [q.isSuccess, atual.length, podeEditar]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <Carregando texto="Montando o plano da semana…" />;
  if (q.error) return <ErroCarga texto="Não consegui carregar o plano da semana." />;

  const anteriores = itens.filter((i) => i.semana < semana);
  const ultimaSemana = anteriores[0]?.semana;
  const passada = anteriores.filter((i) => i.semana === ultimaSemana);
  const emJogo = atual.filter((i) => i.estado !== "descartada").reduce((s, i) => s + Number(i.valor_brl ?? 0), 0);
  const historico = anteriores.filter((i) => i.estado !== "descartada");
  const feitas = historico.filter((i) => i.estado === "feita").length;
  const gerado = historico.reduce((s, i) => s + Number(i.resultado_brl ?? 0), 0);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi icone={CircleDollarSign} rotulo="Em jogo nesta semana" valor={emJogo ? brl(emJogo) : "—"} dica={`${atual.length} ação(ões) priorizada(s)`} info="Soma do valor estimado das ações: pacientes × chance de agendar × ticket médio. Ações de conteúdo não entram em reais." />
        <Kpi icone={CheckCircle2} rotulo="Ações feitas (12 semanas)" valor={historico.length ? `${feitas} de ${historico.length}` : "—"} dica="Conferido pelos dados, não só pelo clique" />
        <Kpi icone={History} rotulo="Resultado medido (12 semanas)" valor={gerado ? brl(gerado) : "—"} dica="Agendamentos das listas × ticket; corte de gasto em anúncio" info="Coincidência no tempo: o paciente pode ter agendado por outro motivo. É a melhor medida disponível, não prova de causa." cor="var(--good-text)" />
      </div>

      <Painel icone={CalendarCheck} titulo={`Plano da semana de ${dataBR(semana)}`} resumo={contexto === "sap" ? "As ações que mais aproximam a clínica da meta do programa, em ordem de valor." : "As ações que mais trazem resultado nesta semana, em ordem de valor."}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {podeEditar && (
            <button type="button" className="btn inline-flex items-center gap-1.5" disabled={gerando} onClick={atualizar}>
              {gerando ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />} Conferir resultados agora
            </button>
          )}
          {aviso && <span className="text-sm" role="status" style={{ color: "var(--crit)" }}>{aviso}</span>}
        </div>
        {!atual.length ? (
          <p className="note">{gerando ? "Analisando conversas, anúncios e conteúdo…" : "Nada urgente encontrado nos dados desta semana, ou as fontes ainda não estão ligadas. O plano é refeito toda segunda."}</p>
        ) : (
          <ol className="grid gap-3">
            {atual.map((i, k) => (
              <li key={i.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", opacity: i.estado === "descartada" ? 0.55 : 1 }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{k + 1}. {ROTULO_ORIGEM[i.origem]}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {i.valor_brl != null && <Selo cor="var(--good-text)">{brl(i.valor_brl)} em jogo</Selo>}
                    <Selo cor={i.estado === "feita" ? "var(--good)" : i.estado === "proposta" ? "var(--warn)" : "var(--muted)"}>{ROTULO_ESTADO[i.estado]}{i.verificado ? " · conferido" : ""}</Selo>
                  </span>
                </div>
                <h3 className="mt-1 text-[15px] font-semibold">{i.titulo}</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--text-dim)" }}>{i.porque}</p>
                <p className="mt-2 text-sm"><b>O que fazer:</b> {i.acao}</p>
                {i.valor_calculo && <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Como calculamos: {i.valor_calculo}</p>}
                {i.resultado_texto && <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>Até agora: {i.resultado_texto}{i.resultado_brl ? ` (≈ ${brl(i.resultado_brl)})` : ""}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  {i.onde && <Link to={`${base}${i.onde}` as never} className="font-semibold underline" style={{ color: "var(--accent)" }}>Abrir a lista</Link>}
                  {podeEditar && i.estado !== "feita" && <button type="button" className="underline" onClick={() => decidir(i.id, "feita")}>Marcar como feita</button>}
                  {podeEditar && i.estado === "proposta" && <button type="button" className="underline" style={{ color: "var(--muted)" }} onClick={() => decidir(i.id, "descartada")}>Não se aplica</button>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Painel>

      {passada.length > 0 && (
        <Painel icone={History} titulo={`Semana passada (${dataBR(ultimaSemana!)}): o que foi feito e o que mudou`} resumo="Conferido nos dados: resposta enviada, agendamento, gasto do anúncio, post publicado.">
          <ul className="grid gap-2 text-sm">
            {passada.map((i) => (
              <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 border-b pb-2" style={{ borderColor: "var(--border)" }}>
                <span className="flex items-start gap-2">
                  {i.estado === "feita" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: "var(--good-text)" }} aria-label="Feita" /> : <XCircle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--muted)" }} aria-label="Não feita" />}
                  <span><b>{i.titulo}</b>{i.resultado_texto && <span className="block text-xs" style={{ color: "var(--text-dim)" }}>{i.resultado_texto}</span>}</span>
                </span>
                {i.resultado_brl ? <Selo cor="var(--good-text)">≈ {brl(i.resultado_brl)}</Selo> : null}
              </li>
            ))}
          </ul>
        </Painel>
      )}

      <p className="flex items-start gap-2 text-xs" style={{ color: "var(--muted)" }}>
        <Sparkles size={13} className="mt-0.5 shrink-0" aria-hidden />
        O plano aprende com a própria clínica: depois de 20 pacientes medidos, a chance de agendar usada no cálculo passa a ser a real desta clínica. Nada é enviado a paciente pelo Nexo; a equipe executa.
      </p>
    </div>
  );
}
