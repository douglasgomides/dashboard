// SAP · Dicionário central de códigos: documento do programa (Drive), leitura de vazamento (V1 a V20) ou item do
// checklist de acessos (A1 a D10) → nome legível, para que serve e link. Toda a interface troca o código pelo nome
// clicável (ver TextoComCodigos em src/components/sap-docs.tsx). Lógica pura (teste: scripts/test-sap-docs.ts).

import { SESSOES } from "@/lib/sap-sessoes";
import { MAPA_VAZAMENTOS } from "@/lib/sap-leitura";
import { ITENS_ACESSO } from "@/lib/sap-acessos";

export type TelaDoc = "/anuncios" | "/cronograma" | "/onboarding" | "/rastreamento" | "/metas" | "/leitura" | "/execucao" | "/midia" | "/documentos" | "/sessao" | "/painel";
export interface DocSap {
  codigo: string;
  nome: string;
  serve: string;
  url?: string; // documento no Drive
  tela?: TelaDoc; // tela do Hub que faz o papel do documento
  tipo: "documento" | "vazamento" | "acesso";
}

const doc = (id: string) => `https://docs.google.com/document/d/${id}/edit`;
const pl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
const D = (codigo: string, nome: string, serve: string, url?: string, tela?: TelaDoc): DocSap => ({ codigo, nome, serve, url, tela, tipo: "documento" });

