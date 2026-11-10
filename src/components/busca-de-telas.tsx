import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { BottomSheet } from "@/components/app-shell";
import type { DateRangeState } from "@/lib/date-range";
import type { Fontes } from "@/lib/nav";
import { buscarTelasEquipe, linkDaTela, type PerfilEquipe } from "@/lib/registro-de-telas";

export interface BuscaDeTelasProps {
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  perfil: PerfilEquipe;
  /** Clínica atual (casca da clínica) ou a última lembrada (casca /admin, 03-06). null = sem clínica. */
  clientId: string | null;
  dateRange?: DateRangeState;
  /** Fontes da clínica atual: o 03-05 usa para a linha "Sem {fonte} nesta clínica" (o link continua abrindo). */
  fontes?: Fontes;
  /** Casca /admin sem clínica lembrada: o 03-06 passa o que fazer quando a tela precisa de clínica. */
  onSemClinica?: () => void;
}

/**
 * Diálogo "Buscar tela" da equipe (MENU-03). Indexa vivas e escondidas do registro único, sem filtro de fonte por clínica.
 * Os resultados ficam dentro de data-origem="busca": o listener de clique da Phase 2 lê closest('[data-origem]') e a
 * abertura grava origem busca no log (D-08).
 */
export function BuscaDeTelas({ aberto, onAbrir, onFechar, perfil, clientId, dateRange }: BuscaDeTelasProps) {
  const [consulta, setConsulta] = useState("");

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

  // D-09: /qa/layout só entra no índice do build de desenvolvimento.
  const encontrados = aberto ? buscarTelasEquipe(perfil, consulta, { desenvolvimento: import.meta.env.DEV }) : [];
  const digitou = consulta.trim().length > 0;

  return (
    <BottomSheet aberto={aberto} onFechar={onFechar} titulo="Buscar tela" origem="busca">
      <label className="workspace-search-label" htmlFor="busca-de-telas">
        Nome da tela ou assunto
      </label>
      <input
        id="busca-de-telas"
        data-dialog-focus
        className="workspace-search"
        type="search"
        autoFocus
        value={consulta}
        onChange={(e) => setConsulta(e.target.value)}
        placeholder="Ex.: funil, relatório, integrações"
      />
      <p className="workspace-menu-help" role="status">
        {!digitou
          ? "Todas as telas continuam disponíveis aqui. Digite o nome ou o assunto."
          : encontrados.length === 1
            ? "1 tela encontrada"
            : `${encontrados.length} telas encontradas`}
      </p>
      <nav className="workspace-search-results" aria-label="Resultados da busca" data-origem="busca">
        {encontrados.map((tela) => {
          const link = linkDaTela(tela, clientId);
          // Sem clínica conhecida a linha não vira link aqui; o 03-06 trata a casca /admin (onSemClinica).
          if (!link) return null;
          const search = link.params ? { ...(dateRange ?? {}), ...(link.search ?? {}) } : link.search;
          return (
            <Link
              key={tela.rota + (tela.busca ? `?visao=${tela.busca.visao}` : "")}
              to={link.to as never}
              params={link.params as never}
              search={search as never}
              onClick={onFechar}
            >
              <span>
                <b>{tela.rotulo}</b>
                <span>{[tela.area, tela.descricao].filter(Boolean).join(" · ")}</span>
              </span>
              <ArrowRight size={16} aria-hidden />
            </Link>
          );
        })}
      </nav>
    </BottomSheet>
  );
}
