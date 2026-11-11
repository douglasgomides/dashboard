import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { IconeTabler } from "@/components/icons/tabler";
import type { DateRangeState } from "@/lib/date-range";
import {
  itemAtualDoMenu,
  itensMenuEquipe,
  linkDaTela,
  secaoDoCaminho,
  secoesDaClinica,
  type LinkDaTela,
  type PerfilEquipe,
  type TelaDoRegistro,
} from "@/lib/registro-de-telas";
import "@/styles/nexo-casca.css";

// Menu da equipe (Phase 3, MENU-02, D-01): 3 itens (ou só Clínica para o estrategista, D-03) e as subtelas vivas do item
// atual. Os itens e os rótulos vêm do registro único (itensMenuEquipe); nada de texto solto aqui (D-11).
// data-origem="menu" fica no contêiner de quem monta (a aside da barra; a folha do 03-04), nunca nos links (D-08).

export interface MenuEquipeProps {
  perfil: PerfilEquipe;
  /** Clínica atual da casca. null na casca /admin sem clínica lembrada (Clínica chama onSemClinica). */
  clientId: string | null;
  pathname: string;
  /** Período atual: vira search nas rotas com $clientId, como no menu do médico. */
  dateRange?: DateRangeState;
  /** Barra recolhida: só ícones, rótulo em sr-only e title no link; sem subtelas. */
  recolhida?: boolean;
  variante: "barra" | "folha";
  /** Chamado no clique de qualquer link (a folha fecha). */
  onEscolher?: () => void;
  /** Casca /admin sem clínica lembrada: Clínica leva a /admin e chama esta função, que mostra a dica (D-02). */
  onSemClinica?: () => void;
}

const semBarraFinal = (p: string) => p.replace(/\/+$/, "") || "/";

/** Endereço concreto de um link do registro, para comparar com o pathname. */
function caminhoDoLink(link: LinkDaTela): string {
  return link.params ? link.to.replace("$clientId", link.params.clientId) : link.to;
}

function searchDoLink(link: LinkDaTela, dateRange?: DateRangeState) {
  return link.params ? { ...(dateRange ?? {}), ...(link.search ?? {}) } : link.search;
}

export function LinkDoRegistro({
  tela,
  clientId,
  dateRange,
  className,
  title,
  dataOn,
  atual,
  ariaCurrent,
  onClick,
  onSemClinica,
  children,
}: {
  tela: TelaDoRegistro;
  clientId: string | null;
  dateRange?: DateRangeState;
  className?: string;
  title?: string;
  dataOn?: boolean;
  atual?: boolean;
  /** Sobrepõe atual: "true" marca o lugar atual sem ser a página (seção da barra fora da primeira tela). */
  ariaCurrent?: "page" | "true";
  onClick?: () => void;
  onSemClinica?: () => void;
  children: ReactNode;
}) {
  const link = linkDaTela(tela, clientId);
  // Sem clínica a tela com $clientId não tem endereço: fica na Carteira e avisa quem montou o menu, que mostra a dica
  // "Escolha uma clínica para abrir os resultados dela." (D-02). O link continua dentro do contêiner de origem menu.
  const destino: LinkDaTela = link ?? { to: "/admin" };
  const aoClicar = link
    ? onClick
    : () => {
        onSemClinica?.();
        onClick?.();
      };
  return (
    <Link
      to={destino.to as never}
      params={destino.params as never}
      search={searchDoLink(destino, dateRange) as never}
      // O Link do TanStack põe aria-current="page" sozinho quando acha o link ativo, e por padrão o casamento é por prefixo
      // (/$clientId casaria com /$clientId/conteudo). Com exact, ele só marca o destino exato, igual à regra do item atual.
      activeOptions={{ exact: true, includeSearch: false }}
      className={className}
      title={title}
      data-on={dataOn ? "" : undefined}
      aria-current={ariaCurrent ?? (atual ? "page" : undefined)}
      onClick={aoClicar}
    >
      {children}
    </Link>
  );
}

