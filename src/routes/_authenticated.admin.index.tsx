import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAdminUser, createClient, listAllClients } from "@/lib/admin-data";
import { ClientAvatar } from "@/components/client-avatar";
import { supabase } from "@/integrations/supabase/client";
import { getClientFontes } from "@/lib/client-data";
import { statusDoCliente, tomDaFonte, ddmm, diasDeAtraso, type LinhaFonte } from "@/lib/saude-fontes";
import { motivoDaLinha, ROTULO_DONO, type Dono } from "@/lib/motivos";
import { SeloDono } from "@/components/selo-dono";


function LinhaMotivo({ texto, motivo }: { texto: string; motivo: ReturnType<typeof motivoDaLinha> }) {
  return (
    <li>
      <div className="flex flex-wrap items-center gap-2">
        <span style={{ color: "var(--text)" }}>{texto}</span>
        {motivo && <SeloDono dono={motivo.dono} />}
      </div>
      {motivo && (
        <div className="text-xs" style={{ color: "var(--text-dim)" }}>
          {motivo.texto}
        </div>
      )}
    </li>
  );
}

// "Quantas são realmente nossas?": é a resposta à pergunta "o sync está quebrado?".
function ResumoDonos({ itens }: { itens: { motivo: ReturnType<typeof motivoDaLinha> }[] }) {
  const cont: Record<Dono, number> = { cliente: 0, meta: 0, origem: 0, nos: 0 };
  let semMotivo = 0;
  for (const i of itens) i.motivo ? cont[i.motivo.dono]++ : semMotivo++;
  const partes = (Object.keys(cont) as Dono[]).filter((d) => cont[d] > 0).map((d) => `${cont[d]} ${ROTULO_DONO[d].toLowerCase()}`);
  if (semMotivo > 0) partes.push(`${semMotivo} sem motivo identificado`);
  return (
    <p className="mt-2 text-xs" style={{ color: "var(--text-faint)" }}>
      Resumo: {partes.join(" · ")}.
    </p>
  );
}

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

const COR_TOM: Record<string, string> = {
  bom: "var(--good)",
  atencao: "var(--warn, #b7791f)",
  ruim: "var(--danger)",
  neutro: "var(--text-faint)",
};

function Chip({ ligado, linha, erro }: { ligado: boolean; linha?: LinhaFonte; erro?: boolean }) {
  if (!ligado) {
    return (
      <span title="Fonte não ligada a este cliente" style={{ color: "var(--text-faint)" }}>
        não ligado
      </span>
    );
  }
  const tom = tomDaFonte(linha);
  const texto = linha?.data_ate ? `até ${ddmm(linha.data_ate)}` : "sem dado";
  return (
    <span style={{ color: COR_TOM[tom], fontWeight: 600 }} title={erro ? "Erro na última tentativa" : undefined}>
      {tom === "ruim" ? "● " : tom === "atencao" ? "◐ " : tom === "bom" ? "✓ " : ""}
      {texto}
    </span>
  );
}

async function lerSaude(clientId: string) {
  const [fontes, linhas] = await Promise.all([getClientFontes(clientId).catch(() => null), statusDoCliente(clientId)]);
  return { fontes, linhas };
}

const ROTULO_FONTE: Record<string, string> = { instagram: "Instagram", anuncios: "Anúncios", crm: "CRM", atendimento: "WhatsApp" };
const FLAG_FONTE: Record<string, "tem_instagram" | "tem_anuncios" | "tem_crm" | "tem_atendimento"> = {
  instagram: "tem_instagram",
  anuncios: "tem_anuncios",
  crm: "tem_crm",
  atendimento: "tem_atendimento",
};

