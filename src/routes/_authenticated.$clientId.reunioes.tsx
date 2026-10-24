import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, CalendarDays, CheckCircle2, ClipboardList, Loader2, NotebookPen, Plus, Sparkles, Upload, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import { Carregando, ErroCarga } from "@/components/sem-fonte";
import { NOME_MEMORIA } from "@/lib/brand-brain";
import { EXTENSOES_TRANSCRICAO, textoDoArquivo } from "@/lib/reunioes-arquivo";
import { lerResultado, MAX_NOTAS, MAX_TRANSCRICAO, TIPOS_ENTREGA, type ResultadoReuniao } from "@/lib/reunioes";

// Reuniões com a clínica: a equipe anota do jeito que quiser; "Processar reunião" vira resumo, entregas da semana e
// propostas de memória no Brain (aprovadas por uma pessoa em /admin/brain). Só admin, como o Brain.
export const Route = createFileRoute("/_authenticated/$clientId/reunioes")({
  component: ReunioesPage,
});

interface Reuniao {
  id: string; data: string; titulo: string; participantes: string | null; notas: string; transcricao: string | null;
  resultado: unknown; memorias_propostas: number; processada_em: string | null; atualizado_em: string;
}

const db = supabase as unknown as { from: (t: string) => any };
const hoje = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

