import { DIAS_SEM_ENTRAR, entraNaCarteira, fatoDeAcesso, type AcessoClinica } from "@/lib/carteira-alertas";
import { CAMPOS_DE_FILA } from "@/lib/leitura/fatos-resultados";
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Carregando } from "@/components/sem-fonte";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAdminUser, createClient, getAvisosDaCarteira, listAllClients } from "@/lib/admin-data";
import { ClientAvatar } from "@/components/client-avatar";
import { supabase } from "@/integrations/supabase/client";
import { getQualidadeDados, getRoiPeriodo } from "@/lib/client-data";
import { fetchAllRows } from "@/lib/pagination";
import { grupoSemRoi, montarRoi, resumoRoi, ROTULO_GRUPO_SEM_ROI, type GrupoSemRoi, type Roi } from "@/lib/roi";
import { SeloConfianca } from "@/components/selo-confianca";
import { resolveDateRange } from "@/lib/date-range";
import { getSapPorCliente } from "@/lib/sap-data";
import { lerStatusDasFontes, type FontesDoCliente } from "@/lib/saude-fontes";
import { fatoresDaNota, notaDasFontes, ROTULO_FAIXA, type NotaFontes } from "@/lib/nota-fontes";
import { alertasDaClinica, casaFiltroDeCor, corDaClinica, descobertasDaCarteira, numerosDaCarteira, ordenarPorUrgencia, vereditoDaCarteira, type AlertaDaCarteira, type FiltroDeCor, type LinhaDaCarteira as LinhaUrgencia } from "@/lib/carteira-urgencia";
import { NxDescobertas, NxVeredito } from "@/components/nx/cinco-segundos";
import { NxBlocoDoVerTudo } from "@/components/nx/cabeca-do-bloco";
import { cabecaDoDiagnosticoDasFontes, cabecaDosContadores } from "@/lib/leitura/ver-tudo-carteira";
import { NxPainelDaClinica } from "@/components/nx/painel-da-clinica";
import { FONTES, NOME_FONTE, LEGENDA_STATUS, VAR_COR, type FonteId } from "@/lib/status-fonte";
import { AlertTriangle, ArrowRight, Building2, Calculator, Clock, MinusCircle, Search, ShieldCheck, Tv, Unplug, UserPlus, UserX, X } from "lucide-react";
import { saudeDaFonte, CelulaSaude, SeloStatus, type SaudeFonte } from "@/components/source-health";
import { useQualidadeDados } from "@/components/qualidade-dados";
import { LinksSemCliente } from "@/components/links-shortio";
import { SeloDono } from "@/components/selo-dono";
import { PainelSaudeFontes } from "@/components/painel-saude-fontes";
import { SaudeShortio } from "@/components/saude-shortio";
import { montarProblemasFontes } from "@/lib/saude-problemas";
import { SemRespostaAgora } from "@/components/sem-resposta-agora";
import { mensagemDeErroAcao } from "@/lib/erro-amigavel";
import { CAMPOS_DIARIOS, type CampoDiario } from "@/hooks/use-resultados-diarios";
import { NxAlertaCurto, NxNota, NxTopo } from "@/components/nx/anuncios-graficos";
import { AdmCampo, AdmChip, AdmContador, AdmContadores, AdmSecao, tomDaCor, type AdmTom } from "@/components/nx/admin-base";
import "@/styles/databoard.css";
import "@/styles/nexo-carteira-urgencia.css";


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

  const uid = useId();
  return (
    <form onSubmit={handleSubmit} className="adm-form">
      <AdmCampo id={`${uid}-nome`} rotulo="Nome do médico(a)">
        <input id={`${uid}-nome`} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} required className="adm-entrada" />
      </AdmCampo>
      <AdmCampo id={`${uid}-esp`} rotulo="Especialidade">
        <input id={`${uid}-esp`} autoComplete="off" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="adm-entrada" />
      </AdmCampo>
      <AdmCampo id={`${uid}-ig`} rotulo="@Instagram">
        <input id={`${uid}-ig`} autoComplete="off" value={handle} onChange={(e) => setHandle(e.target.value)} className="adm-entrada" />
      </AdmCampo>
      <button type="submit" disabled={mutation.isPending} className="adm-btn adm-btn--pri">
        {mutation.isPending ? "Criando…" : "Novo cliente"}
      </button>
      {mutation.isError && <p className="adm-erro">{mensagemDeErroAcao(mutation.error)}</p>}
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

  const uid = useId();
  return (
    <form onSubmit={handleSubmit} className="adm-form">
      <AdmCampo id={`${uid}-email`} rotulo="E-mail do novo admin">
        <input id={`${uid}-email`} autoComplete="off" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="adm-entrada" />
      </AdmCampo>
      <AdmCampo id={`${uid}-senha`} rotulo="Senha (opcional — em branco gera uma)">
        <input id={`${uid}-senha`} autoComplete="off" type="text" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} className="adm-entrada" />
      </AdmCampo>
      <button type="submit" disabled={mutation.isPending} className="adm-btn adm-btn--pri">
        {mutation.isPending ? "Criando…" : "Novo admin"}
      </button>
      {mutation.isError && <p className="adm-erro">{mensagemDeErroAcao(mutation.error)}</p>}
      {result && (
        <p className="adm-ok" style={{ flexBasis: "100%" }}>
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

const ROTULO_COR: Record<string, string> = { verde: "Em dia", amarelo: "Atenção", vermelho: "Problema", cinza: "Sem fontes" };
const PESO_TOM: Record<AdmTom, number> = { critico: 3, atencao: 2, neutro: 1, ok: 0, marca: 0 };
const ICONE_ALERTA: Record<AdmTom, ReactNode> = {
  critico: <AlertTriangle className="adm-alertas__ic" aria-hidden />,
  atencao: <Clock className="adm-alertas__ic" aria-hidden />,
  neutro: <MinusCircle className="adm-alertas__ic" aria-hidden />,
  ok: <MinusCircle className="adm-alertas__ic" aria-hidden />,
  marca: <MinusCircle className="adm-alertas__ic" aria-hidden />,
};

const deltaTxt = (a?: number, b?: number) => {
  // Base pequena no período anterior vira percentual absurdo (clínica nova, dado que começou no meio do mês).
  if (a == null || b == null || b < 30) return null;
  const pct = Math.round(((a - b) / b) * 100);
  if (pct === 0) return { t: "=", c: "flat" };
  const abs = Math.abs(pct);
  return { t: `${pct > 0 ? "▲" : "▼"} ${abs > 300 ? "mais de 300" : abs}%`, c: pct > 0 ? "up" : "down" };
};

type NumerosClinica = { atual: Partial<Record<CampoDiario, number>>; antes: Partial<Record<CampoDiario, number>> };

/**
 * Uma linha da carteira. Na coluna de saúde ficam no máximo 3 itens em linha (status, nota e o chip "N alertas" ou o do
 * SAP); tudo que antes ficava empilhado (fonte ruim, dado com erro, acesso, SAP) abre numa lista pelo chip "N alertas".
 * Os alertas vêm prontos da página (a mesma lista que ordena a carteira e alimenta o veredito).
 */
function LinhaDaCarteira({ c, handle, numeros, cor, sd, nota, sp, roi, grupoLinha, alertas, aoAbrir, idx, fontesLidas }: {
  c: { id: string; name: string; specialty?: string | null; avatar_url?: string | null; active?: boolean | null };
  handle: string | null;
  numeros: NumerosClinica | undefined;
  cor: string;
  sd: Record<FonteId, SaudeFonte> | null | undefined;
  nota: NotaFontes | null;
  sp: { dia: number | null } | undefined;
  roi: Roi | null;
  grupoLinha: GrupoSemRoi | null;
  /** Os alertas da clínica (src/lib/carteira-urgencia.ts), calculados no nível da página: a linha só desenha. */
  alertas: AlertaDaCarteira[];
  /** Abre o painel lateral desta clínica; recebe o botão para o foco voltar a ele. */
  aoAbrir: (de: HTMLElement) => void;
  idx: number;
  /** A leitura das fontes já voltou: cliente sem linha nela não está "lendo", está desativado ou sem fonte. */
  fontesLidas: boolean;
}) {
  const piorTom = alertas.reduce<AdmTom>((p, a) => (PESO_TOM[a.tom] > PESO_TOM[p] ? a.tom : p), "neutro");
  const rotuloSap = sp ? (sp.dia === null ? "SAP · sem D0" : sp.dia > 90 ? "Terminou o SAP" : sp.dia < 0 ? `SAP · começa em ${-sp.dia} dia(s)` : `SAP · D${sp.dia} de 90`) : null;
  const chipSap = sp && (
    <Link to="/sap/$clientId/painel" params={{ clientId: c.id }} className="adm-chip-link" title="Abrir no Sistema de Aquisição">
      <AdmChip tom="marca" semIcone>{rotuloSap}</AdmChip>
    </Link>
  );
  const sub = [c.specialty, handle ? `@${handle}` : null].filter(Boolean).join(" · ") || "sem especialidade nem Instagram";
  return (
    <li className={`adm-linha${cor === "vermelho" ? " adm-linha--alerta" : cor === "amarelo" ? " adm-linha--atencao" : ""}`} style={{ "--i": Math.min(idx, 12) } as CSSProperties}>
      <button type="button" className="adm-quem adm-quem--botao" aria-haspopup="dialog" title="Ver a nota dos dados e os problemas desta clínica" onClick={(e) => aoAbrir(e.currentTarget)}>
        <span className="adm-quem__av"><ClientAvatar nome={c.name} url={c.avatar_url} tamanho={44} /></span>
        <span className="adm-quem__texto">
          <span className="adm-quem__nome" title={c.name}>{c.name}</span>
          <span className="adm-quem__sub" title={sub}>{sub}</span>
        </span>
      </button>
      <div className="adm-chips">
        <AdmChip tom={sd ? tomDaCor(cor) : "neutro"}>{sd ? ROTULO_COR[cor] ?? "Sem fontes" : !fontesLidas ? "Lendo as fontes…" : c.active === false ? "Desativada" : "Sem fontes"}</AdmChip>
        {nota && nota.nota !== null && (
          <AdmChip tom={tomDaCor(nota.cor)} semIcone titulo={`Saúde dos dados (nota das fontes, não é o resultado da clínica). ${nota.motivos.length ? `Por que não é 100:\n${nota.motivos.join("\n")}` : "Todas as fontes em dia, sem problema de dado."}`}>
            Dados {nota.nota} · {ROTULO_FAIXA[nota.faixa!]}
          </AdmChip>
        )}
        {alertas.length > 0 ? (
          <details className="adm-alertas">
            <summary className={`adm-alertas__chip adm-alertas__chip--${piorTom}`} title={alertas.map((a) => a.texto).join("\n")}>
              {ICONE_ALERTA[piorTom]}
              <span className="adm-chip__texto">{alertas.length === 1 ? "1 alerta" : `${alertas.length} alertas`}</span>
            </summary>
            <ul className="adm-alertas__lista">
              {alertas.map((a) => (
                <li key={a.chave}>
                  {a.acesso ? (
                    <Link to="/admin/$clientId" params={{ clientId: c.id }} hash="acesso" className="adm-chip-link" title={a.titulo}>
                      <AdmChip tom={a.tom} titulo={a.titulo}>{a.texto}</AdmChip>
                    </Link>
                  ) : (
                    <AdmChip tom={a.tom} titulo={a.titulo}>{a.texto}</AdmChip>
                  )}
                </li>
              ))}
              {chipSap && <li>{chipSap}</li>}
            </ul>
          </details>
        ) : (
          chipSap
        )}
      </div>
      <div className="adm-nums">
        {([["mandaram_mensagem", "Chamaram"], ["agendaram", "Agendaram"], ["fecharam", "Fecharam"]] as const).map(([k, rot]) => {
          const v = numeros?.atual[k];
          const dl = deltaTxt(numeros?.atual[k], numeros?.antes[k]);
          return (
            <div key={k} className="adm-num">
              <b>{v == null ? "–" : v.toLocaleString("pt-BR")}</b>
              <small>{rot}</small>
              <i className={dl?.c ?? ""} aria-label={dl ? `${dl.t.replace("▲", "subiu").replace("▼", "caiu")} contra os 30 dias anteriores` : undefined}>{dl?.t ?? ""}</i>
            </div>
          );
        })}
        <div className="adm-num adm-num--roi">
          {roi ? (
            <Link to="/$clientId" params={{ clientId: c.id }} search={{ preset: "30d" }} style={{ color: roi.calculavel ? (roi.roi! >= 0 ? "var(--good)" : "var(--crit)") : "var(--warn)" }} title={grupoLinha ? `${ROTULO_GRUPO_SEM_ROI[grupoLinha]}: ${roi.motivoSemCalculo}` : (roi.motivoSemCalculo ?? "Ver o retorno no Resultado")}>
              {resumoRoi(roi)}
            </Link>
          ) : (
            <b>…</b>
          )}
          <small>Retorno (ROI)</small>
        </div>
      </div>
      <div className="adm-acoes">
        <Link to="/$clientId" params={{ clientId: c.id }} search={{ preset: "30d" }} className="adm-btn adm-btn--pri">
          Abrir resultados <ArrowRight aria-hidden />
        </Link>
        <Link to="/admin/$clientId" params={{ clientId: c.id }} className="adm-btn" title="Fontes, acesso e configuração">
          Gerenciar
        </Link>
      </div>
    </li>
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

  // Acesso do médico: quantos usuários do cliente existem (além da equipe) vem do banco; o último acesso vem do servidor,
  // pelo alvo global carteira_avisos (só admin, só agregado por clínica).
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
  const avisosQ = useQuery({ queryKey: ["admin-avisos-carteira"], queryFn: getAvisosDaCarteira, staleTime: 5 * 60_000, retry: false });
  const acessoPorClinica = new Map<string, AcessoClinica>((avisosQ.data?.acessos ?? []).map((a) => [a.client_id, a]));
  const hoje = Date.now();
  const acessoDe = (c: { id: string; active?: boolean | null }) =>
    fatoDeAcesso({ clinica: c, membrosCliente: logins ? (logins.get(c.id) ?? 0) : undefined, acesso: acessoPorClinica.get(c.id), lido: !!avisosQ.data, hoje });
  // Sem acesso criado só precisa da contagem de membros; o "não entra" precisa também da leitura do servidor.
  const semAcesso = (c: { id: string; active?: boolean | null }) =>
    fatoDeAcesso({ clinica: c, membrosCliente: logins ? (logins.get(c.id) ?? 0) : undefined, acesso: undefined, lido: true, hoje }).fato === "sem_acesso";
  const naoEntra = (c: { id: string; active?: boolean | null }) => acessoDe(c).fato === "nao_entra";

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
  // Só clínica que a Carteira cobra (ativa e fora do negócio próprio) entra na conta. O grupo diz de quem é a vez:
  // cliente (CRM), equipe (fonte ou etapa) ou "não se aplica" (sem venda, sem investimento, amostra pequena).
  const grupoDe = (c: { id: string; active?: boolean | null }): GrupoSemRoi | null => {
    if (!entraNaCarteira(c)) return null;
    const r = roiDe(c.id);
    return r ? grupoSemRoi(r) : null;
  };
  const semRoi = (c: { id: string; active?: boolean | null }) => {
    const g = grupoDe(c);
    return g === "cliente" || g === "equipe";
  };

  // Filtros e ordenação da tabela.
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "problema" | "sem_roi" | "nao_entra" | "sem_acesso">("todos");
  // Chips de cor da nota dos dados (D-07): vermelho = faixa Ruim, amarelo = Atenção, sem nota = sem fonte ligada.
  const [corFiltro, setCorFiltro] = useState<FiltroDeCor>("todas");
  // "urgencia" (padrão): mais problemas abertos primeiro. As outras ordens falam de saúde dos dados, nunca de desempenho (I-1).
  const [ordem, setOrdem] = useState<"urgencia" | "pior" | "nota" | "nome">("urgencia");
  const piorPeso = (id: string) => {
    const sd = saudePorCliente.get(id);
    return sd ? Math.max(...FONTES.map((f) => sd[f].status.peso)) : 0;
  };
  // Texto da busca e os filtros de Ver tudo; a cor da nota entra por cima (casaFiltro) e também conta os chips de cor.
  const casaSemCor = (c: { id: string; name: string; active?: boolean | null; specialty?: string | null; instagram_handle?: string | null }) => {
    const t = busca.trim().toLowerCase();
    const texto = !t || [c.name, c.specialty, c.instagram_handle, contasIg?.get(c.id)].some((x) => (x ?? "").toLowerCase().includes(t));
    if (!texto) return false;
    if (filtro === "problema") return piorPeso(c.id) >= 2; // amarelo ou vermelho
    if (filtro === "nao_entra") return naoEntra(c);
    if (filtro === "sem_acesso") return semAcesso(c);
    if (filtro === "sem_roi") return semRoi(c);
    return true;
  };
  const corDe = (id: string) => corDaClinica(notaPorCliente.get(id)?.faixa);
  const casaFiltro = (c: Parameters<typeof casaSemCor>[0]) => casaSemCor(c) && casaFiltroDeCor(corFiltro, corDe(c.id));
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
  // Alertas de cada clínica (os mesmos do chip "N alertas"), já com quem resolve. Uma conta só, no nível da página: ordena, vira veredito e desenha a linha.
  const dataBr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : null);
  const alertasPorCliente = new Map<string, AlertaDaCarteira[]>(
    (clients ?? []).map((c, i) => [
      c.id,
      alertasDaClinica({
        saude: saudePorCliente.get(c.id),
        problemas: problemas.filter((p) => p.clientId === c.id),
        qualidade: qualidades[i]?.data,
        fatoAcesso: acessoDe(c),
        ultimoAcesso: dataBr(acessoPorClinica.get(c.id)?.ultimo_acesso),
      }),
    ]),
  );
  const linhasUrgencia: LinhaUrgencia[] = (clients ?? []).map((c) => {
    const n = notaPorCliente.get(c.id) ?? null;
    return { id: c.id, nome: c.name, entra: entraNaCarteira(c), nota: n?.nota ?? null, faixa: n?.faixa ?? null, alertas: alertasPorCliente.get(c.id) ?? [] };
  });
  const ordemDeUrgencia = new Map(ordenarPorUrgencia(linhasUrgencia).map((l, i) => [l.id, i]));
  const linhasTabela = (clients ?? [])
    .filter(casaFiltro)
    .sort((x, y) =>
      ordem === "urgencia"
        ? (ordemDeUrgencia.get(x.id) ?? 0) - (ordemDeUrgencia.get(y.id) ?? 0)
        : ordem === "nome"
          ? x.name.localeCompare(y.name, "pt-BR")
          : ordem === "nota"
            ? valorNota(x.id) - valorNota(y.id) || x.name.localeCompare(y.name, "pt-BR")
            : piorPeso(y.id) - piorPeso(x.id) || x.name.localeCompare(y.name, "pt-BR"),
    );
  const chipFiltro = (id: typeof filtro, rot: string, n?: number) => (
    <button type="button" onClick={() => setFiltro(id)} aria-pressed={filtro === id} className="adm-pilula">
      {rot}
      {n != null && <small>{n}</small>}
    </button>
  );

  // Números dos últimos 30 dias de cada clínica e dos 30 anteriores, pelo histórico diário (uma leitura só, instantânea).
  const hojeIso = resolveDateRange({ preset: "30d" }).end;
  const fimFechado = new Date(Date.parse(`${hojeIso}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const iniAtual = new Date(Date.parse(`${fimFechado}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  const fimAntes = new Date(Date.parse(`${iniAtual}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const iniAntes = new Date(Date.parse(`${fimAntes}T12:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  const numerosQ = useQuery({
    queryKey: ["admin-numeros-30d", iniAntes, fimFechado],
    queryFn: async () => {
      // Em páginas: o banco devolve no máximo 1000 linhas por pedido, e 20 clínicas x 60 dias passam disso (as últimas clínicas
      // ficavam com "—" na Carteira, 13/11/2026).
      let data: unknown[] | null = null;
      let error: unknown = null;
      try {
        data = await fetchAllRows((de, ate) => (supabase as any)
          .from("resultados_diarios")
          .select(["client_id", "dia", ...CAMPOS_DIARIOS].join(","))
          .gte("dia", iniAntes)
          .lte("dia", fimFechado)
          .order("client_id")
          .order("dia")
          .range(de, ate));
      } catch (e) {
        error = e;
      }
      if (error) return new Map<string, { atual: Partial<Record<CampoDiario, number>>; antes: Partial<Record<CampoDiario, number>> }>();
      const m = new Map<string, { atual: Partial<Record<CampoDiario, number>>; antes: Partial<Record<CampoDiario, number>> }>();
      const ultimoDia: { atual: Record<string, string>; antes: Record<string, string> } = { atual: {}, antes: {} };
      for (const r of (data ?? []) as Array<{ client_id: string; dia: string } & Record<CampoDiario, number | null>>) {
        const e = m.get(r.client_id) ?? { atual: {}, antes: {} };
        const lado = r.dia >= iniAtual ? e.atual : e.antes;
        // Negociação é fila (o que está aberto no dia), não entrada: vale o último dia medido, nunca a soma dos dias (03.1.1.1.1).
        const ultimo = r.dia >= iniAtual ? ultimoDia.atual : ultimoDia.antes;
        for (const k of CAMPOS_DIARIOS) {
          if (r[k] == null) continue;
          if ((CAMPOS_DE_FILA as readonly string[]).includes(k)) {
            const chave = `${r.client_id}:${k}`;
            if (!ultimo[chave] || r.dia >= ultimo[chave]) { ultimo[chave] = r.dia; lado[k] = Number(r[k]); }
          } else lado[k] = (lado[k] ?? 0) + Number(r[k]);
        }
        m.set(r.client_id, e);
      }
      return m;
    },
    staleTime: 10 * 60_000,
    retry: false,
  });
  const [aba, setAba] = useState<"alertas" | "problemas" | "resposta" | "clinica">("alertas");
  const nClinicas = (clients ?? []).length;
  const nAtencao = (clients ?? []).filter((c) => piorPeso(c.id) >= 2).length;
  const piorCor = (id: string) => {
    const sd = saudePorCliente.get(id);
    if (!sd) return "cinza";
    const worst = [...FONTES].map((f) => sd[f].status).sort((a, b) => b.peso - a.peso)[0];
    return worst ? worst.cor : "cinza";
  };
  // Contagens dos cartões do topo: só leem o status que a tela já calculou (regra única de status-fonte.ts).
  const fontesAmarelas = (clients ?? []).map((c) => {
    const sd = saudePorCliente.get(c.id);
    return sd ? FONTES.filter((f) => sd[f].status.cor === "amarelo").length : 0;
  });
  const totalAmarelas = fontesAmarelas.reduce((n, x) => n + x, 0);
  const clinicasAmarelas = fontesAmarelas.filter((x) => x > 0).length;
  const roisProntos = rois.every((q) => !q.isLoading);
  const gruposRoi = (clients ?? []).map(grupoDe);
  const nCliente = gruposRoi.filter((g) => g === "cliente").length;
  const nEquipe = gruposRoi.filter((g) => g === "equipe").length;
  const nNaoSeAplica = gruposRoi.filter((g) => g === "nao_se_aplica").length;
  const nSemRoi = roisProntos ? nCliente + nEquipe : null;
  const nSemAcesso = logins ? (clients ?? []).filter(semAcesso).length : null;
  const nNaoEntra = logins && avisosQ.data ? (clients ?? []).filter(naoEntra).length : null;
  const notaAcesso = `${nSemAcesso ?? "…"} sem acesso criado (a equipe cria)`;
  const lendo = (v: number | null | undefined) => (v == null || carregandoSaude ? "…" : v.toLocaleString("pt-BR"));
  const tomDe = (n: number | null, tom: "atencao" | "critico") => (n == null ? "neutro" : n > 0 ? tom : "ok");

  // Os 3 números, o veredito e as descobertas leem a mesma lista de alertas que ordena a carteira.
  const carregandoUrg = isLoading || carregandoSaude || avisosQ.isLoading || qualidades.some((q) => q.isLoading);
  const vereditoDaTela = isLoading ? null : vereditoDaCarteira(linhasUrgencia);
  const lendoUrg = (v: number) => (carregandoUrg ? "…" : v.toLocaleString("pt-BR"));
  const nums = numerosDaCarteira(linhasUrgencia);
  const achados = descobertasDaCarteira(linhasUrgencia);
  const chipDeCor = (id: FiltroDeCor, rot: string, titulo: string) => (
    <button type="button" onClick={() => setCorFiltro(id)} aria-pressed={corFiltro === id} className="adm-pilula" title={titulo}>
      {rot}
      <small>{(clients ?? []).filter((c) => casaSemCor(c) && casaFiltroDeCor(id, corDe(c.id))).length}</small>
    </button>
  );
  const ROTULO_FILTRO_EXTRA: Record<typeof filtro, string> = { todos: "", problema: "Com problema", sem_roi: "Sem ROI", nao_entra: "Não entra", sem_acesso: "Sem acesso criado" };

  // Painel lateral da clínica: abre pelo botão da linha (ou pela descoberta) e devolve o foco a quem abriu.
  const [painelId, setPainelId] = useState<string | null>(null);
  const abridor = useRef<HTMLElement | null>(null);
  const abrirPainel = (id: string, de: HTMLElement | null) => {
    abridor.current = de;
    setPainelId(id);
  };
  const fecharPainel = () => {
    setPainelId(null);
    abridor.current?.focus({ preventScroll: true });
  };
  // Modo TV (D-07): letra grande e sem o menu, para a tela da sala. Só liga o atributo data-modo-tv no <html>; Esc (com o painel
  // fechado), o mesmo botão e sair da tela desligam. Nada é buscado nem atualizado sozinho.
  const [tv, setTv] = useState(false);
  useEffect(() => {
    if (!tv) return;
    document.documentElement.setAttribute("data-modo-tv", "");
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) setTv(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.documentElement.removeAttribute("data-modo-tv");
    };
  }, [tv]);
  const [verTudoAberto, setVerTudoAberto] = useState(false);
  const [diagAberto, setDiagAberto] = useState(false);
  // Ações das descobertas: só abrem um lugar da própria tela (nada é enviado).
  const agirNaDescoberta = (local: string) => {
    if (local === "filtrar-sem-nota") {
      setBusca("");
      setFiltro("todos");
      setCorFiltro("sem-nota");
    } else if (local === "filtrar-nao-entra") {
      setCorFiltro("todas");
      setBusca("");
      setFiltro("nao_entra");
    } else if (local === "abrir-diagnostico") {
      setVerTudoAberto(true);
      setDiagAberto(true);
      setAba("alertas");
    } else if (local === "abrir-primeira") {
      const primeira = linhasTabela[0] ?? (clients ?? [])[0];
      if (primeira) abrirPainel(primeira.id, document.activeElement as HTMLElement | null);
    }
  };
  const clinicaDoPainel = painelId ? (clients ?? []).find((c) => c.id === painelId) ?? null : null;
  const notaDoPainel = clinicaDoPainel ? (notaPorCliente.get(clinicaDoPainel.id) ?? null) : null;
  const fatoresDoPainel = (() => {
    if (!clinicaDoPainel) return [];
    const sd = saudePorCliente.get(clinicaDoPainel.id);
    if (!sd) return [];
    const i = (clients ?? []).findIndex((c) => c.id === clinicaDoPainel.id);
    return fatoresDaNota(Object.fromEntries(FONTES.map((f) => [f, sd[f].status])), qualidades[i]?.data ?? []);
  })();
  const numerosDoPainel = clinicaDoPainel
    ? (["mandaram_mensagem", "agendaram", "fecharam"] as const).map((k) => {
        const n = numerosQ.data?.get(clinicaDoPainel.id);
        const rotulo = k === "mandaram_mensagem" ? "Chamaram" : k === "agendaram" ? "Agendaram" : "Fecharam";
        return { rotulo, valor: n?.atual[k] == null ? "–" : n.atual[k]!.toLocaleString("pt-BR"), delta: deltaTxt(n?.atual[k], n?.antes[k]) };
      })
    : [];

  return (
    <div className="dbx adm adm-carteira">
      <NxTopo
        pergunta="Quais clínicas precisam de você hoje? As que pedem atenção vêm primeiro na lista."
        meta={<AdmChip tom="marca" semIcone>Números dos últimos 30 dias contra os 30 anteriores</AdmChip>}
        acao={
          <Link to="/sap" className="adm-btn">
            Cadastrar clínica nova (SAP) <ArrowRight aria-hidden />
          </Link>
        }
      />

      <NxVeredito
        tela="carteira"
        carregando={carregandoUrg}
        veredito={vereditoDaTela}
        // Piloto da Carteira: a faixa fica vermelha quando alguma clínica precisa de você (o selo diz a palavra; nunca só a cor).
        estilo={vereditoDaTela?.tipo === "veredito" && vereditoDaTela.tom !== "bom" && vereditoDaTela.tom !== "neutro" ? "faixa-alerta" : "faixa"}
        acao={
          <button type="button" className="adm-btn" aria-pressed={tv} onClick={() => setTv((v) => !v)} title={tv ? "Voltar ao menu e à letra de sempre (Esc)" : "Letra grande e sem o menu, para a tela da sala"}>
            {tv ? <X aria-hidden /> : <Tv aria-hidden />}
            {tv ? "Sair do modo TV" : "Modo TV"}
          </button>
        }
      />

      <AdmContadores rotulo="Números da carteira">
        <AdmContador
          className="dbx-card"
          i={0}
          icone={<AlertTriangle />}
          rotulo="Problemas abertos"
          valor={lendoUrg(nums.problemasAbertos)}
          tom={carregandoUrg ? "neutro" : tomDe(nums.problemasAbertos, "atencao")}
          nota={
            <>
              <span className="adm-urgencia__quem">
                {(["Equipe", "Cliente", "Meta"] as const).map((q) => (
                  <AdmChip key={q} tom="marca" semIcone titulo={`Problemas que ${q === "Meta" ? "a Meta resolve" : q === "Equipe" ? "a equipe resolve" : "o cliente resolve"}`}>
                    {q} {carregandoUrg ? "…" : nums.porQuem[q]}
                  </AdmChip>
                ))}
              </span>
              <span className="adm-urgencia__vs">vs semana passada: Falta dado (sem histórico)</span>
            </>
          }
        />
        <AdmContador
          className="dbx-card"
          i={1}
          icone={<Clock />}
          rotulo="Ação hoje"
          valor={lendoUrg(nums.acaoHoje)}
          tom={carregandoUrg ? "neutro" : tomDe(nums.acaoHoje, "critico")}
          nota={
            <>
              <span className="adm-urgencia__vs">clínicas na faixa Ruim da nota dos dados (abaixo de 60)</span>
              <span className="adm-urgencia__vs">vs semana passada: Falta dado (sem histórico)</span>
            </>
          }
        />
        <AdmContador
          className="dbx-card"
          i={2}
          icone={<Calculator />}
          rotulo="Clínicas com nota"
          valor={carregandoUrg ? "…" : `${nums.comNota} de ${nums.total}`}
          tom="marca"
          nota={
            <>
              <span className="adm-urgencia__vs">{carregandoUrg ? "Lendo as fontes…" : nums.semNota ? `${nums.semNota} sem nota: faltam fontes ligadas` : "Todas com nota das fontes"}</span>
              <span className="adm-urgencia__vs">A nota é a saúde dos dados, não o resultado</span>
            </>
          }
        />
      </AdmContadores>
      {statusQ.isError && (
        <NxAlertaCurto titulo="Não consegui ler o status das fontes agora." passo="Tente de novo em instantes. Os números abaixo podem estar incompletos." />
      )}
      {(avisosQ.data?.reservas.length ?? 0) > 0 && (
        <NxAlertaCurto tom="atencao" titulo="O servidor não tem uma reserva que uma conexão ativa usa">
          {avisosQ.data!.reservas.map((a) => (
            <span key={a.variavel} style={{ display: "block" }}>{a.texto}</span>
          ))}
        </NxAlertaCurto>
      )}

      <div className="adm-filtros">
        <div className="adm-busca">
          <Search aria-hidden />
          <input
            autoComplete="off"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente por nome, especialidade ou @"
            aria-label="Buscar cliente"
          />
        </div>
        <div className="adm-pilulas" role="group" aria-label="Filtrar clínicas pela nota dos dados">
          {chipDeCor("todas", "Todas", "Todas as clínicas")}
          {chipDeCor("vermelho", "Só vermelhos", "Nota dos dados abaixo de 60 (faixa Ruim)")}
          {chipDeCor("amarelo", "Só amarelos", "Nota dos dados de 60 a 84 (faixa Atenção)")}
          {chipDeCor("sem-nota", "Sem nota", "Sem fonte ligada para calcular a nota dos dados")}
        </div>
        <label className="adm-ordem">
          Ordenar por
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
            <option value="urgencia">Mais problemas abertos</option>
            <option value="pior">Saúde das fontes: pior primeiro</option>
            <option value="nota">Nota da saúde dos dados (menor primeiro)</option>
            <option value="nome">Nome</option>
          </select>
        </label>
      </div>
      {filtro !== "todos" && (
        <p className="adm-urgencia__filtro-ativo">
          Também filtrando por: <b>{ROTULO_FILTRO_EXTRA[filtro]}</b>{" "}
          <button type="button" className="adm-link" onClick={() => setFiltro("todos")}>Tirar este filtro</button>
        </p>
      )}

      {isLoading ? (
        <Carregando texto="Lendo os clientes…" />
      ) : (
        <section className="adm-lista-card" aria-label="Clínicas da carteira">
          <div className="adm-lista-head" aria-hidden>
            <span>Clínica</span>
            <span>Saúde dos dados e alertas</span>
            <span>Últimos 30 dias</span>
            <span />
          </div>
          <ul className="adm-lista">
            {linhasTabela.map((c, idx) => {
              const handle = c.instagram_handle || contasIg?.get(c.id) || null;
              const r = roiDe(c.id);
              return (
                <LinhaDaCarteira
                  key={c.id}
                  c={c}
                  handle={handle}
                  numeros={numerosQ.data?.get(c.id)}
                  cor={piorCor(c.id)}
                  sd={saudePorCliente.get(c.id)}
                  nota={notaPorCliente.get(c.id) ?? null}
                  sp={sapPorCliente?.get(c.id)}
                  roi={r}
                  grupoLinha={r && entraNaCarteira(c) ? grupoSemRoi(r) : null}
                  alertas={alertasPorCliente.get(c.id) ?? []}
                  aoAbrir={(el) => abrirPainel(c.id, el)}
                  idx={idx}
                  fontesLidas={!carregandoSaude && !!statusQ.data}
                />
              );
            })}
          </ul>
          {nClinicas > 0 && linhasTabela.length === 0 && (
            <p className="adm-vazio">
              Nenhum cliente com esse filtro.{" "}
              <button type="button" className="adm-link" onClick={() => { setBusca(""); setFiltro("todos"); }}>Limpar</button>
            </p>
          )}
          {nClinicas === 0 && <p className="adm-vazio">Nenhum cliente cadastrado ainda.</p>}
        </section>
      )}
      <NxNota>
        Retorno (ROI) e nota das fontes só aparecem quando há dado para calcular. Variação só com pelo menos 30 no período anterior: base pequena daria um percentual enganoso.
      </NxNota>

      <NxDescobertas
        titulo="O que descobrimos"
        itens={achados}
        clientId=""
        aoAgir={agirNaDescoberta}
      />

      <details className="adm-det adm-urgencia__ver-tudo" open={verTudoAberto} onToggle={(e) => setVerTudoAberto(e.currentTarget.open)}>
        <summary>
          <b>Ver tudo</b>
          <small>os 6 contadores, mais filtros, diagnóstico das fontes e links curtos sem cliente</small>
        </summary>
        <div className="adm-det__corpo">
      <NxBlocoDoVerTudo rotulo="Resumo da carteira" cabeca={cabecaDosContadores({ comProblema: isLoading || carregandoSaude ? null : nAtencao, total: nClinicas })}>
      <AdmContadores rotulo="Resumo da carteira">
              <AdmContador className="dbx-card" i={0} icone={<Building2 />} rotulo="Clínicas na carteira" valor={isLoading ? "…" : nClinicas} nota="Ver todas" tom="marca" onClick={() => setFiltro("todos")} ativo={filtro === "todos"} />
              <AdmContador className="dbx-card" i={1} icone={<AlertTriangle />} rotulo="Fonte com problema" valor={lendo(nAtencao)} nota="Clínicas com fonte atrasada, parada ou com erro" tom={carregandoSaude ? "neutro" : tomDe(nAtencao, "atencao")} onClick={() => setFiltro("problema")} ativo={filtro === "problema"} />
              <AdmContador className="dbx-card" i={2} icone={<Unplug />} rotulo="Fonte parada ou com erro" valor={lendo(totalVermelhas)} nota={carregandoSaude ? "Lendo as fontes…" : totalVermelhas ? `Em ${vermelhas.length} ${vermelhas.length === 1 ? "clínica" : "clínicas"} · mais de 3 dias` : "Nenhuma"} tom={carregandoSaude ? "neutro" : tomDe(totalVermelhas, "critico")} />
              <AdmContador className="dbx-card" i={3} icone={<Clock />} rotulo="Fonte atrasada" valor={lendo(totalAmarelas)} nota={carregandoSaude ? "Lendo as fontes…" : totalAmarelas ? `Em ${clinicasAmarelas} ${clinicasAmarelas === 1 ? "clínica" : "clínicas"} · 2 a 3 dias` : "Nenhuma"} tom={carregandoSaude ? "neutro" : tomDe(totalAmarelas, "atencao")} />
              <AdmContador className="dbx-card" i={4} icone={<UserX />} rotulo="Médico não entra" valor={avisosQ.isError ? "–" : nNaoEntra == null ? "…" : nNaoEntra} nota={avisosQ.isError ? `Não consegui ler o último acesso · ${notaAcesso}` : `Há mais de ${DIAS_SEM_ENTRAR} dias · ${notaAcesso}`} tom={avisosQ.isError ? "neutro" : tomDe(nNaoEntra, "atencao")} onClick={() => setFiltro("nao_entra")} ativo={filtro === "nao_entra"} />
              <AdmContador className="dbx-card" i={5} icone={<Calculator />} rotulo="Sem ROI calculável" valor={nSemRoi == null ? "…" : nSemRoi} nota={nSemRoi == null ? "Lendo o retorno de 30 dias…" : `${nCliente} cliente (CRM) · ${nEquipe} equipe (fonte ou etapa) · ${nNaoSeAplica} não se aplica`} titulo={`${ROTULO_GRUPO_SEM_ROI.cliente}\n${ROTULO_GRUPO_SEM_ROI.equipe}\n${ROTULO_GRUPO_SEM_ROI.nao_se_aplica}`} tom={tomDe(nSemRoi, "atencao")} onClick={() => setFiltro("sem_roi")} ativo={filtro === "sem_roi"} />
      </AdmContadores>
        {/* Todos, Com problema, Sem ROI e Não entra saíram (quick-ver-tudo): eram os mesmos filtros e números dos contadores logo acima, que já
            filtram com um toque. Fica o filtro que só esta linha tinha. */}
        <div className="adm-pilulas" role="group" aria-label="Mais filtros">
          {chipFiltro("sem_acesso", "Sem acesso criado", nSemAcesso ?? undefined)}
        </div>
      </NxBlocoDoVerTudo>
          <NxBlocoDoVerTudo cabeca={cabecaDoDiagnosticoDasFontes(carregandoSaude ? null : vermelhas.flatMap((v) => v.itens.map((i) => NOME_FONTE[i.fonte])))}>
          <details className="adm-det" open={diagAberto} onToggle={(e) => setDiagAberto(e.currentTarget.open)}>
            <summary>
              Diagnóstico das fontes
              <small>{totalVermelhas ? `${totalVermelhas} em vermelho` : "nenhuma em vermelho"} · só equipe técnica</small>
            </summary>
            <div className="adm-det__corpo">
              <div className="adm-abas" role="tablist" aria-label="Diagnóstico das fontes">
                <button type="button" role="tab" aria-selected={aba === "alertas"} className="adm-pilula" onClick={() => setAba("alertas")}>Alertas <small>{totalVermelhas}</small></button>
                <button type="button" role="tab" aria-selected={aba === "problemas"} className="adm-pilula" onClick={() => setAba("problemas")}>Problemas <small>{problemas.length}</small></button>
                <button type="button" role="tab" aria-selected={aba === "resposta"} className="adm-pilula" onClick={() => setAba("resposta")}>Sem resposta</button>
                <button type="button" role="tab" aria-selected={aba === "clinica"} className="adm-pilula" onClick={() => setAba("clinica")}>Por clínica <small>{nClinicas}</small></button>
              </div>
              <div>
                {aba === "alertas" && (
                  <div className="grid gap-3">
                    {statusQ.isError && (
                      <p className="text-sm" style={{ color: "var(--crit)" }}>
                        Não consegui ler o status das fontes agora. Tente de novo em instantes.
                      </p>
                    )}
                    {!carregandoSaude && statusQ.data && (
                      totalVermelhas === 0 ? (
                        <p className="adm-ok">Nenhuma fonte vermelha: tudo ligado tem dado de até 3 dias atrás e nenhuma atualização deu erro.</p>
                      ) : (
                        <div className="adm-lista-card">
                          <p className="adm-grupo-titulo">
                            {totalVermelhas} fonte{totalVermelhas === 1 ? "" : "s"} em vermelho em {vermelhas.length} cliente{vermelhas.length === 1 ? "" : "s"}
                            <small>mais de 3 dias sem dado ou erro</small>
                          </p>
                          <ul className="adm-itens">
                            {vermelhas.map(({ c, itens }) => (
                              <li key={c.id} className="adm-item adm-item--critico">
                                <div className="adm-item__corpo">
                                  <p className="adm-item__titulo">{c.name}</p>
                                  {itens.map(({ fonte, s }) => (
                                    <div key={fonte} className="grid gap-1">
                                      <div className="adm-chips">
                                        <SeloStatus st={s.status} texto={`${NOME_FONTE[fonte]}: ${s.status.rotulo.toLowerCase()}`} />
                                        <span className="adm-item__mais">{s.status.data ? s.status.detalhe : "sem dado gravado"}</span>
                                      </div>
                                      {s.causa && <p className="adm-item__mais">{s.causa}</p>}
                                    </div>
                                  ))}
                                </div>
                                <div className="adm-item__fim">
                                  <Link to="/admin/$clientId" params={{ clientId: c.id }} className="adm-btn adm-btn--mini">Gerenciar <ArrowRight aria-hidden /></Link>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    )}
                    <SaudeShortio />
                  </div>
                )}
                {aba === "problemas" && (
                  <PainelSaudeFontes
                    problemas={problemas}
                    clientes={clients ?? []}
                    carregando={isLoading || carregandoSaude || qualidades.some((q) => q.isLoading)}
                    lidos={statusQ.data ? (clients ?? []).length : 0}
                    total={(clients ?? []).length}
                    falhas={statusQ.isError ? (clients ?? []).length : 0}
                  />
                )}
                {aba === "resposta" && <SemRespostaAgora />}
                {aba === "clinica" && (
                  <>
                    <div className="adm-chips mb-3" aria-label="Legenda das cores">
                      {LEGENDA_STATUS.map((l) => (
                        <AdmChip key={l.cor} tom={tomDaCor(l.cor)}>{l.texto}</AdmChip>
                      ))}
                    </div>
                    {isLoading ? (
                      <Carregando texto="Lendo os clientes…" />
                    ) : (
                      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
                        <table className="w-full text-sm empilha">
                          <thead>
                            <tr className="text-left text-xs" style={{ color: "var(--ink-2)", background: "var(--surface-2)" }}>
                              <th className="px-4 py-2">Nome</th>
                              <th className="px-4 py-2" title="0 a 100: fontes em dia, fontes por ligar e problemas de dado. Não é o resultado da clínica.">Nota dos dados</th>
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
                                      <div className="min-w-0">
                                        <div className="font-semibold">{c.name}</div>
                                        <div className="max-w-[260px] truncate text-xs" style={{ color: "var(--text-dim)" }} title={[c.specialty, handle ? `@${handle}` : null].filter(Boolean).join(" · ") || "sem especialidade nem Instagram"}>
                                          {[c.specialty, handle ? `@${handle}` : null].filter(Boolean).join(" · ") || "sem especialidade nem Instagram"}
                                        </div>
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
                                        <span className="inline-flex flex-col items-start gap-1">
                                          <Link to="/$clientId" params={{ clientId: c.id }} search={{ preset: "30d" }} className="whitespace-nowrap text-sm font-bold" style={{ color: cor }} title={r.motivoSemCalculo ?? "Ver o retorno no Resultado"}>
                                            {resumoRoi(r)}
                                          </Link>
                                          <SeloConfianca selo={r.selo} />
                                        </span>
                                      );
                                    })()}
                                  </td>
                                  <td className="px-4 py-3 text-right align-top" data-label="">
                                    <Link to="/admin/$clientId" params={{ clientId: c.id }} className="adm-btn adm-btn--mini" title="Gerenciar fontes e acesso">
                                      Gerenciar <ArrowRight aria-hidden />
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </details>
          </NxBlocoDoVerTudo>
          <details className="adm-det">
            <summary>Links curtos sem cliente</summary>
            <div className="adm-det__corpo">
              <LinksSemCliente clientes={[...(clients ?? [])].filter((c: any) => c.active !== false).sort((x: any, y: any) => x.name.localeCompare(y.name))} />
            </div>
          </details>
        </div>
      </details>

      <details className="adm-det">
        <summary>
          Cadastrar admin ou cliente só do Nexo (exceção)
          <small>clínica nova entra pelo SAP</small>
        </summary>
        <div className="adm-det__corpo">
          <NxNota>Clínica nova entra pelo Sistema de Aquisição. Use o cadastro abaixo só para cliente que não vai passar pelo programa.</NxNota>
          <div className="adm-secoes">
            <AdmSecao icone={<ShieldCheck />} titulo="Novo admin da equipe" sub="Entra com acesso a todas as clínicas.">
              <NewAdminForm />
            </AdmSecao>
            <AdmSecao icone={<UserPlus />} titulo="Novo cliente só do Nexo" sub="Sem passar pelo programa de aquisição.">
              <NewClientForm />
            </AdmSecao>
          </div>
        </div>
      </details>

      <NxPainelDaClinica
        clinica={clinicaDoPainel ? { id: clinicaDoPainel.id, nome: clinicaDoPainel.name, sub: [clinicaDoPainel.specialty, clinicaDoPainel.instagram_handle || contasIg?.get(clinicaDoPainel.id) ? `@${clinicaDoPainel.instagram_handle || contasIg?.get(clinicaDoPainel.id)}` : null].filter(Boolean).join(" · ") || "sem especialidade nem Instagram" } : null}
        nota={notaDoPainel}
        fatores={fatoresDoPainel}
        alertas={clinicaDoPainel ? (alertasPorCliente.get(clinicaDoPainel.id) ?? []) : []}
        numeros={numerosDoPainel}
        aberto={painelId != null}
        aoFechar={fecharPainel}
      />
    </div>
  );
}
