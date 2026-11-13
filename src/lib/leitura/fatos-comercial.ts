// Fatos do CRM (Phase 3.1.1, plano 03): Funil comercial (crm-painel), Jornada comercial (jornada) e Resultados por origem do
// CRM (vendas-kommo). Módulo puro, como fatos-pacientes.ts: recebe o que as telas já carregam (o funil que montarFunil
// devolve, o funil de 7 etapas da jornada e as linhas por origem) e devolve os fatos. Não consulta nada, não importa React
// nem banco e não usa IA. Só contagens entram: nome e telefone de contato nunca chegam à leitura (T-03.1.1-07).
// Honestidade (D-05, T-03.1.1-06): etapa com base menor que a mínima de LIMITES.funil vira "N de M", sem porcentagem e sem
// conclusão; CRM sem dado vira "Sem leitura:" e etapa fora de ordem vira fato para a equipe (D-01); a origem líder só é afirmada com a base de
// LIMITES.crm.leadsRanking.
import { fmtNdeM, minimoDaBase, type BaseFunil } from "@/lib/funil-taxa";
import { LIMITES } from "@/lib/limites";
import { NAO_INFORMADO, MAX_GANHOS_SEM_ORIGEM, MIN_LEADS_RANKING, soNaoInformado, type FunilRow } from "@/lib/vendas-origem";
import type { DadosComerciais, Funil as FunilDoCrm, IdPasso, PassoFunil } from "@/lib/comercial";
import type { Funil as FunilDaJornada, EtapaFunil as EtapaDaJornada, IdEtapa } from "@/lib/jornada-funil";
import type { Insight, Limitacao } from "@/lib/insight";
import { deInsight, deLimitacao, fatoDeEtapaQueCresce } from "./adaptadores";
import { nega, piorPortao, portaoDoPeriodo } from "./portao";
import type { Fato, FatosDaTela, PassoFato, Portao, TelaId } from "./tipos";

/** Muda quando uma regra de fato do CRM muda. */
export const VERSAO_REGRAS_COMERCIAL = 2;

const f = (n: number) => Math.round(n).toLocaleString("pt-BR");

interface PeriodoDaEntrada {
  de: string;
  ate: string;
  hoje: string;
}

/** Junta os insights e as limitações que a tela já calculou, sem repetir o fato de maior perda que as regras daqui já dão. */
function dosAdaptadores(insights: Insight[] | undefined, limitacoes: Limitacao[] | undefined, ignorar: (id: string) => boolean) {
  const fatos: Fato[] = [];
  const passos: PassoFato[] = [];
  for (const i of insights ?? []) {
    if (ignorar(i.id)) continue;
    const { fato, passo } = deInsight(i);
    fatos.push(fato);
    if (passo) passos.push(passo);
  }
  for (const l of limitacoes ?? []) {
    const { fato, passo } = deLimitacao(l);
    fatos.push({ ...fato, ressalva: true });
    if (passo) passos.push(passo);
  }
  return { fatos, passos };
}

// ===================================================================================================================
// Funil comercial (crm-painel)
// ===================================================================================================================

export interface EntradaFatosFunil extends PeriodoDaEntrada {
  /** O funil que montarFunil (comercial.ts) devolve; null = a leitura do CRM falhou ou ainda não existe. */
  funil: FunilDoCrm | null;
  /** O que a tela leu junto: só para saber se a conta do CRM é compartilhada. */
  dados?: Pick<DadosComerciais, "crmCompartilhado" | "escopo"> | null;
  insights?: Insight[];
  limitacoes?: Limitacao[];
}

/** A unidade de cada passo quando ele é a base da passagem seguinte (a mesma de comercial.ts). */
const BASE_DO_PASSO: Record<IdPasso, BaseFunil> = { entraram: "leads", atendidos: "leads", agendaram: "agendamentos", compraram: "consultas" };

/** Nome de cada passo dentro de uma frase (sem a palavra "lead", que a leitura não usa). */
const NOME_DO_PASSO: Record<IdPasso, string> = { entraram: "Entraram", atendidos: "Foram atendidos", agendaram: "Agendaram", compraram: "Compraram" };

