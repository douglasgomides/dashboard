import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useClientRole } from "@/hooks/use-client-role";
import { IconeTabler } from "@/components/icons/tabler";
import { rodarFluxoAteFim } from "@/lib/agentes-data";
import { AGENTES, type AgenteCatalogo, type IdAgente } from "@/lib/agentes-catalogo";
import { pecaParaTexto, type CopyAnuncio, type PecaConteudo } from "@/lib/agentes-sugestoes";
import { duracao, resumoPiloto } from "@/lib/atendente";
import { acoesDoSinal, brlCentavos, type TipoAcao } from "@/lib/anuncios-acoes";
import { TRABALHOS_AGENTE, agenteSelecionado, rodadaEmCurso, saudeRotina, situacaoRodada } from "@/lib/agentes-trabalho";
import { lerModulosAgentes, lerSaudeAgentes, lerTrabalhoAgente } from "@/lib/agentes-trabalho-data";
import { NOME_EVENTO, NOME_OPERACAO, resumoOperacao, type SaudeOperacao, type TrabalhoRecuperacao } from "@/lib/operacao-recuperacao";
import { compararPeriodos, direcao, duracaoCurta, MUDOU_AGENDOU_EM, semanaInconsistente, type Bloco, type Direcao, type SemanaProva } from "@/lib/prova-resultado";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";
// Só o hook e os tipos do planejador, e o átomo BotaoCopiar: os componentes congelados do SAP não entram aqui.
import { usePautas } from "@/components/planejador-conteudo";
import { BotaoCopiar } from "@/components/botao-copiar";
import { NxCard, NxKpi, NxListRow, NxTag, type NxTom } from "./base";
import { NxAviso, NxCarregando, NxErro, NxRecolhido, NxTabela, NxVazio } from "./blocos";
import { NxEstrategias } from "./planejamento";
import "@/styles/nexo-agentes.css";

// Painéis dos agentes no desenho nx, só para o Nexo: Agentes e entregas, Resultados dos anúncios, Qualidade do
// atendimento e Ideias. O SAP segue com agentes-ia.tsx, prova-resultado.tsx, operacao-recuperacao.tsx e
// agentes-trabalho.tsx (congelados). Mesmas consultas e mesmas chaves do React Query do original (cache igual, nenhuma
// consulta nova), mesmas funções de src/lib, mesmas ações e os mesmos textos de ação: só o desenho muda.

const db = supabase as any;
type Estado = "proposta" | "feita" | "descartada";
interface Sugestao {
  id: string; agente: "recuperacao" | "anuncios" | "conteudo"; tipo: string; titulo: string; detalhe: string | null; evidencias: string[]; brain: string[];
  conteudo: any; mensagem: string | null; conversa_id: string | null; campanha_id: string | null; prioridade: number; estado: Estado;
  resultado: string | null; medido_em: string | null; medicao?: { versao?: number; legado?: { estado?: string } }; criado_em: string; nota?: number | null; critica?: string | null;
  conversa?: { canal: string | null; pessoa: { nome: string | null } | null } | null;
}

