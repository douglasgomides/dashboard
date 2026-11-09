// Efeitos do log por rota (Phase 2): liga o gancho no router e grava uma linha por abertura de tela.
// As regras puras (o que gravar, onde) ficam em rota-log.ts. Aqui nada pode atrasar nem quebrar a navegação:
// o listener nunca é async, nunca espera a gravação e nunca propaga erro (D-03, LOG-04).
import type { AnyRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { deveGravar, ehTabelaAusente, montarLinha, SUPABASE_FALSO_DO_E2E, type LinhaRota, type Origem } from "./rota-log";

const instalados = new WeakSet<object>();
// O plano 02-02 usa o router guardado aqui.
let routerInstalado: AnyRouter | null = null;
// Depois de uma resposta de tabela inexistente, a aba para de tentar até ser recarregada (CD-08).
let disjuntorLigado = false;
let sessaoEmMemoria: string | null = null;

export function routerDoRotaLog(): AnyRouter | null {
  return routerInstalado;
}

// CD-10: uma sessão por aba, em sessionStorage; se o storage falhar, um UUID em memória.
function sessaoDaAba(): string {
  try {
    const guardada = sessionStorage.getItem("nexo:rota-sessao");
    if (guardada) return guardada;
    const nova = crypto.randomUUID();
    sessionStorage.setItem("nexo:rota-sessao", nova);
    return nova;
  } catch {
    sessaoEmMemoria ??= crypto.randomUUID();
    return sessaoEmMemoria;
  }
}

// Chamada só de dentro do callback do setTimeout 0. O await do insert é obrigatório: o builder do postgrest-js
// só dispara o fetch quando é aguardado (then); sem await nem .then o POST nunca sai do navegador.
async function gravar(linha: LinhaRota): Promise<void> {
  try {
    if (disjuntorLigado) return;
    const { error, status } = await (supabase as any).from("rota_acessos").insert(linha);
    if (ehTabelaAusente({ code: error?.code, status })) disjuntorLigado = true;
  } catch {
    // Falhar ao gravar nunca pode virar erro na tela.
  }
}

export function instalarRotaLog(router: AnyRouter): void {
  try {
    if (instalados.has(router)) return;
    instalados.add(router);
    routerInstalado = router;

    const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL;
    // A chave do e2e só é lida num bundle construído com o Supabase falso; com qualquer outro, nem é lida (CD-01, D-04).
    let forcado = false;
    if (supabaseUrl === SUPABASE_FALSO_DO_E2E) {
      try { forcado = localStorage.getItem("nexo:rota-log") === "1"; } catch { forcado = false; }
    }
    if (!deveGravar(location.hostname, forcado, supabaseUrl)) return;

    let primeira = true;
    router.subscribe("onResolved", (evento) => {
      try {
        if (!evento.pathChanged) return;
        const folha = router.state.matches[router.state.matches.length - 1];
        if (!folha || folha.status !== "success") return;
        // O plano 02-02 troca esta regra por origemDaNavegacao sem mudar a arquitetura.
        const origem: Origem = primeira ? "direto" : "link";
        primeira = false;
        const linha = montarLinha({ routeId: folha.routeId, params: folha.params as Record<string, unknown>, origem, sessao: sessaoDaAba() });
        if (!linha) return;
        setTimeout(() => { void gravar(linha); }, 0);
      } catch {
        // O listener nunca propaga.
      }
    });
  } catch {
    // Instalar o log nunca pode impedir o app de abrir.
  }
}
