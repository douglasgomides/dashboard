import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { PaginaNexo } from "@/components/nx/pagina";
import { NxChip } from "@/components/nx-chip";
import { FechadosDoCrm } from "@/components/nx/fechados-crm";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

export const Route = createFileRoute("/_authenticated/$clientId/vendas")({
  component: OQueVirouVenda,
});

// Tela ainda sem fonte: aparece por seção e aba como todas as outras, e diz de forma honesta o que falta e quem resolve.
// A fonte é um checkout (Hubla, Hotmart, Eduzz ou Kiwify) com o link rastreado fechando o caminho do post ao contato e à venda.
function OQueVirouVenda() {
  const { clientId } = Route.useParams();
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  return (
    <PaginaNexo
      tela="vendas"
      titulo="O que virou venda"
      pergunta="Quantos contatos viraram venda?"
      meta={
        // O período e o "sem selo" uma vez só, pequenos (a "Leitura do período" saiu: quick-ver-tudo-abas, João 13/11/2026).
        <>
          <span>{formatRangeLabel({ start, end })}</span>
          <NxChip tipo="sem-selo" />
        </>
      }
      // A leitura só repetia o que o quadro abaixo já diz (o que falta, como consertar e quem resolve): sai, e o quadro fica sozinho.
      leitura={null}
      corpo={<FechadosDoCrm clientId={clientId} start={start} end={end} modo="vendas" />}
    />
  );
}