/** Documentos do programa (pasta "Sistema de Aquisição v2" no Drive). Os modelos; a cópia de cada clínica fica na pasta dela. */
const BASE: DocSap[] = [
  D("00.01", "Leia-me e Índice Geral", "Mapa de todos os documentos do programa.", doc("1tkyWZEV1yevR1LYGmltl0-LCMJD3TtRVw61cryNEUyQ")),
  D("00.02", "Cronograma Mestre D0 a D90", "Os 35 itens do programa, com janela, dono e critério de pronto. No SAP, é a tela Cronograma.", pl("1eEsjnsQNo8OyqtNMZN3-5c-eANxFnNc5EfwqUAyEijc"), "/cronograma"),
  D("00.03", "Decisões do Produto e Regras do Jogo", "Regras fixas do programa e por que foram decididas assim.", doc("1RZjozuEMwBqcA7bdnkbdZE7CDTIdoJ2h5PfnomBcfB8")),
  D("00.05", "Mudanças da v1 para a v2", "O que mudou na versão atual do programa.", doc("1o92GXlOXJPSHM1vpGq0cv5jtM6bhuQgR7tvOWiR5-zA")),
  D("00.06", "Biblioteca de Referências e Fontes", "Fontes usadas no método.", doc("138-gLUhkcEkUyWBHQYi0YVAfxWNfpDqHQQHm_5vVplM")),
  D("00.07", "Pendências e Dados para Rodar o Piloto", "O que falta para o piloto rodar.", doc("101_I7hQIuwGt2_MgIbzpoIhf5ddtdQlDi0XqlkiIkZQ")),
  D("01.01", "Proposta Comercial com Custo Total", "Proposta enviada na venda.", doc("1KgrrCoaDlosNgZMbzgL02UQlxIiIfmSOEJ1bY5Dtdww")),
  D("01.02", "Política de Garantia, Reembolso e Exclusividade", "Regras da garantia, das pausas de prazo (§5) e do reembolso.", doc("1QHGBF6wwx4DX2HDOWxTJo3OeRy0ZuuUtxGFDQWK1-Gs")),
  D("01.03", "Roteiro de Alinhamento de Expectativas na Venda", "O que dizer (e não prometer) na venda.", doc("1c4dYD24-VrpyJIc7r8rsvVwj90Eu3nk1akFkdmMK9co")),
  D("01.04", "Cláusulas-Chave do Contrato", "Cláusulas que o contrato precisa ter.", doc("1pkm0xY9OuGL2lGGOaEiQidGZmc7aJgccVdB4KQFCF6Y")),
  D("01.05", "Diagnóstico Gratuito de Venda (Lead Oculto)", "Lead oculto usado na venda.", doc("1tzE9ROh3PFHc3TMWyRqDUhI79djCgCmk69JuA8Uw_zU")),
  D("02.01", "Fluxo do Onboarding D0 a D10", "Passo a passo do D0 até a Sessão 1, com o portão de entrada.", doc("1HDy9jb50MH1WX0C4cqRILNZqV1C6TLgEOXGDpZte2wY")),
  D("02.02", "Mensagens do Onboarding", "Mensagens prontas de boas-vindas e cobrança.", doc("1QT1T7M9gIIkf2iTmBCb5lefLLFkqlMK5Tm7eUyEqiYE")),
  D("02.03", "Roteiro do Kickoff", "Roteiro da conversa de kickoff com o decisor.", doc("11WESFmtdtkBO3XtilUEJYUa4OWrzygFIjHpM_HOGA0A"), "/sessao"),
  D("02.04", "Formulário Pré-Diagnóstico", "Perguntas que a clínica responde antes do diagnóstico.", doc("1tajqnBPk5pxMSzc-ACAJwCKIbZPcsYhb0QbFiFXDXKc")),
  D("02.05", "Checklist de Dados e Acessos", "Os acessos que a clínica libera (Meta, Google, site, agenda). No SAP, é a tela Ficha e acessos.", doc("1EJTA-mpZzwSmrRBChnDu0W6JfgvPRYebbrBF9TlC8rM"), "/onboarding"),
  D("02.06", "Ficha do Cliente", "Quem decide, ambição D90, coordenador, caminho de tecnologia. No SAP, é a tela Ficha e acessos.", pl("1CaDGL4v7xxoJc20B7yRBB7ysjYjwgcHoS_2gTFyTlAE"), "/onboarding"),
  D("02.07", "Estrutura Interna Drive e ClickUp", "Como criar a pasta e a lista da clínica.", doc("14W9UPXK_3nlV3i3Q5yxlLAGmIlmzpqakB6IijHu292A")),
  D("02.08", "Template de Tarefas ClickUp", "Tarefas-modelo para o ClickUp.", pl("1uzhatKLGcJ6BBFV4OqXTazbNvtjD7-qfFMYyiqP76Nw")),
  D("03.01", "Análise Pré-Reunião e Lead Oculto", "Análise com prints e tempos medidos antes da Sessão 1.", doc("1tWFezd0EwB1Jy2v9MUTPP1dkwXgQfegIYOYdQzp9PuA")),
  D("03.02", "Roteiro da Reunião de Coleta da Baseline", "Roteiro da reunião que coleta os números do D0.", doc("1LFJykF2uJJ9QY43NozzYqH9qkPUXGxsOnNzkdlFEHv4"), "/sessao"),
  D("03.03", "Raio-X da Aquisição e Baseline D0", "Os números de partida, cada um medido ou estimado. No SAP, é Metas e garantia.", pl("1iJ5Lv4FMNvXxV1g_TJLrFYZy-shGGKRKywVsnOXj5ys"), "/metas"),
  D("03.04", "Script da Sessão de Diagnóstico", "Roteiro da Sessão 1.", doc("1Zl7Xg2fvpaooYOtMQQgqst1xHJ8an69pvblVz8SoEho"), "/sessao"),
  D("03.05", "Prompt do Relatório de Diagnóstico", "Prompt de IA para montar o relatório.", doc("1-Lf3ycYzscpQ_h70ZcwSOVuVR7ijd7QKeR1_wFBnmI4")),
  D("03.08", "Transcrição Simulada para Teste", "Transcrição para treinar o modo sessão.", doc("12QOIDBYwrgV8a7F9EuVpFjFCv5nm_8gIu7KGDaro1Ww")),
  D("08.01", "Script da Sessão de Fidelização e Controle", "Roteiro da Sessão 6.", doc("1dSH-N4cfey7N9fwZ50T-FxFlRbwJAowDBjMUX-ag9t0"), "/sessao"),
  D("08.02", "Régua de Relacionamento e Reativação", "Mensagens de retorno e reativação de pacientes.", doc("1Xkun2hKUpsubZJLrviWm5RgNtqj76InBHQU3kByUqys")),
  D("08.03", "Processo de Indicação", "Como pedir e registrar indicações.", doc("1rw_C_6YvtT9spkq66n57i-zwSSh6ORWBPDHwWTInSEE")),
  D("08.04", "Tracker de Controle", "Planilha de números da clínica (Plano B quando o CRM falha). No SAP, os números vêm do CRM.", pl("1A9uc20D3nW2nL8O_79kOjUfQg57pOOYlsP7vvoCMrTI"), "/painel"),
  D("08.05", "Rotina de Leitura Semanal e Plano por Vazamento", "Como ler a semana e escolher a ação (V1 a V20). No SAP, é a Leitura da semana.", doc("1CHJdAxfj9Zg5IBpLX95HpqIuQfRhT3BBDY3s4c5ZjEw"), "/leitura"),
  D("08.06", "Playbook de Continuidade", "Entregável final: como a clínica continua sozinha.", doc("1dZ2MyzCPtetyovGtLB6Xt1QS77rsge3C7zO0DTamzfU"), "/documentos"),
  D("08.07", "Relatório de Encerramento D90", "Resultado contra a meta e avaliação da garantia.", doc("1wxxiZv2Ptf0xIeMNJNjUQbFREjtjFgyQuuUKRVQxL6A"), "/documentos"),
  D("08.08", "Prompt de Personalização da Fidelização e do Encerramento", "Prompt de IA para Sessão 6 e D90.", doc("19cZO5wn7GRiV9j2tEx8Lib1QDeqBubGJSNnZtjGT2To")),
  D("08.09", "Ferramentas do Tracker: Hub, n8n e ClickUp", "Que ferramenta usar para cada número.", doc("11TujHQ_uV-oUOQ6FcKVBkXuQ7ywf0VOu4qZQRfb5BKk")),
  D("08.10", "Script do Checkpoint D60", "Roteiro do checkpoint D60.", doc("1ADVgA6xce9IKOroXWMKgGCElSvF1mxwS5eb77Arc3zM"), "/sessao"),
  D("09.01", "Formato e Roteiro das Calls em Grupo", "Como conduzir a call semanal.", doc("1lSFdxd05xpdYDRg2J_i9tAZyygzeQ4HXq6ot1DxBFwk")),
  D("09.02", "Calendário Temático das Calls", "Tema de cada call.", pl("1yiU6bWPXo2oPgSsfFtlOzcFwSgko-GA5kV3DplhJ7Z0")),
  D("09.03", "Modelo de Registro da Call", "Presença, gravação e compromissos de cada call.", doc("13wfWblLpI8GyLn2FO0DhGbSC-a5i1UZhP1pKOZQOVCA")),
  D("09.04", "Prompt do Registro e Resumo da Call", "Prompt de IA para o resumo da call.", doc("1hZmiwv6z6kZiHXzkwTwHdKryt2iJ5V-Kp5sFryoLvXo")),
  D("10.01", "Regras da Comunidade e do Suporte", "Regras do grupo e do suporte.", doc("1123BeAM4HvRS-X4HUSGkggg1xhUsOCbdq8PUWzYw7IY")),
  D("11.01", "Capacidade, Equipe e Horas por Cliente", "Quantas clínicas cada pessoa atende.", doc("1YXsh7NiPdsopdS7a_m_Exv2IJtx_8kOkBjvyAB9E1k8")),
  D("11.02", "Operação Enxuta v2", "Papéis, rotina semanal e ferramentas da equipe. No SAP, é Como operamos.", doc("1FK-TymBxlVKJ4b77W95jTnnyB0076yYUaIKGbF2bINo")),
  D("11.03", "Integração Quaddro e Caminho B", "Como ligar a IA de atendimento (ou seguir sem ela).", doc("150AfCpj9HXWc1BYl5kl2ethGok3G-lyUWKb9l-xMvhc")),
  D("11.04", "Score de Saúde e Score de Execução", "Como pontuar a semana e os 20 compromissos. No SAP, é Execução e saúde.", pl("1bZq_wUSWKFmawLQtBQv7h9xpaB5uh9L-lLGFfmTYliQ"), "/execucao"),
  D("00.04", "Guia de Anúncio em Nicho Regulado (CFM, Conselhos, Meta e LGPD)", "O que pode e o que não pode no anúncio de clínica, com o semáforo verde, amarelo e vermelho.", doc("1mn9506brUaE9bt7dZDzltEhd9NXah0jqoYzJLR3o8kY")),
  D("00.08", "Checklist de Revisão Antes do Lançamento", "Checklist de revisão do sistema antes de vender (PDF na pasta 00).", "https://drive.google.com/drive/folders/1rQRd5DCPzeFftLJbcPFu1dwyGHX9-EJU"),
  D("00.09", "Revisão Humana Antes do Lançamento", "O que só uma pessoa faz: ligar ferramentas, levantar dados e decisões do Fundador.", "https://drive.google.com/file/d/10VWnwt52YvnIVLDe21XfYr0YiKyUHhOX/view"),
  D("00.10", "Guia Passo a Passo da Equipe", "Onde está cada coisa e como fazer cada tarefa, clique a clique.", "https://drive.google.com/file/d/1kD1z2cMNFJ7VQW50y2ojlW4cyLTiYuOg/view"),
  D("05.06", "Guia de Conteúdo de Atração por Categoria", "Que conteúdo orgânico atrai cada tipo de paciente.", doc("1vW0ayNFarofrDLO5iyQcn-GVwy2DAhwqSao6j7xpMWs")),
  D("05.09", "Sequência de Nutrição de Leads", "Mensagens que mantêm o lead quente até agendar.", doc("1Cc5U9VKTC3x5uMageP6Z3sAKsIOwQMkK4jGl5FYOfVU")),
  D("05.14", "Linha Editorial da Clínica (módulo opcional)", "Linha de conteúdo da clínica, quando o contrato inclui o módulo.", doc("1KFgrMttXQ77fy0OTSTDE6qsL0DqPqiHCImkFJa9Fujw")),
  D("10.02", "Rotina de Animação e SLA de Suporte", "Rotina da comunidade e prazo de resposta do suporte.", doc("1nf-e_vQJQeqXoKgAi7_xgj8Ks479Vrvpp5bwpSGYKzg")),
  D("11.05", "Painel de Acompanhamento de Todas as Clínicas", "Planilha com a situação de cada clínica ativa. No SAP, é o portfólio.", pl("1N7AZmVHJPeu8E5bjjy17DqtSb4LMvkfea2FIWnsOcL8")),
  D("12.00", "Como Reutilizar os Modelos Diagramados", "Como usar os PDFs prontos na identidade Doctor Creator (pasta 12).", doc("1MzvC-dOMq46NnBj1iSWmRndXeJYW_xTfcAhEvkdzm8E")),
  D("13.00", "Grade dos Treinamentos em Vídeo", "Lista dos roteiros dos treinamentos (cerca de 2h44).", doc("18XshhODTo7XQrZBl0OPBo7rjB91dp3hc7aEGvVsEM_Y")),
  D("13.A0", "Visão Geral do Sistema e da Promessa", "Roteiro de vídeo para a equipe.", doc("1fXPV-6ohb9LwIDInZsU81A2VJ2zxlH3fJ76C1mgAOLE")),
  D("13.A1", "Venda e Alinhamento de Expectativas", "Roteiro de vídeo para o Comercial.", doc("1xf-oE8Yg0KDAUkBXAXZ-2RxfKffSjbx3tpvCOLIEO70")),
  D("13.A2", "Onboarding e Kickoff", "Roteiro de vídeo do onboarding.", doc("1exzJ4PZWrAsKaXNlQPOWesqCXHecMj3BUzjFP3VuQJs")),
  D("13.A3", "Sessão 1 · Diagnóstico e Raio-X da Aquisição", "Roteiro de vídeo da Sessão 1.", doc("13JKss67KrFuDSnG9IDIUhTTlyoDb-K-K7cGPTtu3qRg")),
  D("13.A4", "Sessão 2 · Paciente Ideal e Proposta de Valor", "Roteiro de vídeo da Sessão 2.", doc("1lk9jt0SDev9ZU7mR3B-AGZlsgthBXZxzi-H_EnXYaE4")),
  D("13.A5", "Sessão 3 · Atração: Canais, Verba, Gravação Dirigida e Biblioteca de Anúncios", "Roteiro de vídeo da Sessão 3.", doc("1VPXqElMQf-e3VEHj0rSB02pxLI12yPbmCmw398FIxhM")),
  D("13.A6", "Rastreamento e Tracker de Controle", "Roteiro de vídeo do rastreamento e do Tracker.", doc("1UyWAzlQl_UneYlpvHAk5QCxSJNd2K9NvX62CxzEs5O4")),
  D("13.A7", "Sessão 4 · Conversa e Confirmação, IA e Testes", "Roteiro de vídeo da Sessão 4.", doc("1lknyIkzOCcTMlq6qYfVcPeCA9S98fY3uzy_1QJxhNDg")),
  D("13.A8", "Sessão 5 · Venda Consultiva e Follow-up", "Roteiro de vídeo da Sessão 5.", doc("11nBpQUIZQpSuIfTlIs52tuxKfJrYBrZPG6DWlaOyUEY")),
  D("13.A9", "Sessão 6 · Fidelização, Leitura Semanal e Encerramento D90", "Roteiro de vídeo da Sessão 6.", doc("1_ROIcilocRQeFC6S09nwHk4cmP27GJibZheuUxVtP1s")),
  D("13.A10", "Calls em Grupo e Comunidade", "Roteiro de vídeo das calls e da comunidade.", doc("1HWUA2bB3vTcRs8KwaNzPNUJ825IZrQ8Q4z_T-q4pQk0")),
  D("13.A11", "Gestão Interna: Capacidade, Score do Cliente e Painel", "Roteiro de vídeo da gestão interna.", doc("1LUdtsY4I1H0nB3P3rVNjaCX8u3OYfHVuJEtoyK3O52Y")),
  D("13.B1", "O Primeiro Contato que Vira Consulta", "Treinamento da recepção.", doc("1sHQ69IcNARedxrhO8Bk5192K7Aw1-nViJFNDa4Ea-cI")),
  D("13.B2", "Como Responder Preço, \"Vou Pensar\" e Outras Situações", "Treinamento da recepção.", doc("1C0X003KiUhM8eVr3F5jdKFvqFmRvBYpS7bX7W9SYiaY")),
  D("13.B3", "Confirmação, Remarcação e Faltosos", "Treinamento da recepção.", doc("1nEWKh7uaAr2vvD37opxGI2T7GRFdNYTttwZNTWhOU_4")),
  D("13.B4", "Como Trabalhar Junto com a Assistente Virtual", "Treinamento da recepção.", doc("1QpVNpZHc0rb7-Pm9ptTmm9CEE1tonV6DXsOVELotvSU")),
  D("13.B5", "Registro no Tracker: Por que Cada Campo Importa", "Treinamento da recepção.", doc("1D1W2e7f_ygrCsRIIWPtylmtcZ5ATYT70ujMrbKWy10s")),
  D("13.C1", "Gravação Dirigida no Celular sem Sofrer", "Treinamento do médico.", doc("16wnNJa6Ues-E78aYJA3s6XWAl3GcRWAkCeltay7OjNU")),
  D("13.C2", "A Consulta que Fecha sem Vender", "Treinamento do médico.", doc("1KvlYCeH6WF9DDfc-NE_2WK7YZK7XMtZEVXN8Izitaz0")),
  D("14.00", "Como Instalar e Usar as Skills do Sistema", "As 3 skills (.md) que rodam o sistema no Claude.", doc("1KaugY96AtLs8YvUsByz6ZwDzuGscNMkcsU5K5L1xLRU")),
];

