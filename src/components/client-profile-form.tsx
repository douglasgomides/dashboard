import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Trash2 } from "lucide-react";
import { removeClientAvatar, updateClientAvatar, updateClientProfile, uploadClientAvatar, type ClientProfileInput } from "@/lib/admin-data";
import { ClientAvatar } from "@/components/client-avatar";
import type { CfmScoreStatus, Tables } from "@/integrations/supabase/types";

const CFM_OPCOES: { value: CfmScoreStatus | ""; label: string }[] = [
  { value: "", label: "Sem avaliação" },
  { value: "verde", label: "Verde — em conformidade" },
  { value: "amarelo", label: "Amarelo — pontos de atenção" },
  { value: "vermelho", label: "Vermelho — risco" },
];

// O que o formulário grava é string; o banco quer null para "vazio", senão
// fica string vazia e a tela mostra " · @" solto no cabeçalho.
function ouNulo(v: string): string | null {
  const t = v.trim();
  return t.length ? t : null;
}

function Campo({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      <label className="block text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

const estiloInput: React.CSSProperties = {
  background: "var(--surface-2)",
  borderColor: "var(--border)",
  color: "var(--text)",
};

// O token do WTS não chega ao navegador (getClient usa colunas explícitas), por isso fica fora do tipo.
// Só as colunas que getClient entrega (sem tokens e segredos da tabela clients).
type ClienteDoPerfil = Pick<Tables<"clients">, "id" | "name" | "specialty" | "instagram_handle" | "cfm_score_status" | "active" | "created_at" | "meta_ad_account_id" | "wts_company_id" | "avatar_url" | "wts_department_ids" | "em_onboarding">;

export function ClientProfileForm({ client }: { client: ClienteDoPerfil }) {
  // A new client gets a new form; refetching its avatar preserves unsaved fields.
  return <ClientProfileEditor key={client.id} client={client} />;
}

function ClientProfileEditor({ client }: { client: ClienteDoPerfil }) {
  const queryClient = useQueryClient();
  const arquivoRef = useRef<HTMLInputElement>(null);

  const [nome, setNome] = useState(client.name);
  const [especialidade, setEspecialidade] = useState(client.specialty ?? "");
  const [instagram, setInstagram] = useState(client.instagram_handle ?? "");
  const [avatar, setAvatar] = useState(client.avatar_url ?? "");
  const [contaAds, setContaAds] = useState(client.meta_ad_account_id ?? "");
  // Contas de anúncio realmente ligadas (client_ad_accounts): é por elas que o sync lê os anúncios.
  const { data: contasLigadas } = useQuery({
    queryKey: ["contas-anuncio-ligadas", client.id],
    queryFn: async () => {
      const { data } = await supabase.from("client_ad_accounts").select("ad_account_id, name, active").eq("client_id", client.id).order("active", { ascending: false });
      return (data ?? []) as { ad_account_id: string; name: string | null; active: boolean }[];
    },
    staleTime: 60_000,
  });
  const [contaWts, setContaWts] = useState(client.wts_company_id ?? "");
  const [cfm, setCfm] = useState<CfmScoreStatus | "">(client.cfm_score_status ?? "");
  const [ativo, setAtivo] = useState(client.active);
  const [recado, setRecado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  const salvar = useMutation({
    mutationFn: (input: ClientProfileInput) => updateClientProfile(client.id, input),
    onSuccess: async () => {
      setRecado("Perfil salvo.");
      setErro(null);
      await queryClient.invalidateQueries({ queryKey: ["client", client.id] });
      await queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    },
    onError: (e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível salvar o perfil. Verifique sua conexão e tente novamente."),
  });

  async function escolherFoto(file: File) {
    if (enviandoFoto || salvar.isPending) return;
    setEnviandoFoto(true);
    setErro(null);
    setRecado(null);
    try {
      const anterior = client.avatar_url;
      const url = await uploadClientAvatar(client.id, file);
      // Grava só a foto na hora: quem sobe imagem espera vê-la valendo, não
      // descobrir depois que precisava clicar em "Salvar" também.
      try {
        // Uploading a photo must not save the other, still unsubmitted fields.
        await updateClientAvatar(client.id, url);
      } catch (error) {
        await removeClientAvatar(client.id, url);
        throw error;
      }
      setAvatar(url);
      await removeClientAvatar(client.id, anterior);
      setRecado("Foto atualizada.");
      await queryClient.invalidateQueries({ queryKey: ["client", client.id] });
      await queryClient.invalidateQueries({ queryKey: ["admin-clients"] });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível atualizar a foto. Verifique sua conexão e tente novamente.");
    } finally {
      setEnviandoFoto(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (enviandoFoto || salvar.isPending) return;
    if (!nome.trim()) {
      setErro("O nome não pode ficar vazio.");
      return;
    }
    salvar.mutate({
      name: nome.trim(),
      specialty: ouNulo(especialidade),
      // O admin cola "@dralana" por reflexo; guardar sem o @ mantém o handle
      // consistente para quem monta link a partir dele.
      instagram_handle: ouNulo(instagram.replace(/^@+/, "")),
      avatar_url: ouNulo(avatar),
      meta_ad_account_id: ouNulo(contaAds),
      wts_company_id: ouNulo(contaWts),
      cfm_score_status: cfm === "" ? null : cfm,
      active: ativo,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <ClientAvatar nome={nome || client.name} url={avatar} tamanho={64} />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={arquivoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void escolherFoto(f);
            }}
          />
          <button
            type="button"
            disabled={enviandoFoto || salvar.isPending}
            onClick={() => arquivoRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          >
            <Upload size={14} />
            {enviandoFoto ? "Enviando…" : avatar ? "Trocar foto" : "Enviar foto"}
          </button>
          {avatar && (
            <button
              type="button"
              disabled={enviandoFoto || salvar.isPending}
              onClick={() => setAvatar("")}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium"
              style={{ borderColor: "var(--border)", color: "var(--text-dim)" }}
            >
              <Trash2 size={14} />
              Remover
            </button>
          )}
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            JPG, PNG ou WebP, até 2 MB
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Campo label="Nome">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm"
            style={estiloInput}
          />
        </Campo>
        <Campo label="Especialidade" hint="Aparece embaixo do nome no dashboard.">
          <input
            value={especialidade}
            onChange={(e) => setEspecialidade(e.target.value)}
            placeholder="Ex.: dermatologia"
            className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm"
            style={estiloInput}
          />
        </Campo>
      </div>

      <div className="flex flex-wrap gap-3">
        <Campo label="Instagram" hint="Sem o @ — ele é adicionado na exibição.">
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="Ex.: drnome"
            className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm"
            style={estiloInput}
          />
        </Campo>
        <Campo label="Selo CFM">
          <select
            value={cfm}
            onChange={(e) => setCfm(e.target.value as CfmScoreStatus | "")}
            className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm"
            style={estiloInput}
          >
            {CFM_OPCOES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="flex flex-wrap gap-3">
        <Campo
          label="Conta de anúncio (Meta)"
          hint={
            (contasLigadas ?? []).some((c) => c.active)
              ? "Conta principal (opcional): os anúncios já são lidos pelas contas ligadas abaixo."
              : "Só o número. Sem conta aqui nem ligada abaixo, a aba de anúncios fica sem dado."
          }
        >
          <input
            value={contaAds}
            onChange={(e) => setContaAds(e.target.value)}
            placeholder="Ex.: 1234567890"
            className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm"
            style={estiloInput}
          />
          {(contasLigadas ?? []).length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs" aria-label="Contas de anúncio ligadas">
              {contasLigadas!.map((c) => (
                <li key={c.ad_account_id} style={{ color: c.active ? "var(--ink-2)" : "var(--muted)" }}>
                  {c.active ? "Ligada" : "Desligada"}: {c.ad_account_id}
                  {c.name ? ` · ${c.name}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Campo>
        <Campo label="Conta da WTS" hint="companyId. Vazio = aba de atendimento fica sem dado.">
          <input
            value={contaWts}
            onChange={(e) => setContaWts(e.target.value)}
            placeholder="Ex.: 00000000-0000-0000-0000-000000000000"
            className="mt-1 w-full rounded-md border px-2.5 py-1.5 text-sm"
            style={estiloInput}
          />
        </Campo>
      </div>

      <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-dim)" }}>
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
        Cliente ativo — desmarcado, ele para de aparecer nas listas e nos syncs
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={salvar.isPending || enviandoFoto}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          {salvar.isPending ? "Salvando…" : "Salvar perfil"}
        </button>
        {recado && (
          <span className="text-xs" style={{ color: "var(--good)" }}>
            {recado}
          </span>
        )}
        {erro && (
          <span role="alert" className="text-xs" style={{ color: "var(--danger)" }}>
            {erro}
          </span>
        )}
      </div>
    </form>
  );
}
