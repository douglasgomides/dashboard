import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, History, Loader2, Pencil, Plus, Sparkles, X } from "lucide-react";
import { FONTES, MEMORIAS, NOME_MEMORIA, paraChave, textoSemDadoPessoal, type Memoria } from "@/lib/brand-brain";
import { decidirItem, escreverItem, getClinicasBrain, getItensBrain, getUltimaLeitura, organizar, pedirPropostas, restaurarItem, type ItemBrain } from "@/lib/brain-data";

// Brand Brain: a memória de marca de cada clínica. O agente lê o que já existe no Hub e PROPÕE; nada vale até alguém
// aprovar aqui. Cada mudança guarda a versão anterior, que pode ser restaurada. Só aparece clínica com o módulo ativo.
export const Route = createFileRoute("/_authenticated/admin/brain")({
  validateSearch: (s: Record<string, unknown>) => ({ c: typeof s.c === "string" ? s.c : undefined }),
  component: BrandBrain,
});

const caixa = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const dim = { color: "var(--text-dim)" } as const;
const campo = { borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" } as const;
const botao = "inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-2.5 text-sm disabled:opacity-50";
const principal = { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } as const;
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
const nomeFonte = (f: string) => (FONTES as Record<string, string>)[f] ?? f;
const rotulo = (chave: string) => chave.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());