const TELA_SESSAO = new Set(["04.01", "05.01", "06.01", "07.01"]);
/** Documentos que têm uma tela do Hub fazendo o papel deles. */
const TELA_DOC: Record<string, TelaDoc> = { "05.04": "/anuncios", "05.05": "/anuncios", "05.03": "/rastreamento" };

export const DOCS: DocSap[] = (() => {
  const m = new Map(BASE.map((d) => [d.codigo, d]));
  for (const s of SESSOES) for (const d of s.docs) {
    if (!m.has(d.codigo)) m.set(d.codigo, D(d.codigo, d.nome, `Usado em: ${s.titulo}.${TELA_DOC[d.codigo] === "/anuncios" ? " No SAP, é o Banco de anúncios." : ""}`, d.url, TELA_DOC[d.codigo] ?? (TELA_SESSAO.has(d.codigo) ? "/sessao" : undefined)));
  }
  for (const v of MAPA_VAZAMENTOS) m.set(v.codigo, { codigo: v.codigo, nome: v.titulo, serve: `Vazamento da Leitura da semana: ${v.sintoma}.`, tela: "/leitura", tipo: "vazamento" });
  for (const a of ITENS_ACESSO) m.set(a.id, { codigo: a.id, nome: a.nome, serve: `Item do Checklist de Dados e Acessos (${a.bloco}). ${a.dica}`.trim(), tela: "/onboarding", tipo: "acesso" });
  return [...m.values()].sort((a, b) => ordem(a) - ordem(b) || a.codigo.localeCompare(b.codigo, "pt", { numeric: true }));
})();
function ordem(d: DocSap) { return d.tipo === "documento" ? 0 : d.tipo === "vazamento" ? 1 : 2; }

