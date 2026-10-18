import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { ROTULO_FALHA } from "@/components/auditoria-comercial";

// Experimento da semana: a falha comercial mais frequente vira UMA ação para a equipe testar por 7 dias, medida
// com a mesma leitura por IA das conversas (% de conversas comerciais com a falha), antes x durante.
// É ação interna da equipe: nada é enviado a paciente. Só admin começa ou conclui.

/** Ação de partida para cada falha; a equipe ajusta o texto antes de começar. */
export const ACAO_SUGERIDA: Record<string, string> = {
  sem_follow_up: "Voltar a falar em até 24 horas com todo paciente que parou de responder depois de receber informação ou preço.",
  sem_resposta: "Nenhuma conversa termina com o paciente sem resposta: no fim do dia, responder todas as que ficaram pendentes.",
  demora: "Responder a primeira mensagem do paciente em até 15 minutos no horário comercial.",
  desvio_preco: "Quando o paciente pedir preço, informar o valor na mesma resposta, junto com o que está incluso.",
  preco_sem_ancoragem: "Antes do valor, dizer em uma frase o que o paciente recebe (diferencial, o que está incluso) e depois o preço.",
  sem_cta: "Terminar toda resposta com uma pergunta de agendamento com dois horários concretos.",
  informacao_inconsistente: "Usar um texto padrão revisado para valores, endereço e preparo; não escrever de cabeça.",
  nome_errado: "Conferir o nome do paciente no cadastro antes de responder.",
  pressao: "Trocar insistência por uma pergunta aberta sobre a dúvida do paciente.",
  so_emoji: "Responder sempre com texto; emoji só como complemento.",
  desconto_reativo: "Não oferecer desconto antes de explicar o valor; desconto só com regra combinada com a clínica.",
  excesso_audio: "Preferir texto; áudio só se o paciente mandar áudio, e com até 1 minuto.",
};

type Medida = { conversas: number; n: number; pct: number | null };
type Experimento = {
  id: string; falha: string; acao: string; inicio: string; fim: string; estado: string;
  base_pct: number | null; base_n: number | null; base_conversas: number | null;
  resultado_pct: number | null; resultado_n: number | null; resultado_conversas: number | null;
  agora?: Medida; pode_concluir?: boolean;
};
type Dados = { atual: Experimento | null; ultimo: Experimento | null; sugestao: { conversas: number; falhas: { falha: string; n: number; pct: number }[] } | null };

const data = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const pct = (v: number | null | undefined) => (v == null ? "sem dado" : `${String(v).replace(".", ",")}%`);

function Comparacao({ antes, depois, nAntes, nDepois, rotuloDepois }: { antes: number | null; depois: number | null; nAntes: number | null; nDepois: number | null; rotuloDepois: string }) {
  const diff = antes != null && depois != null ? Math.round((depois - antes) * 10) / 10 : null;
  const cor = diff == null ? "var(--text-dim)" : diff < 0 ? "var(--ok, #1a7f37)" : diff > 0 ? "var(--crit)" : "var(--text-dim)";
  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
      <span>Antes (14 dias): <b>{pct(antes)}</b>{nAntes != null ? ` de ${nAntes} conversas` : ""}</span>
      <span>{rotuloDepois}: <b>{pct(depois)}</b>{nDepois != null ? ` de ${nDepois} conversas` : ""}</span>
      {diff != null && <span style={{ color: cor }}>{diff < 0 ? `caiu ${String(-diff).replace(".", ",")} pontos` : diff > 0 ? `subiu ${String(diff).replace(".", ",")} pontos` : "igual"}</span>}
    </div>
  );
}

