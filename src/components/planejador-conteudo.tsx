import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CalendarDays, ClipboardList, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BotaoCopiar } from "@/components/botao-copiar";
import type { Ideia } from "@/lib/hub-conteudo";
import { publicationUrl } from "@/lib/creative-intelligence/discovery";
import {
  contarStatus,
  ideiaParaPauta,
  montarSemana,
  proximoDiaLivre,
  roteiroCompleto,
  semanaEmTexto,
  seteDias,
  ROTULO_FORMATO,
  ROTULO_OBJETIVO_PAUTA,
  ROTULO_ORIGEM,
  ROTULO_STATUS,
  STATUS,
  type FormatoPauta,
  type NovaPauta,
  type ObjetivoPauta,
  type Pauta,
  type StatusPauta,
} from "@/lib/pauta";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";

// Planejador de conteúdo da tela Ideias: ideia → pauta → plano da semana → produzida → publicada → medida.
// Grava em pautas_conteudo (RLS: quem pode editar ações do cliente grava; os outros só leem).

const hojeBr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const COR_STATUS: Record<StatusPauta, string> = { nova: "var(--muted)", escolhida: "var(--accent)", produzida: "var(--s1, var(--accent))", publicada: "var(--good)", medida: "var(--good)" };

async function lerPautas(clientId: string): Promise<{ pautas: Pauta[]; semTabela: boolean }> {
  const { data, error } = await (supabase as any).from("pautas_conteudo").select("*").eq("client_id", clientId).order("dia", { ascending: true, nullsFirst: false }).order("criado_em", { ascending: true });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || /pautas_conteudo/.test(error.message ?? "")) return { pautas: [], semTabela: true };
    throw error;
  }
  return { pautas: (data ?? []).map((p: any) => ({ ...p, roteiro: Array.isArray(p.roteiro) ? p.roteiro : [] })), semTabela: false };
}

export function usePautas(clientId: string) {
  const qc = useQueryClient();
  const chave = ["pautas", clientId];
  const q = useQuery({ queryKey: chave, queryFn: () => lerPautas(clientId), staleTime: 30_000 });
  const depois = () => qc.invalidateQueries({ queryKey: chave });
  const criar = useMutation({
    mutationFn: async (p: NovaPauta) => {
      const { error } = await (supabase as any).from("pautas_conteudo").insert(p);
      if (error) throw new Error(error.code === "42501" ? "Seu acesso é só de leitura neste cliente." : error.message);
    },
    onSuccess: depois,
  });
  const atualizar = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Partial<Pauta> }) => {
      const { error } = await (supabase as any).from("pautas_conteudo").update({ ...campos, atualizado_em: new Date().toISOString() }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: depois,
  });
  const apagar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("pautas_conteudo").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: depois,
  });
  return { q, criar, atualizar, apagar };
}

type Api = ReturnType<typeof usePautas>;

