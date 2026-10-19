import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { BotaoCopiar } from "@/components/botao-copiar";
import { supabase } from "@/integrations/supabase/client";
import { NOME_EVENTO, NOME_OPERACAO, resumoOperacao, type SaudeOperacao, type TrabalhoRecuperacao } from "@/lib/operacao-recuperacao";

const db = supabase as any;
const estilo = { background: "var(--surface)", borderColor: "var(--border)" };
const quando = (iso: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "Sem sincronização confirmada";
const erroLegivel = (e: unknown) => e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.";
async function rpc(nome: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(nome, args);
  if (error) throw new Error(error.message);
  return data;
}
function useAtualizar(clientId: string) {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ["operacao-recuperacao", clientId] }),
    qc.invalidateQueries({ queryKey: ["sugestoes-agentes", clientId, "recuperacao"] }),
    qc.invalidateQueries({ queryKey: ["painel-agentes", clientId] }),
    qc.invalidateQueries({ queryKey: ["agentes-trabalho", clientId] }),
  ]);
}

export function AssumirRecuperacao({ clientId, sugestaoId }: { clientId: string; sugestaoId: string }) {
  const atualizar = useAtualizar(clientId);
  const [horas, setHoras] = useState("24");
  const m = useMutation({
    mutationFn: async () => {
      await rpc("operacao_iniciar", { p_sugestao_id: sugestaoId, p_prazo: new Date(Date.now() + Number(horas) * 3_600_000).toISOString() });
      await rpc("operacao_verificar", { p_client_id: clientId });
    },
    onSettled: atualizar,
  });
  return <div className="mt-3 space-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs">Meu prazo <select aria-label="Prazo para realizar o contato" value={horas} onChange={e => setHoras(e.target.value)} disabled={m.isPending} className="ml-1 rounded border p-1.5" style={estilo}>
        <option value="4">4 horas</option><option value="24">24 horas</option><option value="48">48 horas</option>
      </select></label>
      <button type="button" className="btn inline-flex items-center gap-1.5" disabled={m.isPending || m.isSuccess} onClick={() => m.mutate()}>
        <ArrowRight size={14} aria-hidden />{m.isPending ? "Organizando caso…" : m.isSuccess ? "Caso em acompanhamento" : "Assumir e acompanhar"}
      </button>
    </div>
    <p className="text-xs" style={{ color: "var(--ink-2)" }}>Você assume a revisão e o contato. Depois, vincule a mensagem sincronizada para acompanhar o desfecho.</p>
    {m.isError && <p role="alert" className="text-xs" style={{ color: "var(--crit)" }}>{erroLegivel(m.error)}</p>}
  </div>;
}

