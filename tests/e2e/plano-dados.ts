import type { BrowserContext } from "@playwright/test";
import { CID } from "./fixtures";
import { semanaDe } from "../../src/lib/plano-semana";

// Dados fictícios para as telas de Plano de ação e Relatórios (relatório, prioridades, oportunidades, plano,
// reuniões). Chamar depois de mockAccount: as rotas aqui têm precedência sobre o falso Supabase genérico.

const DIA = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const REUNIAO_ID = "77777777-7777-4777-8777-777777777777";
export const RESULTADO_REUNIAO = {
  resumo: "A médica quer focar em menopausa até dezembro e melhorar o tempo de resposta da secretária.",
  combinados: ["Dois Reels por semana sobre menopausa", "Revisão do funil toda sexta"],
  acoes_clinica: ["Secretária responde em até 15 minutos"],
  acoes_equipe: ["Revisar campanha de estética", "Montar roteiro de Reels"],
  entregas: [
    { tipo: "conteudo", titulo: "Roteiro de Reels: sintomas da menopausa", detalhe: "Gancho fictício e três pontos.", porque: "Foco combinado na reunião" },
    { tipo: "anuncio", titulo: "Ajuste da campanha de estética", detalhe: "Cortar o conjunto com custo alto.", porque: "Custo por conversa subiu" },
  ],
  memorias: [{ memoria: "decisao", chave: "foco_trimestre", valor: "Foco em menopausa até dezembro", confianca: "alta" }],
  pendencias: ["Confirmar o ticket médio da consulta"],
};