/** O passo para a etapa de maior perda: sempre um grupo de pessoas, nunca um nome. Quem resolve é o comercial. */
function passoDaPerdaDoFunil(para: IdPasso): PassoFato {
  const base = { quem: "comercial" as const, fatoId: "maior-perda" };
  if (para === "atendidos") return { ...base, verbo: "responder", texto: "quem entrou e ainda não foi atendido" };
  if (para === "agendaram") return { ...base, verbo: "ligar para", texto: "quem foi atendido e ainda não agendou" };
  return { ...base, verbo: "ligar para", texto: "quem agendou e ainda não fechou" };
}

/** Passos medidos e confiáveis, na ordem do funil. Estimado ou sem confiança não entra em conta de ordem. */
const medidosEConfiaveis = (passos: PassoFunil[]) => passos.filter((p) => p.valor != null && p.confiavel && !p.estimado);

/**
 * Os pares seguidos de passos medidos e confiáveis em que o de depois é maior que o de antes (o CRM marca as etapas de um jeito
 * que não fecha a conta). Estimado ou sem confiança fica de fora, igual a foraDeOrdem. Sem mínimo, como a regra antiga do CRM.
 */
export function paresForaDeOrdem(passos: PassoFunil[]): { de: IdPasso; para: IdPasso }[] {
  const ok = medidosEConfiaveis(passos);
  const pares: { de: IdPasso; para: IdPasso }[] = [];
  for (let i = 1; i < ok.length; i++) if (ok[i].valor! > ok[i - 1].valor!) pares.push({ de: ok[i - 1].id, para: ok[i].id });
  return pares;
}

/** Uma etapa maior que a anterior medida: o funil está fora de ordem. Mesmo nome e mesmo sentido de antes (o funil desenhado usa). */
export function foraDeOrdem(passos: PassoFunil[]): boolean {
  return paresForaDeOrdem(passos).length > 0;
}

export function fatosDoFunil(e: EntradaFatosFunil): FatosDaTela {
  const fim = e.ate > e.hoje ? e.hoje : e.ate;
  const passos = e.funil?.passos ?? [];
  const entraram = passos.find((p) => p.id === "entraram")?.valor ?? null;
  const fatos: Fato[] = [];
  let proximoPasso: PassoFato | null = null;

  const adaptados = dosAdaptadores(e.insights, e.limitacoes, (id) => id.includes("maior-perda"));
  fatos.push(...adaptados.fatos);

  // Portão (D-03): CRM sem leads no período e amostra pequena. Etapa fora de ordem não nega (D-01): vira fato de equipe abaixo.
  const portao = portaoDoPeriodo({
    periodoAte: fim,
    hoje: e.hoje,
    semDado:
      !e.funil || entraram == null || entraram <= 0
        ? { motivo: "o CRM não devolveu contatos neste período", quem: "equipe_hub" }
        : null,
    n: entraram != null && entraram > 0 ? entraram : undefined,
  });

  if (e.funil && portao.ok) {
    // Cada etapa abaixo da base mínima mostra "N de M" e nunca porcentagem (nem vira conclusão).
    let temBasePequena = false;
    for (const p of passos) {
      if (!p.fracaoDoAnterior) continue;
      temBasePequena = true;
      fatos.push({
        id: `base-pequena-${p.id}`,
        tom: "atencao",
        peso: 1,
        ressalva: true,
        frase: `Poucos casos em "${NOME_DO_PASSO[p.id]}" para calcular a porcentagem.`,
        numeros: [{ chave: p.id, exibicao: fmtNdeM(p.fracaoDoAnterior) }],
        n: p.fracaoDoAnterior.m,
      });
    }
    if (temBasePequena) {
      fatos.push({
        id: "aviso-mudanca-do-funil",
        tom: "neutro",
        peso: 1,
        ressalva: true,
        frase: "Com poucos casos, a tela mostra \"N de M\" no lugar da porcentagem.",
        numeros: [{ chave: "base", exibicao: `${LIMITES.funil.minLeads} contatos` }],
      });
    }

    // A etapa de maior perda (D1): só com o número da etapa seguinte medido e a base mínima na etapa anterior.
    const mp = e.funil.maiorPerda;
    if (mp) {
      const de = passos.find((p) => p.id === mp.de);
      const para = passos.find((p) => p.id === mp.para);
      const baseOk = de?.valor != null && de.valor >= minimoDaBase(BASE_DO_PASSO[de.id]);
      if (de && para && baseOk && para.valor != null && para.pctDoAnterior != null) {
        fatos.push({
          id: "maior-perda",
          tom: mp.pct >= 0.7 ? "ruim" : "atencao",
          peso: 3,
          frase: `A maior perda está entre "${NOME_DO_PASSO[de.id]}" e "${NOME_DO_PASSO[para.id]}".`,
          numeros: [{ chave: "maior_perda", exibicao: `${f(para.valor)} de ${f(de.valor!)} seguiram`, valor: para.valor }],
          n: de.valor!,
        });
        proximoPasso = passoDaPerdaDoFunil(para.id);
      }
    }
  }

  // Etapa maior que a anterior (D-01): fato para a equipe conferir a marcação no CRM, com os dois números medidos. O passo é só
  // da equipe e vai para os outros passos; a maior perda continua vindo de funil.maiorPerda (montarFunil pula o par que cresce).
  const passosDaEquipe: PassoFato[] = [];
  if (e.funil) {
    const porId = new Map(passos.map((p) => [p.id, p]));
    for (const par of paresForaDeOrdem(passos)) {
      const de = porId.get(par.de)!, para = porId.get(par.para)!;
      const { fato, passo } = fatoDeEtapaQueCresce({
        de: { chave: de.id, rotulo: NOME_DO_PASSO[de.id], valor: de.valor! },
        para: { chave: para.id, rotulo: NOME_DO_PASSO[para.id], valor: para.valor! },
      });
      fatos.push(fato);
      passosDaEquipe.push(passo);
    }
  }

  // Conta de CRM compartilhada com outro cliente: a leitura diz que os números não são só deste médico.
  if (e.dados?.crmCompartilhado) {
    fatos.push({
      id: "crm-compartilhado",
      tom: "atencao",
      peso: 2,
      ressalva: true,
      frase: "Conta de CRM compartilhada com outra clínica.",
      numeros: [{ chave: "clientes", exibicao: `${f(e.dados.crmCompartilhado.clientes)} outro(s)` }],
    });
  }

  return {
    tela: "crm-painel" satisfies TelaId,
    versaoRegras: VERSAO_REGRAS_COMERCIAL,
    tipoPeriodo: "periodo",
    periodo: { de: e.de, ate: fim, anterior: null },
    portao,
    fatos,
    proximoPasso,
    outrosPassos: [...adaptados.passos, ...passosDaEquipe],
  };
}