export const DOC = new Map(DOCS.map((d) => [d.codigo, d]));

/** Divide um texto em pedaços: texto puro e códigos reconhecidos (00.00 com ou sem §, V1–V20, e itens de acesso entre
 *  parênteses, como "(A6)"; "D1" solto não é trocado, porque no texto quase sempre quer dizer "dia 1"). */
export type Pedaco = { texto: string } | { codigo: string; secao?: string; entreParenteses: boolean };
const RE = /\((?:([A-D]\d{1,2})|(\d{2}\.\d{2})(\s*§\s*\d+)?)\)|\b(\d{2}\.\d{2})(\s*§\s*\d+)?(?!\d)|\b(V\d{1,2})\b/g;

export function dividirCodigos(texto: string): Pedaco[] {
  const out: Pedaco[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(RE)) {
    const codigo = m[1] ?? m[2] ?? m[4] ?? m[6];
    if (!codigo || !DOC.has(codigo)) continue;
    const i = m.index!;
    if (i > ultimo) out.push({ texto: texto.slice(ultimo, i) });
    out.push({ codigo, secao: (m[3] ?? m[5])?.replace(/\s+/g, " ").trim(), entreParenteses: m[0].startsWith("(") });
    ultimo = i + m[0].length;
  }
  if (ultimo < texto.length) out.push({ texto: texto.slice(ultimo) });
  return out;
}

/** Códigos que aparecem num texto e não estão no dicionário (para a lista "falta nome ou link"). */
export function codigosSemCadastro(texto: string): string[] {
  const achados = new Set<string>();
  for (const m of texto.matchAll(/\b(\d{2}\.\d{2})(?!\d)/g)) if (!DOC.has(m[1])) achados.add(m[1]);
  return [...achados];
}
