import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ExternalLink, Library, Megaphone, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import { TextoComCodigos } from "@/components/sap-docs";
import { getCampanhasNumerosSap, getClinicaSap, getPecasSap, salvarPecaSap, type CampanhaNumeros } from "@/lib/sap-data";
import {
  ETAPA_INFO, MODELOS, POLITICA_CASA, ROTULO_STATUS, avisosCopy, contagemCriativos, mediana, pecasAprovadas, placarModelos, podeAprovar, seloDaPeca,
  type Etapa, type Formato, type ModeloAnuncio, type Peca, type Semaforo, type StatusPeca,
} from "@/lib/sap-anuncios";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";

const campo = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const COR_SEM: Record<Semaforo, string> = { verde: "var(--good)", amarelo: "var(--warn)", vermelho: "var(--crit)" };
const FORMATO: Record<Formato, string> = { imagem: "Imagem", carrossel: "Carrossel", reels: "Reels", bastidor: "Vídeo bastidor", depoimento: "Depoimento" };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const invalidar = (qc: ReturnType<typeof useQueryClient>) => { qc.invalidateQueries({ queryKey: ["sap-pecas"] }); qc.invalidateQueries({ queryKey: ["sap-tarefas"] }); };

/** Banco de anúncios da clínica: modelos que já funcionam (C1, C2, C3) e as peças desta clínica, com semáforo, ciente
 *  do médico, status e os números da campanha ligada. Alimenta os itens 16 e 21 do cronograma. */
