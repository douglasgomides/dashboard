// Efeitos do log por rota (Phase 2): liga o gancho no router e grava uma linha por abertura de tela.
// As regras puras (o que gravar, onde, de onde veio) ficam em rota-log.ts. Aqui nada pode atrasar nem quebrar a navegação:
// os listeners nunca são async, nunca esperam a gravação e nunca propagam erro (D-03, LOG-04).
import type { AnyRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  ESPERA_ASSENTAR_MS,
  SUPABASE_FALSO_DO_E2E,
  criarDeduplicador,
  decidirPendente,
  deveGravar,
  ehTabelaAusente,
  montarLinha,
  origemDaNavegacao,
  origemDoClique,
  type AcaoHistorico,
  type LinhaRota,
  type Marcador,
} from "./rota-log";

const instalados = new WeakSet<object>();
let routerInstalado: AnyRouter | null = null;
// Só verdadeiro depois que deveGravar liberou; registrarBloqueada respeita.
let logLigado = false;
// Depois de uma resposta de tabela inexistente, a aba para de tentar até ser recarregada (CD-08).
let disjuntorLigado = false;
let sessaoEmMemoria: string | null = null;

// Ações do histórico desde a resolução anterior, e o marcador do último clique em menu ou busca.
let acoes: AcaoHistorico[] = [];
let marcador: Marcador | null = null;

// Linha da tela aberta que ainda espera um possível REPLACE do próprio app antes de ir ao banco (D-16).
interface Pendente {
  linha: LinhaRota;
  pathname: string;
  timer: ReturnType<typeof setTimeout>;
}
let pendente: Pendente | null = null;

const jaGravada = criarDeduplicador();

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

// D-07: o dedupe roda na hora de gravar, nunca na hora de pôr a linha como pendente, para uma linha descartada
// (D-16) não ocupar a chave. O POST sai num setTimeout 0, fora do caminho da navegação.
function enviar(linha: LinhaRota): void {
  try {
    if (jaGravada(linha)) return;
    setTimeout(() => { void gravar(linha); }, 0);
  } catch {
    // Nunca propaga.
  }
}

function gravarPendente(): void {
  const atual = pendente;
  if (!atual) return;
  pendente = null;
  clearTimeout(atual.timer);
  enviar(atual.linha);
}

function descartarPendente(): void {
  const atual = pendente;
  if (!atual) return;
  pendente = null;
  clearTimeout(atual.timer);
}

// Chamada de forma síncrona pelos guardas (beforeLoad do admin e do SAP) antes de negar: grava uma linha bloqueada
// para a tela negada (D-16, regra a). Não espera nada, não passa pela pendente e nunca lança.
export function registrarBloqueada(pathname: string): void {
  try {
    const router = routerInstalado;
    if (!logLigado || !router) return;
    const [, rawParams, foundRoute] = router.getMatchedRoutes(pathname);
    const linha = montarLinha({
      routeId: foundRoute?.id,
      params: rawParams as Record<string, unknown>,
      origem: "bloqueada",
      sessao: sessaoDaAba(),
    });
    if (!linha) return;
    enviar(linha);
  } catch {
    // Registrar a negação nunca pode mudar a decisão do guarda.
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
    logLigado = true;

    // Quem recebe o REPLACE de forma síncrona (dentro do navigate do app) decide o destino da linha pendente.
    let ultimoPathname: string = router.history.location?.pathname ?? location.pathname;
    try {
      router.history.subscribe(({ location: destino, action }: { location: { pathname: string }; action: { type: string } }) => {
        try {
          const tipo = action.type as AcaoHistorico;
          // Um REPLACE que só muda a query string (o app acrescenta ?preset=30d na primeira carga, a troca de período)
          // não é redirecionamento: a tela é a mesma. Só o REPLACE que troca o pathname conta como tal.
          const mesmoPathname = destino.pathname === ultimoPathname;
          ultimoPathname = destino.pathname;
          if (!(tipo === "REPLACE" && mesmoPathname)) acoes.push(tipo);
          if (!pendente) return;
          const decisao = decidirPendente(tipo, pendente.pathname, destino.pathname);
          if (decisao === "descartar") descartarPendente();
          else if (decisao === "gravar") gravarPendente();
        } catch {
          // O listener nunca propaga.
        }
      });
    } catch {
      // Sem o gancho do histórico o log ainda grava, só com menos precisão de origem.
    }

    // Fase de captura: roda antes do navigate do Link, então o marcador já existe quando o router resolver.
    try {
      document.addEventListener("click", (evento) => {
        try {
          const alvo = evento.target;
          if (!(alvo instanceof Element)) return;
          const link = alvo.closest("a[href]");
          const origem = origemDoClique({
            button: evento.button,
            ctrlKey: evento.ctrlKey,
            metaKey: evento.metaKey,
            altKey: evento.altKey,
            shiftKey: evento.shiftKey,
            ehLink: link !== null,
            alvoDoLink: link?.getAttribute("target"),
            origemDoContainer: alvo.closest("[data-origem]")?.getAttribute("data-origem"),
          });
          if (origem) marcador = { origem, em: Date.now() };
        } catch {
          // O listener nunca propaga.
        }
      }, true);
    } catch {
      // Sem o clique as telas saem como link; nada quebra.
    }

    let primeira = true;
    router.subscribe("onResolved", (evento) => {
      try {
        // Copia e zera em TODA resolução, inclusive as ignoradas: um replace que só muda a query string não pode
        // deixar um REPLACE pendurado para a próxima abertura, e o marcador vale uma vez (Pitfall 8).
        const acoesDaVez = acoes;
        const marcadorDaVez = marcador;
        acoes = [];
        marcador = null;
        if (!evento.pathChanged) return;
        const folha = router.state.matches[router.state.matches.length - 1];
        if (!folha || folha.status !== "success") return;
        const origem = origemDaNavegacao({ acoes: acoesDaVez, primeira, marcador: marcadorDaVez, agora: Date.now() });
        primeira = false;
        const linha = montarLinha({ routeId: folha.routeId, params: folha.params as Record<string, unknown>, origem, sessao: sessaoDaAba() });
        if (!linha) return;
        // Se a tela anterior ainda espera, ela foi mostrada e ninguém a abandonou com replace: grava primeiro.
        gravarPendente();
        // Os efeitos do React que trocam a tela com replace rodam numa tarefa do Scheduler, sem ordem garantida contra
        // um setTimeout 0. Por isso a linha espera ESPERA_ASSENTAR_MS e quem a descarta é o próprio REPLACE (acima).
        const pathname = router.history.location.pathname;
        pendente = {
          linha,
          pathname,
          timer: setTimeout(gravarPendente, ESPERA_ASSENTAR_MS),
        };
      } catch {
        // O listener nunca propaga.
      }
    });
  } catch {
    // Instalar o log nunca pode impedir o app de abrir.
  }
}