const agente = (id: IdAgente) => AGENTES.find((a) => a.id === id)!;
const ha = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1 ? "agora há pouco" : h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} dia${Math.round(h / 24) === 1 ? "" : "s"}`;
};
const primeiro = (nome?: string | null) => (nome ?? "").trim().split(/\s+/)[0] || "";
/** "Quem revisa" tirado do próprio catálogo (a parte antes dos dois-pontos de quemAprova). */
const quemRevisa = (a: AgenteCatalogo) => a.quemAprova.split(":")[0];
const quandoCurto = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function useSugestoes(clientId: string, ag: Sugestao["agente"], dias = 14) {
  return useQuery({
    queryKey: ["sugestoes-agentes", clientId, ag],
    queryFn: async () => {
      const sel = ag === "recuperacao" ? "*, conversa:conversas(canal, pessoa:pessoas!conversas_pessoa_id_fkey(nome))" : "*";
      const { data, error } = await db.from("sugestoes_agentes").select(sel).eq("client_id", clientId).eq("agente", ag)
        .gte("criado_em", new Date(Date.now() - dias * 86_400_000).toISOString()).order("criado_em", { ascending: false }).order("prioridade", { ascending: false }).limit(60);
      if (error) throw error;
      if (ag === "recuperacao") {
        const { data: assumidas, error: erroAssumidas } = await db.from("operacao_recuperacao").select("sugestao_id").eq("client_id", clientId);
        if (erroAssumidas) throw erroAssumidas;
        const ids = new Set((assumidas ?? []).map((t: { sugestao_id: string }) => t.sugestao_id));
        return ((data ?? []) as Sugestao[]).filter((s) => !ids.has(s.id));
      }
      return (data ?? []) as Sugestao[];
    },
  });
}

function useDecidir(clientId: string, ag: string) {
  const qc = useQueryClient();
  return async (id: string, estado: Estado, resultado?: string) => {
    const { error } = await db.rpc("sugestao_decidir", { p_id: id, p_estado: estado, p_resultado: resultado ?? null });
    await qc.invalidateQueries({ queryKey: ["sugestoes-agentes", clientId, ag] });
    await qc.invalidateQueries({ queryKey: ["agentes-trabalho", clientId] });
    if (error) throw error;
  };
}

/** Detalhe recolhido que só monta o conteúdo quando abre: os painéis secundários não consultam nada antes disso. */
function NxRecolhidoSobDemanda({ titulo, aoAbrir, children }: { titulo: ReactNode; aoAbrir: (aberto: boolean) => void; children: ReactNode }) {
  return (
    <details className="nxb-recolhido" data-peca="recolhido" onToggle={(e) => aoAbrir(e.currentTarget.open)}>
      <summary>
        <span className="nxb-recolhido__textos"><b>{titulo}</b></span>
        <span className="nxb-recolhido__seta" aria-hidden><IconeTabler nome="chevron-down" tamanho={18} /></span>
      </summary>
      <div className="nxb-recolhido__corpo">{children}</div>
    </details>
  );
}

/** Painel de um agente: quem é, quando roda, quando entregou e "Rodar agora" para a equipe. */
function NxSecaoAgente({ id, a, clientId, ultima, aoTerminar, mostrarExecutar = true, children }: { id: string; a: AgenteCatalogo; clientId: string; ultima: string | null; aoTerminar: () => void; mostrarExecutar?: boolean; children: ReactNode }) {
  const { isAdmin } = useAuth();
  const [andando, setAndando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  async function rodar() {
    setErro(null);
    try { const e = await rodarFluxoAteFim(clientId, { id: a.fluxo, agente: a.agente, objetivo: a.entrega }, setAndando); if (e) setErro(e); }
    catch (e) { setErro(mensagemDeErroAcao(e)); }
    finally { setAndando(null); aoTerminar(); }
  }
  return (
    <NxCard
      id={`ag-${id}`}
      rotulo={a.nome}
      titulo={a.nome}
      subtitulo={mostrarExecutar ? a.entrega : undefined}
      icone={<IconeTabler nome="robot" tamanho={18} />}
      className={mostrarExecutar ? "" : "nx-card--plano"}
    >
      <div data-peca="agentes" className="nxa-secao-corpo">
        {mostrarExecutar && <p className="nxa-nota">Rotina prevista: {a.frequencia.toLowerCase()}{ultima ? ` · última entrega ${ha(ultima)}` : ""} · Quem revisa: {quemRevisa(a)}</p>}
        {isAdmin && mostrarExecutar && (
          <div className="nxa-item__acoes">
            <button type="button" className="nxa-botao nxa-botao--primario" disabled={!!andando} onClick={rodar} title="Rodar este agente agora para esta clínica">
              <IconeTabler nome="robot" tamanho={18} /> {andando ? "Preparando…" : TRABALHOS_AGENTE[a.id].acao}
            </button>
          </div>
        )}
        {andando && <p className="nxa-nota" aria-live="polite">{andando}</p>}
        {erro && <p className="nxa-erro" role="alert">{erro}</p>}
        {children}
      </div>
    </NxCard>
  );
}

function NxAcoes({ s, podeEditar, decidir, extra, somenteDescartar = false }: { s: Sugestao; podeEditar: boolean; decidir: (e: Estado) => Promise<void>; extra?: ReactNode; somenteDescartar?: boolean }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ir = async (e: Estado) => { setErro(null); setSalvando(true); try { await decidir(e); } catch { setErro("Não foi possível salvar a decisão. Tente novamente."); } finally { setSalvando(false); } };
  const medido = s.agente !== "recuperacao" && s.resultado && s.resultado !== "expirou sem revisão"
    ? <p className="nxa-medido"><b>Leitura posterior:</b> {s.resultado}</p> : null;
  const revisor = s.nota != null
    ? <p className="nxa-nota" title="Um segundo agente revisa tudo antes de chegar aqui; abaixo de 6 é descartado.">Nota do revisor: <b>{s.nota}/10</b>{s.critica ? ` · ${s.critica}` : ""}</p> : null;
  if (!podeEditar) return <>{medido}{revisor}{extra ? <div className="nxa-item__acoes">{extra}</div> : null}</>;
  return (
    <>{medido}{revisor}
      <div className="nxa-item__acoes">
        {extra}
        {erro && <p role="alert" className="nxa-erro">{erro}</p>}
        {s.estado === "proposta" ? (
          <>
            {!somenteDescartar && <button type="button" className="nxa-botao" disabled={salvando} onClick={() => ir("feita")}><IconeTabler nome="checklist" tamanho={18} /> Feito</button>}
            <button type="button" className="nxa-botao nxa-botao--discreto" disabled={salvando} onClick={() => ir("descartada")}><IconeTabler nome="x" tamanho={16} /> Descartar</button>
          </>
        ) : (
          <button type="button" className="nxa-botao nxa-botao--discreto" disabled={salvando} onClick={() => ir("proposta")}>Desfazer</button>
        )}
      </div>
    </>
  );
}

const RESULTADO: Record<string, string> = { enviada: "Mensagem enviada", respondeu: "Paciente respondeu", agendou: "Agendamento registrado", compareceu: "Comparecimento registrado", fechou: "Venda registrada" };

interface VazioProps { titulo: string; falta: string; passo?: string; quem?: "equipe_hub" | "atendimento" | "gestor_trafego" | "social_media" }

function NxLista({ itens, render, vazio }: { itens: Sugestao[]; render: (s: Sugestao) => ReactNode; vazio: VazioProps }) {
  const [verTodas, setVerTodas] = useState(false);
  const abertas = itens.filter((s) => s.estado === "proposta");
  const outras = itens.filter((s) => s.estado !== "proposta");
  const visiveis = verTodas ? [...abertas, ...outras] : abertas;
  return (
    <>
      {visiveis.length === 0 ? <NxVazio {...vazio} /> : <div className="nxa-grade">{visiveis.map(render)}</div>}
      {outras.length > 0 && <button type="button" className="nxa-link" onClick={() => setVerTodas(!verTodas)}>{verTodas ? "Esconder histórico" : `Ver histórico de ${outras.length} propostas`}</button>}
    </>
  );
}

const classeItem = (s: Sugestao) => `nxa-item${s.estado === "descartada" ? " nxa-item--descartada" : ""}`;

// ---------------------------------------------------------------- Recuperação de pacientes

const quando = (iso: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem sincronização confirmada";
async function rpc(nome: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(nome, args);
  if (error) throw new Error(error.message);
  return data;
}
function useAtualizarOperacao(clientId: string) {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ["operacao-recuperacao", clientId] }),
    qc.invalidateQueries({ queryKey: ["sugestoes-agentes", clientId, "recuperacao"] }),
    qc.invalidateQueries({ queryKey: ["painel-agentes", clientId] }),
    qc.invalidateQueries({ queryKey: ["agentes-trabalho", clientId] }),
  ]);
}

function NxAssumirRecuperacao({ clientId, sugestaoId }: { clientId: string; sugestaoId: string }) {
  const atualizar = useAtualizarOperacao(clientId);
  const [horas, setHoras] = useState("24");
  const m = useMutation({
    mutationFn: async () => {
      await rpc("operacao_iniciar", { p_sugestao_id: sugestaoId, p_prazo: new Date(Date.now() + Number(horas) * 3_600_000).toISOString() });
      await rpc("operacao_verificar", { p_client_id: clientId });
    },
    onSettled: atualizar,
  });
  return (
    <div className="nxa-sub">
      <div className="nxa-item__acoes">
        <label className="nxa-etiqueta nxa-etiqueta--linha">Meu prazo
          <select aria-label="Prazo para realizar o contato" value={horas} onChange={(e) => setHoras(e.target.value)} disabled={m.isPending} className="nxa-campo">
            <option value="4">4 horas</option><option value="24">24 horas</option><option value="48">48 horas</option>
          </select>
        </label>
        <button type="button" className="nxa-botao" disabled={m.isPending || m.isSuccess} onClick={() => m.mutate()}>
          <IconeTabler nome="arrow-right" tamanho={18} />{m.isPending ? "Organizando caso…" : m.isSuccess ? "Caso em acompanhamento" : "Assumir e acompanhar"}
        </button>
      </div>
      <p className="nxa-nota">Você assume a revisão e o contato. Depois, vincule a mensagem sincronizada para acompanhar o desfecho.</p>
      {m.isError && <p role="alert" className="nxa-erro">{mensagemDeErroAcao(m.error)}</p>}
    </div>
  );
}

interface MensagemSincronizada { id: string; enviada_em: string; texto: string | null; externo_id: string; direcao: string; tipo: string }
function NxCasoAssumido({ t, podeEditar, atualizar }: { t: TrabalhoRecuperacao; podeEditar: boolean; atualizar: () => Promise<unknown> }) {
  const [abrir, setAbrir] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [motivo, setMotivo] = useState("");
  const [encerrando, setEncerrando] = useState(false);
  const ms = useQuery({
    queryKey: ["operacao-mensagens", t.client_id, t.id, t.aprovado_em], enabled: abrir && podeEditar,
    queryFn: async () => {
      const data = await rpc("operacao_mensagens", { p_trabalho_id: t.id });
      return (data ?? []) as MensagemSincronizada[];
    },
  });
  const m = useMutation({
    mutationFn: async (acao: "vincular" | "encerrar" | "replanejar") => {
      if (acao === "vincular") await rpc("operacao_vincular_mensagem", { p_trabalho_id: t.id, p_mensagem_id: mensagem });
      else if (acao === "replanejar") await rpc("operacao_replanejar", { p_trabalho_id: t.id, p_prazo: new Date(Date.now() + 24 * 3_600_000).toISOString() });
      else await rpc("operacao_encerrar", { p_trabalho_id: t.id, p_motivo: motivo.trim() });
      setAbrir(false); setEncerrando(false);
    }, onSuccess: atualizar,
  });
  const aberta = !["resolvida", "cancelada"].includes(t.estado);
  const podeVincular = !t.mensagem_id && t.estado !== "bloqueada" && t.estado !== "cancelada";
  const eventos = t.observacao.eventos_crm ?? [];
  const candidatas = (ms.data ?? []).filter((x) => x.direcao === "saida" && !["kommo_robo", "sistema"].includes(x.tipo) && Date.parse(x.enviada_em) > Date.parse(t.aprovado_em));
  return (
    <article className="nxa-caso">
      <div className="nxa-caso__topo">
        <h4 className="nxa-titulo-item">{t.conversa?.pessoa?.nome || `Caso ${t.id.slice(0, 8)}`}</h4>
        <NxTag tom={["bloqueada", "escalada"].includes(t.estado) ? "or" : "g"}>{NOME_OPERACAO[t.estado]}</NxTag>
      </div>
      <p className="nxa-nota">{t.responsavel_nome} · Prazo: {quando(t.prazo)}</p>
      {t.motivo && <p className="nxa-texto">{t.motivo}</p>}
      {aberta && t.sugestao?.mensagem && (
        <div className="nxa-caixa">
          <h4>Rascunho para a equipe revisar</h4>
          <p className="nxa-caixa--pre">{t.sugestao.mensagem}</p>
          <div className="nxa-item__acoes"><BotaoCopiar texto={t.sugestao.mensagem} rotulo="Copiar rascunho do caso" /></div>
          <p className="nxa-nota">Confira o histórico e complete os campos antes do contato. Se houver bloqueio, repare a fonte primeiro.</p>
        </div>
      )}
      <ol className="nxa-evidencias" aria-label="Evidências do caso">
        <li>Assumido pela equipe · {quando(t.aprovado_em)}</li>
        <li>{t.observacao.contato_vinculado ? `Contato vinculado · ${quando(t.observacao.contato_vinculado.em)} · mensagem ${t.observacao.contato_vinculado.externo_id}` : t.mensagem_id ? "Contato vinculado ao registro da conversa" : "Contato ainda sem mensagem vinculada"}</li>
        {t.observacao.resposta && <li>Resposta recebida · {quando(t.observacao.resposta.em)} · Conversa sincronizada</li>}
        {eventos.map((e) => <li key={`${e.fonte}-${e.id}-${e.tipo}`}>{NOME_EVENTO[e.tipo] ?? e.tipo} · {quando(e.em)} · CRM, evento {e.id}</li>)}
      </ol>
      <div className="nxa-item__acoes">
        {podeEditar && podeVincular && <button type="button" className="nxa-botao" disabled={m.isPending} onClick={() => setAbrir(!abrir)}>{abrir ? "Fechar seleção" : "Revisar histórico e vincular contato"}</button>}
        {podeEditar && aberta && ["escalada", "bloqueada"].includes(t.estado) && <button type="button" className="nxa-botao" disabled={m.isPending} onClick={() => m.mutate("replanejar")}>Assumir revisão em 24h</button>}
        {podeEditar && aberta && <button type="button" className="nxa-botao" disabled={m.isPending} onClick={() => setEncerrando(!encerrando)}>Encerrar acompanhamento</button>}
      </div>
      {abrir && podeEditar && podeVincular && (
        <div className="nxa-sub">
          <p className="nxa-nota">Confirme qual mensagem foi enviada pela equipe para este caso. O provedor confirma o registro; a autoria é declarada por você. Copiar o rascunho não confirma envio.</p>
          {ms.data && (
            <NxRecolhido titulo={`Ver as últimas ${ms.data.length} mensagens sincronizadas`}>
              <ol className="nxa-mensagens">{ms.data.map((x) => <li key={x.id}><b>{x.direcao === "entrada" ? "Paciente" : "Clínica"} · {quando(x.enviada_em)}</b><p>{x.texto || "Sem texto disponível no provedor"}</p></li>)}</ol>
            </NxRecolhido>
          )}
          {ms.isLoading ? <NxCarregando linhas={2} /> : ms.isError ? <NxErro texto={mensagemDeErroAcao(ms.error)} onTentar={() => void ms.refetch()} /> : candidatas.length ? (
            <>
              <label className="nxa-etiqueta">Mensagem confirmada na conversa
                <select className="nxa-campo" value={mensagem} onChange={(e) => setMensagem(e.target.value)}>
                  <option value="">Selecione a mensagem</option>{candidatas.map((x) => <option key={x.id} value={x.id}>{quando(x.enviada_em)} · {(x.texto || x.externo_id).slice(0, 95)}</option>)}
                </select>
              </label>
              <div className="nxa-item__acoes"><button type="button" className="nxa-botao nxa-botao--primario" disabled={!mensagem || m.isPending} onClick={() => m.mutate("vincular")}>Confirmo o contato da equipe</button></div>
            </>
          ) : (
            <p className="nxa-nota">Nenhuma mensagem da clínica sincronizada após a aprovação. Realize o contato no canal da clínica e aguarde a sincronização. <button type="button" className="nxa-link" onClick={() => void ms.refetch()}>Conferir novamente</button></p>
          )}
        </div>
      )}
      {encerrando && podeEditar && aberta && (
        <form className="nxa-sub" onSubmit={(e) => { e.preventDefault(); m.mutate("encerrar"); }}>
          <label className="nxa-etiqueta">Motivo do encerramento
            <textarea className="nxa-campo" value={motivo} minLength={5} maxLength={500} required onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <div className="nxa-item__acoes"><button type="submit" className="nxa-botao nxa-botao--primario" disabled={m.isPending}>Confirmar encerramento</button></div>
        </form>
      )}
      {m.isError && <p role="alert" className="nxa-erro">{mensagemDeErroAcao(m.error)}</p>}
    </article>
  );
}

function NxOperacaoRecuperacao({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const atualizar = useAtualizarOperacao(clientId);
  const [todas, setTodas] = useState(false);
  const q = useQuery({
    queryKey: ["operacao-recuperacao", clientId], refetchInterval: 60_000,
    queryFn: async () => {
      const [fontes, trabalhos] = await Promise.all([
        db.rpc("operacao_fontes", { p_client_id: clientId }),
        db.from("operacao_recuperacao").select("*,sugestao:sugestoes_agentes(mensagem,titulo),conversa:conversas(pessoa:pessoas!conversas_pessoa_id_fkey(nome))").eq("client_id", clientId)
          .gte("criado_em", new Date(Date.now() - 30 * 86_400_000).toISOString()).order("atualizado_em", { ascending: false }).limit(100),
      ]);
      for (const r of [fontes, trabalhos]) if (r.error) throw new Error("Não foi possível carregar o acompanhamento e a cobertura das fontes.");
      if (!fontes.data || !Array.isArray(fontes.data.fontes)) throw new Error("Cobertura das fontes indisponível. Tente novamente.");
      return { fontes: fontes.data as SaudeOperacao, itens: (trabalhos.data ?? []) as TrabalhoRecuperacao[] };
    },
  });
  const verificar = useMutation({ mutationFn: () => rpc("operacao_verificar", { p_client_id: clientId }), onSuccess: atualizar });
  const dados = q.data;
  const resumo = resumoOperacao(dados?.itens ?? []);
  const visiveis = dados?.itens.filter((t) => todas || !["resolvida", "cancelada"].includes(t.estado)) ?? [];
  const numeros: [string, number][] = [
    ["Em andamento", resumo.emCurso], ["Pedem atenção", resumo.atencao], ["Contatos vinculados", resumo.contatos], ["Respostas observadas", resumo.respostas], ["Agendamentos no CRM", resumo.agendamentos],
  ];
  return (
    <NxCard
      id="operacao-recuperacao"
      titulo="Do próximo contato ao desfecho registrado."
      subtitulo="Operação de aquisição · piloto assistido"
      icone={<IconeTabler nome="inbox" tamanho={18} />}
    >
      <div data-peca="agentes" className="nxa-secao-corpo">
        <p className="nxa-texto">A equipe realiza o contato. O Nexo confere as fontes, acompanha os casos assumidos e interrompe a cadência quando há resposta ou avanço no CRM.</p>
        {podeEditar && (
          <div className="nxa-item__acoes">
            <button type="button" className="nxa-botao" disabled={verificar.isPending || q.isLoading} onClick={() => verificar.mutate()}>{verificar.isPending ? "Conferindo…" : "Verificar desfechos agora"}</button>
          </div>
        )}
        {q.isLoading && <NxCarregando />}
        {q.isError && <NxErro texto={mensagemDeErroAcao(q.error)} onTentar={() => void q.refetch()} />}
        {verificar.isError && <p role="alert" className="nxa-erro">{mensagemDeErroAcao(verificar.error)}</p>}
        {dados && (
          <>
            <div className="nxa-kpis nxa-kpis--5">
              {numeros.map(([r, v]) => <NxKpi key={r} icone={<IconeTabler nome="checklist" tamanho={16} />} rotulo={r} valor={v} />)}
            </div>
            <NxAviso
              tom={dados.fontes.apto ? "info" : "atencao"}
              titulo={dados.fontes.apto ? "Há coletas recentes; cobertura conferida em cada caso" : "Atualizar fontes antes de retomar contato"}
              detalhe={
                <>
                  <ul className="nxa-lista-pontos">{dados.fontes.fontes.map((f) => <li key={f.fonte}>{f.fonte === "crm" ? "CRM" : "Mensagens (última coleta completa)"}: {quando(f.sucesso_em)}{f.dados_ate ? ` · dados até ${f.dados_ate}` : ""}{f.erro_posterior ? " · última tentativa teve erro" : ""}{!f.atual ? " · requer conferência" : ""}</li>)}</ul>
                  <p className="nxa-nota">Conferência pela rotina agendada e pelo botão acima. Este piloto usa sincronizações de até {dados.fontes.limite_horas} horas; os registros não chegam em tempo real.</p>
                </>
              }
            />
            <div className="nxa-item__acoes">
              <p className="nxa-nota">Até 100 casos assumidos nos últimos 30 dias.</p>
              <button type="button" className="nxa-link" onClick={() => setTodas(!todas)}>{todas ? "Mostrar só em andamento" : "Incluir casos que avançaram ou foram encerrados"}</button>
            </div>
            {!visiveis.length && <NxVazio titulo="Nenhum caso neste filtro" falta="nenhum caso assumido neste filtro" passo="em Recuperação, revise uma proposta e use “Assumir e acompanhar”" quem="atendimento" />}
            <div className="nxa-lista">{visiveis.map((t) => <NxCasoAssumido key={t.id} t={t} podeEditar={podeEditar} atualizar={atualizar} />)}</div>
            <p className="nxa-nota">Os resultados são fatos observados desde a identificação da oportunidade, sem atribuição automática de crescimento ao agente. Venda registrada não confirma pagamento. Agendamentos dependem de etapas explicitamente mapeadas no CRM.</p>
          </>
        )}
      </div>
    </NxCard>
  );
}

export function NxRecuperarHoje({ clientId, podeEditar, mostrarExecutar = true }: { clientId: string; podeEditar: boolean; mostrarExecutar?: boolean }) {
  const { isAdmin } = useAuth();
  const q = useSugestoes(clientId, "recuperacao");
  const decidir = useDecidir(clientId, "recuperacao");
  const a = agente("recuperacao");
  const itens = q.data ?? [];
  return (
    <div className="nxa" data-peca="agentes">
      <NxOperacaoRecuperacao key={clientId} clientId={clientId} podeEditar={podeEditar} />
      <NxSecaoAgente id="recuperacao" a={a} clientId={clientId} ultima={itens[0]?.criado_em ?? null} aoTerminar={() => q.refetch()} mostrarExecutar={mostrarExecutar}>
        {q.isPending && <NxCarregando />}
        {q.isError && <NxErro texto="Não foi possível carregar as propostas." onTentar={() => void q.refetch()} />}
        {q.isSuccess && (
          <>
            <div className="nxa-kpis">
              <NxKpi icone={<IconeTabler nome="message-circle" tamanho={16} />} rotulo="Propostas para revisar" valor={itens.filter((s) => s.estado === "proposta").length} />
            </div>
            <NxLista itens={itens} vazio={{ titulo: "Nenhuma proposta pendente de revisão", falta: "nenhuma proposta nova; os casos assumidos ficam no acompanhamento acima", passo: "peça à equipe para preparar uma nova rodada de recuperação", quem: "equipe_hub" }} render={(s) => {
              const nome = primeiro(s.conversa?.pessoa?.nome);
              const msg = (s.mensagem ?? "").replace(/\[nome\]/gi, nome || "[nome]");
              return (
                <article key={s.id} className={classeItem(s)}>
                  <NxListRow
                    avatarNome={s.conversa?.pessoa?.nome || "Sem nome"}
                    titulo={<>{s.conversa?.pessoa?.nome || "Sem nome"}{s.conversa?.canal ? ` · ${s.conversa.canal}` : ""}</>}
                    sub={<span>{s.titulo}</span>}
                    fim={s.medicao?.versao === 2 && s.resultado ? <NxTag tom={s.resultado === "agendou" ? "up" : "g"}>{RESULTADO[s.resultado] ?? s.resultado}</NxTag> : undefined}
                  />
                  <p className="nxa-nota">Quem revisa: {quemRevisa(a)}</p>
                  <p className="nxa-caixa nxa-caixa--pre">{msg}</p>
                  {s.estado === "proposta" && s.medicao?.legado?.estado === "feita" && <p className="nxa-texto">Classificação automática anterior arquivada. Revise o caso com os dados atuais antes de novo contato.</p>}
                  {s.detalhe && <p className="nxa-nota">Por quê: {s.detalhe}</p>}
                  <div className="nxa-item__acoes">
                    <BotaoCopiar texto={msg} rotulo="Copiar rascunho" />
                    {s.conversa_id && isAdmin && <Link to="/$clientId/atendimento" params={{ clientId }} search={{ aba: "conversas", conversa: s.conversa_id } as never} className="nxa-botao"><IconeTabler nome="message-circle" tamanho={18} /> Ver conversa</Link>}
                  </div>
                  {podeEditar && s.estado === "proposta" && <NxAssumirRecuperacao key={s.id} clientId={clientId} sugestaoId={s.id} />}
                  <NxAcoes s={s} podeEditar={podeEditar} decidir={(e) => decidir(s.id, e)} somenteDescartar />
                </article>
              );
            }} />
          </>
        )}
      </NxSecaoAgente>
    </div>
  );
}

// ---------------------------------------------------------------- Gestor de anúncios

const ROTULO_SINAL: Record<string, string> = { sem_resultado: "Gastando sem resultado", custo_subiu: "Custo subiu", fadiga: "Criativo cansado", escalar: "Pode escalar", seguidor_caro: "Seguidor caro", perfil_escalar: "Seguidor barato: pode escalar" };

function NxCopies({ copies }: { copies: CopyAnuncio[] }) {
  if (!copies?.length) return null;
  return (
    <div className="nxa-secao-corpo">
      {copies.map((c, n) => {
        const texto = `${c.gancho}\n\n${c.texto}\n\n${c.cta}`;
        return (
          <div key={n} className="nxa-caixa">
            <h4>Copy {n + 1}</h4>
            <p><b>{c.gancho}</b></p>
            <p>{c.texto}</p>
            <p className="nxa-nota">{c.cta}</p>
            <div className="nxa-item__acoes"><BotaoCopiar texto={texto} rotulo="Copiar copy" /></div>
          </div>
        );
      })}
    </div>
  );
}

async function chamarAcaoAnuncio(clientId: string, corpo: Record<string, unknown>) {
  const { data: ses } = await supabase.auth.getSession();
  const r = await fetch("/api/sync/manual", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ses.session?.access_token ?? ""}` }, body: JSON.stringify({ client_id: clientId, alvo: "anuncio_acao", ...corpo }) });
  return (await r.json().catch(() => ({ ok: false, erro: `Falhou (${r.status})` }))) as { ok: boolean; erro?: string; token?: boolean };
}
interface AcaoAnuncio { id: string; tipo: string; pct: number | null; estado: string; erro: string | null; aplicado_em: string | null; criado_em: string; antes: any; depois: any }

