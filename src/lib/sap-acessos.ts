// SAP · Checklist de Dados e Acessos (02.05) e portão "pronto para a Sessão 1" (02.01). Lógica pura
// (teste: scripts/test-sap-acessos.ts). Nenhuma senha passa pelo painel: só o registro de quem confirmou e quando.

export type PrazoAcesso = "C" | "P" | "S";
export interface ItemAcesso { id: string; bloco: string; nome: string; prazo: PrazoAcesso; ate: number; quem: string; dica: string }

const A = (id: string, bloco: string, nome: string, prazo: PrazoAcesso, ate: number, quem: string, dica: string): ItemAcesso => ({ id, bloco, nome, prazo, ate, quem, dica });

export const ITENS_ACESSO: ItemAcesso[] = [
  A("A1", "Meta", "Business Manager (portfólio empresarial) da clínica", "C", 7, "Gestor de Tráfego", "Anotar o ID do portfólio."),
  A("A2", "Meta", "Doctor Creator como parceira", "C", 7, "Gestor de Tráfego", "Parceiros > Adicionar com o ID do BM da DC."),
  A("A3", "Meta", "Conta de anúncios atribuída ao parceiro", "C", 7, "Gestor de Tráfego", "Controle total da conta de anúncios."),
  A("A4", "Meta", "Página do Facebook e Instagram atribuídos", "C", 7, "Gestor de Tráfego", "Acesso total às duas."),
  A("A5", "Meta", "Pixel ou conjunto de dados", "C", 7, "Gestor de Tráfego", "Se não existir: não se aplica, criamos no rastreamento (05.03)."),
  A("A6", "Meta", "Classificação da fonte como saúde e bem-estar", "C", 7, "Gestor de Tráfego", "Anotar a categoria e os eventos restritos (vai para a ficha)."),
  A("A7", "Meta", "Verificação do negócio", "P", 14, "Gestor de Tráfego", "Feita pela clínica; leva até 14 dias úteis, começar no D1."),
  A("A8", "Meta", "Dois administradores da clínica no BM", "P", 14, "Gestor de Tráfego", "Com uma pessoa só, se ela perder o acesso a clínica perde tudo."),
  A("A9", "Meta", "Autenticação de dois fatores", "P", 14, "Gestor de Tráfego", "Ativar e exigir para todos do portfólio."),
  A("A10", "Meta", "Forma de pagamento ativa na conta de anúncios", "S", 28, "Gestor de Tráfego", "Antes do D28; verba paga pela clínica direto à Meta."),
  A("A11", "Meta", "Histórico de restrições", "C", 7, "Gestor de Tráfego", "Conferir em Qualidade da conta."),
  A("B1", "Google", "Google Ads", "P", 14, "Gestor de Tráfego", "Vínculo pela MCC; se não tem, não se aplica (nasce na Sessão 3)."),
  A("B2", "Google", "Perfil da Empresa no Google", "P", 14, "Gestor de Tráfego", "Administrador; nunca transferir a propriedade principal."),
  A("B3", "Google", "Google Analytics (GA4)", "P", 14, "Gestor de Tráfego", "Editor."),
  A("B4", "Google", "Google Tag Manager", "P", 14, "Gestor de Tráfego", "Publicar."),
  A("B5", "Google", "Search Console (se houver site)", "P", 14, "Gestor de Tráfego", "Completo."),
  A("C1", "Site", "Endereço do site e páginas de serviço", "P", 14, "Gestor de Tráfego", "Links no formulário ou no grupo."),
  A("C2", "Site", "Acesso de edição do site", "P", 14, "Gestor de Tráfego", "Ou o contato da agência."),
  A("C3", "Site", "Domínio/DNS (só para verificar domínio)", "S", 17, "Gestor de Tráfego", "Até a Sessão 3; não precisa dar acesso."),
  A("D1", "Agenda e atendimento", "Histórico da agenda dos últimos 90 dias", "C", 7, "Analista de Onboarding", "Planilha sem nome nem telefone de paciente."),
  A("D2", "Agenda e atendimento", "Usuário de leitura no sistema de agenda", "P", 14, "Analista de Onboarding", "Se não houver convite, credencial no cofre."),
  A("D3", "Agenda e atendimento", "Números de atendimento e fechamento dos últimos 3 meses", "C", 7, "Analista de Onboarding", "Pode ser na reunião de Baseline."),
  A("D4", "Agenda e atendimento", "Tipo de WhatsApp da clínica", "P", 14, "CS e Relacionamento", "Business no celular, API ou pessoal."),
  A("D5", "Agenda e atendimento", "Acesso à plataforma de atendimento", "S", 21, "CS e Relacionamento", "Até a Sessão 4."),
  A("D6", "Agenda e atendimento", "Prints de 15 a 20 primeiras conversas", "S", 18, "CS e Relacionamento", "Nome e número cobertos."),
  A("D7", "Agenda e atendimento", "Roteiro de atendimento atual (se existir)", "S", 18, "CS e Relacionamento", ""),
  A("D8", "Agenda e atendimento", "Tabela de preços dos serviços", "P", 14, "Analista de Onboarding", ""),
  A("D9", "Agenda e atendimento", "Base de pacientes ativos (quantidade)", "S", 40, "Analista de Onboarding", "Só o número, sem lista nominal."),
  A("D10", "Agenda e atendimento", "Contato do suporte do sistema de agenda", "S", 21, "CS e Relacionamento", "Para a integração (11.03)."),
];

export type StatusAcesso = "pendente" | "confirmado" | "nao_se_aplica";
export interface RegistroAcesso { item: string; status: StatusAcesso; confirmado_em: string | null; confirmado_por: string | null; observacao: string | null; revogado_em: string | null }

export interface ResumoAcessos {
  criticos: { feitos: number; total: number };
  complementares: { feitos: number; total: number };
  atrasados: ItemAcesso[];
  /** Acessos confirmados ainda não revogados (para o encerramento, E3). */
  aRevogar: number;
}

const resolvido = (r?: RegistroAcesso) => !!r && r.status !== "pendente";

export function resumoAcessos(regs: RegistroAcesso[], dia: number | null): ResumoAcessos {
  const m = new Map(regs.map((r) => [r.item, r]));
  const conta = (p: PrazoAcesso) => {
    const it = ITENS_ACESSO.filter((i) => i.prazo === p);
    return { feitos: it.filter((i) => resolvido(m.get(i.id))).length, total: it.length };
  };
  return {
    criticos: conta("C"),
    complementares: conta("P"),
    atrasados: dia === null ? [] : ITENS_ACESSO.filter((i) => dia > i.ate && !resolvido(m.get(i.id))),
    aRevogar: regs.filter((r) => r.status === "confirmado" && !r.revogado_em).length,
  };
}

/** Portão do 02.01: a Sessão 1 só acontece com kickoff, formulário, baseline e acessos críticos (itens 3, 4, 8 e 5 do 00.02). */
export function prontoParaSessao1(regs: RegistroAcesso[], marcosFeitos: Set<number>): { pronto: boolean; falta: string[] } {
  const r = resumoAcessos(regs, null);
  const falta = [
    !marcosFeitos.has(3) && "kickoff",
    !marcosFeitos.has(4) && "formulário pré-diagnóstico",
    !marcosFeitos.has(8) && "reunião de baseline",
    r.criticos.feitos < r.criticos.total && `acessos críticos (${r.criticos.feitos} de ${r.criticos.total})`,
  ].filter((x): x is string => !!x);
  return { pronto: falta.length === 0, falta };
}
