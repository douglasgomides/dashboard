import { ehNegocioProprio } from "@/lib/negocio-proprio";
import { useState, type FormEvent } from "react";
import { Carregando } from "@/components/sem-fonte";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAdminUser, createClient, listAllClients } from "@/lib/admin-data";
import { ClientAvatar } from "@/components/client-avatar";
import { supabase } from "@/integrations/supabase/client";
import { getQualidadeDados, getRoiPeriodo } from "@/lib/client-data";
import { montarRoi, resumoRoi, type Roi } from "@/lib/roi";
import { resolveDateRange } from "@/lib/date-range";
import { getSapPorCliente } from "@/lib/sap-data";
import { lerStatusDasFontes, type FontesDoCliente } from "@/lib/saude-fontes";
import { notaDasFontes, ROTULO_FAIXA, type NotaFontes } from "@/lib/nota-fontes";
import { FONTES, NOME_FONTE, LEGENDA_STATUS, VAR_COR, type FonteId } from "@/lib/status-fonte";
import { ArrowRight, UserX } from "lucide-react";
import { saudeDaFonte, CelulaSaude, SeloStatus, type SaudeFonte } from "@/components/source-health";
import { useQualidadeDados } from "@/components/qualidade-dados";
import { LinksSemCliente } from "@/components/links-shortio";
import { SeloDono } from "@/components/selo-dono";
import { PainelSaudeFontes } from "@/components/painel-saude-fontes";
import { montarProblemasFontes } from "@/lib/saude-problemas";
import { SemRespostaAgora } from "@/components/sem-resposta-agora";


export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminClientsPage,
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
        <input autoComplete="off"
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
        <input autoComplete="off"
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
        <input autoComplete="off"
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
        <input autoComplete="off"
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
        <input autoComplete="off"
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

const FLAG_FONTE: Record<FonteId, "tem_instagram" | "tem_anuncios" | "tem_crm" | "tem_atendimento"> = {
  instagram: "tem_instagram",
  anuncios: "tem_anuncios",
  crm: "tem_crm",
  atendimento: "tem_atendimento",
};

/** Saúde das 4 fontes de um cliente pela regra única (status-fonte.ts). */
function saudesDoCliente(sd: FontesDoCliente | undefined): Record<FonteId, SaudeFonte> | null {
  if (!sd) return null;
  const out = {} as Record<FonteId, SaudeFonte>;
  for (const f of FONTES) out[f] = saudeDaFonte(sd.cadastro[FLAG_FONTE[f]], sd.linhas.find((l) => l.fonte === f), sd.naoUsa.includes(f));
  return out;
}

// Uma linha da tabela: as quatro fontes do cliente e até que dia cada uma tem dado.
function LinhaSaude({ clientId, saude }: { clientId: string; saude: Record<FonteId, SaudeFonte> | null }) {
  if (!saude) {
    return (
      <td colSpan={4} className="px-4 py-2 text-xs" style={{ color: "var(--text-faint)" }}>
        Lendo as fontes…
      </td>
    );
  }
  const conectar = (
    <Link to="/admin/$clientId" params={{ clientId }} className="inline-flex min-h-[32px] items-center whitespace-nowrap rounded-lg px-3 text-xs font-bold text-white" style={{ background: "var(--crit)" }}>
      Conectar agora →
    </Link>
  );
  return (
    <>
      <td className="px-4 py-3 align-top" data-label="Instagram"><CelulaSaude s={saude.instagram} conectar={conectar} /></td>
      <td className="px-4 py-3 align-top" data-label="Anúncios"><CelulaSaude s={saude.anuncios} conectar={conectar} /></td>
      <td className="px-4 py-3 align-top" data-label="CRM"><CelulaSaude s={saude.crm} conectar={conectar} /></td>
      <td className="px-4 py-3 align-top" data-label="WhatsApp"><CelulaSaude s={saude.atendimento} opcional="Só liga se a clínica usa WhatsApp com API (WTS)." /></td>
    </>
  );
}

