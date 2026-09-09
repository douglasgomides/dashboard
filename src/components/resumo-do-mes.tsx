import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getAdsResumo, getAdsDiagnostico, getWtsResumo } from "@/lib/client-data";
import { fmtNum, fmtBRL } from "@/lib/format";

/**
 * O que aconteceu no período, em frases, juntando as quatro fontes.
 *
 * Existe porque a Visão geral só falava de Instagram: o dinheiro de anúncio e
 * o atendimento no WhatsApp moravam em abas que a médica podia nunca abrir.
 * Quem entra no dashboard uma vez por mês precisa da conclusão na primeira
 * tela, não de doze abas de número.
 *
 * Toda frase aqui é CALCULADA a partir do mesmo dado das outras abas — nada é
 * escrito por IA e nada é estimado. Cada afirmação carrega o número que a
 * sustenta, para dar para conferir na aba correspondente. Bloco sem dado
 * simplesmente não aparece, em vez de mostrar zero: cliente sem anúncio não
 * tem "R$ 0,00 investido", tem ausência de anúncio.
 */

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function dur(seg: number): string {
  const s = Math.max(0, Math.trunc(seg));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

function Linha({
  children,
  atencao = false,
}: {
  children: React.ReactNode;
  atencao?: boolean;
}) {
  return (
    <li className="flex gap-2.5 text-sm leading-relaxed">
      <span
        aria-hidden
        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: atencao ? "var(--warn)" : "var(--accent)" }}
      />
      <span style={{ color: "var(--text-dim)" }}>{children}</span>
    </li>
  );
}

function Forte({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: "var(--text)" }}>{children}</strong>;
}

export function ResumoDoMes({
  clientId,
  start,
  end,
  periodLabel,
  posts,
}: {
  clientId: string;
  start: string;
  end: string;
  periodLabel: string;
  posts: any[] | undefined;
}) {
  const { data: ads } = useQuery({
    queryKey: ["ads-resumo", clientId, start, end],
    queryFn: () => getAdsResumo(clientId, start, end),
  });
  const { data: diagnostico } = useQuery({
    queryKey: ["ads-diagnostico", clientId, start, end],
    queryFn: () => getAdsDiagnostico(clientId, start, end),
  });
  const { data: wts } = useQuery({
    queryKey: ["wts-resumo", clientId, start, end],
    queryFn: () => getWtsResumo(clientId, start, end),
  });

  const linhas: React.ReactNode[] = [];
  const atencoes: React.ReactNode[] = [];

  // ---- Conteúdo -----------------------------------------------------------
  const publicados = (posts ?? []).length;
  if (publicados > 0) {
    const melhor = [...(posts ?? [])].sort((a, b) => n(b?.saved) - n(a?.saved))[0];
    const salvos = n(melhor?.saved);
    linhas.push(
      <>
        <Forte>{fmtNum(publicados)} publicações</Forte> no período.
        {salvos > 0 && melhor?.caption && (
          <>
            {" "}
            A mais salva foi{" "}
            {melhor.permalink ? (
              <a href={melhor.permalink} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                “{String(melhor.caption).slice(0, 60).trim()}…”
              </a>
            ) : (
              <>“{String(melhor.caption).slice(0, 60).trim()}…”</>
            )}
            , com <Forte>{fmtNum(salvos)} salvamentos</Forte>.
          </>
        )}
      </>,
    );
  }

  // ---- Anúncios -----------------------------------------------------------
  const gasto = n(ads?.gasto);
  if (gasto > 0) {
    const conversas = n(ads?.conversas);
    linhas.push(
      <>
        <Forte>{fmtBRL(gasto)}</Forte> investidos em anúncio
        {conversas > 0 ? (
          <>
            , que trouxeram <Forte>{fmtNum(conversas)} conversas</Forte> a{" "}
            <Forte>{fmtBRL(gasto / conversas)}</Forte> cada.
          </>
        ) : (
          <> — e nenhuma conversa iniciada no período.</>
        )}
      </>,
    );

    const cortar = (diagnostico ?? []).filter((c) => c.veredito === "Cortar");
    const escalar = (diagnostico ?? []).filter((c) => c.veredito === "Escalar");
    const semTracao = (diagnostico ?? []).filter(
      (c) => c.veredito === "Sem tração" || c.veredito === "Atrai mas não converte",
    );

    if (escalar.length > 0) {
      const g = escalar.reduce((a, c) => a + n(c.gasto), 0);
      const cv = escalar.reduce((a, c) => a + n(c.conversas), 0);
      linhas.push(
        <>
          <Forte>
            {escalar.length} {escalar.length === 1 ? "campanha converte" : "campanhas convertem"}
          </Forte>{" "}
          bem abaixo da mediana da conta: {fmtBRL(g)} trouxeram {fmtNum(cv)} conversas. É onde cabe mais verba.
        </>,
      );
    }

    const desperdicio =
      cortar.reduce((a, c) => a + n(c.gasto), 0) + semTracao.reduce((a, c) => a + n(c.gasto), 0);
    if (desperdicio > 0) {
      atencoes.push(
        <>
          <Forte>{fmtBRL(desperdicio)}</Forte> foram para campanhas que custam caro demais por conversa ou não
          converteram nenhuma.{" "}
          <Link to="/$clientId/anuncios" params={{ clientId }} style={{ color: "var(--accent)" }}>
            Ver quais →
          </Link>
        </>,
      );
    }
  }

  // ---- Atendimento --------------------------------------------------------
  const atendimentos = n(wts?.atendimentos);
  if (atendimentos > 0) {
    const espera = n(wts?.espera_mediana_seg);
    linhas.push(
      <>
        <Forte>{fmtNum(atendimentos)} atendimentos</Forte> no WhatsApp, de{" "}
        {fmtNum(n(wts?.contatos_distintos))} pessoas diferentes
        {espera > 0 && (
          <>
            , com <Forte>{dur(espera)}</Forte> de espera até a primeira resposta
          </>
        )}
        .
      </>,
    );

    const semRota = n(wts?.sem_roteamento);
    const fatia = atendimentos > 0 ? (semRota / atendimentos) * 100 : 0;
    if (fatia >= 30) {
      atencoes.push(
        <>
          <Forte>{fatia.toFixed(0)}% das conversas</Forte> não foram encaminhadas para nenhuma equipe.{" "}
          <Link to="/$clientId/atendimento" params={{ clientId }} style={{ color: "var(--accent)" }}>
            Ver atendimento →
          </Link>
        </>,
      );
    }
  }

  if (linhas.length === 0 && atencoes.length === 0) return null;

  return (
    <section
      className="rounded-xl border p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">O que aconteceu</h2>
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>
          {periodLabel}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {linhas.map((l, i) => (
          <Linha key={`l${i}`}>{l}</Linha>
        ))}
      </ul>

      {atencoes.length > 0 && (
        <>
          <div
            className="mt-3 border-t pt-3 text-xs font-semibold uppercase tracking-wide"
            style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
          >
            Merece atenção
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {atencoes.map((a, i) => (
              <Linha key={`a${i}`} atencao>
                {a}
              </Linha>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
