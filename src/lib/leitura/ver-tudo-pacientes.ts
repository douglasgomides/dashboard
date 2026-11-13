// As respostas dos blocos do "Ver tudo" de Onde os pacientes travam › Funil (quick-ver-tudo, 13/11/2026): UMA frase tirada dos dados do
// PRÓPRIO bloco, com o número em destaque; sem dado, "Falta dado". Só números desta clínica, sem jargão e sem promessa. Módulo puro.
import { fichasDeNumero } from "./leitura-em-descobertas";
import type { Descoberta } from "./cinco-segundos";
import { enfase, faltaDado, inteiro, primeiraQueCabe, type CabecaDoBloco } from "./cabeca-do-bloco";

/** Para chamar agora: quantas pessoas, e quantas já passaram do prazo de voltar. */
export function cabecaDeQuemChamar(e: { total: number; atrasados: number; carregando: boolean; semVendas: string | null }): CabecaDoBloco {
  if (e.carregando) return faltaDado("procurando quem já pode voltar");
  if (e.total === 0 && e.semVendas) return faltaDado(`sem as vendas, não dá para saber quem volta`);
  if (e.total === 0) return primeiraQueCabe([[enfase("Ninguém"), { texto: " para chamar agora." }]], "bom", "sem lista neste período");
  const pessoas = e.total === 1 ? " pessoa para chamar agora" : " pessoas para chamar agora";
  return primeiraQueCabe(
    [
      e.atrasados > 0 ? [enfase(inteiro(e.total)), { texto: `${pessoas}; ${inteiro(e.atrasados)} já ${e.atrasados === 1 ? "passou" : "passaram"} do prazo de voltar.` }] : null,
      [enfase(inteiro(e.total)), { texto: `${pessoas}.` }],
    ],
    e.atrasados > 0 ? "atencao" : "neutro",
    "sem lista neste período",
  );
}

/** Quem chamou: quantos eram pessoas novas, do total que chamou. */
export function cabecaDeQuemChamou(e: { novas: number; antigos: number }): CabecaDoBloco {
  const total = e.novas + e.antigos;
  if (total <= 0) return faltaDado("ninguém chamou no período");
  return primeiraQueCabe([[enfase(`${inteiro(e.novas)} de ${inteiro(total)}`), { texto: " que chamaram eram pessoas novas." }]], "neutro", "ninguém chamou no período");
}

/** Números que não aparecem aqui: quantos a clínica ainda não mede. */
export function cabecaDosNaoMedidos(n: number): CabecaDoBloco {
  if (n <= 0) return primeiraQueCabe([[enfase("Todos"), { texto: " os números do funil são medidos nesta clínica." }]], "bom", "sem lista");
  return primeiraQueCabe([[enfase(inteiro(n)), { texto: n === 1 ? " número do funil ainda não é medido nesta clínica." : " números do funil ainda não são medidos nesta clínica." }]], "atencao", "sem lista");
}

/**
 * Tira das descobertas do "Ver tudo" a que repete o veredito: o número principal da frase (o primeiro) já está na frase do veredito.
 * "Entre Agendou e Fechou, 30% passam." sai quando o veredito já diz "só 30% dos agendados fecham".
 */
export function semRepetirOVeredito(itens: readonly Descoberta[], fraseDoVeredito: string | null): Descoberta[] {
  if (!fraseDoVeredito) return [...itens];
  const doVeredito = new Set(fichasDeNumero(fraseDoVeredito));
  return itens.filter((d) => {
    const principal = fichasDeNumero(d.frase)[0];
    return !(principal && doVeredito.has(principal));
  });
}
