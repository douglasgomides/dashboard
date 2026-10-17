import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getRouteApi } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { resolveDateRange } from "@/lib/date-range";
import { BarraFina } from "@/components/visual";
import { parseTicket, ticketForInput } from "@/lib/ticket";

// Auditoria comercial do período: o que a IA leu em cada conversa (conversas_resumos), somado.
// Mesma estrutura das auditorias manuais: funil, objeções x falhas, por atendente, resgate, exemplos.

const layout = getRouteApi("/_authenticated/$clientId");

const ROTULO_OBJECAO: Record<string, string> = {
  preco: "Preço", convenio: "Convênio/plano", distancia: "Distância", adiamento: "Adiamento (“vou pensar”)", agenda: "Agenda/horário",
  medo: "Medo", desconfianca: "Desconfiança", outro: "Outro",
};
const ROTULO_FALHA: Record<string, string> = {
  sem_resposta: "Deixou o paciente sem resposta", demora: "Demorou para responder", desvio_preco: "Desviou da pergunta de preço",
  preco_sem_ancoragem: "Deu preço sem ancorar valor", sem_cta: "Não conduziu para data/hora", sem_follow_up: "Sem follow-up quando o paciente sumiu",
  nome_errado: "Errou o nome do paciente", informacao_inconsistente: "Informação inconsistente (valor, data)", pressao: "Pressionou o paciente",
  so_emoji: "Respondeu só com emoji", desconto_reativo: "Desconto antes de construir valor", excesso_audio: "Excesso de áudio",
};
const ROTULO_ORIGEM: Record<string, string> = { anuncio: "Anúncio", instagram: "Instagram", indicacao: "Indicação", paciente_antigo: "Paciente antigo", desconhecida: "Não dá para saber" };

type Auditoria = {
  conversas_periodo: number;
  lidas: number;
  funil: Record<string, number>;
  objecoes: Record<string, number>;
  falhas: Record<string, number>;
  origem: Record<string, number>;
  nota_media: number | null;
  por_atendente: { nome: string; conversas: number; agendou: number; preco_apresentado: number; nota: number | null; falha_mais_comum: string | null; a_melhorar: string | null }[];
  resgate: { conversa_id: string; nome: string; interesse: string | null; situacao: string | null; proximo_passo: string | null; ultima_msg_em: string }[];
  exemplos: { conversa_id: string; atendente: string | null; evidencia: string; como_deveria: string; falhas: string[] }[];
};

function Barras({ itens, rotulos, cor }: { itens: Record<string, number>; rotulos: Record<string, string>; cor: string }) {
  const lista = Object.entries(itens).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...lista.map(([, n]) => n));
  if (!lista.length) return <p className="text-sm" style={{ color: "var(--text-dim)" }}>Nada apareceu no período.</p>;
  return (
    <ul className="space-y-1.5">
      {lista.map(([k, n]) => (
        <li key={k} className="text-sm">
          <div className="flex justify-between gap-2"><span>{rotulos[k] ?? k}</span><b className="tabular-nums">{n}</b></div>
          <BarraFina valor={n} max={max} cor={cor} />
        </li>
      ))}
    </ul>
  );
}

