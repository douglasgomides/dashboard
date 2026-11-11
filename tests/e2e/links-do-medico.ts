import { CID } from "./fixtures";

// Trava do D-10 (Phase 3): os links que o médico (viewer) vê. A lista nasceu na Phase 3, lida no 03-02 com o ramo do médico
// ainda igual ao da base. Pares [texto acessível, href] na ordem do documento, com o UUID da clínica trocado por ${CID}:
// - barra: todos os links da aside "Menu principal" a 1440 px em /${CID};
// - barraInferior: os links da nav.bottomnav "Áreas" a 375 px;
// - folha: os links da folha "Navegar no Nexo" aberta pelo botão Menu da barra inferior (só links; botões ficam de fora).
// O teste "trava do médico" em menu-equipe.spec.ts lê esta lista. Mudar a lista é mudar o menu do médico por decisão do João.
// Mudou duas vezes por decisão dele:
// - 11/11/2026 (decisão aberta 3, "tira isso aí, ninguém usa", quick 261111-f5b): saíram 4 pares, Entregas e aprovações,
//   Entregas (para /plano), Plano da semana e Revisar roteiros da folha.
// - 03.1.1 (D-01 e D-06, João, 10/11/2026, "Aprovo a lista" e "6 agora, decido na fase 9"): o menu passa a ter 6 telas, O que
//   fazer hoje, Resultados da clínica, Onde os pacientes travam, De onde vêm os pacientes, Instagram e Relatório do período.
//   A Phase 9 decide o próximo passo (o MENU-06, só Hoje e Ajuda e fontes, está em aberto).
export const LINKS_DO_MEDICO: { barra: [string, string][]; barraInferior: [string, string][]; folha: [string, string][] } = {
  barra: [
    ["O que fazer hoje", `/${CID}/hoje?preset=30d`],
    ["Resultados da clínica", `/${CID}?preset=30d`],
    ["Onde os pacientes travam", `/${CID}/pacientes?preset=30d`],
    ["De onde vêm os pacientes", `/${CID}/vendas-kommo?preset=30d`],
    ["Instagram", `/${CID}/conteudo?preset=30d`],
    ["Relatório do período", `/${CID}/relatorio?preset=30d`],
    ["Conheça o Nexo", "/bem-vindo"],
  ],
  // No celular a barra de baixo tem os 4 primeiros itens mais o botão Menu (que não é link); Instagram e Relatório ficam na folha.
  barraInferior: [
    ["Hoje", `/${CID}/hoje?preset=30d`],
    ["Resultados", `/${CID}?preset=30d`],
    ["Onde travam", `/${CID}/pacientes?preset=30d`],
    ["De onde vêm", `/${CID}/vendas-kommo?preset=30d`],
  ],
  folha: [
    ["O que fazer hoje", `/${CID}/hoje?preset=30d`],
    ["Resultados da clínica", `/${CID}?preset=30d`],
    ["Onde os pacientes travam", `/${CID}/pacientes?preset=30d`],
    ["De onde vêm os pacientes", `/${CID}/vendas-kommo?preset=30d`],
    ["Instagram", `/${CID}/conteudo?preset=30d`],
    ["Relatório do período", `/${CID}/relatorio?preset=30d`],
  ],
};