export async function dadosDoPlano(context: BrowserContext, opcoes: { reuniaoProcessada?: boolean } = {}) {
  const pagina = (url: string, linhas: unknown[]) => {
    const p = new URL(url).searchParams;
    const off = Number(p.get("offset") ?? 0);
    return linhas.slice(off, off + Number(p.get("limit") ?? 1000));
  };
  const hoje = Date.now();
  await context.route("**/rest/v1/instagram_account_daily_metrics**", (r) => {
    const p = new URL(r.request().url()).searchParams;
    const datas = p.getAll("date");
    const de = datas.find((d) => d.startsWith("gte."))?.slice(4) ?? "0000";
    const ate = datas.find((d) => d.startsWith("lte."))?.slice(4) ?? "9999";
    const linhas = Array.from({ length: 60 }, (_, i) => ({
      date: iso(hoje - i * DIA),
      client_id: CID,
      reach: 900 + ((i * 137) % 600),
      new_followers: 8 + (i % 7),
      unfollowers: 3,
      total_interactions: 60 + ((i * 13) % 50),
      saves: 20 + (i % 9),
      profile_links_taps: 4,
      followers_count: 5000 - i * 9,
    }))
      .filter((d) => d.date >= de && d.date <= ate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return r.fulfill({ json: pagina(r.request().url(), linhas) });
  });
  await context.route("**/rest/v1/instagram_posts**", (r) => {
    const formatos = ["reels", "carrossel", "estatico"];
    const linhas = Array.from({ length: 30 }, (_, i) => ({
      id: `p${i}`,
      client_id: CID,
      windsor_media_id: `m${i}`,
      caption: `Post de teste ${i}`,
      format: formatos[i % 3],
      posted_at: new Date(hoje - ((i % 20) + 2) * DIA).toISOString(),
      reach: 800 + i * 40,
      engagement: 40 + ((i * 7) % 30),
      saved: 5 + (i % 6) + (i === 4 ? 60 : 0),
      shares: i === 4 ? 30 : 2,
      permalink: null,
      thumbnail_url: null,
    }));
    return r.fulfill({ json: pagina(r.request().url(), linhas) });
  });
  await context.route("http://localhost:9/rest/v1/meta_ads_daily**", (r) => {
    const linhas = Array.from({ length: 20 }, (_, i) => [
      { date: iso(hoje - (i + 1) * DIA), campaign_id: "c1", spend: 120, impressions: 6000, link_clicks: 90, conversations: 9, leads: 0, landing_page_views: 0, reach: 4000, clicks: 100 },
      { date: iso(hoje - (i + 1) * DIA), campaign_id: "c2", spend: 80, impressions: 5000, link_clicks: 20, conversations: 0, leads: 0, landing_page_views: 0, reach: 3500, clicks: 30 },
    ]).flat();
    return r.fulfill({ json: pagina(r.request().url(), linhas) });
  });
  await context.route("http://localhost:9/rest/v1/meta_ads_campaigns**", (r) =>
    r.fulfill({
      json: [
        { campaign_id: "c1", name: "Campanha fictícia Consulta", objective: "OUTCOME_ENGAGEMENT" },
        { campaign_id: "c2", name: "Campanha fictícia Estética", objective: "OUTCOME_ENGAGEMENT" },
      ],
    }),
  );
  await context.route("http://localhost:9/rest/v1/rpc/crm_leads_resumo_periodo**", (r) => r.fulfill({ json: [{ novos: 42, ganhos: 6, perdidos: 3, valor: 18000 }] }));
  await context.route("http://localhost:9/rest/v1/rpc/crm_leads_por_dia_periodo**", (r) =>
    r.fulfill({ json: Array.from({ length: 20 }, (_, i) => ({ dia: iso(hoje - (i + 1) * DIA), total: 1 + (i % 4) })) }),
  );
  await context.route("http://localhost:9/rest/v1/rpc/wts_resumo**", (r) =>
    r.fulfill({ json: [{ atendimentos: 60, agentes: 2, contatos: 50, mensagens: 400, abertos: 5, fechados: 55, tempo_medio_atendimento_min: 8, tempo_medio_espera_min: 3, espera_mediana_seg: 420, espera_cobertura: 0.9 }] }),
  );
  await context.route("http://localhost:9/rest/v1/rpc/wts_volume_diario**", (r) =>
    r.fulfill({ json: Array.from({ length: 20 }, (_, i) => ({ dia: iso(hoje - (i + 1) * DIA), atendimentos: 3 })) }),
  );
  await context.route("http://localhost:9/rest/v1/rpc/qualidade_dados**", (r) =>
    r.fulfill({
      json: [
        { id: "crm-origem", fonte: "crm", severidade: "alta", titulo: "Leads do CRM sem origem", evidencia: "18 de 42 leads sem origem no período.", causa: "Formulário sem campo de origem.", correcao: "Ligar o campo de origem no formulário.", responsavel: "equipe", afeta: "Funil por canal" },
      ],
    }),
  );
  const semana = semanaDe(new Date());
  const passada = iso(Date.parse(semana) - 7 * DIA);
  await context.route("http://localhost:9/rest/v1/plano_itens**", (r) =>
    r.fulfill({
      json: [
        { id: "a1", semana, ordem: 1, origem: "responder", titulo: "Responder 12 pacientes que ficaram sem resposta", porque: "Escreveram nos últimos 7 dias e ninguém respondeu.", acao: "Abrir a lista e responder cada um hoje.", onde: "/atendimento", n: 12, valor_brl: 5400, valor_calculo: "12 pacientes × 30% × R$ 1.500", estado: "proposta", verificado: false, resultado_brl: null, resultado_texto: null, medicao: { n: 12, respondidas: 4 } },
        { id: "a2", semana, ordem: 2, origem: "anuncio", titulo: "Pausar a campanha Estética", porque: "Gastou R$ 1.600 sem nenhuma conversa.", acao: "Pausar no Gerenciador de Anúncios.", onde: "/anuncios", n: 1, valor_brl: 1600, valor_calculo: "Gasto dos últimos 20 dias", estado: "proposta", verificado: false, resultado_brl: null, resultado_texto: null, medicao: {} },
        { id: "a3", semana, ordem: 3, origem: "conteudo", titulo: "Repetir o tema do post mais salvo", porque: "Teve 3 vezes mais salvamentos que o típico.", acao: "Gravar um Reels com o mesmo tema.", onde: null, n: 1, valor_brl: null, valor_calculo: null, estado: "feita", verificado: true, resultado_brl: null, resultado_texto: "Post publicado em 05/11", medicao: {} },
        { id: "b1", semana: passada, ordem: 1, origem: "recuperar", titulo: "Recuperar 8 orçamentos parados", porque: "Pediram preço e sumiram.", acao: "Mandar mensagem de retorno.", onde: "/crm-painel", n: 8, valor_brl: 1800, valor_calculo: null, estado: "feita", verificado: true, resultado_brl: 3000, resultado_texto: "2 agendaram depois do contato", medicao: {} },
        { id: "b2", semana: passada, ordem: 2, origem: "preco", titulo: "Informar o preço da consulta", porque: "5 pacientes pediram e não receberam.", acao: "Responder com o valor.", onde: null, n: 5, valor_brl: 1500, valor_calculo: null, estado: "nao_feita", verificado: false, resultado_brl: null, resultado_texto: null, medicao: {} },
      ],
    }),
  );
  const reuniao: Record<string, unknown> = {
    id: REUNIAO_ID,
    data: iso(hoje - 2 * DIA),
    titulo: "Reunião semanal",
    participantes: "Dra. Ana, secretária",
    notas: "- Quer focar em menopausa\n- Secretária demora para responder",
    transcricao: null,
    resultado: opcoes.reuniaoProcessada === false ? null : RESULTADO_REUNIAO,
    memorias_propostas: 1,
    processada_em: opcoes.reuniaoProcessada === false ? null : new Date(hoje - 2 * DIA).toISOString(),
    atualizado_em: new Date(hoje - 2 * DIA).toISOString(),
  };
  const antiga = { ...reuniao, id: "88888888-8888-4888-8888-888888888888", data: iso(hoje - 9 * DIA), titulo: "Reunião de alinhamento", resultado: null, processada_em: null };
  await context.route("http://localhost:9/rest/v1/reunioes**", (r) => r.fulfill({ json: [reuniao, antiga] }));
}
