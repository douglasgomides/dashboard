import { useMemo, useState } from "react";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getClientFontes, getPatientQuestionsPeriodo, getPostsForAnalytics } from "@/lib/client-data";
import { resolveDateRange, formatRangeLabel } from "@/lib/date-range";
import { buildIdeias, ideiaParaTexto, type Ideia } from "@/lib/hub-conteudo";
import { Carregando, ErroCarga, SemFonte, SEM_INSTAGRAM } from "@/components/sem-fonte";

export const Route = createFileRoute("/_authenticated/$clientId/ideias")({
  component: IdeiasPage,
});

const clientLayoutRoute = getRouteApi("/_authenticated/$clientId");

const REGRA: Record<Ideia["regra"], string> = {
  pergunta: "Pergunta repetida",
  tema: "Tema que salva mais",
  formato: "Formato de maior alcance",
};

function IdeiaCard({ i }: { i: Ideia }) {
  const [ok, setOk] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(ideiaParaTexto(i));
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    } catch {
      window.prompt("Copie a ideia:", ideiaParaTexto(i));
    }
  }
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <span className="tag2">{REGRA[i.regra]}</span>
        <button type="button" className="btn" onClick={copiar}>
          {ok ? "Copiado" : "Copiar ideia"}
        </button>
      </div>
      <h2 style={{ fontSize: 15 }}>{i.tema}</h2>
      <div className="chips" style={{ margin: 0 }}>
        <span className="hchip">{i.formato}</span>
        <span className="hchip">{i.funil}</span>
        <span className="hchip">{i.estagio}</span>
      </div>
      <p style={{ fontSize: 13.5 }}>{i.acao}</p>
      <p className="note" style={{ marginTop: 0 }}>
        <b>Por quê:</b>&nbsp;{i.porque}
      </p>
    </div>
  );
}

function IdeiasPage() {
  const { clientId } = Route.useParams();
  const dateRangeState = clientLayoutRoute.useSearch();
  const { start, end } = resolveDateRange(dateRangeState);
  const periodLabel = formatRangeLabel({ start, end });

  const fontes = useQuery({ queryKey: ["fontes", clientId], queryFn: () => getClientFontes(clientId) });
  const temIg = fontes.data?.tem_instagram === true;
  const posts = useQuery({
    queryKey: ["ideias-posts", clientId, start, end],
    queryFn: () => getPostsForAnalytics(clientId, start, end + "T23:59:59"),
    enabled: temIg,
  });
  const perguntas = useQuery({
    queryKey: ["ideias-perguntas", clientId, start, end],
    queryFn: () => getPatientQuestionsPeriodo(clientId, start, end),
    enabled: temIg,
  });

  const res = useMemo(
    () => (posts.data && perguntas.data ? buildIdeias(posts.data, perguntas.data as any) : null),
    [posts.data, perguntas.data],
  );

  const head = (
    <div className="hpagehead">
      <h2>Ideias{res && res.ideias.length > 0 ? ` (${res.ideias.length})` : ""}</h2>
      <p>
        Ângulos de conteúdo gerados por regra a partir do que já funcionou, sem IA externa. Período: {periodLabel}.
      </p>
    </div>
  );

  if (fontes.isLoading) return <div>{head}<Carregando /></div>;
  if (fontes.error) return <div>{head}<ErroCarga texto="Não consegui verificar as fontes deste cliente. Atualize a página." /></div>;
  if (!temIg) return <div>{head}<SemFonte {...SEM_INSTAGRAM} /></div>;
  if (posts.isLoading || perguntas.isLoading) return <div>{head}<Carregando texto="Calculando ideias…" /></div>;
  if (posts.error || perguntas.error || !res) return <div>{head}<ErroCarga texto="Falha ao ler posts e comentários do período." /></div>;

  return (
    <div>
      {head}
      <p className="sub-top">
        <span>{res.totalPosts} posts no período</span>
        <span>{res.totalPerguntas} perguntas de pacientes nos comentários</span>
      </p>

      {res.ideias.length === 0 ? (
        <div className="hempty">
          <h2>Nenhuma ideia por regra neste período</h2>
          <p>O Hub não inventa ângulo sem base. O que falta:</p>
          <ul style={{ textAlign: "left", maxWidth: "62ch", margin: "10px auto 0", paddingLeft: 18 }}>
            {res.faltas.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : (
        <>
          <div className="cards">
            {res.ideias.map((i) => (
              <IdeiaCard key={i.id} i={i} />
            ))}
          </div>
          {res.faltas.length > 0 && (
            <div className="card" style={{ marginTop: 16 }}>
              <h2>Regras sem ideia neste período</h2>
              <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                {res.faltas.map((f) => (
                  <li key={f} className="note" style={{ display: "list-item" }}>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      <p className="note">
        Regras: pergunta que aparece 2+ vezes vira carrossel de conexão; tema com 2+ posts e mediana de salvos 25% acima
        da conta vira variação; formato de maior alcance mediano (3+ posts) vira novo conteúdo. Temas e formatos exigem
        8+ posts no período.
      </p>
    </div>
  );
}
