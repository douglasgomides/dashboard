import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { MessagesSquare, Clock, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { resumirAtendimento, duracao, type LeituraConversaBanco } from "@/lib/conversa-leitura";
import { NxCard, NxKpi } from "@/components/nx/base";
import { NxAviso, NxErro } from "@/components/nx/blocos";
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

const GRADE = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 } as const;

export function AtendimentoResumo({ clientId }: { clientId: string }) {
  const { isAdmin } = useAuth();
  const proprio = ehNegocioProprio(clientId);
  const { data, isError } = useLeituraConversas(clientId);
  if (isError) return <NxErro texto="Não foi possível conferir o atendimento agora. Nenhum resultado foi substituído por zero." />;
  if (!data?.length) return null;
  const g = resumirAtendimento(data);
  if (!g.comPaciente) return null;
  const ruim = g.semResposta > 0 || (g.medianaPrimeiraResposta ?? 0) > 3600;
  const quem = proprio ? (g.semResposta === 1 ? "contato está" : "contatos estão") : g.semResposta === 1 ? "paciente está" : "pacientes estão";
  const nome = proprio ? "Atendimento na Clint" : "Atendimento no WhatsApp";
  return (
    <NxCard rotulo={nome} titulo={`${nome} (últimas ${g.conversas} conversas)`}>
      <div style={GRADE}>
        <NxKpi icone={<MessagesSquare size={18} />} rotulo={proprio ? "Contatos sem resposta" : "Pacientes sem resposta"} valor={g.semResposta} nota={g.soRobo ? `${g.soRobo} só receberam mensagem automática` : undefined} />
        <NxKpi icone={<Clock size={18} />} rotulo="Primeira resposta (mediana)" valor={duracao(g.medianaPrimeiraResposta)} nota={g.medianaComercial != null ? `Em horário comercial: ${duracao(g.medianaComercial)}` : undefined} />
      </div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--text-2)" }}>
        <b>{g.semResposta}</b> {quem} sem resposta
        {g.soRobo ? ` (${g.soRobo} só receberam mensagem automática)` : ""}. A primeira resposta de uma pessoa leva <b>{duracao(g.medianaPrimeiraResposta)}</b> (mediana)
        {g.medianaComercial != null ? <>; em horário comercial, <b>{duracao(g.medianaComercial)}</b></> : null}.
      </p>
      {ruim && <NxAviso tom="atencao" titulo="Atenção ao atendimento.">Há pacientes sem resposta ou a primeira resposta passa de 1 hora.</NxAviso>}
      {g.semLead ? <NxAviso tom="info" titulo={`${g.semLead} conversas não têm lead no CRM.`} /> : null}
      {isAdmin && (
        <div>
          <Link to="/$clientId/conversas" params={{ clientId }} className="nx-botao">
            Ver cada conversa e o resumo <ChevronRight size={16} aria-hidden />
          </Link>
        </div>
      )}
    </NxCard>
  );
}
