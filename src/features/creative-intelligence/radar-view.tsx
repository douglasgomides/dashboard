import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, CalendarPlus, Search } from "lucide-react";
import { Painel, Selo } from "@/components/visual";
import { EMPTY_RADAR_FILTERS, LANGUAGES, SPECIALTIES, radarReferences, referenceLanguage, type RadarReference } from "@/lib/creative-intelligence/radar";
import { listSavedReferences, saveReference, referenceToPlanner } from "./data";

const num = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? n.toLocaleString("pt-BR") : "—";
const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "não informada";
export function RadarView({ clientId, accountId, discoveries, capabilities, editable, busy, collect }: {
  clientId: string; accountId: string; discoveries: RadarReference[]; capabilities: Record<string, boolean>; editable: boolean; busy: boolean;
  collect: (input: { platform: string; query: string; since: string | null }) => void;
}) {
  const [query, setQuery] = useState(""), [platform, setPlatform] = useState("instagram"), [newer, setNewer] = useState("");
  const [filters, setFilters] = useState({ ...EMPTY_RADAR_FILTERS });
  const [draft, setDraft] = useState<RadarReference | null>(null), [title, setTitle] = useState(""), [reason, setReason] = useState(""), [objective, setObjective] = useState("autoridade");
  const [notice, setNotice] = useState("");
  const qc = useQueryClient(), key = ["radar-references", clientId, accountId];
  const saved = useQuery({ queryKey: key, enabled: !!accountId, queryFn: () => listSavedReferences(clientId, accountId) });
  const mutation = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: key }); await qc.invalidateQueries({ queryKey: ["pautas", clientId] }); },
  });
  const languages = useMemo(() => new Map(radarReferences(discoveries, saved.data ?? [], EMPTY_RADAR_FILTERS).map(d => [d.canonical_url, referenceLanguage(d)])), [discoveries, saved.data]);
  const rows = useMemo(() => radarReferences(discoveries, saved.data ?? [], filters, d => languages.get(d.canonical_url) ?? null), [discoveries, saved.data, filters, languages]);
  const working = busy || mutation.isPending;
  const bookmark = (d: RadarReference) => saved.data?.find(s => s.canonical_url === d.canonical_url);
  const create = async () => {
    if (!draft) return;
    const reference = bookmark(draft) ?? await saveReference(clientId, draft.id);
    await referenceToPlanner(clientId, reference.id, title, reason, objective);
    setDraft(null); setNotice("Pauta salva no Plano da semana. A referência original foi preservada.");
  };
  function prepare(d: RadarReference) {
    setDraft(d); setTitle(filters.topic.trim() ? `Orientações sobre ${filters.topic.trim()}` : "");
    setReason(filters.specialty || filters.topic ? `Referência selecionada por ${[SPECIALTIES.find(s => s.id === filters.specialty)?.label, filters.topic].filter(Boolean).join(" e ")}. Adaptar o assunto às dúvidas da clínica.` : "");
    setObjective("autoridade"); setNotice(""); mutation.reset();
  }
  return <Painel icone={Search} titulo="Radar de mercado" resumo="Pesquise referências públicas, escolha as relevantes e leve uma pauta para o planejamento.">
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); collect({ platform, query, since: newer || null }); }}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">{platform === "instagram" ? "Hashtag do Instagram" : "Tema ou palavra-chave do TikTok"}
          <input className="field mt-1 w-full" value={query} onChange={e => setQuery(e.target.value)} minLength={2} maxLength={200} required pattern={platform === "instagram" ? "#?[\\p{L}\\p{N}_]{2,100}" : undefined} title={platform === "instagram" ? "Use uma hashtag sem espaços ou endereço de perfil." : undefined} placeholder={platform === "instagram" ? "Ex.: dermatologia" : "Ex.: cuidados com a pele"} />
        </label>
        <label className="text-sm">Plataforma<select className="field mt-1 w-full" value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="instagram">Instagram · hashtags</option><option value="tiktok" disabled={!capabilities.external_search_tiktok}>TikTok · busca pública{!capabilities.external_search_tiktok ? " · em configuração" : ""}</option>
        </select></label>
        <label className="text-sm">Coletar publicações desde<input className="field mt-1 w-full" type="date" value={newer} onChange={e => setNewer(e.target.value)} /></label>
      </div>
      <button className="btn" disabled={!editable || !accountId || !capabilities.external_search || (platform === "tiktok" && !capabilities.external_search_tiktok) || working}>Pesquisar referências públicas</button>
      <p className="text-xs" style={{ color: "var(--muted)" }}>Uma nova pesquisa usa o limite de coleta da clínica. Os filtros abaixo trabalham com as referências já coletadas.</p>
    </form>
    {!capabilities.external_search && <p className="creative-notice mt-4">A pesquisa externa está em configuração. As referências já coletadas continuam disponíveis.</p>}
    <fieldset className="mt-6 space-y-3 rounded-lg border p-4" style={{ borderColor: "var(--border)" }}>
      <legend className="px-2 font-semibold">Refinar referências coletadas</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Tema na legenda<input className="field mt-1 w-full" value={filters.topic} maxLength={150} onChange={e => setFilters({ ...filters, topic: e.target.value })} placeholder="Ex.: melasma" /></label>
        <label className="text-sm">Especialidade no texto<select className="field mt-1 w-full" value={filters.specialty} onChange={e => setFilters({ ...filters, specialty: e.target.value })}><option value="">Todas</option>{SPECIALTIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <label className="text-sm">Idioma estimado<select className="field mt-1 w-full" value={filters.language} onChange={e => setFilters({ ...filters, language: e.target.value })}><option value="">Todos</option>{Object.entries(LANGUAGES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}<option value="unknown">Não identificado</option></select></label>
        <label className="text-sm">Publicação desde<input className="field mt-1 w-full" type="date" value={filters.since} max={filters.until || undefined} onChange={e => setFilters({ ...filters, since: e.target.value })} /></label>
        <label className="text-sm">Publicação até<input className="field mt-1 w-full" type="date" value={filters.until} min={filters.since || undefined} onChange={e => setFilters({ ...filters, until: e.target.value })} /></label>
        <label className="text-sm">Formato<select className="field mt-1 w-full" value={filters.format} onChange={e => setFilters({ ...filters, format: e.target.value })}><option value="">Carrosséis e vídeos</option><option value="carrossel">Carrosséis</option><option value="reels">Vídeos</option></select></label>
      </div>
      <div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.savedOnly} onChange={e => setFilters({ ...filters, savedOnly: e.target.checked })} />Somente referências salvas</label><button type="button" className="btn" onClick={() => setFilters({ ...EMPTY_RADAR_FILTERS })}>Limpar filtros</button></div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>Especialidade e tema são correspondências no texto público. O idioma é estimado pela legenda; textos curtos podem ficar sem identificação. País não confirmado.</p>
    </fieldset>
    {saved.isError && <div role="alert" className="creative-notice mt-4"><p>{saved.error.message}</p><button type="button" className="btn" onClick={() => void saved.refetch()}>Tentar carregar referências salvas</button></div>}
    {mutation.isError && <p role="alert" className="creative-notice mt-4">{mutation.error.message}</p>}
    {notice && <p role="status" className="creative-notice mt-4">{notice} <a className="underline" href={`/${clientId}/ideias?visao=semana`}>Abrir o planejador</a></p>}
    <p role="status" className="mt-5 text-sm">{rows.length} referência(s) nos filtros · {saved.data?.length ?? 0} salva(s)</p>
    <div className="mt-3 grid gap-3 md:grid-cols-2">{rows.map(d => {
      const existing = bookmark(d), language = languages.get(d.canonical_url);
      return <article className="creative-structure" key={d.canonical_url}>
        <div className="flex flex-wrap gap-2"><Selo>Popularidade observada</Selo>{existing && <Selo>Referência salva</Selo>}</div>
        <h3 className="mt-2 font-semibold">{d.title}</h3>
        <p className="my-2 text-sm">{d.platform} · {num(d.metadata.views)} visualizações · {num(d.metadata.likes)} curtidas</p>
        <p className="mb-2 text-xs">Publicada em {date(d.metadata.posted_at)} · Coletada em {date(d.observed_at)} · Idioma: {language ? `${LANGUAGES[language]} (estimado)` : "não identificado"}</p>
        <a className="underline" href={d.canonical_url} target="_blank" rel="noopener noreferrer">Conferir referência original</a>
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>País não confirmado. Uma observação não comprova tendência nem pacientes adquiridos.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn" disabled={!editable || working || !!existing || saved.isPending || saved.isError} onClick={() => mutation.mutate(async () => { await saveReference(clientId, d.id); setNotice("Referência salva para esta conta da clínica."); })}><Bookmark size={14} aria-hidden />{existing ? "Salva" : "Salvar referência"}</button>
          {existing?.pauta_id ? <a className="btn" href={`/${clientId}/ideias?visao=semana`}>Ver pauta no planejador</a> : <button type="button" className="btn" disabled={!editable || working || saved.isPending || saved.isError} onClick={() => prepare(d)}><CalendarPlus size={14} aria-hidden />Preparar pauta</button>}
        </div>
        {draft?.id === d.id && <form className="mt-4 space-y-3 border-t pt-4" aria-label="Pauta a partir da referência" onSubmit={e => { e.preventDefault(); mutation.mutate(create); }}>
          <p className="text-sm">Defina um assunto original para a clínica. A pauta guarda a fonte e fica para revisão da equipe.</p>
          <label className="block text-sm">Tema da pauta<input className="field mt-1 w-full" required minLength={3} maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label className="block text-sm">Por que faz sentido para a clínica<textarea className="field mt-1 w-full" required minLength={10} maxLength={1800} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <label className="block text-sm">Objetivo da pauta<select className="field mt-1 w-full" value={objective} onChange={e => setObjective(e.target.value)}><option value="autoridade">Autoridade</option><option value="salvamento">Salvamento</option><option value="alcance">Alcance</option><option value="conversa">Conversa</option></select></label>
          <div className="flex flex-wrap gap-2"><button className="btn" disabled={working || !editable}>Salvar pauta no planejador</button><button type="button" className="btn" disabled={working} onClick={() => setDraft(null)}>Cancelar pauta</button></div>
        </form>}
      </article>;
    })}</div>
    {!rows.length && <p className="note mt-4">Nenhuma referência encontrada com esses filtros. Limpe os filtros ou pesquise outra hashtag.</p>}
  </Painel>;
}