/** Botões de cada ideia: transformar em pauta, gerar roteiro e adicionar ao plano da semana. */
export function AcoesDaIdeia({ ideia, clientId, api, podeEditar }: { ideia: Ideia; clientId: string; api: Api; podeEditar: boolean }) {
  const [roteiro, setRoteiro] = useState(false);
  const pautas = api.q.data?.pautas ?? [];
  const existente = pautas.find((p) => p.ideia_id === ideia.id);
  const base = ideiaParaPauta(ideia, clientId);
  const texto = roteiroCompleto(existente ?? base);
  const ocupado = api.criar.isPending || api.atualizar.isPending;
  const semTabela = api.q.data?.semTabela;

  function paraSemana() {
    const dia = proximoDiaLivre(pautas, hojeBr());
    if (existente) api.atualizar.mutate({ id: existente.id, campos: { dia, status: existente.status === "nova" ? "escolhida" : existente.status } });
    else api.criar.mutate({ ...base, dia });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {existente ? (
          <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold" style={{ background: `color-mix(in srgb, ${COR_STATUS[existente.status]} 14%, transparent)`, color: "var(--ink)" }}>
            <ClipboardList size={14} aria-hidden /> Pauta: {ROTULO_STATUS[existente.status].toLowerCase()}
            {existente.dia ? ` · ${existente.dia.slice(8, 10)}/${existente.dia.slice(5, 7)}` : ""}
          </span>
        ) : (
          podeEditar && !semTabela && (
            <button type="button" className="btn inline-flex items-center gap-1.5" disabled={ocupado} onClick={() => api.criar.mutate(base)}>
              <ClipboardList size={14} aria-hidden /> Transformar em pauta
            </button>
          )
        )}
        <button type="button" className="btn inline-flex items-center gap-1.5" aria-expanded={roteiro} onClick={() => setRoteiro(!roteiro)}>
          <FileText size={14} aria-hidden /> {roteiro ? "Esconder roteiro" : "Gerar roteiro"}
        </button>
        {podeEditar && !semTabela && !existente?.dia && (
          <button type="button" className="btn inline-flex items-center gap-1.5" disabled={ocupado} onClick={paraSemana}>
            <CalendarPlus size={14} aria-hidden /> Adicionar ao plano da semana
          </button>
        )}
      </div>
      {(api.criar.error || api.atualizar.error) && <p className="text-xs" style={{ color: "var(--crit)" }}>{mensagemDeErroAcao(api.criar.error ?? api.atualizar.error)}</p>}
      {roteiro && (
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed" style={{ font: "inherit" }}>{texto}</pre>
          <div className="mt-2"><BotaoCopiar texto={texto} rotulo="Copiar roteiro" /></div>
        </div>
      )}
    </div>
  );
}

function Sel<T extends string>({ rotulo, valor, opcoes, onChange, disabled }: { rotulo: string; valor: T; opcoes: { v: T; r: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <select aria-label={rotulo} title={rotulo} value={valor} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} autoComplete="off" className="min-h-[34px] min-w-0 rounded-md border px-1.5 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--ink)" }}>
      {opcoes.map((o) => (
        <option key={o.v} value={o.v}>{o.r}</option>
      ))}
    </select>
  );
}

function CartaoPauta({ p, dias, api, podeEditar }: { p: Pauta; dias: { data: string; rotulo: string }[]; api: Api; podeEditar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const muda = (campos: Partial<Pauta>) => api.atualizar.mutate({ id: p.id, campos });
  const referencia = publicationUrl(p.origem_texto, "instagram") ?? publicationUrl(p.origem_texto, "tiktok");
  const doRadar = p.ideia_id?.startsWith("radar:") === true;
  const orientacao = doRadar ? [`Pauta: ${p.titulo}`, `Objetivo: ${ROTULO_OBJETIVO_PAUTA[p.objetivo]}`, p.motivo, ...p.roteiro, p.aviso].filter(Boolean).join("\n\n") : roteiroCompleto(p);
  const opDias = [{ v: "", r: "Sem dia" }, ...dias.map((d) => ({ v: d.data, r: d.rotulo })), ...(p.dia && !dias.some((d) => d.data === p.dia) ? [{ v: p.dia, r: `${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}` }] : [])];
  return (
    <li className="rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--surface)", borderLeft: `3px solid ${COR_STATUS[p.status]}` }}>
      <div className="text-[13px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>{p.titulo}</div>
      <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>
        {doRadar ? "Referência do Radar" : ROTULO_ORIGEM[p.origem_tipo]} · objetivo: {ROTULO_OBJETIVO_PAUTA[p.objetivo].toLowerCase()}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Sel rotulo="Status" valor={p.status} disabled={!podeEditar} onChange={(v) => muda({ status: v })} opcoes={STATUS.map((s) => ({ v: s, r: ROTULO_STATUS[s] }))} />
        <Sel rotulo="Dia" valor={(p.dia ?? "") as string} disabled={!podeEditar} onChange={(v) => muda({ dia: v || null })} opcoes={opDias} />
        <Sel rotulo="Formato" valor={p.formato} disabled={!podeEditar} onChange={(v) => muda({ formato: v })} opcoes={(Object.keys(ROTULO_FORMATO) as FormatoPauta[]).map((f) => ({ v: f, r: ROTULO_FORMATO[f] }))} />
        <Sel rotulo="Objetivo previsto" valor={p.objetivo} disabled={!podeEditar} onChange={(v) => muda({ objetivo: v })} opcoes={(Object.keys(ROTULO_OBJETIVO_PAUTA) as ObjetivoPauta[]).map((o) => ({ v: o, r: ROTULO_OBJETIVO_PAUTA[o] }))} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <button type="button" className="min-h-[32px] text-xs font-semibold" style={{ color: "var(--accent)" }} aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
          {aberto ? "Fechar" : doRadar ? "Motivo e orientação" : "Motivo e roteiro"}
        </button>
        {podeEditar && (
          <button type="button" aria-label="Remover pauta" title="Remover pauta" className="inline-flex min-h-[32px] items-center px-1" style={{ color: "var(--muted)" }} onClick={() => confirm(`Remover a pauta “${p.titulo}”?`) && api.apagar.mutate(p.id)}>
            <Trash2 size={14} aria-hidden />
          </button>
        )}
      </div>
      {aberto && (
        <div className="mt-1 space-y-1.5 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {p.motivo && <p><b style={{ color: "var(--ink)" }}>Motivo:</b> {p.motivo}</p>}
          {p.origem_texto && <p><b style={{ color: "var(--ink)" }}>Originou de:</b> {referencia ? <a className="underline" href={referencia} target="_blank" rel="noopener noreferrer">Conferir referência original</a> : p.origem_texto}</p>}
          <pre className="whitespace-pre-wrap break-words rounded-md p-2" style={{ font: "inherit", background: "var(--surface-2)" }}>{orientacao}</pre>
          <BotaoCopiar texto={orientacao} rotulo={doRadar ? "Copiar orientação" : "Copiar roteiro"} />
        </div>
      )}
    </li>
  );
}

