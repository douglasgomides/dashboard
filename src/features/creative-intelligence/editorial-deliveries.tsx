import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BotaoCopiar } from "@/components/botao-copiar";
import { adaptationBrief } from "@/lib/creative-intelligence/editorial";
import type { CreativeAdaptation } from "@/lib/creative-intelligence/contracts";
import { listEditorialDeliveries, toPlanner } from "./data";

export function EditorialDeliveries({ clientId, editable }: { clientId: string; editable: boolean }) {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ["creative-editorial", clientId], initialPageParam: 0,
    queryFn: ({ pageParam }) => listEditorialDeliveries(clientId, pageParam),
    getNextPageParam: (last, pages) => last.length === 20 ? pages.length * 20 : undefined,
    staleTime: 30_000, retry: false,
  });
  const send = useMutation({
    mutationFn: (id: string) => toPlanner(clientId, id),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["creative-editorial", clientId] }),
        qc.invalidateQueries({ queryKey: ["creative-workspace", clientId] }),
        qc.invalidateQueries({ queryKey: ["pautas", clientId] }),
      ]);
    },
  });
  const deliveries = q.data?.pages.flat() ?? [];
  return <section aria-label="Conteúdos da Inteligência Criativa" className="mt-4 space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
    <div>
      <h2 className="text-base font-semibold">Conteúdos da Inteligência Criativa</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>Carrosséis slide a slide e Reels com a fala completa. Revise a proposta, produza no estúdio e organize a publicação no mesmo planejador.</p>
    </div>
    <Link className="btn inline-flex" to="/$clientId/inteligencia-criativa" params={{ clientId }} search={{ aba: "acervo" }}>Analisar uma referência</Link>
    {q.isPending && <p role="status">Carregando conteúdos adaptados…</p>}
    {q.isError && <div role="alert"><p>{q.error.message}</p><button type="button" className="btn mt-2" onClick={() => void q.refetch()}>Tentar carregar conteúdos novamente</button></div>}
    {q.isSuccess && deliveries.length === 0 && <p className="text-sm">Nenhuma adaptação salva nesta clínica. Escolha uma publicação na Inteligência Criativa para analisar a estrutura e adaptá-la a um novo tema.</p>}
    {send.isError && <p role="alert">{send.error.message}</p>}
    <div className="grid gap-3 lg:grid-cols-2">
      {deliveries.map((a) => <Delivery key={a.id} a={a} editable={editable} busy={send.isPending} onPlanner={() => send.mutate(a.id)} />)}
    </div>
    {q.hasNextPage && <button type="button" className="btn" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Carregar mais conteúdos</button>}
  </section>;
}

function Delivery({ a, editable, busy, onPlanner }: { a: CreativeAdaptation; editable: boolean; busy: boolean; onPlanner: () => void }) {
  const [open, setOpen] = useState(false);
  const d = a.document;
  const search = { conta: a.account_id, adaptacao: a.id };
  return <article className="min-w-0 space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
    <p className="text-xs" style={{ color: "var(--muted)" }}>{d.format === "carrossel" ? `Carrossel · ${d.units.length} slides` : `Reels · ${d.units.length} blocos`} · {a.published_post_id ? "Publicação vinculada" : a.pauta_id ? "No planejador" : "Proposta para revisão"}</p>
    <h3 className="font-semibold">{d.title}</h3>
    <p className="text-sm" style={{ color: "var(--ink-2)" }}>{d.hook}</p>
    <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Fechar conteúdo" : "Ler conteúdo completo"}</button>
    {open && <div className="space-y-3">
      {d.units.map((u) => <div key={u.position}><h4 className="text-sm font-semibold">{d.format === "carrossel" ? "Slide" : "Bloco"} {u.position}</h4><p className="whitespace-pre-wrap text-sm leading-relaxed">{u.copy}</p></div>)}
      <div><h4 className="text-sm font-semibold">Legenda</h4><p className="whitespace-pre-wrap text-sm">{d.caption}</p></div>
      <div><h4 className="text-sm font-semibold">Chamada</h4><p className="text-sm">{d.cta}</p></div>
      <div><h4 className="text-sm font-semibold">Revisão médica pendente</h4><ul className="list-disc pl-5 text-sm">{[...d.medical_review_flags, ...d.clinical_claims_requiring_verification].map((v, i) => <li key={i}>{v}</li>)}</ul></div>
      <BotaoCopiar texto={adaptationBrief(a)} rotulo="Copiar conteúdo e briefing" />
    </div>}
    <div className="flex flex-wrap gap-2">
      <Link className="btn" to="/$clientId/inteligencia-criativa" params={{ clientId: a.client_id }} search={{ ...search, aba: "biblioteca" }}>Comparar com original</Link>
      <Link className="btn" to="/$clientId/inteligencia-criativa" params={{ clientId: a.client_id }} search={{ ...search, aba: "producao" }}>{editable ? "Produzir no estúdio" : "Ver produção"}</Link>
      {editable && !a.pauta_id && <button type="button" className="btn" disabled={busy} onClick={onPlanner}>Levar ao planejador</button>}
    </div>
  </article>;
}