async function processar(clientId: string, id: string) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const r = await fetch("/api/sync/manual", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` }, body: JSON.stringify({ client_id: clientId, alvo: "reuniao", id }) });
  const j = await r.json().catch(() => null);
  if (!r.ok || j?.ok === false) throw new Error(j?.erro ?? j?.error ?? `Falhou (${r.status})`);
  return j as { memorias_propostas: number; brain_erro: string | null };
}

function ReunioesPage() {
  const { clientId } = Route.useParams();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const chave = ["reunioes", clientId];
  const q = useQuery({
    queryKey: chave,
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await db.from("reunioes").select("id, data, titulo, participantes, notas, transcricao, resultado, memorias_propostas, processada_em, atualizado_em")
        .eq("client_id", clientId).order("data", { ascending: false }).order("criado_em", { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as Reuniao[];
    },
  });
  const [aberta, setAberta] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const head = (
    <div className="hpagehead">
      <h2>Reuniões</h2>
      <div className="flex items-center gap-2">
        <NotebookPen size={14} aria-hidden style={{ color: "var(--accent)" }} />
        <span>Anote o que foi falado com a clínica. Ao processar, vira resumo, entregas da semana e memória no Brain.</span>
      </div>
    </div>
  );
  if (!isAdmin) return <div>{head}<ErroCarga texto="As reuniões ficam visíveis só para a equipe da Doctor Creator." /></div>;
  if (q.isLoading) return <div>{head}<Carregando /></div>;
  if (q.error) return <div>{head}<ErroCarga texto="Não consegui carregar as reuniões. Atualize a página." /></div>;
  const lista = q.data ?? [];
  const atual = lista.find((r) => r.id === aberta) ?? null;

  async function nova() {
    setCriando(true);
    try {
      const { data, error } = await db.from("reunioes").insert({ client_id: clientId, data: hoje(), titulo: "Reunião com a clínica" }).select("id").single();
      if (error) throw new Error(error.message);
      await qc.invalidateQueries({ queryKey: chave });
      setAberta((data as { id: string }).id);
    } finally { setCriando(false); }
  }

  return (
    <div className="grid gap-4">
      {head}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Painel icone={CalendarDays} titulo="Reuniões" resumo={`${lista.length} registrada(s)`}>
          <button type="button" className="btn mt-2 w-full" onClick={nova} disabled={criando}>
            {criando ? <Loader2 size={14} className="mr-1 inline animate-spin" aria-hidden /> : <Plus size={14} className="mr-1 inline" aria-hidden />}Nova reunião
          </button>
          {lista.length === 0 ? <p className="mt-3 text-xs" style={{ color: "var(--text-dim)" }}>Nenhuma reunião registrada ainda.</p> : (
            <ul className="mt-3 grid gap-1.5">
              {lista.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setAberta(r.id)} aria-current={r.id === aberta ? "true" : undefined}
                    className="w-full rounded-lg border p-2 text-left text-sm" style={{ borderColor: r.id === aberta ? "var(--accent)" : "var(--border)" }}>
                    <span className="block font-medium">{r.titulo}</span>
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-dim)" }}>
                      {dataBR(r.data)} {r.processada_em ? <Selo cor="var(--good-text)">processada</Selo> : <Selo>só notas</Selo>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Painel>
        {atual ? <Editor key={atual.id} clientId={clientId} r={atual} aoSalvar={() => qc.invalidateQueries({ queryKey: chave })} /> : (
          <Painel icone={NotebookPen} titulo="Como funciona" resumo="Três passos, do jeito que a equipe preferir anotar.">
            <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-sm">
              <li>Depois da reunião, clique em <strong>Nova reunião</strong> e anote o que foi falado: tópicos, frases soltas, combinados. Se tiver a transcrição do Meet, cole no campo próprio.</li>
              <li>Clique em <strong>Processar reunião</strong>. A IA lê as notas junto com tudo que já sabemos da clínica (Brain e plano da semana).</li>
              <li>Sai o resumo, o que cada lado ficou de fazer, o que entregar nesta semana e as memórias propostas para o Brain, que uma pessoa aprova.</li>
            </ol>
            <p className="mt-3 text-xs" style={{ color: "var(--text-dim)" }}>Nada é enviado à clínica. Telefone, e-mail e CPF são mascarados antes de ir para a IA.</p>
          </Painel>
        )}
      </div>
    </div>
  );
}

function Editor({ clientId, r, aoSalvar }: { clientId: string; r: Reuniao; aoSalvar: () => Promise<unknown> }) {
  const [titulo, setTitulo] = useState(r.titulo);
  const [data, setData] = useState(r.data);
  const [participantes, setParticipantes] = useState(r.participantes ?? "");
  const [notas, setNotas] = useState(r.notas);
  const [transcricao, setTranscricao] = useState(r.transcricao ?? "");
  const [verTranscricao, setVerTranscricao] = useState(!!r.transcricao);
  const [estado, setEstado] = useState<"parado" | "salvando" | "processando">("parado");
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const alterado = titulo !== r.titulo || data !== r.data || participantes !== (r.participantes ?? "") || notas !== r.notas || transcricao !== (r.transcricao ?? "");
  const resultado: ResultadoReuniao | null = r.resultado ? lerResultado(r.resultado) : null;

  async function salvar() {
    const { error } = await db.from("reunioes").update({
      titulo: titulo.trim() || "Reunião", data, participantes: participantes.trim() || null, notas, transcricao: transcricao.trim() || null, atualizado_em: new Date().toISOString(),
    }).eq("id", r.id).eq("client_id", clientId);
    if (error) throw new Error("Não foi possível salvar as notas.");
    await aoSalvar();
  }
  async function onSalvar() {
    setEstado("salvando"); setAviso(null);
    try { await salvar(); setAviso({ tom: "ok", texto: "Notas salvas." }); }
    catch (e) { setAviso({ tom: "erro", texto: e instanceof Error ? e.message : String(e) }); }
    finally { setEstado("parado"); }
  }
  async function onProcessar() {
    setEstado("processando"); setAviso(null);
    try {
      if (alterado) await salvar();
      const j = await processar(clientId, r.id);
      await aoSalvar();
      setAviso(j.brain_erro ? { tom: "erro", texto: j.brain_erro } : { tom: "ok", texto: j.memorias_propostas ? `${j.memorias_propostas} memória(s) proposta(s) no Brain para aprovar.` : "Processada. Nenhuma memória nova para o Brain." });
    } catch (e) { setAviso({ tom: "erro", texto: e instanceof Error ? e.message : String(e) }); }
    finally { setEstado("parado"); }
  }
  const vazio = !notas.trim() && !transcricao.trim();
  async function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    try {
      const { texto, cortado } = textoDoArquivo(arquivo.name, new Uint8Array(await arquivo.arrayBuffer()));
      setTranscricao(texto); setVerTranscricao(true);
      setAviso({ tom: "ok", texto: `Transcrição carregada de ${arquivo.name}${cortado ? " (cortada no limite de 60 mil caracteres)" : ""}. Salve ou processe a reunião.` });
    } catch (erro) { setAviso({ tom: "erro", texto: erro instanceof Error ? erro.message : String(erro) }); }
  }

  return (
    <div className="grid gap-4">
      <Painel icone={NotebookPen} titulo="O que foi falado" resumo="Escreva do jeito que preferir: tópicos, frases, combinados, dúvidas da clínica.">
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_160px]">
          <label className="grid gap-1 text-xs">Título<input className="input" value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} /></label>
          <label className="grid gap-1 text-xs">Data<input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
        </div>
        <label className="mt-2 grid gap-1 text-xs">Quem participou (opcional)<input className="input" value={participantes} maxLength={500} onChange={(e) => setParticipantes(e.target.value)} placeholder="Ex.: Dra. Ana, secretária, Victor (tráfego)" /></label>
        <label className="mt-2 grid gap-1 text-xs">Notas
          <textarea className="input" rows={12} value={notas} maxLength={MAX_NOTAS} onChange={(e) => setNotas(e.target.value)} placeholder={"Ex.:\n- Quer focar em menopausa até dezembro\n- Reclamou que a secretária demora para responder\n- Combinado: 2 Reels por semana, revisar campanha de estética"} />
        </label>
        {verTranscricao ? (
          <label className="mt-2 grid gap-1 text-xs">Transcrição da reunião (opcional)
            <textarea className="input" rows={6} value={transcricao} maxLength={MAX_TRANSCRICAO} onChange={(e) => setTranscricao(e.target.value)} />
          </label>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <label className="btn cursor-pointer">
            <Upload size={14} className="mr-1 inline" aria-hidden />Enviar arquivo da transcrição
            <input type="file" className="sr-only" accept={EXTENSOES_TRANSCRICAO.join(",")} onChange={onArquivo} />
          </label>
          {!verTranscricao && <button type="button" className="underline" onClick={() => setVerTranscricao(true)}>ou colar o texto</button>}
          <span style={{ color: "var(--text-dim)" }}>.docx, .txt, .vtt ou .srt. No Meet: Google Drive › Meet Recordings › transcrição › Arquivo › Fazer download.</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn" onClick={onSalvar} disabled={estado !== "parado" || !alterado}>{estado === "salvando" ? "Salvando…" : "Salvar notas"}</button>
          <button type="button" className="btn btn-primary" onClick={onProcessar} disabled={estado !== "parado" || vazio}>
            {estado === "processando" ? <><Loader2 size={14} className="mr-1 inline animate-spin" aria-hidden />Processando…</> : <><Sparkles size={14} className="mr-1 inline" aria-hidden />{r.processada_em ? "Processar de novo" : "Processar reunião"}</>}
          </button>
          {aviso && <span role={aviso.tom === "erro" ? "alert" : "status"} className="text-xs" style={{ color: aviso.tom === "erro" ? "var(--bad-text, #b42318)" : "var(--good-text)" }}>{aviso.texto}</span>}
        </div>
        <p className="mt-2 text-[11px]" style={{ color: "var(--text-dim)" }}>Nada é enviado à clínica. Telefone, e-mail e CPF são mascarados antes de ir para a IA.</p>
      </Painel>

      {resultado && (
        <>
          <Painel icone={ClipboardList} titulo="Resumo da reunião" resumo={`Processada em ${r.processada_em ? new Date(r.processada_em).toLocaleString("pt-BR") : "—"}`}>
            <p className="mt-2 text-sm">{resultado.resumo}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Lista titulo="Combinados" itens={resultado.combinados} />
              <Lista titulo="A clínica faz" itens={resultado.acoes_clinica} />
              <Lista titulo="A equipe faz" itens={resultado.acoes_equipe} />
            </div>
            {resultado.pendencias.length > 0 && <div className="mt-3"><Lista titulo="Ficou em aberto" itens={resultado.pendencias} /></div>}
          </Painel>

          <Painel icone={CheckCircle2} titulo="O que entregar nesta semana" resumo="Sugestões a partir da reunião e de tudo que sabemos da clínica. A equipe decide o que entra.">
            {resultado.entregas.length === 0 ? <p className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>Nenhuma entrega sugerida.</p> : (
              <ul className="mt-2 grid gap-2">
                {resultado.entregas.map((e) => (
                  <li key={e.titulo} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                    <p className="flex items-center gap-2 text-sm font-semibold"><Selo>{TIPOS_ENTREGA[e.tipo]}</Selo>{e.titulo}</p>
                    {e.detalhe && <p className="mt-1 whitespace-pre-line text-sm">{e.detalhe}</p>}
                    {e.porque && <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>Por quê: {e.porque}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Painel>

          <Painel icone={Brain} titulo="Memórias para o Brain" resumo="Entram como proposta. Só passam a valer para os agentes depois de aprovadas.">
            {resultado.memorias.length === 0 ? <p className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>Nada novo para guardar desta reunião.</p> : (
              <>
                <ul className="mt-2 grid gap-1.5 text-sm">
                  {resultado.memorias.map((m) => <li key={`${m.memoria}-${m.chave}`} className="flex items-start gap-2"><Selo>{NOME_MEMORIA[m.memoria]}</Selo><span>{m.valor}</span></li>)}
                </ul>
                <Link to="/admin/brain" search={{ c: clientId }} className="mt-3 inline-flex items-center gap-1 text-sm underline"><Users size={14} aria-hidden />Aprovar no Brain ({r.memorias_propostas} nova(s) desta vez)</Link>
              </>
            )}
          </Painel>
        </>
      )}
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold" style={{ color: "var(--text-dim)" }}>{titulo}</p>
      {itens.length === 0 ? <p className="text-xs" style={{ color: "var(--text-dim)" }}>—</p> : <ul className="grid list-disc gap-1 pl-4 text-sm">{itens.map((i) => <li key={i}>{i}</li>)}</ul>}
    </div>
  );
}