export function MenuEquipe({
  perfil,
  clientId,
  pathname,
  dateRange,
  recolhida = false,
  variante,
  onEscolher,
  onSemClinica,
}: MenuEquipeProps) {
  const itens = itensMenuEquipe(perfil);
  if (!itens.length) return null;
  const atual = itemAtualDoMenu(pathname);
  const aqui = semBarraFinal(pathname);
  const folha = variante === "folha";
  const mostraRotulo = folha || !recolhida;

  return (
    <nav aria-label="Menu da equipe" className={`nx-menu ${folha ? "nx-menu--folha" : "nx-menu--barra"}`}>
      <ul>
        {itens.map((item) => {
          const on = atual?.chave === item.chave;
          const exato = on && atual.exato;
          return (
            <li key={item.chave}>
              <LinkDoRegistro
                tela={item.tela}
                clientId={clientId}
                dateRange={dateRange}
                className="nx-menu-item"
                title={mostraRotulo ? undefined : item.rotulo}
                dataOn={on}
                atual={exato}
                onClick={onEscolher}
                onSemClinica={onSemClinica}
              >
                <IconeTabler nome={item.icone} tamanho={20} />
                <span className={mostraRotulo ? "nx-menu-rotulo" : "sr-only"}>{item.rotulo}</span>
                {folha && <IconeTabler nome="chevron-right" tamanho={16} className="nx-menu-seta" />}
              </LinkDoRegistro>
              {on && item.chave === "clinica" && clientId && (
                <SecoesDaClinica
                  rotulo={item.rotulo}
                  perfil={perfil}
                  clientId={clientId}
                  pathname={pathname}
                  dateRange={dateRange}
                  mostraRotulo={mostraRotulo}
                  onEscolher={onEscolher}
                />
              )}
              {on && mostraRotulo && item.chave !== "clinica" && item.subtelas.length > 0 && (
                <nav aria-label={`Telas de ${item.rotulo}`} className="nx-subtelas">
                  <ul>
                    {item.subtelas.map((sub) => {
                      const link = linkDaTela(sub, clientId);
                      const subAtual = !!link && caminhoDoLink(link) === aqui;
                      return (
                        <li key={sub.rota}>
                          <LinkDoRegistro
                            tela={sub}
                            clientId={clientId}
                            dateRange={dateRange}
                            className="nx-subtela"
                            atual={subAtual}
                            onClick={onEscolher}
                            onSemClinica={onSemClinica}
                          >
                            {sub.rotulo}
                          </LinkDoRegistro>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// 10/11/2026 (João): "invés de ficar muitas abas em sanfona ao lado, eu entrar em uma seção, como marketing, e ir navegando
// por dentro". Sob Clínica a barra mostra só as seções (Resultados, Marketing, Comercial...); as telas da seção viram abas no
// topo da página (AbasDaSecao). As telas são as mesmas da sanfona de 09/11: nenhuma some do menu, só mudam de lugar.
function SecoesDaClinica({
  rotulo,
  perfil,
  clientId,
  pathname,
  dateRange,
  mostraRotulo,
  onEscolher,
}: {
  rotulo: string;
  perfil: PerfilEquipe;
  clientId: string;
  pathname: string;
  dateRange?: DateRangeState;
  mostraRotulo: boolean;
  onEscolher?: () => void;
}) {
  const secoes = secoesDaClinica(perfil, { desenvolvimento: import.meta.env.DEV });
  const atual = secaoDoCaminho(secoes, pathname);
  return (
    <nav aria-label={`Seções de ${rotulo}`} className="nx-secoes">
      <ul>
        {secoes.map((s) => {
          const on = atual?.secao.area === s.area;
          return (
            <li key={s.area}>
              <LinkDoRegistro
                tela={s.primeira}
                clientId={clientId}
                dateRange={dateRange}
                className="nx-secao"
                title={mostraRotulo ? undefined : s.area}
                dataOn={on}
                // Na primeira tela da seção o Link já marca "page"; nas outras telas a seção é o lugar atual ("true").
                ariaCurrent={on ? (atual?.tela === s.primeira ? "page" : "true") : undefined}
                onClick={onEscolher}
              >
                <IconeTabler nome={s.icone} tamanho={mostraRotulo ? 18 : 20} />
                <span className={mostraRotulo ? "nx-secao-rotulo" : "sr-only"}>{s.area}</span>
              </LinkDoRegistro>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Abas da seção atual, logo abaixo do cabeçalho da clínica (clínica, Trocar de clínica, Período) e antes do conteúdo.
 * Todas as telas da seção, aba atual com aria-current="page". Os links levam o período (search) como os do menu e moram
 * num contêiner data-origem="menu": o log por rota grava a abertura como menu. Fora de uma tela da clínica: nada.
 */
export function AbasDaSecao({
  perfil,
  clientId,
  pathname,
  dateRange,
  ocultas,
}: {
  perfil: PerfilEquipe;
  clientId: string;
  pathname: string;
  dateRange?: DateRangeState;
  /** routeIds que a faixa não repete (as telas que a pasta da tela juntada já mostra). Sem a lista, mostra a seção inteira. */
  ocultas?: ReadonlySet<string>;
}) {
  const secoes = secoesDaClinica(perfil, { desenvolvimento: import.meta.env.DEV });
  const atual = secaoDoCaminho(secoes, pathname);
  const trilho = useRef<HTMLUListElement>(null);
  // No celular a aba atual pode nascer fora da faixa: rola só a faixa (nunca a página) até ela.
  useEffect(() => {
    const ul = trilho.current;
    const aba = ul?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!ul || !aba || ul.scrollWidth <= ul.clientWidth) return;
    const esquerda = aba.offsetLeft - ul.offsetLeft;
    if (esquerda < ul.scrollLeft || esquerda + aba.offsetWidth > ul.scrollLeft + ul.clientWidth)
      ul.scrollLeft = Math.max(0, esquerda - 16);
  }, [pathname, atual?.secao.area]);
  if (!atual) return null;
  const telas = ocultas ? atual.secao.telas.filter((t) => !ocultas.has(t.rota)) : atual.secao.telas;
  if (!telas.length) return null;
  return (
    <nav aria-label={`Telas de ${atual.secao.area}`} className="nx-abas" data-origem="menu">
      <ul ref={trilho}>
        {telas.map((t) => (
          <li key={t.rota}>
            <LinkDoRegistro tela={t} clientId={clientId} dateRange={dateRange} className="nx-aba" atual={t === atual.tela}>
              {t.rotulo}
            </LinkDoRegistro>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Marca do Nexo na casca logada: o "N" Cobalto da prancha e a palavra Nexo (some na barra recolhida, fica em sr-only). */
export function MarcaNexo({ recolhida = false }: { recolhida?: boolean }) {
  return (
    <span className="nx-marca">
      <span className="nx-marca-n" aria-hidden="true" />
      <span className={recolhida ? "sr-only" : "nx-marca-nome"}>Nexo</span>
    </span>
  );
}
