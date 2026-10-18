import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, ExternalLink } from "lucide-react";
import { iniciarFluxo, rodarAgentes, NOME_ESTADO, type EstadoExecucao } from "@/lib/agentes-data";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getAcessosSap, getClinicaSap, type AcaoSap } from "@/lib/sap-data";
import { situacaoCriticos } from "@/lib/agente-acessos";
import { Painel } from "@/components/visual";

const db = supabase as any;
const taskIdPattern = /^[a-zA-Z0-9_-]{3,128}$/;
const campo = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" } as const;
const formatoData = (iso: string | null) => iso ? iso.slice(0, 10).split("-").reverse().join("/") : "não definido";
type AcaoAcesso = Pick<AcaoSap, "id" | "codigo" | "texto" | "responsavel" | "prazo" | "status">;
type Vinculo = { clickup_task_id: string; atualizado_em: string };

function extrairTaskId(value: string): string | null {
  const text = value.trim();
  if (taskIdPattern.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.hostname !== "app.clickup.com" || url.port || url.username || url.password) return null;
    const id = /^\/t\/([a-zA-Z0-9_-]{3,128})\/?$/.exec(url.pathname)?.[1];
    return id ?? null;
  } catch {
    return null;
  }
}

/** The keyed body keeps an unfinished link or mutation message scoped to its clinic. */
export function SapAcessosOperacao({ clientId }: { clientId: string }) {
  return <OperacaoAcessos key={clientId} clientId={clientId} />;
}

