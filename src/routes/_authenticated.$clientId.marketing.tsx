import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useClientRole } from "@/hooks/use-client-role";
import { getClientFontes } from "@/lib/client-data";
import { parseDateRangeSearch } from "@/lib/date-range";
import {
  areasVisiveis, navSearch, navTabKey,
  CLIENTES_SO_CRM, CLIENTES_SEM_AUDIENCIA,
} from "@/lib/nav";
import { Carregando, ErroCarga } from "@/components/sem-fonte";
import "@/styles/marketing-navigation.css";

export const Route = createFileRoute("/_authenticated/$clientId/marketing")({ component: MarketingPage });
const clientRoute = getRouteApi("/_authenticated/$clientId");
const groups = [
  { id: "Conteúdo", title: "Produzir e planejar conteúdo", description: "Revise os roteiros, organize a semana e descubra o que funciona no perfil." },
  { id: "Campanhas e anúncios", title: "Planejar campanhas e acompanhar anúncios", description: "Defina a estratégia, acompanhe o investimento e consulte os links de aquisição." },
  { id: "Público e demanda", title: "Entender o público", description: "Conheça quem acompanha o perfil e as perguntas que orientam os próximos conteúdos." },
];

function MarketingPage() {
  const { clientId } = Route.useParams();
  const period = parseDateRangeSearch(clientRoute.useSearch());
  const { isAdmin } = useAuth();
  const { papel, carregando } = useClientRole(clientId);
  // Usa a mesma consulta e chave da casca; React Query compartilha os dados e a requisição.
  const fontes = useQuery({ queryKey: ["client-fontes", clientId], queryFn: () => getClientFontes(clientId) });
  if (fontes.isPending || carregando) return <Carregando texto="Preparando as ferramentas de marketing…" />;
  if (fontes.isError) return <div>
    <ErroCarga texto="Não foi possível conferir as ferramentas disponíveis para esta clínica." />
    <button type="button" className="ws-action ws-action--secondary mt-3" onClick={() => void fontes.refetch()}>Tentar novamente</button>
  </div>;
  const tools = areasVisiveis({
    isAdmin, papel, fontes: fontes.data,
    soCrm: CLIENTES_SO_CRM.has(clientId), semAudiencia: CLIENTES_SEM_AUDIENCIA.has(clientId),
  }).find((area) => area.id === "marketing")?.visiveis ?? [];
  return <div className="marketing-navigation">
    <p className="marketing-navigation-intro">O que você precisa fazer no marketing da clínica?</p>
    {groups.map((group) => {
      const entries = tools.filter((tab) => tab.grupo === group.id);
      if (!entries.length) return null;
      return <section key={group.id} aria-labelledby={`marketing-${group.id === "Conteúdo" ? "conteudo" : group.id === "Campanhas e anúncios" ? "campanhas" : "publico"}`} className="marketing-task-group">
        <header>
          <h2 id={`marketing-${group.id === "Conteúdo" ? "conteudo" : group.id === "Campanhas e anúncios" ? "campanhas" : "publico"}`}>{group.title}</h2>
          <p>{group.description}</p>
        </header>
        <div className="marketing-task-links">
          {entries.map((tab) => <Link key={navTabKey(tab)} to={`/$clientId${tab.path}` as never} params={{ clientId } as never} search={navSearch(tab, period) as never}>
            <tab.Icone size={20} aria-hidden />
            <span><b>{tab.label}</b>{tab.descricao && <span>{tab.descricao}</span>}</span>
            <ArrowRight size={17} aria-hidden />
          </Link>)}
        </div>
      </section>;
    })}
  </div>;
}