interface Mensagem { id: string; enviada_em: string; texto: string | null; externo_id: string; direcao: string; tipo: string }
function CartaoTrabalho({ t, podeEditar, atualizar }: { t: TrabalhoRecuperacao; podeEditar: boolean; atualizar: () => Promise<unknown> }) {
  const [abrir, setAbrir] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [motivo, setMotivo] = useState("");
  const [encerrando, setEncerrando] = useState(false);
  const ms = useQuery({
    queryKey: ["operacao-mensagens", t.client_id, t.id, t.aprovado_em], enabled: abrir && podeEditar,
    queryFn: async () => {
      const data = await rpc("operacao_mensagens", { p_trabalho_id: t.id });
      return (data ?? []) as Mensagem[];
    },
  });
  const m = useMutation({
    mutationFn: async (acao: "vincular" | "encerrar" | "replanejar") => {
      if (acao === "vincular") await rpc("operacao_vincular_mensagem", { p_trabalho_id: t.id, p_mensagem_id: mensagem });
      else if (acao === "replanejar") await rpc("operacao_replanejar", { p_trabalho_id: t.id, p_prazo: new Date(Date.now() + 24*3_600_000).toISOString() });
      else await rpc("operacao_encerrar", { p_trabalho_id: t.id, p_motivo: motivo.trim() });
      setAbrir(false); setEncerrando(false);
    }, onSuccess: atualizar,
  });
  const aberta = !["resolvida", "cancelada"].includes(t.estado);
  const podeVincular = !t.mensagem_id && t.estado !== "bloqueada" && t.estado !== "cancelada";
  const eventos = t.observacao.eventos_crm ?? [];
  const candidatas = (ms.data ?? []).filter(x => x.direcao === "saida" && !["kommo_robo", "sistema"].includes(x.tipo) && Date.parse(x.enviada_em) > Date.parse(t.aprovado_em));
  return <article className="rounded-lg border p-4" style={estilo}>
    <div className="flex flex-wrap justify-between gap-2">
      <h4 className="font-semibold">{t.conversa?.pessoa?.nome || `Caso ${t.id.slice(0, 8)}`}</h4>
      <span className="rounded border px-2 py-1 text-xs font-semibold" style={{ borderColor: "var(--border)", color: ["bloqueada", "escalada"].includes(t.estado) ? "var(--warn)" : "var(--ink)" }}>{NOME_OPERACAO[t.estado]}</span>
    </div>
    <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>{t.responsavel_nome} · Prazo: {quando(t.prazo)}</p>
    {t.motivo && <p className="mt-2 text-sm">{t.motivo}</p>}
    {aberta && t.sugestao?.mensagem && <div className="mt-3 rounded-lg border p-3" style={{...estilo,background:"var(--surface-2)"}}>
      <p className="text-xs font-semibold">Rascunho para a equipe revisar</p><p className="my-2 whitespace-pre-wrap text-sm">{t.sugestao.mensagem}</p>
      <BotaoCopiar texto={t.sugestao.mensagem} rotulo="Copiar rascunho do caso" />
      <p className="mt-2 text-xs">Confira o histórico e complete os campos antes do contato. Se houver bloqueio, repare a fonte primeiro.</p>
    </div>}
    <ol className="mt-3 space-y-1.5 text-xs" aria-label="Evidências do caso">
      <li>Assumido pela equipe · {quando(t.aprovado_em)}</li>
      <li>{t.observacao.contato_vinculado ? `Contato vinculado · ${quando(t.observacao.contato_vinculado.em)} · mensagem ${t.observacao.contato_vinculado.externo_id}` : t.mensagem_id ? "Contato vinculado ao registro da conversa" : "Contato ainda sem mensagem vinculada"}</li>
      {t.observacao.resposta && <li>Resposta recebida · {quando(t.observacao.resposta.em)} · Conversa sincronizada</li>}
      {eventos.map(e => <li key={`${e.fonte}-${e.id}-${e.tipo}`}>{NOME_EVENTO[e.tipo] ?? e.tipo} · {quando(e.em)} · CRM, evento {e.id}</li>)}
    </ol>
    <div className="mt-3 flex flex-wrap gap-2">
      {podeEditar && podeVincular && <button type="button" className="btn" disabled={m.isPending} onClick={() => setAbrir(!abrir)}>{abrir ? "Fechar seleção" : "Revisar histórico e vincular contato"}</button>}
      {podeEditar && aberta && ["escalada", "bloqueada"].includes(t.estado) && <button type="button" className="btn" disabled={m.isPending} onClick={() => m.mutate("replanejar")}>Assumir revisão em 24h</button>}
      {podeEditar && aberta && <button type="button" className="btn" disabled={m.isPending} onClick={() => setEncerrando(!encerrando)}>Encerrar acompanhamento</button>}
    </div>
    {abrir && podeEditar && podeVincular && <div className="mt-3 space-y-2 rounded border p-3" style={estilo}>
      <p className="text-xs">Confirme qual mensagem foi enviada pela equipe para este caso. O provedor confirma o registro; a autoria é declarada por você. Copiar o rascunho não confirma envio.</p>
      {ms.data && <details><summary className="cursor-pointer text-xs font-semibold">Ver as últimas {ms.data.length} mensagens sincronizadas</summary><ol className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs">{ms.data.map(x => <li key={x.id} className="rounded border p-2" style={estilo}><b>{x.direcao === "entrada" ? "Paciente" : "Clínica"} · {quando(x.enviada_em)}</b><p className="whitespace-pre-wrap break-words">{x.texto || "Sem texto disponível no provedor"}</p></li>)}</ol></details>}
      {ms.isLoading ? <p role="status">Consultando mensagens…</p> : ms.isError ? <p role="alert">{erroLegivel(ms.error)} <button className="underline" onClick={() => void ms.refetch()}>Tentar novamente</button></p> : candidatas.length ? <>
        <label className="block text-xs">Mensagem confirmada na conversa
          <select className="mt-1 w-full min-w-0 rounded border p-2" style={estilo} value={mensagem} onChange={e => setMensagem(e.target.value)}>
            <option value="">Selecione a mensagem</option>{candidatas.map(x => <option key={x.id} value={x.id}>{quando(x.enviada_em)} · {(x.texto || x.externo_id).slice(0, 95)}</option>)}
          </select>
        </label>
        <button className="btn" disabled={!mensagem || m.isPending} onClick={() => m.mutate("vincular")}>Confirmo o contato da equipe</button>
      </> : <p className="text-xs">Nenhuma mensagem da clínica sincronizada após a aprovação. Realize o contato no canal da clínica e aguarde a sincronização. <button type="button" className="underline" onClick={() => void ms.refetch()}>Conferir novamente</button></p>}
    </div>}
    {encerrando && podeEditar && aberta && <form className="mt-3 space-y-2" onSubmit={e => { e.preventDefault(); m.mutate("encerrar"); }}>
      <label className="block text-xs">Motivo do encerramento<textarea className="mt-1 w-full rounded border p-2" style={estilo} value={motivo} minLength={5} maxLength={500} required onChange={e => setMotivo(e.target.value)} /></label>
      <button className="btn" disabled={m.isPending}>Confirmar encerramento</button>
    </form>}
    {m.isError && <p role="alert" className="mt-2 text-sm" style={{ color: "var(--crit)" }}>{erroLegivel(m.error)}</p>}
  </article>;
}

export function OperacaoRecuperacao({ clientId, podeEditar }: { clientId: string; podeEditar: boolean }) {
  const atualizar = useAtualizar(clientId);
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
  const visiveis = dados?.itens.filter(t => todas || !["resolvida", "cancelada"].includes(t.estado)) ?? [];
  return <section aria-labelledby="operacao-recuperacao-titulo" className="space-y-4 rounded-xl border p-4 sm:p-5" style={estilo}>
    <header className="flex flex-wrap justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>Operação de aquisição · piloto assistido</p>
        <h3 id="operacao-recuperacao-titulo" className="mt-1 text-lg font-semibold">Do próximo contato ao desfecho registrado.</h3>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--ink-2)" }}>A equipe realiza o contato. O Nexo confere as fontes, acompanha os casos assumidos e interrompe a cadência quando há resposta ou avanço no CRM.</p></div>
      {podeEditar && <button type="button" className="btn inline-flex items-center gap-1.5 self-start" disabled={verificar.isPending || q.isLoading} onClick={() => verificar.mutate()}><RefreshCw size={14} aria-hidden />{verificar.isPending ? "Conferindo…" : "Verificar desfechos agora"}</button>}
    </header>
    {q.isLoading && <p role="status">Consultando casos e fontes…</p>}
    {q.isError && <p role="alert" style={{ color: "var(--crit)" }}>{erroLegivel(q.error)} <button type="button" className="underline" onClick={() => void q.refetch()}>Tentar novamente</button></p>}
    {verificar.isError && <p role="alert" style={{ color: "var(--crit)" }}>{erroLegivel(verificar.error)}</p>}
    {dados && <>
      <div className="rounded-lg border p-3 text-xs" style={{ borderColor: dados.fontes.apto ? "var(--border)" : "var(--warn)", background: "var(--surface-2)" }}>
        <p className="flex items-center gap-1.5 font-semibold">{dados.fontes.apto ? <CheckCircle2 size={14} aria-hidden /> : <AlertTriangle size={14} aria-hidden />}{dados.fontes.apto ? "Há coletas recentes; cobertura conferida em cada caso" : "Atualizar fontes antes de retomar contato"}</p>
        <ul className="mt-2 space-y-1">{dados.fontes.fontes.map(f => <li key={f.fonte}>{f.fonte === "crm" ? "CRM" : "Mensagens (última coleta completa)"}: {quando(f.sucesso_em)}{f.dados_ate ? ` · dados até ${f.dados_ate}` : ""}{f.erro_posterior ? " · última tentativa teve erro" : ""}{!f.atual ? " · requer conferência" : ""}</li>)}</ul>
        <p className="mt-2">Conferência pela rotina agendada e pelo botão acima. Este piloto usa sincronizações de até {dados.fontes.limite_horas} horas; os registros não chegam em tempo real.</p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[
        ["Em andamento", resumo.emCurso], ["Pedem atenção", resumo.atencao], ["Contatos vinculados", resumo.contatos], ["Respostas observadas", resumo.respostas], ["Agendamentos no CRM", resumo.agendamentos],
      ].map(([r, v]) => <div key={r} className="rounded border p-3" style={estilo}><dt className="text-xs" style={{ color: "var(--ink-2)" }}>{r}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{v}</dd></div>)}</dl>
      <div className="flex flex-wrap justify-between gap-2 text-xs"><p className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden />Até 100 casos assumidos nos últimos 30 dias.</p><button type="button" className="font-semibold underline" onClick={() => setTodas(!todas)}>{todas ? "Mostrar só em andamento" : "Incluir casos que avançaram ou foram encerrados"}</button></div>
      {!visiveis.length && <p className="text-sm" style={{ color: "var(--ink-2)" }}>Nenhum caso neste filtro. Em Recuperação, revise uma proposta e use “Assumir e acompanhar”.</p>}
      <div className="space-y-3">{visiveis.map(t => <CartaoTrabalho key={t.id} t={t} podeEditar={podeEditar} atualizar={atualizar} />)}</div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>Os resultados são fatos observados desde a identificação da oportunidade, sem atribuição automática de crescimento ao agente. Venda registrada não confirma pagamento. Agendamentos dependem de etapas explicitamente mapeadas no CRM.</p>
    </>}
  </section>;
}
