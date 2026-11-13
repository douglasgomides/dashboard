import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Filter, Link2, Loader2, MessageCircle, MousePointerClick, Plus, QrCode, Trophy } from "lucide-react";
import { NxCard, NxHBar } from "@/components/nx";
import { NxFunil, NxComoCalcula, NxNota } from "@/components/nx/anuncios-graficos";
import { PaginaNexo } from "@/components/nx/pagina";
import { NxBlocoDoVerTudo } from "@/components/nx/cabeca-do-bloco";
import { NxComecoDosDetalhes, NxDescobertasDaAba } from "@/components/nx/leitura-da-aba";
import { NxCartaoNumero } from "@/components/nx/cartoes";
import { NxCarregando, NxErro, NxTabela } from "@/components/nx/blocos";
import { usePublicarContagem } from "@/components/nx/abas-em-pasta";
import { fatosDosLinks } from "@/lib/leitura/fatos-anuncios";
import { leituraDaAba } from "@/lib/leitura/leitura-das-abas";
import { cabecaDoCliqueAVenda, cabecaDosLinks, cabecaPorLugar } from "@/lib/leitura/ver-tudo-links";
import { hojeBrasilia } from "@/lib/status-fonte";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BotaoCopiar } from "@/components/botao-copiar";
import { QrLink } from "@/components/qr-link";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { baseDoLink, fraseSemCodigo, NOME_MAX, POSICOES, sugerirNomeLink, taxa, urlCurta, urlDoLink, validarNomeLink, type Posicao } from "@/lib/rastreio";
import { getClient, limitesBR } from "@/lib/client-data";
import { fetchAllRows } from "@/lib/pagination";
import { mensagemDeErro, mensagemDeErroAcao } from "@/lib/erro-amigavel";

// Links rastreados (src/lib/rastreio.ts): de onde vem cada conversa. A equipe gera um link curto para cada lugar (bio,
// story, destaque, QR...), o clique é registrado e a conversa que chega é ligada ao link pelo código no fim da mensagem
// (R27). O funil mostra cliques → conversas → agendou → vendas por origem, no período escolhido.
const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");
export const Route = createFileRoute("/_authenticated/$clientId/links")({ component: LinksPage });

const db = supabase as any;
// Domínio curto dos links (VITE_LINK_BASE_URL). Nunca o endereço do painel aberto no navegador.
const BASE = baseDoLink(import.meta.env.VITE_LINK_BASE_URL as string | undefined);
interface LinkRow { id: string; slug: string | null; short_url: string | null; tipo: string; titulo: string | null; campanha: string | null; destino_tipo: string; ativo: boolean; criado_em: string; codigo_ref: string; mensagem_modelo: string | null }
interface Funil { link_id: string; cliques: number; conversas: number; provaveis: number; agendou: number; vendas: number; receita: number }