// Uma linha da Visão geral: as quatro fontes do cliente e até que dia cada uma tem dado.
function LinhaSaude({ clientId }: { clientId: string }) {
  const { data } = useQuery({
    queryKey: ["saude-cliente", clientId],
    queryFn: () => lerSaude(clientId),
    staleTime: 60_000,
    retry: false,
  });
  const f = data?.fontes;
  const por = (nome: string) => data?.linhas.find((l) => l.fonte === nome);
  if (!data) {
    return (
      <td colSpan={4} className="px-4 py-2 text-xs" style={{ color: "var(--text-faint)" }}>
        Lendo as fontes…
      </td>
    );
  }
  return (
    <>
      <td className="px-4 py-2 text-xs"><Chip ligado={!!f?.tem_instagram} linha={por("instagram")} /></td>
      <td className="px-4 py-2 text-xs"><Chip ligado={!!f?.tem_anuncios} linha={por("anuncios")} /></td>
      <td className="px-4 py-2 text-xs"><Chip ligado={!!f?.tem_crm} linha={por("crm")} /></td>
      <td className="px-4 py-2 text-xs"><Chip ligado={!!f?.tem_atendimento} linha={por("atendimento")} /></td>
    </>
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

  // Alerta na própria tela: fontes ligadas e paradas há mais de 3 dias (ou com erro), de todos os clientes.
  const saudes = useQueries({
    queries: (clients ?? []).map((c) => ({
      queryKey: ["saude-cliente", c.id],
      queryFn: () => lerSaude(c.id),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const paradas: { texto: string; motivo: ReturnType<typeof motivoDaLinha> }[] = [];
  // Dado em dia, mas a última tentativa de atualizar deu erro: não é "parada", é um erro a olhar.
  const comErro: { texto: string; motivo: ReturnType<typeof motivoDaLinha> }[] = [];
  (clients ?? []).forEach((c, i) => {
    const s = saudes[i]?.data;
    if (!s) return;
    for (const l of s.linhas) {
      const flag = FLAG_FONTE[l.fonte];
      if (!flag || !s.fontes?.[flag]) continue;
      if (tomDaFonte(l) !== "ruim") continue;
      const velho = l.data_ate ? diasDeAtraso(l.data_ate) > 3 : false;
      if (velho || (!l.data_ate && !l.last_error)) {
        paradas.push({ texto: `${c.name}: ${ROTULO_FONTE[l.fonte]} ${l.data_ate ? `até ${ddmm(l.data_ate)}` : "sem dado"}`, motivo: motivoDaLinha(l) });
      } else {
        const erro = (l.last_error ?? "").replace(/\s+/g, " ").slice(0, 90);
        comErro.push({ texto: `${c.name}: ${ROTULO_FONTE[l.fonte]}${l.data_ate ? ` (dado até ${ddmm(l.data_ate)})` : ""}`, motivo: motivoDaLinha(l) ?? { texto: erro, dono: "nos" } });
      }
    }
  });
  const carregandoSaude = saudes.some((q) => q.isLoading);

  return (
    <div>
      {!carregandoSaude && (
        <div
          className="mb-3 rounded-xl border p-3 text-sm"
          style={{ borderColor: paradas.length || comErro.length ? "var(--danger)" : "var(--border)", background: "var(--surface)" }}
        >
          {paradas.length === 0 && comErro.length === 0 ? (
            <span style={{ color: "var(--good)", fontWeight: 600 }}>Todas as fontes ligadas estão com dado de até 3 dias atrás.</span>
          ) : (
            <>
              {paradas.length > 0 && (
                <>
                  <strong style={{ color: "var(--danger)" }}>
                    {paradas.length} fonte{paradas.length === 1 ? "" : "s"} sem dado novo há mais de 3 dias
                  </strong>
                  <ul className="mt-1 space-y-1.5 pl-0" style={{ color: "var(--text-dim)", listStyle: "none" }}>
                    {paradas.map((p) => (
                      <LinhaMotivo key={p.texto} {...p} />
                    ))}
                  </ul>
                  <ResumoDonos itens={[...paradas, ...comErro]} />
                </>
              )}
              {comErro.length > 0 && (
                <div className={paradas.length > 0 ? "mt-3" : ""}>
                  <strong style={{ color: "var(--warn-text, var(--text))" }}>
                    {comErro.length} fonte{comErro.length === 1 ? "" : "s"} com dado em dia, mas com erro na última atualização
                  </strong>
                  <ul className="mt-1 space-y-1.5 pl-0" style={{ color: "var(--text-dim)", listStyle: "none" }}>
                    {comErro.map((p) => (
                      <LinhaMotivo key={p.texto} {...p} />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
      <p className="mb-3 text-sm" style={{ color: "var(--text-dim)" }}>
        Visão geral: até que dia cada fonte de cada cliente tem dado. Verde: em dia. Amarelo: 2 a 3 dias parado.
        Vermelho: mais de 3 dias parado ou com erro. "Não ligado" quer dizer que o cliente não tem aquela fonte.
      </p>
      {isLoading ? (
        <p style={{ color: "var(--text-dim)" }}>Carregando…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">Instagram</th>
                <th className="px-4 py-2">Anúncios</th>
                <th className="px-4 py-2">CRM</th>
                <th className="px-4 py-2">WhatsApp</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(clients ?? []).map((c) => {
                const handle = c.instagram_handle || contasIg?.get(c.id) || null;
                return (
                  <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-4 py-2 font-medium">
                      <div className="flex items-center gap-3">
                        <ClientAvatar nome={c.name} url={c.avatar_url} tamanho={36} />
                        <div>
                          <div>{c.name}</div>
                          <div className="text-xs font-normal" style={{ color: "var(--text-dim)" }}>
                            {[c.specialty, handle ? `@${handle}` : null].filter(Boolean).join(" · ") || "sem especialidade nem Instagram"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <LinhaSaude clientId={c.id} />
                    <td className="px-4 py-2 text-right">
                      <Link to="/admin/$clientId" params={{ clientId: c.id }} style={{ color: "var(--accent)" }}>
                        Gerenciar →
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {(clients ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center" style={{ color: "var(--text-dim)" }}>
                    Nenhum cliente cadastrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <details className="mt-6">
        <summary className="cursor-pointer select-none py-1 text-sm font-medium">Cadastrar admin ou cliente</summary>
        <div className="mt-3">
          <NewAdminForm />
          <NewClientForm />
        </div>
      </details>
    </div>
  );
}
