import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartHandshake, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import { diaAtual, getClinicaSap, getFidelizacaoSap, getGastoDiarioSap, getMarcosSap, salvarFidelizacaoSap, salvarVerbaSap } from "@/lib/sap-data";
import { avaliarVerba } from "@/lib/sap-verba";
import { resumoFidelizacao, type SemanaFidelizacao } from "@/lib/sap-fidelizacao";
import { dataDoDia, somar } from "@/lib/sap-cronograma";
import { hojeBrasilia } from "@/lib/status-fonte";

const campo = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dm = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const segunda = (iso: string) => somar(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));

/** Verba de mídia combinada (05.01): previsto × gasto real desde a subida dos anúncios, e a condição "verba em dia" da garantia. */
export function VerbaSap({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const hoje = hojeBrasilia();
  const ontem = somar(hoje, -1);
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const c = cadQ.data ?? null;
  const marcosQ = useQuery({ queryKey: ["sap-marcos", c?.id], queryFn: () => getMarcosSap(c!.id), enabled: !!c });
  const subida = marcosQ.data?.find((m) => m.marco === 22)?.concluido_em ?? null;
  const gastoQ = useQuery({ queryKey: ["sap-gasto-dia", clientId, subida, ontem], queryFn: () => getGastoDiarioSap(clientId, subida!, ontem), enabled: !!subida && subida <= ontem });
  const [ed, setEd] = useState<string | null>(null);
  const salvar = useMutation({
    mutationFn: (v: { verba: number | null; emDia: boolean | null }) => salvarVerbaSap(c!.id, v.verba, v.emDia),
    onSuccess: () => { setEd(null); qc.invalidateQueries({ queryKey: ["sap-cadastro"] }); },
  });
  const av = useMemo(() => {
    if (!c?.verba_mensal) return null;
    const d90 = c.d0 ? dataDoDia(c.d0, c.pausas ?? [], 90, hoje) : null;
    return avaliarVerba({ verbaMensal: Number(c.verba_mensal), subida, d90, ontem, gastoPorDia: gastoQ.data ?? new Map() });
  }, [c, subida, gastoQ.data, hoje, ontem]);
  if (!c) return null;
  const divergente = av?.emDia !== null && av?.emDia !== undefined && (c.verba_em_dia !== false) !== av.emDia;
  return (
    <Painel icone={Wallet} titulo="Verba de mídia combinada" resumo={c.verba_mensal ? `${brl(Number(c.verba_mensal))} por mês, paga pela clínica direto às plataformas` : "Verba ainda não registrada (decidida na Sessão 3)"}
      ajuda={<>A verba conta a partir do dia em que os anúncios sobem (item "Anúncios no ar" do Cronograma). Verba em dia é a condição da garantia: gasto acumulado de pelo menos 80% do previsto. Na semana, o gasto deve ficar dentro de ±20% do previsto (05.11).</>}>
      <div className="mt-2 flex flex-wrap items-end gap-3 text-sm">
        {ed === null ? (
          isAdmin && <button type="button" onClick={() => setEd(c.verba_mensal ? String(c.verba_mensal) : "")} className="text-sm font-semibold underline" style={{ color: "var(--accent)" }}>{c.verba_mensal ? "Editar verba" : "Registrar verba mensal"}</button>
        ) : (
          <>
            <label className="text-xs">Verba mensal (R$)<input inputMode="decimal" value={ed} onChange={(e) => setEd(e.target.value)} className="mt-0.5 block min-h-[34px] w-32 rounded-md border px-2 text-sm" style={campo} /></label>
            <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate({ verba: ed.trim() ? Number(ed.replace(/\./g, "").replace(",", ".")) : null, emDia: null })} className="min-h-[34px] rounded-lg px-3 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>Salvar</button>
            <button type="button" onClick={() => setEd(null)} className="text-sm" style={{ color: "var(--text-dim)" }}>Cancelar</button>
          </>
        )}
      </div>
      {!subida && <p className="mt-2 text-sm" style={{ color: "var(--text-dim)" }}>Anúncios ainda não marcados como no ar. Marque o item 22 em Cronograma e prazos no dia da subida.</p>}
      {av && subida && (
        <div className="mt-2 space-y-1 text-sm">
          <p>Anúncios no ar desde {dm(subida)} ({av.dias} dias){av.previsto90 !== null ? ` · previsto até o D90: ${brl(av.previsto90)}` : ""}.</p>
          <p style={{ color: av.emDia ? "var(--good)" : "var(--crit)" }}><strong>{av.texto}</strong></p>
          <p>Últimos 7 dias: {brl(av.semana.gasto)} de {brl(av.semana.previsto)} previstos{av.semana.razao !== null ? ` (${pct(av.semana.razao)})` : ""} {av.semana.ok === false && <Selo cor="var(--warn)">fora de ±20%</Selo>}</p>
          {isAdmin && divergente && (
            <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate({ verba: Number(c.verba_mensal), emDia: av.emDia })} className="mt-1 min-h-[34px] rounded-lg border px-3 text-sm font-semibold" style={{ borderColor: "var(--border)" }}>
              Atualizar a condição da garantia para "verba {av.emDia ? "em dia" : "abaixo do combinado"}"
            </button>
          )}
        </div>
      )}
      {salvar.isError && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</p>}
    </Painel>
  );
}

