import { useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Loader2, Plus, QrCode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BotaoCopiar } from "@/components/botao-copiar";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { POSICOES, slugPersonalizado, taxa, type Posicao } from "@/lib/rastreio";
import { limitesBR } from "@/lib/client-data";
import { fetchAllRows } from "@/lib/pagination";

// Links rastreados (src/lib/rastreio.ts): de onde vem cada conversa. A equipe gera um link para cada lugar (bio,
// story, destaque, QR...), o clique é registrado e a conversa que chega é ligada ao link. O funil mostra
// cliques → conversas → agendou → vendas por origem, no período escolhido.
const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");
export const Route = createFileRoute("/_authenticated/$clientId/links")({ component: LinksPage });

const db = supabase as any;
interface LinkRow { id: string; slug: string | null; short_url: string | null; tipo: string; titulo: string | null; campanha: string | null; destino_tipo: string; ativo: boolean; criado_em: string; codigo_ref: string }
interface Funil { link_id: string; cliques: number; conversas: number; provaveis: number; agendou: number; vendas: number; receita: number }

async function chamar(clientId: string, corpo: Record<string, unknown>) {
  const { data: s } = await supabase.auth.getSession();
  const r = await fetch("/api/sync/manual", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` }, body: JSON.stringify({ client_id: clientId, alvo: "link_rastreado", ...corpo }) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok !== true) throw new Error(j?.error ?? j?.erro ?? `Não foi possível confirmar a alteração (${r.status}).`);
  return j as { url: string; ref: string };
}
const urlDo = (l: LinkRow) => (l.slug ? `${window.location.origin}/r/${l.slug}` : l.short_url ?? "");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Gerador({ clientId, aoCriar }: { clientId: string; aoCriar: () => void }) {
  const [tipo, setTipo] = useState<Posicao>("bio");
  const [titulo, setTitulo] = useState("");
  const [frase, setFrase] = useState("");
  const [destino, setDestino] = useState<"whatsapp" | "site">("whatsapp");
  const [site, setSite] = useState("");
  const [numero, setNumero] = useState("");
  const [final, setFinal] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState<string | null>(null);
  async function criar() {
    setSalvando(true); setErro(null); setNovo(null);
    try {
      const r = await chamar(clientId, { tipo, titulo, frase, destino_tipo: destino, site_url: site, numero_whatsapp: numero, campanha: titulo, slug: final });
      setNovo(r.url); setTitulo(""); setFinal(""); aoCriar();
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); } finally { setSalvando(false); }
  }
  const campo = "min-h-[36px] w-full rounded-md border px-2 text-sm";
  const estilo = { borderColor: "var(--border)", background: "var(--surface)" };
  return (
    <section aria-labelledby="gerador" className="space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h3 id="gerador" className="flex items-center gap-1.5 text-sm font-semibold"><Plus size={16} aria-hidden /> Gerar link rastreado</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Onde o link vai ficar
          <select className={campo} style={estilo} value={tipo} onChange={(e) => setTipo(e.target.value as Posicao)} autoComplete="off">
            {(Object.keys(POSICOES) as Posicao[]).map((p) => <option key={p} value={p}>{POSICOES[p].rotulo}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Nome para achar depois
          <input className={campo} style={estilo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tipo === "story" ? "Ex.: Story 20/10 caixinha de dúvidas" : "Ex.: Bio principal"} autoComplete="off" />
        </label>
        <label className="text-xs font-semibold">Final do link (opcional)
          <input className={campo} style={estilo} value={final} onChange={(e) => setFinal(e.target.value)} placeholder="Ex.: drajulia (vazio = gera um curto)" autoComplete="off" />
          <span className="mt-0.5 block font-normal" style={{ color: "var(--muted)" }}>{final.trim() ? (slugPersonalizado(final) ? `Fica: ${window.location.host}/r/${slugPersonalizado(final)}` : "Use de 3 a 30 letras, números ou hífen.") : "Dá para trocar depois sem quebrar o link antigo."}</span>
        </label>
        <label className="text-xs font-semibold">Destino
          <select className={campo} style={estilo} value={destino} onChange={(e) => setDestino(e.target.value as "whatsapp" | "site")} autoComplete="off">
            <option value="whatsapp">WhatsApp da clínica</option>
            <option value="site">Site ou página (com UTM)</option>
          </select>
        </label>
        {destino === "site" ? (
          <label className="text-xs font-semibold">Endereço do site
            <input className={campo} style={estilo} value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://..." inputMode="url" autoComplete="off" />
          </label>
        ) : (
          <label className="text-xs font-semibold">WhatsApp (vazio = o da ficha da clínica)
            <input className={campo} style={estilo} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="(67) 99999-9999" inputMode="tel" autoComplete="off" />
          </label>
        )}
        {destino === "whatsapp" && (
          <label className="text-xs font-semibold sm:col-span-2">Mensagem que já vem escrita para o paciente
            <input className={campo} style={estilo} value={frase} onChange={(e) => setFrase(e.target.value)} placeholder={POSICOES[tipo].frase} autoComplete="off" />
            <span className="mt-0.5 block font-normal" style={{ color: "var(--muted)" }}>Uma referência curta entra no fim (ex.: "ref A7K9QX"). Se o paciente apagar, a conversa ainda é reconhecida pela frase ou pelo horário do clique.</span>
          </label>
        )}
      </div>
      <button type="button" className="btn inline-flex items-center gap-1.5" disabled={salvando} onClick={criar}>{salvando ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Link2 size={14} aria-hidden />} Gerar link</button>
      {erro && <p className="text-sm" style={{ color: "var(--crit)" }}>{erro}</p>}
      {novo && <p className="flex flex-wrap items-center gap-2 text-sm">Pronto: <code className="rounded px-1" style={{ background: "var(--surface-2)" }}>{novo}</code> <BotaoCopiar texto={novo} rotulo="Copiar" /></p>}
    </section>
  );
}

function LinksPage() {
  const { clientId } = Route.useParams();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  const q = useQuery({
    queryKey: ["links-rastreados", clientId, start, end],
    retry: false,
    queryFn: async () => {
      const { desde, antesDe } = limitesBR(start, end);
      const [ls, f] = await Promise.all([
        fetchAllRows<LinkRow>((from, to) => db.from("links_rastreados").select("id, slug, short_url, tipo, titulo, campanha, destino_tipo, ativo, criado_em, codigo_ref").eq("client_id", clientId).order("criado_em", { ascending: false }).order("id").range(from, to)),
        fetchAllRows<Funil>((from, to) => db.rpc("links_funil", { p_client_id: clientId, p_desde: desde, p_antes_de: antesDe }).order("link_id").range(from, to)),
      ]);
      const funil = new Map<string, Funil>(f.map((x) => [x.link_id, x]));
      return { links: ls, funil };
    },
  });
  const [verInativos, setVerInativos] = useState(false);
  const [edicao, setEdicao] = useState<{ id: string; slug: string } | null>(null);
  const alterar = useMutation({
    mutationFn: (corpo: Record<string, unknown>) => chamar(clientId, corpo),
    onSuccess: async () => { setEdicao(null); await qc.invalidateQueries({ queryKey: ["links-rastreados", clientId] }); },
  });
  const links = (q.data?.links ?? []).filter((l) => verInativos || l.ativo);
  const f = (id: string) => q.data?.funil.get(id) ?? { link_id: id, cliques: 0, conversas: 0, provaveis: 0, agendou: 0, vendas: 0, receita: 0 };
  // Total por lugar (bio, story...): o resumo que responde "de onde vêm os pacientes".
  const porTipo = new Map<string, Funil>();
  for (const l of q.data?.links ?? []) {
    const x = f(l.id), t = porTipo.get(l.tipo) ?? { link_id: l.tipo, cliques: 0, conversas: 0, provaveis: 0, agendou: 0, vendas: 0, receita: 0 };
    porTipo.set(l.tipo, { ...t, cliques: t.cliques + Number(x.cliques), conversas: t.conversas + Number(x.conversas), provaveis: t.provaveis + Number(x.provaveis), agendou: t.agendou + Number(x.agendou), vendas: t.vendas + Number(x.vendas), receita: t.receita + Number(x.receita) });
  }
  const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide";
  const td = "px-2 py-1.5 text-sm tabular-nums";
  return (
    <div className="space-y-4">
      <div className="hpagehead">
        <h2>Links rastreados</h2>
        <p>Um link para cada lugar (bio, cada story, destaques, QR code no consultório, parceiros). O sistema conta os cliques, reconhece a conversa que chega no WhatsApp e mostra quantas viraram agendamento e venda. Período: {formatRangeLabel({ start, end })}.</p>
        <p className="mt-2 text-xs">Cliques e início das conversas respeitam o período. Agendamento reflete o resumo atual dessas conversas. Vendas exigem evento de ganho registrado até a data final; o valor é o cadastrado no CRM e não comprova pagamento. Um mesmo lead pode aparecer em mais de um link.</p>
      </div>
      {isAdmin && <Gerador clientId={clientId} aoCriar={() => qc.invalidateQueries({ queryKey: ["links-rastreados", clientId] })} />}
      {q.isError && <div role="alert" className="card"><p>Não foi possível carregar os links e suas contagens. Nenhum resultado foi considerado zero.</p><button type="button" className="btn" disabled={q.isFetching} onClick={() => void q.refetch()}>Tentar novamente</button></div>}
      {alterar.isError && <p role="alert" style={{ color: "var(--crit)" }}>{alterar.error.message}</p>}
      {alterar.isSuccess && <p role="status">Alteração salva.</p>}
      {porTipo.size > 0 && (
        <section aria-labelledby="por-lugar" className="overflow-x-auto rounded-xl border" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h3 id="por-lugar" className="px-4 pt-3 text-sm font-semibold">De onde vêm as conversas</h3>
          <table className="mt-2 w-full min-w-[560px]">
            <thead style={{ color: "var(--muted)" }}><tr><th className={th}>Lugar</th><th className={th}>Cliques</th><th className={th}>Conversas</th><th className={th}>Agendou</th><th className={th}>Vendas</th><th className={th}>Clique → conversa</th><th className={th}>Conversa → agendou</th></tr></thead>
            <tbody>{[...porTipo.entries()].sort((a, b) => b[1].conversas - a[1].conversas).map(([t, x]) => (
              <tr key={t} className="border-t" style={{ borderColor: "var(--border)" }}><td className={td}>{POSICOES[t as Posicao]?.rotulo ?? t}</td><td className={td}>{x.cliques}</td><td className={td}>{x.conversas}</td><td className={td}>{x.agendou}</td><td className={td}>{x.vendas}{x.receita ? ` (${brl(x.receita)})` : ""}</td><td className={td}>{taxa(x.conversas, x.cliques)}</td><td className={td}>{taxa(x.agendou, x.conversas)}</td></tr>
            ))}</tbody>
          </table>
        </section>
      )}
      <section aria-labelledby="todos" className="space-y-2">
        <div className="flex items-center justify-between gap-2"><h3 id="todos" className="text-sm font-semibold">Todos os links</h3>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={verInativos} onChange={(e) => setVerInativos(e.target.checked)} /> Mostrar arquivados</label></div>
        {q.isLoading ? <p role="status">Carregando links e resultados…</p> : q.isError && !q.data ? null : links.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>{isAdmin ? "Nenhum link ainda. Gere o primeiro (comece pelo link da bio) e troque no Instagram." : "A equipe Doctor Creator ainda não criou links rastreados para esta clínica."}</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {links.map((l) => {
              const x = f(l.id), url = urlDo(l);
              return (
                <article key={l.id} className="rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", opacity: l.ativo ? 1 : 0.55 }}>
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>
                    <span>{POSICOES[l.tipo as Posicao]?.rotulo ?? l.tipo}{l.destino_tipo === "site" ? " · site" : ""}</span>
                    <span style={{ color: "var(--muted)" }}>{new Date(l.criado_em).toLocaleDateString("pt-BR")}</span>
                  </div>
                  <h4 className="mt-0.5 text-[15px] font-semibold">{l.titulo ?? "Link"}</h4>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs"><code className="break-all rounded px-1" style={{ background: "var(--surface-2)" }}>{url}</code> <BotaoCopiar texto={url} rotulo="Copiar" />
                    {l.slug && <a className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--accent)" }} href={`https://api.qrserver.com/v1/create-qr-code/?size=800x800&margin=16&data=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer"><QrCode size={13} aria-hidden /> QR code</a>}</p>
                  <p className="mt-2 text-xs tabular-nums" style={{ color: "var(--ink-2)" }}>
                    <b>{x.cliques}</b> cliques · <b>{x.conversas}</b> conversas{x.provaveis ? ` (${x.provaveis} pelo horário)` : ""} · <b>{x.agendou}</b> agendaram · <b>{x.vendas}</b> vendas{x.receita ? ` (${brl(Number(x.receita))})` : ""}
                  </p>
                  {isAdmin && l.slug && (
                    <div className="mt-1 flex flex-wrap gap-3 text-xs">
                      <button type="button" disabled={alterar.isPending} style={{ color: "var(--accent)" }} onClick={() => { alterar.reset(); setEdicao({ id: l.id, slug: l.slug! }); }}>Editar final do link</button>
                      <button type="button" disabled={alterar.isPending} style={{ color: "var(--muted)" }} onClick={() => alterar.mutate({ acao: l.ativo ? "inativo" : "ativo", id: l.id })}>{l.ativo ? "Arquivar (o link continua funcionando)" : "Desarquivar"}</button>
                    </div>
                  )}
                  {isAdmin && edicao?.id === l.id && <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); alterar.mutate({ acao: "renomear", id: l.id, slug: edicao.slug }); }}>
                    <label className="block text-sm">Novo final do link<input className="input block w-full" value={edicao.slug} onChange={(e) => setEdicao({ ...edicao, slug: e.target.value })} maxLength={100} /></label>
                    <p className="text-xs">O endereço antigo continua funcionando.</p>
                    <button type="submit" className="btn" disabled={alterar.isPending || !slugPersonalizado(edicao.slug)}>Salvar final do link</button>{" "}
                    <button type="button" className="btn" disabled={alterar.isPending} onClick={() => setEdicao(null)}>Cancelar edição</button>
                  </form>}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
