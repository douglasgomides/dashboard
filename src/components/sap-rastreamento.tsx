import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radar, Send, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Painel, Selo } from "@/components/visual";
import {
  conferirRastreioSap, getClinicaSap, getConversoesSap, getTestesRastreioSap, salvarConfigRastreioSap, salvarTesteRastreioSap,
  type ConfigRastreio, type SapCadastro,
} from "@/lib/sap-data";
import {
  ETAPAS_NEUTRAS, PLANO_CATEGORIA, ROTULO_CATEGORIA, TESTES_RASTREIO, TESTES_REPETIR, dispensavel, recheckCategoria, resumoFila, resumoTestes,
  type CategoriaMeta, type StatusConversao, type StatusTeste,
} from "@/lib/sap-rastreamento";
import { hojeBrasilia } from "@/lib/status-fonte";

const campo = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const dm = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "—");
const OBRIG: Record<string, string> = {
  sim: "Obrigatório", se_pagina: "Obrigatório se houver página", se_google: "Obrigatório se houver Google", se_formulario: "Obrigatório se houver formulário instantâneo",
  se_whatsapp: "Obrigatório se houver WhatsApp", se_sem_restricao: "Obrigatório sem restrição ou com configuração básica", recomendado: "Recomendado",
};
const ROTULO_STATUS: Record<StatusConversao, string> = {
  pendente: "Na fila", enviado: "Enviado", falhou: "Falhou", expirado: "Passou do prazo", bloqueado: "Bloqueado (categoria)", sem_dados: "Sem telefone/e-mail",
};

