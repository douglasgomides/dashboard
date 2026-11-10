import { useId, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, AtSign, ClipboardList, Database, KeyRound, UserCog, Users } from "lucide-react";
import { getClient } from "@/lib/client-data";
import { ClientProfileForm } from "@/components/client-profile-form";
import { ClientAvatar } from "@/components/client-avatar";
import {
  connectInstagramAccount,
  createClientUser,
  createCrmConnection,
  createKommoWebhookConnection,
  kommoWebhookUrl,
  listClientMembers,
  listCrmConnections,
  listInstagramAccounts,
  removeClientMember,
  removeCrmConnection,
  renovarWebhookKommo,
  sendPasswordReset,
  type CreateClientUserInput,
} from "@/lib/admin-data";
import type { CrmProvider } from "@/integrations/supabase/types";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";
import { AdmCampo, AdmChip, AdmSecao } from "@/components/nx/admin-base";

const CRM_PROVIDER_LABELS: Record<CrmProvider, string> = {
  kommo: "Kommo",
  feegow: "Feegow",
  ninsaude: "Ninsaúde",
  clint: "Clint",
  rdstation: "RD Station CRM",
  flwchat: "WTS Chat (Synkronos, Clinic Desk, Support CRM)",
  digisac: "Digisac (IGM Palmas)",
};

export const Route = createFileRoute("/_authenticated/admin/$clientId")({
  component: AdminClientDetailPage,
});