async function chamar(clientId: string, corpo: Record<string, unknown>) {
  const { data: s } = await supabase.auth.getSession();
  const r = await fetch("/api/sync/manual", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` }, body: JSON.stringify({ client_id: clientId, alvo: "link_rastreado", ...corpo }) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok !== true) throw new Error(j?.error ?? j?.erro ?? `Não foi possível confirmar a alteração (${r.status}).`);
  return j as { url: string; ref: string; mensagem?: string | null; valido?: boolean; livre?: boolean; motivo?: string; slug?: string };
}
const urlDo = (l: LinkRow) => (l.slug ? urlDoLink(l.slug, BASE) : l.short_url ?? "");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type Conferencia = { estado: "vazio" | "conferindo" | "livre" | "em_uso" | "invalido" | "erro"; texto: string };
/** Confere o nome enquanto a equipe digita: regra local na hora, "já existe" pelo servidor depois de uma pausa. */
function useConferirNome(clientId: string, nome: string, exceto?: string): Conferencia {
  const v = validarNomeLink(nome);
  const [r, setR] = useState<{ slug: string; livre: boolean } | "erro" | null>(null);
  const slug = v.ok ? v.slug : null;
  useEffect(() => {
    setR(null);
    if (!slug) return;
    let vivo = true;
    const t = setTimeout(() => {
      chamar(clientId, { acao: "conferir", slug, ...(exceto ? { id: exceto } : {}) })
        .then((j) => { if (vivo) setR({ slug, livre: j.livre === true }); })
        .catch(() => { if (vivo) setR("erro"); });
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [clientId, slug, exceto]);
  if (!nome.trim()) return { estado: "vazio", texto: "" };
  if (!v.ok) return { estado: "invalido", texto: v.motivo };
  if (r === "erro") return { estado: "erro", texto: `Fica: ${urlCurta(v.slug, BASE)}. Não deu para conferir se o nome está livre agora; o sistema confere de novo ao salvar.` };
  if (!r || r.slug !== v.slug) return { estado: "conferindo", texto: `Fica: ${urlCurta(v.slug, BASE)} (conferindo se está livre...)` };
  return r.livre
    ? { estado: "livre", texto: `Fica: ${urlCurta(v.slug, BASE)}. Nome livre.` }
    : { estado: "em_uso", texto: `Esse nome já existe em outro link. Escolha outro (ex.: ${v.slug.slice(0, NOME_MAX - 2)}-2).` };
}

function Gerador({ clientId, nomesUsados, aoCriar }: { clientId: string; nomesUsados: string[]; aoCriar: () => void }) {
  const { data: cliente } = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId) });
  const [tipo, setTipo] = useState<Posicao>("bio");
  const [titulo, setTitulo] = useState("");
  const [frase, setFrase] = useState("");
  const [destino, setDestino] = useState<"whatsapp" | "site">("whatsapp");
  const [site, setSite] = useState("");
  const [numero, setNumero] = useState("");
  const [nome, setNome] = useState("");
  const [nomeMexido, setNomeMexido] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ url: string; slug: string; mensagem: string | null } | null>(null);
  // Sugestão: primeiro nome da clínica + lugar ("juliana-bio"). Para de sugerir quando a equipe escreve o próprio nome.
  const sugestao = sugerirNomeLink(cliente?.name, tipo, nomesUsados);
  useEffect(() => { if (!nomeMexido) setNome(sugestao); }, [sugestao, nomeMexido]);
  const conf = useConferirNome(clientId, nome);
  const podeSalvar = !salvando && (conf.estado === "livre" || conf.estado === "conferindo" || conf.estado === "erro");
  async function criar() {
    setSalvando(true); setErro(null); setNovo(null);
    try {
      const slug = validarNomeLink(nome).ok ? nome : "";
      const r = await chamar(clientId, { tipo, titulo, frase, destino_tipo: destino, site_url: site, numero_whatsapp: numero, campanha: titulo, slug });
      const v = validarNomeLink(nome);
      setNovo({ url: r.url, slug: v.ok ? v.slug : r.url.split("/r/")[1] ?? "link", mensagem: r.mensagem ?? null });
      setTitulo(""); setFrase(""); setNomeMexido(false); aoCriar();
    } catch (e) { setErro(mensagemDeErroAcao(e)); } finally { setSalvando(false); }
  }
  const campo = "min-h-[36px] w-full rounded-md border px-2 text-sm";
  const estilo = { borderColor: "var(--border)", background: "var(--surface)" };
  const corConf = conf.estado === "invalido" || conf.estado === "em_uso" ? "var(--crit)" : "var(--muted)";
  return (
    <section aria-labelledby="gerador" className="space-y-3 rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <h3 id="gerador" className="flex items-center gap-1.5 text-sm font-semibold"><Plus size={16} aria-hidden /> Criar link curto</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold">Onde o link vai ficar
          <select className={campo} style={estilo} value={tipo} onChange={(e) => setTipo(e.target.value as Posicao)} autoComplete="off">
            {(Object.keys(POSICOES) as Posicao[]).map((p) => <option key={p} value={p}>{POSICOES[p].rotulo}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold">Nome do link (o que aparece no endereço)
          <input className={campo} style={estilo} value={nome} maxLength={60} onChange={(e) => { setNome(e.target.value); setNomeMexido(true); }} placeholder="Ex.: juliana-bio" autoComplete="off" spellCheck={false} aria-describedby="nome-link-ajuda" />
          <span id="nome-link-ajuda" className="mt-0.5 block font-normal" role="status" style={{ color: corConf }}>{conf.texto || `Letras minúsculas, números e hífen, até ${NOME_MAX}. Sugestão: ${sugestao}.`}</span>
          {nomeMexido && nome !== sugestao && <button type="button" className="mt-0.5 text-xs font-normal underline" style={{ color: "var(--accent)" }} onClick={() => setNomeMexido(false)}>Usar a sugestão ({sugestao})</button>}
        </label>
        <label className="text-xs font-semibold">Nome para achar depois (só a equipe vê)
          <input className={campo} style={estilo} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tipo === "story" ? "Ex.: Story 20/10 caixinha de dúvidas" : "Ex.: Bio principal"} autoComplete="off" />
        </label>
        <label className="text-xs font-semibold">Para onde o link leva
          <select className={campo} style={estilo} value={destino} onChange={(e) => setDestino(e.target.value as "whatsapp" | "site")} autoComplete="off">
            <option value="whatsapp">WhatsApp da clínica</option>
            <option value="site">Site ou página</option>
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
            <input className={campo} style={estilo} value={frase} maxLength={200} onChange={(e) => setFrase(e.target.value)} placeholder={POSICOES[tipo].frase} autoComplete="off" />
            <span className="mt-0.5 block font-normal" style={{ color: "var(--muted)" }}>O paciente vai ver: "{fraseSemCodigo(frase) || POSICOES[tipo].frase} (R27)". O código no fim (R27 é um exemplo) é criado ao salvar e mostra de qual link a conversa veio. Se o paciente apagar, a conversa ainda é reconhecida pela frase ou pelo horário do clique.</span>
          </label>
        )}
      </div>
      <button type="button" className="btn inline-flex items-center gap-1.5" disabled={!podeSalvar} onClick={criar}>{salvando ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Link2 size={14} aria-hidden />} Criar link</button>
      {erro && <p role="alert" className="text-sm" style={{ color: "var(--crit)" }}>{erro}</p>}
      {novo && (
        <div role="status" className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <p className="font-semibold">Link pronto. Copie e cole na bio, no story ou no post:</p>
          <p className="mt-1 flex flex-wrap items-center gap-2"><code className="break-all rounded px-1 text-base" style={{ background: "var(--surface)" }}>{novo.url}</code> <BotaoCopiar texto={novo.url} rotulo="Copiar link" variante="primario" /></p>
          {novo.mensagem && <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>Mensagem que chega no WhatsApp: "{novo.mensagem}"</p>}
          <QrLink url={novo.url} nome={novo.slug} />
        </div>
      )}
    </section>
  );
}

function EditarMensagem({ link, salvando, aoSalvar, aoCancelar }: { link: LinkRow; salvando: boolean; aoSalvar: (frase: string) => void; aoCancelar: () => void }) {
  const [frase, setFrase] = useState(fraseSemCodigo(link.mensagem_modelo));
  return (
    <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); aoSalvar(frase); }}>
      <label className="block text-sm">Mensagem pronta (o código {link.codigo_ref} continua no fim)
        <input className="input block w-full" value={frase} maxLength={200} onChange={(e) => setFrase(e.target.value)} /></label>
      <p className="text-xs">O paciente vai ver: "{fraseSemCodigo(frase) || POSICOES.outro.frase} ({link.codigo_ref})". O link continua o mesmo.</p>
      <button type="submit" className="btn" disabled={salvando || !frase.trim()}>Salvar mensagem</button>{" "}
      <button type="button" className="btn" disabled={salvando} onClick={aoCancelar}>Cancelar</button>
    </form>
  );
}

function EditarNome({ clientId, link, salvando, aoSalvar, aoCancelar }: { clientId: string; link: LinkRow; salvando: boolean; aoSalvar: (slug: string) => void; aoCancelar: () => void }) {
  const [nome, setNome] = useState(link.slug ?? "");
  const conf = useConferirNome(clientId, nome, link.id);
  const igual = validarNomeLink(nome).ok && (validarNomeLink(nome) as { slug: string }).slug === link.slug;
  return (
    <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); aoSalvar(nome); }}>
      <label className="block text-sm">Novo nome do link<input className="input block w-full" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} spellCheck={false} /></label>
      <p className="text-xs" role="status" style={{ color: conf.estado === "invalido" || conf.estado === "em_uso" ? "var(--crit)" : undefined }}>{conf.texto || "Escreva o novo nome."} O endereço antigo continua funcionando.</p>
      <button type="submit" className="btn" disabled={salvando || igual || conf.estado === "invalido" || conf.estado === "em_uso" || conf.estado === "vazio"}>Salvar nome</button>{" "}
      <button type="button" className="btn" disabled={salvando} onClick={aoCancelar}>Cancelar edição</button>
    </form>
  );
}

function LinksPage() {
  const { clientId } = Route.useParams();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const hoje = hojeBrasilia();
  const q = useQuery({
    queryKey: ["links-rastreados", clientId, start, end],
    retry: false,
    queryFn: async () => {
      const { desde, antesDe } = limitesBR(start, end);
      const [ls, f] = await Promise.all([
        fetchAllRows<LinkRow>((from, to) => db.from("links_rastreados").select("id, slug, short_url, tipo, titulo, campanha, destino_tipo, ativo, criado_em, codigo_ref, mensagem_modelo").eq("client_id", clientId).order("criado_em", { ascending: false }).order("id").range(from, to)),
        fetchAllRows<Funil>((from, to) => db.rpc("links_funil", { p_client_id: clientId, p_desde: desde, p_antes_de: antesDe }).order("link_id").range(from, to)),
      ]);
      const funil = new Map<string, Funil>(f.map((x) => [x.link_id, x]));
      return { links: ls, funil };
    },
  });
  const [verInativos, setVerInativos] = useState(false);
  const [edicao, setEdicao] = useState<{ id: string; campo: "nome" | "mensagem" } | null>(null);
  const [qrAberto, setQrAberto] = useState<string | null>(null);
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
  const lugares = [...porTipo.entries()].sort((a, b) => b[1].conversas - a[1].conversas);
  const maxConv = lugares[0]?.[1].conversas ?? 0;
  const tot = lugares.reduce((a, [, x]) => ({ cliques: a.cliques + x.cliques, conversas: a.conversas + x.conversas, provaveis: a.provaveis + x.provaveis, agendou: a.agendou + x.agendou, vendas: a.vendas + x.vendas, receita: a.receita + x.receita }), { cliques: 0, conversas: 0, provaveis: 0, agendou: 0, vendas: 0, receita: 0 });
  const ic = (Icon: typeof Link2) => <Icon size={17} strokeWidth={1.7} aria-hidden />;

  // Leitura por regra (sem consulta nova, sem IA): só as contagens por link que a tela já carregou. O nome do link entra como
  // texto e passa pelo filtro de linguagem da leitura.
  const fatos = useMemo(
    () =>
      q.isLoading || q.isError
        ? null
        : fatosDosLinks({
            de: start,
            ate: end.slice(0, 10),
            hoje,
            links: (q.data?.links ?? []).map((l) => {
              const x = q.data!.funil.get(l.id);
              return { rotulo: l.titulo?.trim() || POSICOES[l.tipo as Posicao]?.rotulo || "Link", cliques: Number(x?.cliques ?? 0), conversas: Number(x?.conversas ?? 0), agendou: Number(x?.agendou ?? 0), vendas: Number(x?.vendas ?? 0) };
            }),
          }),
    [q.isLoading, q.isError, q.data, start, end, hoje],
  );

  // Contagem em cinza da aba Links na pasta (D-07): os links que a tela lista; null quando não há ("—" na pasta, nunca 0).
  usePublicarContagem({
    clientId,
    de: start,
    ate: end,
    rota: "/_authenticated/$clientId/links",
    valor: q.isLoading ? undefined : q.isError ? null : links.length || null,
  });

  const cabecalho = {
    tela: "links" as const,
    titulo: "Links rastreados",
    pergunta: "De qual link vêm as conversas e as vendas?",
    decisao: "D3" as const,
  };
  const gerador = isAdmin ? <Gerador clientId={clientId} nomesUsados={(q.data?.links ?? []).flatMap((l) => (l.slug ? [l.slug] : []))} aoCriar={() => qc.invalidateQueries({ queryKey: ["links-rastreados", clientId] })} /> : null;

  if (q.isLoading) return <PaginaNexo {...cabecalho} leitura={<NxDescobertasDaAba itens={[]} carregando clientId={clientId} />} corpo={<NxCarregando texto="Carregando links e resultados…" linhas={3} />} />;

  if (q.isError)
    return (
      <PaginaNexo
        {...cabecalho}
        leitura={<NxDescobertasDaAba itens={[]} carregando={false} clientId={clientId} />}
        corpo={<NxErro texto="Não foi possível carregar os links e suas contagens. Nenhum resultado foi considerado zero." onTentar={() => void q.refetch()} />}
      />
    );

  // A leitura do período saiu (quick-ver-tudo-abas, João 13/11/2026): o que ela dizia e a aba ainda não mostra (nos cartões e no gráfico
  // por lugar) vira descoberta, no máximo 3 no topo; o resto mora nos Detalhes. O link com mais conversas, pelo nome, é descoberta.
  const textoDoTopo = [
    `${tot.cliques} cliques em ${q.data?.links.length ?? 0} links`,
    `${tot.conversas} conversas ${tot.provaveis ? `${tot.provaveis} pelo horário do clique` : `${taxa(tot.conversas, tot.cliques)} dos cliques`}`,
    `${tot.agendou} agendaram ${taxa(tot.agendou, tot.conversas)} das conversas`,
    `${tot.vendas} vendas ${tot.receita ? brl(tot.receita) : ""}`,
    // O gráfico por lugar não entra: ele soma por lugar (bio, story); o link com mais conversas, pelo nome, é a descoberta.
  ];
  const { visiveis, resto } = leituraDaAba({ fatos, textoDoTopo: porTipo.size === 0 ? [] : textoDoTopo });
  const leitura = <NxDescobertasDaAba itens={visiveis} carregando={false} clientId={clientId} dateRange={dateRangeState} />;

  // Nenhum link ainda: a equipe vê o Gerador à vista (é o primeiro passo); o médico vê o aviso.
  if (porTipo.size === 0)
    return (
      <PaginaNexo
        {...cabecalho}
        leitura={leitura}
        corpo={
          <div className="nexo-mkt nexo-links">
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>{isAdmin ? "Nenhum link ainda. Crie o primeiro (comece pelo link da bio) e troque no Instagram." : "A equipe Doctor Creator ainda não criou links rastreados para esta clínica."}</p>
            {gerador}
          </div>
        }
      />
    );

  const cartoes: [ReactNode, ReactNode, ReactNode, ReactNode] = [
    <NxCartaoNumero key="cliques" icone={ic(MousePointerClick)} titulo="Cliques" subtitulo={`Em ${q.data?.links.length ?? 0} links`} valor={tot.cliques.toLocaleString("pt-BR")} legenda="nos links rastreados" />,
    <NxCartaoNumero key="conversas" icone={ic(MessageCircle)} titulo="Conversas" subtitulo={tot.provaveis ? `${tot.provaveis} pelo horário do clique` : `${taxa(tot.conversas, tot.cliques)} dos cliques`} valor={tot.conversas.toLocaleString("pt-BR")} legenda="ligadas aos links" />,
    <NxCartaoNumero key="agendaram" icone={ic(CalendarCheck)} titulo="Agendaram" subtitulo={`${taxa(tot.agendou, tot.conversas)} das conversas`} valor={tot.agendou.toLocaleString("pt-BR")} legenda="pessoas" />,
    <NxCartaoNumero key="vendas" icone={ic(Trophy)} titulo="Vendas" subtitulo={tot.receita ? `${brl(tot.receita)} no CRM` : "Sem valor cadastrado no CRM"} valor={tot.vendas.toLocaleString("pt-BR")} legenda="no CRM" />,
  ];

  const colunas = [
    { chave: "lugar", titulo: "Lugar" },
    { chave: "cliques", titulo: "Cliques", numerica: true },
    { chave: "conversas", titulo: "Conversas", numerica: true },
    { chave: "agendou", titulo: "Agendou", numerica: true },
    { chave: "vendas", titulo: "Vendas", numerica: true },
    { chave: "cc", titulo: "Clique → conversa", numerica: true },
    { chave: "ca", titulo: "Conversa → agendou", numerica: true },
  ];
  const linhasDaTabela = lugares.map(([t, x]) => ({
    lugar: POSICOES[t as Posicao]?.rotulo ?? t,
    cliques: x.cliques,
    conversas: x.conversas,
    agendou: x.agendou,
    vendas: `${x.vendas}${x.receita ? ` (${brl(x.receita)})` : ""}`,
    cc: taxa(x.conversas, x.cliques),
    ca: taxa(x.agendou, x.conversas),
  })) as Record<string, ReactNode>[];

  return (
    <PaginaNexo
      {...cabecalho}
      leitura={leitura}
      cartoes={cartoes}
      principal={
        <NxCard icone={ic(Link2)} titulo="De onde vêm as conversas" subtitulo="Conversas por lugar do link, do que mais traz para o que menos traz" rotulo="De onde vêm as conversas">
          <ul className="nx-hbars" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {lugares.map(([t, x], i) => (
              <li key={t}>
                <NxHBar i={i} rotulo={POSICOES[t as Posicao]?.rotulo ?? t} valor={<>{x.conversas} conversas <small>· {x.cliques} cliques</small></>} pct={maxConv > 0 ? (x.conversas / maxConv) * 100 : 0} />
              </li>
            ))}
          </ul>
        </NxCard>
      }
      detalhe={
        <NxComecoDosDetalhes fatos={fatos} resto={resto} clientId={clientId} dateRange={dateRangeState}>
        <div className="nexo-mkt nexo-links">
          {gerador}
          <NxBlocoDoVerTudo rotulo="Do clique à venda" cabeca={cabecaDoCliqueAVenda(tot)}>
          <NxCard icone={ic(Filter)} titulo="Do clique à venda" subtitulo="Todos os links somados" rotulo="Do clique à venda">
            <NxFunil
              rotulo="Do clique à venda"
              etapas={[
                { rotulo: "Cliques", valor: tot.cliques, texto: tot.cliques.toLocaleString("pt-BR") },
                { rotulo: "Conversas", valor: tot.conversas, texto: tot.conversas.toLocaleString("pt-BR"), passagem: `${taxa(tot.conversas, tot.cliques)} dos cliques viraram conversa` },
                { rotulo: "Agendaram", valor: tot.agendou, texto: tot.agendou.toLocaleString("pt-BR"), passagem: `${taxa(tot.agendou, tot.conversas)} das conversas agendaram` },
                { rotulo: "Vendas", valor: tot.vendas, texto: tot.vendas.toLocaleString("pt-BR"), passagem: `${taxa(tot.vendas, tot.agendou)} dos agendamentos viraram venda` },
              ]}
            />
            <NxNota>Um mesmo lead pode aparecer em mais de um link.</NxNota>
          </NxCard>
          </NxBlocoDoVerTudo>
          <NxComoCalcula titulo="Como os links contam">
            <p>Um link curto para cada lugar (bio, cada story, destaques, QR code no consultório, parceiros), como {urlCurta("juliana-bio", BASE)}. O sistema conta os cliques, reconhece a conversa que chega no WhatsApp pelo código no fim da mensagem e mostra quantas viraram agendamento e venda. Período: {formatRangeLabel({ start, end })}.</p>
            <p>Cliques e início das conversas respeitam o período. Agendamento reflete o resumo atual dessas conversas. Vendas exigem evento de ganho registrado até a data final; o valor é o cadastrado no CRM e não comprova pagamento. Um mesmo lead pode aparecer em mais de um link.</p>
          </NxComoCalcula>
          <NxBlocoDoVerTudo rotulo="Por lugar, em números" cabeca={cabecaPorLugar(lugares.map(([t, x]) => ({ nome: POSICOES[t as Posicao]?.rotulo ?? t, cliques: x.cliques, conversas: x.conversas, agendou: x.agendou, vendas: x.vendas })))}>
          <NxCard nivel={2} icone={ic(Link2)} titulo="Por lugar, em números" rotulo="Por lugar, em números">
            <NxTabela rotulo="Por lugar, em números" colunas={colunas} linhas={linhasDaTabela} chaveDaLinha={(_, k) => lugares[k][0]} />
          </NxCard>
          </NxBlocoDoVerTudo>
          <NxBlocoDoVerTudo cabeca={cabecaDosLinks((q.data?.links ?? []).map((l) => ({ conversas: Number(f(l.id).conversas), ativo: l.ativo })))}>
          <section aria-labelledby="todos" className="space-y-2">
            <div className="flex items-center justify-between gap-2"><h3 id="todos" className="text-lg font-semibold">Todos os links</h3>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={verInativos} onChange={(e) => setVerInativos(e.target.checked)} /> Mostrar desativados</label></div>
            {alterar.isError && <p role="alert" style={{ color: "var(--crit)" }}>A alteração não foi salva. {mensagemDeErro(alterar.error)}</p>}
            {alterar.isSuccess && <p role="status">Alteração salva.</p>}
            {links.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>{isAdmin ? "Nenhum link ainda. Crie o primeiro (comece pelo link da bio) e troque no Instagram." : "A equipe Doctor Creator ainda não criou links rastreados para esta clínica."}</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {links.map((l) => {
                  const x = f(l.id), url = urlDo(l);
                  return (
                    <article key={l.id} className="rounded-xl border p-3" style={{ background: "var(--surface)", borderColor: "var(--border)", opacity: l.ativo ? 1 : 0.55 }}>
                      <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-semibold" style={{ color: "var(--b1)" }}>
                        <span>{POSICOES[l.tipo as Posicao]?.rotulo ?? l.tipo}{l.destino_tipo === "site" ? " · site" : ""}</span>
                        <span style={{ color: "var(--muted)" }}>{new Date(l.criado_em).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <h4 className="mt-0.5 text-[17px] font-bold">{l.titulo ?? "Link"}</h4>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs"><code className="break-all rounded px-1 text-sm" style={{ background: "var(--surface-2)" }}>{url}</code> <BotaoCopiar texto={url} rotulo="Copiar link" />
                        {l.slug && <button type="button" className="inline-flex min-h-[44px] items-center gap-1 font-semibold" style={{ color: "var(--accent)" }} aria-expanded={qrAberto === l.id} onClick={() => setQrAberto(qrAberto === l.id ? null : l.id)}><QrCode size={13} aria-hidden /> {qrAberto === l.id ? "Esconder QR code" : "QR code"}</button>}</p>
                      {l.slug && qrAberto === l.id && <QrLink url={url} nome={l.slug} />}
                      {!l.ativo && <p className="mt-1 text-xs font-semibold" style={{ color: "var(--crit)" }}>Desativado: quem abrir vê a página "Este link foi desativado", com o WhatsApp da clínica, e o clique não conta.</p>}
                      {l.destino_tipo === "whatsapp" && l.mensagem_modelo && <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>Mensagem: "{l.mensagem_modelo}"</p>}
                      <dl className="nx-link__nums">
                        <div><dt>Cliques</dt><dd>{x.cliques}</dd></div>
                        <div><dt>Conversas</dt><dd>{x.conversas}</dd>{x.provaveis ? <small>{x.provaveis} pelo horário</small> : null}</div>
                        <div><dt>Agendaram</dt><dd>{x.agendou}</dd></div>
                        <div><dt>Vendas</dt><dd>{x.vendas}</dd>{x.receita ? <small>{brl(Number(x.receita))}</small> : null}</div>
                      </dl>
                      {isAdmin && l.slug && (
                        <div className="mt-1 flex flex-wrap gap-3 text-xs">
                          <button type="button" disabled={alterar.isPending} style={{ color: "var(--accent)" }} onClick={() => { alterar.reset(); setEdicao({ id: l.id, campo: "nome" }); }}>Editar nome do link</button>
                          {l.destino_tipo === "whatsapp" && <button type="button" disabled={alterar.isPending} style={{ color: "var(--accent)" }} onClick={() => { alterar.reset(); setEdicao({ id: l.id, campo: "mensagem" }); }}>Editar mensagem</button>}
                          <button type="button" disabled={alterar.isPending} style={{ color: "var(--muted)" }} onClick={() => {
                            if (l.ativo && !window.confirm("Desativar este link? Quem clicar verá a página \"Este link foi desativado\" e o clique não conta. Dá para reativar depois.")) return;
                            alterar.mutate({ acao: l.ativo ? "inativo" : "ativo", id: l.id });
                          }}>{l.ativo ? "Desativar link" : "Reativar link"}</button>
                        </div>
                      )}
                      {isAdmin && edicao?.id === l.id && edicao.campo === "nome" && <EditarNome clientId={clientId} link={l} salvando={alterar.isPending} aoSalvar={(slug) => alterar.mutate({ acao: "renomear", id: l.id, slug })} aoCancelar={() => setEdicao(null)} />}
                      {isAdmin && edicao?.id === l.id && edicao.campo === "mensagem" && <EditarMensagem link={l} salvando={alterar.isPending} aoSalvar={(frase) => alterar.mutate({ acao: "frase", id: l.id, frase })} aoCancelar={() => setEdicao(null)} />}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          </NxBlocoDoVerTudo>
        </div>
        </NxComecoDosDetalhes>
      }
    />
  );
}
