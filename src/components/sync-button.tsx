import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Alvo = "posts" | "anuncios" | "atendimento" | "comentarios" | "crm" | "historico" | "tudo";

const NOMES: Record<string, string> = {
  posts: "Instagram",
  historico: "Histórico do Instagram",
  comentarios: "Comentários",
  anuncios: "Anúncios",
  atendimento: "Atendimento",
  crm: "CRM",
};

// "Atualizar dados" dispara cada fonte em separado e em paralelo. Assim a barra de
// progresso é REAL: avança quando uma fonte termina de verdade, em vez de
// simular um percentual sobre uma chamada única.
const PARTES_TUDO = ["posts", "comentarios", "anuncios", "atendimento", "crm"] as const;

const FRASES: Record<string, string> = {
  posts: "Buscando os posts e métricas do Instagram…",
  historico: "Buscando até 1 ano de histórico diário. Pode levar alguns minutos, não feche a página…",
  comentarios: "Lendo comentários e dúvidas dos pacientes…",
  anuncios: "Reconferindo 90 dias de anúncios…",
  atendimento: "Sincronizando o atendimento do WhatsApp…",
  crm: "Atualizando o CRM…",
};

type Parte = {
  ok?: boolean;
  linhas?: number;
  erro?: string | null;
  dados_ate?: string | null;
  nada_a_fazer?: string;
};
type Mensagem = { texto: string; erro: boolean };

