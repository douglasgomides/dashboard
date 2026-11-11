import { CID } from "./fixtures";

// Trava do D-10 (Phase 3): os links que o médico (viewer) vê hoje, lidos uma vez no 03-02 com o ramo do médico ainda igual
// ao da base (o git diff da Task 2 do 03-02 só envolve o ramo do médico num fragmento, sem mudar nada dentro dele).
// Pares [texto acessível, href] na ordem do documento, com o UUID da clínica trocado por ${CID}:
// - barra: todos os links da aside "Menu principal" a 1440 px em /${CID};
// - barraInferior: os links da nav.bottomnav "Áreas" a 375 px;
// - folha: os links da folha "Navegar no Nexo" aberta pelo botão Menu da barra inferior (só links; botões ficam de fora).
// O 03-04 troca só a marca e tira o controle Aparência do médico: o teste "trava do médico" em menu-equipe.spec.ts tem que
// continuar passando sem editar este arquivo. Mudar esta lista é mudar o menu do médico (Phase 9, decisão do João).
// Mudou em 11/11/2026 (decisão aberta 3 do João, "tira isso aí, ninguém usa"): saíram 4 pares, "Entregas e aprovações" e
// "Entregas" (para /plano), e "Plano da semana" e "Revisar roteiros" da folha. Nenhuma outra diferença foi aceita.
export const LINKS_DO_MEDICO: { barra: [string, string][]; barraInferior: [string, string][]; folha: [string, string][] } = {
  barra: [
    ["Resultados", `/${CID}/pacientes?preset=30d`],
    ["Relatórios", `/${CID}/relatorio?preset=30d`],
    ["Marketing", `/${CID}/conteudo?preset=30d`],
    ["Comercial", `/${CID}/crm-painel?preset=30d`],
    ["Pacientes do período", `/${CID}/pacientes?preset=30d`],
    ["Resultados da clínica", `/${CID}?preset=30d`],
    ["Conheça o Nexo", "/bem-vindo"],
  ],
  barraInferior: [
    ["Resultados", `/${CID}/pacientes?preset=30d`],
    ["Relatórios", `/${CID}/relatorio?preset=30d`],
  ],
  folha: [
    ["Pacientes do período", `/${CID}/pacientes?preset=30d`],
    ["Resultados da clínica", `/${CID}?preset=30d`],
    ["Relatório do período", `/${CID}/relatorio?preset=30d`],
    ["Analisar desempenho", `/${CID}/conteudo?preset=30d`],
    ["Resultados dos anúncios", `/${CID}/anuncios?preset=30d`],
    ["Planejar a semana", `/${CID}/ideias?preset=30d&visao=semana`],
    ["Encontrar ideias", `/${CID}/ideias?preset=30d&visao=ideias`],
    ["Funil comercial", `/${CID}/crm-painel?preset=30d`],
  ],
};
