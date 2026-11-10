import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { IconeTabler } from "@/components/icons/tabler";
import type { DateRangeState } from "@/lib/date-range";
import {
  itemAtualDoMenu,
  itensMenuEquipe,
  linkDaTela,
  telasPorArea,
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

function LinkDoRegistro({
  tela,
  clientId,
  dateRange,
  className,
  title,
  dataOn,
  atual,
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
      aria-current={atual ? "page" : undefined}
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
              {on && mostraRotulo && item.chave === "clinica" && clientId && (
                <TodasAsTelasDaClinica rotulo={item.rotulo} perfil={perfil} clientId={clientId} aqui={aqui} dateRange={dateRange} onEscolher={onEscolher} />
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

// 09/11/2026 (João): "tu tirou tudo que dava inteligência". Todas as telas da clínica voltam ao menu da equipe, agrupadas
// pelas áreas de antes (Resultados, Marketing/Instagram, Comercial/anúncios...). Nada fica só na busca.
const NA_CLINICA_ROTA = "/_authenticated/$clientId";

function TodasAsTelasDaClinica({
  rotulo,
  perfil,
  clientId,
  aqui,
  dateRange,
  onEscolher,
}: {
  rotulo: string;
  perfil: PerfilEquipe;
  clientId: string;
  aqui: string;
  dateRange?: DateRangeState;
  onEscolher?: () => void;
}) {
  const grupos = telasPorArea(perfil, { desenvolvimento: import.meta.env.DEV })
    .map((g) => ({ area: g.area, telas: g.telas.filter((t) => t.rota.startsWith(NA_CLINICA_ROTA)) }))
    .filter((g) => g.telas.length > 0);
  return (
    <nav aria-label={`Telas de ${rotulo}`} className="nx-subtelas">
      {grupos.map((g) => (
        <div key={g.area} className="nx-subgrupo">
          <p className="nx-subgrupo-titulo">{g.area}</p>
          <ul>
            {g.telas.map((sub) => {
              const link = linkDaTela(sub, clientId);
              const subAtual = !!link && caminhoDoLink(link) === aqui;
              return (
                <li key={sub.rota + (sub.busca?.visao ?? "")}>
                  <LinkDoRegistro tela={sub} clientId={clientId} dateRange={dateRange} className="nx-subtela" atual={subAtual} onClick={onEscolher}>
                    {sub.rotulo}
                  </LinkDoRegistro>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
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