function NovaPautaForm({ clientId, api }: { clientId: string; api: Api }) {
  const [titulo, setTitulo] = useState("");
  const [formato, setFormato] = useState<FormatoPauta>("reels");
  const [objetivo, setObjetivo] = useState<ObjetivoPauta>("alcance");
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!titulo.trim()) return;
        api.criar.mutate(
          { client_id: clientId, ideia_id: null, titulo: titulo.trim(), formato, objetivo, status: "nova", motivo: null, origem_tipo: "manual", origem_texto: null, gancho: null, roteiro: [], cta: null, aviso: null, dia: null, post_id: null },
          { onSuccess: () => setTitulo("") },
        );
      }}
    >
      <label className="flex w-full flex-col gap-1 text-xs sm:w-auto sm:min-w-[200px] sm:flex-1" style={{ color: "var(--muted)" }}>
        Nova pauta (à mão)
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoComplete="off" placeholder="Ex.: 3 sinais de que a pele precisa de avaliação" className="min-h-[38px] rounded-lg border px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }} />
      </label>
      <Sel rotulo="Formato" valor={formato} onChange={setFormato} opcoes={(Object.keys(ROTULO_FORMATO) as FormatoPauta[]).map((f) => ({ v: f, r: ROTULO_FORMATO[f] }))} />
      <Sel rotulo="Objetivo previsto" valor={objetivo} onChange={setObjetivo} opcoes={(Object.keys(ROTULO_OBJETIVO_PAUTA) as ObjetivoPauta[]).map((o) => ({ v: o, r: ROTULO_OBJETIVO_PAUTA[o] }))} />
      <button type="submit" className="btn inline-flex items-center gap-1.5" disabled={api.criar.isPending || !titulo.trim()}>
        <Plus size={14} aria-hidden /> Adicionar
      </button>
    </form>
  );
}

