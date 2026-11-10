import { Link } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { IconeTabler } from "@/components/icons/tabler";
import { NxCard, type NxTom } from "@/components/nx";
import { PlanoAviso, PlanoChip, PlanoComo, PlanoContadores, PlanoLinha, PlanoVazio } from "./plano-pecas";
import { MATURACAO_DIAS, MINIMO_ATENDIDOS, ROTULO_ORIGEM, type EstadoPlano, type OrigemPlano } from "@/lib/plano-semana";

// Plano da semana do Nexo no desenho do painel: contadores no topo, as ações da semana em linhas (o que fazer
// primeiro, valor em jogo e estado em chips) e a semana passada embaixo. Só apresentação: PlanoSemana lê, calcula
// e grava; aqui chegam os itens e os números prontos.

export interface ItemPlanoPainel {
  id: string;
  origem: OrigemPlano;
  titulo: string;
  porque: string;
  acao: string;
  onde: string | null;
  valor_brl: number | null;
  valor_calculo: string | null;
  estado: EstadoPlano;
  resultado_brl: number | null;
  resultado_texto: string | null;
}

const TOM_COR: Record<string, NxTom> = { "var(--good)": "up", "var(--good-text)": "up", "var(--warn)": "or", "var(--muted)": "g" };

export function PlanoSemanaPainel({
  semanaRotulo,
  ultimaRotulo,
  atual,
  passada,
  seloEstado,
  temParcial,
  brl,
  numeros,
  base,
  podeEditar,
  gerando,
  aviso,
  onAtualizar,
  onDecidir,
}: {
  semanaRotulo: string;
  ultimaRotulo?: string;
  atual: ItemPlanoPainel[];
  passada: ItemPlanoPainel[];
  seloEstado: (i: ItemPlanoPainel) => { texto: string; cor: string };
  temParcial: (i: ItemPlanoPainel) => boolean;
  brl: (v: number | null | undefined) => string;
  numeros: { emJogo: number; feitas: number; historico: number; gerado: number; evitado: number };
  base: string;
  podeEditar: boolean;
  gerando: boolean;
  aviso: string | null;
  onAtualizar: () => void;
  onDecidir: (id: string, estado: EstadoPlano) => void;
}) {
  const aFazer = atual.filter((i) => i.estado === "proposta").length;
  const ativos = atual.filter((i) => i.estado !== "descartada");
  return (
    <div className="nexo-plano">
      <PlanoContadores
        rotulo="Números do plano"
        itens={[
          { rotulo: "Em jogo nesta semana", valor: numeros.emJogo ? brl(numeros.emJogo) : "—", tom: "up", nota: `${atual.length} ação(ões) priorizada(s)` },
          { rotulo: "A fazer", valor: aFazer, tom: aFazer ? "or" : "g", nota: `de ${ativos.length} na semana` },
          { rotulo: "Ações feitas (12 semanas)", valor: numeros.historico ? `${numeros.feitas} de ${numeros.historico}` : "—", tom: "b", nota: "conferido pelos dados ou marcado pela equipe" },
          {
            rotulo: "Receita estimada (12 semanas)",
            valor: numeros.gerado ? brl(numeros.gerado) : "—",
            tom: "up",
            nota: numeros.evitado ? `Agendamentos das listas × ticket. À parte: ${brl(numeros.evitado)} de gasto evitado em anúncios` : "agendamentos das listas × ticket",
          },
        ]}
      />

      <NxCard
        nivel={2}
        id="plano-atual"
        icone={<IconeTabler nome="checklist" tamanho={17} traco={1.7} />}
        titulo={`O que fazer nesta semana (${semanaRotulo})`}
        subtitulo="As ações que mais trazem resultado, em ordem de valor."
        acao={
          podeEditar ? (
            <button type="button" className="pl-botao" disabled={gerando} onClick={onAtualizar}>
              {gerando ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RefreshCw size={14} aria-hidden />} Conferir resultados agora
            </button>
          ) : undefined
        }
      >
        {aviso && (
          <PlanoAviso tom="dn" titulo="Não deu certo" papel="status">
            {aviso}
          </PlanoAviso>
        )}
        {!atual.length ? (
          <PlanoVazio titulo={gerando ? "Montando o plano…" : "Nenhuma ação nesta semana"}>
            {gerando ? "Analisando conversas, anúncios e conteúdo…" : "Nada urgente encontrado nos dados desta semana, ou as fontes ainda não estão ligadas. O plano é refeito toda segunda."}
          </PlanoVazio>
        ) : (
          <ol className="pl-lista">
            {atual.map((i, k) => {
              const selo = seloEstado(i);
              return (
                <PlanoLinha
                  key={i.id}
                  posicao={k + 1}
                  tom={i.estado === "feita" ? "up" : i.estado === "proposta" ? "or" : "g"}
                  apagada={i.estado === "descartada" || i.estado === "feita"}
                  titulo={i.titulo}
                  apoio={
                    <>
                      <b style={{ color: "var(--text)", fontWeight: 600 }}>O que fazer:</b> {i.acao}
                    </>
                  }
                  chips={
                    <>
                      <PlanoChip rotulo="Área" tom="b">{ROTULO_ORIGEM[i.origem]}</PlanoChip>
                      {i.valor_brl != null && <PlanoChip tom="up">{brl(i.valor_brl)} em jogo</PlanoChip>}
                      <PlanoChip rotulo="Estado" tom={TOM_COR[selo.cor] ?? "g"}>{selo.texto}</PlanoChip>
                    </>
                  }
                  acao={
                    <>
                      {i.onde && (
                        <Link to={`${base}${i.onde}` as never} className="pl-botao pl-botao--pri">
                          Abrir a lista
                        </Link>
                      )}
                      {podeEditar && i.estado !== "feita" && (
                        <button type="button" className="pl-botao" onClick={() => onDecidir(i.id, "feita")}>
                          Marcar como feita
                        </button>
                      )}
                      {podeEditar && i.estado === "proposta" && (
                        <button type="button" className="pl-botao pl-botao--leve" onClick={() => onDecidir(i.id, "descartada")}>
                          Não se aplica
                        </button>
                      )}
                    </>
                  }
                  rotuloDetalhe="Por que e como calculamos"
                  detalhe={
                    <>
                      <p>{i.porque}</p>
                      {i.valor_calculo && <p style={{ color: "var(--muted-ink)" }}>Como calculamos: {i.valor_calculo}</p>}
                      {i.resultado_texto && (
                        <p>
                          Até agora: {i.resultado_texto}
                          {i.resultado_brl ? (i.origem === "anuncio" ? ` (${brl(i.resultado_brl)} de gasto evitado)` : ` (≈ ${brl(i.resultado_brl)})`) : ""}
                        </p>
                      )}
                    </>
                  }
                />
              );
            })}
          </ol>
        )}
      </NxCard>

      {passada.length > 0 && (
        <NxCard
          nivel={2}
          icone={<IconeTabler nome="calendar" tamanho={17} traco={1.7} />}
          titulo={`Semana passada (${ultimaRotulo}): o que foi feito e o que mudou`}
          subtitulo="Conferido nos dados: resposta enviada, agendamento, gasto do anúncio, post publicado."
        >
          <ul className="pl-lista">
            {passada.map((i) => {
              const selo = seloEstado(i);
              return (
                <PlanoLinha
                  key={i.id}
                  tom={i.estado === "feita" ? "up" : "g"}
                  titulo={i.titulo}
                  apoio={i.resultado_texto ?? undefined}
                  chips={
                    <>
                      <PlanoChip rotulo="Estado" tom={i.estado === "feita" ? "up" : TOM_COR[selo.cor] ?? "g"} icone={i.estado === "feita" ? "shield-check" : undefined}>
                        {i.estado === "feita" ? "Feita" : selo.texto}
                      </PlanoChip>
                      {i.resultado_brl ? (
                        <PlanoChip tom="up">{i.origem === "anuncio" ? `${brl(i.resultado_brl)} de gasto evitado` : `≈ ${brl(i.resultado_brl)}`}</PlanoChip>
                      ) : i.estado !== "feita" && temParcial(i) ? (
                        <PlanoChip tom="or">{selo.texto}</PlanoChip>
                      ) : null}
                    </>
                  }
                />
              );
            })}
          </ul>
        </NxCard>
      )}

      <PlanoComo titulo="Como os números do plano são calculados">
        <p>
          <b>Em jogo:</b> soma do valor estimado das ações: pacientes × chance de agendar × ticket médio. Ações de conteúdo não entram em reais.
        </p>
        <p>
          <b>Ações feitas:</b> uma ação de pacientes conta como feita quando pelo menos 8 de cada 10 pacientes da lista receberam resposta. Na ação de preço, o valor precisa ter sido informado.
        </p>
        <p>
          <b>Receita estimada:</b> coincidência no tempo: o paciente pode ter agendado por outro motivo. É a melhor medida disponível, não prova de causa. O gasto evitado em anúncios não entra nesta soma.
        </p>
        <p>
          O plano aprende com a própria clínica: quando {MINIMO_ATENDIDOS} pacientes já tiverem recebido resposta em ações de pelo menos duas semanas, e cada ação tiver {MATURACAO_DIAS} dias de acompanhamento, a chance de agendar passa a usar o histórico desta clínica. Quem nunca foi contatado não entra na conta. Nada é enviado a paciente pelo Nexo; a equipe executa.
        </p>
      </PlanoComo>
    </div>
  );
}
