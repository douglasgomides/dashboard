import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/$clientId/conteudo")({
  component: ConteudoPage,
});

function ConteudoPage() {
  return (
    <div>
      <div className="hpagehead">
        <h2>Conteúdo</h2>
        <p>Projeção de seguidores e evolução do conteúdo do período.</p>
      </div>
      <div className="hempty">
        <h2>Em construção</h2>
        <p>
          A projeção de 30 dias de seguidores (estimativa linear) aparece aqui assim que a coleta diária de
          seguidores voltar a rodar sem lacunas. A série está parada desde 11/09 (NEW-01) — sem ela não há
          projeção confiável.
        </p>
      </div>
    </div>
  );
}
