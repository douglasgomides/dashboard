import type { DateRangeState } from "@/lib/date-range";
import { horaEmSaoPaulo, nomeDaSaudacao, saudacaoDaHora, type AcaoDaHoje } from "@/lib/leitura/fatos-hoje";
import type { TomFato } from "@/lib/leitura/tipos";
import { LinkDoRegistro } from "@/components/menu-equipe";
import { REGISTRO_DE_TELAS, juntadaDoCaminho, type TelaDoRegistro } from "@/lib/registro-de-telas";
import { NxAcaoPilula, NxBarras, NxCartaoNumero } from "./cartoes";
import { SINAL } from "./pagina";
import "@/styles/nexo-hoje.css";

// Peças da tela O que fazer hoje (Phase 3.1.1, plano 05, D-07), feitas sobre as peças de cartoes.tsx: saudação grande, chip de
// estado com bolinha, cartão de destaque "Próximo" e o cartão de cada ação. Só apresentação: nenhuma peça busca dado, grava ou
// dispara pedido. Os botões são links para a aba de origem (CHAM-07: nada é enviado sozinho). Só tokens do nexo-system.css.

type Destino = { clientId: string; dateRange?: DateRangeState };

/** Linha do registro (sem atalho de busca) de um routeId. */
export const linhaDaRota = (rota: string): TelaDoRegistro | undefined => REGISTRO_DE_TELAS.find((t) => t.rota === rota && !t.busca);

// ---------- saudação ----------

/** "Bom dia, Dra. Lana": a saudação pela hora de São Paulo e o nome em cinza mais claro. Sem nome, só a saudação. */
export function SaudacaoHoje({ nome }: { nome?: string | null }) {
  const curto = nomeDaSaudacao(nome);
  return (
    <>
      {saudacaoDaHora(horaEmSaoPaulo())}
      {curto && (
        <>
          {", "}
          <span className="nx-hoje__nome">{curto}</span>
        </>
      )}
    </>
  );
}

// ---------- chip de estado ----------

/** Chip com bolinha colorida (bom, atenção, ruim) para o estado de uma fonte: "CRM até 09/11" e a hora do dado ao lado. */
export function NxChipEstado({ tom, texto, hora }: { tom: TomFato; texto: string; hora?: string | null }) {
  return (
    <span className="nx-chip-estado" data-tom={tom} role="img" aria-label={hora ? `${texto}, às ${hora}` : texto}>
      <span className="nx-chip-estado__bolinha" aria-hidden />
      <span aria-hidden>{texto}</span>
      {hora && (
        <span className="nx-chip-estado__hora" aria-hidden>
          {hora}
        </span>
      )}
    </span>
  );
}

// ---------- tom da ação e quem resolve ----------

const NOME_DO_TOM: Record<TomFato, string> = { bom: "bom", atencao: "atenção", ruim: "ruim", neutro: "neutro" };

/**
 * O tom que a regra já calcula (bom, atenção, ruim, neutro), com sinal (▲ ! ▼ ●) e cor: nunca só a cor (D-07). O nome do tom é
 * para leitor de tela ("Sinal: atenção"). Os sinais são os da leitura (SINAL de pagina.tsx).
 */
export function MarcaDoTom({ tom }: { tom: TomFato }) {
  return (
    <span className="nx-hoje__tom" data-tom={tom} role="img" aria-label={`Sinal: ${NOME_DO_TOM[tom]}`}>
      <span aria-hidden>{SINAL[tom]}</span>
    </span>
  );
}

/** "Quem resolve" em chip pequeno com o nome ("Social media"); o rótulo fica só para leitor de tela (o textContent o mantém). */
function QuemResolve({ nome }: { nome: string }) {
  return (
    <span className="nx-hoje__quem">
      <span className="sr-only">Quem resolve: </span>
      {nome}
    </span>
  );
}

// ---------- número em destaque ----------

/** Até aqui o número cabe grande ("30 de 30 posts"); acima disso a manchete vai inteira, em tamanho de leitura. */
const CURTO = 24;
/** A manchete (até 40 caracteres): estilo de número grande só quando é um número do fato e curto; senão, estilo de texto. */
const valorDoDestaque = (acao: AcaoDaHoje) => ({ texto: acao.destaque.trim(), curto: acao.destaqueEhNumero && acao.destaque.trim().length <= CURTO });

/** Os números técnicos (o texto inteiro, com mediana e taxa) ficam fechados: quem quer conferir abre. Sem número técnico, nada. */
function VerNumeros({ acao }: { acao: AcaoDaHoje }) {
  if (acao.numerosTecnicos.length === 0) return null;
  return (
    <details className="nx-hoje__numeros" data-ver-numeros>
      <summary>Ver números</summary>
      <p>{acao.numerosTecnicos.join(" · ")}</p>
    </details>
  );
}

// ---------- Próximo ----------

/**
 * Cartão de destaque "Próximo": a Ação da semana de Resultados, em degradê suave, com a seta escura para a aba de origem. Na mesma
 * ordem dos cartões: a manchete (o número) primeiro, a legenda de uma frase, as barras de comparação quando o fato traz, o "Ver
 * números" fechado e só então a pílula da ação, com o "Quem resolve" logo depois.
 */
