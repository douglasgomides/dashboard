import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent as EventoDeTecla, type PointerEvent as EventoDePonteiro } from "react";
import type { CartaoDoMes, PostDoCartao, VisualDoCartao } from "@/lib/fechamento-do-mes";
import { ALTURA, LARGURA, caminhoDaArea, caminhoDaLinha, pontosDaLinha } from "@/lib/linha-30-dias";
import "@/styles/nexo-historia-do-mes.css";

// Fechamento do mês em história (Phase 03.1.1.1, plano 08, D-06): cartões em tela cheia sobre Resultados da clínica, UM número por cartão,
// barras de progresso, toque à direita avança e à esquerda volta. Só apresentação: recebe os cartões prontos de src/lib/fechamento-do-mes.ts,
// não busca, não grava e não envia nada (D-04: nada de compartilhar, PDF ou envio). Todo texto é texto do React (nenhum HTML montado a partir de
// dado). O dialog nativo segue a mesma disciplina do funil desenhado: showModal, a página não rola por baixo e o foco volta ao botão que abriu.
// Movimento (avanço sozinho, número que conta, transição) só com prefers-reduced-motion: no-preference; com "reduce" só toque e teclas.

/** Quanto cada cartão fica na tela antes de passar sozinho. */
export const DURACAO_DO_CARTAO_EM_MS = 7000;
/** Arrastar mais que isto, de lado, vira "próximo" ou "anterior". */
const ARRASTE_MINIMO_EM_PX = 40;
/** Segurar mais que isto só pausa (não conta como toque). */
const SEGURAR_EM_MS = 450;
/** O toque nesta faixa da esquerda volta; no resto, avança. */
const FAIXA_DE_VOLTAR = 0.3;
const DURACAO_DA_CONTAGEM_EM_MS = 900;

const SELETOR_DO_BOTAO = '[data-peca="botao-fechamento"]';

/** true quando a pessoa NÃO pediu menos movimento. Sem matchMedia (ou com "reduce"), nenhum movimento. */
function useMovimentoPermitido(): boolean {
  const consulta = "(prefers-reduced-motion: no-preference)";
  const [permitido, setPermitido] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(consulta).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(consulta);
    const mudou = () => setPermitido(m.matches);
    mudou();
    m.addEventListener("change", mudou);
    return () => m.removeEventListener("change", mudou);
  }, []);
  return permitido;
}

/** O botão que abre a história. Só avisa que foi tocado: quem decide o que abrir (e com qual período) é a tela. */
export function BotaoFechamentoDoMes({ aoAbrir, titulo }: { aoAbrir: () => void; titulo?: string }) {
  return (
    <button type="button" className="nx-botao nx-historia-botao" data-peca="botao-fechamento" aria-haspopup="dialog" title={titulo} onClick={aoAbrir}>
      <span aria-hidden>▶</span> Fechamento do mês
    </button>
  );
}

export interface NxHistoriaDoMesProps {
  cartoes: readonly CartaoDoMes[];
  aberto: boolean;
  aoFechar: () => void;
  /** O cartão em que a história começa (padrão: o primeiro). */
  inicio?: number;
}