const CAMPOS: { k: keyof Omit<SemanaFidelizacao, "semana">; rot: string }[] = [
  { k: "retornos", rot: "Retornos no prazo" },
  { k: "recompras", rot: "Recompras" },
  { k: "contatados_reativacao", rot: "Contatados na reativação" },
  { k: "reativados_agendaram", rot: "Reativados que agendaram" },
  { k: "indicacoes", rot: "Indicações" },
  { k: "indicacoes_com_codigo", rot: "Indicações com código IND" },
  { k: "avaliacoes_google", rot: "Avaliações novas no Google" },
  { k: "contatados_regua", rot: "Contatados na régua de relacionamento" },
  { k: "sair", rot: "Pediram para sair" },
];

/** Fidelização, reativação e indicação (08.02, 08.03): registro semanal e os gatilhos V16 e V17. */
export function FidelizacaoSap({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const hoje = hojeBrasilia();
  const semana = segunda(hoje);
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const c = cadQ.data ?? null;
  const q = useQuery({ queryKey: ["sap-fidelizacao", c?.id], queryFn: () => getFidelizacaoSap(c!.id), enabled: !!c });
  const lista = q.data ?? [];
  const atual = lista.find((x) => x.semana === semana);
  const [f, setF] = useState<Record<string, string>>({});
  const valor = (k: string) => (k in f ? f[k] : atual?.[k as keyof SemanaFidelizacao] != null ? String(atual![k as keyof SemanaFidelizacao]) : "");
  const salvar = useMutation({
    mutationFn: () => {
      const dados = Object.fromEntries(CAMPOS.map(({ k }) => [k, valor(k) === "" ? null : Number(valor(k))])) as Omit<SemanaFidelizacao, "semana">;
      return salvarFidelizacaoSap(c!.id, { semana, ...dados });
    },
    onSuccess: () => { setF({}); qc.invalidateQueries({ queryKey: ["sap-fidelizacao", c?.id] }); },
  });
  if (!c) return null;
  const r = resumoFidelizacao(lista, diaAtual(c.d0, c.pausas));
  return (
    <Painel icone={HeartHandshake} titulo="Fidelização, reativação e indicação" resumo={`Últimas ${r.semanas || 4} semanas lançadas`}
      ajuda={<>O CRM não mostra retorno, recompra, código de indicação nem avaliação no Google: a equipe lança toda semana. A partir do D52 (réguas ativas), semanas sem indicação ou sem retorno viram vazamento na leitura (V16 e V17).</>}>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
        <div>Retornos e recompras: <strong>{r.retornos + r.recompras}</strong></div>
        <div>Reativação: <strong>{r.reativacao.agendaram} de {r.reativacao.contatados}</strong> {r.reativacao.taxa !== null && `(${pct(r.reativacao.taxa)})`}</div>
        <div>Indicações: <strong>{r.indicacoes}</strong>{r.semCodigo !== null && ` · ${pct(r.semCodigo)} sem código`}</div>
        <div>Avaliações no Google: <strong>{r.avaliacoes}</strong></div>
        <div>Pediram para sair: <strong>{pct(r.sair)}</strong> <span style={{ color: "var(--muted)" }}>(limite 5%)</span></div>
      </div>
      {[...r.gatilhos.map((g) => `${g.codigo}: ${g.motivo}`), ...r.alertas].map((t) => <p key={t} className="mt-1 text-sm" style={{ color: "var(--crit)" }}>{t}</p>)}
      {isAdmin && (
        <div className="mt-3">
          <h4 className="text-sm font-semibold">Semana de {dm(semana)}{atual ? " · lançada" : ""}</h4>
          <div className="mt-1 flex flex-wrap items-end gap-3">
            {CAMPOS.map(({ k, rot }) => (
              <label key={k} className="text-xs">{rot}<input inputMode="numeric" value={valor(k)} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/\D/g, "") })} className="mt-0.5 block min-h-[34px] w-24 rounded-md border px-2 text-sm" style={campo} /></label>
            ))}
            <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate()} className="min-h-[34px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>Salvar semana</button>
          </div>
          {salvar.isError && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</p>}
        </div>
      )}
    </Painel>
  );
}