// ===================================================================================================================
// Jornada comercial (jornada)
// ===================================================================================================================

export interface EntradaFatosJornada extends PeriodoDaEntrada {
  /** O funil de 7 etapas que a tela já monta (jornada-funil.ts); null = a leitura falhou ou ainda não existe. */
  funil: FunilDaJornada | null;
  /** Do resumo da jornada: só contagens de contatos do período. */
  resumo?: { leads_total: number; leads_sem_pessoa: number } | null;
  limitacoes?: Limitacao[];
}

/** Etapas do comercial: onde a taxa tem leitura de negócio (a mesma regra de maiorQueda em jornada-funil.ts). */
const ETAPAS_DO_COMERCIAL: IdEtapa[] = ["lead", "agendamento", "venda"];
/** Nome de cada etapa dentro de uma frase (sem a palavra "lead"). */
const NOME_DA_ETAPA: Record<IdEtapa, string> = {
  alcance: "alcance",
  engajamento: "engajamento",
  comentario: "comentário",
  conversa: "conversa no WhatsApp",
  lead: "cadastro no CRM",
  agendamento: "consulta agendada",
  venda: "venda",
};

function passoDaPerdaDaJornada(para: IdEtapa): PassoFato {
  const base = { quem: "comercial" as const, fatoId: "maior-perda" };
  if (para === "lead") return { ...base, verbo: "responder", texto: "as conversas sem cadastro no CRM" };
  if (para === "agendamento") return { ...base, verbo: "ligar para", texto: "quem já está no CRM e ainda não agendou" };
  return { ...base, verbo: "ligar para", texto: "quem agendou e ainda não fechou" };
}

const semDadoDaJornada = (etapas: EtapaDaJornada[]) => !etapas.some((x) => ETAPAS_DO_COMERCIAL.includes(x.id) && x.valor != null);

