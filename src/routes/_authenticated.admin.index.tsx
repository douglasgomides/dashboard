import { useState, type FormEvent } from "react";
import { useMemo } from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAdminUser, createClient, listAllClients } from "@/lib/admin-data";
import { supabase } from "@/integrations/supabase/client";
import { DateRangePicker } from "@/components/date-range-picker";
import { Sparkline } from "@/components/sparkline";
import { resolveDateRange, formatRangeLabel, type DateRangeState, type RangePreset } from "@/lib/date-range";
import { fmtNum, fmtBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminClientsPage,
  validateSearch: (search: Record<string, unknown>): DateRangeState => ({
    preset: (search.preset as RangePreset) ?? "30d",
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
  }),
});

function NewClientForm() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [handle, setHandle] = useState("");

  const mutation = useMutation({
    mutationFn: () => createClient({ name, specialty: specialty || undefined, instagram_handle: handle || undefined }),
    onSuccess: () => {
      setName("");
      setSpecialty("");
      setHandle("");
      queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    mutation.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          Nome do médico(a)
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          Especialidade
        </label>
        <input
          value={specialty}
          onChange={(e) => setSpecialty(e.target.value)}
          className="mt-1 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          @Instagram
        </label>
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          className="mt-1 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--accent)" }}
      >
        {mutation.isPending ? "Criando…" : "Novo cliente"}
      </button>
      {mutation.isError && (
        <p className="w-full text-sm" style={{ color: "var(--danger)" }}>
          {(mutation.error as Error).message}
        </p>
      )}
    </form>
  );
}

function NewAdminForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<{ email: string; temporary_password: string | null } | null>(null);

  const mutation = useMutation({
    mutationFn: () => createAdminUser({ email, password: password || undefined }),
    onSuccess: (data) => {
      setResult({ email, temporary_password: data.temporary_password });
      setEmail("");
      setPassword("");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setResult(null);
    mutation.mutate();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          E-mail do novo admin
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      </div>
      <div>
        <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          Senha (opcional — em branco gera uma)
        </label>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          className="mt-1 rounded-md border px-2 py-1.5 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        />
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        style={{ background: "var(--accent)" }}
      >
        {mutation.isPending ? "Criando…" : "Novo admin"}
      </button>
      {mutation.isError && (
        <p className="w-full text-sm" style={{ color: "var(--danger)" }}>
          {(mutation.error as Error).message}
        </p>
      )}
      {result && (
        <p className="w-full text-sm" style={{ color: "var(--good)" }}>
          Admin {result.email} criado.
          {result.temporary_password
            ? ` Senha temporária (anote agora, não vai aparecer de novo): ${result.temporary_password}`
            : " Ele(a) já pode entrar com a senha que você definiu."}
        </p>
      )}
    </form>
  );
}

type Row = {
  client_id: string; name: string; specialty: string | null; instagram_handle: string | null;
  em_onboarding: boolean; tem_instagram: boolean; tem_anuncios: boolean; tem_crm: boolean; tem_atendimento: boolean;
  reach: number; reach_prev: number; dias_com_dado: number; dias_com_dado_prev: number; dias_periodo: number;
  new_followers: number; followers_atual: number | null; serie_alcance: number[] | null;
  ad_spend: number; ad_conversas: number; ad_leads: number; crm_leads: number;
  ult_instagram: string | null; ult_anuncios: string | null; ult_crm: string | null; ult_atendimento: string | null;
};

type Fonte = "instagram" | "anuncios" | "crm" | "atendimento";
const FONTE_LABEL: Record<Fonte, string> = { instagram: "Instagram", anuncios: "Anúncios", crm: "CRM", atendimento: "WhatsApp" };
const FONTE_QUEM: Record<Fonte, string> = {
  instagram: "reconectar a conta do Instagram / rodar a coleta",
  anuncios: "reconectar a conta de anúncios / rodar a coleta",
  crm: "checar a conexão do CRM",
  atendimento: "checar o token do WhatsApp (Clinic Desk)",
};
const FONTE_PAGINA: Record<Fonte, string> = { instagram: "", anuncios: "/anuncios", crm: "/crm-painel", atendimento: "/atendimento" };
const DIAS_ATRASO = 3;

type Alerta = { chave: string; client: Row; tipo: "coleta" | "queda"; fonte?: Fonte; titulo: string; detalhe: string; pagina: string };
type Status = "coleta" | "atencao" | "onboarding" | "ok";

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00");
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function fmtDia(iso: string | null) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : null;
}
function variacao(r: Row): number | null {
  const ok = r.tem_instagram && r.reach_prev > 0 && r.dias_com_dado >= 0.6 * r.dias_periodo && r.dias_com_dado_prev >= 0.6 * r.dias_periodo;
  return ok ? (r.reach - r.reach_prev) / r.reach_prev : null;
}
function fontesDe(r: Row): { fonte: Fonte; ult: string | null }[] {
  const out: { fonte: Fonte; ult: string | null }[] = [];
  if (r.tem_instagram) out.push({ fonte: "instagram", ult: r.ult_instagram });
  if (r.tem_anuncios) out.push({ fonte: "anuncios", ult: r.ult_anuncios });
  if (r.tem_crm) out.push({ fonte: "crm", ult: r.ult_crm });
  if (r.tem_atendimento) out.push({ fonte: "atendimento", ult: r.ult_atendimento });
  return out;
}
function alertasDe(r: Row): Alerta[] {
  if (r.em_onboarding) return [];
  const out: Alerta[] = [];
  for (const { fonte, ult } of fontesDe(r)) {
    const d = diasDesde(ult);
    if (d === null) {
      out.push({ chave: `coleta:${fonte}`, client: r, tipo: "coleta", fonte, titulo: `${FONTE_LABEL[fonte]}: fonte ligada, mas nunca chegou dado`, detalhe: `Quem resolve: ${FONTE_QUEM[fonte]}.`, pagina: FONTE_PAGINA[fonte] });
    } else if (d > DIAS_ATRASO) {
      out.push({ chave: `coleta:${fonte}`, client: r, tipo: "coleta", fonte, titulo: `${FONTE_LABEL[fonte]}: coleta parada há ${d} dias`, detalhe: `Último dado em ${fmtDia(ult)}. Quem resolve: ${FONTE_QUEM[fonte]}.`, pagina: FONTE_PAGINA[fonte] });
    }
  }
  const v = variacao(r);
  if (v !== null && v <= -0.25) {
    out.push({ chave: "queda", client: r, tipo: "queda", titulo: `Alcance caiu ${Math.abs(Math.round(v * 100))}% vs período anterior`, detalhe: `${fmtNum(r.reach)} agora contra ${fmtNum(r.reach_prev)} antes (${r.dias_com_dado} de ${r.dias_periodo} dias com dado).`, pagina: "" });
  }
  return out;
}
function statusDe(r: Row): Status {
  if (r.em_onboarding) return "onboarding";
  const a = alertasDe(r);
  if (a.some((x) => x.tipo === "coleta")) return "coleta";
  if (a.length) return "atencao";
  return "ok";
}
const STATUS_LABEL: Record<Status, string> = { ok: "OK", atencao: "Atenção", coleta: "Coleta parada", onboarding: "Em onboarding" };
const STATUS_CLS: Record<Status, string> = { ok: "good", atencao: "warn", coleta: "crit", onboarding: "" };
const STATUS_ORDEM: Record<Status, number> = { coleta: 0, atencao: 1, ok: 2, onboarding: 3 };

type Filtro = "todos" | "atencao" | "anuncios" | "crm" | "whatsapp" | "onboarding";
type Ordem = "atencao" | "alcance" | "variacao" | "seguidores" | "investimento" | "nome";

function Nd({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--muted)", fontSize: 11.5 }}>{children}</span>;
}

function Selo({ fonte, ult }: { fonte: string; ult: string | null }) {
  const d = diasDesde(ult);
  const velho = d === null || d > DIAS_ATRASO;
  return (
    <span className={`stat ${velho ? "crit" : ""}`} title={ult ? `${fonte}: último dado em ${ult}` : `${fonte}: sem nenhum dado`}>
      {fonte} {ult ? `até ${fmtDia(ult)}` : "sem dado"}
    </span>
  );
}

