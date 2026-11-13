import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { PaginaNexo, LeituraDaTela } from "@/components/nx/pagina";
import { NxVazio } from "@/components/nx/blocos";
import { EM_CONSTRUCAO, fatosEmConstrucao } from "@/lib/leitura/fatos-pacientes";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

export const Route = createFileRoute("/_authenticated/$clientId/vendas")({
  component: OQueVirouVenda,
});

// Tela ainda sem fonte: aparece por seção e aba como todas as outras, e diz de forma honesta o que falta e quem resolve.
// A fonte é um checkout (Hubla, Hotmart, Eduzz ou Kiwify) com o link rastreado fechando o caminho do post ao contato e à venda.
function OQueVirouVenda() {
  const { start, end } = resolveDateRange(clientLayoutRoute.useSearch());
  return (
    <PaginaNexo
      tela="vendas"
      titulo="O que virou venda"
      pergunta="Quantos contatos viraram venda?"
      meta={<span>{formatRangeLabel({ start, end })}</span>}
      leitura={<LeituraDaTela fatos={fatosEmConstrucao("vendas", { de: start, ate: end })} carregando={false} semSelo />}
      corpo={
        <NxVazio
          emConstrucao
          titulo="O que falta para medir as vendas"
          falta={EM_CONSTRUCAO.vendas!.falta}
          passo="Conectar um checkout (Hubla, Hotmart, Eduzz ou Kiwify) para o link rastreado fechar o caminho do post ao contato e à venda. O link é gerado e rastreado pelo sistema, sem nomenclatura manual."
          quem="equipe_hub"
        />
      }
    />
  );
}
