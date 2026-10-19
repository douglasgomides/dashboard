import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bot, Clock3, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { AGENTES, type IdAgente } from "@/lib/agentes-catalogo";
import { TRABALHOS_AGENTE, agenteSelecionado, rodadaEmCurso, situacaoRodada } from "@/lib/agentes-trabalho";
import { lerModulosAgentes, lerTrabalhoAgente } from "@/lib/agentes-trabalho-data";
import { rodarFluxoAteFim } from "@/lib/agentes-data";
import "@/styles/agentes-trabalho.css";

const quando = (s: string | null | undefined) => s && Number.isFinite(Date.parse(s))
  ? new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" }) : "Sem entrega registrada";

export function CentroTrabalhoAgentes({ clientId, produto, selecionado, onSelecionar, renderEntregas }: {
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
  const fila = agentes.flatMap((ag, n) => !resultados[n].isError && (resultados[n].data?.pendentes ?? 0) > 0 ? [{ ag, n: resultados[n].data!.pendentes }] : []);

  async function preparar() {
    if (guard.current || !isAdmin || !q.isSuccess || q.isError || emCurso || !modulos.isSuccess || (modulo && !ativo)) return;
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
        qc.invalidateQueries({ queryKey: ["sugestoes-agentes", clientId] }),
        qc.invalidateQueries({ queryKey: ["campanhas-ideias", clientId] }),
        qc.invalidateQueries({ queryKey: ["brain-itens", clientId] }),
      ]);
    }
  }

  return <div className="agent-workspace">
    <section className="agent-intro" aria-labelledby="agent-intro-title">
      <p className="agent-eyebrow">{produto === "hub" ? "Inteligência aplicada ao trabalho da clínica" : "Apoio à implantação do SAP"}</p>
      <h2 id="agent-intro-title">Qual problema precisa avançar agora?</h2>
      <p>{produto === "sap" ? "O SAP conduz a implantação com tarefas, responsáveis e evidências. As rotinas abaixo preparam materiais de apoio; acessos e marcos ficam no acompanhamento de implantação acima." : "Escolha uma frente, confira o que o agente preparou e dê o próximo passo com a equipe."}</p>
      <ol className="agent-cycle" aria-label="Como o trabalho dos agentes funciona">
        <li><b>1. {produto === "sap" ? "O SAP organiza" : "O Nexo analisa"}</b><span>Dados disponíveis e memória aprovada desta clínica.</span></li>
        <li><b>2. Prepara uma entrega</b><span>Roteiro, diagnóstico ou proposta para revisão.</span></li>
        <li><b>3. A equipe decide</b><span>Revisa, assume a execução e registra o que aconteceu.</span></li>
      </ol>
    </section>

    <section className="agent-review-queue" aria-label="Entregas para revisar">
      <h3>Comece pelas entregas disponíveis</h3>
      {resultados.some((r) => r.isPending) ? <p role="status">Conferindo a fila da clínica…</p> : fila.length ? <div className="agent-queue-links">{fila.map(({ ag, n }) => <button key={ag.id} type="button" onClick={() => onSelecionar(ag.id, true)}>{ag.nome}<b>{n} para revisar</b><ArrowRight size={15} aria-hidden /></button>)}</div> : <p>{resultados.some((r) => r.isError) ? "Parte da fila não pôde ser conferida. Abra a frente para tentar novamente." : "Nenhuma nova proposta nos intervalos consultados. Escolha uma frente para conferir o histórico, os pré-requisitos e o próximo passo."}</p>}
      {fila.length > 0 && resultados.some((r) => r.isError) && <p role="status">A fila está parcial: uma ou mais frentes não puderam ser conferidas.</p>}
    </section>

    <div className="agent-work-layout">
    <div className="agent-choices" role="group" aria-label="Escolher o problema da clínica">
      {agentes.map((ag, n) => <button key={ag.id} type="button" aria-pressed={id === ag.id} onClick={() => onSelecionar(ag.id)}>
        <Bot size={19} aria-hidden /><span><b>{TRABALHOS_AGENTE[ag.id].problema}</b><span>{ag.nome}</span></span>
        <span className="agent-choice-count">{resultados[n].isError ? "Não conferido" : resultados[n].isPending ? "Conferindo…" : `${resultados[n].data?.pendentes ?? 0} para revisar`}</span>
      </button>)}
    </div>

    <div className="agent-work-current">
    <section className="agent-assignment" aria-labelledby="agent-assignment-title" key={id}>
      <header><p className="agent-eyebrow">{a.nome}</p><h2 id="agent-assignment-title">{t.problema}</h2><p>{t.ajuda}</p></header>
      <div className="agent-assignment-grid"><div><h3>O que você recebe</h3><p>{t.entrega}</p></div><div><h3>O próximo passo é de quem?</h3><p>{t.pessoa}</p></div></div>
      <div className="agent-live-status" data-tone={situacao?.tom} aria-live="polite">
        {q.isPending ? <p role="status">Conferindo entregas e execução…</p> : q.isError ? <div role="alert"><b>Estado indisponível</b><p>Não foi possível conferir esta frente. Isso não significa que não há entregas.</p><button type="button" className="btn" onClick={() => void q.refetch()}>Tentar novamente</button></div> : <>
          <h3>{situacao!.titulo}</h3><p>{situacao!.detalhe}</p>
          <p><b>{dados!.pendentes} para revisar</b>{t.janelaDias ? ` · propostas dos últimos ${t.janelaDias} dias` : " · propostas de memória ainda abertas"}. Última entrega: {quando(dados!.ultimaEntrega)}.</p>
          {isAdmin && dados?.rodada && <p>Estado da execução conferido em {quando(dados.rodada.atualizado_em)}.</p>}
        </>}
      </div>
      <div className="agent-schedule"><Clock3 size={16} aria-hidden /><div>
        {modulos.isPending ? <p>Conferindo a rotina automática…</p> : modulos.isError ? <p role="alert">Agendamento não conferido. <button type="button" onClick={() => void modulos.refetch()}>Tentar novamente</button></p> : <p><b>{ativo ? `Rotina prevista: ${a.frequencia.toLowerCase()}` : modulo ? "Módulo pausado ou encerrado" : "Rotina automática não configurada"}.</b> {ativo ? isAdmin ? "Depende do agendamento, dos dados e da fila de revisão. O estado acima confirma o que foi executado." : "Depende do agendamento, dos dados e da fila de revisão. A equipe Doctor Creator acompanha as execuções." : "Os materiais anteriores continuam disponíveis; a equipe pode conferir a configuração."}</p>}
      </div></div>
      <div className="agent-assignment-actions">
        {isAdmin && id !== "brain" && <button className="btn agent-prepare" type="button" disabled={!!andamento || q.isPending || q.isError || emCurso || !modulos.isSuccess || !!modulo && !ativo} onClick={() => void preparar()}>
          {andamento?.id === id ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <RefreshCw size={16} aria-hidden />}{andamento?.id === id ? "Preparando…" : t.acao}
        </button>}
        {isAdmin && <Link to="/admin/agentes" className="agent-secondary-link">Conferir execuções e aprovações</Link>}
        {id === "conteudo" && produto === "hub" && <Link to="/$clientId/ideias" params={{ clientId }} search={{ visao: "semana" } as never} className="agent-secondary-link">Abrir o planejador da semana <ArrowRight size={15} aria-hidden /></Link>}
        <a className="agent-secondary-link" href="#agent-review-workspace">Revisar entregas desta frente <ArrowRight size={15} aria-hidden /></a>
        {!isAdmin && <p>A equipe Doctor Creator prepara as rodadas. Você pode consultar os materiais; as ações disponíveis dependem das suas permissões.</p>}
      </div>
      {andamento && <p role="status">{andamento.id === id ? andamento.texto : "Outra frente está sendo preparada. Aguarde a conclusão antes de iniciar uma rodada."}</p>}
      {aviso?.id === id && <p role={aviso.erro ? "alert" : "status"}>{aviso.texto}</p>}
      <details className="agent-instructions"><summary>Quais dados usa e como conferir o resultado</summary><dl>
        <div><dt>Dados usados</dt><dd>{a.le}</dd></div><div><dt>Como avaliar</dt><dd>{t.medir}</dd></div><div><dt>Limites desta rotina</dt><dd>{t.limite}</dd></div>
      </dl></details>
    </section>
    <section id="agent-review-workspace" className="agent-deliveries" aria-label="Área de revisão das entregas" key={`${clientId}-${id}`}>
      <div className="agent-delivery-heading"><h2>Revise e avance com a entrega</h2><p>{id === "brain" ? "A revisão da memória acontece no Brand Brain, com as permissões da equipe." : "Use os materiais abaixo. As decisões são salvas na mesma ferramenta que a equipe já utiliza."}</p></div>
      {id === "brain" ? <Link to="/admin/brain" search={{ c: clientId }} className="btn">Revisar memória desta clínica <ArrowRight size={15} aria-hidden /></Link> : renderEntregas(id)}
    </section>
    </div>
    </div>
  </div>;
}
