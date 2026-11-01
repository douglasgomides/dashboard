import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListTodo } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import { getAcoesSap, getClinicaSap, salvarAcaoSap, type AcaoSap } from "@/lib/sap-data";
import { somar } from "@/lib/sap-cronograma";
import { hojeBrasilia } from "@/lib/status-fonte";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";

const campo = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const dm = (iso: string | null) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "—");
const segunda = (iso: string) => somar(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
const ORIGEM: Record<AcaoSap["origem"], string> = { leitura: "Leitura da semana", call: "Compromisso da call", saude: "Score de Saúde", outro: "Outro" };
const STATUS: Record<AcaoSap["status"], { r: string; cor: string }> = { aberta: { r: "Aberta", cor: "var(--accent)" }, feita: { r: "Feita", cor: "var(--good)" }, nao_feita: { r: "Não feita", cor: "var(--crit)" } };

export interface SugestaoAcao { codigo: string | null; texto: string; lado: AcaoSap["lado"]; responsavel?: string | null; prazoDias?: number }

/**
 * Ações combinadas (08.05: uma por semana para cada lado; 09.03: compromissos das calls), com dono, prazo e resultado.
 * Na semana seguinte, a leitura começa conferindo o que foi feito.
 */
export function AcoesSap({ clientId, sugestoes = [], origemPadrao = "leitura" }: { clientId: string; sugestoes?: SugestaoAcao[]; origemPadrao?: AcaoSap["origem"] }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const hoje = hojeBrasilia();
  const semana = segunda(hoje);
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  const q = useQuery({ queryKey: ["sap-acoes", clinica?.id], queryFn: () => getAcoesSap(clinica!.id), enabled: !!clinica });
  const [nova, setNova] = useState<null | { texto: string; lado: AcaoSap["lado"]; responsavel: string; prazo: string; origem: AcaoSap["origem"]; codigo: string | null }>(null);
  const salvar = useMutation({
    mutationFn: (v: { a: Parameters<typeof salvarAcaoSap>[1]; remover?: boolean }) => salvarAcaoSap(clinica!.id, v.a, v.remover),
    onSuccess: () => { setNova(null); qc.invalidateQueries({ queryKey: ["sap-acoes", clinica?.id] }); },
  });
  if (!clinica) return null;
  const acoes = q.data ?? [];
  const daSemana = acoes.filter((a) => a.semana === semana);
  const anteriores = acoes.filter((a) => a.semana < semana);
  const pendentesAnteriores = anteriores.filter((a) => a.status === "aberta");
  const jaTem = (s: SugestaoAcao) => daSemana.some((a) => a.texto === s.texto);
  const mudar = (a: AcaoSap, patch: Partial<AcaoSap>) => salvar.mutate({ a: { ...a, ...patch } });

  return (
    <Painel icone={ListTodo} titulo="Ações combinadas" resumo={`Semana de ${dm(semana)}: ${daSemana.length} ação(ões)${pendentesAnteriores.length ? ` · ${pendentesAnteriores.length} de semanas anteriores ainda em aberto` : ""}`}
      ajuda={<>Toda ação vira registro com dono e prazo (08.05 e 11.04). Na semana seguinte, marque se foi feita: é o que mostra se o plano está sendo executado e entra no relatório do D90.</>}>
      {isAdmin && sugestoes.filter((s) => !jaTem(s)).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {sugestoes.filter((s) => !jaTem(s)).map((s) => (
            <button key={s.texto} type="button" onClick={() => setNova({ texto: s.texto, lado: s.lado, responsavel: s.responsavel ?? "", prazo: somar(hoje, s.prazoDias ?? 7), origem: origemPadrao, codigo: s.codigo })}
              className="min-h-[34px] rounded-lg border px-3 text-left text-sm" style={{ borderColor: "var(--border)" }}>
              + Registrar ação {s.lado === "clinica" ? "da clínica" : "da DC"}{s.codigo ? ` (${s.codigo})` : ""}
            </button>
          ))}
          <button type="button" onClick={() => setNova({ texto: "", lado: "clinica", responsavel: "", prazo: somar(hoje, 7), origem: origemPadrao, codigo: null })} className="min-h-[34px] rounded-lg border px-3 text-sm" style={{ borderColor: "var(--border)" }}>+ Outra ação</button>
        </div>
      )}
      {isAdmin && !sugestoes.filter((s) => !jaTem(s)).length && !nova && (
        <button type="button" onClick={() => setNova({ texto: "", lado: "clinica", responsavel: "", prazo: somar(hoje, 7), origem: origemPadrao, codigo: null })} className="mt-2 text-sm font-semibold underline" style={{ color: "var(--accent)" }}>+ Registrar ação</button>
      )}
      {nova && (
        <div className="mt-2 grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2" style={{ borderColor: "var(--border)" }}>
          <label className="text-xs sm:col-span-2">Ação<textarea value={nova.texto} onChange={(x) => setNova({ ...nova, texto: x.target.value })} rows={2} className="mt-0.5 block w-full rounded-md border px-2 py-1 text-sm" style={campo} /></label>
          <label className="text-xs">Lado
            <select value={nova.lado} onChange={(x) => setNova({ ...nova, lado: x.target.value as AcaoSap["lado"] })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo}>
              <option value="clinica">Clínica</option><option value="dc">Doctor Creator</option>
            </select>
          </label>
          <label className="text-xs">Origem
            <select value={nova.origem} onChange={(x) => setNova({ ...nova, origem: x.target.value as AcaoSap["origem"] })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo}>
              {Object.entries(ORIGEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="text-xs">Responsável<input value={nova.responsavel} onChange={(x) => setNova({ ...nova, responsavel: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <label className="text-xs">Prazo<input type="date" value={nova.prazo} onChange={(x) => setNova({ ...nova, prazo: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <div className="flex gap-2">
            <button type="button" disabled={salvar.isPending || !nova.texto.trim()} onClick={() => salvar.mutate({ a: { semana, origem: nova.origem, codigo: nova.codigo, texto: nova.texto.trim(), lado: nova.lado, responsavel: nova.responsavel, prazo: nova.prazo || null, status: "aberta", resultado: null } })}
              className="min-h-[34px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>Salvar</button>
            <button type="button" onClick={() => setNova(null)} className="min-h-[34px] px-2 text-sm" style={{ color: "var(--text-dim)" }}>Cancelar</button>
          </div>
        </div>
      )}
      {q.isLoading ? <p className="note">Carregando…</p> : !acoes.length ? (
        <p className="note" style={{ margin: "8px 0 0" }}>Nenhuma ação registrada ainda.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {[...pendentesAnteriores, ...daSemana, ...anteriores.filter((a) => a.status !== "aberta").slice(0, 12)].map((a) => {
            const vencida = a.status === "aberta" && a.prazo && a.prazo < hoje;
            return (
              <li key={a.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: vencida ? "color-mix(in srgb, var(--crit) 45%, var(--border))" : "var(--border)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold" style={{ color: STATUS[a.status].cor }}>{STATUS[a.status].r}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>semana de {dm(a.semana)} · {ORIGEM[a.origem]}{a.codigo ? ` · ${a.codigo}` : ""} · {a.lado === "clinica" ? "clínica" : "DC"}{a.responsavel ? ` · ${a.responsavel}` : ""} · prazo {dm(a.prazo)}</span>
                  {vencida && <Selo cor="var(--crit)">prazo vencido</Selo>}
                </div>
                <p className="mt-1">{a.texto}</p>
                {a.resultado && <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>Resultado: {a.resultado}</p>}
                {isAdmin && (
                  <div className="mt-1 flex flex-wrap gap-3 text-xs">
                    {a.status !== "feita" && <button type="button" className="underline" onClick={() => mudar(a, { status: "feita" })}>feita</button>}
                    {a.status !== "nao_feita" && <button type="button" className="underline" onClick={() => mudar(a, { status: "nao_feita" })}>não feita</button>}
                    {a.status !== "aberta" && <button type="button" className="underline" onClick={() => mudar(a, { status: "aberta" })}>reabrir</button>}
                    <button type="button" className="underline" onClick={() => { const r = window.prompt("Resultado (o que aconteceu)", a.resultado ?? ""); if (r !== null) mudar(a, { resultado: r }); }}>resultado</button>
                    <button type="button" className="underline" style={{ color: "var(--text-dim)" }} onClick={() => salvar.mutate({ a, remover: true })}>remover</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {salvar.isError && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{mensagemDeErroAcao(salvar.error)}</p>}
    </Painel>
  );
}