function OperacaoAcessos({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const helpId = useId();
  const [task, setTask] = useState("");
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId), retry: false });
  const clinica = cadQ.data;
  const q = useQuery({
    queryKey: ["sap-acessos-operacao", clinica?.id],
    enabled: !!clinica,
    retry: false,
    queryFn: async () => {
      const [acessos, acoes, vinculo] = await Promise.all([
        getAcessosSap(clinica!.id),
        db.from("sap_acoes").select("id, codigo, texto, responsavel, prazo, status")
          .eq("clinica_id", clinica!.id).is("removido_em", null).like("codigo", "agente\\_acesso\\_%")
          .order("prazo", { ascending: true, nullsFirst: false }).order("id"),
        db.from("sap_marco_vinculos").select("clickup_task_id, atualizado_em").eq("clinica_id", clinica!.id).eq("marco", 5).maybeSingle(),
      ]);
      if (acoes.error) throw acoes.error;
      if (vinculo.error) throw vinculo.error;
      return { acessos, acoes: (acoes.data ?? []) as AcaoAcesso[], vinculo: vinculo.data as Vinculo | null };
    },
  });
  const conferir = useMutation({
    mutationFn: async () => {
      if (!isAdmin || !clinica) throw new Error("A coordenação precisa conferir estas pendências.");
      const { data, error } = await db.rpc("operacao_sap_conferir", { p_clinica_id: clinica.id });
      if (error) throw new Error("Não foi possível organizar as pendências. Tente novamente.");
      return ((Array.isArray(data) ? data[0] : data) ?? {}) as { proximo_passo?: string };
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["sap-acessos-operacao", clinica?.id] }),
        qc.invalidateQueries({ queryKey: ["sap-acoes", clinica?.id] }),
        qc.invalidateQueries({ queryKey: ["sap-tarefas"] }),
      ]);
    },
  });
  const vincular = useMutation({
    mutationFn: async (id: string) => {
      if (!isAdmin || !clinica || !taskIdPattern.test(id)) throw new Error("Informe o ID ou o endereço da tarefa do ClickUp.");
      const { error } = await db.rpc("sap_vincular_marco", { p_clinica_id: clinica.id, p_task_id: id });
      if (error) throw new Error("Não foi possível salvar o vínculo. Confira a tarefa e tente novamente.");
    },
    onSuccess: async () => {
      setTask("");
      await qc.invalidateQueries({ queryKey: ["sap-acessos-operacao", clinica?.id] });
    },
  });
  const conduzir = useMutation({
    mutationFn: async () => {
      if (!isAdmin || !clinica?.d0) throw new Error("Defina o D0 antes de iniciar o acompanhamento.");
      const { data: atual, error } = await db.from("agente_execucoes").select("id,estado").eq("client_id",clientId).eq("fluxo","acessos_criticos")
        .in("estado",["pendente","rodando","aguardando","aguardando_aprovacao","pausada"]).order("criado_em",{ascending:false}).limit(1).maybeSingle();
      if (error) throw new Error("Não foi possível conferir o acompanhamento em andamento.");
      const id = atual?.id ?? await iniciarFluxo(clientId,{id:"acessos_criticos",agente:"operations",nome:"Acessos críticos",objetivo:"Conduzir o marco 5 com responsáveis, prazo e evidência.",passos:[]});
      const r = await rodarAgentes(id);
      const e = (r.execucoes as {estado:EstadoExecucao}[] | undefined)?.[0];
      return e ? NOME_ESTADO[e.estado] : "Acompanhamento em andamento. Consulte a Central de Agentes.";
    },
    onSuccess: async () => { await qc.invalidateQueries({queryKey:["sap-acessos-operacao",clinica?.id]}); },
  });
  const taskId = extrairTaskId(task);
  const ocupada = conferir.isPending || vincular.isPending || conduzir.isPending;

  if (cadQ.isLoading || (clinica && q.isLoading)) return <p role="status" className="note">Carregando a operação de acessos…</p>;
  if (cadQ.isError || q.isError) return (
    <div role="alert" className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--crit)" }}>
      Não foi possível carregar a operação de acessos. <button type="button" className="underline" onClick={() => void (cadQ.isError ? cadQ.refetch() : q.refetch())}>Tentar novamente</button>
    </div>
  );
  if (!clinica || !q.data) return null;

  const { pendentes, resolvidos } = situacaoCriticos(q.data.acessos);
  const idSalvo = q.data.vinculo?.clickup_task_id;
  const linkSalvo = idSalvo && taskIdPattern.test(idSalvo) ? `https://app.clickup.com/t/${idSalvo}` : null;
  const proximo = !clinica.d0 ? "Defina o D0 da clínica para calcular os prazos da implantação." : pendentes.length
    ? "Registre os acessos que faltam em Ficha e acessos. Depois, confira novamente para atualizar as ações do SAP."
    : "O checklist não tem acessos críticos pendentes. A equipe ainda precisa conferir a tarefa vinculada no ClickUp e aprovar o fechamento na Central de Agentes.";

  return (
    <Painel icone={ClipboardCheck} titulo="Operação de acessos críticos" resumo="Marco 5 · preparação da implantação">
      <div className="space-y-4 text-sm">
        <p><strong>{pendentes.length} acesso(s) pendente(s)</strong> · {resolvidos.length} resolvido(s) no checklist.</p>
        {pendentes.length > 0 && <ul className="list-disc space-y-1 pl-5" aria-label="Acessos críticos pendentes">
          {pendentes.map((p) => <li key={p.id}><strong>{p.id}</strong> · {p.nome}</li>)}
        </ul>}
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
          <strong>Próximo passo</strong>
          <p className="mt-1">{proximo}</p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-dim)" }}>O acompanhamento automático só fecha o marco após os acessos comprovados, a tarefa exata do ClickUp fechada e a aprovação na Central. O conector e o estado da tarefa são conferidos quando o fluxo roda.</p>
        </div>
        {isAdmin && <div className="space-y-2">
          <button type="button" className="btn" disabled={ocupada || !clinica.d0} onClick={() => conduzir.mutate()}>{conduzir.isPending ? "Conferindo o marco…" : "Conduzir este marco"}</button>
          {conduzir.data && <p role="status" className="text-xs">{conduzir.data}. Acompanhe os passos e as decisões na Central de Agentes.</p>}
          {conduzir.isError && <p role="alert" className="text-xs" style={{color:"var(--crit)"}}>{conduzir.error.message}</p>}
        </div>}
        <div className="flex flex-wrap gap-3">
          <Link to="/sap/$clientId/onboarding" params={{ clientId }} className="inline-flex min-h-[40px] items-center font-semibold underline" style={{ color: "var(--accent)" }}>Ficha e acessos</Link>
          <Link to="/sap/$clientId" params={{ clientId }} className="inline-flex min-h-[40px] items-center font-semibold underline" style={{ color: "var(--accent)" }}>Minhas tarefas</Link>
          {isAdmin && <Link to="/admin/agentes" className="inline-flex min-h-[40px] items-center font-semibold underline" style={{ color: "var(--accent)" }}>Central de Agentes</Link>}
        </div>
        {isAdmin && <div className="space-y-2">
          <button type="button" disabled={ocupada} onClick={() => { vincular.reset(); conferir.mutate(); }} className="min-h-[40px] rounded-lg px-3 font-semibold disabled:opacity-60" style={{ background: "var(--accent)", color: "var(--accent-ink, #fff)" }}>
            {conferir.isPending ? "Conferindo pendências…" : "Conferir e organizar pendências"}
          </button>
          <p className="text-xs" style={{ color: "var(--text-dim)" }}>Atualiza as ações de acesso em Ações combinadas e Minhas tarefas. Esta conferência não conclui o marco nem confirma acessos.</p>
          {conferir.isSuccess && <p role="status">Pendências conferidas. {conferir.data.proximo_passo || "Consulte as ações atualizadas abaixo."}</p>}
          {conferir.isError && <p role="alert" style={{ color: "var(--crit)" }}>{conferir.error.message}</p>}
        </div>}

        <section aria-label="Ações de acesso do SAP" className="space-y-2">
          <h3 className="font-semibold">Ações de acesso do SAP</h3>
          {!q.data.acoes.length ? <p style={{ color: "var(--text-dim)" }}>Ainda não há ações de acesso organizadas. A coordenação pode conferir as pendências para prepará-las na lista do SAP.</p> : (
            <ul className="space-y-2">{q.data.acoes.map((a) => <li key={a.id} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <p className="font-medium">{a.texto}</p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>Responsável: {a.responsavel || "a definir"} · prazo: {formatoData(a.prazo)} · {a.status === "feita" ? "ação registrada como feita" : a.status === "nao_feita" ? "ação não feita" : "ação aberta"}</p>
            </li>)}</ul>
          )}
        </section>

        <details className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
          <summary className="min-h-[32px] cursor-pointer font-semibold">Evidências do checklist ({resolvidos.length})</summary>
          {!resolvidos.length ? <p className="mt-2" style={{ color: "var(--text-dim)" }}>Nenhum acesso crítico foi registrado como resolvido. A comprovação é feita em Ficha e acessos.</p> : <ul className="mt-2 space-y-2">{resolvidos.map((r) => <li key={r.id}>
            <p>{r.id} · {r.nome} · {r.status === "nao_se_aplica" ? "não se aplica" : "confirmado"}</p>
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>Data: {formatoData(r.em)} · confirmado por: {r.por || "não registrado"}{r.obs ? ` · ${r.obs}` : ""}</p>
          </li>)}</ul>}
        </details>

        <section aria-label="Vínculo do marco com o ClickUp" className="space-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <h3 className="font-semibold">Tarefa do ClickUp para este marco</h3>
          {linkSalvo ? <a href={linkSalvo} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-1 underline" style={{ color: "var(--accent)" }}>Abrir tarefa vinculada <ExternalLink size={14} aria-hidden /></a> : <p style={{ color: "var(--text-dim)" }}>Nenhuma tarefa válida do ClickUp vinculada ao marco 5.</p>}
          <p id={helpId} className="text-xs" style={{ color: "var(--text-dim)" }}>Salvar o vínculo não confirma a conclusão da tarefa nem a conexão com o ClickUp.</p>
          {isAdmin && <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (taskId && !ocupada) { conferir.reset(); vincular.mutate(taskId); } }}>
            <label className="block">ID ou URL da tarefa do ClickUp
              <input value={task} onChange={(event) => { setTask(event.target.value); vincular.reset(); }} aria-describedby={helpId} aria-invalid={!!task.trim() && !taskId} disabled={ocupada} placeholder="https://app.clickup.com/t/abc123" className="mt-1 block min-h-[40px] w-full rounded-lg border px-3" style={campo} />
            </label>
            {task.trim() && !taskId && <p className="text-xs" style={{ color: "var(--crit)" }}>Use um ID válido ou o endereço https://app.clickup.com/t/ seguido do ID.</p>}
            <button type="submit" disabled={ocupada || !taskId} className="min-h-[40px] rounded-lg border px-3 font-semibold disabled:opacity-60" style={{ borderColor: "var(--border)" }}>{vincular.isPending ? "Salvando vínculo…" : "Salvar vínculo do ClickUp"}</button>
            {vincular.isSuccess && <p role="status">Vínculo salvo. A tarefa ainda precisa ser conferida pelo fluxo antes do fechamento do marco.</p>}
            {vincular.isError && <p role="alert" style={{ color: "var(--crit)" }}>{vincular.error.message}</p>}
          </form>}
        </section>
      </div>
    </Painel>
  );
}
