import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { BottomSheet } from "@/components/app-shell";
import { IconeTabler } from "@/components/icons/tabler";
import { NxChip } from "@/components/nx-chip";
import type { DateRangeState } from "@/lib/date-range";
import { fonteOk, type Fonte, type Fontes } from "@/lib/nav";
import {
  buscarTelasEquipe,
  linkDaTela,
  secaoDaTela,
  telasPorArea,
  type GrupoDeTelas,
  type PerfilEquipe,
  type TelaDoRegistro,
} from "@/lib/registro-de-telas";
import "../styles/nexo-busca.css";

export interface BuscaDeTelasProps {
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  perfil: PerfilEquipe;
  /** Clínica atual (casca da clínica) ou a última lembrada (casca /admin, 03-06). null = sem clínica. */
  clientId: string | null;
  dateRange?: DateRangeState;
  /** Fontes da clínica atual: tela cuja fonte a clínica não tem ganha a linha "Sem {fonte} nesta clínica" e continua abrindo. */
  fontes?: Fontes;
  /** Casca /admin sem clínica lembrada: o que fazer quando a tela escolhida precisa de clínica (D-02). */
  onSemClinica?: () => void;
}

const NOME_DA_FONTE: Record<Fonte, string> = {
  instagram: "Instagram",
  anuncios: "anúncios",
  crm: "CRM",
  atendimento: "atendimento",
};

const ERRO_DO_REGISTRO = "Não foi possível mostrar as telas. Recarregue a página; se continuar, avise a equipe do Nexo.";

type Estado =
  | { erro: false; encontrados: TelaDoRegistro[]; grupos: GrupoDeTelas[]; total: number }
  | { erro: true };

const chaveDa = (tela: TelaDoRegistro) => tela.rota + (tela.busca ? `?visao=${tela.busca.visao}` : "");

