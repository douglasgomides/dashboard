import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePacientesPeriodo } from "@/hooks/use-pacientes-periodo";
import {
  METRICAS_META, ROTULO_META, ROTULO_STATUS, diasDoMes, ritmoDaMeta,
  type Leitura, type MetricaMeta, type StatusMeta,
} from "@/lib/inteligencia-resultados";
import "@/styles/databoard.css";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const classeStatus = (s: StatusMeta) => (s === "em_risco" ? "risco" : s === "fora_do_prazo" ? "fora" : s === "cedo" ? "cedo" : "");

/** "O que mudou": frases geradas por regra a partir da comparação com o período anterior. */
export function LeituraDoPeriodo({ itens, periodo }: { itens: Leitura[]; periodo: string }) {
  if (!itens.length) return null;
  return (
    <section className="dbx-card" aria-labelledby="leitura-t">
      <h2 id="leitura-t" className="dbx-title">O que mudou</h2>
      <p className="dbx-sub">{periodo}, comparado ao período anterior</p>
      <ul className="dbx-leitura">
        {itens.map((i, idx) => (
          <li key={idx}><span className={`ic ${i.tom}`} aria-hidden>{i.tom === "up" ? "▲" : i.tom === "down" ? "▼" : "●"}</span><span>{i.texto}</span></li>
        ))}
      </ul>
    </section>
  );
}

type Metas = Partial<Record<MetricaMeta, number>>;

/** Metas do mês em curso, com ritmo. Some sozinha se a tabela não existir ou não houver meta (para quem não é da equipe). */
export function MetasDoMes({ clientId, isAdmin, hoje }: { clientId: string; isAdmin: boolean; hoje: string }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const dm = diasDoMes(hoje);

  const metas = useQuery({
    queryKey: ["clinica-metas", clientId],
    queryFn: async (): Promise<Metas> => {
      const { data, error } = await (supabase as any).from("clinica_metas").select("metrica,valor").eq("client_id", clientId);
      if (error) throw new Error(error.message);
      const out: Metas = {};
      for (const r of data ?? []) out[r.metrica as MetricaMeta] = Number(r.valor);
      return out;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const mes = usePacientesPeriodo(clientId, dm.inicio, hoje, !!metas.data && Object.keys(metas.data).length > 0);

  if (metas.isLoading || metas.isError || !metas.data) return null;
  const definidas = METRICAS_META.filter((k) => metas.data[k]);
  if (!definidas.length && !isAdmin) return null;

  async function salvar() {
    setSalvando(true); setErro(null);
    try {
      for (const k of METRICAS_META) {
        const txt = (rascunho[k] ?? "").trim();
        const v = txt === "" ? null : Math.round(Number(txt));
        if (v != null && (!Number.isFinite(v) || v <= 0)) throw new Error(`Meta de "${ROTULO_META[k]}" precisa ser um número maior que zero.`);
        if (v == null) {
          const { error } = await (supabase as any).from("clinica_metas").delete().eq("client_id", clientId).eq("metrica", k);
          if (error) throw new Error(error.message);
        } else {
          const { error } = await (supabase as any).from("clinica_metas").upsert({ client_id: clientId, metrica: k, valor: v, atualizado_em: new Date().toISOString() });
          if (error) throw new Error(error.message);
        }
      }
      await qc.invalidateQueries({ queryKey: ["clinica-metas", clientId] });
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="dbx-card" aria-labelledby="metas-t">
      <div className="dbx-head">
        <div>
          <h2 id="metas-t" className="dbx-title">Metas do mês</h2>
          <p className="dbx-sub">Mês em curso: dia {dm.passados} de {dm.total}</p>
        </div>
        {isAdmin && !editando && (
          <button type="button" className="dbx-link" onClick={() => { setRascunho(Object.fromEntries(METRICAS_META.map((k) => [k, String(metas.data?.[k] ?? "")]))); setEditando(true); }}>
            {definidas.length ? "Editar metas" : "Definir metas"}
          </button>
        )}
      </div>

      {editando ? (
        <div className="dbx-form">
          {METRICAS_META.map((k) => (
            <label key={k}>{ROTULO_META[k]} por mês
              <input type="number" min={1} inputMode="numeric" value={rascunho[k] ?? ""} onChange={(e) => setRascunho({ ...rascunho, [k]: e.target.value })} placeholder="sem meta" />
            </label>
          ))}
          {erro && <p role="alert" className="dbx-note" style={{ color: "var(--dbx-bad)" }}>{erro}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="ws-action ws-action--primary" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar metas"}</button>
            <button type="button" className="ws-action ws-action--secondary" disabled={salvando} onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </div>
      ) : !definidas.length ? (
        <p className="dbx-note">Ainda não há metas para esta clínica. A clínica só vê esta área depois que a equipe define.</p>
      ) : (
        <div className="dbx-metas">
          {definidas.map((k) => {
            const atual = mes.data?.numeros[k]?.valor;
            if (mes.isLoading) return <p key={k} className="dbx-note">Calculando {ROTULO_META[k].toLowerCase()}…</p>;
            if (atual == null) return <p key={k} className="dbx-note"><b>{ROTULO_META[k]}</b>: não medido neste mês, então a meta não pode ser acompanhada.</p>;
            const r = ritmoDaMeta(metas.data![k]!, Number(atual), dm.passados, dm.total);
            return (
              <div key={k}>
                <div className="dbx-meta-top">
                  <b>{ROTULO_META[k]}</b>
                  <span className={`dbx-badge ${classeStatus(r.status)}`}>{ROTULO_STATUS[r.status]}</span>
                </div>
                <div className="dbx-meta-top"><span className="n">{fmt(r.atual)} de {fmt(r.meta)}</span><span className="n">{r.pct}%</span></div>
                <div className={`dbx-prog ${classeStatus(r.status)}`} role="progressbar" aria-valuenow={r.pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${r.pct}%` }} /></div>
                <p className="dbx-note" style={{ marginTop: 0 }}>
                  {r.status === "batida"
                    ? "Meta batida neste mês."
                    : `Faltam ${fmt(r.faltam)}${r.porDia != null ? `, cerca de ${r.porDia.toLocaleString("pt-BR")} por dia nos ${r.diasRestantes} dias que restam` : ""}.${r.projecao != null ? ` No ritmo atual, o mês fecha com ${fmt(r.projecao)}.` : " Ainda é cedo para projetar o mês."}`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
