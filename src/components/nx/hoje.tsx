import type { DateRangeState } from "@/lib/date-range";
import { horaEmSaoPaulo, nomeDaSaudacao, saudacaoDaHora, type AcaoDaHoje } from "@/lib/leitura/fatos-hoje";
import type { TomFato } from "@/lib/leitura/tipos";
import { REGISTRO_DE_TELAS, juntadaDoCaminho, type TelaDoRegistro } from "@/lib/registro-de-telas";
import { NxAcaoPilula, NxCartaoNumero } from "./cartoes";
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

// ---------- número em destaque ----------

/** Até aqui o número cabe grande ("30 de 30 posts"); acima disso o texto do número vai inteiro, em tamanho de leitura. */
const CURTO = 24;
const valorDoNumero = (exibicao: string) => ({ texto: exibicao.trim(), curto: exibicao.trim().length <= CURTO });

// ---------- Próximo ----------

/** Cartão de destaque "Próximo": a Ação da semana de Resultados, em degradê suave, com a seta escura para a aba de origem. */
export function NxProximo({ acao, clientId, dateRange }: { acao: AcaoDaHoje } & Destino) {
  const linha = linhaDaRota(acao.rota);
  const valor = valorDoNumero(acao.numero.exibicao);
  return (
    <section className="nx-proximo" data-acao-hoje={acao.id} data-peca="proximo" aria-label="Próximo">
      <p className="nx-proximo__rotulo">Próximo</p>
      <NxAcaoPilula frase={acao.frase} rotuloDaSeta="Abrir a aba de origem" para={linha ? { tela: linha, clientId, dateRange } : undefined} />
      <p className="nx-proximo__numero">
        <strong className={valor.curto ? "nx-proximo__valor" : "nx-proximo__valor nx-proximo__valor--texto"} data-numero-de-destaque>
          {valor.texto}
        </strong>
        <span className="nx-proximo__legenda" data-numero-de-destaque>
          {acao.legenda}
        </span>
      </p>
      <p className="nx-proximo__quem">{`Quem resolve: ${acao.rotuloQuem}`}</p>
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
 * Cartão de uma ação (NxCartaoNumero): ícone da seção de origem no círculo, "{seção} · {aba}", subtítulo com quem resolve, o ↗ para a
 * primeira aba da tela juntada (só quando a ação é de tela juntada), o número grande com a legenda e a ação em pílula com a seta
 * para a aba de origem.
 */
export function NxCartaoDaAcao({ acao, clientId, dateRange }: { acao: AcaoDaHoje } & Destino) {
  const linha = linhaDaRota(acao.rota);
  const juntada = juntadaDaRota(acao.rota);
  const primeira = juntada ? linhaDaRota(juntada.secao.abas[0].partes[0].rota) : undefined;
  const valor = valorDoNumero(acao.numero.exibicao);
  const titulo = juntada ? `${juntada.secao.rotulo} · ${juntada.aba.rotulo}` : (linha?.rotulo ?? "Resultados da clínica");
  return (
    <div className="nx-cartao-acao" data-acao-hoje={acao.id}>
      <NxCartaoNumero
        icone={juntada ? juntada.secao.icone : (linha?.icone ?? "layout-dashboard")}
        titulo={titulo}
        subtitulo={`Quem resolve: ${acao.rotuloQuem}`}
        valor={
          <strong className={valor.curto ? "nx-hoje__valor" : "nx-hoje__valor nx-hoje__valor--texto"} data-numero-de-destaque>
            {valor.texto}
          </strong>
        }
        legenda={<span data-numero-de-destaque>{acao.legenda}</span>}
        variacao={acao.outroNumero ? { texto: acao.outroNumero.exibicao } : null}
        abrir={juntada && primeira ? { tela: primeira, clientId, dateRange, rotulo: juntada.secao.rotulo } : undefined}
        acao={<NxAcaoPilula frase={acao.frase} rotuloDaSeta="Abrir a aba de origem" para={linha ? { tela: linha, clientId, dateRange } : undefined} />}
      />
    </div>
  );
}
