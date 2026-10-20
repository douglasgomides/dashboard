import { Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { ArrowRight, ClipboardCheck, PackageCheck } from "lucide-react";
import { AGENTES, type IdAgente } from "@/lib/agentes-catalogo";
import { lerTrabalhoAgente } from "@/lib/agentes-trabalho-data";
import { TRABALHOS_AGENTE } from "@/lib/agentes-trabalho";
import "@/styles/acompanhamento-servico.css";

const FRENTES: Record<string, { titulo: string; responsavel: string }> = {
  conteudo: { titulo: "Roteiros e conteúdos", responsavel: "Clínica e equipe de conteúdo" },
  campanhas: { titulo: "Propostas de campanha", responsavel: "Clínica e estrategista" },
  anuncios: { titulo: "Revisão dos anúncios", responsavel: "Gestor de tráfego Doctor Creator" },
  recuperacao: { titulo: "Retomada de contatos", responsavel: "Atendimento da clínica" },
};

/** Leitura dos materiais existentes. Abrir o resumo não inicia agentes nem altera registros. */
export function AcompanhamentoServico({ clientId, produto }: { clientId: string; produto: "hub" | "sap" }) {
  const ordem: IdAgente[] = produto === "sap" ? ["conteudo", "campanhas", "anuncios"] : ["conteudo", "campanhas", "anuncios", "recuperacao"];
  const agentes = ordem.map(id => AGENTES.find(a => a.id === id)!);
  // O resumo da clínica usa somente metadados que o próprio perfil pode consultar.
  const resultados = useQueries({ queries: agentes.map(a => ({
    queryKey: ["agentes-trabalho", clientId, false, a.id],
    queryFn: () => lerTrabalhoAgente(clientId, a, false), retry: false, staleTime: 30_000,
  })) });
  const carregando = resultados.some(q => q.isPending);
  const falhou = resultados.some(q => q.isError);
  const filas = agentes.flatMap((a, i) => resultados[i].isSuccess && resultados[i].data.pendentes > 0 ? [{ a, dados: resultados[i].data }] : []);
  const recentes = agentes.flatMap((a, i) => resultados[i].isSuccess && resultados[i].data.ultimaEntrega ? [{ a, data: resultados[i].data.ultimaEntrega! }] : [])
    .sort((a, b) => b.data.localeCompare(a.data));
  const destino = produto === "sap" ? "/sap/$clientId/agentes" : "/$clientId/agentes";
  const abrir = (id?: IdAgente) => <Link to={destino} params={{ clientId }} search={{ agente: id }} hash={id ? "agent-review-workspace" : undefined} className="ws-action ws-action--secondary">{id ? "Ver entrega" : "Ver todas as entregas"}<ArrowRight size={16} aria-hidden /></Link>;
  return <section className="service-followup" aria-label="Entregas e próximos passos">
    <header><div><p className="workspace-eyebrow">Acompanhamento Doctor Creator</p><h2>O que estamos entregando para sua clínica</h2><p>Materiais preparados e próximos passos. Este acompanhamento tem datas próprias e não muda com o período dos indicadores.</p></div>{abrir()}</header>
    {carregando ? <p role="status">Conferindo as entregas da clínica…</p> : <>
      {falhou && <div role="alert"><p>Não foi possível conferir todas as entregas. Os materiais disponíveis continuam abaixo; a fila pode estar incompleta.</p><button className="btn" type="button" onClick={() => { resultados.filter(q => q.isError).forEach(q => void q.refetch()); }}>Tentar novamente</button></div>}
      <div className="service-followup-grid">
        <div><h3><ClipboardCheck size={18} aria-hidden />Próximos passos</h3>
          {filas.length ? <ul>{filas.slice(0, 3).map(({ a, dados }) => <li key={a.id}><strong>{FRENTES[a.id].titulo}</strong><p>{dados.pendentes} {dados.pendentes === 1 ? "material disponível para revisão" : "materiais disponíveis para revisão"} · últimos {TRABALHOS_AGENTE[a.id].janelaDias} dias</p><p>Responsável pelo próximo passo: {FRENTES[a.id].responsavel}.</p>{abrir(a.id)}</li>)}</ul> : <p>{falhou ? "A fila ainda não foi confirmada. Tente novamente para conferir o que depende de revisão." : "Nenhum material pendente de revisão nos intervalos consultados. A equipe acompanha a preparação das próximas entregas."}</p>}
          {filas.length > 3 && <p>Há mais frentes disponíveis em Todas as entregas.</p>}
          <p className="service-followup-note">As revisões podem depender da clínica ou da equipe Doctor Creator. Consulte o responsável em cada entrega.</p>
        </div>
        <div><h3><PackageCheck size={18} aria-hidden />Últimos materiais preparados</h3>
          {recentes.length ? <ul>{recentes.slice(0, 3).map(({ a, data }) => <li key={a.id}><strong>{FRENTES[a.id].titulo}</strong><p>Último registro: {new Date(data).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" })}</p>{abrir(a.id)}</li>)}</ul> : <p>{falhou ? "O histórico está parcialmente indisponível." : "Ainda não há materiais registrados nas frentes consultadas. A equipe precisa preparar a primeira entrega."}</p>}
          <p className="service-followup-note">Material preparado não significa conteúdo publicado ou mudança aplicada em anúncio.</p>
        </div>
      </div>
    </>}
  </section>;
}
