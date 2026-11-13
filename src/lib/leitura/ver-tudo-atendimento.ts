// As respostas dos blocos do "Ver tudo" de Atendimento › Qualidade (quick-ver-tudo, 13/11/2026): UMA frase tirada dos dados do PRÓPRIO
// bloco, com o número em destaque; sem dado, "Falta dado". Só números desta clínica, sem jargão (nada de "mediana") e sem promessa.
// Módulo puro.
import { enfase, faltaDado, inteiro, maiorItem, primeiraQueCabe, type CabecaDoBloco } from "./cabeca-do-bloco";

/** Tempo legível: "40s", "15min", "1h20" (a mesma régua da tela). */
export function duracao(seg: number): string {
  const s = Math.max(0, Math.trunc(seg));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

/** Acima disto a conversa sem equipe é o primeiro ajuste (a mesma régua do "Em resumo" de antes). */
const ROTEAMENTO_DE_ATENCAO = 40;
/** Acima disto (1 hora) a espera até a 1ª resposta pede atenção (a mesma régua do "Em resumo" de antes). */
const ESPERA_DE_ATENCAO = 3600;

/**
 * Os números do atendimento (espera, sem roteamento, abertas): quando mais de 40% das conversas não foram para nenhuma equipe, isso; senão a
 * espera até a 1ª resposta na metade dos atendimentos; sem espera medida, "Falta dado".
 */
export function cabecaDosNumerosDoAtendimento(e: { esperaSeg: number | null; fatiaSemRoteamento: number; semRoteamento: number }): CabecaDoBloco {
  if (e.fatiaSemRoteamento > ROTEAMENTO_DE_ATENCAO) {
    return primeiraQueCabe([[enfase(`${Math.round(e.fatiaSemRoteamento)}%`), { texto: " das conversas não foram para nenhuma equipe: organizar isso primeiro." }]], "atencao", "sem dado de espera neste período");
  }
  if (e.esperaSeg == null) return faltaDado("sem dado de espera até a 1ª resposta neste período");
  return primeiraQueCabe(
    [[{ texto: "Na metade dos atendimentos, a 1ª resposta veio em até " }, enfase(duracao(e.esperaSeg)), { texto: "." }]],
    e.esperaSeg > ESPERA_DE_ATENCAO ? "atencao" : "bom",
    "sem dado de espera neste período",
  );
}

/** Volume por dia e espera: de quanto a quanto a espera variou nos dias medidos. Dia sem medida não entra (nunca zero). */
export function cabecaDaEsperaPorDia(diasEmMinutos: readonly (number | null)[]): CabecaDoBloco {
  const medidos = diasEmMinutos.filter((m): m is number => m != null && Number.isFinite(m));
  if (medidos.length < 3) return faltaDado("poucos dias com o dado de espera");
  const min = Math.min(...medidos);
  const max = Math.max(...medidos);
  if (Math.round(min) === Math.round(max)) {
    return primeiraQueCabe([[{ texto: "A espera até a 1ª resposta ficou em " }, enfase(duracao(min * 60)), { texto: " todo dia." }]], "neutro", "poucos dias com o dado de espera");
  }
  return primeiraQueCabe(
    [[{ texto: "A espera até a 1ª resposta foi de " }, enfase(`${duracao(min * 60)} a ${duracao(max * 60)}`), { texto: " por dia." }]],
    max * 60 > ESPERA_DE_ATENCAO ? "atencao" : "neutro",
    "poucos dias com o dado de espera",
  );
}

/** Por equipe: a equipe que mais atendeu, com a fatia e a espera dela. */
export function cabecaPorEquipe(equipes: readonly { nome: string; atendimentos: number; fatia: number | null; esperaSeg: number | null }[]): CabecaDoBloco {
  const maior = maiorItem(equipes.map((x) => ({ nome: x.nome, valor: x.atendimentos })), 1);
  if (!maior) return faltaDado("sem equipes neste período");
  const eq = equipes.find((x) => x.nome === maior.nome)!;
  const fatia = eq.fatia != null ? `${Math.round(eq.fatia)}%` : `${inteiro(eq.atendimentos)}`;
  const das = eq.fatia != null ? " das conversas" : " conversas";
  const espera = eq.esperaSeg != null ? `, com espera de ${duracao(eq.esperaSeg)}` : "";
  return primeiraQueCabe(
    [
      [{ texto: `${eq.nome} atendeu ` }, enfase(fatia), { texto: `${das}${espera}.` }],
      [{ texto: "A equipe que mais atendeu ficou com " }, enfase(fatia), { texto: `${das}.` }],
    ],
    "neutro",
    "sem equipes neste período",
  );
}

/** Tempo até fechar: o intervalo entre abrir e encerrar (com o aviso de que não é o tempo de atendimento). */
export function cabecaDoTempoAteFechar(seg: number | null): CabecaDoBloco {
  if (seg == null) return faltaDado("sem dado de encerramento neste período");
  return primeiraQueCabe([[enfase(duracao(seg)), { texto: " entre abrir e encerrar a conversa: não é o tempo de atendimento." }]], "neutro", "sem dado de encerramento neste período");
}

/** Por atendente: quem mais atendeu, com a espera dela. */
export function cabecaPorAtendente(atendentes: readonly { nome: string; atendimentos: number; esperaSeg: number | null }[]): CabecaDoBloco {
  const maior = maiorItem(atendentes.map((x) => ({ nome: x.nome, valor: x.atendimentos })), 1);
  if (!maior) return faltaDado("sem atendentes neste período");
  const at = atendentes.find((x) => x.nome === maior.nome)!;
  const espera = at.esperaSeg != null ? `, com espera de ${duracao(at.esperaSeg)}` : "";
  return primeiraQueCabe(
    [
      [{ texto: `${at.nome} fez ` }, enfase(inteiro(at.atendimentos)), { texto: ` atendimentos${espera}.` }],
      [{ texto: "Quem mais atendeu fez " }, enfase(inteiro(at.atendimentos)), { texto: " atendimentos." }],
    ],
    "neutro",
    "sem atendentes neste período",
  );
}

/** Custo do WhatsApp (estimativa): quanto custou no período e quantas mensagens foram pagas. */
export function cabecaDoCustoDoWhatsapp(e: { custo: number; pagas: number }): CabecaDoBloco {
  const reais = e.custo.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).replace(/ /g, " ");
  return primeiraQueCabe(
    [[{ texto: "O WhatsApp custou cerca de " }, enfase(reais), { texto: ` no período: ${inteiro(e.pagas)} ${e.pagas === 1 ? "mensagem paga" : "mensagens pagas"}.` }]],
    "neutro",
    "sem mensagens da clínica neste período",
  );
}