export function fatosDaJornada(e: EntradaFatosJornada): FatosDaTela {
  const fim = e.ate > e.hoje ? e.hoje : e.ate;
  const etapas = e.funil?.etapas ?? [];
  const fatos: Fato[] = [];
  let proximoPasso: PassoFato | null = null;

  const adaptados = dosAdaptadores(undefined, e.limitacoes, () => false);
  fatos.push(...adaptados.fatos);

  const portao = portaoDoPeriodo({
    periodoAte: fim,
    hoje: e.hoje,
    semDado: !e.funil || semDadoDaJornada(etapas) ? { motivo: "o CRM não devolveu dado da jornada neste período", quem: "equipe_hub" } : null,
  });

  if (e.funil && portao.ok) {
    // Etapa abaixo da base mínima: "N de M", sem porcentagem e sem conclusão.
    for (const x of etapas) {
      if (!x.fracao || !ETAPAS_DO_COMERCIAL.includes(x.id)) continue;
      fatos.push({
        id: `base-pequena-${x.id}`,
        tom: "atencao",
        peso: 1,
        ressalva: true,
        frase: `Poucos casos em "${NOME_DA_ETAPA[x.id]}" para calcular a porcentagem.`,
        numeros: [{ chave: x.id, exibicao: fmtNdeM(x.fracao) }],
        n: x.fracao.m,
      });
    }

    // A passagem com mais perda (só entre etapas do comercial, com taxa medida e a base mínima).
    const q = e.funil.maiorQueda;
    if (q && ETAPAS_DO_COMERCIAL.includes(q.para)) {
      const de = etapas.find((x) => x.id === q.de);
      const para = etapas.find((x) => x.id === q.para);
      if (de?.valor != null && para?.valor != null && para.taxa != null && para.taxa < 1) {
        fatos.push({
          id: "maior-perda",
          tom: para.taxa <= 0.3 ? "ruim" : "atencao",
          peso: 3,
          frase: `A jornada perde mais gente entre "${NOME_DA_ETAPA[de.id]}" e "${NOME_DA_ETAPA[para.id]}".`,
          numeros: [{ chave: "maior_perda", exibicao: `${f(para.valor)} de ${f(de.valor)} seguiram`, valor: para.valor }],
          n: de.valor,
        });
        proximoPasso = passoDaPerdaDaJornada(para.id);
      }
    }
  }

  // Contatos do período que não ligam a nenhuma pessoa: a jornada deles fica no escuro (só com a base mínima de contatos).
  const r = e.resumo;
  if (portao.ok && r && r.leads_total >= LIMITES.funil.minLeads && r.leads_sem_pessoa / r.leads_total >= 0.5) {
    const id = "sem-pessoa";
    fatos.push({
      id,
      tom: "atencao",
      peso: 2,
      frase: "A maioria dos contatos do período não está ligada a uma pessoa.",
      // Uma barra listrada: o que falta ligar a uma pessoa (a regra calcula a fração).
      comparacao: {
        frase: "A maioria dos contatos do período não está ligada a uma pessoa.",
        barras: [{ rotulo: "Contatos sem pessoa", exibicao: `${f(r.leads_sem_pessoa)} de ${f(r.leads_total)}`, fracao: Math.min(1, r.leads_sem_pessoa / r.leads_total), faltou: true }],
      },
      numeros: [{ chave: id, exibicao: `${f(r.leads_sem_pessoa)} de ${f(r.leads_total)}`, valor: r.leads_sem_pessoa }],
      n: r.leads_total,
    });
    adaptados.passos.unshift({ verbo: "corrigir", texto: "o telefone e o @ do contato no CRM", quem: "comercial", motivo: "Sem telefone, @ ou conversa guardada o painel não consegue ligar a pessoa.", fatoId: id });
  }

  return {
    tela: "jornada" satisfies TelaId,
    versaoRegras: VERSAO_REGRAS_COMERCIAL,
    tipoPeriodo: "periodo",
    periodo: { de: e.de, ate: fim, anterior: null },
    portao,
    fatos,
    proximoPasso,
    outrosPassos: adaptados.passos,
  };
}

// ===================================================================================================================
// Resultados por origem do CRM (vendas-kommo)
// ===================================================================================================================

export interface EntradaFatosPorOrigem {
  /** Hoje, no fuso de Brasília: a tela lê a base inteira do CRM (não usa o período do topo). */
  hoje: string;
  /** As linhas por fonte do lead que a tela já carrega. Só contagens. */
  linhas: FunilRow[];
}