export function BancoAnuncios({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  const pecasQ = useQuery({ queryKey: ["sap-pecas", "todas"], queryFn: () => getPecasSap(), enabled: isAdmin });
  const campQ = useQuery({ queryKey: ["sap-campanhas", clientId], queryFn: () => getCampanhasNumerosSap(clientId), enabled: isAdmin });
  const [aba, setAba] = useState<"pecas" | "modelos">("pecas");
  const todas = useMemo(() => pecasQ.data ?? [], [pecasQ.data]);
  const pecas = clinica ? todas.filter((p) => p.clinica_id === clinica.id) : [];
  const placar = useMemo(() => placarModelos(todas), [todas]);

  if (cadQ.isLoading) return <p className="note">Carregando…</p>;
  if (!clinica) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  if (!isAdmin) return <p className="note">O Banco de anúncios é uma ferramenta da equipe.</p>;
  const k = contagemCriativos(pecas);
  const ap = pecasAprovadas(pecas);
  const busca = encodeURIComponent((clinica.servicos?.[0] ?? clinica.especialidade ?? "médica").toString());

  return (
    <div className="space-y-4">
      <Painel icone={Megaphone} titulo="Banco de anúncios" resumo={`Sem rosto aprovadas ${k.semRosto} de ${k.metaSemRosto} · vídeos ${k.videos} de ${k.videosPlanejados} · aprovação do médico ${ap.total - ap.pendentes} de ${ap.total}`}
        ajuda={<>Comece por um modelo que já funciona, adapte ao serviço prioritário e acompanhe a peça até o ar. Os números vêm da campanha da Meta ligada a cada peça. As peças aprovadas fecham sozinhas os itens "Banco de criativos" e "Peças aprovadas pelo médico" do cronograma.</>}>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          {(["C1", "C2", "C3"] as Etapa[]).map((e) => (
            <div key={e} className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}>
              <div className="font-semibold">{ETAPA_INFO[e].nome}</div>
              <div className="text-xs" style={{ color: "var(--text-dim)" }}>{ETAPA_INFO[e].objetivo}. {ETAPA_INFO[e].regra}</div>
              <div className="mt-1 text-xs">{pecas.filter((p) => p.etapa === e && p.status !== "arquivado").length} peça(s)</div>
            </div>
          ))}
        </div>
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-semibold" style={{ color: "var(--text-dim)" }}>Regras de toda peça</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5" style={{ color: "var(--text-dim)" }}>{POLITICA_CASA.map((r) => <li key={r}>{r}</li>)}</ul>
        </details>
        <a href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&q=${busca}&search_type=keyword_unordered`} target="_blank" rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline" style={{ color: "var(--accent)" }}>
          <Library size={13} aria-hidden /> Ver anúncios ativos na Biblioteca da Meta <ExternalLink size={11} aria-hidden />
        </a>
        <span className="ml-2 text-[11px]" style={{ color: "var(--muted)" }}>Anúncio que roda há muito tempo é um bom ponto de partida, não um selo de que pode copiar.</span>
      </Painel>

      <div className="flex gap-1.5" role="tablist">
        {([["pecas", `Peças desta clínica (${pecas.filter((p) => p.status !== "arquivado").length})`], ["modelos", `Modelos (${MODELOS.length})`]] as const).map(([id, rot]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)} className="min-h-[36px] rounded-full border px-3 text-sm font-medium"
            style={aba === id ? { background: "var(--accent)", color: "white", borderColor: "var(--accent)" } : { borderColor: "var(--border)" }}>{rot}</button>
        ))}
      </div>

      {aba === "modelos"
        ? <ListaModelos clinicaId={clinica.id} placar={placar} onUsado={() => setAba("pecas")} />
        : <ListaPecas clinicaId={clinica.id} pecas={pecas} campanhas={campQ.data ?? []} onModelos={() => setAba("modelos")} />}
    </div>
  );
}

function ListaModelos({ clinicaId, placar, onUsado }: { clinicaId: string; placar: ReturnType<typeof placarModelos>; onUsado: () => void }) {
  const qc = useQueryClient();
  const [etapa, setEtapa] = useState<Etapa | "todas">("todas");
  const [rosto, setRosto] = useState<"todos" | "sem" | "com">("todos");
  const usar = useMutation({
    mutationFn: (m: ModeloAnuncio) => salvarPecaSap(clinicaId, {
      modelo: m.codigo, titulo: m.nome, etapa: m.etapas[0], formato: m.formato[0], rosto: m.rosto, ganchos: [m.gancho, "", ""], semaforo: m.semaforo,
      ciente_em: null, status: "ideia", arquivo_url: null, campaign_id: null, reprovacao_meta: null,
    }),
    onSuccess: () => { invalidar(qc); onUsado(); },
  });
  const lista = MODELOS.filter((m) => (etapa === "todas" || m.etapas.includes(etapa)) && (rosto === "todos" || (rosto === "com") === m.rosto));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-sm">
        <label><span className="mr-2" style={{ color: "var(--text-dim)" }}>Etapa</span>
          <select value={etapa} onChange={(x) => setEtapa(x.target.value as Etapa | "todas")} className="min-h-[36px] rounded-lg border px-2" style={campo}>
            <option value="todas">Todas</option><option value="C1">C1 · Atrair</option><option value="C2">C2 · Autoridade</option><option value="C3">C3 · Remarketing</option>
          </select>
        </label>
        <label><span className="mr-2" style={{ color: "var(--text-dim)" }}>Gravação</span>
          <select value={rosto} onChange={(x) => setRosto(x.target.value as typeof rosto)} className="min-h-[36px] rounded-lg border px-2" style={campo}>
            <option value="todos">Todos</option><option value="sem">Sem rosto (banco de criativos)</option><option value="com">Com a médica (gravação dirigida)</option>
          </select>
        </label>
      </div>
      {usar.isError && <p className="text-xs" style={{ color: "var(--crit)" }}>{mensagemDeErroAcao(usar.error)}</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {lista.map((m) => {
          const pl = placar.get(m.codigo);
          return (
            <li key={m.codigo} className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>{m.codigo}</span>
                <strong>{m.nome}</strong>
                {m.etapas.map((e) => <Selo key={e} cor="var(--accent)">{e}</Selo>)}
                <Selo cor={m.rosto ? "var(--warn)" : "var(--good)"}>{m.rosto ? "com a médica" : "sem rosto"}</Selo>
                {m.semaforo !== "verde" && <Selo cor={COR_SEM[m.semaforo]}>pede ciente</Selo>}
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>{m.formato.map((f) => FORMATO[f]).join(" ou ")}</div>
              <p className="mt-2 rounded-md p-2 text-sm italic" style={{ background: "var(--accent-soft)" }}>{m.gancho}</p>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs">{m.roteiro.map((r) => <li key={r}>{r}</li>)}</ol>
              <p className="mt-2 text-xs"><strong>Por que funciona: </strong><span style={{ color: "var(--text-dim)" }}>{m.porque}</span></p>
              <p className="mt-1 text-xs"><strong>Cuidados: </strong><span style={{ color: "var(--text-dim)" }}><TextoComCodigos texto={m.cuidados} /></span></p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>{pl ? `Usado em ${pl.clinicas} clínica(s) · ${pl.noAr} no ar${pl.reprovadas ? ` · ${pl.reprovadas} reprovada(s) pela Meta` : ""}` : "Ainda não usado"}</span>
                <button type="button" disabled={usar.isPending} onClick={() => usar.mutate(m)} className="inline-flex min-h-[34px] items-center gap-1 rounded-lg px-3 text-xs font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>
                  <Plus size={13} aria-hidden /> Usar nesta clínica
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ListaPecas({ clinicaId, pecas, campanhas, onModelos }: { clinicaId: string; pecas: Peca[]; campanhas: CampanhaNumeros[]; onModelos: () => void }) {
  const [verArquivadas, setVerArquivadas] = useState(false);
  const porCampanha = new Map(campanhas.map((c) => [c.campaign_id, c]));
  const custos = campanhas.filter((c) => c.conversas > 0 && c.dias >= 7).map((c) => c.gasto / c.conversas);
  const med = mediana(custos);
  const vis = pecas.filter((p) => verArquivadas || p.status !== "arquivado");
  if (!pecas.length) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        Nenhuma peça ainda. <button type="button" onClick={onModelos} className="font-semibold underline" style={{ color: "var(--accent)" }}>Escolha um modelo</button> para começar: ele vira uma peça com gancho, roteiro e semáforo.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {(["C1", "C2", "C3"] as Etapa[]).map((e) => {
        const l = vis.filter((p) => p.etapa === e);
        if (!l.length) return null;
        return (
          <section key={e}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>{ETAPA_INFO[e].nome} ({l.length})</h3>
            <ul className="space-y-2">{l.map((p) => <CardPeca key={p.id} p={p} clinicaId={clinicaId} campanhas={campanhas} numeros={p.campaign_id ? porCampanha.get(p.campaign_id) : undefined} med={med} />)}</ul>
          </section>
        );
      })}
      <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={verArquivadas} onChange={(x) => setVerArquivadas(x.target.checked)} /> Mostrar arquivadas</label>
    </div>
  );
}

function CardPeca({ p, clinicaId, campanhas, numeros, med }: { p: Peca; clinicaId: string; campanhas: CampanhaNumeros[]; numeros?: CampanhaNumeros; med: number | null }) {
  const qc = useQueryClient();
  const [ed, setEd] = useState<Peca | null>(null);
  const salvar = useMutation({ mutationFn: (v: Peca) => salvarPecaSap(clinicaId, v), onSuccess: () => { setEd(null); invalidar(qc); } });
  const n = numeros ? { campaign_id: numeros.campaign_id, gasto: numeros.gasto, conversas: numeros.conversas, cliques: numeros.cliques, impressoes: numeros.impressoes, dias: numeros.dias, ultimos7Gasto: numeros.ultimos7_gasto, ultimos7Conversas: numeros.ultimos7_conversas, anteriores7Gasto: numeros.anteriores7_gasto, anteriores7Conversas: numeros.anteriores7_conversas } : undefined;
  const selo = seloDaPeca(p, n, med);
  const avisos = avisosCopy([p.titulo, ...p.ganchos].join(" \n "));
  const v = ed ?? p;
  const aprov = podeAprovar(v);
  const set = (patch: Partial<Peca>) => setEd({ ...v, ...patch });
  return (
    <li className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        {p.modelo && <span className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>{p.modelo}</span>}
        <strong className="min-w-0" style={{ overflowWrap: "anywhere" }}>{p.titulo}</strong>
        <Selo cor={COR_SEM[p.semaforo]}>{p.semaforo}{p.semaforo === "amarelo" ? (p.ciente_em ? " · ciente" : " · sem ciente") : ""}</Selo>
        <Selo cor={p.status === "no_ar" ? "var(--good)" : p.status === "aprovado" ? "var(--accent)" : "var(--muted)"}>{ROTULO_STATUS[p.status]}</Selo>
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>{FORMATO[p.formato]} · {p.rosto ? "com a médica" : "sem rosto"}</span>
        {selo === "vencedor" && <Selo cor="var(--good)">vencedor</Selo>}
        {selo === "cansou" && <Selo cor="var(--crit)">cansou (trocar criativo)</Selo>}
        {selo === "aprendendo" && <Selo cor="var(--muted)">aprendendo</Selo>}
      </div>
      {p.ganchos.filter(Boolean).length > 0 && <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: "var(--text-dim)" }}>{p.ganchos.filter(Boolean).map((g) => <li key={g}>{g}</li>)}</ul>}
      {avisos.length > 0 && <ul className="mt-1 space-y-0.5 text-xs" style={{ color: "var(--warn)" }}>{avisos.map((a) => <li key={a}><AlertTriangle size={12} aria-hidden className="mr-1 inline" />{a}</li>)}</ul>}
      {numeros ? (
        <div className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-dim)" }}>
          {numeros.nome ?? "Campanha"} · {brl(numeros.gasto)} em {numeros.dias} dia(s) · {numeros.conversas} conversa(s){numeros.conversas ? ` · ${brl(numeros.gasto / numeros.conversas)} por conversa` : ""}
        </div>
      ) : p.status === "no_ar" ? <div className="mt-1 text-xs" style={{ color: "var(--warn)" }}>No ar sem campanha ligada: ligue a campanha para ver os números.</div> : null}
      {p.reprovacao_meta && <div className="mt-1 text-xs" style={{ color: "var(--crit)" }}>Reprovada pela Meta: {p.reprovacao_meta}</div>}
      {p.arquivo_url && <a href={p.arquivo_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs underline">abrir arquivo</a>}

      {!ed ? (
        <button type="button" onClick={() => setEd({ ...p, ganchos: [...p.ganchos, "", "", ""].slice(0, 3) })} className="mt-2 block text-sm font-semibold underline" style={{ color: "var(--accent)" }}>Editar</button>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs sm:col-span-2">Título<input value={v.titulo} onChange={(x) => set({ titulo: x.target.value })} className="mt-0.5 block min-h-[36px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          {[0, 1, 2].map((i) => (
            <label key={i} className="text-xs sm:col-span-2">Gancho {i + 1}
              <input value={v.ganchos[i] ?? ""} onChange={(x) => { const g = [...v.ganchos]; g[i] = x.target.value; set({ ganchos: g }); }} className="mt-0.5 block min-h-[36px] w-full rounded-md border px-2 text-sm" style={campo} />
            </label>
          ))}
          <label className="text-xs">Etapa<select value={v.etapa} onChange={(x) => set({ etapa: x.target.value as Etapa })} className="mt-0.5 block min-h-[36px] w-full rounded-md border px-2 text-sm" style={campo}><option>C1</option><option>C2</option><option>C3</option></select></label>
          <label className="text-xs">Formato<select value={v.formato} onChange={(x) => set({ formato: x.target.value as Formato })} className="mt-0.5 block min-h-[36px] w-full rounded-md border px-2 text-sm" style={campo}>{Object.entries(FORMATO).map(([k2, r]) => <option key={k2} value={k2}>{r}</option>)}</select></label>
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={v.rosto} onChange={(x) => set({ rosto: x.target.checked })} /> Com a médica (gravação dirigida)</label>
          <label className="text-xs">Semáforo<select value={v.semaforo} onChange={(x) => set({ semaforo: x.target.value as Semaforo })} className="mt-0.5 block min-h-[36px] w-full rounded-md border px-2 text-sm" style={campo}><option value="verde">Verde</option><option value="amarelo">Amarelo (pede ciente)</option><option value="vermelho">Vermelho (não sobe)</option></select></label>
          {v.semaforo === "amarelo" && <label className="text-xs">Ciente do médico em<input type="date" value={v.ciente_em ?? ""} onChange={(x) => set({ ciente_em: x.target.value || null })} className="mt-0.5 block min-h-[36px] w-full rounded-md border px-2 text-sm" style={campo} /></label>}
          <label className="text-xs">Status<select value={v.status} onChange={(x) => set({ status: x.target.value as StatusPeca })} className="mt-0.5 block min-h-[36px] w-full rounded-md border px-2 text-sm" style={campo}>
            {(Object.keys(ROTULO_STATUS) as StatusPeca[]).map((s) => <option key={s} value={s} disabled={(s === "aprovado" || s === "no_ar") && !aprov.ok}>{ROTULO_STATUS[s]}</option>)}
          </select></label>
          <label className="text-xs sm:col-span-2">Arquivo (pasta de aprovados no Drive)<input value={v.arquivo_url ?? ""} onChange={(x) => set({ arquivo_url: x.target.value || null })} placeholder="https://drive.google.com/…" className="mt-0.5 block min-h-[36px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <label className="text-xs sm:col-span-2">Campanha da Meta (para puxar os números)
            <select value={v.campaign_id ?? ""} onChange={(x) => set({ campaign_id: x.target.value || null })} className="mt-0.5 block min-h-[36px] w-full max-w-full rounded-md border px-2 text-sm" style={campo}>
              <option value="">Nenhuma</option>
              {campanhas.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.nome ?? c.campaign_id} · {brl(c.gasto)}</option>)}
            </select>
          </label>
          <label className="text-xs sm:col-span-2">Reprovada pela Meta? (motivo)<input value={v.reprovacao_meta ?? ""} onChange={(x) => set({ reprovacao_meta: x.target.value || null })} className="mt-0.5 block min-h-[36px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          {!aprov.ok && <p className="text-xs sm:col-span-2" style={{ color: "var(--warn)" }}>{aprov.motivo}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate({ ...v, ganchos: v.ganchos.map((g) => g.trim()).filter(Boolean) })} className="min-h-[36px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>Salvar</button>
            <button type="button" onClick={() => setEd(null)} className="min-h-[36px] px-2 text-sm" style={{ color: "var(--text-dim)" }}>Cancelar</button>
          </div>
          {salvar.isError && <p className="text-xs sm:col-span-2" style={{ color: "var(--crit)" }}>{mensagemDeErroAcao(salvar.error)}</p>}
        </div>
      )}
    </li>
  );
}