export function AuditoriaComercial({ clientId, onAbrir }: { clientId: string; onAbrir?: (conversaId: string) => void }) {
  const busca = layout.useSearch();
  const { start, end } = resolveDateRange(busca);
  const auditoria = useQuery({
    queryKey: ["auditoria-comercial", clientId, start, end],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("auditoria_comercial", { p_client: clientId, p_de: start, p_ate: end.slice(0, 10) });
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as Auditoria | null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (auditoria.isLoading) return <p role="status" className="mb-4 text-sm" style={{ color: "var(--text-dim)" }}>Carregando auditoria comercial…</p>;
  if (auditoria.isError) return (
    <div role="alert" className="mb-4 text-sm" style={{ color: "var(--crit)" }}>
      Não foi possível carregar a auditoria comercial. <button type="button" className="underline" onClick={() => void auditoria.refetch()}>Tentar novamente</button>
    </div>
  );
  const a = auditoria.data;
  if (!a) return null;
  if (!a.lidas)
    return (
      <section className="mb-4 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h2 className="text-[15px] font-semibold">Auditoria comercial</h2>
        <p className="mt-1" style={{ color: "var(--ink-2)" }}>
          {a.conversas_periodo} conversas no período, nenhuma lida pela IA ainda. A leitura roda sozinha todo dia, depois da sincronização do WhatsApp:
          cada conversa ganha etapa do funil, objeção, falhas do atendimento, nota da atendente e o que ela deveria ter respondido.
        </p>
      </section>
    );
  const f = a.funil;
  const etapas: [string, number][] = [
    ["Engajaram", f.engajou], ["Pediram preço", f.preco_pedido], ["Receberam preço", f.preco_apresentado], ["Agendamento em curso", f.agendamento_em_curso], ["Agendaram", f.agendou],
  ];
  const maxF = Math.max(1, ...etapas.map(([, n]) => n));
  const precoNaoDado = Math.max(0, f.preco_pedido - f.preco_apresentado);
  return (
    <section className="mb-5 space-y-4" aria-label="Auditoria comercial">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Auditoria comercial do período</h2>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          IA leu {a.lidas} de {a.conversas_periodo} conversas{a.nota_media != null ? ` · nota média do atendimento ${String(a.nota_media).replace(".", ",")}/10` : ""}
        </span>
      </div>
      <EmJogo key={clientId} clientId={clientId} de={start} ate={end.slice(0, 10)} />
      {precoNaoDado > 0 && (
        <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--warn-border, var(--warn))", background: "var(--warn-bg, var(--surface))" }}>
          <b>{precoNaoDado}</b> pacientes pediram preço e não receberam. É o ponto do funil que mais costuma derrubar a conversão.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h3 className="mb-2 text-sm font-semibold">Funil da conversa</h3>
          <ul className="space-y-1.5">
            {etapas.map(([r, n]) => (
              <li key={r} className="text-sm">
                <div className="flex justify-between"><span>{r}</span><b className="tabular-nums">{n}</b></div>
                <BarraFina valor={n} max={maxF} cor="var(--accent)" />
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h3 className="mb-2 text-sm font-semibold">O que o paciente disse (objeções)</h3>
          <Barras itens={a.objecoes} rotulos={ROTULO_OBJECAO} cor="var(--warn)" />
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h3 className="mb-2 text-sm font-semibold">O que a clínica errou (causa real da perda)</h3>
          <Barras itens={a.falhas} rotulos={ROTULO_FALHA} cor="var(--crit)" />
        </div>
      </div>

      {a.por_atendente.length > 0 && (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <caption className="px-3 py-2 text-left font-semibold" style={{ background: "var(--surface-2, var(--surface))" }}>Por atendente</caption>
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-dim)" }}>
                <th className="px-3 py-1.5 font-medium">Atendente</th><th className="px-3 py-1.5 font-medium">Nota</th><th className="px-3 py-1.5 font-medium">Conversas</th>
                <th className="px-3 py-1.5 font-medium">Agendou</th><th className="px-3 py-1.5 font-medium">Deu preço</th><th className="px-3 py-1.5 font-medium">Erro mais comum</th>
                <th className="px-3 py-1.5 font-medium">O que melhorar</th>
              </tr>
            </thead>
            <tbody>
              {a.por_atendente.map((p) => (
                <tr key={p.nome} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="px-3 py-1.5 font-medium">{p.nome}</td>
                  <td className="px-3 py-1.5 tabular-nums" style={{ color: p.nota != null && p.nota < 6 ? "var(--crit)" : undefined }}>{p.nota != null ? String(p.nota).replace(".", ",") : "—"}</td>
                  <td className="px-3 py-1.5 tabular-nums">{p.conversas}</td>
                  <td className="px-3 py-1.5 tabular-nums">{p.agendou}</td>
                  <td className="px-3 py-1.5 tabular-nums">{p.preco_apresentado}</td>
                  <td className="px-3 py-1.5">{p.falha_mais_comum ? ROTULO_FALHA[p.falha_mais_comum] ?? p.falha_mais_comum : "—"}</td>
                  <td className="px-3 py-1.5 text-xs" style={{ color: "var(--ink-2)" }}>{p.a_melhorar ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h3 className="text-sm font-semibold">Resgatar hoje ({a.resgate.length})</h3>
          <p className="mb-2 text-xs" style={{ color: "var(--text-dim)" }}>Mostraram interesse real e não agendaram.</p>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">
            {a.resgate.map((r) => (
              <li key={r.conversa_id}>
                <button type="button" onClick={() => onAbrir?.(r.conversa_id)} className="w-full rounded-lg border p-2 text-left text-sm" style={{ borderColor: "var(--border)" }}>
                  <b>{r.nome}</b>{r.interesse ? ` · ${r.interesse}` : ""}
                  {r.proximo_passo && <div className="text-xs" style={{ color: "var(--ink-2)" }}>→ {r.proximo_passo}</div>}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h3 className="mb-2 text-sm font-semibold">Exemplos reais: o que foi dito × como deveria</h3>
          <ul className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {a.exemplos.map((e) => (
              <li key={e.conversa_id} className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
                <div className="text-xs" style={{ color: "var(--text-dim)" }}>{e.atendente ?? "Clínica"} · {(e.falhas ?? []).map((x) => ROTULO_FALHA[x] ?? x).join(", ")}</div>
                <div className="mt-0.5 italic">“{e.evidencia}”</div>
                <div className="mt-1" style={{ color: "var(--good)" }}>Melhor: {e.como_deveria}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {Object.keys(a.origem).length > 0 && (
        <p className="text-xs" style={{ color: "var(--text-dim)" }}>
          De onde vieram (lido na conversa): {Object.entries(a.origem).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${ROTULO_ORIGEM[k] ?? k} ${n}`).join(" · ")}. Leitura automática por IA: confira na conversa antes de agir.
        </p>
      )}
    </section>
  );
}

// "R$ em jogo": recuperáveis do período × ticket da clínica (RPC receita_em_jogo). Potencial, não previsão.
type EmJogoDados = { recuperaveis: number; ticket: number | null; fonte_ticket: "equipe" | "crm" | "sap" | null; vendas_crm: number; valor: number | null };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const FONTE_TICKET = { equipe: "definido pela equipe", crm: "mediana das vendas do CRM", sap: "ficha do SAP" } as const;

function EmJogo({ clientId, de, ate }: { clientId: string; de: string; ate: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const q = useQuery({
    queryKey: ["receita-em-jogo", clientId, de, ate],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("receita_em_jogo", { p_client: clientId, p_de: de, p_ate: ate });
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as EmJogoDados | null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const salvar = useMutation({
    mutationFn: async (v: number | null) => {
      if (!isAdmin) throw new Error("Seu acesso permite apenas leitura.");
      if (v !== null && (!Number.isFinite(v) || v <= 0)) throw new Error("Informe um valor positivo em reais.");
      const { error } = await (supabase as any).rpc("definir_ticket_cliente", { p_client: clientId, p_valor: v });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setEditando(false); qc.invalidateQueries({ queryKey: ["receita-em-jogo", clientId] }); },
  });
  if (q.isLoading) return <p role="status" className="text-sm" style={{ color: "var(--text-dim)" }}>Calculando o potencial do período…</p>;
  if (q.isError) return (
    <div role="alert" className="text-sm" style={{ color: "var(--crit)" }}>
      Não foi possível calcular o potencial do período. <button type="button" className="underline" onClick={() => void q.refetch()}>Tentar novamente</button>
    </div>
  );
  const d = q.data;
  if (!d || d.recuperaveis === 0) return null;
  const caixa = { borderColor: "var(--border)", background: "var(--surface)" };
  const numero = parseTicket(valor);
  return (
    <div className="rounded-xl border p-3" style={caixa}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Em jogo no período</span>
        {d.valor != null ? (
          <span className="text-2xl font-semibold">{brl(d.valor)}</span>
        ) : (
          <span className="text-sm">{d.recuperaveis} pacientes recuperáveis · falta o ticket para calcular o valor</span>
        )}
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
        {d.recuperaveis} {d.recuperaveis === 1 ? "paciente mostrou" : "pacientes mostraram"} interesse real e não agendaram
        {d.ticket != null && d.fonte_ticket ? <> · ticket {brl(d.ticket)} ({FONTE_TICKET[d.fonte_ticket]}{d.fonte_ticket === "crm" ? `, ${d.vendas_crm} vendas` : ""})</> : null}.
        {" "}É o potencial se todos agendarem, não uma previsão. A lista está em "Resgatar hoje".
      </p>
      {isAdmin && (editando ? (
        <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (numero !== null && !salvar.isPending) salvar.mutate(numero); }}>
          <label className="text-sm">Ticket médio (R$){" "}
            <input inputMode="decimal" placeholder="Ex.: 1.234,56" disabled={salvar.isPending} value={valor} onChange={(e) => setValor(e.target.value)} className="ml-1 min-h-[34px] w-32 rounded-lg border px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
          </label>
          <button type="submit" disabled={numero === null || salvar.isPending} className="min-h-[34px] rounded-lg px-3 text-sm font-medium disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>{salvar.isPending ? "Salvando…" : "Salvar"}</button>
          {d.fonte_ticket === "equipe" && <button type="button" disabled={salvar.isPending} className="text-xs underline disabled:opacity-50" onClick={() => salvar.mutate(null)}>Voltar ao automático</button>}
          <button type="button" disabled={salvar.isPending} className="text-xs underline disabled:opacity-50" onClick={() => setEditando(false)}>Cancelar</button>
          {salvar.isError && <span role="alert" className="text-xs" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</span>}
        </form>
      ) : (
        <button type="button" className="mt-1 text-xs underline" style={{ color: "var(--text-dim)" }} onClick={() => { salvar.reset(); setValor(ticketForInput(d.ticket)); setEditando(true); }}>
          {d.ticket == null ? "Definir ticket médio" : "Ajustar ticket"}
        </button>
      ))}
    </div>
  );
}