export function fatosPorOrigem(e: EntradaFatosPorOrigem): FatosDaTela {
  const linhas = e.linhas;
  const total = linhas.reduce((s, r) => s + r.total, 0);
  const ganhos = linhas.reduce((s, r) => s + r.ganhos, 0);
  const fatos: Fato[] = [];
  const outros: PassoFato[] = [];
  let proximoPasso: PassoFato | null = null;

  const comOrigem = linhas.filter((r) => r.chave !== NAO_INFORMADO);
  const ganhosSemOrigem = linhas.filter((r) => r.chave === NAO_INFORMADO).reduce((s, r) => s + r.ganhos, 0);
  const fracaoSemOrigem = ganhos > 0 ? ganhosSemOrigem / ganhos : 0;

  // Portões: sem dado, origem nunca preenchida e mais da metade das vendas sem origem. Todos pedem o comercial.
  const portoes: Portao[] = [];
  if (total <= 0) {
    portoes.push(nega("sem_dado", "o CRM não devolveu contatos por origem", { verbo: "conferir", texto: "a conexão do CRM", quem: "equipe_hub" }));
  } else if (soNaoInformado(linhas)) {
    portoes.push(
      nega("sem_dado", "o campo de origem não está preenchido no CRM", { verbo: "corrigir", texto: "o preenchimento da origem do contato no CRM", quem: "comercial" }),
    );
  } else if (ganhos > 0 && fracaoSemOrigem > MAX_GANHOS_SEM_ORIGEM) {
    portoes.push(
      nega("erro_de_dado", "mais da metade dos ganhos está sem origem registrada, então não dá para comparar as origens", {
        verbo: "corrigir",
        texto: "o preenchimento da origem do contato no CRM",
        quem: "comercial",
      }),
    );
  }
  const portao = piorPortao(portoes);

  if (portao.ok) {
    // A origem líder só é afirmada com a base de leadsRanking e pelo menos um ganho registrado (D3).
    const candidatas = comOrigem.filter((r) => r.total >= MIN_LEADS_RANKING && r.ganhos > 0);
    const lider = [...candidatas].sort((a, b) => b.ganhos - a.ganhos || b.ganhos / b.total - a.ganhos / a.total)[0];
    if (lider) {
      fatos.push({
        id: "origem-lider",
        tom: "bom",
        peso: 3,
        frase: `A origem com mais ganhos registrados é "${lider.chave}".`,
        numeros: [{ chave: "origem_lider", exibicao: `${f(lider.ganhos)} de ${f(lider.total)} contatos`, valor: lider.ganhos }],
        n: lider.total,
      });
      // O status ganho pode significar agendamento: o passo é conferir o significado, nunca tratar como venda.
      proximoPasso = { verbo: "conferir", texto: `se o status ganho de "${lider.chave}" é venda de verdade`, quem: "comercial", motivo: "O status ganho pode marcar só o agendamento.", fatoId: "origem-lider" };
    } else {
      // Nenhuma origem com a base mínima: diz que ainda não dá para apontar uma (nunca nomeia uma origem pequena).
      const maior = [...comOrigem].sort((a, b) => b.total - a.total)[0];
      fatos.push({
        id: "sem-origem-lider",
        tom: "atencao",
        peso: 2,
        ressalva: true,
        frase: `Nenhuma origem tem ${MIN_LEADS_RANKING} ou mais contatos com ganho registrado, então ainda não dá para apontar a que mais fecha.`,
        numeros: [{ chave: "base", exibicao: `${f(maior?.total ?? 0)} de ${MIN_LEADS_RANKING}` }],
      });
      outros.push({ verbo: "conferir", texto: "se o ganho está sendo registrado no CRM", quem: "comercial", fatoId: "sem-origem-lider" });
    }
    if (ganhos > 0 && ganhosSemOrigem > 0) {
      fatos.push({
        id: "ganhos-sem-origem",
        tom: "atencao",
        peso: 1,
        ressalva: true,
        frase: "Parte dos ganhos não tem origem registrada.",
        numeros: [{ chave: "sem_origem", exibicao: `${f(ganhosSemOrigem)} de ${f(ganhos)}`, valor: ganhosSemOrigem }],
      });
      outros.push({ verbo: "corrigir", texto: "a origem dos ganhos sem origem no CRM", quem: "comercial", fatoId: "ganhos-sem-origem" });
    }
  }

  return {
    tela: "vendas-kommo" satisfies TelaId,
    versaoRegras: VERSAO_REGRAS_COMERCIAL,
    // A tela lê a base inteira sincronizada: é a situação de hoje, não um período do topo.
    tipoPeriodo: "hoje",
    periodo: { de: e.hoje, ate: e.hoje, anterior: null },
    portao,
    fatos,
    proximoPasso,
    outrosPassos: outros,
  };
}