function Prioridades({ rows }: { rows: Row[] }) {
  const qc = useQueryClient();
  const { data: estados } = useQuery({
    queryKey: ["alert-state"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("alert_state").select("client_id, regra, estado, ate");
      if (error) return [] as { client_id: string; regra: string; estado: string; ate: string | null }[];
      return data as { client_id: string; regra: string; estado: string; ate: string | null }[];
    },
  });
  const mut = useMutation({
    mutationFn: async ({ a, estado }: { a: Alerta; estado: "resolvido" | "adiado" }) => {
      const ate = estado === "adiado" ? new Date(Date.now() + 7 * 86400000).toISOString() : null;
      const { error } = await (supabase as any)
        .from("alert_state")
        .upsert({ client_id: a.client.client_id, regra: a.chave, estado, ate, atualizado_em: new Date().toISOString() }, { onConflict: "client_id,regra" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alert-state"] }),
  });

  const escondidos = new Set(
    (estados ?? [])
      .filter((e) => e.estado === "resolvido" || (e.estado === "adiado" && e.ate && new Date(e.ate) > new Date()))
      .map((e) => `${e.client_id}|${e.regra}`),
  );
  const todos = rows.flatMap(alertasDe).filter((a) => !escondidos.has(`${a.client.client_id}|${a.chave}`));
  todos.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "coleta" ? -1 : 1));
  const search = useSearch({ from: "/_authenticated/admin/" });

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2>Prioridades desta semana</h2>
      <p className="sub">Coleta parada ou conexão quebrada primeiro, depois queda forte de alcance (±25% vs período anterior).</p>
      {todos.length === 0 ? (
        <p className="sub" style={{ marginTop: 12 }}>Nenhum sinal grave agora. Isso vale só para clientes com fonte ligada e dado suficiente no período.</p>
      ) : (
        <ul style={{ marginTop: 12, display: "grid", gap: 8, listStyle: "none", padding: 0 }}>
          {todos.slice(0, 12).map((a) => (
            <li key={`${a.client.client_id}-${a.chave}`} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <span className={`stat ${a.tipo === "coleta" ? "crit" : "warn"}`}>{a.tipo === "coleta" ? "Coleta" : "Queda"}</span>{" "}
                <b>{a.client.name}</b> — {a.titulo}
                <div className="sub">{a.detalhe}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Link to={`/$clientId${a.pagina}` as any} params={{ clientId: a.client.client_id } as any} search={search as any} className="btn pri">Abrir</Link>
                <button className="btn" disabled={mut.isPending} onClick={() => mut.mutate({ a, estado: "resolvido" })}>Resolvido</button>
                <button className="btn" disabled={mut.isPending} onClick={() => mut.mutate({ a, estado: "adiado" })}>Adiar 7 dias</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {todos.length > 12 && <p className="sub" style={{ marginTop: 8 }}>+ {todos.length - 12} sinais menores. Veja na tabela abaixo.</p>}
      {mut.isError && <p className="sub" style={{ color: "var(--crit)", marginTop: 8 }}>Não consegui gravar: {(mut.error as Error).message}</p>}
    </div>
  );
}

function AdminClientsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/admin" });
  const range = resolveDateRange(search);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [ordem, setOrdem] = useState<Ordem>("atencao");
  const [showAdmin, setShowAdmin] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portfolio-overview", range.start, range.end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portfolio_overview" as any, { p_start: range.start, p_end: range.end });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });
  const rows = data ?? [];

  const kpi = useMemo(() => {
    const comIg = rows.filter((r) => r.tem_instagram);
    const comAds = rows.filter((r) => r.tem_anuncios);
    return {
      ativos: rows.length,
      atencao: rows.filter((r) => ["coleta", "atencao"].includes(statusDe(r))).length,
      alcance: rows.reduce((a, r) => a + Number(r.reach), 0),
      nIg: comIg.length,
      seguidores: rows.reduce((a, r) => a + Number(r.new_followers), 0),
      gasto: rows.reduce((a, r) => a + Number(r.ad_spend), 0),
      nAds: comAds.length,
      resultados: rows.reduce((a, r) => a + Number(r.ad_conversas) + Number(r.ad_leads), 0),
      onb: rows.filter((r) => r.em_onboarding).length,
    };
  }, [rows]);

  const lista = useMemo(() => {
    const f = rows.filter((r) => {
      switch (filtro) {
        case "atencao": return ["coleta", "atencao"].includes(statusDe(r));
        case "anuncios": return r.tem_anuncios;
        case "crm": return r.tem_crm;
        case "whatsapp": return r.tem_atendimento;
        case "onboarding": return r.em_onboarding;
        default: return true;
      }
    });
    const key = (r: Row): number | string => {
      switch (ordem) {
        case "alcance": return -Number(r.reach);
        case "variacao": return variacao(r) ?? 9;
        case "seguidores": return -Number(r.new_followers);
        case "investimento": return -Number(r.ad_spend);
        case "nome": return r.name.toLowerCase();
        default: return STATUS_ORDEM[statusDe(r)] * 10 + (variacao(r) ?? 5);
      }
    };
    return [...f].sort((a, b) => {
      const ka = key(a), kb = key(b);
      return typeof ka === "string" ? ka.localeCompare(kb as string) : (ka as number) - (kb as number);
    });
  }, [rows, filtro, ordem]);

  const { data: clients } = useQuery({ queryKey: ["admin-clients"], queryFn: listAllClients });
  const inativos = (clients ?? []).filter((c) => !c.active);

  const FILTROS: [Filtro, string][] = [
    ["todos", "Todos"], ["atencao", "Precisam de atenção"], ["anuncios", "Com anúncios"],
    ["crm", "Com CRM"], ["whatsapp", "Com WhatsApp"], ["onboarding", "Em onboarding"],
  ];

  return (
    <div>
      <div className="hpagehead">
        <h2>Visão geral</h2>
        <p>Todos os clientes ativos num só lugar. Onde falta dado, o Hub diz qual fonte falta em vez de mostrar zero.</p>
      </div>
      <div style={{ marginBottom: 14 }}>
        <DateRangePicker value={search} onChange={(next) => navigate({ search: next, replace: true })} />
        <div className="sub" style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{formatRangeLabel(range)}</div>
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-dim)" }}>Carregando…</p>
      ) : error ? (
        <div className="hempty"><h2>Não consegui carregar o portfólio</h2><p>{(error as Error).message}</p></div>
      ) : (
        <>
          <div className="hgrid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
            <div className="card kpi"><span className="l">Clientes ativos</span><span className="v">{kpi.ativos}</span><small>{kpi.onb} em onboarding</small></div>
            <div className="card kpi"><span className="l">Precisam de atenção</span><span className="v">{kpi.atencao}</span><small>coleta parada ou queda forte de alcance</small></div>
            <div className="card kpi"><span className="l">Alcance somado</span><span className="v">{fmtNum(kpi.alcance)}</span><small>{kpi.nIg} de {kpi.ativos} clientes com Instagram ligado</small></div>
            <div className="card kpi"><span className="l">Seguidores ganhos</span><span className="v">{fmtNum(kpi.seguidores)}</span><small>no período, só quem tem Instagram</small></div>
            <div className="card kpi"><span className="l">Investimento em anúncios</span><span className="v">{fmtBRL(kpi.gasto)}</span><small>{kpi.nAds} clientes com conta de anúncios</small></div>
            <div className="card kpi"><span className="l">Conversas e leads dos anúncios</span><span className="v">{fmtNum(kpi.resultados)}</span><small>soma das conversas iniciadas e leads</small></div>
          </div>

          <Prioridades rows={rows} />

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center" }}>
              <div className="seg" role="group" aria-label="Filtro" style={{ flexWrap: "wrap" }}>
                {FILTROS.map(([k, l]) => (
                  <button key={k} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{l}</button>
                ))}
              </div>
              <label style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                Ordenar por{" "}
                <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="rounded-md border px-2 py-1" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  <option value="atencao">Atenção</option>
                  <option value="alcance">Alcance</option>
                  <option value="variacao">Variação</option>
                  <option value="seguidores">Seguidores</option>
                  <option value="investimento">Investimento</option>
                  <option value="nome">Nome</option>
                </select>
              </label>
            </div>
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="t" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th className="l">Cliente</th><th className="l">Status</th><th>Alcance</th><th>Tendência</th>
                    <th>Seguidores</th><th>Investimento</th><th>Anúncios</th><th>CRM</th><th className="l">Dados até</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((r) => {
                    const st = statusDe(r);
                    const v = variacao(r);
                    const fs = fontesDe(r);
                    return (
                      <tr key={r.client_id}>
                        <td className="l">
                          <Link to="/$clientId" params={{ clientId: r.client_id }} search={search}>{r.name}</Link>
                          <span className="sub2">{r.specialty ?? (r.instagram_handle ? `@${r.instagram_handle}` : "")}</span>
                        </td>
                        <td className="l"><span className={`stat ${STATUS_CLS[st]}`}>{STATUS_LABEL[st]}</span></td>
                        <td>
                          {r.tem_instagram ? (
                            <>
                              {fmtNum(r.reach)}
                              <span className="sub2">{v === null ? "variação: dado insuficiente" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}% vs anterior`}</span>
                            </>
                          ) : <Nd>sem Instagram ligado</Nd>}
                        </td>
                        <td>{r.tem_instagram ? <Sparkline values={(r.serie_alcance ?? []).map(Number)} /> : <Nd>—</Nd>}</td>
                        <td>
                          {r.tem_instagram ? (
                            <>+{fmtNum(r.new_followers)}<span className="sub2">{r.followers_atual != null ? `${fmtNum(r.followers_atual)} no total` : ""}</span></>
                          ) : <Nd>sem Instagram ligado</Nd>}
                        </td>
                        <td>{r.tem_anuncios ? fmtBRL(r.ad_spend) : <Nd>sem conta de anúncios</Nd>}</td>
                        <td>
                          {r.tem_anuncios ? (
                            Number(r.ad_conversas) + Number(r.ad_leads) > 0 ? (
                              <>
                                {Number(r.ad_conversas) > 0 && <span>{fmtNum(r.ad_conversas)} conversas</span>}
                                {Number(r.ad_leads) > 0 && <span className="sub2">{fmtNum(r.ad_leads)} leads</span>}
                              </>
                            ) : <Nd>{Number(r.ad_spend) > 0 ? "gasto sem conversa/lead registrado" : "sem gasto no período"}</Nd>
                          ) : <Nd>—</Nd>}
                        </td>
                        <td>
                          {r.tem_crm ? <>{fmtNum(r.crm_leads)}<span className="sub2">leads na base</span></>
                            : r.tem_atendimento ? <Nd>só WhatsApp, sem CRM</Nd> : <Nd>sem CRM ligado</Nd>}
                        </td>
                        <td className="l" style={{ whiteSpace: "normal" }}>
                          {fs.length === 0 ? <Nd>nenhuma fonte ligada</Nd> : (
                            <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                              {fs.map((f) => <Selo key={f.fonte} fonte={FONTE_LABEL[f.fonte]} ult={f.ult} />)}
                            </span>
                          )}
                        </td>
                        <td><Link to="/admin/$clientId" params={{ clientId: r.client_id }} style={{ color: "var(--accent)" }}>Gerenciar →</Link></td>
                      </tr>
                    );
                  })}
                  {lista.length === 0 && (
                    <tr><td colSpan={10} className="l" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>Nenhum cliente neste filtro.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="card">
        <button className="btn" onClick={() => setShowAdmin((v) => !v)} aria-expanded={showAdmin}>
          {showAdmin ? "Esconder administração" : "Administração: novo cliente / novo admin"}
        </button>
        {showAdmin && (
          <div style={{ marginTop: 14 }}>
            <NewAdminForm />
            <NewClientForm />
            {inativos.length > 0 && (
              <p className="sub">
                Clientes inativos (fora da visão geral):{" "}
                {inativos.map((c, i) => (
                  <span key={c.id}>{i > 0 && ", "}<Link to="/admin/$clientId" params={{ clientId: c.id }} style={{ color: "var(--accent)" }}>{c.name}</Link></span>
                ))}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