/** Aplicar com 1 clique (só a equipe): a mudança vai pela API da Meta, com limite de 20% no orçamento, 1 mudança por
 *  campanha a cada 24 h e botão de desfazer. Sem o token de escrita, os botões ficam desligados com o aviso. */
function NxAcoesMeta({ clientId, s }: { clientId: string; s: Sugestao }) {
  const qc = useQueryClient();
  const st = useQuery({ queryKey: ["meta-escrita"], staleTime: 300_000, queryFn: () => chamarAcaoAnuncio(clientId, { acao: "status" }) });
  const hist = useQuery({
    queryKey: ["anuncios-acoes", s.campanha_id],
    enabled: !!s.campanha_id,
    queryFn: async () => {
      const { data } = await db.from("anuncios_mudancas").select("id, tipo, pct, estado, erro, aplicado_em, criado_em, antes, depois").eq("campanha_id", s.campanha_id).order("criado_em", { ascending: false }).limit(5);
      return (data ?? []) as AcaoAnuncio[];
    },
  });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const opcoes = acoesDoSinal(s.tipo);
  if (!s.campanha_id || (!opcoes.length && !(hist.data ?? []).length)) return null;
  const temToken = st.data?.token === true;
  async function ir(corpo: Record<string, unknown>, confirmar: string) {
    if (!window.confirm(confirmar)) return;
    setOcupado(true); setErro(null);
    const r = await chamarAcaoAnuncio(clientId, corpo);
    if (!r.ok) setErro(r.erro ?? "Não foi possível aplicar.");
    setOcupado(false);
    await qc.invalidateQueries({ queryKey: ["anuncios-acoes", s.campanha_id] });
    await qc.invalidateQueries({ queryKey: ["sugestoes-agentes", clientId, "anuncios"] });
  }
  const desc = (a: AcaoAnuncio) => a.tipo === "pausar" ? "Campanha pausada" : a.tipo === "ativar" ? "Campanha reativada"
    : `Orçamento ${Number(a.pct) > 0 ? "+" : ""}${a.pct}%${(a.antes?.orcamentos ?? []).length ? ` (${brlCentavos((a.antes.orcamentos as { daily_budget: number }[]).reduce((t, o) => t + o.daily_budget, 0))} → ${brlCentavos(((a.depois?.orcamentos ?? []) as { daily_budget: number }[]).reduce((t, o) => t + o.daily_budget, 0))}/dia)` : ""}`;
  return (
    <div className="nxa-sub">
      <p className="nxa-rotulo">Aplicar na Meta (com aprovação)</p>
      {!temToken && st.data && <p className="nxa-nota">Aguardando o token de escrita da Meta na Vercel (META_ADS_WRITE_TOKEN). Até lá, faça a mudança no Gerenciador.</p>}
      <div className="nxa-item__acoes">
        {opcoes.map((o) => (
          <button key={o.rotulo} type="button" disabled={!temToken || ocupado} className={`nxa-botao${o.tipo === "pausar" ? " nxa-botao--perigo" : ""}`}
            onClick={() => ir({ tipo: o.tipo as TipoAcao, pct: o.pct, campanha_id: s.campanha_id, sugestao_id: s.id }, `${o.rotulo} na Meta agora? Dá para desfazer depois.`)}>
            {o.rotulo}
          </button>
        ))}
      </div>
      {erro && <p className="nxa-erro">{erro}</p>}
      {(hist.data ?? []).map((a) => (
        <p key={a.id} className="nxa-nota">
          {a.estado === "falhou" ? `Falhou: ${a.erro}` : `${desc(a)} · ${new Date(a.aplicado_em ?? a.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${a.estado === "desfeita" ? " · desfeita" : ""}`}
          {a.estado === "aplicada" && temToken && <> <button type="button" disabled={ocupado} className="nxa-link" onClick={() => ir({ acao: "desfazer", id: a.id }, "Desfazer esta mudança na Meta?")}>Desfazer</button></>}
        </p>
      ))}
    </div>
  );
}

