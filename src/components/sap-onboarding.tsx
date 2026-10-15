import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IdCard, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import { diaAtual, getAcessosSap, getClinicaSap, getMarcosSap, salvarAcessoSap, salvarFichaSap, type SapCadastro } from "@/lib/sap-data";
import { ITENS_ACESSO, prontoParaSessao1, resumoAcessos, type RegistroAcesso, type StatusAcesso } from "@/lib/sap-acessos";
import { hojeBrasilia } from "@/lib/status-fonte";

const campo = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const dm = (iso: string | null) => (iso ? iso.split("-").reverse().slice(0, 2).join("/") : "—");
const PRAZO = { C: "Crítico (até D7, bloqueia a Sessão 1)", P: "Complementar (até D14)", S: "Até a sessão que usa" } as const;

/** Ficha do Cliente mínima (02.06) e Checklist de Dados e Acessos (02.05), com o portão da Sessão 1. */
export function OnboardingSap({ clientId }: { clientId: string }) {
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  if (cadQ.isLoading) return <p className="note">Carregando…</p>;
  if (!clinica) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  return (
    <div className="space-y-4">
      <FichaSap clinica={clinica} />
      <ChecklistAcessos clinica={clinica} />
    </div>
  );
}

function FichaSap({ clinica }: { clinica: SapCadastro }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [ed, setEd] = useState<null | { decisorNome: string; decisorContato: string; ambicao: string; coordenador: string; caminho: string; categoriaFonte: string }>(null);
  const salvar = useMutation({ mutationFn: () => salvarFichaSap(clinica.id, ed!), onSuccess: () => { setEd(null); qc.invalidateQueries({ queryKey: ["sap-cadastro"] }); } });
  const linhas: [string, string | null][] = [
    ["Decisor", clinica.decisor_nome],
    ["Contato do decisor", clinica.decisor_contato],
    ["Ambição para o D90 (kickoff)", clinica.ambicao_d90],
    ["Coordenador de Implementação", clinica.coordenador],
    ["Caminho de tecnologia", clinica.caminho_tecnologia ? (clinica.caminho_tecnologia === "A" ? "A · Quaddro" : "B · sem Quaddro") : null],
    ["Categoria da fonte de dados na Meta (A6)", clinica.categoria_fonte_meta],
  ];
  const faltam = linhas.filter(([, v]) => !v).length;
  return (
    <Painel icone={IdCard} titulo="Ficha do Cliente (02.06)" resumo={faltam ? `${faltam} campo(s) por preencher` : "Completa"}
      ajuda={<>O essencial da ficha para operar: quem decide, o que a clínica quer no D90 (dito no kickoff), quem coordena, o caminho de tecnologia e a classificação da fonte de dados da Meta. Senhas nunca entram aqui.</>}>
      {!ed ? (
        <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {linhas.map(([k, v]) => (
            <div key={k}><span style={{ color: "var(--text-dim)" }}>{k}: </span>{v ? <strong>{v}</strong> : <span style={{ color: "var(--muted)" }}>não preenchido</span>}</div>
          ))}
          {isAdmin && (
            <button type="button" className="mt-1 justify-self-start text-sm font-semibold underline" style={{ color: "var(--accent)" }}
              onClick={() => setEd({ decisorNome: clinica.decisor_nome ?? "", decisorContato: clinica.decisor_contato ?? "", ambicao: clinica.ambicao_d90 ?? "", coordenador: clinica.coordenador ?? "", caminho: clinica.caminho_tecnologia ?? "", categoriaFonte: clinica.categoria_fonte_meta ?? "" })}>
              Editar ficha
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <label className="text-xs">Decisor<input value={ed.decisorNome} onChange={(x) => setEd({ ...ed, decisorNome: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <label className="text-xs">Contato do decisor<input value={ed.decisorContato} onChange={(x) => setEd({ ...ed, decisorContato: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <label className="text-xs sm:col-span-2">Ambição para o D90 (dita no kickoff)<input value={ed.ambicao} onChange={(x) => setEd({ ...ed, ambicao: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <label className="text-xs">Coordenador de Implementação<input value={ed.coordenador} onChange={(x) => setEd({ ...ed, coordenador: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <label className="text-xs">Caminho de tecnologia
            <select value={ed.caminho} onChange={(x) => setEd({ ...ed, caminho: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo}>
              <option value="">—</option><option value="A">A · Quaddro</option><option value="B">B · sem Quaddro</option>
            </select>
          </label>
          <label className="text-xs sm:col-span-2">Categoria da fonte de dados na Meta e eventos restritos<input value={ed.categoriaFonte} onChange={(x) => setEd({ ...ed, categoriaFonte: x.target.value })} placeholder="Ex.: Saúde e bem-estar · Lead e Schedule limitados" className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          <div className="flex gap-2">
            <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate()} className="min-h-[34px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>Salvar</button>
            <button type="button" onClick={() => setEd(null)} className="min-h-[34px] px-2 text-sm" style={{ color: "var(--text-dim)" }}>Cancelar</button>
          </div>
          {salvar.isError && <span className="text-xs sm:col-span-2" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</span>}
        </div>
      )}
    </Painel>
  );
}

function ChecklistAcessos({ clinica }: { clinica: SapCadastro }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const hoje = hojeBrasilia();
  const accQ = useQuery({ queryKey: ["sap-acessos", clinica.id], queryFn: () => getAcessosSap(clinica.id) });
  const marcosQ = useQuery({ queryKey: ["sap-marcos", clinica.id], queryFn: () => getMarcosSap(clinica.id) });
  const salvar = useMutation({ mutationFn: (r: RegistroAcesso) => salvarAcessoSap(clinica.id, r), onSuccess: () => qc.invalidateQueries({ queryKey: ["sap-acessos", clinica.id] }) });
  const regs = accQ.data ?? [];
  const mapa = useMemo(() => new Map(regs.map((r) => [r.item, r])), [regs]);
  const dia = diaAtual(clinica.d0, clinica.pausas);
  const r = resumoAcessos(regs, dia);
  const feitos = new Set((marcosQ.data ?? []).filter((m) => m.concluido_em).map((m) => m.marco));
  const portao = prontoParaSessao1(regs, feitos);
  const blocos = [...new Set(ITENS_ACESSO.map((i) => i.bloco))];

  const mudar = (item: string, patch: Partial<RegistroAcesso>) => {
    const atual = mapa.get(item) ?? { item, status: "pendente" as StatusAcesso, confirmado_em: null, confirmado_por: null, observacao: null, revogado_em: null };
    const novo = { ...atual, ...patch };
    if (patch.status === "confirmado" && !novo.confirmado_em) novo.confirmado_em = hoje;
    if (patch.status === "confirmado" && !novo.confirmado_por) novo.confirmado_por = ITENS_ACESSO.find((i) => i.id === item)?.quem ?? null;
    if (patch.status === "pendente") novo.confirmado_em = null;
    salvar.mutate(novo);
  };

  return (
    <Painel icone={KeyRound} titulo="Checklist de Dados e Acessos (02.05)"
      resumo={`Críticos ${r.criticos.feitos} de ${r.criticos.total} · complementares ${r.complementares.feitos} de ${r.complementares.total}`}
      ajuda={<>Quem confirma testa o acesso de verdade e registra a data. Ninguém passa senha: acesso é por convite; o que não aceita convite vai para o cofre. Se um crítico não sair até o D7, segue a régua de escalonamento do 02.01. No encerramento, registre a data em que o acesso da DC foi revogado.</>}>
      <div className="mt-2 rounded-lg border p-3 text-sm" style={{ borderColor: portao.pronto ? "var(--good)" : "var(--border)" }}>
        {portao.pronto ? (
          <strong style={{ color: "var(--good)" }}>Pronto para a Sessão 1: kickoff, formulário, baseline e acessos críticos concluídos.</strong>
        ) : (
          <>Ainda não está pronto para a Sessão 1. Falta: <strong>{portao.falta.join(", ")}</strong>. (Kickoff, formulário e baseline são marcados em Cronograma e prazos.)</>
        )}
        {r.atrasados.length > 0 && <div className="mt-1" style={{ color: "var(--crit)" }}>Vencidos: {r.atrasados.map((i) => i.id).join(", ")}</div>}
        {r.aRevogar > 0 && dia !== null && dia >= 90 && <div className="mt-1" style={{ color: "var(--warn)" }}>{r.aRevogar} acesso(s) da DC ainda não revogado(s).</div>}
      </div>
      {blocos.map((b) => (
        <div key={b} className="mt-3 overflow-x-auto">
          <h4 className="mb-1 text-sm font-semibold">{b}</h4>
          <table className="w-full text-sm">
            <tbody>
              {ITENS_ACESSO.filter((i) => i.bloco === b).map((i) => {
                const reg = mapa.get(i.id);
                const st = reg?.status ?? "pendente";
                const vencido = r.atrasados.some((x) => x.id === i.id);
                return (
                  <tr key={i.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 pr-2 text-xs tabular-nums" style={{ color: "var(--muted)" }}>{i.id}</td>
                    <td className="py-1.5 pr-3">
                      <div>{i.nome}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>{PRAZO[i.prazo]}{i.prazo === "S" ? ` · D${i.ate}` : ""} · confirma: {i.quem}{i.dica ? ` · ${i.dica}` : ""}</div>
                      {reg?.observacao && <div className="text-xs">{reg.observacao}</div>}
                    </td>
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      {isAdmin ? (
                        <select aria-label={`Status do item ${i.id}`} value={st} disabled={salvar.isPending} onChange={(x) => mudar(i.id, { status: x.target.value as StatusAcesso })} className="min-h-[32px] rounded-md border px-1.5 text-sm" style={campo}>
                          <option value="pendente">Pendente</option><option value="confirmado">Confirmado</option><option value="nao_se_aplica">Não se aplica</option>
                        </select>
                      ) : (
                        <span>{st === "confirmado" ? "Confirmado" : st === "nao_se_aplica" ? "Não se aplica" : "Pendente"}</span>
                      )}
                      {vencido && <div><Selo cor="var(--crit)">vencido</Selo></div>}
                    </td>
                    <td className="py-1.5 text-xs" style={{ color: "var(--text-dim)" }}>
                      {st === "confirmado" && <>em {dm(reg?.confirmado_em ?? null)}{reg?.confirmado_por ? ` · ${reg.confirmado_por}` : ""}</>}
                      {reg?.revogado_em && <div>revogado em {dm(reg.revogado_em)}</div>}
                      {isAdmin && st !== "pendente" && (
                        <div className="mt-1 flex flex-wrap gap-2">
                          <button type="button" className="underline" onClick={() => { const o = window.prompt("Observação (ex.: quem confirmou, o que fazer)", reg?.observacao ?? ""); if (o !== null) mudar(i.id, { observacao: o, confirmado_por: reg?.confirmado_por ?? i.quem }); }}>nota</button>
                          {st === "confirmado" && !reg?.revogado_em && <button type="button" className="underline" onClick={() => mudar(i.id, { revogado_em: hoje })}>revogado hoje</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {salvar.isError && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</p>}
    </Painel>
  );
}