// Links visíveis do diálogo, na ordem do documento (os do details fechado não contam).
function linksVisiveis(raiz: HTMLElement | null): HTMLAnchorElement[] {
  if (!raiz) return [];
  return [...raiz.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((a) => a.getClientRects().length > 0);
}

/**
 * Diálogo "Buscar tela" da equipe (MENU-03). Indexa vivas e escondidas do registro único, sem filtro de fonte por clínica.
 * Os resultados e o "Ver todas as telas" ficam dentro de data-origem="busca": o listener de clique da Phase 2 lê
 * closest('[data-origem]') e a abertura grava origem busca no log (D-08). O filtro é local: o texto digitado não sai do
 * navegador, não vai para o log e não é guardado.
 */
export function BuscaDeTelas({ aberto, onAbrir, onFechar, perfil, clientId, dateRange, fontes, onSemClinica }: BuscaDeTelasProps) {
  const [consulta, setConsulta] = useState("");
  const listaRef = useRef<HTMLDivElement>(null);

  // O atalho mora aqui (Pitfall 9): o AppShell só liga o dele para o médico, então não há atalho duplo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (aberto) onFechar();
        else onAbrir();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto, onAbrir, onFechar]);

  // Cada abertura começa com o campo vazio.
  useEffect(() => {
    if (aberto) setConsulta("");
  }, [aberto]);

  const isAdmin = perfil.isAdmin;
  const papel = perfil.papel;
  // D-09: /qa/layout só entra no índice do build de desenvolvimento.
  const estado = useMemo<Estado>(() => {
    if (!aberto) return { erro: false, encontrados: [], grupos: [], total: 0 };
    try {
      const p = { isAdmin, papel };
      const opcoes = { desenvolvimento: import.meta.env.DEV };
      const grupos = telasPorArea(p, opcoes);
      return {
        erro: false,
        encontrados: buscarTelasEquipe(p, consulta, opcoes),
        grupos,
        total: grupos.reduce((n, g) => n + g.telas.length, 0),
      };
    } catch (erro) {
      console.error("busca-de-telas: o registro de telas não montou", erro);
      return { erro: true };
    }
  }, [aberto, consulta, isAdmin, papel]);

  const digitou = consulta.trim().length > 0;

  function linhaDaTela(tela: TelaDoRegistro) {
    const link = linkDaTela(tela, clientId);
    const semClinica = !link;
    const faltaFonte = !!fontes && !fonteOk(tela.fonte, fontes);
    // 03.1.1-08 (D-03): a tela que mora numa pasta diz onde ela mora hoje ("Onde os pacientes travam › Funil"); as telas sem pasta
    // (Carteira, Integrações, as telas únicas) continuam com a área antiga. O texto é só rótulo público do registro.
    const lugar = secaoDaTela(tela);
    const ondeMora = lugar && lugar.secao.abas.length > 1 ? `${lugar.secao.rotulo} › ${lugar.aba.rotulo}` : tela.area;
    const apoio = semClinica
      ? "Escolha uma clínica primeiro"
      : faltaFonte && tela.fonte
        ? `Sem ${NOME_DA_FONTE[tela.fonte]} nesta clínica`
        : [ondeMora, tela.descricao].filter(Boolean).join(" · ");
    const search = link?.params ? { ...(dateRange ?? {}), ...(link.search ?? {}) } : link?.search;
    return (
      <Link
        key={chaveDa(tela)}
        className="nx-resultado"
        to={(link ? link.to : "/admin") as never}
        params={link?.params as never}
        search={search as never}
        onClick={() => {
          onFechar();
          if (semClinica) onSemClinica?.();
        }}
      >
        <IconeTabler nome={tela.icone} tamanho={20} className="nx-resultado-icone" />
        <span className="nx-resultado-texto">
          <b className="nx-resultado-titulo">{tela.rotulo}</b>
          <span className="nx-resultado-apoio">{apoio}</span>
        </span>
        {tela.semSelo || tela.congelado ? (
          <span className="nx-resultado-chips">
            {tela.semSelo ? <NxChip tipo="sem-selo" /> : null}
            {tela.congelado ? <NxChip tipo="congelado" /> : null}
          </span>
        ) : null}
        <IconeTabler nome="arrow-right" tamanho={16} className="nx-resultado-seta" />
      </Link>
    );
  }

  // Teclado: ↓ no campo vai ao primeiro resultado; ↑/↓ percorrem os links; ↑ no primeiro volta ao campo.
  function onTeclaNoCampo(e: ReactKeyboardEvent<HTMLInputElement>) {
    const links = linksVisiveis(listaRef.current);
    if (e.key === "ArrowDown" && links.length) {
      e.preventDefault();
      links[0].focus();
    } else if (e.key === "Enter") {
      const primeiro = listaRef.current?.querySelector<HTMLAnchorElement>('nav[aria-label="Resultados da busca"] a[href]');
      if (primeiro) {
        e.preventDefault();
        // O clique passa pelo listener de origem da Phase 2 (origem busca).
        primeiro.click();
      }
    }
  }

  function onTeclaNaLista(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const links = linksVisiveis(listaRef.current);
    const i = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (i < 0) return;
    e.preventDefault();
    if (e.key === "ArrowDown") links[Math.min(i + 1, links.length - 1)].focus();
    else if (i === 0) document.getElementById("busca-de-telas")?.focus();
    else links[i - 1].focus();
  }

  const encontrados = estado.erro ? [] : estado.encontrados;
  const algumSemSelo = encontrados.some((t) => t.semSelo);

  return (
    <BottomSheet aberto={aberto} onFechar={onFechar} titulo="Buscar tela" origem="busca">
      <div className="nx-busca">
        <label className="workspace-search-label" htmlFor="busca-de-telas">
          Nome da tela ou assunto
        </label>
        <input
          id="busca-de-telas"
          data-dialog-focus
          className="workspace-search"
          type="search"
          autoFocus
          autoComplete="off"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={onTeclaNoCampo}
          placeholder="Ex.: funil, relatório, integrações"
        />
        {estado.erro ? (
          <p className="nx-busca-erro" role="alert">
            {ERRO_DO_REGISTRO}
          </p>
        ) : (
          <div className="nx-busca-lista" ref={listaRef} onKeyDown={onTeclaNaLista}>
            {!digitou || encontrados.length > 0 ? (
              <p className="workspace-menu-help nx-busca-status" role="status">
                {!digitou
                  ? "Todas as telas continuam disponíveis aqui. Digite o nome ou o assunto."
                  : encontrados.length === 1
                    ? "1 tela encontrada"
                    : `${encontrados.length} telas encontradas`}
              </p>
            ) : (
              <div className="ws-empty nx-busca-vazia" role="status">
                <span className="ws-empty-icon">
                  <IconeTabler nome="search" tamanho={20} />
                </span>
                <div>
                  <h3>Nenhuma tela encontrada</h3>
                  <p>Tente outra palavra, como “funil”, “relatório” ou “integrações”. Também dá para abrir “Ver todas as telas”.</p>
                </div>
              </div>
            )}
            <nav className="workspace-search-results nx-busca-resultados" aria-label="Resultados da busca" data-origem="busca">
              {encontrados.map(linhaDaTela)}
            </nav>
            {algumSemSelo ? (
              <p className="nx-busca-nota">Telas “sem selo” mostram números que ainda não têm selo de confiança.</p>
            ) : null}
            <details className="nx-busca-todas" data-origem="busca">
              <summary>Ver todas as telas ({estado.total})</summary>
              {estado.grupos.map((grupo) => (
                <section key={grupo.area} className="nx-busca-grupo">
                  <h3>{grupo.area}</h3>
                  <div className="workspace-search-results nx-busca-resultados">{grupo.telas.map(linhaDaTela)}</div>
                </section>
              ))}
            </details>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