export function NxGestorAnuncios({ clientId, podeEditar, mostrarExecutar = true }: { clientId: string; podeEditar: boolean; mostrarExecutar?: boolean }) {
  const q = useSugestoes(clientId, "anuncios", 10);
  const decidir = useDecidir(clientId, "anuncios");
  const a = agente("anuncios");
  const itens = q.data ?? [];
  return (
    <NxSecaoAgente id="anuncios" a={a} clientId={clientId} ultima={itens[0]?.criado_em ?? null} aoTerminar={() => q.refetch()} mostrarExecutar={mostrarExecutar}>
      {q.isPending ? <NxCarregando /> : q.isError ? <NxErro texto="Não foi possível carregar as recomendações." onTentar={() => void q.refetch()} /> : (
        <>
          <div className="nxa-kpis">
            <NxKpi icone={<IconeTabler nome="target" tamanho={16} />} rotulo="Recomendações para revisar" valor={itens.filter((s) => s.estado === "proposta").length} />
          </div>
          <NxLista itens={itens} vazio={{ titulo: "Nenhuma recomendação neste intervalo", falta: "nenhuma recomendação nos últimos 10 dias; isso não confirma que a conta está saudável", passo: "confira o estado da rodada e a cobertura dos anúncios", quem: "gestor_trafego" }} render={(s) => <NxCartaoAnuncio key={s.id} s={s} clientId={clientId} podeEditar={podeEditar} decidir={(e) => decidir(s.id, e)} />} />
        </>
      )}
    </NxSecaoAgente>
  );
}

function NxCartaoAnuncio({ s, clientId, podeEditar, decidir }: { s: Sugestao; clientId: string; podeEditar: boolean; decidir: (e: Estado) => Promise<void> }) {
  const { isAdmin } = useAuth();
  const passos: string[] = s.conteudo?.passos ?? [];
  const copies: CopyAnuncio[] = s.conteudo?.copies ?? [];
  const tom: NxTom = s.tipo === "escalar" || s.tipo === "perfil_escalar" ? "up" : "or";
  return (
    <article className={classeItem(s)}>
      <div className="nxa-faixa"><NxTag tom={tom}>{ROTULO_SINAL[s.tipo] ?? s.tipo}</NxTag></div>
      <h4 className="nxa-titulo-item">{s.titulo}</h4>
      {s.detalhe && <p className="nxa-texto">{s.detalhe}</p>}
      <ul className="nxa-lista-pontos">{s.evidencias.map((e) => <li key={e}>{e}</li>)}</ul>
      <NxRecolhido titulo={`Passo a passo${copies.length ? ` e ${copies.length} copies novas` : ""}`}>
        <div className="nxa-secao-corpo">
          <ol className="nxa-passos">{passos.map((p) => <li key={p}>{p}</li>)}</ol>
          <NxCopies copies={copies} />
        </div>
      </NxRecolhido>
      {isAdmin && <NxAcoesMeta clientId={clientId} s={s} />}
      <NxAcoes s={s} podeEditar={podeEditar} decidir={decidir} />
    </article>
  );
}

// ---------------------------------------------------------------- Roteirista de conteúdo

export function NxRoteirosProntos({ clientId, podeEditar, mostrarExecutar = true }: { clientId: string; podeEditar: boolean; mostrarExecutar?: boolean }) {
  const q = useSugestoes(clientId, "conteudo", 21);
  const decidir = useDecidir(clientId, "conteudo");
  const pautas = usePautas(clientId);
  const a = agente("conteudo");
  const itens = q.data ?? [];
  const [levando, setLevando] = useState(false);
  const [erroPlanejador, setErroPlanejador] = useState<string | null>(null);
  const [sucessoPlanejador, setSucessoPlanejador] = useState<string | null>(null);
  const guardaPlanejador = useRef(false);
  const noPlanejador = new Set((pautas.q.data?.pautas ?? []).map((p) => p.ideia_id));
  async function levar(s: Sugestao) {
    if (guardaPlanejador.current || !pautas.q.isSuccess || pautas.q.data.semTabela) return;
    guardaPlanejador.current = true; setLevando(true); setErroPlanejador(null); setSucessoPlanejador(null);
    const p = s.conteudo as PecaConteudo;
    try {
      await pautas.criar.mutateAsync({
        client_id: clientId, ideia_id: `agente:${s.id}`, titulo: p.titulo, formato: p.formato, objetivo: p.objetivo, status: "escolhida",
        motivo: p.por_que || null, origem_tipo: "dado", origem_texto: p.evidencias.join(" · ") || null, gancho: p.gancho,
        roteiro: p.formato === "reels" ? p.cenas.map((c) => `${c.fala}${c.tela ? ` [tela: ${c.tela}]` : ""}${c.visual ? ` (imagem: ${c.visual})` : ""}`) : p.slides.map((sl, n) => `Slide ${n + 1}: ${sl.titulo}${sl.texto ? `. ${sl.texto}` : ""}`),
        cta: p.cta, aviso: null, dia: null, post_id: null,
      });
      try { await decidir(s.id, "feita"); setSucessoPlanejador("Roteiro salvo no planejador. Abra o planejamento da semana para definir a data e acompanhar a produção."); }
      catch { setErroPlanejador("O roteiro foi salvo no planejador, mas a fila de revisão não foi atualizada. Confira a pauta no planejador antes de repetir a operação."); }
    } catch { setErroPlanejador("Não foi possível salvar o roteiro no planejador. A proposta foi preservada; tente novamente."); }
    finally { guardaPlanejador.current = false; setLevando(false); }
  }
  return (
    <NxSecaoAgente id="conteudo" a={a} clientId={clientId} ultima={itens[0]?.criado_em ?? null} aoTerminar={() => q.refetch()} mostrarExecutar={mostrarExecutar}>
      {pautas.q.isError && <NxErro texto="Não foi possível conferir o planejador." onTentar={() => void pautas.q.refetch()} />}
      {pautas.q.data?.semTabela && <p role="status" className="nxa-nota">Planejador indisponível nesta instalação. Os roteiros continuam disponíveis para revisão e cópia.</p>}
      {erroPlanejador && <p role="alert" className="nxa-erro">{erroPlanejador}</p>}
      {sucessoPlanejador && <p role="status" className="nxa-nota">{sucessoPlanejador}</p>}
      {q.isPending ? <NxCarregando /> : q.isError ? <NxErro texto="Não foi possível carregar os roteiros." onTentar={() => void q.refetch()} /> : (
        <>
          <div className="nxa-kpis">
            <NxKpi icone={<IconeTabler nome="file-text" tamanho={16} />} rotulo="Roteiros para revisar" valor={itens.filter((s) => s.estado === "proposta").length} />
          </div>
          <NxLista itens={itens} vazio={{ titulo: "Nenhum roteiro aberto neste intervalo", falta: "nenhum roteiro nos últimos 21 dias", passo: "confira os dados e o estado da rodada antes de preparar novos materiais", quem: "social_media" }} render={(s) => (
            <NxCartaoPeca key={s.id} s={s} podeEditar={podeEditar} decidir={(e) => decidir(s.id, e)} levando={levando} levar={podeEditar && pautas.q.isSuccess && !pautas.q.data.semTabela && !noPlanejador.has(`agente:${s.id}`) ? () => void levar(s) : undefined} />
          )} />
        </>
      )}
    </NxSecaoAgente>
  );
}

