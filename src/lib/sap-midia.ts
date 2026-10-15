// SAP · Regras de mídia (03.07, 05.10 e 08.05) aplicadas às campanhas da Meta. Lógica pura
// (teste: scripts/test-sap-midia.ts). A régua do SAP é a consulta realizada, não o clique nem o lead.
//
// 1. Verba: decide pelo custo por consulta realizada da conta (últimas 4 semanas) contra a meta do D45.
// 2. Fadiga (V3): CTR caiu e o custo por resultado subiu 30% ou mais da semana anterior para esta,
//    com verba parecida (±30%). Ação: 2 a 3 criativos novos; verba sobe só 20% a 30% a cada 3–4 dias.
//    Também (05.11): frequência acima de 3 na semana com CTR caindo. A frequência usa o alcance diário somado,
//    que conta a mesma pessoa mais de uma vez: o número sai menor que o real, então a regra só dispara com folga.
// 3. Pausa: campanha de conversa com custo por conversa acima de 2× o custo-meta por conversa nos
//    últimos 7 dias. Custo-meta por conversa = meta de custo por consulta × (consultas ÷ conversas)
//    da conta: quanto uma conversa pode custar para a consulta sair no custo combinado.
// 4. Escala: campanha de conversa abaixo do custo-meta e sem fadiga pode subir 20% a 30%.
// Com rastreio suspeito (src/lib/rastreio-anuncios.ts) as regras de custo ficam de fora: só a fadiga vale.
import type { CampanhaCadastro, LinhaAds } from "@/lib/anuncios-objetivo";

export type TipoRegra = "verba" | "fadiga" | "pausa" | "escala";

export interface AlertaMidia {
  tipo: TipoRegra;
  campaign_id?: string;
  campanha?: string;
  titulo: string;
  detalhe: string;
  acao: string;
  codigo?: "V3" | "V20";
}

interface Janela {
  gasto: number;
  impressoes: number;
  cliques: number;
  conversas: number;
  alcance: number;
}