// "2026-09-18" -> "18/09". Sem new Date(): evitaria o deslocamento de fuso.
function ddmm(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}` : null;
}

// Mensagem honesta de uma parte: diz até que data o DADO vai (lida do banco
// depois do sync), distingue "nada novo" de "atualizado" e nunca transforma
// erro em sucesso. Nunca "0 linhas atualizadas" como se fosse vitória.
function mensagemDaParte(nome: string, p: Parte, sozinha: boolean): Mensagem | null {
  const rotulo = NOMES[nome] ?? nome;
  if (p.nada_a_fazer) return sozinha ? { texto: p.nada_a_fazer, erro: false } : null;
  if (p.ok === false || p.erro) {
    return { texto: `${rotulo}: erro — ${p.erro ?? "falha na sincronização"}`, erro: true };
  }
  const ate = ddmm(p.dados_ate);
  if ((p.linhas ?? 0) > 0) {
    return { texto: ate ? `${rotulo} atualizado até ${ate}.` : `${rotulo} atualizado.`, erro: false };
  }
  return { texto: ate ? `${rotulo}: nada novo desde ${ate}.` : `${rotulo}: nada novo.`, erro: false };
}

type EstadoParte = "ok" | "erro" | "nada";

async function chamar(token: string, clientId: string, alvo: string): Promise<{ status: number; corpo: any }> {
  const resposta = await fetch("/api/sync/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ client_id: clientId, alvo }),
  });
  let corpo: any = null;
  try {
    corpo = await resposta.json();
  } catch {
    corpo = { error: `Resposta inválida (${resposta.status})` };
  }
  return { status: resposta.status, corpo };
}

// O sync roda numa função da Vercel e pode levar dezenas de segundos. A barra mostra
// o andamento: em "Atualizar dados" é a contagem real de fontes concluídas; nos
// botões de uma fonte só, enche de forma suave até a resposta chegar (sem inventar
// um percentual), com o tempo decorrido ao lado.
export function SyncButton({ clientId, alvo }: { clientId: string; alvo: Alvo }) {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<"parado" | "rodando" | "concluindo">("parado");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [feitas, setFeitas] = useState<Record<string, EstadoParte>>({});
  const [segundos, setSegundos] = useState(0);
  const [progresso, setProgresso] = useState(0);
  const [houveErro, setHouveErro] = useState(false);
  const inicio = useRef(0);
  const feitasRef = useRef<Record<string, EstadoParte>>({});

  const ROTULOS: Record<Alvo, string> = {
    tudo: "Atualizar dados",
    posts: "Atualizar posts",
    historico: "Completar histórico (1 ano)",
    anuncios: "Atualizar anúncios",
    atendimento: "Atualizar atendimento",
    comentarios: "Atualizar comentários",
    crm: "Atualizar CRM",
  };
  const rotulo = ROTULOS[alvo];
  const rodando = estado === "rodando";
  const total = alvo === "tudo" ? PARTES_TUDO.length : 1;

  // Relógio e preenchimento suave da barra enquanto espera.
  useEffect(() => {
    if (estado !== "rodando") return;
    const id = setInterval(() => {
      const t = Date.now() - inicio.current;
      setSegundos(Math.floor(t / 1000));
      const concluidas = Object.keys(feitasRef.current).length;
      const base = (concluidas / total) * 100;
      // Dentro da etapa em andamento anda devagar até 85% dela, sem nunca chegar a 100.
      const fatia = 100 / total;
      const crescimento = fatia * 0.85 * (1 - Math.exp(-t / (alvo === "tudo" ? 14000 : 16000)));
      setProgresso(Math.min(97, base + (concluidas < total ? crescimento : 0)));
    }, 200);
    return () => clearInterval(id);
  }, [estado, total, alvo]);

  function marcar(nome: string, e: EstadoParte) {
    feitasRef.current = { ...feitasRef.current, [nome]: e };
    setFeitas(feitasRef.current);
  }

  async function sincronizar() {
    inicio.current = Date.now();
    feitasRef.current = {};
    setFeitas({});
    setSegundos(0);
    setProgresso(2);
    setHouveErro(false);
    setEstado("rodando");
    setMensagens([]);
    let erroGeral = false;
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sessão expirada — entre de novo.");

      const msgs: Mensagem[] = [];

      if (alvo === "tudo") {
        // Cada fonte responde por si: uma sem conta configurada não deve parecer
        // falha da atualização inteira (some da lista).
        const resultados = await Promise.all(
          PARTES_TUDO.map(async (nome) => {
            try {
              const { status, corpo } = await chamar(token, clientId, nome);
              const parte: Parte =
                !corpo || (status >= 400 && status !== 207)
                  ? { ok: false, erro: corpo?.error ?? `Falhou (${status})` }
                  : (corpo as Parte);
              marcar(nome, parte.nada_a_fazer ? "nada" : parte.ok === false || parte.erro ? "erro" : "ok");
              return { nome, parte, status };
            } catch (err) {
              marcar(nome, "erro");
              return { nome, parte: { ok: false, erro: err instanceof Error ? err.message : String(err) } as Parte, status: 0 };
            }
          }),
        );
        for (const r of resultados) {
          const m = mensagemDaParte(r.nome, r.parte, false);
          if (m) msgs.push(m);
        }
        if (msgs.length === 0) msgs.push({ texto: "Nada para atualizar neste cliente.", erro: false });
      } else {
        const { status, corpo } = await chamar(token, clientId, alvo);
        if (status >= 400 && status !== 207) throw new Error(corpo?.error ?? `Falhou (${status})`);
        marcar(alvo, corpo?.nada_a_fazer ? "nada" : corpo?.ok === false || corpo?.erro ? "erro" : "ok");
        const m = mensagemDaParte(alvo, corpo as Parte, true);
        if (m) msgs.push(m);
        if (status === 207 && !msgs.some((x) => x.erro)) msgs.push({ texto: "Algumas contas falharam.", erro: true });
      }

      erroGeral = msgs.some((m) => m.erro);
      setMensagens(msgs);
      await queryClient.invalidateQueries();
    } catch (err) {
      erroGeral = true;
      setMensagens([{ texto: err instanceof Error ? err.message : String(err), erro: true }]);
    } finally {
      setHouveErro(erroGeral);
      setProgresso(100);
      setEstado("concluindo");
      // A barra fica cheia um instante (verde ou vermelha) e some.
      setTimeout(() => setEstado("parado"), 1600);
    }
  }

  const concluidas = Object.keys(feitas).length;
  const mostrarBarra = estado !== "parado";
  const fraseAtual =
    alvo === "tudo"
      ? (PARTES_TUDO.find((p) => !feitas[p]) ? FRASES[PARTES_TUDO.find((p) => !feitas[p])!] : "Finalizando…")
      : FRASES[alvo] ?? "Sincronizando…";

  return (
    <div className="flex flex-col items-end gap-1.5" style={{ minWidth: mostrarBarra ? 260 : undefined }}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={sincronizar}
          disabled={estado !== "parado"}
          aria-busy={rodando}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium disabled:opacity-70"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
        >
          {estado === "concluindo" ? (
            houveErro ? <X size={14} /> : <Check size={14} />
          ) : (
            <RefreshCw size={14} className={rodando ? "animate-spin" : undefined} />
          )}
          {rodando ? (alvo === "tudo" ? `Sincronizando ${concluidas}/${total}…` : "Sincronizando…") : estado === "concluindo" ? (houveErro ? "Terminou com erro" : "Concluído") : rotulo}
        </button>
      </div>

      {mostrarBarra && (
        <div className="w-full" style={{ maxWidth: 360 }}>
          <div
            role="progressbar"
            aria-label="Progresso da sincronização"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progresso)}
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--border)" }}
          >
            <div
              className={rodando ? "sync-bar-fill sync-bar-fill-rodando" : "sync-bar-fill"}
              style={{
                width: `${progresso}%`,
                height: "100%",
                borderRadius: 999,
                transition: "width 280ms ease-out, background-color 200ms",
                background: estado === "concluindo" ? (houveErro ? "var(--danger)" : "var(--good)") : "var(--accent)",
              }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-[11px]" style={{ color: "var(--text-dim)" }}>
            <span>{estado === "concluindo" ? (houveErro ? "Alguma fonte falhou." : "Dados atualizados.") : fraseAtual}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {alvo === "tudo" && rodando ? `${concluidas}/${total} · ` : ""}
              {segundos}s
            </span>
          </div>
          {alvo === "tudo" && (
            <div className="mt-1.5 flex flex-wrap justify-end gap-1">
              {PARTES_TUDO.map((p) => {
                const e = feitas[p];
                return (
                  <span
                    key={p}
                    className="rounded-full border px-1.5 py-0.5 text-[10px]"
                    style={{
                      borderColor: e === "erro" ? "var(--danger)" : e === "ok" ? "var(--good)" : "var(--border)",
                      color: e === "erro" ? "var(--danger)" : e === "ok" ? "var(--text)" : "var(--text-dim)",
                      opacity: e ? 1 : 0.7,
                    }}
                  >
                    {e === "erro" ? "✕ " : e === "nada" ? "– " : e ? "✓ " : "… "}
                    {NOMES[p]}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      {mensagens.length > 0 && (
        <div className="flex flex-col items-end text-xs" aria-live="polite">
          {mensagens.map((m, i) => (
            <span key={i} style={{ color: m.erro ? "var(--danger)" : "var(--text-dim)" }}>
              {m.texto}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