function ConnectInstagramForm({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [windsorAccountId, setWindsorAccountId] = useState("");
  const [igUsername, setIgUsername] = useState("");

  const mutation = useMutation({
    mutationFn: () => connectInstagramAccount({ client_id: clientId, windsor_account_id: windsorAccountId, ig_username: igUsername || undefined }),
    onSuccess: () => {
      setWindsorAccountId("");
      setIgUsername("");
      queryClient.invalidateQueries({ queryKey: ["admin-ig-accounts", clientId] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!windsorAccountId.trim()) return;
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="adm-form">
      <AdmCampo id={`${uid}-id`} rotulo="ID da conta Instagram">
        <input id={`${uid}-id`} autoComplete="off" value={windsorAccountId} onChange={(e) => setWindsorAccountId(e.target.value)} required placeholder="Ex.: 1234567890" className="adm-entrada" />
      </AdmCampo>
      <AdmCampo id={`${uid}-user`} rotulo="@Instagram (opcional)">
        <input id={`${uid}-user`} autoComplete="off" value={igUsername} onChange={(e) => setIgUsername(e.target.value)} className="adm-entrada" />
      </AdmCampo>
      <button type="submit" disabled={mutation.isPending} className="adm-btn adm-btn--pri">
        {mutation.isPending ? "Conectando…" : "Conectar conta"}
      </button>
      {mutation.isError && <p className="adm-erro">{mensagemDeErroAcao(mutation.error)}</p>}
    </form>
  );
}

function ConnectCrmForm({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [provider, setProvider] = useState<CrmProvider>("kommo");
  const [subdomain, setSubdomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const tokenMutation = useMutation({
    mutationFn: () =>
      createCrmConnection({
        client_id: clientId,
        provider,
        subdomain: subdomain || undefined,
        access_token: accessToken || undefined,
      }),
    onSuccess: () => {
      setSubdomain("");
      setAccessToken("");
      queryClient.invalidateQueries({ queryKey: ["admin-crm-connections", clientId] });
    },
  });

  // Kommo não usa token colado à mão — gera uma URL de webhook única
  // (connection_id + secret) pro admin colar nas configurações de Webhooks
  // da Kommo. Sem OAuth: a Kommo empurra o evento pra essa URL sozinha.
  const kommoMutation = useMutation({
    mutationFn: () => createKommoWebhookConnection(clientId, subdomain || undefined),
    onSuccess: (connection) => {
      setSubdomain("");
      setGeneratedUrl(kommoWebhookUrl(connection.id, connection.webhook_secret!));
      queryClient.invalidateQueries({ queryKey: ["admin-crm-connections", clientId] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setGeneratedUrl(null);
    if (provider === "kommo") kommoMutation.mutate();
    else tokenMutation.mutate();
  }

  const mutation = provider === "kommo" ? kommoMutation : tokenMutation;

  return (
    <form onSubmit={handleSubmit} className="adm-form">
      <AdmCampo id={`${uid}-crm`} rotulo="CRM">
        <select
          id={`${uid}-crm`}
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value as CrmProvider);
            setGeneratedUrl(null);
          }}
          className="adm-entrada"
        >
          {(Object.entries(CRM_PROVIDER_LABELS) as [CrmProvider, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </AdmCampo>
      <AdmCampo id={`${uid}-sub`} rotulo={`Subdomínio${provider === "kommo" ? " (opcional, só referência)" : ""}`}>
        <input id={`${uid}-sub`} autoComplete="off" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="Ex.: suaclinica" className="adm-entrada" />
      </AdmCampo>
      {provider !== "kommo" && (
        <AdmCampo id={`${uid}-token`} rotulo="Token de acesso">
          <input id={`${uid}-token`} autoComplete="new-password" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} className="adm-entrada" />
        </AdmCampo>
      )}
      <button type="submit" disabled={mutation.isPending} className="adm-btn adm-btn--pri">
        {mutation.isPending ? "Conectando…" : provider === "kommo" ? "Gerar URL de webhook" : "Conectar CRM"}
      </button>
      {mutation.isError && <p className="adm-erro">{mensagemDeErroAcao(mutation.error)}</p>}
      {generatedUrl && (
        <AdmCampo id={`${uid}-url`} rotulo={'Cole essa URL em Kommo → Configurações → Webhooks (evento "Lead adicionado" e "Estágio alterado")'} largo>
          <input id={`${uid}-url`} autoComplete="off" readOnly value={generatedUrl} onFocus={(e) => e.target.select()} className="adm-entrada" />
        </AdmCampo>
      )}
    </form>
  );
}

function CrmConnectionsList({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const { data: connections } = useQuery({
    queryKey: ["admin-crm-connections", clientId],
    queryFn: () => listCrmConnections(clientId),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeCrmConnection(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-crm-connections", clientId] }),
  });
  // A URL do webhook só aparece quando é gerada: o navegador não lê o segredo de volta do banco.
  const [novaUrl, setNovaUrl] = useState<{ id: string; url: string } | null>(null);
  const renovarMutation = useMutation({
    mutationFn: (id: string) => renovarWebhookKommo(id),
    onSuccess: (c) => {
      setNovaUrl({ id: c.id, url: kommoWebhookUrl(c.id, c.webhook_secret) });
      queryClient.invalidateQueries({ queryKey: ["admin-crm-connections", clientId] });
    },
  });

  if (!connections?.length) return <p className="adm-item__mais">Nenhum CRM ligado ainda.</p>;
  return (
    <div className="grid gap-2">
      <p className="adm-titulo-lista">Ligados neste cliente</p>
      <ul className="adm-ligados">
        {connections.map((c) => (
          <li key={c.id} className="adm-ligado">
            <span className="adm-ligado__nome">
              {CRM_PROVIDER_LABELS[c.provider]}
              {c.subdomain ? <small> · {c.subdomain}</small> : null}
            </span>
            {!c.active && <AdmChip tom="neutro">inativo</AdmChip>}
            {c.tem_token != null && <AdmChip tom={c.tem_token ? "ok" : "atencao"}>{c.tem_token ? "Token salvo" : "Sem token salvo"}</AdmChip>}
            {c.provider === "kommo" && c.tem_webhook != null && <AdmChip tom={c.tem_webhook ? "ok" : "atencao"}>{c.tem_webhook ? "URL de webhook gerada" : "sem URL de webhook"}</AdmChip>}
            {c.provider === "kommo" && (
              <button
                type="button"
                onClick={() => {
                  if (!c.tem_webhook || window.confirm("Gerar uma URL nova? A atual para de funcionar até você colar a nova nos Webhooks da Kommo.")) renovarMutation.mutate(c.id);
                }}
                disabled={renovarMutation.isPending}
                className="adm-btn adm-btn--mini"
              >
                {c.tem_webhook ? "Gerar nova URL" : "Gerar URL"}
              </button>
            )}
            <button type="button" onClick={() => removeMutation.mutate(c.id)} className="adm-btn adm-btn--mini adm-btn--perigo">
              Remover
            </button>
            {c.provider === "kommo" && novaUrl?.id === c.id && (
              <>
                <input autoComplete="off" readOnly value={novaUrl.url} onFocus={(e) => e.target.select()} className="adm-entrada" aria-label="Nova URL de webhook" />
                <span className="adm-ligado__nota">Copie agora: por segurança, a URL não é mostrada de novo.</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const LINK_PAINEL = "https://dash.doctorcreator.com.br";

/** Mensagem pronta para mandar ao médico (WhatsApp ou e-mail) com o acesso. */
function mensagemDeAcesso(o: { nomeCliente: string; email: string; senha: string | null }): string {
  return [
    `Olá! Seu acesso ao painel da Doctor Creator está pronto.`,
    ``,
    `Link: ${LINK_PAINEL}`,
    `E-mail: ${o.email}`,
    o.senha ? `Senha temporária: ${o.senha}` : `Senha: a mesma que você já usa no painel.`,
    ``,
    o.senha
      ? `No primeiro acesso você cria a sua senha e vê um tour de 2 minutos: onde ver o retorno do investimento, o conteúdo, os anúncios e o atendimento.`
      : `${o.nomeCliente} já aparece para você ao entrar.`,
    `Qualquer dúvida, é só responder esta mensagem.`,
  ].join("\n");
}

function NewUserForm({ clientId, nomeCliente }: { clientId: string; nomeCliente: string }) {
  const queryClient = useQueryClient();
  const uid = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CreateClientUserInput["role"]>("owner");
  const [result, setResult] = useState<{ user_id: string; temporary_password: string | null; ja_existia?: boolean; email: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const mutation = useMutation({
    mutationFn: () => createClientUser({ email: email.trim(), client_id: clientId, role }),
    onSuccess: (data) => {
      setResult({ ...data, email: email.trim() });
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin-members", clientId] });
      queryClient.invalidateQueries({ queryKey: ["admin-logins-por-cliente"] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setResult(null);
    setCopiado(false);
    mutation.mutate();
  }

  const msg = result ? mensagemDeAcesso({ nomeCliente, email: result.email, senha: result.temporary_password }) : "";

  return (
    <>
      <ol className="adm-passos">
        <li>
          <span>Digite o e-mail do médico (ou de quem vai acompanhar) e escolha o papel.</span>
        </li>
        <li>
          <span>
            Clique em <b>Criar acesso</b>: o Nexo gera uma senha temporária.
          </span>
        </li>
        <li>
          <span>Envie a mensagem pronta por WhatsApp ou e-mail. No primeiro acesso, a pessoa cria a própria senha e vê um tour.</span>
        </li>
      </ol>
      <form onSubmit={handleSubmit} className="adm-form">
        <AdmCampo id={`${uid}-email`} rotulo="E-mail">
          <input id={`${uid}-email`} autoComplete="off" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Ex.: medico@clinica.com.br" className="adm-entrada" />
        </AdmCampo>
        <AdmCampo id={`${uid}-papel`} rotulo="Papel">
          <select id={`${uid}-papel`} value={role} onChange={(e) => setRole(e.target.value as CreateClientUserInput["role"])} className="adm-entrada">
            <option value="owner">Owner (o médico)</option>
            <option value="strategist">Strategist</option>
            <option value="viewer">Viewer</option>
          </select>
        </AdmCampo>
        <button type="submit" disabled={mutation.isPending} className="adm-btn adm-btn--pri">
          {mutation.isPending ? "Criando…" : "Criar acesso"}
        </button>
        {mutation.isError && <p className="adm-erro">{mensagemDeErroAcao(mutation.error)}</p>}
      </form>
      {result && (
        <div className="adm-resultado">
          <p>
            {result.ja_existia
              ? "Esse e-mail já tinha conta no painel: ele foi vinculado a este cliente, com a senha que já usa."
              : "Acesso criado. A senha temporária aparece só aqui e na mensagem abaixo."}
          </p>
          <textarea readOnly value={msg} rows={9} className="adm-entrada font-mono" aria-label="Mensagem para enviar" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="adm-btn adm-btn--pri"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(msg);
                  setCopiado(true);
                } catch {
                  /* sem permissão: a pessoa copia do campo */
                }
              }}
            >
              {copiado ? "Copiado!" : "Copiar mensagem"}
            </button>
            <a className="adm-btn" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
              Enviar pelo WhatsApp
            </a>
            <a className="adm-btn" href={`mailto:${result.email}?subject=${encodeURIComponent("Seu acesso ao painel Doctor Creator")}&body=${encodeURIComponent(msg)}`}>
              Enviar por e-mail
            </a>
          </div>
        </div>
      )}
    </>
  );
}

function MembersList({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const uid = useId();
  const { data: members } = useQuery({
    queryKey: ["admin-members", clientId],
    queryFn: () => listClientMembers(clientId),
  });
  const [resetEmail, setResetEmail] = useState("");

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => removeClientMember(memberId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-members", clientId] }),
  });

  const resetMutation = useMutation({
    mutationFn: (email: string) => sendPasswordReset(email),
  });

  return (
    <>
      <div className="grid gap-2">
        <p className="adm-titulo-lista">Quem entra no painel deste cliente</p>
        <ul className="adm-ligados">
          {(members ?? []).map((m) => (
            <li key={m.id} className="adm-ligado">
              <span className="adm-ligado__nome">
                <code>{m.user_id}</code>
              </span>
              <AdmChip tom="marca" semIcone>{m.role}</AdmChip>
              <button type="button" onClick={() => removeMutation.mutate(m.id)} className="adm-btn adm-btn--mini adm-btn--perigo">
                Remover
              </button>
            </li>
          ))}
          {(members ?? []).length === 0 && <li className="adm-item__mais">Nenhum usuário vinculado ainda.</li>}
        </ul>
      </div>
      <div className="adm-caixa adm-form">
        <AdmCampo id={`${uid}-reset`} rotulo="Enviar redefinição de senha (e-mail do usuário)">
          <input id={`${uid}-reset`} autoComplete="off" type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className="adm-entrada" />
        </AdmCampo>
        <button type="button" disabled={!resetEmail.trim() || resetMutation.isPending} onClick={() => resetMutation.mutate(resetEmail)} className="adm-btn">
          {resetMutation.isPending ? "Enviando…" : "Enviar link"}
        </button>
        {resetMutation.isSuccess && <p className="adm-ok">Link enviado.</p>}
        {resetMutation.isError && <p className="adm-erro">{mensagemDeErroAcao(resetMutation.error)}</p>}
      </div>
    </>
  );
}

function InstagramAccountsList({ clientId }: { clientId: string }) {
  const { data: accounts } = useQuery({
    queryKey: ["admin-ig-accounts", clientId],
    queryFn: () => listInstagramAccounts(clientId),
  });

  if (!accounts?.length) return <p className="adm-item__mais">Nenhuma conta ligada ainda.</p>;
  return (
    <div className="grid gap-2">
      <p className="adm-titulo-lista">Ligadas neste cliente</p>
      <ul className="adm-ligados">
        {accounts.map((a) => (
          <li key={a.id} className="adm-ligado">
            <span className="adm-ligado__nome">{a.ig_username ? `@${a.ig_username}` : "Conta sem @"}</span>
            <code>{a.windsor_account_id}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

const INDICE = [
  { id: "perfil", rotulo: "Perfil", icone: <UserCog aria-hidden /> },
  { id: "instagram", rotulo: "Instagram", icone: <AtSign aria-hidden /> },
  { id: "crm", rotulo: "CRM", icone: <Database aria-hidden /> },
  { id: "acesso", rotulo: "Dar acesso", icone: <KeyRound aria-hidden /> },
  { id: "usuarios", rotulo: "Usuários", icone: <Users aria-hidden /> },
];

function AdminClientDetailPage() {
  const { clientId } = Route.useParams();
  const { data: client } = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId) });

  return (
    <div className="adm adm-cliente">
      <div className="adm-cabeca">
        <div className="adm-cabeca__quem">
          <ClientAvatar nome={client?.name ?? "?"} url={client?.avatar_url} tamanho={52} />
          <div className="min-w-0">
            <b>{client?.name ?? "Carregando…"}</b>
            <small>{[client?.specialty, client?.instagram_handle ? `@${client.instagram_handle}` : null].filter(Boolean).join(" · ") || "Configurar este cliente"}</small>
          </div>
        </div>
        <div className="adm-cabeca__acoes">
          <Link to="/admin" className="adm-btn">
            <ArrowLeft aria-hidden /> Todos os clientes
          </Link>
          <Link to="/$clientId/pacientes" params={{ clientId }} className="adm-btn adm-btn--pri">
            Ver o painel deste cliente <ArrowRight aria-hidden />
          </Link>
        </div>
      </div>

      <nav className="adm-indice" aria-label="Seções desta tela">
        {INDICE.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.icone}
            {s.rotulo}
          </a>
        ))}
      </nav>

      <div className="adm-secoes">
        {/* Tarefas da equipe que saíram do menu do cliente. */}
        <AdmSecao toda icone={<ClipboardList />} titulo="Tarefas da equipe neste cliente" sub="Classificar o CRM é trabalho da equipe, por isso fica aqui e não no menu do cliente.">
          <div className="flex flex-wrap gap-2">
            <Link to="/$clientId/analisar" params={{ clientId }} className="adm-btn">
              A analisar: etapas, ganho e perda do CRM <ArrowRight aria-hidden />
            </Link>
            <Link to="/$clientId/crm-estrutura" params={{ clientId }} className="adm-btn">
              Estrutura do CRM <ArrowRight aria-hidden />
            </Link>
          </div>
        </AdmSecao>

        {client && (
          <AdmSecao toda id="perfil" icone={<UserCog />} titulo="Perfil do cliente" sub="Nome, foto, Instagram, contas e o que aparece no Resultado.">
            <div className="adm-perfil">
              <ClientProfileForm client={client} />
            </div>
          </AdmSecao>
        )}

        <AdmSecao id="instagram" icone={<AtSign />} titulo="Conta Instagram" sub="Ligue a conta pelo ID para os posts e métricas chegarem.">
          <ConnectInstagramForm clientId={clientId} />
          <InstagramAccountsList clientId={clientId} />
        </AdmSecao>

        <AdmSecao id="crm" icone={<Database />} titulo="CRM" sub="Kommo gera uma URL de webhook; os outros usam token.">
          <ConnectCrmForm clientId={clientId} />
          <CrmConnectionsList clientId={clientId} />
        </AdmSecao>

        <AdmSecao id="acesso" icone={<KeyRound />} titulo="Dar acesso ao médico" sub="Cria o login e a mensagem pronta para enviar.">
          <NewUserForm clientId={clientId} nomeCliente={client?.name ?? "O cliente"} />
        </AdmSecao>

        <AdmSecao id="usuarios" icone={<Users />} titulo="Usuários vinculados" sub="Quem já entra no painel, e o link de nova senha.">
          <MembersList clientId={clientId} />
        </AdmSecao>
      </div>
    </div>
  );
}
