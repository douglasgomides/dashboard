// SAP · "Esta semana": tudo o que vence nos próximos 7 dias (ou já venceu), por papel, numa lista só.
// Junta o Cronograma Mestre (00.02), o Checklist de Acessos (02.05), o portão de rastreamento (05.03), as ações
// combinadas (08.05/09.03) e a rotina semanal (Score de Saúde, auditoria de conversas, fidelização, execução).
// Não cria dado novo: só lê o que as outras telas já registram. Lógica pura (teste: scripts/test-sap-semana.ts).

import { dataDoDia, entre, somar, type ItemComData, type Pausa } from "@/lib/sap-cronograma";
import { ITENS_ACESSO, type RegistroAcesso } from "@/lib/sap-acessos";
import type { ResumoTestes } from "@/lib/sap-rastreamento";
import { sessaoDoItem } from "@/lib/sap-sessoes";

export type Papel = "trafego" | "cs" | "coordenacao" | "clinica";
export const ROTULO_PAPEL: Record<Papel, string> = {
  trafego: "Gestor de Tráfego",
  cs: "CS e Relacionamento",
  coordenacao: "Coordenação",
  clinica: "Clínica",
};

export type Situacao = "atrasado" | "hoje" | "semana";
export type Tela = "" | "/sessao" | "/cronograma" | "/onboarding" | "/rastreamento" | "/leitura" | "/execucao" | "/midia" | "/metas";

export interface TarefaSemana {
  id: string;
  titulo: string;
  detalhe?: string;
  papeis: Papel[];
  prazo: string;
  situacao: Situacao;
  tela: Tela;
  /** Parâmetro da tela (ex.: qual sessão abrir no modo sessão). */
  busca?: { s: string };
  origem: "Cronograma" | "Acessos" | "Rastreamento" | "Ação combinada" | "Rotina semanal";
}

/** Quem conduz (texto do 00.02 / 02.05) → papel. Analista de Onboarding, Fundador, Comercial e Editor ficam na coordenação. */
export function papelDoDono(dono: string | null | undefined): Papel {
  const d = (dono ?? "").toLowerCase();
  if (d.includes("tráfego") || d.includes("trafego")) return "trafego";
  if (d.includes("cs") || d.includes("relacionamento") || d.includes("atendimento") || d.includes("recepção")) return "cs";
  if (d.includes("clínica") || d.includes("clinica") || d.includes("médic") || d.includes("medic")) return "clinica";
  return "coordenacao";
}

export const segundaDe = (iso: string) => somar(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));

function situacao(prazo: string, hoje: string): Situacao {
  return prazo < hoje ? "atrasado" : prazo === hoje ? "hoje" : "semana";
}

export interface EntradaSemana {
  hoje: string;
  d0: string | null;
  pausas: Pausa[];
  dia: number | null;
  cronograma: ItemComData[];
  acessos: RegistroAcesso[] | null;
  rastreamento: (ResumoTestes & { recheckVencido: boolean }) | null;
  acoes: { id: string; texto: string; lado: "clinica" | "dc"; responsavel: string | null; prazo: string | null; semana: string; status: string }[];
  /** null = papel sem acesso ao dado (não gera tarefa). */
  saudeLancada: boolean | null;
  auditoriaLancada: boolean | null;
  fidelizacaoLancada: boolean | null;
  execucaoVencidosSemStatus: number | null;
}