export function NxProximo({ acao, clientId, dateRange }: { acao: AcaoDaHoje } & Destino) {
  const linha = linhaDaRota(acao.rota);
  const valor = valorDoDestaque(acao);
  return (
    <section className="nx-proximo" data-acao-hoje={acao.id} data-peca="proximo" data-area-hoje={acao.areaHoje} data-familia-hoje={acao.familia} aria-label="Próximo passo">
      <div className="nx-proximo__topo">
        <p className="nx-proximo__rotulo">Próximo passo</p>
        <MarcaDoTom tom={acao.tom} />
      </div>
      <p className="nx-proximo__numero">
        <strong className={valor.curto ? "nx-proximo__valor" : "nx-proximo__valor nx-proximo__valor--texto"} data-numero-de-destaque data-manchete>
          {valor.texto}
        </strong>
        {acao.legenda && (
          <span className="nx-proximo__legenda" data-numero-de-destaque>
            {acao.legenda}
          </span>
        )}
      </p>
      {acao.barras && <NxBarras barras={acao.barras} />}
      <VerNumeros acao={acao} />
      <NxAcaoPilula frase={acao.frase} rotuloDaSeta="Abrir a aba de origem" para={linha ? { tela: linha, clientId, dateRange } : undefined} />
      <QuemResolve nome={acao.rotuloQuem} />
    </section>
  );
}

// ---------- cartão de cada ação ----------

/** A seção e a aba da tela juntada de um routeId (a Hoje só sabe a rota; o caminho é o da tela antiga). */
function juntadaDaRota(rota: string) {
  const sub = rota.replace("/_authenticated/$clientId", "").replace(/\/+$/, "");
  return juntadaDoCaminho(`/00000000-0000-4000-8000-000000000000${sub}`);
}

/**
 * Cartão de uma ação (NxCartaoNumero): ícone da seção de origem no círculo, "{seção} · {aba}", subtítulo com o número de contexto
 * ("30 dias · 10 posts"), o ↗ para a primeira aba da tela juntada (só quando a ação é de tela juntada), a manchete leiga com a
 * legenda e o "Ver números" fechado, e a ação em pílula com a seta para a aba de origem, seguida de "Quem resolve".
 */
export function NxCartaoDaAcao({ acao, clientId, dateRange }: { acao: AcaoDaHoje } & Destino) {
  const linha = linhaDaRota(acao.rota);
  const juntada = juntadaDaRota(acao.rota);
  const primeira = juntada ? linhaDaRota(juntada.secao.abas[0].partes[0].rota) : undefined;
  const valor = valorDoDestaque(acao);
  const titulo = juntada ? `${juntada.secao.rotulo} · ${juntada.aba.rotulo}` : (linha?.rotulo ?? "Resultados da clínica");
  return (
    <div className="nx-cartao-acao" data-acao-hoje={acao.id} data-area-hoje={acao.areaHoje} data-familia-hoje={acao.familia}>
      <NxCartaoNumero
        icone={juntada ? juntada.secao.icone : (linha?.icone ?? "layout-dashboard")}
        titulo={titulo}
        subtitulo={acao.contexto}
        valor={
          <strong className={valor.curto ? "nx-hoje__valor" : "nx-hoje__valor nx-hoje__valor--texto"} data-numero-de-destaque data-manchete>
            {valor.texto}
          </strong>
        }
        legenda={acao.legenda ? <span data-numero-de-destaque>{acao.legenda}</span> : undefined}
        variacao={acao.outroNumero ? { texto: acao.outroNumero.exibicao } : null}
        abrir={juntada && primeira ? { tela: primeira, clientId, dateRange, rotulo: juntada.secao.rotulo } : undefined}
        info={<MarcaDoTom tom={acao.tom} />}
        extra={
          <>
            {acao.barras && <NxBarras barras={acao.barras} />}
            <VerNumeros acao={acao} />
          </>
        }
        acao={
          <>
            <NxAcaoPilula frase={acao.frase} rotuloDaSeta="Abrir a aba de origem" para={linha ? { tela: linha, clientId, dateRange } : undefined} />
            <QuemResolve nome={acao.rotuloQuem} />
          </>
        }
      />
    </div>
  );
}

// ---------- Para a equipe ----------

/**
 * Linha pequena só para a equipe (admin e estrategista): arrumação interna do dado, que o médico não precisa ver. Quem monta a
 * peça é a rota, e só para a equipe: para o médico o componente nem é montado. Cada item é um link para a aba de origem (nada grava).
 */
export function NxParaEquipe({ acoes, clientId, dateRange }: { acoes: AcaoDaHoje[] } & Destino) {
  return (
    <p className="nx-hoje__equipe" data-peca="para-equipe">
      <span>Para a equipe:</span>{" "}
      {acoes.map((a, k) => {
        const linha = linhaDaRota(a.rota);
        return (
          <span key={a.id}>
            {k > 0 && " · "}
            <span data-acao-equipe={a.id}>
              {linha ? (
                <LinkDoRegistro tela={linha} clientId={clientId} dateRange={dateRange} className="nx-hoje__equipe-link">
                  {a.frase}
                </LinkDoRegistro>
              ) : (
                a.frase
              )}
            </span>
          </span>
        );
      })}
    </p>
  );
}