function BrandBrain() {
  const qc = useQueryClient();
  const { c } = Route.useSearch();
  const navigate = Route.useNavigate();
  const clinicas = useQuery({ queryKey: ["brain-clinicas"], queryFn: getClinicasBrain });
  const clientId = c ?? clinicas.data?.[0]?.client_id;
  const itens = useQuery({ queryKey: ["brain-itens", clientId], queryFn: () => getItensBrain(clientId!), enabled: !!clientId });
  const leitura = useQuery({ queryKey: ["brain-leitura", clientId], queryFn: () => getUltimaLeitura(clientId!), enabled: !!clientId });
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  useEffect(() => setAviso(null), [clientId]);
  const recarregar = () => { qc.invalidateQueries({ queryKey: ["brain-itens", clientId] }); qc.invalidateQueries({ queryKey: ["brain-leitura", clientId] }); };

  const pedir = useMutation({
    mutationFn: () => pedirPropostas(clientId!),
    onSuccess: (r) => {
      const e = r.execucoes?.[0];
      if (e?.estado === "falhou") setAviso({ tipo: "erro", texto: `Não deu certo: ${e.erro ?? "erro"}` });
      else if (e?.estado === "concluida") setAviso({ tipo: "ok", texto: "Pronto. O que for novo está em \"Para revisar\"." });
      else setAviso({ tipo: "ok", texto: "A leitura ainda está rodando. Atualize a tela em instantes." });
      recarregar();
    },
    onError: (e: Error) => setAviso({ tipo: "erro", texto: /ja existe|duplicate/.test(e.message) ? "Já existe uma leitura em andamento para esta clínica. Veja na Central de Agentes." : e.message }),
  });

  const grupos = useMemo(() => organizar(itens.data ?? []), [itens.data]);
  const propostas = grupos.flatMap((g) => g.propostas.map((p) => ({ p, atual: g.aprovado })));
  // "Aprovar os novos": uma pessoa revisa a lista e aprova de uma vez. Proposta que troca um texto já aprovado (ou que
  // disputa a mesma chave com outra) fica de fora: essa continua item a item, para ninguém sobrescrever sem ver.
  const novas = propostas.filter(({ p, atual }) => !atual && propostas.filter((x) => x.p.memoria === p.memoria && x.p.chave === p.chave).length === 1);
  const aprovarNovas = useMutation({
    mutationFn: async () => { for (const { p } of novas) await decidirItem(p.id, "aprovar"); return novas.length; },
    onSuccess: (n) => { setAviso({ tipo: "ok", texto: `${n} item(ns) aprovado(s).` }); recarregar(); },
    onError: (e: Error) => { setAviso({ tipo: "erro", texto: e.message }); recarregar(); },
  });

  if (clinicas.isLoading) return <p className="note">Carregando…</p>;
  if (clinicas.isError) return <p className="note" style={{ color: "var(--crit)" }}>Não foi possível carregar: {(clinicas.error as Error).message}</p>;
  if (!clinicas.data?.length) {
    return (
      <div className="rounded-xl border p-4 text-sm" style={caixa}>
        Nenhuma clínica com o Brand Brain ativo. O módulo é ligado por clínica (cliente_modulos) e hoje está só na clínica de teste.
        Clientes do Hub continuam iguais.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <p className="max-w-3xl text-sm" style={dim}>
          A memória de marca da clínica, usada por quem cria conteúdo, anúncio e atendimento. Em "Atualizar sugestões", a IA lê o que já
          existe no Hub (Instagram, conversas, ficha e sessões do SAP, banco de anúncios) e sugere. Nada vale até alguém aprovar aqui.
          Não entra nome, telefone nem caso de paciente: só padrões. Tudo se resolve nesta tela.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm">Clínica{" "}
            <select value={clientId ?? ""} onChange={(e) => navigate({ search: { c: e.target.value } })}
              className="ml-1 min-h-[38px] rounded-lg border px-2 text-sm" style={campo}>
              {clinicas.data.map((x) => <option key={x.client_id} value={x.client_id}>{x.nome}{x.status === "beta" ? " (beta)" : ""}</option>)}
            </select>
          </label>
          <button type="button" className={botao} style={principal} disabled={!clientId || pedir.isPending} onClick={() => { setAviso(null); pedir.mutate(); }}>
            {pedir.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} {pedir.isPending ? "Lendo as fontes…" : "Atualizar sugestões"}
          </button>
          <UltimaLeitura l={leitura.data ?? null} />
        </div>
        {aviso && <p role="status" className="text-sm" style={{ color: aviso.tipo === "erro" ? "var(--crit)" : "var(--good)" }}>{aviso.texto}</p>}
      </header>

      {itens.isLoading ? <p className="note">Carregando…</p> : itens.isError ? (
        <p className="note" style={{ color: "var(--crit)" }}>Não foi possível carregar: {(itens.error as Error).message}</p>
      ) : (
        <>
          <section aria-labelledby="revisar" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="revisar" className="font-medium">Para revisar {propostas.length ? `(${propostas.length})` : ""}</h2>
              {novas.length > 1 && (
                <button type="button" className={botao} style={caixa} disabled={aprovarNovas.isPending}
                  onClick={() => { if (window.confirm(`Aprovar ${novas.length} itens novos de uma vez? Os que trocam um texto já aprovado ficam para revisar um por um.`)) aprovarNovas.mutate(); }}>
                  {aprovarNovas.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aprovar os {novas.length} novos
                </button>
              )}
            </div>
            {!propostas.length ? <p className="note">Nenhuma proposta pendente.</p> : (
              <ul className="space-y-2">
                {propostas.map(({ p, atual }) => <CardProposta key={p.id} item={p} atual={atual} onFeito={recarregar} />)}
              </ul>
            )}
          </section>

          {MEMORIAS.map((m) => {
            const lista = grupos.filter((g) => g.memoria === m.id && (g.aprovado || g.historico.some((h) => h.estado === "substituido")));
            return (
              <section key={m.id} aria-labelledby={`mem-${m.id}`} className="rounded-xl border p-4" style={caixa}>
                <h2 id={`mem-${m.id}`} className="font-medium">{m.nome}</h2>
                <p className="text-xs" style={dim}>{m.resumo}</p>
                {!lista.length ? <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>Nada aprovado ainda.</p> : (
                  <ul className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
                    {lista.map((g) => <LinhaItem key={g.chave} chave={g.chave} aprovado={g.aprovado} historico={g.historico} onFeito={recarregar} />)}
                  </ul>
                )}
                <NovoItem clientId={clientId!} memoria={m.id} onFeito={recarregar} />
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function UltimaLeitura({ l }: { l: Awaited<ReturnType<typeof getUltimaLeitura>> }) {
  if (!l) return <span className="text-xs" style={dim}>Ainda não houve leitura desta clínica.</span>;
  const quando = new Date(l.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const n = Number((l.resultado as { propostas?: number } | null)?.propostas ?? 0);
  const texto = l.estado === "concluida" ? `${n} sugestão(ões) nova(s)` : l.estado === "falhou" ? `não deu certo: ${l.erro ?? "erro"}` : "em andamento";
  return <span className="text-xs" style={{ color: l.estado === "falhou" ? "var(--crit)" : "var(--text-dim)" }}>Última leitura: {quando} · {texto}</span>;
}

function Selos({ item }: { item: ItemBrain }) {
  return (
    <span className="text-xs" style={dim}>
      {nomeFonte(item.fonte)}{item.fonte_detalhe ? ` · ${item.fonte_detalhe}` : ""} · confiança {item.confianca}
      {item.origem === "restaurado" ? " · restaurado" : item.origem === "manual" ? " · escrito à mão" : ""}
    </span>
  );
}

function CardProposta({ item, atual, onFeito }: { item: ItemBrain; atual: ItemBrain | null; onFeito: () => void }) {
  const [modo, setModo] = useState<null | "corrigir" | "rejeitar">(null);
  const [texto, setTexto] = useState(item.valor);
  const [motivo, setMotivo] = useState("");
  const decidir = useMutation({
    mutationFn: (a: "aprovar" | "corrigir" | "rejeitar") => decidirItem(item.id, a, a === "corrigir" ? texto : undefined, a === "rejeitar" ? motivo : undefined),
    onSuccess: onFeito,
  });
  return (
    <li className="rounded-xl border p-3" style={caixa}>
      <div className="text-xs font-medium" style={dim}>{NOME_MEMORIA[item.memoria]} · {rotulo(item.chave)}</div>
      <p className="mt-1">{item.valor}</p>
      {atual && <p className="mt-1 text-sm" style={dim}>Hoje está: {atual.valor}</p>}
      <Selos item={item} />
      {modo === "corrigir" && (
        <textarea aria-label="Texto corrigido" value={texto} onChange={(e) => setTexto(e.target.value)} rows={2}
          className="mt-2 block w-full rounded-lg border p-2 text-sm" style={campo} />
      )}
      {modo === "rejeitar" && (
        <input aria-label="Motivo da rejeição" placeholder="Por que não vale?" value={motivo} onChange={(e) => setMotivo(e.target.value)}
          className="mt-2 block min-h-[36px] w-full rounded-lg border px-2 text-sm" style={campo} />
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {modo === null && <>
          <button type="button" className={botao} style={principal} disabled={decidir.isPending} onClick={() => decidir.mutate("aprovar")}><Check size={14} /> Aprovar</button>
          <button type="button" className={botao} style={caixa} onClick={() => setModo("corrigir")}><Pencil size={14} /> Corrigir</button>
          <button type="button" className={botao} style={caixa} onClick={() => setModo("rejeitar")}><X size={14} /> Rejeitar</button>
        </>}
        {modo === "corrigir" && <>
          <button type="button" className={botao} style={principal} disabled={decidir.isPending || texto.trim().length < 3} onClick={() => decidir.mutate("corrigir")}>Aprovar corrigido</button>
          <button type="button" className={botao} style={caixa} onClick={() => setModo(null)}>Voltar</button>
        </>}
        {modo === "rejeitar" && <>
          <button type="button" className={botao} style={principal} disabled={decidir.isPending || !motivo.trim()} onClick={() => decidir.mutate("rejeitar")}>Rejeitar</button>
          <button type="button" className={botao} style={caixa} onClick={() => setModo(null)}>Voltar</button>
        </>}
      </div>
      {decidir.isError && <p role="alert" className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{(decidir.error as Error).message}</p>}
    </li>
  );
}

function LinhaItem({ chave, aprovado, historico, onFeito }: { chave: string; aprovado: ItemBrain | null; historico: ItemBrain[]; onFeito: () => void }) {
  const [aberto, setAberto] = useState(false);
  const antigas = historico.filter((h) => h.estado === "substituido");
  const restaurar = useMutation({ mutationFn: restaurarItem, onSuccess: onFeito });
  return (
    <li className="py-2.5">
      <div className="text-sm font-medium">{rotulo(chave)}</div>
      {aprovado ? <><p className="text-sm">{aprovado.valor}</p><Selos item={aprovado} /></> : <p className="text-sm" style={{ color: "var(--muted)" }}>Sem versão aprovada.</p>}
      {antigas.length > 0 && (
        <div className="mt-1">
          <button type="button" className="inline-flex items-center gap-1 text-xs underline" style={dim} aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
            <History size={12} /> {antigas.length} versão(ões) anterior(es)
          </button>
          {aberto && (
            <ul className="mt-1 space-y-1">
              {antigas.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1 text-xs" style={caixa}>
                  <span className="flex-1">{h.valor} <span style={dim}>({data(h.decidido_em ?? h.criado_em)})</span></span>
                  <button type="button" className="underline" disabled={restaurar.isPending} onClick={() => restaurar.mutate(h.id)}>Restaurar</button>
                </li>
              ))}
            </ul>
          )}
          {restaurar.isError && <p role="alert" className="text-xs" style={{ color: "var(--crit)" }}>{(restaurar.error as Error).message}</p>}
        </div>
      )}
    </li>
  );
}

function NovoItem({ clientId, memoria, onFeito }: { clientId: string; memoria: Memoria; onFeito: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const chave = paraChave(nome);
  const pessoal = texto.trim() !== "" && !textoSemDadoPessoal(texto);
  const salvar = useMutation({
    mutationFn: () => escreverItem(clientId, memoria, chave, texto.trim()),
    onSuccess: () => { setNome(""); setTexto(""); setAberto(false); onFeito(); },
  });
  if (!aberto) return <button type="button" className={`${botao} mt-2`} style={caixa} onClick={() => setAberto(true)}><Plus size={14} /> Escrever item</button>;
  return (
    <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); if (chave.length >= 3 && texto.trim().length >= 3 && !pessoal) salvar.mutate(); }}>
      <input aria-label="Assunto" placeholder="Assunto (ex.: Tom de voz)" value={nome} onChange={(e) => setNome(e.target.value)}
        className="block min-h-[36px] w-full rounded-lg border px-2 text-sm" style={campo} />
      <textarea aria-label="Texto" placeholder="Uma frase objetiva" value={texto} onChange={(e) => setTexto(e.target.value)} rows={2}
        className="block w-full rounded-lg border p-2 text-sm" style={campo} />
      {pessoal && <p className="text-xs" style={{ color: "var(--crit)" }}>Parece ter telefone, e-mail ou CPF. Tire antes de salvar.</p>}
      <p className="text-xs" style={dim}>Se o assunto já existir, este texto vira a versão aprovada e a anterior vai para o histórico.</p>
      <div className="flex gap-2">
        <button type="submit" className={botao} style={principal} disabled={salvar.isPending || chave.length < 3 || texto.trim().length < 3 || pessoal}>Salvar aprovado</button>
        <button type="button" className={botao} style={caixa} onClick={() => setAberto(false)}>Cancelar</button>
      </div>
      {salvar.isError && <p role="alert" className="text-xs" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</p>}
    </form>
  );
}
