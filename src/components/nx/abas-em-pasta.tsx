import { useEffect, useRef, type ReactNode } from "react";
import { LinkDoRegistro } from "@/components/menu-equipe";
import type { DateRangeState } from "@/lib/date-range";
import type { Visibilidade } from "@/lib/nav";
import { REGISTRO_DE_TELAS, abasVisiveis, juntadaDoCaminho, type TelaDoRegistro } from "@/lib/registro-de-telas";
import "@/styles/nexo-abas.css";

// Abas em pasta das telas juntadas (Phase 3.1.1, D-01, D-04, D-07). Cada aba é o caminho da tela antiga: o endereço antigo
// já é a aba, o arquivo da rota antiga continua sendo a tela e o log por rota grava o routeId da aba (as abas moram num
// contêiner data-origem="menu"; endereço digitado vira "direto"). A peça não busca dado, não chama banco e não calcula
// número: só lê o registro e (na Task 2) a guarda de contagens.

export interface AbaDaPasta {
  id: string;
  rotulo: string;
  /** Linha do registro do destino da aba (primeira parte visível). */
  tela: TelaDoRegistro;
  /** "page" quando a parte aberta é a primeira da aba, "true" quando é outra parte da mesma aba, null quando não é a atual. */
  atual: "page" | "true" | null;
  /** undefined: a aba não tem coisa contável (nada é desenhado). null: ainda sem número ("—", nunca "0"). Número: em cinza. */
  contagem?: number | null;
}

const formatoNumero = new Intl.NumberFormat("pt-BR");

/** Contagem em cinza ao lado do rótulo. Sem número publicado mostra "—" com um aviso só para leitor de tela. */
function Contagem({ valor, className }: { valor: number | null | undefined; className: string }) {
  if (valor === undefined) return null;
  if (valor === null)
    return (
      <span className={className}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">sem número</span>
      </span>
    );
  return <span className={className}>{formatoNumero.format(valor)}</span>;
}

export function NxAbasEmPasta({
  id,
  rotulo,
  abas,
  dateRange,
  clientId,
  children,
}: {
  /** id da tela juntada (vira data-juntada). */
  id: string;
  rotulo: string;
  abas: readonly AbaDaPasta[];
  dateRange?: DateRangeState;
  clientId: string;
  children: ReactNode;
}) {
  const trilho = useRef<HTMLUListElement>(null);
  const atual = abas.find((a) => a.atual);
  // No celular a aba atual pode nascer fora da faixa: rola só a faixa (nunca a página) até ela.
  useEffect(() => {
    const ul = trilho.current;
    const aba = ul?.querySelector<HTMLElement>("[aria-current]");
    if (!ul || !aba || ul.scrollWidth <= ul.clientWidth) return;
    const esquerda = aba.offsetLeft - ul.offsetLeft;
    if (esquerda < ul.scrollLeft || esquerda + aba.offsetWidth > ul.scrollLeft + ul.clientWidth)
      ul.scrollLeft = Math.max(0, esquerda - 16);
  }, [atual?.id]);
  return (
    <div className="nx-pasta" data-juntada={id}>
      <nav aria-label={`Abas de ${rotulo}`} className="nx-pasta__abas" data-origem="menu">
        <ul ref={trilho}>
          {abas.map((a) => (
            <li key={a.id}>
              <LinkDoRegistro
                tela={a.tela}
                clientId={clientId}
                dateRange={dateRange}
                className="nx-pasta__aba"
                ariaCurrent={a.atual ?? undefined}
              >
                <span className="nx-pasta__rotulo">{a.rotulo}</span>
                <Contagem valor={a.contagem} className="nx-pasta__contagem" />
              </LinkDoRegistro>
            </li>
          ))}
        </ul>
      </nav>
      <section
        className="nx-pasta__corpo"
        aria-label={atual ? `${rotulo}: ${atual.rotulo}` : rotulo}
        data-juntada-aba={atual?.id}
      >
        {children}
      </section>
    </div>
  );
}

/** Terceiro nível (D-07): filtro segmentado com a pílula preta no escolhido. Cada opção é o caminho de uma tela antiga. */
export function NxSegmentado({
  rotulo,
  opcoes,
  dateRange,
  clientId,
}: {
  rotulo: string;
  opcoes: readonly { rotulo: string; tela: TelaDoRegistro; atual: boolean; contagem?: number | null }[];
  dateRange?: DateRangeState;
  clientId: string;
}) {
  return (
    <nav aria-label={rotulo} className="nx-segmentado" data-origem="menu">
      <ul>
        {opcoes.map((o) => (
          <li key={o.tela.rota}>
            <LinkDoRegistro
              tela={o.tela}
              clientId={clientId}
              dateRange={dateRange}
              className="nx-segmentado__opcao"
              ariaCurrent={o.atual ? "page" : undefined}
            >
              <span className="nx-segmentado__rotulo">{o.rotulo}</span>
              <Contagem valor={o.contagem} className="nx-segmentado__contagem" />
            </LinkDoRegistro>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const linhaDaRota = (rota: string): TelaDoRegistro | undefined =>
  REGISTRO_DE_TELAS.find((t) => t.rota === rota && !t.busca && t.situacao !== "tirada");

/**
 * Invólucro da tela juntada: o conteúdo da casca (children) entra dentro da pasta da aba atual. Fora de tela juntada, ou
 * numa tela juntada sem nenhuma aba visível para esta clínica, devolve só children (sem pasta).
 */
export function TelaJuntada({
  clientId,
  pathname,
  dateRange,
  vis,
  children,
}: {
  clientId: string;
  pathname: string;
  dateRange?: DateRangeState;
  vis: Visibilidade;
  children: ReactNode;
}) {
  const achada = juntadaDoCaminho(pathname);
  if (!achada) return <>{children}</>;
  const { secao, aba: abaAtual, parte: parteAtual } = achada;
  const visiveis = abasVisiveis(secao, vis);
  if (!visiveis.length) return <>{children}</>;

  const abas: AbaDaPasta[] = [];
  for (const a of visiveis) {
    const tela = linhaDaRota(a.partes[0].rota);
    if (!tela) continue;
    const ehAtual = a.id === abaAtual.id;
    abas.push({
      id: a.id,
      rotulo: a.rotulo,
      tela,
      atual: ehAtual ? (a.partes[0].rota === parteAtual.rota ? "page" : "true") : null,
      contagem: undefined,
    });
  }

  const partesDaAtual = visiveis.find((a) => a.id === abaAtual.id)?.partes ?? [];
  const opcoes = partesDaAtual.flatMap((p) => {
    const tela = linhaDaRota(p.rota);
    return tela ? [{ rotulo: p.rotulo, tela, atual: p.rota === parteAtual.rota }] : [];
  });

  return (
    <NxAbasEmPasta id={secao.id} rotulo={secao.rotulo} abas={abas} dateRange={dateRange} clientId={clientId}>
      {opcoes.length > 1 && (
        <NxSegmentado rotulo={`Partes de ${abaAtual.rotulo}`} opcoes={opcoes} dateRange={dateRange} clientId={clientId} />
      )}
      {children}
    </NxAbasEmPasta>
  );
}
