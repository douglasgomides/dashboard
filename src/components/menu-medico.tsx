import { LinkDoRegistro } from "@/components/menu-equipe";
import { IconeTabler } from "@/components/icons/tabler";
import type { DateRangeState } from "@/lib/date-range";
import type { Visibilidade } from "@/lib/nav";
import { itemAtualDoMedico, itensMenuDoMedico, linkDaTela } from "@/lib/registro-de-telas";

// Menu do médico (Phase 3.1.1, MEDV-01, D-01 e D-06): as 6 telas aprovadas pelo João em 10/11/2026, na barra do computador, na
// barra de baixo do celular (os 4 primeiros) e na folha Menu (os 6). Itens, rótulos e destinos vêm do registro único
// (itensMenuDoMedico); nada de texto solto aqui. O contêiner data-origem="menu" é de quem monta (aside, nav.bottomnav, folha),
// nunca dos links, como no menu da equipe. Esconder da lista não é bloquear: as outras telas abrem pelo endereço.
// O MENU-06 (só Hoje e Ajuda e fontes) fica para a Phase 9, decisão do João.

export interface MenuDoMedicoProps {
  vis: Visibilidade;
  clientId: string;
  pathname: string;
  /** Período atual: vira search nos links, como em todo o menu. */
  dateRange?: DateRangeState;
  /** "barra" e "inferior" devolvem só os links (a nav é de quem monta); "folha" devolve a própria nav. */
  variante: "barra" | "inferior" | "folha";
  /** Barra recolhida: só ícones, rótulo em sr-only e title no link. */
  recolhida?: boolean;
  /** Chamado no clique de qualquer link (a folha fecha). */
  onEscolher?: () => void;
}

const semBarraFinal = (p: string) => p.replace(/\/+$/, "") || "/";

export function MenuDoMedico({ vis, clientId, pathname, dateRange, variante, recolhida = false, onEscolher }: MenuDoMedicoProps) {
  const todos = itensMenuDoMedico(vis);
  const itens = variante === "inferior" ? todos.slice(0, 4) : todos;
  const atual = itemAtualDoMedico(pathname);
  const aqui = semBarraFinal(pathname);
  const barraRecolhida = variante === "barra" && recolhida;

  const links = itens.map((item) => {
    const link = linkDaTela(item.tela, clientId);
    const exato = !!link && semBarraFinal(link.to.replace("$clientId", clientId)) === aqui;
    const on = atual === item.id;
    const texto = variante === "inferior" ? item.curto : item.rotulo;
    return (
      <LinkDoRegistro
        key={item.id}
        tela={item.tela}
        clientId={clientId}
        dateRange={dateRange}
        title={barraRecolhida ? item.rotulo : undefined}
        dataOn={on}
        ariaCurrent={on ? (exato ? "page" : "true") : undefined}
        onClick={onEscolher}
      >
        <IconeTabler nome={item.icone} tamanho={variante === "inferior" ? 22 : 20} />
        {/* Mesmo desenho da barra de antes: o rótulo aberto some com a barra recolhida e o sr-only o substitui. */}
        <span className={variante === "barra" ? "so-aberta" : undefined}>{texto}</span>
        {barraRecolhida && <span className="sr-only">{texto}</span>}
      </LinkDoRegistro>
    );
  });

  if (variante === "folha") return <nav className="workspace-pages" aria-label="Telas do Nexo">{links}</nav>;
  return <>{links}</>;
}
