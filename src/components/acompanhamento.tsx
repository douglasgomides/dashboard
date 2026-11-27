import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, Plus, Sparkles, ClipboardCheck, ExternalLink, Save, MessageSquare, CalendarDays, Loader2, Copy, Check, AlertCircle } from "lucide-react";
import { chamarAcompanhamento, type PainelAcompanhamento } from "@/lib/acompanhamento-data";
import { ESTADOS_ACAO, atrasoDaAcao, fichaVazia, novaAcao, tarefaDaAcao, type AcaoRevisao, type FichaRevisao, type Revisao } from "@/lib/acompanhamento";
import { getMonthlyMetrics, getCrmResumoPeriodo } from "@/lib/client-data";
import { textoDoArquivo } from "@/lib/reunioes-arquivo";
import { RelatorioAcompanhamento } from "./relatorio-acompanhamento";
import "@/styles/acompanhamento.css";

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
const dataBR = (v: string | null) => v ? new Date(`${v}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "A definir";
const chave = ["acompanhamento"];
const iniciais = (v: string) => v.replace(/^Dra?\.?\s*/i, "").split(" ").slice(0, 2).map(t => t[0]).join("");
const erroTexto = (e: unknown) => e instanceof Error ? e.message : "Não foi possível concluir.";
export function Acompanhamento() {
  const query = useQuery({ queryKey: chave, queryFn: () => chamarAcompanhamento<PainelAcompanhamento>(), retry: false });
  const [busca, setBusca] = useState("");
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [relatorio, setRelatorio] = useState(false);
  const [clienteNovo, setClienteNovo] = useState("");
  const [erroNova, setErroNova] = useState("");
  const [temAlteracao, setTemAlteracao] = useState(false);
  if (query.isPending) return <div className="ac-loading" role="status"><Loader2 className="animate-spin" />Carregando revisões da equipe…</div>;
  if (query.isError) return <div className="ac-error" role="alert"><AlertCircle /><p>{erroTexto(query.error)}</p><button type="button" className="btn" onClick={() => void query.refetch()}>Tentar novamente</button></div>;
  const { revisoes, clientes } = query.data;
  const maisRecentes = new Map<string, Revisao>();
  for (const r of revisoes) if (!maisRecentes.has(r.client_id)) maisRecentes.set(r.client_id, r);
  const lista = [...maisRecentes.values()].filter(r => (r.clients?.name ?? "").toLocaleLowerCase().includes(busca.toLocaleLowerCase()));
  const selecionadaReal = revisoes.find(r => r.id === selecionada) ?? revisoes[0];
  const nome = (r: Revisao) => r.clients?.name ?? clientes.find(c => c.id === r.client_id)?.name ?? "Cliente";
  const pendentes = [...maisRecentes.values()].reduce((n, r) => n + r.dados.acoes.filter(a => a.estado !== "Concluído").length, 0);
  const atrasadas = [...maisRecentes.values()].reduce((n, r) => n + r.dados.acoes.filter(a => atrasoDaAcao(a, hoje())).length, 0);
  return <div className="ac-app">
    <div className="ac-intro"><div><p>Reuniões e decisões da equipe</p><h2>Da análise à próxima ação</h2><p>{maisRecentes.size} clientes acompanhados · {pendentes} ações abertas{atrasadas > 0 ? ` · ${atrasadas} com prazo vencido` : ""}</p></div><div className="ac-head-actions"><button type="button" className="btn" disabled={temAlteracao} onClick={() => setRelatorio(!relatorio)}>Relatório semanal</button><button type="button" className="btn primary" disabled={temAlteracao} onClick={() => setNovo(!novo)}><Plus size={18} />Nova revisão</button></div></div>
    {relatorio && <RelatorioAcompanhamento painel={query.data} bloqueado={temAlteracao} />}
    {novo && <div className="ac-new"><label htmlFor="ac-client">Cliente</label><select id="ac-client" value={clienteNovo} onChange={e => setClienteNovo(e.target.value)}><option value="">Escolha o cliente</option>{clientes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button type="button" className="btn" disabled={!clienteNovo} onClick={async () => {
      try {
        const r: Revisao = { id: crypto.randomUUID(), client_id: clienteNovo, data: hoje(), titulo: "Revisão semanal", prioridade: "Média", proxima_checagem: null, versao: 0, dados: fichaVazia() };
        const { revisao } = await chamarAcompanhamento<{ revisao: Revisao }>({ acao: "salvar", revisao: r });
        await query.refetch(); setSelecionada(revisao.id); setNovo(false);
      } catch (e) { setErroNova(erroTexto(e)); }
    }}>Criar revisão</button>{erroNova && <p role="alert">{erroNova}</p>}</div>}
    <div className="ac-layout">
      <aside className="ac-clients" aria-label="Clientes acompanhados"><label className="ac-search"><Search size={18} /><input aria-label="Buscar cliente" placeholder="Buscar cliente" value={busca} onChange={e => setBusca(e.target.value)} /></label>
        {lista.length === 0 && <p className="ac-empty">Nenhuma revisão encontrada. Crie a primeira revisão de um cliente.</p>}
        {lista.map(r => <button type="button" disabled={temAlteracao} className={`ac-client ${selecionadaReal?.client_id === r.client_id ? "selected" : ""}`} key={r.id} onClick={() => setSelecionada(r.id)} aria-pressed={selecionadaReal?.client_id === r.client_id}>
          <span className="ac-avatar" aria-hidden>{iniciais(nome(r))}</span><span><strong>{nome(r)}</strong><span>{dataBR(r.data)} · {r.prioridade}</span><small>{r.dados.acoes.filter(a => a.estado !== "Concluído").length} ações abertas</small></span>
        </button>)}
      </aside>
      {selecionadaReal && <EditorRevisao key={selecionadaReal.id} registro={selecionadaReal} painel={query.data} nome={nome(selecionadaReal)} onSelecionar={setSelecionada} onAlteracao={setTemAlteracao} />}
    </div>
  </div>;
}
function EditorRevisao({ registro, painel, nome, onSelecionar, onAlteracao }: { registro: Revisao; painel: PainelAcompanhamento; nome: string; onSelecionar: (id: string) => void; onAlteracao: (valor: boolean) => void }) {
  const qc = useQueryClient();
  const [r, setR] = useState(registro);
  const [aba, setAba] = useState<"revisao" | "reunioes" | "acoes">("revisao");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [listaClickUp, setListaClickUp] = useState("");
  const [fontesIA, setFontesIA] = useState<{ numero: number; id: string; data: string; titulo: string }[]>([]);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [numeros, setNumeros] = useState("");
  const alterado = JSON.stringify(r) !== JSON.stringify(registro);
  useEffect(() => {
    onAlteracao(alterado || !!ocupado);
    const proteger = (event: BeforeUnloadEvent) => { if (alterado) event.preventDefault(); };
    window.addEventListener("beforeunload", proteger);
    return () => { window.removeEventListener("beforeunload", proteger); onAlteracao(false); };
  }, [alterado, ocupado, onAlteracao]);
  const historico = painel.revisoes.filter(v => v.client_id === r.client_id);
  const campo = <K extends keyof FichaRevisao>(k: K, valor: FichaRevisao[K]) => setR(v => ({ ...v, dados: { ...v.dados, [k]: valor } }));
  const acaoCampo = (id: string, mudanca: Partial<AcaoRevisao>) => campo("acoes", r.dados.acoes.map(a => a.id === id ? { ...a, ...mudanca } : a));
  async function operar(tipo: string, fn: () => Promise<void>) {
    setOcupado(tipo); setErro(""); setAviso("");
    try { await fn(); } catch (e) { setErro(erroTexto(e)); } finally { setOcupado(null); }
  }
  async function salvar() {
    const result = await chamarAcompanhamento<{ revisao: Revisao }>({ acao: "salvar", revisao: r });
    setR(result.revisao);
    qc.setQueryData<PainelAcompanhamento>(chave, atual => atual ? { ...atual, revisoes: atual.revisoes.map(v => v.id === r.id ? result.revisao : v) } : atual);
    return result.revisao;
  }
  async function perguntar(texto = pergunta) {
    if (texto.trim().length < 3) return;
    await operar("ia", async () => {
      const atual = alterado ? await salvar() : r;
      const response = await chamarAcompanhamento<{ revisao: Revisao; resposta: { sugestoes: string[] }; fontes: typeof fontesIA }>({ acao: "perguntar", id: atual.id, versao: atual.versao, pergunta: texto });
      setR(response.revisao); setFontesIA(response.fontes); setSugestoes(response.resposta.sugestoes); setPergunta("");
      // Atualiza a linha da carteira sem recriar o editor e perder a resposta visível.
      qc.setQueryData<PainelAcompanhamento>(chave, atualPainel => atualPainel ? { ...atualPainel, revisoes: atualPainel.revisoes.map(v => v.id === r.id ? response.revisao : v) } : atualPainel);
    });
  }
  function textoCampo(titulo: string, k: "objetivo" | "instagram" | "conteudo" | "leads" | "hipotese" | "notas" | "transcricao" | "acertos" | "problemas" | "anuncios" | "cliques" | "decisao", rows = 4) {
    return <label className="ac-field"><span>{titulo}</span><textarea value={r.dados[k] ?? ""} rows={rows} maxLength={k === "transcricao" ? 60000 : k === "notas" ? 30000 : 6000} onChange={e => campo(k, e.target.value)} /></label>;
  }
  return <div className="ac-workspace">
    <div className="ac-client-head"><div><h2>{nome}</h2><span>{dataBR(r.data)} · próxima checagem {dataBR(r.proxima_checagem)}</span></div><div className="ac-head-actions"><Link to={"/$clientId/hoje" as never} params={{ clientId: r.client_id } as never} className="btn">Abrir resultados<ExternalLink size={16} /></Link><button type="button" className="btn primary" disabled={!!ocupado || !alterado} onClick={() => void operar("salvar", async () => { await salvar(); setAviso("Revisão salva."); })}><Save size={16} />{ocupado === "salvar" ? "Salvando…" : "Salvar"}</button></div></div>
    {alterado && <p className="ac-unsaved" role="status">Alterações ainda não salvas. Salve antes de trocar de cliente ou revisão.</p>}
    {erro && <p role="alert" className="ac-error"><AlertCircle size={18} />{erro}</p>}{aviso && <p role="status" className="ac-success"><Check size={18} />{aviso}</p>}
    <div className="ac-tabs" role="tablist" aria-label="Acompanhamento do cliente">{([ ["revisao", "Revisão", ClipboardCheck], ["reunioes", "Reuniões", CalendarDays], ["acoes", "Ações", Check] ] as const).map(([id, label, Icon]) => <button type="button" role="tab" aria-selected={aba === id} aria-controls={`ac-panel-${id}`} id={`ac-tab-${id}`} key={id} onClick={() => setAba(id)}><Icon size={17} />{label}</button>)}</div>
    <fieldset className="ac-detail-grid" disabled={!!ocupado}><section className="ac-panel" id={`ac-panel-${aba}`} role="tabpanel" aria-labelledby={`ac-tab-${aba}`}>
      {aba === "revisao" && <>
        <div className="ac-dates"><label>Revisão<input type="date" value={r.data} onChange={e => setR({ ...r, data: e.target.value })} /></label><label>Prioridade<select value={r.prioridade} onChange={e => setR({ ...r, prioridade: e.target.value as Revisao["prioridade"] })}>{["Alta", "Média", "Baixa"].map(v => <option key={v}>{v}</option>)}</select></label><label>Próxima checagem<input type="date" value={r.proxima_checagem ?? ""} onChange={e => setR({ ...r, proxima_checagem: e.target.value || null })} /></label></div>
        {textoCampo("Objetivo do cliente", "objetivo", 2)}
        <label className="ac-field"><span>Balanço da semana validado pela equipe</span><select value={r.dados.balanco ?? "Sem conclusão"} onChange={e => campo("balanco", e.target.value as FichaRevisao["balanco"])}>{["Melhorou", "Piorou", "Estável", "Sem conclusão"].map(v => <option key={v}>{v}</option>)}</select></label>
        {textoCampo("O que funcionou e deve ser repetido", "acertos", 3)}{textoCampo("O que precisa melhorar", "problemas", 3)}
        <div className="ac-dates"><label>Período de<input type="date" value={r.dados.periodo_de} onChange={e => campo("periodo_de", e.target.value)} /></label><label>Até<input type="date" value={r.dados.periodo_ate} onChange={e => campo("periodo_ate", e.target.value)} /></label><button type="button" className="btn" disabled={!!ocupado || r.dados.periodo_de > r.dados.periodo_ate} onClick={() => void operar("numeros", async () => {
          const results = await Promise.allSettled([getMonthlyMetrics(r.client_id, r.dados.periodo_de, r.dados.periodo_ate), getCrmResumoPeriodo(r.client_id, r.dados.periodo_de, r.dados.periodo_ate)]);
          const [ig, crm] = results;
          const linhas = [`Consulta feita em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Fortaleza" })}. Período ${r.dados.periodo_de} a ${r.dados.periodo_ate}.`];
          if (ig.status === "fulfilled") {
            const valores = ig.value.map(v => v.total_interactions).filter((v): v is number => v !== null);
            linhas.push(`Instagram no banco: ${ig.value.length} registros diários. Interações ${valores.length ? valores.reduce((a, b) => a + b, 0) : "sem dado"}. Confira cobertura por conta e data em Resultados.`);
          } else linhas.push("Instagram indisponível nesta consulta.");
          linhas.push(crm.status === "fulfilled" && crm.value ? `CRM: ${crm.value.novos} pessoas novas, ${crm.value.ganhos} cards ganhos, ${crm.value.perdidos} pessoas perdidas. Cards e pessoas têm unidades diferentes.` : "CRM sem dado confirmado nesta consulta.");
          setNumeros(linhas.join("\n"));
        })}>Consultar fontes</button></div>
        {numeros && <div className="ac-source-read"><p>{numeros}</p><button type="button" className="btn" onClick={() => { campo("notas", `${r.dados.notas}\n\n${numeros}`.trim()); setAviso("Consulta adicionada às notas. Salve a revisão."); }}>Adicionar consulta às notas</button></div>}
        {textoCampo("Instagram e comparação com o período anterior", "instagram")}{textoCampo("Conteúdos que sustentam a análise", "conteudo")}{textoCampo("Anúncios, investimento e resultados", "anuncios", 3)}{textoCampo("Cliques nos links e cobertura da leitura", "cliques", 3)}{textoCampo("Leitura dos leads e agendamentos", "leads")}{textoCampo("Hipótese e próxima decisão", "hipotese", 3)}{textoCampo("Decisão necessária do Douglas e recomendação da equipe", "decisao", 3)}
        <label className="ac-field"><span>Fontes e publicações</span><textarea rows={3} value={r.dados.fontes.join("\n")} onChange={e => campo("fontes", e.target.value.split("\n").filter(Boolean))} placeholder="Um link HTTPS por linha" /></label>
        <div className="ac-source-links">{r.dados.fontes.filter(v => /^https:\/\//.test(v)).map((url, i) => <a href={url} target="_blank" rel="noreferrer" key={url}>Fonte {i + 1}<ExternalLink size={14} /></a>)}</div>
      </>}
      {aba === "reunioes" && <>
        <div className="ac-section-head"><h3>Histórico do cliente</h3><button type="button" className="btn" disabled={!!ocupado || alterado} onClick={() => void operar("nova", async () => {
          const nova: Revisao = { ...r, id: crypto.randomUUID(), data: hoje(), titulo: "Revisão semanal", versao: 0, dados: { ...r.dados, notas: "", transcricao: "", conversas: [], acoes: [] } };
          const { revisao } = await chamarAcompanhamento<{ revisao: Revisao }>({ acao: "salvar", revisao: nova });
          await qc.invalidateQueries({ queryKey: chave }); onSelecionar(revisao.id);
        })}><Plus size={16} />Nova rodada</button></div>
        <ul className="ac-history">{historico.map(v => <li key={v.id}><button type="button" disabled={alterado} onClick={() => onSelecionar(v.id)} aria-current={v.id === r.id ? "true" : undefined}><b>{dataBR(v.data)}</b> {v.titulo}<span>{v.dados.acoes.length} ações registradas</span></button></li>)}</ul>
        <label className="ac-field"><span>Título da reunião</span><input value={r.titulo} maxLength={200} onChange={e => setR({ ...r, titulo: e.target.value })} /></label>
        {textoCampo("Notas e decisões da reunião", "notas", 7)}{textoCampo("Transcrição", "transcricao", 8)}
        <label className="ac-file">Importar transcrição<input type="file" accept=".txt,.md,.docx,.vtt,.srt" onChange={e => { const file = e.target.files?.[0]; if (file) void operar("arquivo", async () => { const extraido = textoDoArquivo(file.name, new Uint8Array(await file.arrayBuffer())); campo("transcricao", extraido.texto); setAviso(extraido.cortado ? "Transcrição limitada a 60 mil caracteres. Salve a revisão." : "Transcrição importada. Salve a revisão."); }); }} /></label>
        <button type="button" className="btn" disabled={!!ocupado || !painel.ia || (!r.dados.notas && !r.dados.transcricao)} onClick={() => void perguntar("Prepare o rascunho pós-reunião com decisões, pendências e ações propostas. Use a transcrição e compare com os combinados anteriores. Cite as fontes e destaque o que precisa de confirmação.")}><Sparkles size={16} />Preparar decisões com IA</button>
      </>}
      {aba === "acoes" && <>
        <div className="ac-section-head"><h3>Ações da semana</h3><button type="button" className="btn" onClick={() => campo("acoes", [...r.dados.acoes, novaAcao()])} disabled={!!ocupado || r.dados.acoes.length >= 20}><Plus size={16} />Adicionar ação</button></div>
        <label className="ac-field"><span>ID da lista no ClickUp</span><input value={listaClickUp} inputMode="numeric" placeholder="Lista que receberá a tarefa" onChange={e => setListaClickUp(e.target.value.replace(/\D/g, ""))} /><small>{painel.clickup ? "Confirme a ação e salve antes de enviar." : "Conexão ClickUp pendente no servidor. Você pode copiar a tarefa."}</small></label>
        {r.dados.acoes.length === 0 && <p>Adicione a primeira ação ou transforme uma sugestão da IA em proposta.</p>}
        {r.dados.acoes.map(a => {
          const envio = painel.envios.find(v => v.revisao_id === r.id && v.acao_id === a.id);
          return <article className="ac-action" key={a.id}>
            <label className="ac-field"><span>Ação</span><input value={a.titulo} maxLength={200} onChange={e => acaoCampo(a.id, { titulo: e.target.value })} /></label>
            <label className="ac-field"><span>O que executar</span><textarea rows={3} value={a.descricao} onChange={e => acaoCampo(a.id, { descricao: e.target.value })} /></label>
            <div className="ac-dates"><label>Responsável<input value={a.responsavel} maxLength={200} onChange={e => acaoCampo(a.id, { responsavel: e.target.value })} /></label><label>Prazo<input type="date" value={a.prazo ?? ""} onChange={e => acaoCampo(a.id, { prazo: e.target.value || null })} /></label><label>Status<select value={a.estado} onChange={e => acaoCampo(a.id, { estado: e.target.value as AcaoRevisao["estado"] })}>{ESTADOS_ACAO.map(v => <option key={v}>{v}</option>)}</select></label></div>
            <label className="ac-field"><span>Como conferir a conclusão</span><textarea rows={2} value={a.criterio} onChange={e => acaoCampo(a.id, { criterio: e.target.value })} /></label>
            <label className="ac-field"><span>Resultado na próxima revisão</span><textarea rows={2} value={a.resultado} onChange={e => acaoCampo(a.id, { resultado: e.target.value })} /></label>
            <div className="ac-action-buttons"><button type="button" className="btn" onClick={() => void operar("copiar", async () => { const t = tarefaDaAcao(r, a, nome); await navigator.clipboard.writeText(`${t.name}\n\n${t.description}`); setAviso("Tarefa copiada com contexto e fontes."); })}><Copy size={16} />Copiar tarefa</button>
              {envio?.tarefa_url ? <a className="btn" href={envio.tarefa_url} target="_blank" rel="noreferrer">Abrir no ClickUp<ExternalLink size={16} /></a> : <button type="button" className="btn" disabled={!!ocupado || !painel.clickup || alterado || a.estado === "A validar" || !a.prazo || !a.responsavel || !a.criterio || !listaClickUp || !!envio} onClick={() => void operar("clickup", async () => {
                await chamarAcompanhamento({ acao: "clickup", id: r.id, acao_id: a.id, versao: r.versao, lista_id: listaClickUp }); await qc.invalidateQueries({ queryKey: chave }); setAviso("Tarefa criada no ClickUp.");
              })}>Criar tarefa no ClickUp</button>}
            </div>{envio && envio.estado !== "criada" && <p role="status">Envio sem confirmação. Confira a lista no ClickUp antes de repetir.</p>}
          </article>;
        })}
      </>}
    </section>
    <aside className="ac-ai" aria-label="Consulta à IA"><header><Sparkles size={20} /><div><h3>Analisar com IA</h3><p>Revisão atual e três anteriores do cliente</p></div></header>
      <div className="ac-prompts">{["O que mudou e merece atenção?", "O que combinamos e continua pendente?", "Qual conteúdo devemos repetir e como medir?"].map(v => <button type="button" key={v} disabled={!!ocupado || !painel.ia} onClick={() => void perguntar(v)}>{v}</button>)}</div>
      {!painel.ia && <p className="ac-empty">A IA precisa ser configurada no servidor. As revisões e ações podem ser registradas.</p>}
      <div className="ac-messages" aria-live="polite">{r.dados.conversas.map((m, i) => <article key={`${m.em}-${i}`} className={`ac-message ${m.papel}`}><b>{m.papel === "ia" ? "Análise da IA" : "Equipe"}</b><p>{m.texto}</p></article>)}{ocupado === "ia" && <p role="status"><Loader2 size={16} className="animate-spin" />Conferindo registros e histórico…</p>}</div>
      {fontesIA.length > 0 && <ol className="ac-ai-sources">{fontesIA.map(f => <li key={f.id}><button type="button" disabled={alterado} onClick={() => onSelecionar(f.id)}>[{f.numero}] {dataBR(f.data)} · {f.titulo}</button></li>)}</ol>}
      {sugestoes.map((s, i) => <div className="ac-suggestion" key={i}><p>{s}</p><button type="button" className="btn" disabled={!!ocupado || r.dados.acoes.length >= 20} onClick={() => { campo("acoes", [...r.dados.acoes, { ...novaAcao(), titulo: s.slice(0, 200), descricao: s }]); setAba("acoes"); }}>Usar como proposta</button></div>)}
      <form onSubmit={e => { e.preventDefault(); void perguntar(); }}><label htmlFor="ac-question">Pergunte sobre este cliente</label><textarea id="ac-question" rows={3} maxLength={2000} value={pergunta} onChange={e => setPergunta(e.target.value)} placeholder="Qual é a próxima ação e quais dados sustentam isso?" /><button type="submit" className="btn primary" disabled={!!ocupado || !painel.ia || pergunta.trim().length < 3}><MessageSquare size={16} />Consultar IA</button></form>
    </aside></fieldset>
  </div>;
}