function NxCartaoPeca({ s, podeEditar, decidir, levar, levando }: { s: Sugestao; podeEditar: boolean; decidir: (e: Estado) => Promise<void>; levar?: () => void; levando?: boolean }) {
  const p = s.conteudo as PecaConteudo;
  if (!p?.formato) return null;
  return (
    <article className={classeItem(s)}>
      <div className="nxa-faixa"><NxTag tom="b">{p.formato === "reels" ? `Reels · ${p.cenas.length} cenas` : `Carrossel · ${p.slides.length} slides`}</NxTag><span>{p.objetivo}</span></div>
      <h4 className="nxa-titulo-item">{p.titulo}</h4>
      <p className="nxa-texto"><b>Gancho:</b> “{p.gancho}”</p>
      {p.por_que && <p className="nxa-nota">{p.por_que}</p>}
      <NxRecolhido titulo={p.formato === "reels" ? "Ver roteiro e legenda" : "Ver slides e legenda"}>
        <div className="nxa-secao-corpo">
          {p.formato === "reels" ? (
            <ol className="nxa-lista">
              {p.cenas.map((c, n) => (
                <li key={n} className="nxa-caixa">
                  <h4>Cena {n + 1}{c.visual ? ` · ${c.visual}` : ""}</h4>
                  <p>{c.fala}</p>
                  {c.tela && <p className="nxa-nota">Na tela: {c.tela}</p>}
                </li>
              ))}
            </ol>
          ) : (
            <ol className="nxa-lista">
              {p.slides.map((sl, n) => (
                <li key={n} className="nxa-caixa">
                  <h4>Slide {n + 1}</h4>
                  <p><b>{sl.titulo}</b></p>
                  {sl.texto && <p>{sl.texto}</p>}
                </li>
              ))}
            </ol>
          )}
          <div className="nxa-caixa nxa-caixa--pre">
            <h4>Legenda</h4>
            <p>{p.legenda}</p>
            {p.hashtags.length > 0 && <p className="nxa-nota">{p.hashtags.join(" ")}</p>}
          </div>
          {p.evidencias.length > 0 && <ul className="nxa-lista-pontos">{p.evidencias.map((e) => <li key={e}>{e}</li>)}</ul>}
          {p.brain.length > 0 && <p className="nxa-faixa">Brand Brain: {p.brain.map((b) => <code key={b}>{b}</code>)}</p>}
        </div>
      </NxRecolhido>
      <NxAcoes s={s} podeEditar={podeEditar} decidir={decidir} extra={<>
        <BotaoCopiar texto={pecaParaTexto(p)} rotulo="Copiar tudo" />
        {levar && <button type="button" className="nxa-botao" disabled={levando} onClick={levar}><IconeTabler nome="calendar" tamanho={18} /> {levando ? "Salvando no planejador…" : "Levar ao planejador"}</button>}
      </>} />
    </article>
  );
}

// ---------------------------------------------------------------- o que os agentes aprenderam

interface Licao { id: string; agente: string; texto: string; evidencia: string[]; n: number; sinal: "faz" | "evita"; confianca: "alta" | "media"; origem: string; estado: string; atualizado_em: string }
const ORIGEM: Record<string, string> = { posts: "Instagram", conversas: "conversas do WhatsApp", anuncios: "anúncios", resultados: "resultado das sugestões" };
const NOME_AGENTE: Record<string, string> = { conteudo: "Roteirista", recuperacao: "Recuperação e atendimento", anuncios: "Gestor de anúncios", campanhas: "Estrategista" };

