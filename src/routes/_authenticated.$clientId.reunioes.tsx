import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles, Upload, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Carregando, ErroCarga } from "@/components/sem-fonte";
import { NOME_MEMORIA } from "@/lib/brand-brain";
import { EXTENSOES_TRANSCRICAO, textoDoArquivo } from "@/lib/reunioes-arquivo";
import { lerResultado, MAX_NOTAS, MAX_TRANSCRICAO, TIPOS_ENTREGA, type ResultadoReuniao } from "@/lib/reunioes";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";
import { IconeTabler } from "@/components/icons/tabler";
import { NxCard, NxTag } from "@/components/nx";
import { PlanoCabecalho, PlanoChip, PlanoComo, PlanoContadores, PlanoLinha, PlanoVazio } from "@/components/nx/plano-pecas";

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
    <PlanoCabecalho
      titulo="O que ficou combinado com a clínica"
      pergunta="Anote o que foi falado. Ao processar, vira resumo, o que cada lado faz, as entregas da semana e memória no Brain."
    />
  );
  if (!isAdmin) return <div className="nexo-plano">{head}<ErroCarga texto="As reuniões ficam visíveis só para a equipe da Doctor Creator." /></div>;
  if (q.isLoading) return <div className="nexo-plano">{head}<Carregando /></div>;
  if (q.error) return <div className="nexo-plano">{head}<ErroCarga texto="Não consegui carregar as reuniões. Atualize a página." /></div>;
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

  const processadas = lista.filter((r) => r.processada_em).length;
  return (
    <div className="nexo-plano">
      {head}
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <NxCard
          nivel={2}
          icone={<IconeTabler nome="calendar" tamanho={17} traco={1.7} />}
          titulo="Reuniões"
          className="lg:self-start"
          subtitulo={`${lista.length} registrada(s) · ${processadas} processada(s)`}
        >
          <button type="button" className="pl-botao pl-botao--pri w-full" onClick={nova} disabled={criando}>
            {criando ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Plus size={14} aria-hidden />}Nova reunião
          </button>
          {lista.length === 0 ? <p className="text-sm" style={{ color: "var(--text-2)" }}>Nenhuma reunião registrada ainda.</p> : (
            <ul className="grid gap-1.5">
              {lista.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setAberta(r.id)} aria-current={r.id === aberta ? "true" : undefined}
                    className={`nx-row${r.id === aberta ? " nx-row--ativa" : ""}`} style={{ border: `1px solid ${r.id === aberta ? "var(--b4)" : "var(--line)"}` }}>
                    <span className="nx-row__corpo">
                      <span className="nx-row__titulo" style={{ fontWeight: 600 }}>{r.titulo}</span>
                      <span className="nx-row__sub">
                        <span>{dataBR(r.data)}</span>
                        {r.processada_em ? <NxTag tom="up">processada</NxTag> : <NxTag tom="g">só notas</NxTag>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </NxCard>
        {atual ? <Editor key={atual.id} clientId={clientId} r={atual} aoSalvar={() => qc.invalidateQueries({ queryKey: chave })} /> : (
          <NxCard nivel={2} icone={<IconeTabler nome="file-text" tamanho={17} traco={1.7} />} titulo="Como funciona" subtitulo="Três passos, do jeito que a equipe preferir anotar.">
            <ol className="pl-lista">
              <PlanoLinha posicao={1} titulo="Anote a reunião" apoio={<>Clique em <strong>Nova reunião</strong> e anote o que foi falado: tópicos, frases soltas, combinados. Se tiver a transcrição do Meet, cole no campo próprio.</>} />
              <PlanoLinha posicao={2} titulo="Processe" apoio={<>Clique em <strong>Processar reunião</strong>. A IA lê as notas junto com tudo que já sabemos da clínica (Brain e plano da semana).</>} />
              <PlanoLinha posicao={3} titulo="Confira o resultado" apoio="Sai o resumo, o que cada lado ficou de fazer, o que entregar nesta semana e as memórias propostas para o Brain, que uma pessoa aprova." />
            </ol>
            <p className="text-xs" style={{ color: "var(--muted-ink)" }}>Nada é enviado à clínica. Telefone, e-mail e CPF são mascarados antes de ir para a IA.</p>
          </NxCard>
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
    catch (e) { setAviso({ tom: "erro", texto: mensagemDeErroAcao(e) }); }
    finally { setEstado("parado"); }
  }
  async function onProcessar() {
    setEstado("processando"); setAviso(null);
    try {
      if (alterado) await salvar();
      const j = await processar(clientId, r.id);
      await aoSalvar();
      setAviso(j.brain_erro ? { tom: "erro", texto: j.brain_erro } : { tom: "ok", texto: j.memorias_propostas ? `${j.memorias_propostas} memória(s) proposta(s) no Brain para aprovar.` : "Processada. Nenhuma memória nova para o Brain." });
    } catch (e) { setAviso({ tom: "erro", texto: mensagemDeErroAcao(e) }); }
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
    } catch (erro) { setAviso({ tom: "erro", texto: mensagemDeErroAcao(erro) }); }
  }

  const notasCard = (
    <NxCard nivel={2} icone={<IconeTabler nome="file-text" tamanho={17} traco={1.7} />} titulo={resultado ? "Notas da reunião" : "O que foi falado"} subtitulo="Escreva do jeito que preferir: tópicos, frases, combinados, dúvidas da clínica.">
      <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
        <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--text-2)" }}>Título<input className="input" value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--text-2)" }}>Data<input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} /></label>
      </div>
      <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--text-2)" }}>Quem participou (opcional)<input className="input" value={participantes} maxLength={500} onChange={(e) => setParticipantes(e.target.value)} placeholder="Ex.: Dra. Ana, secretária, Victor (tráfego)" /></label>
      <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--text-2)" }}>Notas
        <textarea className="input" rows={resultado ? 6 : 12} value={notas} maxLength={MAX_NOTAS} onChange={(e) => setNotas(e.target.value)} placeholder={"Ex.:\n- Quer focar em menopausa até dezembro\n- Reclamou que a secretária demora para responder\n- Combinado: 2 Reels por semana, revisar campanha de estética"} />
      </label>
      {verTranscricao ? (
        <label className="grid gap-1 text-sm font-semibold" style={{ color: "var(--text-2)" }}>Transcrição da reunião (opcional)
          <textarea className="input" rows={6} value={transcricao} maxLength={MAX_TRANSCRICAO} onChange={(e) => setTranscricao(e.target.value)} />
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="pl-botao pl-botao--leve cursor-pointer">
          <Upload size={14} aria-hidden />Enviar arquivo da transcrição
          <input type="file" className="sr-only" accept={EXTENSOES_TRANSCRICAO.join(",")} onChange={onArquivo} />
        </label>
        {!verTranscricao && <button type="button" className="font-semibold underline" style={{ color: "var(--b1)" }} onClick={() => setVerTranscricao(true)}>ou colar o texto</button>}
      </div>
      <PlanoComo titulo="Como baixar a transcrição do Meet">
        <p>.docx, .txt, .vtt ou .srt. No Meet: Google Drive › Meet Recordings › transcrição › Arquivo › Fazer download.</p>
      </PlanoComo>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="pl-botao" onClick={onSalvar} disabled={estado !== "parado" || !alterado}>{estado === "salvando" ? "Salvando…" : "Salvar notas"}</button>
        <button type="button" className="pl-botao pl-botao--pri" onClick={onProcessar} disabled={estado !== "parado" || vazio}>
          {estado === "processando" ? <><Loader2 size={14} className="animate-spin" aria-hidden />Processando…</> : <><Sparkles size={14} aria-hidden />{r.processada_em ? "Processar de novo" : "Processar reunião"}</>}
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--muted-ink)" }}>Nada é enviado à clínica. Telefone, e-mail e CPF são mascarados antes de ir para a IA.</p>
    </NxCard>
  );

  return (
    <div className="grid gap-4 min-w-0">
      {aviso && <p role={aviso.tom === "erro" ? "alert" : "status"} className="pl-aviso" style={aviso.tom === "erro" ? { background: "var(--dn-bg)", color: "var(--dn-ink)" } : { background: "var(--up-bg)", color: "var(--up-ink)" }}>{aviso.texto}</p>}

      {/* Reunião processada: o que ficou combinado e o que fazer vem antes das notas. */}
      {resultado ? (
        <>
          <NxCard nivel={2} icone={<IconeTabler nome="checklist" tamanho={17} traco={1.7} />} titulo="Resumo da reunião" subtitulo={`Processada em ${r.processada_em ? new Date(r.processada_em).toLocaleString("pt-BR") : "—"}`}>
            <p className="text-[15px] leading-6" style={{ color: "var(--text)" }}>{resultado.resumo}</p>
            <PlanoContadores
              rotulo="O que saiu da reunião"
              itens={[
                { rotulo: "Combinados", valor: resultado.combinados.length, tom: "b" },
                { rotulo: "A equipe faz", valor: resultado.acoes_equipe.length, tom: "or" },
                { rotulo: "A clínica faz", valor: resultado.acoes_clinica.length, tom: "or" },
                { rotulo: "Ficou em aberto", valor: resultado.pendencias.length, tom: resultado.pendencias.length ? "dn" : "g" },
              ]}
            />
            <div className="grid gap-3 md:grid-cols-3">
              <Lista titulo="A equipe faz" itens={resultado.acoes_equipe} />
              <Lista titulo="A clínica faz" itens={resultado.acoes_clinica} />
              <Lista titulo="Combinados" itens={resultado.combinados} />
            </div>
            {resultado.pendencias.length > 0 && <Lista titulo="Ficou em aberto" itens={resultado.pendencias} />}
          </NxCard>

          <NxCard nivel={2} icone={<IconeTabler nome="target" tamanho={17} traco={1.7} />} titulo="O que entregar nesta semana" subtitulo="Sugestões a partir da reunião e de tudo que sabemos da clínica. A equipe decide o que entra.">
            {resultado.entregas.length === 0 ? <PlanoVazio titulo="Nenhuma entrega sugerida" /> : (
              <ol className="pl-lista">
                {resultado.entregas.map((e, k) => (
                  <PlanoLinha
                    key={e.titulo}
                    posicao={k + 1}
                    titulo={e.titulo}
                    apoio={e.detalhe ? <span className="whitespace-pre-line">{e.detalhe}</span> : undefined}
                    chips={<PlanoChip rotulo="Tipo" tom="b">{TIPOS_ENTREGA[e.tipo]}</PlanoChip>}
                    rotuloDetalhe="Por quê"
                    detalhe={e.porque ? <p>{e.porque}</p> : undefined}
                  />
                ))}
              </ol>
            )}
          </NxCard>

          <NxCard nivel={2} icone={<IconeTabler nome="bulb" tamanho={17} traco={1.7} />} titulo="Memórias para o Brain" subtitulo="Entram como proposta. Só passam a valer para os agentes depois de aprovadas.">
            {resultado.memorias.length === 0 ? <p className="text-sm" style={{ color: "var(--text-2)" }}>Nada novo para guardar desta reunião.</p> : (
              <>
                <ul className="pl-itens">
                  {resultado.memorias.map((m) => <li key={`${m.memoria}-${m.chave}`} className="pl-item"><span className="pl-item__marca"><NxTag tom="b">{NOME_MEMORIA[m.memoria]}</NxTag></span><span className="pl-item__titulo">{m.valor}</span></li>)}
                </ul>
                <Link to="/admin/brain" search={{ c: clientId }} className="pl-botao w-fit"><Users size={14} aria-hidden />Aprovar no Brain ({r.memorias_propostas} nova(s) desta vez)</Link>
              </>
            )}
          </NxCard>
          {notasCard}
        </>
      ) : notasCard}
    </div>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div className="pl-detalhe__corpo" style={{ alignContent: "start" }}>
      <p className="pl-grupo" style={{ margin: 0 }}>{titulo}</p>
      {itens.length === 0 ? <p className="text-sm" style={{ color: "var(--muted-ink)" }}>Nada registrado.</p> : <ul className="grid list-disc gap-1 pl-4 text-sm" style={{ color: "var(--text)" }}>{itens.map((i) => <li key={i}>{i}</li>)}</ul>}
    </div>
  );
}
