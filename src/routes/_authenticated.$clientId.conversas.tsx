import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Painel, Selo } from "@/components/visual";

export const Route = createFileRoute("/_authenticated/$clientId/conversas")({
  component: ConversasPage,
});

type Conversa = {
  id: string;
  pessoa_nome: string;
  telefone_final: string | null;
  provider: string;
  ultima_msg_em: string | null;
  ultima_msg_texto: string | null;
  total_msgs: number;
  lead_id: string | null;
  codigo_ref: string | null;
};

type Mensagem = {
  id: string;
  direcao: "entrada" | "saida" | "sistema";
  autor: string | null;
  texto: string | null;
  tipo: string | null;
  enviada_em: string;
};

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

function quando(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const ROTULO_TIPO: Record<string, string> = {
  AUDIO: "🎤 áudio",
  IMAGE: "🖼 imagem",
  VIDEO: "🎬 vídeo",
  DOCUMENT: "📎 documento",
  STICKER: "figurinha",
};

function ConversasPage() {
  const { clientId } = Route.useParams();
  const [aberta, setAberta] = useState<string | null>(null);

  const lista = useQuery({
    queryKey: ["conversas", clientId],
    queryFn: async () => {
      const { data, error } = await rpc("listar_conversas", { p_client: clientId, p_limite: 200, p_offset: 0 });
      if (error) throw new Error(error.message);
      return (data ?? []) as Conversa[];
    },
  });

  const msgs = useQuery({
    queryKey: ["mensagens", aberta],
    enabled: !!aberta,
    queryFn: async () => {
      const { data, error } = await rpc("ler_mensagens", { p_conversa: aberta });
      if (error) throw new Error(error.message);
      return (data ?? []) as Mensagem[];
    },
  });

  const atual = lista.data?.find((c) => c.id === aberta);

  return (
    <div className="space-y-4">
      <Painel
        icone={MessageSquare}
        titulo="Conversas do WhatsApp"
        resumo="O que o paciente escreveu e o que a clínica respondeu, ligado ao lead e ao link de origem."
        ajuda="Telefone aparece só com os 4 últimos dígitos. Cada abertura de conversa fica registrada (quem, quando)."
      >
        <div className="mb-3 flex items-center gap-2 text-xs" style={{ color: "var(--text-dim)" }}>
          <ShieldCheck size={14} /> Acesso restrito e registrado.
        </div>
        {lista.isLoading && <p className="text-sm">Carregando…</p>}
        {lista.error && <p className="text-sm" style={{ color: "var(--danger, #c0392b)" }}>{(lista.error as Error).message}</p>}
        {lista.data && lista.data.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            Nenhuma conversa guardada ainda para este cliente. Elas entram a cada sincronização do WhatsApp.
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <ul className="max-h-[70vh] min-w-0 space-y-1 overflow-y-auto pr-1">
            {lista.data?.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setAberta(c.id)}
                  className="w-full rounded-lg border p-2.5 text-left"
                  style={{
                    background: c.id === aberta ? "var(--surface-2, var(--surface))" : "var(--surface)",
                    borderColor: c.id === aberta ? "var(--accent)" : "var(--border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.pessoa_nome}</span>
                    <span className="shrink-0 text-xs" style={{ color: "var(--text-faint)" }}>{quando(c.ultima_msg_em)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-dim)" }}>
                    {c.ultima_msg_texto || "(mídia)"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.telefone_final && <Selo>{c.telefone_final}</Selo>}
                    <Selo>{c.total_msgs} msgs</Selo>
                    {c.lead_id && <Selo cor="var(--accent)">lead</Selo>}
                    {c.codigo_ref && <Selo cor="var(--accent)" titulo="Veio de um link rastreado">via link</Selo>}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="min-w-0 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            {!aberta && <p className="text-sm" style={{ color: "var(--text-dim)" }}>Escolha uma conversa à esquerda.</p>}
            {aberta && (
              <>
                <div className="mb-2 text-sm font-semibold">{atual?.pessoa_nome ?? "Conversa"}</div>
                {msgs.isLoading && <p className="text-sm">Abrindo…</p>}
                {msgs.error && <p className="text-sm">{(msgs.error as Error).message}</p>}
                <div className="flex max-h-[62vh] flex-col gap-1.5 overflow-y-auto">
                  {msgs.data?.map((m) => {
                    const paciente = m.direcao === "entrada";
                    const corpo = m.texto || ROTULO_TIPO[m.tipo ?? ""] || m.tipo || "";
                    return (
                      <div key={m.id} className={`flex ${paciente ? "justify-start" : "justify-end"}`}>
                        <div
                          className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3 py-1.5 text-sm"
                          style={{
                            background: paciente ? "var(--muted, #eee)" : "var(--accent)",
                            color: paciente ? "var(--text)" : "var(--accent-fg, #fff)",
                          }}
                        >
                          {corpo}
                          <div className="mt-0.5 text-[10px] opacity-70">
                            {paciente ? "Paciente" : m.autor || "Clínica"} · {quando(m.enviada_em)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </Painel>
    </div>
  );
}