/** Plano da semana editável: 7 dias, pautas sem dia, filtros por status e contagem por formato. */
export function PlanejadorSemana({ clientId, api, podeEditar }: { clientId: string; api: Api; podeEditar: boolean }) {
  const [filtro, setFiltro] = useState<StatusPauta | "todas">("todas");
  const hoje = hojeBr();
  const dias = useMemo(() => seteDias(hoje), [hoje]);
  const todas = api.q.data?.pautas ?? [];
  const pautas = filtro === "todas" ? todas : todas.filter((p) => p.status === filtro);
  const semana = montarSemana(pautas, hoje);
  const cont = contarStatus(todas);

  return (
    <section className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }} aria-label="Planejador da semana">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold"><CalendarDays size={16} aria-hidden /> Planejador da semana</h2>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>
            Pautas salvas a partir das ideias (ou criadas à mão). Mude o dia, o formato, o objetivo e o status em cada cartão.
            {!podeEditar && " Seu acesso é de leitura: só a equipe responsável altera."}
          </p>
        </div>
        {todas.length > 0 && <BotaoCopiar texto={semanaEmTexto(todas, hoje)} rotulo="Copiar plano da semana" />}
      </div>

      {api.q.isLoading && <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--text-dim)" }}><Loader2 size={14} className="animate-spin" aria-hidden /> Lendo as pautas…</p>}
      {api.q.error && <p className="mt-3 text-sm" style={{ color: "var(--crit)" }}>Não consegui ler as pautas agora. Atualize a página.</p>}
      {api.q.data?.semTabela && <p className="mt-3 text-sm" style={{ color: "var(--text-dim)" }}>O planejador ainda não foi ativado neste banco.</p>}

      {api.q.data && !api.q.data.semTabela && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(["todas", ...STATUS] as const).map((s) => (
              <button key={s} type="button" aria-pressed={filtro === s} onClick={() => setFiltro(s)} className="min-h-[34px] rounded-full border px-3 text-xs" style={{ borderColor: filtro === s ? "var(--accent)" : "var(--border)", fontWeight: filtro === s ? 600 : 400, background: "var(--surface)" }}>
                {s === "todas" ? `Todas (${todas.length})` : `${ROTULO_STATUS[s]} (${cont[s]})`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Nesta semana: {semana.formatos.map((f) => `${f.n} ${ROTULO_FORMATO[f.formato].toLowerCase()}`).join(" · ")}
          </p>

          {todas.length === 0 ? (
            <p className="mt-3 text-sm" style={{ color: "var(--text-dim)" }}>
              Nenhuma pauta ainda. Leve um conteúdo de “Revisar roteiros” ao planejador ou escolha uma sugestão em “Encontrar ideias”{podeEditar ? ", ou crie uma à mão abaixo" : ""}.
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {semana.dias.map((d) => (
                <div key={d.data} className="min-w-0 rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
                  <div className="mb-1.5 text-xs font-semibold" style={{ color: d.data === hoje ? "var(--accent)" : "var(--ink)" }}>{d.rotulo}{d.data === hoje ? " (hoje)" : ""}</div>
                  {d.pautas.length ? (
                    <ul className="space-y-1.5">{d.pautas.map((p) => <CartaoPauta key={p.id} p={p} dias={dias} api={api} podeEditar={podeEditar} />)}</ul>
                  ) : (
                    <p className="text-[11px]" style={{ color: "var(--muted)" }}>Livre</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {semana.semDia.length > 0 && (
            <div className="mt-3">
              <h3 className="mb-1.5 text-xs font-semibold" style={{ color: "var(--ink)" }}>Sem dia ({semana.semDia.length})</h3>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{semana.semDia.map((p) => <CartaoPauta key={p.id} p={p} dias={dias} api={api} podeEditar={podeEditar} />)}</ul>
            </div>
          )}
          {semana.foraDaSemana.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold">Fora desta semana ({semana.foraDaSemana.length})</summary>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{semana.foraDaSemana.map((p) => <CartaoPauta key={p.id} p={p} dias={dias} api={api} podeEditar={podeEditar} />)}</ul>
            </details>
          )}
          {(api.atualizar.error || api.apagar.error) && <p className="mt-2 text-xs" style={{ color: "var(--crit)" }}>{mensagemDeErroAcao(api.atualizar.error ?? api.apagar.error)}</p>}
          {podeEditar && <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border)" }}><NovaPautaForm clientId={clientId} api={api} /></div>}
        </>
      )}
    </section>
  );
}