/** Lições que o sistema tirou sozinho dos dados da clínica e que os agentes usam em toda rodada. A equipe pode vetar. */
export function NxAprendizados({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [verVetadas, setVerVetadas] = useState(false);
  const [vetando, setVetando] = useState(false);
  const [erroLicao, setErroLicao] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["agentes-aprendizados", clientId],
    queryFn: async () => {
      const { data, error } = await db.from("agentes_aprendizados").select("id, agente, texto, evidencia, n, sinal, confianca, origem, estado, atualizado_em")
        .eq("client_id", clientId).in("estado", ["ativo", "vetado"]).order("confianca").order("n", { ascending: false }).limit(80);
      if (error) throw error;
      return (data ?? []) as Licao[];
    },
  });
  async function vetar(id: string, v: boolean) {
    setVetando(true); setErroLicao(null);
    try {
      const { error } = await db.rpc("aprendizado_vetar", { p_id: id, p_vetar: v });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["agentes-aprendizados", clientId] });
    } catch { setErroLicao("Não foi possível salvar a decisão sobre esta lição. Tente novamente."); }
    finally { setVetando(false); }
  }
  // A mesma lição aparece para mais de um agente (o Estrategista reaproveita); na tela, uma vez só.
  const vistas = new Set<string>();
  const todas = (q.data ?? []).filter((l) => { if (vistas.has(l.texto)) return false; vistas.add(l.texto); return true; });
  const ativas = todas.filter((l) => l.estado === "ativo"), vetadas = todas.filter((l) => l.estado === "vetado");
  const lista = verVetadas ? [...ativas, ...vetadas] : ativas;
  return (
    <NxCard id="ag-aprendeu" titulo="O que os agentes aprenderam com os dados desta clínica" icone={<IconeTabler nome="bulb" tamanho={18} />}>
      <div data-peca="agentes" className="nxa-secao-corpo">
        {q.isSuccess && <div className="nxa-kpis"><NxKpi icone={<IconeTabler nome="bulb" tamanho={16} />} rotulo="Lições em uso" valor={ativas.length} /></div>}
        <NxRecolhido titulo="Como funciona" resumo="De onde vêm as lições">
          <p className="nxa-texto">Todo dia o sistema compara o que funcionou e o que não funcionou (posts, conversas, anúncios e o resultado das próprias sugestões) e reescreve estas lições. Só vira lição o que tem amostra mínima e diferença grande; o que deixa de valer some sozinho. Os agentes seguem estas lições em toda rodada.{podeEditar ? " Se uma lição não faz sentido, vete: o agente para de usar." : ""}</p>
        </NxRecolhido>
        {erroLicao && <p role="alert" className="nxa-erro">{erroLicao}</p>}
        {q.isLoading ? <NxCarregando /> : q.isError ? <NxErro texto="Não foi possível carregar o aprendizado." onTentar={() => void q.refetch()} /> : lista.length === 0 ? (
          <NxVazio titulo="Ainda sem lições" falta="ainda não há dado suficiente (pelo menos 12 posts com alcance, 25 conversas comerciais lidas ou 3 campanhas com resultado)" passo="aguarde o próximo ciclo diário de leitura" quem="equipe_hub" />
        ) : (
          <ul className="nxa-lista">
            {lista.map((l) => (
              <li key={l.id} className={`nxa-licao${l.estado === "vetado" ? " nxa-licao--vetada" : ""}`}>
                <div className="nxa-faixa">
                  <NxTag tom={l.sinal === "faz" ? "up" : "dn"} seta={l.sinal === "faz" ? "cima" : "baixo"}>{l.sinal === "faz" ? "Fazer" : "Evitar"}</NxTag>
                  <span>{NOME_AGENTE[l.agente] ?? l.agente} · fonte: {ORIGEM[l.origem] ?? l.origem} · confiança {l.confianca}</span>
                </div>
                <p className="nxa-texto">{l.texto}</p>
                {Array.isArray(l.evidencia) && l.evidencia.length > 0 && <ul className="nxa-lista-pontos">{l.evidencia.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>}
                {podeEditar && (
                  <div className="nxa-item__acoes">
                    <button type="button" disabled={vetando} className="nxa-botao nxa-botao--discreto" onClick={() => void vetar(l.id, l.estado !== "vetado")}>
                      {l.estado === "vetado" ? "Voltar a usar" : "Não faz sentido, vetar"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {vetadas.length > 0 && <button type="button" className="nxa-link" onClick={() => setVerVetadas(!verVetadas)}>{verVetadas ? "Esconder vetadas" : `Ver ${vetadas.length} vetada${vetadas.length === 1 ? "" : "s"}`}</button>}
      </div>
    </NxCard>
  );
}

// ---------------------------------------------------------------- atendente de IA (piloto, modo sombra)

interface RascunhoAtendente {
  id: string; gatilho_em: string; gatilho_texto: string; acao: string; mensagem: string | null; motivo: string | null; risco: string | null; erro: string | null;
  faltou: string[]; resposta_humana: string | null; tempo_humano_s: number | null; avaliacao: string | null; avaliacao_motivo: string | null;
}
const ACAO_ATENDENTE: Record<string, string> = { responder: "Responderia", passar_humano: "Passaria para a equipe", descartado: "Barrado pelas regras" };

/** Só admin: o que o atendente teria respondido a cada paciente, ao lado da resposta real da clínica. Nada é enviado. */
export function NxAtendentePiloto({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["atendente-piloto", clientId],
    queryFn: async () => {
      const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [cfg, rs, fatos] = await Promise.all([
        db.from("atendente_config").select("modo").eq("client_id", clientId).maybeSingle(),
        db.from("atendente_rascunhos").select("id, gatilho_em, gatilho_texto, acao, mensagem, motivo, risco, erro, faltou, resposta_humana, tempo_humano_s, avaliacao, avaliacao_motivo")
          .eq("client_id", clientId).gte("gatilho_em", desde).order("gatilho_em", { ascending: false }).limit(300),
        db.from("brain_itens").select("estado").eq("client_id", clientId).eq("memoria", "comercial").like("chave", "atend_%"),
      ]);
      const f = (fatos.data ?? []) as { estado: string }[];
      return { modo: (cfg.data?.modo as string) ?? "desligado", rascunhos: (rs.data ?? []) as RascunhoAtendente[], aprovados: f.filter((x) => x.estado === "aprovado").length, propostos: f.filter((x) => x.estado === "proposto").length };
    },
  });
  const [ver, setVer] = useState(12);
  const atualizar = () => qc.invalidateQueries({ queryKey: ["atendente-piloto", clientId] });
  async function modo(m: string) { await db.rpc("atendente_definir_modo", { p_client_id: clientId, p_modo: m }); await atualizar(); }
  async function avaliar(r: RascunhoAtendente, a: "boa" | "ruim") {
    let motivo: string | null = null;
    if (a === "ruim") { motivo = window.prompt("O que estava errado? (o atendente aprende com isso)", r.avaliacao_motivo ?? ""); if (motivo === null) return; }
    await db.rpc("atendente_avaliar", { p_id: r.id, p_avaliacao: r.avaliacao === a ? null : a, p_motivo: motivo });
    await atualizar();
  }
  const d = q.data;
  const rs = d?.rascunhos ?? [];
  const n = resumoPiloto(rs.map((r) => ({ ...r, faltou: Array.isArray(r.faltou) ? r.faltou : [] })));
  return (
    <NxCard
      id="ag-atendente"
      titulo="Atendente de IA · piloto em modo sombra"
      icone={<IconeTabler nome="message-circle" tamanho={18} />}
      subtitulo="Visível só para a equipe Doctor Creator."
    >
      <div data-peca="agentes" className="nxa-secao-corpo">
        <div className="nxa-item__acoes">
          <label className="nxa-etiqueta nxa-etiqueta--linha">Modo
            <select value={d?.modo ?? "desligado"} onChange={(e) => modo(e.target.value)} className="nxa-campo">
              <option value="desligado">Desligado</option>
              <option value="sombra">Sombra (escreve, não envia)</option>
            </select>
          </label>
        </div>
        <NxRecolhido titulo="Como funciona" resumo="Nada é enviado ao paciente">
          <p className="nxa-texto">Para cada mensagem de paciente, o atendente escreve o que responderia, só com fatos aprovados no Brand Brain, e passa para a equipe tudo o que for clínico, urgente ou reclamação. <b>Nada é enviado ao paciente.</b> Aqui você compara com a resposta real da clínica e avalia; as avaliações voltam para o atendente.</p>
        </NxRecolhido>
        {q.isError && <NxErro texto="Não foi possível carregar o piloto do atendente." onTentar={() => void q.refetch()} />}
        {d && (d.aprovados < 3) && (
          <NxAviso tom="atencao" titulo="Fatos de atendimento:">
            {d.aprovados} aprovado{d.aprovados === 1 ? "" : "s"}{d.propostos ? `, ${d.propostos} proposto${d.propostos === 1 ? "" : "s"} pelo agente a partir das respostas da secretária` : ""}. Sem endereço, horário, convênios e como agendar aprovados, o atendente só acolhe e passa para a equipe. <Link to="/admin/brain" className="nxa-link">Aprovar no Brand Brain →</Link>
          </NxAviso>
        )}
        {rs.length > 0 && (
          <div className="nxa-kpis">
            <NxKpi icone={<IconeTabler nome="message-circle" tamanho={16} />} rotulo="Mensagens de paciente (7 dias)" valor={n.total} />
            <NxKpi icone={<IconeTabler nome="robot" tamanho={16} />} rotulo="Responderia sozinho" valor={`${n.total ? Math.round((100 * n.responderia) / n.total) : 0}%`} />
            <NxKpi icone={<IconeTabler nome="inbox" tamanho={16} />} rotulo="Tempo da clínica hoje (mediana)" valor={duracao(n.medianaHumanoS)} />
            <NxKpi icone={<IconeTabler nome="target" tamanho={16} />} rotulo="Clínica levou mais de 15 min" valor={`${n.demorou15} de ${n.comTempo}`} />
          </div>
        )}
        {n.faltou.length > 0 && <p className="nxa-texto"><b>O que mais faltou saber:</b> {n.faltou.map(([k, v]) => `${k} (${v})`).join("; ")}.</p>}
        {q.isLoading ? <NxCarregando /> : rs.length === 0 ? (
          <NxVazio titulo={d?.modo === "sombra" ? "Ligado, aguardando os primeiros rascunhos" : "Atendente desligado"} falta={d?.modo === "sombra" ? "ainda não há rascunhos; eles aparecem na próxima leitura das conversas (a cada 20 minutos, das 7h às 21h)" : "o modo sombra está desligado nesta clínica"} passo={d?.modo === "sombra" ? "aguarde a próxima leitura das conversas" : "ligue o modo sombra para começar o piloto nesta clínica"} quem="equipe_hub" />
        ) : (
          <ul className="nxa-lista">
            {rs.slice(0, ver).map((r) => (
              <li key={r.id} className="nxa-item">
                <div className="nxa-faixa">
                  <span>{quandoCurto(r.gatilho_em)}</span>
                  <NxTag tom={r.acao === "responder" ? "b" : r.acao === "descartado" ? "dn" : "g"}>{ACAO_ATENDENTE[r.acao] ?? r.acao}{r.risco ? ` · ${r.risco}` : ""}</NxTag>
                </div>
                <p className="nxa-texto nxa-caixa--pre"><b>Paciente:</b> {r.gatilho_texto}</p>
                <div className="nxa-dupla">
                  <div className="nxa-caixa nxa-caixa--pre">
                    <h4>Atendente (em menos de 1 min)</h4>
                    <p>{r.mensagem ?? "(sem texto)"}</p>
                    {(r.erro || r.motivo) && <p className="nxa-nota">{r.erro ? `Barrado: ${r.erro}` : r.motivo}</p>}
                  </div>
                  <div className="nxa-caixa nxa-caixa--pre">
                    <h4>Clínica ({duracao(r.tempo_humano_s)})</h4>
                    <p>{r.resposta_humana ?? "Ainda sem resposta."}</p>
                  </div>
                </div>
                <div className="nxa-item__acoes">
                  <button type="button" aria-pressed={r.avaliacao === "boa"} className="nxa-botao nxa-botao--discreto" onClick={() => avaliar(r, "boa")}>Boa</button>
                  <button type="button" aria-pressed={r.avaliacao === "ruim"} className="nxa-botao nxa-botao--discreto" onClick={() => avaliar(r, "ruim")}>Ruim</button>
                  {r.avaliacao_motivo && <span className="nxa-nota">“{r.avaliacao_motivo}”</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {rs.length > ver && <button type="button" className="nxa-link" onClick={() => setVer(ver + 20)}>Ver mais</button>}
      </div>
    </NxCard>
  );
}

// ---------------------------------------------------------------- prova de resultado ("O que mudou")

const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const brl = (x: number | null) => (x == null ? "—" : x.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
const SETA: Record<Direcao, string> = { melhor: "melhorou", pior: "piorou", igual: "estável", sem_dado: "" };

function NxIndicador({ rotulo, atual, anterior, fmt, menorMelhor, ajuda, erroDado }: { rotulo: string; atual: number | null; anterior: number | null; fmt: (x: number | null) => string; menorMelhor?: boolean; ajuda: string; erroDado?: boolean }) {
  const d = direcao(atual, anterior, menorMelhor);
  return (
    <NxKpi
      icone={<IconeTabler nome="chart-bar" tamanho={16} />}
      rotulo={rotulo}
      titulo={ajuda}
      valor={erroDado ? "Erro de dado" : fmt(atual)}
      nota={erroDado ? "Mais agendamentos que conversas de venda" : anterior != null ? `antes: ${fmt(anterior)}${SETA[d] ? ` · ${SETA[d]}` : ""}` : "sem período anterior ainda"}
    />
  );
}

export function NxProvaResultado({ clientId }: { clientId: string }) {
  const q = useQuery({
    queryKey: ["prova-resultado", clientId],
    queryFn: async () => {
      const { data, error } = await db.rpc("prova_resultado", { p_client_id: clientId, p_semanas: 12 });
      if (error) throw error;
      return ((data ?? []) as SemanaProva[]).map((s) => ({ ...s, conversas: Number(s.conversas), comerciais: Number(s.comerciais), agendou: Number(s.agendou), respondidas: Number(s.respondidas), resp_5min: Number(s.resp_5min), investimento: Number(s.investimento), resposta_mediana_s: s.resposta_mediana_s == null ? null : Number(s.resposta_mediana_s) }));
    },
  });
  const linhas = q.data ?? [];
  if (q.isLoading) return <NxCarregando texto="Conferindo os indicadores da clínica…" />;
  if (q.isError) return <NxErro texto="Não foi possível carregar os indicadores." onTentar={() => void q.refetch()} />;
  if (!linhas.length) return <NxVazio titulo="Sem histórico para comparar" falta="ainda não há histórico suficiente para comparar a evolução dos indicadores da clínica" passo="aguarde mais semanas de conversas e anúncios" quem="equipe_hub" />;
  const { atual, anterior } = compararPeriodos(linhas, new Date().toISOString());
  const temAnterior = anterior.semanas > 0;
  const a: Bloco = atual, b: Bloco | null = temAnterior ? anterior : null;
  const tabela = linhas.slice(-8).map((s) => ({
    semana: new Date(s.semana + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    conversas: s.conversas,
    comerciais: s.comerciais,
    agendou: semanaInconsistente(s) ? <span title="Mais agendamentos que conversas de venda: erro de dado">erro de dado</span> : s.agendou,
    resposta: duracaoCurta(s.resposta_mediana_s),
    ate5: s.respondidas ? `${Math.round((100 * s.resp_5min) / s.respondidas)}%` : "—",
    investimento: s.investimento ? brl(s.investimento) : "—",
  }));
  return (
    <NxCard id="prova" titulo={`O que mudou: últimas ${a.semanas} semanas${b ? ` contra as ${b.semanas} anteriores` : ""}`} icone={<IconeTabler nome="chart-bar" tamanho={18} />}>
      <div data-peca="agentes" className="nxa-secao-corpo">
        <div className="nxa-kpis">
          <NxIndicador rotulo="Tempo até a 1ª resposta" atual={a.resposta_s} anterior={b?.resposta_s ?? null} fmt={duracaoCurta} menorMelhor ajuda="Mediana do tempo entre a primeira mensagem do paciente e a primeira resposta da clínica." />
          <NxIndicador rotulo="Respondidas em até 5 min" atual={a.em5} anterior={b?.em5 ?? null} fmt={pct} ajuda="Das conversas respondidas, quantas tiveram resposta em até 5 minutos." />
          <NxIndicador rotulo="Agendaram (das conversas de venda)" atual={a.taxa} anterior={b?.erro_dado ? null : b?.taxa ?? null} fmt={pct} erroDado={a.erro_dado} ajuda="Das conversas que a IA classificou como comerciais, quantas terminaram em agendamento. Só entram agendamentos de conversas de venda." />
          <NxIndicador rotulo="Investimento por agendamento" atual={a.custo_agendamento} anterior={b?.custo_agendamento ?? null} fmt={brl} menorMelhor erroDado={a.erro_dado} ajuda="Investimento em anúncios no período dividido pelos agendamentos lidos nas conversas de venda." />
        </div>
        <NxAviso tom="info" titulo={`Mudou em ${MUDOU_AGENDOU_EM}:`}>"Agendaram" agora conta só as conversas de venda que terminaram em agendamento. Antes contava todas as conversas com agendamento, e a taxa podia passar de 100%. O investimento por agendamento usa o mesmo número.</NxAviso>
        <NxRecolhido titulo="Como ler esta comparação" resumo="A comparação não atribui a mudança aos agentes">
          <p className="nxa-texto">Indicadores das conversas, da leitura da IA e dos anúncios para acompanhar a evolução da clínica. A comparação não atribui a mudança aos agentes. Agendamentos classificados pela IA precisam de conferência; o investimento por agendamento não é custo de aquisição atribuído.{!b ? ` O histórico de conversas começa em ${new Date(linhas[0].semana + "T12:00:00").toLocaleDateString("pt-BR")}: este é o ponto de partida.` : ""}</p>
        </NxRecolhido>
        <NxTabela
          rotulo="Indicadores por semana"
          colunas={[
            { chave: "semana", titulo: "Semana" },
            { chave: "conversas", titulo: "Conversas", numerica: true },
            { chave: "comerciais", titulo: "De venda", numerica: true },
            { chave: "agendou", titulo: "Agendaram", numerica: true },
            { chave: "resposta", titulo: "1ª resposta", numerica: true },
            { chave: "ate5", titulo: "Até 5 min", numerica: true },
            { chave: "investimento", titulo: "Investimento", numerica: true },
          ]}
          linhas={tabela}
        />
      </div>
    </NxCard>
  );
}

// ---------------------------------------------------------------- centro de trabalho dos agentes

const quandoFortaleza = (s: string | null | undefined) => s && Number.isFinite(Date.parse(s))
  ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" }) : "Sem entrega registrada";

function NxCentroTrabalho({ clientId, produto, selecionado, onSelecionar, renderEntregas }: {
  clientId: string; produto: "hub" | "sap"; selecionado?: string; onSelecionar: (id: IdAgente, irParaEntregas?: boolean) => void;
  renderEntregas: (id: IdAgente) => ReactNode;
}) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const id = agenteSelecionado(selecionado, produto, isAdmin);
  const ordem: IdAgente[] = ["conteudo", "recuperacao", "anuncios", "campanhas", "brain"];
  const agentes = ordem.map((v) => AGENTES.find((a) => a.id === v)!).filter((a) => (a.id !== "brain" || isAdmin) && (produto === "hub" || (a.ondeSap && a.id !== "recuperacao")));
  const resultados = useQueries({ queries: agentes.map((a) => ({
    queryKey: ["agentes-trabalho", clientId, isAdmin, a.id],
    queryFn: () => lerTrabalhoAgente(clientId, a, isAdmin),
    retry: false,
    refetchInterval: 30_000,
  })) });
  const modulos = useQuery({ queryKey: ["agentes-modulos", clientId], queryFn: () => lerModulosAgentes(clientId), retry: false });
  const saude = useQuery({ queryKey: ["agentes-saude", clientId], queryFn: () => lerSaudeAgentes(clientId), retry: false, refetchInterval: 60_000 });
  // Situação real da rotina (em dia, atrasada, com falha, travada pela fila): "0 para revisar" sem rodada não é "tudo certo".
  const rotinaDe = (ag: (typeof agentes)[number], pendentes: number) =>
    saude.isSuccess ? saudeRotina(ag, saude.data.find((x) => x.fluxo === ag.fluxo), pendentes) : null;
  const a = agentes.find((x) => x.id === id)!;
  const t = TRABALHOS_AGENTE[id];
  const q = resultados[agentes.indexOf(a)];
  const dados = q.data;
  const situacao = dados && !q.isError ? situacaoRodada(dados.rodada, isAdmin) : null;
  const modulo = modulos.data?.find((m) => m.modulo === a.modulo);
  const ativo = !!modulo && ["ativo", "beta"].includes(modulo.status);
  const [andamento, setAndamento] = useState<{ id: IdAgente; texto: string } | null>(null);
  const [aviso, setAviso] = useState<{ id: IdAgente; texto: string; erro: boolean } | null>(null);
  const guard = useRef(false);
  const emCurso = rodadaEmCurso(dados?.rodada);
  const filaCheia = !q.isError && (dados?.pendentes ?? 0) >= a.maxAbertas;
  const fila = agentes.flatMap((ag, n) => !resultados[n].isError && (resultados[n].data?.pendentes ?? 0) > 0 ? [{ ag, n: resultados[n].data!.pendentes }] : []);
  const totalFila = fila.reduce((soma, f) => soma + f.n, 0);
  const algumErro = resultados.some((r) => r.isError);
  const carregando = resultados.some((r) => r.isPending);

  async function preparar() {
    if (guard.current || !isAdmin || !q.isSuccess || q.isError || emCurso || filaCheia || !modulos.isSuccess || (modulo && !ativo)) return;
    guard.current = true;
    setAviso(null);
    setAndamento({ id, texto: "Iniciando a leitura dos dados…" });
    try {
      const mensagem = await rodarFluxoAteFim(clientId, { id: a.fluxo, agente: a.agente, objetivo: a.entrega }, (texto) => setAndamento({ id, texto }));
      setAviso({ id, texto: mensagem || "Rodada finalizada. Confira o estado e as entregas abaixo; uma rodada pode terminar sem novas propostas.", erro: !!mensagem && !mensagem.startsWith("Ainda rodando") });
    } catch {
      setAviso({ id, texto: "Não foi possível preparar a entrega. Confira o estado da execução antes de tentar novamente.", erro: true });
    } finally {
      guard.current = false;
      setAndamento(null);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["agentes-trabalho", clientId] }),
        qc.invalidateQueries({ queryKey: ["agentes-saude", clientId] }),
        qc.invalidateQueries({ queryKey: ["sugestoes-agentes", clientId] }),
        qc.invalidateQueries({ queryKey: ["campanhas-ideias", clientId] }),
        qc.invalidateQueries({ queryKey: ["brain-itens", clientId] }),
      ]);
    }
  }

  return (
    <div className="nxa-trabalho" data-peca="agentes">
      <NxCard
        id="agent-intro"
        nivel={2}
        titulo="Qual problema precisa avançar agora?"
        subtitulo={produto === "hub" ? "Inteligência aplicada ao trabalho da clínica" : "Apoio à implantação do SAP"}
        icone={<IconeTabler nome="robot" tamanho={18} />}
      >
        <div className="nxa-secao-corpo">
          <div className="nxa-kpis">
            <NxKpi
              icone={<IconeTabler nome="checklist" tamanho={16} />}
              rotulo="Entregas para revisar"
              valor={carregando ? "…" : totalFila}
              nota={algumErro ? "Parte da fila não pôde ser conferida" : "Somando todas as frentes"}
            />
          </div>
          <p className="nxa-texto">{produto === "sap" ? "O SAP conduz a implantação com tarefas, responsáveis e evidências. As rotinas abaixo preparam materiais de apoio; acessos e marcos ficam no acompanhamento de implantação acima." : "Escolha uma frente, confira o que o agente preparou e dê o próximo passo com a equipe."}</p>
          <NxRecolhido titulo="Como funciona" resumo="Três passos: analisa, prepara, a equipe decide">
            <ol className="nxa-ciclo" aria-label="Como o trabalho dos agentes funciona">
              <li><b>1. {produto === "sap" ? "O SAP organiza" : "O Nexo analisa"}</b><span>Dados disponíveis e memória aprovada desta clínica.</span></li>
              <li><b>2. Prepara uma entrega</b><span>Roteiro, diagnóstico ou proposta para revisão.</span></li>
              <li><b>3. A equipe decide</b><span>Revisa, assume a execução e registra o que aconteceu.</span></li>
            </ol>
          </NxRecolhido>
        </div>
      </NxCard>

      <NxCard rotulo="Entregas para revisar" titulo="Comece pelas entregas disponíveis" icone={<IconeTabler nome="inbox" tamanho={18} />}>
        <div className="nxa-secao-corpo">
          {carregando ? <NxCarregando texto="Conferindo a fila da clínica…" linhas={2} /> : fila.length ? (
            <div className="nxa-fila">{fila.map(({ ag, n }) => <button key={ag.id} type="button" className="nxa-fila__botao" onClick={() => onSelecionar(ag.id, true)}>{ag.nome}<b>{n} para revisar</b><IconeTabler nome="arrow-right" tamanho={16} /></button>)}</div>
          ) : algumErro ? (
            <NxAviso tom="atencao" titulo="Parte da fila não pôde ser conferida.">Abra a frente para tentar novamente. Isso não quer dizer que não há entregas.</NxAviso>
          ) : (
            <NxVazio titulo="Nenhuma nova proposta para revisar" falta="nenhuma proposta nova nos intervalos consultados" passo="escolha uma frente para conferir o histórico, os pré-requisitos e o próximo passo" quem="equipe_hub" />
          )}
          {fila.length > 0 && algumErro && <p role="status" className="nxa-nota">A fila está parcial: uma ou mais frentes não puderam ser conferidas.</p>}
        </div>
      </NxCard>

      <div className="nxa-layout">
        <div className="nxa-escolhas" role="group" aria-label="Escolher o problema da clínica">
          {agentes.map((ag, n) => (
            <button key={ag.id} type="button" className="nxa-escolha" aria-pressed={id === ag.id} onClick={() => onSelecionar(ag.id)}>
              <IconeTabler nome="robot" tamanho={20} />
              <span className="nxa-escolha__texto"><b>{TRABALHOS_AGENTE[ag.id].problema}</b><span>{ag.nome}</span></span>
              <span className="nxa-escolha__conta">{resultados[n].isError ? "Não conferido" : resultados[n].isPending ? "Conferindo…" : `${resultados[n].data?.pendentes ?? 0} para revisar${!resultados[n].data?.pendentes && rotinaDe(ag, 0)?.atencao ? " · rotina parada" : ""}`}</span>
            </button>
          ))}
        </div>

        <div className="nxa-atual">
          <NxCard key={id} id="agent-assignment" nivel={2} titulo={t.problema} subtitulo={t.ajuda} icone={<IconeTabler nome="target" tamanho={18} />}>
            <div className="nxa-secao-corpo" data-peca="agentes">
              <p className="nxa-rotulo">{a.nome}</p>
              <div className="nxa-pares">
                <div className="nxa-par"><b>O que você recebe</b><p>{t.entrega}</p></div>
                <div className="nxa-par"><b>O próximo passo é de quem?</b><p>{t.pessoa}</p></div>
              </div>
              <div className="nxa-estado nxa-estado--vivo" data-tone={situacao?.tom} aria-live="polite">
                {q.isPending ? <NxCarregando texto="Conferindo entregas e execução…" linhas={2} /> : q.isError ? (
                  <NxErro texto="Estado indisponível: não foi possível conferir esta frente. Isso não significa que não há entregas." onTentar={() => void q.refetch()} />
                ) : (
                  <>
                    <h3>{situacao!.titulo}</h3>
                    <p>{situacao!.detalhe}</p>
                    <div className="nxa-kpis">
                      <NxKpi icone={<IconeTabler nome="checklist" tamanho={16} />} rotulo="Para revisar" valor={dados!.pendentes} nota={t.janelaDias ? `propostas dos últimos ${t.janelaDias} dias` : "propostas de memória ainda abertas"} />
                    </div>
                    <p>Última entrega: {quandoFortaleza(dados!.ultimaEntrega)}.</p>
                    {isAdmin && dados?.rodada && <p>Estado da execução conferido em {quandoFortaleza(dados.rodada.atualizado_em)}.</p>}
                  </>
                )}
              </div>
              {filaCheia && <p className="nxa-limite" role="status"><b>Revise a fila antes de pedir novos materiais.</b> Há {dados!.pendentes} propostas recentes para revisar; o limite desta rotina é {a.maxAbertas}. Abra as entregas abaixo, use o que faz sentido ou descarte com critério. A fila é atualizada após a decisão.</p>}
              <div className="nxa-agenda"><IconeTabler nome="calendar" tamanho={18} /><div>
                {modulos.isPending ? <p>Conferindo a rotina automática…</p> : modulos.isError ? <p role="alert">Agendamento não conferido. <button type="button" className="nxa-link" onClick={() => void modulos.refetch()}>Tentar novamente</button></p> : !ativo ? <p><b>{modulo ? "Módulo pausado ou encerrado" : "Rotina automática não configurada"}.</b> Os materiais anteriores continuam disponíveis; a equipe pode conferir a configuração.</p> : (() => {
                  const r = rotinaDe(a, dados?.pendentes ?? 0);
                  if (saude.isPending) return <p>Conferindo a última rodada…</p>;
                  if (!r) return <p role="alert"><b>Rotina {a.frequencia.toLowerCase()}.</b> Não foi possível conferir a última rodada; isso não quer dizer que ela rodou. <button type="button" className="nxa-link" onClick={() => void saude.refetch()}>Tentar novamente</button></p>;
                  return <p role={r.atencao ? "alert" : undefined}><b>{r.texto}</b>{r.atencao && !dados?.pendentes ? " Por isso, \"0 para revisar\" aqui não quer dizer que está tudo certo." : ""}</p>;
                })()}
              </div></div>
              <div className="nxa-acoes">
                {isAdmin && id !== "brain" && <button className="nxa-botao nxa-botao--primario" type="button" disabled={!!andamento || q.isPending || q.isError || emCurso || filaCheia || !modulos.isSuccess || !!modulo && !ativo} onClick={() => void preparar()}>
                  <IconeTabler nome="robot" tamanho={18} />{andamento?.id === id ? "Preparando…" : t.acao}
                </button>}
                {isAdmin && <Link to="/admin/agentes" className="nxa-link">Conferir execuções e aprovações</Link>}
                {id === "conteudo" && produto === "hub" && <Link to="/$clientId/ideias" params={{ clientId }} search={{ visao: "semana" } as never} className="nxa-link">Abrir o planejador da semana <IconeTabler nome="arrow-right" tamanho={16} /></Link>}
                <a className="nxa-link" href="#agent-review-workspace">Revisar entregas desta frente <IconeTabler nome="arrow-right" tamanho={16} /></a>
                {!isAdmin && <p>A equipe Doctor Creator prepara as rodadas. Você pode consultar os materiais; as ações disponíveis dependem das suas permissões.</p>}
              </div>
              {andamento && <p role="status" className="nxa-nota">{andamento.id === id ? andamento.texto : "Outra frente está sendo preparada. Aguarde a conclusão antes de iniciar uma rodada."}</p>}
              {aviso?.id === id && <p role={aviso.erro ? "alert" : "status"} className={aviso.erro ? "nxa-erro" : "nxa-nota"}>{aviso.texto}</p>}
              <NxRecolhido titulo="Quais dados usa e como conferir o resultado">
                <dl className="nxa-detalhes">
                  <div><dt>Dados usados</dt><dd>{a.le}</dd></div><div><dt>Como avaliar</dt><dd>{t.medir}</dd></div><div><dt>Limites desta rotina</dt><dd>{t.limite}</dd></div>
                </dl>
              </NxRecolhido>
            </div>
          </NxCard>

          <NxCard
            id="agent-review-workspace"
            nivel={2}
            rotulo="Área de revisão das entregas"
            titulo="Revise e avance com a entrega"
            subtitulo={id === "brain" ? "A revisão da memória acontece no Brand Brain, com as permissões da equipe." : "Use os materiais abaixo. As decisões são salvas na mesma ferramenta que a equipe já utiliza."}
            icone={<IconeTabler nome="file-text" tamanho={18} />}
            key={`${clientId}-${id}`}
          >
            <div className="nxa-secao-corpo">
              {id === "brain" ? <div className="nxa-item__acoes"><Link to="/admin/brain" search={{ c: clientId }} className="nxa-botao">Revisar memória desta clínica <IconeTabler nome="arrow-right" tamanho={16} /></Link></div> : renderEntregas(id)}
            </div>
          </NxCard>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- painel "Agentes de IA"

/** Um espaço de trabalho por problema, reutilizando as entregas e ações das telas de origem (versão nx, só Nexo). */
export function NxPainelAgentes({ clientId, produto, selecionado, onSelecionar }: {
  clientId: string; produto: "hub" | "sap"; selecionado?: string; onSelecionar: (id: IdAgente, irParaEntregas?: boolean) => void;
}) {
  const { podeEditar } = useClientRole(clientId);
  const { isAdmin } = useAuth();
  const [verResultados, setVerResultados] = useState(false);
  const [verPiloto, setVerPiloto] = useState(false);
  return (
    <div className="nxa" data-peca="agentes">
      <NxCentroTrabalho clientId={clientId} produto={produto} selecionado={selecionado} onSelecionar={onSelecionar} renderEntregas={(id) => {
        if (id === "conteudo") return <NxRoteirosProntos clientId={clientId} podeEditar={podeEditar} mostrarExecutar={false} />;
        if (id === "recuperacao" && produto === "hub") return <NxRecuperarHoje clientId={clientId} podeEditar={podeEditar} mostrarExecutar={false} />;
        if (id === "anuncios") return <NxGestorAnuncios clientId={clientId} podeEditar={podeEditar} mostrarExecutar={false} />;
        if (id === "campanhas") return <NxEstrategias clientId={clientId} podeEditar={podeEditar} mostrarExecutar={false} />;
        return null;
      }} />
      <NxRecolhidoSobDemanda titulo="Acompanhar indicadores e aprendizado da clínica" aoAbrir={setVerResultados}>
        {verResultados && <div className="nxa-secundario"><NxProvaResultado clientId={clientId} />{produto === "hub" && <NxAprendizados clientId={clientId} podeEditar={podeEditar} />}</div>}
      </NxRecolhidoSobDemanda>
      {produto === "hub" && isAdmin && (
        <NxRecolhidoSobDemanda titulo="Teste de atendimento: avaliar respostas sem enviar ao paciente" aoAbrir={setVerPiloto}>
          {verPiloto && <NxAtendentePiloto clientId={clientId} />}
        </NxRecolhidoSobDemanda>
      )}
    </div>
  );
}