// Nota de saúde das fontes, com o porquê no title e em texto curto.
function CelulaNota({ n }: { n: NotaFontes | null }) {
  if (!n) return <span className="text-xs" style={{ color: "var(--muted)" }}>…</span>;
  if (n.nota === null) return <span className="text-xs" style={{ color: "var(--muted)" }}>sem fonte ligada</span>;
  const cor = VAR_COR[n.cor];
  return (
    <div title={n.motivos.length ? `Por que não é 100:\n${n.motivos.join("\n")}` : "Todas as fontes em dia, sem problema de dado"}>
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-lg font-bold tabular-nums" style={{ color: cor }}>{n.nota}</span>
        <span className="text-xs font-semibold" style={{ color: cor }}>{ROTULO_FAIXA[n.faixa!]}</span>
      </div>
      {n.motivos[0] && <div className="mt-0.5 max-w-[180px] text-xs" style={{ color: "var(--text-dim)" }}>{n.motivos[0]}{n.motivos.length > 1 ? ` +${n.motivos.length - 1}` : ""}</div>}
    </div>
  );
}

// Contagem de "dado com erro" (qualidade_dados) do cliente, com os títulos no title.
function ChipQualidade({ clientId }: { clientId: string }) {
  const { data } = useQualidadeDados(clientId);
  if (!data?.length) return null;
  const altas = data.filter((p) => p.severidade === "alta").length;
  return (
    <div className="mt-1 text-xs font-semibold" style={{ color: altas ? "var(--crit)" : "var(--warn)" }} title={data.map((p) => p.titulo).join("\n")}>
      {data.length} {data.length === 1 ? "dado com erro" : "dados com erro"}{altas ? ` · ${altas} afeta${altas === 1 ? "" : "m"} a leitura` : ""}
    </div>
  );
}