export function NxHistoriaDoMes({ cartoes, aberto, aoFechar, inicio = 0 }: NxHistoriaDoMesProps) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const tela = useRef<HTMLDivElement>(null);
  const movimento = useMovimentoPermitido();
  const total = cartoes.length;
  const [atual, setAtual] = useState(0);
  const [pausadoPorMim, setPausadoPorMim] = useState(false);
  const [segurando, setSegurando] = useState(false);
  /** De 0 a 1: quanto do tempo do cartão atual já passou (só anda com movimento). */
  const [progresso, setProgresso] = useState(0);
  const decorrido = useRef(0);
  const toque = useRef<{ x: number; t: number } | null>(null);

  const ir = useCallback(
    (i: number) => {
      const alvo = Math.max(0, Math.min(total - 1, i));
      decorrido.current = 0;
      setProgresso(0);
      setAtual(alvo);
    },
    [total],
  );

  // Abre e fecha o dialog nativo. A página não rola enquanto a história está aberta; ao fechar o foco volta ao botão de entrada.
  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (!aberto) {
      if (d.open) d.close();
      return;
    }
    decorrido.current = 0;
    setProgresso(0);
    setAtual(Math.max(0, Math.min(total - 1, inicio)));
    setPausadoPorMim(false);
    setSegurando(false);
    if (!d.open) d.showModal();
    // O foco vai para a tela (não para um botão): assim a barra de espaço pausa e as setas navegam sem apertar nada sem querer.
    tela.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (d.open) d.close();
      const botao = document.querySelector<HTMLElement>(SELETOR_DO_BOTAO);
      if (botao && document.activeElement !== botao) botao.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  const pausado = pausadoPorMim || segurando;
  const ultimo = atual >= total - 1;

  // Avanço sozinho: só com movimento permitido, sem pausa e fora do último cartão. O tempo já gasto fica guardado para a pausa continuar de onde parou.
  useEffect(() => {
    if (!aberto || !movimento || pausado || ultimo || total === 0) return;
    let quadro = 0;
    const inicioDoTrecho = performance.now() - decorrido.current;
    const passo = () => {
      const d = performance.now() - inicioDoTrecho;
      decorrido.current = d;
      const k = Math.min(1, d / DURACAO_DO_CARTAO_EM_MS);
      setProgresso(k);
      if (k >= 1) {
        ir(atual + 1);
        return;
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [aberto, movimento, pausado, ultimo, atual, total, ir]);

  const aoApertar = (ev: EventoDePonteiro<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).closest("button")) return;
    toque.current = { x: ev.clientX, t: performance.now() };
    setSegurando(true);
  };
  const aoSoltar = (ev: EventoDePonteiro<HTMLDivElement>) => {
    const t = toque.current;
    toque.current = null;
    setSegurando(false);
    if (!t) return;
    const dx = ev.clientX - t.x;
    if (Math.abs(dx) > ARRASTE_MINIMO_EM_PX) {
      ir(atual + (dx < 0 ? 1 : -1));
      return;
    }
    if (performance.now() - t.t > SEGURAR_EM_MS) return;
    const caixa = ev.currentTarget.getBoundingClientRect();
    ir(atual + (ev.clientX - caixa.left < caixa.width * FAIXA_DE_VOLTAR ? -1 : 1));
  };

  const aoTeclar = (ev: EventoDeTecla<HTMLDialogElement>) => {
    if (ev.key === "ArrowRight") {
      ev.preventDefault();
      ir(atual + 1);
    } else if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      ir(atual - 1);
    } else if (ev.key === " " && !(ev.target as HTMLElement).closest("button")) {
      ev.preventDefault();
      if (movimento) setPausadoPorMim((p) => !p);
    }
  };

  const cartao = cartoes[atual];
  return (
    <dialog ref={dialogo} className="nx-historia" aria-label="Fechamento do mês" data-peca="historia-do-mes" onClose={aoFechar} onKeyDown={aoTeclar}>
      {aberto && cartao && (
        <div
          ref={tela}
          className="nx-historia__tela"
          tabIndex={-1}
          data-cartao={cartao.id}
          data-tom={cartao.tom}
          data-movimento={movimento ? "" : undefined}
          onPointerDown={aoApertar}
          onPointerUp={aoSoltar}
          onPointerCancel={() => {
            toque.current = null;
            setSegurando(false);
          }}
        >
          <div className="nx-historia__barras" aria-hidden>
            {cartoes.map((c, k) => (
              <span key={c.id}>
                <i style={{ width: `${k < atual ? 100 : k === atual ? (movimento ? progresso * 100 : 100) : 0}%` }} />
              </span>
            ))}
          </div>
          <header className="nx-historia__topo">
            <span className="nx-historia__marca">
              Nexo <small>· {cartao.periodo?.atual ?? "mês"}</small>
            </span>
            <span className="nx-historia__botoes">
              {movimento && !ultimo && (
                <button type="button" className="nx-historia__botao" aria-pressed={pausadoPorMim} onClick={() => setPausadoPorMim((p) => !p)}>
                  {pausadoPorMim ? "Continuar" : "Pausar"}
                </button>
              )}
              {!ultimo && (
                <button type="button" className="nx-historia__botao" onClick={aoFechar}>
                  Sair
                </button>
              )}
            </span>
          </header>
          <p className="sr-only" role="status">
            {`Cartão ${atual + 1} de ${total}`}
          </p>
          <div className="nx-historia__palco" aria-live="polite">
            <CartaoDaHistoria key={cartao.id} cartao={cartao} mover={movimento} />
            {ultimo && (
              <div className="nx-historia__fim">
                <button type="button" className="nx-historia__acao" data-primaria="" onClick={() => ir(0)}>
                  Ver de novo
                </button>
                <button type="button" className="nx-historia__acao" onClick={aoFechar}>
                  Sair
                </button>
              </div>
            )}
          </div>
          <nav className="nx-historia__nav" aria-label="Mudar de cartão">
            <button type="button" className="nx-historia__seta" disabled={atual === 0} onClick={() => ir(atual - 1)}>
              <span aria-hidden>‹</span> Anterior
            </button>
            {!ultimo && (
              <button type="button" className="nx-historia__seta" onClick={() => ir(atual + 1)}>
                Próximo <span aria-hidden>›</span>
              </button>
            )}
          </nav>
        </div>
      )}
    </dialog>
  );
}

