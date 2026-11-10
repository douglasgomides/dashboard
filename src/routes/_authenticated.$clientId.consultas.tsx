import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { PaginaNexo, LeituraDaTela } from "@/components/nx/pagina";
import { NxVazio } from "@/components/nx/blocos";
import { EM_CONSTRUCAO, fatosEmConstrucao } from "@/lib/leitura/fatos-pacientes";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

export const Route = createFileRoute("/_authenticated/$clientId/consultas")({
  component: OQueVirouPaciente,
});

// Tela ainda sem fonte: aparece por seção e aba como todas as outras, e diz de forma honesta o que falta e quem resolve.
// A fonte é o CRM da clínica (Feegow ou Ninsaúde, somente leitura) com o funil post, contato e consulta agendada fechado.
function OQueVirouPaciente() {
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  return (
    <PaginaNexo
      tela="consultas"
      titulo="O que virou paciente"
      pergunta="Quantos contatos viraram consulta?"
      meta={<span>{formatRangeLabel({ start, end })}</span>}
      leitura={<LeituraDaTela fatos={fatosEmConstrucao("consultas", { de: start, ate: end })} carregando={false} semSelo />}
      corpo={
        <NxVazio
          emConstrucao
          titulo="O que falta para medir as consultas"
          falta={EM_CONSTRUCAO.consultas!.falta}
          passo="Conectar o CRM da clínica (Feegow ou Ninsaúde, somente leitura) e fechar o caminho do post ao contato e à consulta agendada. A tela só mostra números se a clínica tiver essa fonte conectada."
          quem="equipe_hub"
        />
      }
    />
  );
}