function AdminClientsPage() {
  const { data: clients, isLoading } = useQuery({
    queryKey: ["admin-clients"],
    queryFn: listAllClients,
  });
  // @ do Instagram da conta ligada, para quando o cadastro do cliente não traz.
  const { data: contasIg } = useQuery({
    queryKey: ["admin-ig-handles"],
    queryFn: async () => {
      const { data } = await supabase.from("instagram_accounts").select("client_id, ig_username").eq("active", true);
      return new Map((data ?? []).map((r) => [r.client_id, r.ig_username as string | null]));
    },
  });

  // Status de todas as fontes de todos os clientes numa leitura só, pela regra única (src/lib/status-fonte.ts).
  const { data: sapPorCliente } = useQuery({ queryKey: ["sap-por-cliente"], queryFn: getSapPorCliente, staleTime: 5 * 60_000, retry: false });
  const statusQ = useQuery({ queryKey: ["status-das-fontes"], queryFn: lerStatusDasFontes, staleTime: 60_000, retry: false });
  const saudePorCliente = new Map<string, Record<FonteId, SaudeFonte> | null>((clients ?? []).map((c) => [c.id, saudesDoCliente(statusQ.data?.get(c.id))]));
  const carregandoSaude = statusQ.isLoading;

  // Alerta do topo: TODAS as fontes vermelhas, agrupadas por cliente, com o motivo.
  const vermelhas = (clients ?? [])
    .map((c) => {
      const sd = saudePorCliente.get(c.id);
      const itens = sd ? FONTES.filter((f) => sd[f].status.cor === "vermelho").map((f) => ({ fonte: f, s: sd[f] })) : [];
      return { c, itens };
    })
    .filter((x) => x.itens.length > 0);
  const totalVermelhas = vermelhas.reduce((n, x) => n + x.itens.length, 0);

  // Médico sem login: nenhum usuário do cliente além da equipe (admins).
  const { data: logins } = useQuery({
    queryKey: ["admin-logins-por-cliente"],
    queryFn: async () => {
      const [{ data: membros }, { data: admins }] = await Promise.all([
        supabase.from("client_members").select("client_id, user_id, role"),
        (supabase as any).from("app_admins").select("user_id"),
      ]);
      const equipe = new Set(((admins ?? []) as { user_id: string }[]).map((a) => a.user_id));
      const n = new Map<string, number>();
      for (const m of membros ?? []) if (!equipe.has(m.user_id)) n.set(m.client_id, (n.get(m.client_id) ?? 0) + 1);
      return n;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const semLogin = (id: string) => !!logins && !logins.get(id) && !ehNegocioProprio(id);

  // ROI dos últimos 30 dias por cliente (mesma regra do bloco "Retorno do investimento" do Resultado).
  const ult30 = resolveDateRange({ preset: "30d" });
  const rois = useQueries({
    queries: (clients ?? []).map((c) => ({
      queryKey: ["roi-periodo", c.id, ult30.start, ult30.end],
      queryFn: () => getRoiPeriodo(c.id, ult30.start, ult30.end),
      staleTime: 10 * 60_000,
      retry: false,
    })),
  });
  const roiDe = (id: string): Roi | null => {
    const i = (clients ?? []).findIndex((c) => c.id === id);
    const d = i >= 0 ? rois[i]?.data : null;
    return d ? montarRoi(d) : null;
  };
  const semRoi = (id: string) => {
    const r = roiDe(id);
    return !!r && !r.calculavel;
  };

  // Filtros e ordenação da tabela.
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "problema" | "sem_roi" | "sem_login">("todos");
  const [ordem, setOrdem] = useState<"pior" | "nota" | "nome">("pior");
  const piorPeso = (id: string) => {
    const sd = saudePorCliente.get(id);
    return sd ? Math.max(...FONTES.map((f) => sd[f].status.peso)) : 0;
  };
  const casaFiltro = (c: { id: string; name: string; specialty?: string | null; instagram_handle?: string | null }) => {
    const t = busca.trim().toLowerCase();
    const texto = !t || [c.name, c.specialty, c.instagram_handle, contasIg?.get(c.id)].some((x) => (x ?? "").toLowerCase().includes(t));
    if (!texto) return false;
    if (filtro === "problema") return piorPeso(c.id) >= 2; // amarelo ou vermelho
    if (filtro === "sem_login") return semLogin(c.id);
    if (filtro === "sem_roi") return semRoi(c.id);
    return true;
  };
  // Problemas de dado (qualidade_dados) por cliente: mesma chave do ChipQualidade, então a leitura é compartilhada.
  const qualidades = useQueries({
    queries: (clients ?? []).map((c) => ({
      queryKey: ["qualidade-dados", c.id],
      queryFn: () => getQualidadeDados(c.id),
      staleTime: 10 * 60_000,
      retry: false,
    })),
  });
  const problemas = montarProblemasFontes(
    (clients ?? []).flatMap((c, i) => {
      const s = statusQ.data?.get(c.id);
      return s ? [{ id: c.id, nome: c.name, fontes: s.fontes, linhas: s.linhas, naoUsa: s.naoUsa, qualidade: qualidades[i]?.data ?? [] }] : [];
    }),
  );
  // Nota de saúde das fontes (0 a 100): status de cada fonte + problemas de dado (src/lib/nota-fontes.ts).
  const notaPorCliente = new Map<string, NotaFontes | null>(
    (clients ?? []).map((c, i) => {
      const sd = saudePorCliente.get(c.id);
      if (!sd) return [c.id, null];
      const st = Object.fromEntries(FONTES.map((f) => [f, sd[f].status]));
      return [c.id, notaDasFontes(st, qualidades[i]?.data ?? [])];
    }),
  );
  const valorNota = (id: string) => notaPorCliente.get(id)?.nota ?? 101;
  const linhasTabela = (clients ?? [])
    .filter(casaFiltro)
    .sort((x, y) =>
      ordem === "nome"
        ? x.name.localeCompare(y.name, "pt-BR")
        : ordem === "nota"
          ? valorNota(x.id) - valorNota(y.id) || x.name.localeCompare(y.name, "pt-BR")
          : piorPeso(y.id) - piorPeso(x.id) || x.name.localeCompare(y.name, "pt-BR"),
    );
  const chipFiltro = (id: typeof filtro, rot: string, n?: number) => (
    <button
      type="button"
      onClick={() => setFiltro(id)}
      aria-pressed={filtro === id}
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-sm font-medium"
      style={{ borderColor: filtro === id ? "var(--accent)" : "var(--border)", background: filtro === id ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "var(--surface)", color: filtro === id ? "var(--accent)" : "var(--ink-2)" }}
    >
      {rot}
      {n != null && <span className="tabular-nums" style={{ color: "var(--muted)" }}>{n}</span>}
    </button>
  );

  return (
    <div>
      {/* Dois produtos: clínica nova entra pelo Sistema de Aquisição; o Hub é o acompanhamento contínuo. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm" style={{ borderColor: "color-mix(in srgb, #C49A5C 45%, var(--border))", background: "color-mix(in srgb, #C49A5C 6%, var(--surface))" }}>
        <span>
          <strong>Clínica nova entra pelo Sistema de Aquisição.</strong>{" "}
          <span style={{ color: "var(--text-dim)" }}>Aqui ficam os clientes em acompanhamento: quem já estava com a Doctor Creator e quem terminou os 90 dias.{sapPorCliente?.size ? ` ${sapPorCliente.size} cliente(s) também no SAP, com o selo dourado.` : ""}</span>
        </span>
        <Link to="/sap" className="inline-flex min-h-[38px] items-center rounded-lg px-3 font-semibold text-white" style={{ background: "#C49A5C" }}>Cadastrar clínica nova no SAP →</Link>
      </div>
      <SemRespostaAgora />
      {statusQ.isError && (
        <p className="mb-3 text-sm" style={{ color: "var(--crit)" }}>
          Não consegui ler o status das fontes agora. Tente de novo em instantes.
        </p>
      )}
      {!carregandoSaude && statusQ.data && (
        <div className="mb-3 rounded-xl border p-3 text-sm" style={{ borderColor: totalVermelhas ? "var(--crit)" : "var(--border)", background: "var(--surface)" }}>
          {totalVermelhas === 0 ? (
            <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "var(--good)" }}>
              Nenhuma fonte vermelha: tudo ligado tem dado de até 3 dias atrás e nenhuma atualização deu erro.
            </span>
          ) : (
            <>
              <strong style={{ color: "var(--crit)" }}>
                {totalVermelhas} fonte{totalVermelhas === 1 ? "" : "s"} em vermelho (mais de 3 dias sem dado ou erro) em {vermelhas.length} cliente{vermelhas.length === 1 ? "" : "s"}
              </strong>
              <ul className="mt-2 space-y-2 pl-0" style={{ listStyle: "none" }}>
                {vermelhas.map(({ c, itens }) => (
                  <li key={c.id}>
                    <Link to="/admin/$clientId" params={{ clientId: c.id }} className="font-semibold" style={{ color: "var(--ink)" }}>
                      {c.name}
                    </Link>
                    <ul className="mt-0.5 space-y-0.5 pl-4" style={{ listStyle: "none" }}>
                      {itens.map(({ fonte, s }) => (
                        <li key={fonte} className="text-[13px]" style={{ color: "var(--ink-2)" }}>
                          <SeloStatus st={s.status} texto={`${NOME_FONTE[fonte]}: ${s.status.rotulo.toLowerCase()}`} /> · {s.status.data ? s.status.detalhe : "sem dado gravado"}
                          {s.causa && <div className="text-xs" style={{ color: "var(--muted)" }}>{s.causa}</div>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      <PainelSaudeFontes
        problemas={problemas}
        clientes={clients ?? []}
        carregando={isLoading || carregandoSaude || qualidades.some((q) => q.isLoading)}
        lidos={statusQ.data ? (clients ?? []).length : 0}
        total={(clients ?? []).length}
        falhas={statusQ.isError ? (clients ?? []).length : 0}
      />
      <div className="mb-2 flex flex-wrap items-center gap-2" aria-label="Legenda das cores">
        {LEGENDA_STATUS.map((l) => (
          <span key={l.cor} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--ink-2)" }}>
            <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: VAR_COR[l.cor] }} /> {l.texto}
          </span>
        ))}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          autoComplete="off"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente por nome, especialidade ou @"
          aria-label="Buscar cliente"
          className="min-h-[40px] w-full max-w-sm rounded-lg border px-3 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        />
        {chipFiltro("todos", "Todos", (clients ?? []).length)}
        {chipFiltro("problema", "Com problema", (clients ?? []).filter((c) => piorPeso(c.id) >= 2).length)}
        {chipFiltro("sem_roi", "Sem ROI", rois.every((q) => !q.isLoading) ? (clients ?? []).filter((c) => semRoi(c.id)).length : undefined)}
        {chipFiltro("sem_login", "Sem login", logins ? (clients ?? []).filter((c) => semLogin(c.id)).length : undefined)}
        <label className="ml-auto inline-flex min-h-[40px] items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
          Ordenar por
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} className="min-h-[36px] rounded-lg border px-2 text-sm" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <option value="pior">Pior status</option>
            <option value="nota">Nota das fontes (menor primeiro)</option>
            <option value="nome">Nome</option>
          </select>
        </label>
      </div>
      {isLoading ? (
        <Carregando texto="Lendo os clientes…" />
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm empilha">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--ink-2)", background: "var(--surface-2)" }}>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2" title="0 a 100: fontes em dia, fontes por ligar e problemas de dado">Nota</th>
                <th className="px-4 py-2">Instagram</th>
                <th className="px-4 py-2">Anúncios</th>
                <th className="px-4 py-2">CRM</th>
                <th className="px-4 py-2">WhatsApp</th>
                <th className="px-4 py-2" title="Retorno do investimento dos últimos 30 dias">ROI (30 dias)</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {linhasTabela.map((c) => {
                const handle = c.instagram_handle || contasIg?.get(c.id) || null;
                return (
                  <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-3 align-top font-medium" data-label="Cliente">
                      <div className="flex items-center gap-3">
                        <ClientAvatar nome={c.name} url={c.avatar_url} tamanho={36} />
                        <div>
                          <div>{c.name}</div>
                          <div className="text-xs font-normal" style={{ color: "var(--text-dim)" }}>
                            {[c.specialty, handle ? `@${handle}` : null].filter(Boolean).join(" · ") || "sem especialidade nem Instagram"}
                          </div>
                          {sapPorCliente?.get(c.id) && (() => {
                            const sp = sapPorCliente.get(c.id)!;
                            const txt = sp.dia === null ? "SAP · sem D0" : sp.dia > 90 ? "Terminou o SAP · acompanhamento" : sp.dia < 0 ? `SAP · começa em ${-sp.dia} dia(s)` : `SAP · D${sp.dia} de 90`;
                            return (
                              <Link to="/sap/$clientId/painel" params={{ clientId: c.id }} className="mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "color-mix(in srgb, #C49A5C 18%, transparent)", color: "#8a6a35" }} title="Abrir no Sistema de Aquisição">
                                {txt}
                              </Link>
                            );
                          })()}
                          {semLogin(c.id) && (
                            <Link to="/admin/$clientId" params={{ clientId: c.id }} hash="acesso" className="mt-1 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--warn)" }} title="Nenhum usuário do cliente tem acesso ao painel (só a equipe). Clique para dar acesso.">
                              <UserX size={13} aria-hidden /> Médico sem login · dar acesso
                            </Link>
                          )}
                          <ChipQualidade clientId={c.id} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top" data-label="Nota das fontes"><CelulaNota n={notaPorCliente.get(c.id) ?? null} /></td>
                    <LinhaSaude clientId={c.id} saude={saudePorCliente.get(c.id) ?? null} />
                    <td className="px-4 py-3 align-top" data-label="ROI (30 dias)">
                      {(() => {
                        const r = roiDe(c.id);
                        if (!r) return <span className="text-xs" style={{ color: "var(--muted)" }}>…</span>;
                        const cor = r.calculavel ? (r.roi! >= 0 ? "var(--good)" : "var(--crit)") : "var(--warn)";
                        return (
                          <Link to="/$clientId" params={{ clientId: c.id }} search={{ preset: "30d" }} className="whitespace-nowrap text-sm font-semibold" style={{ color: cor }} title={r.itens.filter((i) => !i.feito).map((i) => `Falta: ${i.preciso}`).join("\n") || "Ver o retorno no Resultado"}>
                            {resumoRoi(r)}
                          </Link>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-right align-top" data-label="">
                      <Link
                        to="/admin/$clientId"
                        params={{ clientId: c.id }}
                        className="inline-flex min-h-[36px] items-center gap-1 whitespace-nowrap rounded-lg border px-3 text-sm font-semibold"
                        style={{ color: "var(--accent)", borderColor: "var(--border)" }}
                        title="Gerenciar fontes e acesso"
                      >
                        Gerenciar <ArrowRight size={14} aria-hidden />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {(clients ?? []).length > 0 && linhasTabela.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center" style={{ color: "var(--text-dim)" }}>
                    Nenhum cliente com esse filtro.{" "}
                    <button type="button" className="font-semibold" style={{ color: "var(--accent)" }} onClick={() => { setBusca(""); setFiltro("todos"); }}>Limpar</button>
                  </td>
                </tr>
              )}
              {(clients ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center" style={{ color: "var(--text-dim)" }}>
                    Nenhum cliente cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6">
        <LinksSemCliente clientes={[...(clients ?? [])].filter((c: any) => c.active !== false).sort((x: any, y: any) => x.name.localeCompare(y.name))} />
      </div>
      <details className="mt-6">
        <summary className="cursor-pointer select-none py-1 text-sm font-medium">Cadastrar admin ou cliente só do Nexo (exceção)</summary>
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Clínica nova entra pelo Sistema de Aquisição. Use o cadastro abaixo só para cliente que não vai passar pelo programa.</p>
        <div className="mt-3">
          <NewAdminForm />
          <NewClientForm />
        </div>
      </details>
    </div>
  );
}