export function ExperimentoSemana({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [falha, setFalha] = useState<string | null>(null);
  const [acao, setAcao] = useState("");
  const q = useQuery({
    queryKey: ["experimento-semana", clientId],
    queryFn: async () => {
      const { data: d, error } = await (supabase as any).rpc("experimento_atual", { p_client: clientId });
      if (error) return null;
      return (d ?? null) as Dados | null;
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["experimento-semana", clientId] });
  const iniciar = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("experimento_iniciar", { p_client: clientId, p_falha: falha, p_acao: acao });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setFalha(null); recarregar(); },
  });
  const concluir = useMutation({
    mutationFn: async ({ id, descartar }: { id: string; descartar: boolean }) => {
      const { error } = await (supabase as any).rpc("experimento_concluir", { p_id: id, p_descartar: descartar });
      if (error) throw new Error(error.message);
    },
    onSuccess: recarregar,
  });
  const d = q.data;
  if (!d || (!d.atual && !d.ultimo && !d.sugestao)) return null;
  const caixa = { borderColor: "var(--border)", background: "var(--surface)" };
  const botao = { background: "var(--accent)", color: "var(--accent-ink)" };
  const titulo = <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-dim)" }}>Experimento da semana</span>;

  if (d.atual) {
    const e = d.atual;
    return (
      <div className="rounded-xl border p-3" style={caixa}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {titulo}
          <span className="text-xs" style={{ color: "var(--text-dim)" }}>{data(e.inicio)} a {data(e.fim)}</span>
        </div>
        <p className="mt-1 text-sm"><b>Ponto de melhoria:</b> {ROTULO_FALHA[e.falha] ?? e.falha}</p>
        <p className="mt-0.5 text-sm"><b>Ação da equipe:</b> {e.acao}</p>
        <Comparacao antes={e.base_pct} depois={e.agora?.pct ?? null} nAntes={e.base_conversas} nDepois={e.agora?.conversas ?? null} rotuloDepois="Durante, até hoje" />
        <p className="mt-1 text-xs" style={{ color: "var(--text-dim)" }}>Frequência identificada na análise das conversas. Compare o percentual e a quantidade de conversas; amostras pequenas podem variar bastante.</p>
        {isAdmin && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={!e.pode_concluir || concluir.isPending} onClick={() => concluir.mutate({ id: e.id, descartar: false })} className="min-h-[34px] rounded-lg px-3 text-sm font-medium disabled:opacity-50" style={botao}>
              {e.pode_concluir ? "Concluir e registrar resultado" : `Concluir a partir de ${data(e.fim)}`}
            </button>
            <button type="button" className="text-xs underline" onClick={() => { if (confirm("Descartar este experimento? Ele não terá resultado registrado.")) concluir.mutate({ id: e.id, descartar: true }); }}>Descartar</button>
            {concluir.isError && <span className="text-xs" style={{ color: "var(--crit)" }}>{(concluir.error as Error).message}</span>}
          </div>
        )}
      </div>
    );
  }

  const u = d.ultimo;
  const s = d.sugestao;
  return (
    <div className="rounded-xl border p-3" style={caixa}>
      {titulo}
      {u && (
        <div className="mt-1 text-sm">
          <b>Último ({data(u.inicio)} a {data(u.fim)}):</b> {ROTULO_FALHA[u.falha] ?? u.falha}
          <Comparacao antes={u.base_pct} depois={u.resultado_pct} nAntes={u.base_conversas} nDepois={u.resultado_conversas} rotuloDepois="Durante" />
        </div>
      )}
      {s && (
        <div className="mt-2">
          <p className="text-sm">Pontos de melhoria recorrentes nos últimos 14 dias ({s.conversas} conversas comerciais analisadas):</p>
          <ul className="mt-1 space-y-1">
            {s.falhas.map((f) => (
              <li key={f.falha} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{ROTULO_FALHA[f.falha] ?? f.falha} · <b>{pct(f.pct)}</b> ({f.n})</span>
                {isAdmin && falha !== f.falha && (
                  <button type="button" className="text-xs underline" onClick={() => { setFalha(f.falha); setAcao(ACAO_SUGERIDA[f.falha] ?? ""); }}>Testar esta semana</button>
                )}
              </li>
            ))}
          </ul>
          {isAdmin && falha && (
            <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); iniciar.mutate(); }}>
              <label className="block text-sm">Mudança que a equipe vai testar por 7 dias ({ROTULO_FALHA[falha] ?? falha})
                <textarea value={acao} onChange={(e) => setAcao(e.target.value)} rows={2} maxLength={400} className="mt-1 w-full rounded-lg border px-2 py-1 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg)" }} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" disabled={acao.trim().length < 5 || iniciar.isPending} className="min-h-[34px] rounded-lg px-3 text-sm font-medium disabled:opacity-50" style={botao}>Começar experimento</button>
                <button type="button" className="text-xs underline" onClick={() => setFalha(null)}>Cancelar</button>
                {iniciar.isError && <span className="text-xs" style={{ color: "var(--crit)" }}>{(iniciar.error as Error).message}</span>}
              </div>
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>Sua equipe executa a mudança no atendimento. O Nexo acompanha a frequência do ponto de melhoria antes e durante os 7 dias do teste.</p>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