export function tarefasDaSemana(e: EntradaSemana): TarefaSemana[] {
  const { hoje, dia } = e;
  const limite = somar(hoje, 7);
  const out: TarefaSemana[] = [];
  const add = (t: Omit<TarefaSemana, "situacao">) => {
    if (t.prazo > limite) return;
    out.push({ ...t, situacao: situacao(t.prazo, hoje) });
  };

  // Cronograma: itens não recorrentes, abertos, cuja janela já começou ou começa em até 7 dias.
  for (const it of e.cronograma) {
    if (it.tipo === "Recorrente" || it.status === "feito" || it.status === "futuro") continue;
    const papeis: Papel[] = [papelDoDono(it.dono)];
    if (it.clinica && !papeis.includes("clinica")) papeis.push("clinica");
    const sessao = sessaoDoItem(it.n);
    add({
      id: `crono-${it.n}`,
      titulo: it.nome,
      detalhe: `${it.dono} · pronto quando: ${it.pronto}`,
      papeis,
      prazo: it.status === "atrasado" ? it.dataFim : it.dataAlvo < hoje ? it.dataFim : it.dataAlvo,
      tela: sessao ? "/sessao" : "/cronograma",
      ...(sessao ? { busca: { s: sessao.id } } : {}),
      origem: "Cronograma",
    });
  }

  // Acessos (02.05): pendentes cujo prazo vence em até 7 dias.
  if (e.acessos && e.d0 && dia !== null) {
    const m = new Map(e.acessos.map((r) => [r.item, r]));
    const abertos = ITENS_ACESSO.filter((i) => (m.get(i.id)?.status ?? "pendente") === "pendente");
    const porPapel = new Map<Papel, { prazo: string; ids: string[] }>();
    for (const i of abertos) {
      const prazo = dataDoDia(e.d0, e.pausas, i.ate, hoje);
      if (prazo > limite) continue;
      const p = papelDoDono(i.quem);
      const g = porPapel.get(p) ?? { prazo, ids: [] };
      g.prazo = g.prazo < prazo ? g.prazo : prazo;
      g.ids.push(i.id);
      porPapel.set(p, g);
    }
    for (const [p, g] of porPapel) {
      add({ id: `acessos-${p}`, titulo: `Confirmar ${g.ids.length} acesso(s) do checklist`, detalhe: g.ids.join(", "), papeis: [p, "clinica"], prazo: g.prazo, tela: "/onboarding", origem: "Acessos" });
    }
  }

  // Rastreamento (05.03): setup a partir do D18, teste final até o D27; recheck da categoria a cada 15 dias até o D90.
  if (e.rastreamento && e.d0 && dia !== null) {
    const r = e.rastreamento;
    if (!r.liberado && dia >= 16) {
      const prazo = dataDoDia(e.d0, e.pausas, 27, hoje);
      if (r.aguardandoConferencia) {
        add({ id: "rastreio-conferir", titulo: "Conferir o checklist de rastreamento e liberar os anúncios", papeis: ["coordenacao"], prazo, tela: "/rastreamento", origem: "Rastreamento" });
      } else {
        add({ id: "rastreio-testes", titulo: "Aprovar os testes de rastreamento antes de subir anúncio", detalhe: `Faltam os testes ${r.faltam.join(", ")}.`, papeis: ["trafego"], prazo, tela: "/rastreamento", origem: "Rastreamento" });
      }
    }
    if (r.recheckVencido && dia >= 18 && dia <= 90) {
      add({ id: "rastreio-categoria", titulo: "Rever a categoria saúde e bem-estar da fonte de dados na Meta", detalhe: "Recheck a cada 15 dias até o D90.", papeis: ["trafego"], prazo: hoje, tela: "/rastreamento", origem: "Rastreamento" });
    }
  }

  // Ações combinadas abertas: com prazo até 7 dias, ou de semanas anteriores sem desfecho.
  const seg = segundaDe(hoje);
  for (const a of e.acoes) {
    if (a.status !== "aberta") continue;
    const prazo = a.prazo ?? (a.semana < seg ? somar(a.semana, 6) : somar(seg, 6));
    const papel: Papel = a.lado === "clinica" ? "clinica" : papelDoDono(a.responsavel);
    add({ id: `acao-${a.id}`, titulo: a.texto, detalhe: a.responsavel ? `Responsável: ${a.responsavel}` : undefined, papeis: [papel], prazo, tela: "/leitura", origem: "Ação combinada" });
  }

  // Rotina semanal, com prazo na sexta da semana.
  if (dia !== null && dia >= 7 && dia <= 90) {
    const sexta = somar(seg, 4);
    if (e.saudeLancada === false) {
      add({ id: "rotina-saude", titulo: "Lançar o Score de Saúde da semana", papeis: ["coordenacao"], prazo: sexta, tela: "/execucao", origem: "Rotina semanal" });
    }
    if (e.auditoriaLancada === false && dia >= 29) {
      add({ id: "rotina-auditoria", titulo: "Auditar 10 conversas da semana (06.09)", detalhe: "Nota da rubrica, confirmação até a véspera, F1 em 24 h e \"pensando\" em cadência.", papeis: ["cs"], prazo: sexta, tela: "/leitura", origem: "Rotina semanal" });
    }
    if (e.fidelizacaoLancada === false && dia >= 52) {
      add({ id: "rotina-fidelizacao", titulo: "Registrar retornos, reativação e indicações da semana", papeis: ["cs"], prazo: sexta, tela: "/leitura", origem: "Rotina semanal" });
    }
    if (dia >= 29) {
      add({ id: "rotina-leitura", titulo: "Fazer a leitura da semana, combinar uma ação de cada lado e enviar o resumo ao médico", detalhe: "O resumo com os 3 números fica pronto na Leitura da semana: revisar e enviar até 12h de segunda.", papeis: ["coordenacao"], prazo: sexta, tela: "/leitura", origem: "Rotina semanal" });
      add({ id: "rotina-leitura-clinica", titulo: "Ler os números da semana e combinar a ação da clínica com a equipe", papeis: ["clinica"], prazo: sexta, tela: "/leitura", origem: "Rotina semanal" });
    }
  }
  if (e.execucaoVencidosSemStatus) {
    add({ id: "rotina-execucao", titulo: `Dar status a ${e.execucaoVencidosSemStatus} item(ns) vencido(s) do Score de Execução`, papeis: ["coordenacao"], prazo: hoje, tela: "/execucao", origem: "Rotina semanal" });
  }

  const ordem: Record<Situacao, number> = { atrasado: 0, hoje: 1, semana: 2 };
  return out.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.prazo.localeCompare(b.prazo) || a.titulo.localeCompare(b.titulo));
}

export function contarPorSituacao(t: TarefaSemana[]): Record<Situacao, number> {
  return { atrasado: t.filter((x) => x.situacao === "atrasado").length, hoje: t.filter((x) => x.situacao === "hoje").length, semana: t.filter((x) => x.situacao === "semana").length };
}

/** Dias até o prazo, para o rótulo ("vence em 3 dias", "atrasado há 2 dias"). */
export function rotuloPrazo(prazo: string, hoje: string): string {
  const d = entre(hoje, prazo);
  if (d < 0) return `atrasado há ${-d} dia${d === -1 ? "" : "s"}`;
  if (d === 0) return "vence hoje";
  return `vence em ${d} dia${d === 1 ? "" : "s"}`;
}
