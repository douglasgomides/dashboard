import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Alvo = "posts" | "anuncios" | "atendimento" | "comentarios" | "tudo";

// O sync roda dentro de uma função da Vercel e pode levar dezenas de segundos.
// Nada de barra de progresso falsa: o botão diz o que está fazendo e espera.
export function SyncButton({ clientId, alvo }: { clientId: string; alvo: Alvo }) {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<"parado" | "rodando">("parado");
  const [recado, setRecado] = useState<string | null>(null);
  const [deuErro, setDeuErro] = useState(false);

  const ROTULOS: Record<Alvo, string> = {
    tudo: "Atualizar dados",
    posts: "Sincronizar posts",
    anuncios: "Sincronizar anúncios",
    atendimento: "Sincronizar atendimento",
    comentarios: "Sincronizar comentários",
  };
  const rotulo = ROTULOS[alvo];

  async function sincronizar() {
    setEstado("rodando");
    setRecado(null);
    setDeuErro(false);
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

      if (corpo?.nada_a_fazer) {
        setRecado(corpo.nada_a_fazer);
      } else if (alvo === "anuncios") {
        setRecado(`${corpo.linhas ?? 0} linhas atualizadas.`);
      } else if (alvo === "atendimento") {
        setRecado(`${corpo.sessoes ?? 0} atendimentos atualizados.`);
      } else if (alvo === "comentarios") {
        setRecado(`${corpo.comentarios ?? 0} comentários atualizados.`);
      } else if (alvo === "tudo") {
        // Em "tudo" cada parte responde por si: uma sem conta configurada não
        // deve parecer falha da atualização inteira.
        const p = corpo.partes ?? {};
        const pedacos: string[] = [];
        if (p.posts?.posts) pedacos.push(`${p.posts.posts} posts`);
        if (p.comentarios?.comentarios) pedacos.push(`${p.comentarios.comentarios} comentários`);
        if (p.anuncios?.linhas) pedacos.push(`${p.anuncios.linhas} linhas de anúncio`);
        if (p.atendimento?.sessoes) pedacos.push(`${p.atendimento.sessoes} atendimentos`);
        setRecado(pedacos.length ? `Atualizado: ${pedacos.join(", ")}.` : "Nada novo para atualizar.");
        const falhou = Object.values(p).some((r: any) => r?.erro);
        if (falhou) setDeuErro(true);
      } else {
        setRecado(`${corpo.posts ?? 0} posts atualizados.`);
      }

      // 207 = uma conta falhou e as outras não. Vale avisar sem tratar como
      // erro total, porque parte do dado entrou.
      if (resposta.status === 207) {
        setDeuErro(true);
        setRecado((r) => `${r ?? ""} Algumas contas falharam.`.trim());
      }

      await queryClient.invalidateQueries();
    } catch (err) {
      setDeuErro(true);
      setRecado(err instanceof Error ? err.message : String(err));
    } finally {
      setEstado("parado");
    }
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
      {recado && (
        <span className="text-xs" style={{ color: deuErro ? "var(--danger)" : "var(--text-dim)" }}>
          {recado}
        </span>
      )}
    </div>
  );
}