// ---------- um cartão ----------

const NUMERO = /\d[\d.]*(?:,\d+)?/;

/** O número com o primeiro valor multiplicado por k (0 a 1), no mesmo formato: "1.234" a 50% vira "617", "R$ 12,30" vira "R$ 6,15". */
function numeroNoPasso(texto: string, k: number): string {
  const m = NUMERO.exec(texto);
  if (!m) return texto;
  const bruto = m[0];
  const casas = bruto.includes(",") ? bruto.length - bruto.indexOf(",") - 1 : 0;
  const alvo = Number(bruto.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(alvo)) return texto;
  const v = (alvo * k).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  return texto.slice(0, m.index) + v + texto.slice(m.index + bruto.length);
}

/** O número grande. Com movimento permitido ele conta de 0 até o valor; sem, já nasce pronto. Leitor de tela só ouve o valor final. */
function NumeroGrande({ texto, mover }: { texto: string; mover: boolean }) {
  const [exibido, setExibido] = useState(() => (mover ? numeroNoPasso(texto, 0) : texto));
  const [contando, setContando] = useState(mover);
  useEffect(() => {
    if (!mover) {
      setExibido(texto);
      setContando(false);
      return;
    }
    setContando(true);
    const inicio = performance.now();
    let quadro = 0;
    const passo = () => {
      const k = Math.min(1, (performance.now() - inicio) / DURACAO_DA_CONTAGEM_EM_MS);
      const suave = 1 - Math.pow(1 - k, 3);
      setExibido(k >= 1 ? texto : numeroNoPasso(texto, suave));
      if (k < 1) quadro = requestAnimationFrame(passo);
      else setContando(false);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [texto, mover]);
  return (
    <span className="nx-historia__numero" data-peca="numero-do-cartao" data-longo={texto.length > 6 ? "" : undefined} aria-hidden={contando ? true : undefined}>
      {exibido}
    </span>
  );
}

const CartaoDaHistoria = memo(function CartaoDaHistoria({ cartao, mover }: { cartao: CartaoDoMes; mover: boolean }) {
  return (
    <section className="nx-historia__cartao" data-peca="cartao-da-historia" data-id={cartao.id} aria-label={cartao.rotulo}>
      <p className="nx-historia__rotulo">{cartao.rotulo}</p>
      {cartao.titulo && <p className="nx-historia__titulo">{cartao.titulo}</p>}
      {cartao.numero != null && <NumeroGrande texto={cartao.numero} mover={mover} />}
      <p className="nx-historia__legenda">{cartao.legenda}</p>
      {cartao.comparacao && (
        <p className="nx-historia__chip" data-tom={cartao.tom}>
          {cartao.comparacao}
        </p>
      )}
      {cartao.post && <PostCampeao post={cartao.post} />}
      {cartao.visual && <DesenhoDoVisual visual={cartao.visual} />}
      {cartao.periodo && (
        <p className="nx-historia__periodo">{cartao.comparacao ? `${cartao.periodo.atual} · antes: ${cartao.periodo.anterior}` : cartao.periodo.atual}</p>
      )}
    </section>
  );
});

/** O post campeão: a legenda da própria clínica como texto (duas linhas, o texto inteiro no title) e os dados do post em quatro quadros. */
function PostCampeao({ post }: { post: PostDoCartao }) {
  const quadros = [
    post.alcance ? { valor: post.alcance, rotulo: "pessoas alcançadas" } : null,
    post.formato ? { valor: post.formato, rotulo: "formato" } : null,
    post.tema ? { valor: post.tema, rotulo: "tema" } : null,
    post.quando ? { valor: post.quando, rotulo: "publicado em" } : null,
  ].filter((q): q is { valor: string; rotulo: string } => q != null);
  return (
    <>
      {post.legenda && (
        <blockquote className="nx-historia__cita" title={post.legenda}>
          {post.legenda}
        </blockquote>
      )}
      {quadros.length > 0 && (
        <dl className="nx-historia__quadros">
          {quadros.map((q) => (
            <div key={q.rotulo}>
              <dt>{q.rotulo}</dt>
              <dd title={q.valor}>{q.valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

function DesenhoDoVisual({ visual }: { visual: VisualDoCartao }) {
  switch (visual.tipo) {
    case "barras": {
      const maior = Math.max(1, ...visual.valores.filter((v): v is number => v != null));
      return (
        <div className="nx-historia__visual">
          <div className="nx-historia__barras-dia" aria-hidden>
            {visual.valores.map((v, k) => (
              <i key={k} data-vazio={v == null ? "" : undefined} style={{ height: v == null ? "4%" : `${Math.max(4, (v / maior) * 100)}%` }} />
            ))}
          </div>
          <p className="nx-historia__legenda-pequena">{visual.legenda}</p>
        </div>
      );
    }
    case "pontos":
      return (
        <div className="nx-historia__visual">
          <div className="nx-historia__pontos" aria-hidden>
            {visual.pontos.map((p, k) => (
              <i key={k} data-ponto={p} style={{ animationDelay: `${k * 22}ms` }} />
            ))}
          </div>
          <p className="nx-historia__legenda-pequena">{visual.legenda.join(" · ")}</p>
        </div>
      );
    case "linha": {
      // A mesma linha de 30 dias das outras telas: dia sem dado quebra o caminho (nunca desce a zero).
      const pontos = pontosDaLinha(visual.valores);
      return (
        <div className="nx-historia__visual">
          <svg className="nx-historia__linha" viewBox={`0 0 ${LARGURA} ${ALTURA}`} preserveAspectRatio="none" aria-hidden focusable="false">
            <path className="nx-historia__linha-area" d={caminhoDaArea(pontos)} />
            <path className="nx-historia__linha-traco" d={caminhoDaLinha(pontos)} />
          </svg>
          <p className="nx-historia__legenda-pequena">{visual.legenda}</p>
        </div>
      );
    }
    case "funil":
      return (
        <ul className="nx-historia__funil" aria-label="Etapas do funil">
          {visual.etapas.map((x) => (
            <li key={x.rotulo} data-perda={x.perda ? "" : undefined}>
              <span>{x.rotulo}</span>
              <span>{x.valor}</span>
              <span className="nx-historia__funil-trilho" aria-hidden>
                <i style={{ width: `${x.fracao * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "regua":
      return (
        <div className="nx-historia__visual">
          <div className="nx-historia__regua" aria-hidden>
            <span className="nx-historia__regua-eixo" />
            {visual.dias.map((d, k) => (
              <i key={k} style={{ left: `${d}%` }} />
            ))}
            <i className="nx-historia__regua-agora" style={{ left: `${visual.agora}%` }} />
            <span className="nx-historia__regua-rotulo" style={{ left: `${visual.agora}%` }}>
              Agora
            </span>
          </div>
          <p className="nx-historia__legenda-pequena nx-historia__regua-legenda">
            <span>◀ {visual.legenda[0]}</span>
            <span>{visual.legenda[1]} ▶</span>
            <span>{visual.legenda[2]}</span>
          </p>
        </div>
      );
    case "lista":
      return (
        <ol className="nx-historia__apostas">
          {visual.itens.map((x, k) => (
            <li key={`${k}-${x.titulo}`}>
              <span className="nx-historia__aposta-n" aria-hidden>
                {k + 1}
              </span>
              <div>
                <b>{x.titulo}</b>
                <span>{x.motivo}</span>
              </div>
            </li>
          ))}
        </ol>
      );
  }
}