const vazia = (): Janela => ({ gasto: 0, impressoes: 0, cliques: 0, conversas: 0, alcance: 0 });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function somarDias(iso: string, d: number) {
  const x = new Date(`${iso}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

export interface EntradaMidia {
  linhas: LinhaAds[]; // pelo menos os últimos 14 dias
  cadastro: CampanhaCadastro[];
  ate: string; // último dia fechado (ontem)
  conta4s: { investido: number; compareceram: number; conversasPlataforma: number } | null; // tracker automático, últimas 4 semanas
  metaCustoConsulta: number | null; // meta D45 (sap_kpi_plano.custo_consulta)
  rastreioSuspeito: boolean;
}

export interface LeituraMidia {
  alertas: AlertaMidia[];
  custoConsulta: number | null;
  custoMetaConversa: number | null;
}

export function regrasDeMidia(e: EntradaMidia): LeituraMidia {
  const ini7 = somarDias(e.ate, -6);
  const ini14 = somarDias(e.ate, -13);
  const nome = new Map(e.cadastro.map((c) => [c.campaign_id, c.name ?? c.campaign_id]));
  const atual = new Map<string, Janela>();
  const ant = new Map<string, Janela>();
  for (const l of e.linhas) {
    if (l.date > e.ate || l.date < ini14) continue;
    const alvo = l.date >= ini7 ? atual : ant;
    const j = alvo.get(l.campaign_id) ?? vazia();
    j.gasto += Number(l.spend) || 0;
    j.impressoes += Number(l.impressions) || 0;
    j.cliques += Number(l.link_clicks) || 0;
    j.conversas += Number(l.conversations) || 0;
    j.alcance += Number(l.reach) || 0;
    alvo.set(l.campaign_id, j);
  }

  const alertas: AlertaMidia[] = [];
  const c = e.conta4s;
  const custoConsulta = c && c.compareceram > 0 && c.investido > 0 ? c.investido / c.compareceram : null;
  const custoMetaConversa =
    e.metaCustoConsulta !== null && c && c.compareceram > 0 && c.conversasPlataforma > 0 ? e.metaCustoConsulta * (c.compareceram / c.conversasPlataforma) : null;

  // 1. Verba pelo custo por consulta realizada.
  if (!e.rastreioSuspeito) {
    if (e.metaCustoConsulta === null) {
      alertas.push({
        tipo: "verba",
        titulo: "Custo por consulta ainda sem meta",
        detalhe: custoConsulta !== null ? `Hoje: ${brl(custoConsulta)} por consulta realizada (últimas 4 semanas).` : "Sem consultas realizadas medidas nas últimas 4 semanas.",
        acao: "Definir a meta no D45, depois de 2 semanas de anúncio com rastreamento (Metas e garantia).",
      });
    } else if (custoConsulta !== null) {
      const acima = custoConsulta > e.metaCustoConsulta;
      alertas.push({
        tipo: "verba",
        titulo: acima ? "Consulta saindo acima da meta" : "Consulta dentro da meta",
        detalhe: `${brl(custoConsulta)} por consulta realizada contra meta de ${brl(e.metaCustoConsulta)} (últimas 4 semanas).`,
        acao: acima
          ? "Não subir verba. Mover verba para o canal ou campanha que entrega consulta mais barata, respeitando o mínimo de cada campanha."
          : "Pode subir verba de 20% a 30% a cada 3 a 4 dias nas campanhas abaixo do custo-meta.",
        codigo: acima ? "V20" : undefined,
      });
    }
  }

  for (const [id, a] of atual) {
    if (a.gasto <= 0) continue;
    const b = ant.get(id);
    const campanha = nome.get(id) ?? id;
    // 2. Fadiga (V3): mesma verba, CTR caindo e custo subindo 30%+.
    if (b && b.gasto > 0 && b.impressoes > 0 && a.impressoes > 0) {
      const mesmaVerba = Math.abs(a.gasto - b.gasto) / b.gasto <= 0.3;
      const ctrA = a.cliques / a.impressoes;
      const ctrB = b.cliques / b.impressoes;
      const resA = a.conversas > 0 ? a.conversas : a.cliques;
      const resB = b.conversas > 0 ? b.conversas : b.cliques;
      const custoA = resA > 0 ? a.gasto / resA : null;
      const custoB = resB > 0 ? b.gasto / resB : null;
      if (mesmaVerba && ctrB > 0 && ctrA < ctrB && custoA !== null && custoB !== null && custoA >= custoB * 1.3) {
        alertas.push({
          tipo: "fadiga",
          campaign_id: id,
          campanha,
          codigo: "V3",
          titulo: "Criativo cansando",
          detalhe: `CTR de ${(ctrB * 100).toFixed(2).replace(".", ",")}% para ${(ctrA * 100).toFixed(2).replace(".", ",")}% e custo por ${a.conversas > 0 ? "conversa" : "clique"} de ${brl(custoB)} para ${brl(custoA)}, com a mesma verba.`,
          acao: "Subir 2 a 3 criativos novos (banco sem rosto ou gravação) ou impulsionar o post orgânico que performou. Não aumentar verba agora.",
        });
      } else if (ctrB > 0 && ctrA < ctrB && a.alcance > 0 && a.impressoes / a.alcance > 3) {
        alertas.push({
          tipo: "fadiga",
          campaign_id: id,
          campanha,
          codigo: "V3",
          titulo: "Público vendo o mesmo anúncio demais",
          detalhe: `Frequência acima de ${(a.impressoes / a.alcance).toFixed(1).replace(".", ",")} na semana, com CTR caindo de ${(ctrB * 100).toFixed(2).replace(".", ",")}% para ${(ctrA * 100).toFixed(2).replace(".", ",")}%.`,
          acao: "Trocar ou somar criativos (3 ou mais por conjunto) e ampliar o público. Não aumentar verba agora.",
        });
      }
    }
    // 3 e 4. Pausa / escala pelo custo-meta por conversa (só campanhas de conversa e com rastreio confiável).
    if (!e.rastreioSuspeito && custoMetaConversa !== null) {
      const custoConv = a.conversas > 0 ? a.gasto / a.conversas : null;
      const ehConversa = a.conversas > 0 || (b?.conversas ?? 0) > 0;
      if (!ehConversa) continue;
      if (custoConv === null ? a.gasto >= 2 * custoMetaConversa : custoConv > 2 * custoMetaConversa) {
        alertas.push({
          tipo: "pausa",
          campaign_id: id,
          campanha,
          titulo: "Pausar ou trocar o anúncio",
          detalhe: custoConv === null ? `${brl(a.gasto)} em 7 dias sem nenhuma conversa (custo-meta por conversa: ${brl(custoMetaConversa)}).` : `${brl(custoConv)} por conversa em 7 dias, mais de 2x o custo-meta de ${brl(custoMetaConversa)}.`,
          acao: "Pausar o conjunto e passar a verba para a campanha que entrega conversa abaixo do custo-meta.",
        });
      } else if (custoConv !== null && custoConv <= custoMetaConversa && !alertas.some((x) => x.campaign_id === id && x.tipo === "fadiga")) {
        alertas.push({
          tipo: "escala",
          campaign_id: id,
          campanha,
          titulo: "Pode receber mais verba",
          detalhe: `${brl(custoConv)} por conversa em 7 dias, abaixo do custo-meta de ${brl(custoMetaConversa)}.`,
          acao: "Subir 20% a 30% e esperar 3 a 4 dias antes do próximo aumento.",
        });
      }
    }
  }
  const ordem: Record<TipoRegra, number> = { pausa: 0, fadiga: 1, verba: 2, escala: 3 };
  alertas.sort((x, y) => ordem[x.tipo] - ordem[y.tipo]);
  return { alertas, custoConsulta, custoMetaConversa };
}
