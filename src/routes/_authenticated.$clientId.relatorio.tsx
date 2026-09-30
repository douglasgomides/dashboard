import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/$clientId/relatorio")({
  component: RelatorioPage,
});

function RelatorioPage() {
  return (
    <div>
      <div className="pagehead">
        <h2>Relatório</h2>
        <p>Texto pronto para enviar ao cliente, editável, com copiar e exportar PDF.</p>
      </div>
      <div className="empty">
        <h2>Em construção</h2>
        <p>
          O relatório reúne alcance, seguidores, destaque, anúncios, atendimento e as ações do insight do período,
          em texto pronto para o WhatsApp. Envio direto ao cliente é fase 2 (exige integração). Aparece aqui na
          reconstrução da página de Resultado, de onde puxa os números.
        </p>
      </div>
    </div>
  );
}
