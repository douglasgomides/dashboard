import { useEffect, useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  getAdsResumo,
  getClient,
  getClientFontes,
  getMonthlyMetrics,
  getPatientQuestionsPeriodo,
  getPostsForAnalytics,
  getWtsResumo,
} from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { buildRelatorio } from "@/lib/hub-relatorio";
import { Carregando, ErroCarga, SemFonte, SEM_INSTAGRAM } from "@/components/sem-fonte";

export const Route = createFileRoute("/_authenticated/$clientId/relatorio")({
  component: RelatorioPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

function RelatorioPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });

  const client = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId) });
  const fontes = useQuery({ queryKey: ["fontes", clientId], queryFn: () => getClientFontes(clientId) });
  const f = fontes.data;
  const temIg = f?.tem_instagram === true;

  const metrics = useQuery({
    queryKey: ["rel-metrics", clientId, start, end],
    queryFn: () => getMonthlyMetrics(clientId, start, end),
    enabled: temIg,
  });
  const posts = useQuery({
    queryKey: ["rel-posts", clientId, start, end],
    queryFn: () => getPostsForAnalytics(clientId, start, end + "T23:59:59"),
    enabled: temIg,
  });
  const perguntas = useQuery({
    queryKey: ["rel-perguntas", clientId, start, end],
    queryFn: () => getPatientQuestionsPeriodo(clientId, start, end),
    enabled: temIg,
  });
  const ads = useQuery({
    queryKey: ["rel-ads", clientId, start, end],
    queryFn: () => getAdsResumo(clientId, start, end),
    enabled: f?.tem_anuncios === true,
  });
  const wts = useQuery({
    queryKey: ["rel-wts", clientId, start, end],
    queryFn: () => getWtsResumo(clientId, start, end),
    enabled: f?.tem_atendimento === true,
  });

  const queries = [client, fontes, ...(temIg ? [metrics, posts, perguntas] : []), ...(f?.tem_anuncios ? [ads] : []), ...(f?.tem_atendimento ? [wts] : [])];
  const loading = queries.some((q) => q.isLoading);
  const erro = queries.some((q) => q.error);

  const gerado = useMemo(() => {
    if (loading || erro || !client.data || !f) return null;
    return buildRelatorio({
      clientName: client.data.name,
      periodLabel,
      start,
      end,
      fontes: f,
      metrics: metrics.data ?? [],
      posts: posts.data ?? [],
      perguntas: perguntas.data ?? [],
      ads: ads.data ?? null,
      wts: wts.data ?? null,
    });
  }, [loading, erro, client.data, f, periodLabel, start, end, metrics.data, posts.data, perguntas.data, ads.data, wts.data]);

  // Texto editável: regenera quando muda o período/dados (a edição manual vale
  // até a próxima troca de período ou clique em "Refazer texto").
  const [texto, setTexto] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  useEffect(() => {
    if (gerado) setTexto(gerado.texto);
  }, [gerado]);

  const head = (
    <div className="hpagehead">
      <h2>Relatório</h2>
      <p>Texto pronto para enviar ao cliente pelo WhatsApp, editável. Período: {periodLabel}.</p>
    </div>
  );

  if (loading) return <div>{head}<Carregando texto="Montando o relatório…" /></div>;
  if (erro || !gerado) return <div>{head}<ErroCarga texto="Falha ao ler os dados do período. Tente novamente em instantes." /></div>;

  if (!f?.tem_instagram && !f?.tem_anuncios && !f?.tem_atendimento) {
    return (
      <div>
        {head}
        <SemFonte
          {...SEM_INSTAGRAM}
          texto="Este cliente não tem nenhuma fonte ligada (Instagram, anúncios ou WhatsApp), então não há o que relatar. O relatório não é gerado vazio."
        />
      </div>
    );
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt("Copie o texto:", texto);
    }
  }

  async function exportarPdf() {
    setGerandoPdf(true);
    try {
      const { gerarEBaixarRelatorioCompleto } = await import("@/lib/relatorio-completo");
      await gerarEBaixarRelatorioCompleto({ clientId, start, end, periodLabel, textoCliente: texto });
    } finally {
      setGerandoPdf(false);
    }
  }

  return (
    <div>
      {head}
      {gerado.omitidos.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--warn)" }}>
          <h2>Não incluído por falta de dado</h2>
          <p className="sub">{gerado.omitidos.join("; ")}.</p>
        </div>
      )}
      {!gerado.texto ? (
        <SemFonte
          titulo="Sem dado para montar o texto"
          texto="Nenhuma seção tem dado neste período, então o relatório ficaria vazio. Troque o período no cabeçalho."
        />
      ) : (
        <div className="card">
          <label htmlFor="rel-texto" className="sub" style={{ display: "block", marginBottom: 6 }}>
            Texto do relatório (edite à vontade antes de copiar)
          </label>
          <textarea
            id="rel-texto"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={18}
            style={{
              width: "100%",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 12,
              background: "var(--surface-2)",
              color: "var(--ink)",
              font: "inherit",
              lineHeight: 1.5,
              resize: "vertical",
            }}
          />
          <div className="chips" style={{ marginTop: 12, marginBottom: 0 }}>
            <button type="button" className="btn pri" onClick={copiar}>
              {copiado ? "Copiado" : "Copiar"}
            </button>
            <button type="button" className="btn" onClick={exportarPdf} disabled={gerandoPdf || !texto.trim()}>
              {gerandoPdf ? "Gerando PDF completo…" : "Exportar PDF completo"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setTexto(gerado.texto)}>
              Refazer texto
            </button>
          </div>
          <p className="note">O envio direto pelo WhatsApp é fase 2. Hoje: copie e cole na conversa do cliente.</p>
        </div>
      )}
    </div>
  );
}
