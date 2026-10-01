import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Alvo = "posts" | "anuncios" | "atendimento" | "comentarios" | "crm" | "tudo";

const NOMES: Record<string, string> = {
  posts: "Instagram",
  comentarios: "Comentários",
  anuncios: "Anúncios",
  atendimento: "Atendimento",
  crm: "CRM",
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

// O sync roda dentro de uma função da Vercel e pode levar dezenas de segundos.
// Nada de barra de progresso falsa: o botão diz o que está fazendo e espera.
export function SyncButton({ clientId, alvo }: { clientId: string; alvo: Alvo }) {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<"parado" | "rodando">("parado");
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);

  const ROTULOS: Record<Alvo, string> = {
    tudo: "Atualizar dados",
    posts: "Sincronizar posts",
    anuncios: "Sincronizar anúncios",
    atendimento: "Sincronizar atendimento",
    comentarios: "Sincronizar comentários",
    crm: "Sincronizar CRM",
  };
  const rotulo = ROTULOS[alvo];

  async function sincronizar() {
    setEstado("rodando");
    setMensagens([]);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) throw new Error("Sessão expirada — entre de novo.");

      const resposta = await fetch("/api/sync/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ client_id: clientId, alvo }),
      });
      const corpo = await resposta.json();

      if (!resposta.ok && resposta.status !== 207) {
        throw new Error(corpo?.error ?? `Falhou (${resposta.status})`);
      }

      const msgs: Mensagem[] = [];
      if (alvo === "tudo") {
        // Em "tudo" cada parte responde por si: uma sem conta configurada não
        // deve parecer falha da atualização inteira (some da lista).
        for (const [nome, p] of Object.entries<Parte>(corpo.partes ?? {})) {
          const m = mensagemDaParte(nome, p, false);
          if (m) msgs.push(m);
        }
        if (msgs.length === 0) msgs.push({ texto: "Nada para atualizar neste cliente.", erro: false });
      } else {
        const m = mensagemDaParte(alvo, corpo as Parte, true);
        if (m) msgs.push(m);
      }

      // 207 sem texto de erro nas partes: ainda assim avisa.
      if (resposta.status === 207 && !msgs.some((m) => m.erro)) {
        msgs.push({ texto: "Algumas contas falharam.", erro: true });
      }
      setMensagens(msgs);

      await queryClient.invalidateQueries();
    } catch (err) {
      setMensagens([{ texto: err instanceof Error ? err.message : String(err), erro: true }]);
    } finally {
      setEstado("parado");
    }
  }

  // Conta conectada manualmente (ainda fora do pipeline automático de sync):
  // clicar sincronizar só traria erro. Mostra uma nota em vez do botão.
  if (clientId === "8d4b3b3f-74a7-419a-a113-35ebc02cb37f") {
    return (
      <span className="text-xs" style={{ color: "var(--text-dim)" }}>
        Dados atualizados manualmente — sincronização automática ainda não ativada para esta conta.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={sincronizar}
        disabled={estado === "rodando"}
        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium disabled:opacity-60"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        <RefreshCw size={14} className={estado === "rodando" ? "animate-spin" : undefined} />
        {estado === "rodando" ? "Sincronizando…" : rotulo}
      </button>
      {mensagens.length > 0 && (
        <div className="flex flex-col text-xs">
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
