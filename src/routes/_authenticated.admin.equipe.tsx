import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getPessoasEquipe, salvarPessoaEquipe, type DadosPessoa, type PessoaEquipe } from "@/lib/sap-data";
import { PAPEIS } from "@/lib/sap-tarefas";

// Equipe: cadastro de pessoas (time da Doctor Creator e contatos das clínicas) sem exigir login. O "Quem é quem" do SAP
// escolhe daqui e mostra o nome. Com o mesmo e-mail de um login, a pessoa vê as próprias tarefas em Minhas tarefas.
export const Route = createFileRoute("/_authenticated/admin/equipe")({
  component: Equipe,
});

const caixa = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const dim = { color: "var(--text-dim)" } as const;
const campo = { borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" } as const;
const NOME_FUNCAO = Object.fromEntries(PAPEIS.map((p) => [p.id, p.nome.replace(" (escalonamento)", "")]));
const vazio: DadosPessoa = { nome: "", tipo: "equipe", client_id: null, funcoes: [], email: null, whatsapp: null, ativa: true, observacao: null };

function Equipe() {
  const qc = useQueryClient();
  const pessoas = useQuery({ queryKey: ["pessoas-equipe"], queryFn: getPessoasEquipe });
  const clientes = useQuery({
    queryKey: ["equipe-clientes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("clients").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const [editando, setEditando] = useState<{ id: string | null; dados: DadosPessoa } | null>(null);
  const [filtro, setFiltro] = useState<"todas" | "equipe" | "clinica" | "inativas">("todas");
  const nomeCliente = useMemo(() => new Map((clientes.data ?? []).map((c) => [c.id, c.name])), [clientes.data]);
  const lista = (pessoas.data ?? []).filter((p) =>
    filtro === "inativas" ? !p.ativa : filtro === "todas" ? p.ativa : p.ativa && p.tipo === filtro);

  const salvar = useMutation({
    mutationFn: (v: { id: string | null; dados: DadosPessoa }) => salvarPessoaEquipe(v.id, v.dados),
    onSuccess: () => { setEditando(null); qc.invalidateQueries({ queryKey: ["pessoas-equipe"] }); qc.invalidateQueries({ queryKey: ["sap-tarefas"] }); },
  });

  const editar = (p: PessoaEquipe) => setEditando({ id: p.id, dados: { nome: p.nome, tipo: p.tipo, client_id: p.client_id, funcoes: p.funcoes, email: p.email, whatsapp: p.whatsapp, ativa: p.ativa, observacao: p.observacao } });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm" style={dim}>
          Quem trabalha nas clínicas: o time da Doctor Creator e os contatos de cada clínica. Não precisa de login. O "Quem é quem" do SAP
          escolhe as pessoas daqui. Se a pessoa tiver login com o mesmo e-mail, ela vê as tarefas dela em Minhas tarefas.
        </p>
        <button type="button" onClick={() => { salvar.reset(); setEditando({ id: null, dados: vazio }); }}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
          <Plus size={16} /> Cadastrar pessoa
        </button>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtro">
        {(["todas", "equipe", "clinica", "inativas"] as const).map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filtro === f} onClick={() => setFiltro(f)}
            className="min-h-[34px] rounded-full border px-3 text-sm" style={{ ...caixa, ...(filtro === f ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}) }}>
            {{ todas: "Ativas", equipe: "Equipe Doctor Creator", clinica: "Contatos das clínicas", inativas: "Inativas" }[f]}
          </button>
        ))}
      </div>

      {editando && (
        <FormPessoa inicial={editando.dados} novo={!editando.id} clientes={clientes.data ?? []} salvando={salvar.isPending}
          erro={salvar.isError ? (salvar.error as Error).message : null}
          onCancelar={() => setEditando(null)} onSalvar={(dados) => salvar.mutate({ id: editando.id, dados })} />
      )}

      {pessoas.isLoading ? <p className="note">Carregando…</p> : pessoas.isError ? (
        <p className="note" style={{ color: "var(--crit)" }}>Não foi possível carregar: {(pessoas.error as Error).message}</p>
      ) : !lista.length ? (
        <p className="note">Nenhuma pessoa neste filtro.</p>
      ) : (
        <ul className="divide-y rounded-xl border" style={caixa}>
          {lista.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <UserRound size={18} style={dim} aria-hidden />
              <div className="min-w-[220px] flex-1">
                <div className="font-medium">
                  {p.nome}
                  <span className="ml-2 rounded-full border px-2 py-0.5 text-xs font-normal" style={{ borderColor: "var(--border)", ...dim }}>
                    {p.tipo === "equipe" ? "Equipe" : nomeCliente.get(p.client_id ?? "") ?? "Clínica"}
                  </span>
                  {!p.tem_login && <span className="ml-1 text-xs" style={{ color: "var(--muted)" }}>· sem login</span>}
                </div>
                <div className="text-xs" style={dim}>
                  {[p.funcoes.map((f) => NOME_FUNCAO[f] ?? f).join(", ") || null, p.email, p.whatsapp].filter(Boolean).join(" · ") || "Sem função nem contato"}
                </div>
              </div>
              <span className="text-xs" style={dim}>{p.papeis ? `${p.papeis} papel(is) no SAP` : ""}</span>
              <button type="button" onClick={() => { salvar.reset(); editar(p); }} aria-label={`Editar ${p.nome}`}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-2.5 text-sm" style={caixa}>
                <Pencil size={14} /> Editar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormPessoa({ inicial, novo, clientes, salvando, erro, onCancelar, onSalvar }: {
  inicial: DadosPessoa; novo: boolean; clientes: { id: string; name: string }[]; salvando: boolean; erro: string | null;
  onCancelar: () => void; onSalvar: (d: DadosPessoa) => void;
}) {
  const [d, setD] = useState<DadosPessoa>(inicial);
  const set = <K extends keyof DadosPessoa>(k: K, v: DadosPessoa[K]) => setD((x) => ({ ...x, [k]: v }));
  const valido = d.nome.trim().length > 1 && (d.tipo === "equipe" || !!d.client_id);
  const alternar = (f: string) => set("funcoes", d.funcoes.includes(f) ? d.funcoes.filter((x) => x !== f) : [...d.funcoes, f]);
  return (
    <form className="space-y-3 rounded-xl border p-4" style={caixa} onSubmit={(e) => { e.preventDefault(); if (valido) onSalvar(d); }}>
      <h2 className="font-medium">{novo ? "Cadastrar pessoa" : "Editar pessoa"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nome
          <input value={d.nome} onChange={(e) => set("nome", e.target.value)} required className="mt-1 block min-h-[38px] w-full rounded-lg border px-2" style={campo} />
        </label>
        <label className="text-sm">Onde trabalha
          <select value={d.tipo} onChange={(e) => set("tipo", e.target.value as DadosPessoa["tipo"])} className="mt-1 block min-h-[38px] w-full rounded-lg border px-2" style={campo}>
            <option value="equipe">Equipe Doctor Creator</option>
            <option value="clinica">Clínica (médico, recepção, gestor)</option>
          </select>
        </label>
        {d.tipo === "clinica" && (
          <label className="text-sm sm:col-span-2">Clínica
            <select value={d.client_id ?? ""} onChange={(e) => set("client_id", e.target.value || null)} required className="mt-1 block min-h-[38px] w-full rounded-lg border px-2" style={campo}>
              <option value="">Escolha a clínica</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <label className="text-sm">E-mail <span style={dim}>(opcional; liga ao login com o mesmo e-mail)</span>
          <input type="email" value={d.email ?? ""} onChange={(e) => set("email", e.target.value || null)} className="mt-1 block min-h-[38px] w-full rounded-lg border px-2" style={campo} />
        </label>
        <label className="text-sm">WhatsApp <span style={dim}>(opcional)</span>
          <input value={d.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value || null)} inputMode="tel" className="mt-1 block min-h-[38px] w-full rounded-lg border px-2" style={campo} />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm">Funções que costuma fazer <span style={dim}>(ajuda a achar a pessoa; quem atribui o papel é o "Quem é quem")</span></legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {PAPEIS.map((p) => (
            <label key={p.id} className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-2.5 text-sm" style={caixa}>
              <input type="checkbox" checked={d.funcoes.includes(p.id)} onChange={() => alternar(p.id)} /> {NOME_FUNCAO[p.id]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm">Observação <span style={dim}>(opcional)</span>
        <input value={d.observacao ?? ""} onChange={(e) => set("observacao", e.target.value || null)} className="mt-1 block min-h-[38px] w-full rounded-lg border px-2" style={campo} />
      </label>
      {!novo && (
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={d.ativa} onChange={(e) => set("ativa", e.target.checked)} /> Ativa (desmarque quando a pessoa sair; os papéis atuais continuam até você trocar)
        </label>
      )}
      {erro && <p role="alert" className="text-sm" style={{ color: "var(--crit)" }}>{erro}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={!valido || salvando} className="min-h-[38px] rounded-lg px-3 text-sm font-medium disabled:opacity-50" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={onCancelar} className="min-h-[38px] rounded-lg border px-3 text-sm" style={caixa}>Cancelar</button>
      </div>
    </form>
  );
}
