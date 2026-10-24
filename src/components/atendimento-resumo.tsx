import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessagesSquare, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { resumirAtendimento, duracao, type LeituraConversaBanco } from "@/lib/conversa-leitura";

import { ehNegocioProprio } from "@/lib/negocio-proprio";

// Atendimento no WhatsApp em uma linha, na tela Comercial: quantos pacientes estão sem resposta e
// quanto a equipe demora para responder. O link para Conversas (texto das mensagens) segue a regra
// do menu: só admin vê.
export function useLeituraConversas(clientId: string) {
  return useQuery({
    queryKey: ["leitura-conversas", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("leitura_conversas", { p_client: clientId, p_limite: 500 });
      if (error) throw new Error("Não foi possível conferir o atendimento. Os resultados não foram considerados zero.");
      return ((data ?? []) as any[]).map((l) => ({ ...l, msgs_paciente: Number(l.msgs_paciente), msgs_clinica: Number(l.msgs_clinica), msgs_automaticas: Number(l.msgs_automaticas) })) as LeituraConversaBanco[];
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function AtendimentoResumo({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const proprio = ehNegocioProprio(clientId);
  const { data, isError } = useLeituraConversas(clientId);
  if (isError) return <p role="alert" className="text-sm">Não foi possível conferir o atendimento agora. Nenhum resultado foi substituído por zero.</p>;
  if (!data?.length) return null;
  const g = resumirAtendimento(data);
  if (!g.comPaciente) return null;
  const ruim = g.semResposta > 0 || (g.medianaPrimeiraResposta ?? 0) > 3600;
  return (
    <section className="rounded-xl border p-4 sm:p-5" style={{ background: "var(--surface)", borderColor: ruim ? "var(--warn-border, var(--border))" : "var(--border)" }} aria-label={proprio ? "Atendimento na Clint" : "Atendimento no WhatsApp"}>
      <div className="flex items-start gap-3">
        <MessagesSquare size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">{proprio ? "Atendimento na Clint" : "Atendimento no WhatsApp"} (últimas {g.conversas} conversas)</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            <b>{g.semResposta}</b> {proprio ? (g.semResposta === 1 ? "contato está" : "contatos estão") : (g.semResposta === 1 ? "paciente está" : "pacientes estão")} sem resposta
            {g.soRobo ? ` (${g.soRobo} só receberam mensagem automática)` : ""}. A primeira resposta de uma pessoa leva <b>{duracao(g.medianaPrimeiraResposta)}</b> (mediana)
            {g.medianaComercial != null ? <>; em horário comercial, <b>{duracao(g.medianaComercial)}</b></> : null}.
            {g.semLead ? ` ${g.semLead} conversas não têm lead no CRM.` : ""}
          </p>
          {isAdmin && (
          <Link to="/$clientId/conversas" params={{ clientId }} className="mt-2 inline-flex min-h-[40px] items-center gap-1 text-sm font-semibold" style={{ color: "var(--accent)" }}>
            Ver cada conversa e o resumo <ChevronRight size={16} aria-hidden />
          </Link>
          )}
        </div>
      </div>
    </section>
  );
}
