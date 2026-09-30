import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/$clientId/ideias")({
  component: IdeiasPage,
});

function IdeiasPage() {
  return (
    <div>
      <div className="pagehead">
        <h2>Ideias</h2>
        <p>Ângulos de conteúdo gerados por regra a partir do que já funcionou.</p>
      </div>
      <div className="empty">
        <h2>Em construção</h2>
        <p>
          A fila de ideias combina três regras: pergunta repetida vira carrossel de conexão; tema com 2+ posts e
          salvos acima da média vira variação; formato de maior alcance por post vira novo conteúdo. Cada ângulo sai
          com tema, funil, estágio, formato e justificativa. Sem dado suficiente, mostra o que falta em vez de
          inventar.
        </p>
      </div>
    </div>
  );
}