/** Plano de Rastreamento e Mensuração (05.03): categoria da fonte, checklist de teste (portão dos anúncios) e devolução offline. */
export function RastreamentoSap({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const cadQ = useQuery({ queryKey: ["sap-cadastro", clientId], queryFn: () => getClinicaSap(clientId) });
  const clinica = cadQ.data ?? null;
  if (cadQ.isLoading) return <p className="note">Carregando…</p>;
  if (!clinica) return <p className="note">Esta clínica ainda não está no Sistema de Aquisição.</p>;
  return (
    <div className="space-y-4">
      <ChecklistRastreio clinica={clinica} />
      {isAdmin && <ConfigRastreioPainel clinica={clinica} />}
      {isAdmin && <FilaConversoes clinica={clinica} />}
    </div>
  );
}

function ChecklistRastreio({ clinica }: { clinica: SapCadastro }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sap-rastreio-testes", clinica.id], queryFn: () => getTestesRastreioSap(clinica.id) });
  const inval = () => { qc.invalidateQueries({ queryKey: ["sap-rastreio-testes", clinica.id] }); qc.invalidateQueries({ queryKey: ["sap-cadastro"] }); };
  const salvar = useMutation({ mutationFn: (v: { item: number; status: StatusTeste; evidencia: string }) => salvarTesteRastreioSap(clinica.id, v.item, v.status, v.evidencia), onSuccess: inval });
  const conferir = useMutation({ mutationFn: (por: string) => conferirRastreioSap(clinica.id, por), onSuccess: inval });
  const regs = q.data ?? [];
  const mapa = useMemo(() => new Map(regs.map((r) => [r.item, r])), [regs]);
  const cat = clinica.status_categoria_meta;
  const r = resumoTestes(regs, cat, clinica.rastreamento_conferido_por);

  return (
    <Painel icone={ShieldCheck} titulo="Checklist de teste antes de subir anúncio (05.03)"
      resumo={r.liberado ? "Liberado para subir" : `Obrigatórios ${r.obrigatorios.aprovados} de ${r.obrigatorios.total}`}
      ajuda={<>Regra que não se negocia: nenhum anúncio sobe sem este checklist aprovado e sem a recepção treinada. Cada item exige evidência (print ou link). Lead de teste sempre com o nome "TESTE DC", apagado do Tracker depois. Liberado = todos os obrigatórios aprovados, assinado pelo Gestor de Tráfego e conferido pelo Coordenador de Implementação. Qualquer mudança no checklist pede nova conferência.</>}>
      <div className="mt-2 rounded-lg border p-3 text-sm" style={{ borderColor: r.liberado ? "var(--good)" : "var(--border)" }}>
        {r.liberado ? (
          <strong style={{ color: "var(--good)" }}>Liberado para subir anúncios · conferido por {clinica.rastreamento_conferido_por} em {dm(clinica.rastreamento_conferido_em)}.</strong>
        ) : r.aguardandoConferencia ? (
          <>Todos os obrigatórios aprovados. <strong>Falta a conferência do Coordenador de Implementação.</strong></>
        ) : (
          <>Anúncios ainda não podem subir. Faltam os testes <strong>{r.faltam.join(", ")}</strong>{cat === null && " e o status da categoria saúde e bem-estar (abaixo)"}.</>
        )}
        {r.reprovados.length > 0 && <div className="mt-1" style={{ color: "var(--crit)" }}>Reprovados: {r.reprovados.join(", ")}. Corrigir e testar de novo.</div>}
        {isAdmin && (r.aguardandoConferencia || r.liberado) && (
          <div className="mt-2">
            {r.liberado ? (
              <button type="button" className="text-xs underline" style={{ color: "var(--text-dim)" }} disabled={conferir.isPending} onClick={() => conferir.mutate("")}>Desfazer conferência</button>
            ) : (
              <button type="button" disabled={conferir.isPending} className="min-h-[34px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}
                onClick={() => { const p = window.prompt("Quem conferiu (Coordenador de Implementação)?", clinica.coordenador ?? ""); if (p) conferir.mutate(p); }}>
                Registrar conferência
              </button>
            )}
          </div>
        )}
        <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Toda mudança de página, formulário ou ferramenta: repetir os testes {TESTES_REPETIR.join(", ")}.</div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {TESTES_RASTREIO.map((t) => {
              const reg = mapa.get(t.n);
              const st = reg?.status ?? "pendente";
              const naoVale = st === "nao_se_aplica" && !dispensavel(t, cat);
              return (
                <tr key={t.n} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                  <td className="py-1.5 pr-2 text-xs tabular-nums" style={{ color: "var(--muted)" }}>{t.n}</td>
                  <td className="py-1.5 pr-3">
                    <div>{t.nome}</div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>{t.como} · evidência: {t.evidencia} · {OBRIG[t.obrigatorio]}</div>
                    {reg?.evidencia && <div className="text-xs break-all">{/^https?:\/\//.test(reg.evidencia) ? <a href={reg.evidencia} target="_blank" rel="noreferrer" className="underline">{reg.evidencia}</a> : reg.evidencia}</div>}
                    {naoVale && <div className="text-xs" style={{ color: "var(--crit)" }}>Este item não pode ser dispensado.</div>}
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">
                    {isAdmin ? (
                      <select aria-label={`Status do teste ${t.n}`} value={st} disabled={salvar.isPending}
                        onChange={(x) => {
                          const status = x.target.value as StatusTeste;
                          let ev = reg?.evidencia ?? "";
                          if (status === "aprovado" && !ev) { const p = window.prompt(`Evidência do teste ${t.n} (link ou descrição do print)`); if (!p) return; ev = p; }
                          salvar.mutate({ item: t.n, status, evidencia: ev });
                        }}
                        className="min-h-[32px] rounded-md border px-1.5 text-sm" style={campo}>
                        <option value="pendente">Pendente</option><option value="aprovado">Aprovado</option><option value="reprovado">Reprovado</option><option value="nao_se_aplica">Não se aplica</option>
                      </select>
                    ) : (
                      <span>{st === "aprovado" ? "Aprovado" : st === "reprovado" ? "Reprovado" : st === "nao_se_aplica" ? "Não se aplica" : "Pendente"}</span>
                    )}
                    {reg?.feito_em && st !== "pendente" && <div className="text-xs" style={{ color: "var(--text-dim)" }}>em {dm(reg.feito_em)}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(salvar.isError || conferir.isError) && <p className="mt-1 text-xs" style={{ color: "var(--crit)" }}>{((salvar.error ?? conferir.error) as Error).message}</p>}
    </Painel>
  );
}

function ConfigRastreioPainel({ clinica }: { clinica: SapCadastro }) {
  const qc = useQueryClient();
  const hoje = hojeBrasilia();
  const atual: ConfigRastreio = {
    meta_pixel_id: clinica.meta_pixel_id ?? "", meta_ad_account_id: clinica.meta_ad_account_id ?? "", google_ads_customer_id: clinica.google_ads_customer_id ?? "",
    google_acoes_conversao: clinica.google_acoes_conversao ?? {}, status_categoria_meta: clinica.status_categoria_meta ?? "",
    categoria_verificada_em: clinica.categoria_verificada_em ?? "", conversoes_meta: !!clinica.conversoes_meta, conversoes_google: !!clinica.conversoes_google,
  };
  const [ed, setEd] = useState<ConfigRastreio | null>(null);
  const salvar = useMutation({ mutationFn: (c: ConfigRastreio) => salvarConfigRastreioSap(clinica.id, c), onSuccess: () => { setEd(null); qc.invalidateQueries({ queryKey: ["sap-cadastro"] }); } });
  const cat = clinica.status_categoria_meta;
  const rc = recheckCategoria(clinica.categoria_verificada_em, hoje);
  const inp = (k: keyof ConfigRastreio, label: string, ph = "") => (
    <label className="text-xs">{label}<input value={String(ed![k] ?? "")} placeholder={ph} onChange={(x) => setEd({ ...ed!, [k]: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
  );

  return (
    <Painel icone={Radar} titulo="Categoria da fonte e envio às plataformas (equipe)"
      resumo={cat ? `${ROTULO_CATEGORIA[cat]}${rc.vencido ? " · recheck vencido" : ""}` : "Categoria não verificada"}
      ajuda={<>A Meta pode classificar o conjunto de dados de clínicas como saúde e bem-estar e limitar eventos. Verificar no D18, antes de subir (D27) e a cada 15 dias. O envio de etapas sai desligado: só ligar depois do teste 13 aprovado. O token da API de Conversões e a credencial do Google ficam no n8n, nunca aqui.</>}>
      {!ed ? (
        <div className="mt-2 space-y-2 text-sm">
          <div>
            Categoria: {cat ? <strong>{ROTULO_CATEGORIA[cat]}</strong> : <span style={{ color: "var(--crit)" }}>não verificada</span>}
            {clinica.categoria_verificada_em && <> · verificada em {dm(clinica.categoria_verificada_em)}</>}
            {rc.vencido && cat && <> · <Selo cor="var(--warn)">recheck vencido ({rc.dias} dias)</Selo></>}
          </div>
          {cat && <div className="text-xs" style={{ color: "var(--text-dim)" }}>{PLANO_CATEGORIA[cat]}</div>}
          <div className="grid gap-1 sm:grid-cols-2">
            <div><span style={{ color: "var(--text-dim)" }}>Conjunto de dados (pixel): </span>{clinica.meta_pixel_id || <span style={{ color: "var(--muted)" }}>não informado</span>}</div>
            <div><span style={{ color: "var(--text-dim)" }}>Conta de anúncios: </span>{clinica.meta_ad_account_id || <span style={{ color: "var(--muted)" }}>não informada</span>}</div>
            <div><span style={{ color: "var(--text-dim)" }}>Google Ads (ID do cliente): </span>{clinica.google_ads_customer_id || <span style={{ color: "var(--muted)" }}>não informado</span>}</div>
            <div><span style={{ color: "var(--text-dim)" }}>Ações de conversão no Google: </span>{Object.values(clinica.google_acoes_conversao ?? {}).filter(Boolean).length} de 4</div>
            <div><span style={{ color: "var(--text-dim)" }}>Envio à Meta: </span><strong>{clinica.conversoes_meta ? "ligado" : "desligado"}</strong></div>
            <div><span style={{ color: "var(--text-dim)" }}>Envio ao Google: </span><strong>{clinica.conversoes_google ? "ligado" : "desligado"}</strong></div>
          </div>
          <button type="button" className="text-sm font-semibold underline" style={{ color: "var(--accent)" }} onClick={() => setEd(atual)}>Editar</button>
        </div>
      ) : (
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <label className="text-xs">Categoria saúde e bem-estar
            <select value={ed.status_categoria_meta} onChange={(x) => setEd({ ...ed, status_categoria_meta: x.target.value as CategoriaMeta | "" })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo}>
              <option value="">Não verificada</option>
              {(Object.keys(ROTULO_CATEGORIA) as CategoriaMeta[]).map((k) => <option key={k} value={k}>{ROTULO_CATEGORIA[k]}</option>)}
            </select>
          </label>
          <label className="text-xs">Verificada em<input type="date" value={ed.categoria_verificada_em} onChange={(x) => setEd({ ...ed, categoria_verificada_em: x.target.value })} className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} /></label>
          {inp("meta_pixel_id", "Conjunto de dados (pixel) da clínica", "Só números")}
          {inp("meta_ad_account_id", "Conta de anúncios", "act_…")}
          {inp("google_ads_customer_id", "Google Ads · ID do cliente", "123-456-7890")}
          <div className="sm:col-span-2 grid gap-2 sm:grid-cols-4">
            {ETAPAS_NEUTRAS.map((e) => (
              <label key={e.etapa} className="text-xs">{e.etapa} no Google ({e.marco.split(" (")[0].toLowerCase()})
                <input value={ed.google_acoes_conversao[e.etapa] ?? ""} placeholder="ID da ação" onChange={(x) => setEd({ ...ed, google_acoes_conversao: { ...ed.google_acoes_conversao, [e.etapa]: x.target.value.trim() } })}
                  className="mt-0.5 block min-h-[34px] w-full rounded-md border px-2 text-sm" style={campo} />
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.conversoes_meta} onChange={(x) => setEd({ ...ed, conversoes_meta: x.target.checked })} /> Ligar envio das etapas à Meta</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ed.conversoes_google} onChange={(x) => setEd({ ...ed, conversoes_google: x.target.checked })} /> Ligar envio das etapas ao Google</label>
          <div className="flex gap-2">
            <button type="button" disabled={salvar.isPending} onClick={() => salvar.mutate(ed)} className="min-h-[34px] rounded-lg px-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--accent)" }}>Salvar</button>
            <button type="button" onClick={() => setEd(null)} className="min-h-[34px] px-2 text-sm" style={{ color: "var(--text-dim)" }}>Cancelar</button>
          </div>
          {salvar.isError && <span className="text-xs sm:col-span-2" style={{ color: "var(--crit)" }}>{(salvar.error as Error).message}</span>}
        </div>
      )}
    </Painel>
  );
}

function FilaConversoes({ clinica }: { clinica: SapCadastro }) {
  const q = useQuery({ queryKey: ["sap-conversoes", clinica.id], queryFn: () => getConversoesSap(clinica.id) });
  const linhas = q.data ?? [];
  const agora = new Date().toISOString();
  const plats = [
    { id: "meta" as const, nome: "Meta (API de Conversões)", ligado: !!clinica.conversoes_meta, falta: !clinica.meta_pixel_id ? "conjunto de dados (pixel)" : null },
    { id: "google" as const, nome: "Google (conversões offline)", ligado: !!clinica.conversoes_google,
      falta: !clinica.google_ads_customer_id ? "ID do cliente Google Ads" : Object.values(clinica.google_acoes_conversao ?? {}).filter(Boolean).length === 0 ? "ações de conversão" : null },
  ];
  const motivos = [...linhas.filter((l) => l.status === "falhou" && l.motivo).reduce((m, l) => m.set(l.motivo!, (m.get(l.motivo!) ?? 0) + 1), new Map<string, number>())];

  return (
    <Painel icone={Send} titulo="Devolução das etapas às plataformas (equipe)"
      resumo={linhas.length ? `${linhas.length} etapa(s) nos últimos 90 dias` : "Nenhuma etapa registrada"}
      ajuda={<>Cada mudança de etapa no CRM marcada como marco do SAP (em Etapas no funil) entra aqui com nome neutro: EtapaA lead qualificado, EtapaB agendou, EtapaC compareceu, EtapaD fechou com valor em R$. O n8n envia uma vez por dia; a Meta só aceita até 7 dias de atraso, o Google até 63. Só saem telefone e e-mail com SHA-256, nunca nome, serviço ou nome da etapa do CRM.</>}>
      {q.isLoading ? <p className="note">Carregando…</p> : (
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {plats.map((p) => {
            const f = resumoFila(linhas, p.id, agora);
            return (
              <div key={p.id} className="min-w-0 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{p.nome}</strong>
                  <Selo cor={p.ligado ? "var(--good)" : "var(--muted)"}>{p.ligado ? "envio ligado" : "envio desligado"}</Selo>
                </div>
                {p.falta && <div className="mt-1 text-xs" style={{ color: "var(--warn)" }}>Falta {p.falta} para enviar.</div>}
                <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[420px] text-xs">
                  <thead><tr style={{ color: "var(--text-dim)" }}><th className="text-left font-normal">Etapa</th>{(["pendente", "enviado", "falhou", "expirado", "sem_dados"] as StatusConversao[]).map((s) => <th key={s} className="text-right font-normal">{ROTULO_STATUS[s]}</th>)}</tr></thead>
                  <tbody>
                    {ETAPAS_NEUTRAS.map((e) => {
                      const da = linhas.filter((l) => l.plataforma === p.id && l.etapa === e.etapa);
                      return (
                        <tr key={e.etapa} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="py-1">{e.etapa} <span style={{ color: "var(--muted)" }}>· {e.marco}</span></td>
                          {(["pendente", "enviado", "falhou", "expirado", "sem_dados"] as StatusConversao[]).map((s) => <td key={s} className="py-1 text-right tabular-nums">{da.filter((l) => l.status === s).length || "·"}</td>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
                <div className="mt-2 space-y-0.5 text-xs" style={{ color: "var(--text-dim)" }}>
                  <div>Último envio: {f.ultimoEnvio ? dm(f.ultimoEnvio) : "nenhum ainda"}</div>
                  {f.porStatus.bloqueado > 0 && <div>{f.porStatus.bloqueado} bloqueada(s) pela restrição total da categoria: ficam só no Tracker.</div>}
                  {f.metaPertoDeExpirar > 0 && <div style={{ color: "var(--warn)" }}>{f.metaPertoDeExpirar} na fila há mais de 5 dias: a Meta recusa depois de 7.</div>}
                  {f.semDadosPct !== null && f.semDadosPct >= 0.3 && (
                    <div style={{ color: "var(--warn)" }}>{Math.round(f.semDadosPct * 100)}% das etapas sem telefone nem e-mail no CRM: sem isso a plataforma não reconhece a pessoa. Conferir se o CRM grava o contato do lead.</div>
                  )}
                </div>
              </div>
            );
          })}
          {motivos.length > 0 && (
            <div className="text-xs lg:col-span-2">
              <strong>Falhas recentes:</strong> {motivos.map(([m, n]) => `${m} (${n})`).join(" · ")}
            </div>
          )}
        </div>
      )}
    </Painel>
  );
}
