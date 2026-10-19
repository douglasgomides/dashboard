// SAP · Resumo semanal para o médico: mensagem curta para o WhatsApp com o dia do programa, os 3 números da
// garantia (agora x ponto de partida), o ponto principal da semana e a ação de cada lado. A equipe revisa e envia;
// nada sai sozinho. Regra CFM: sem promessa de resultado, sem preço; número sempre com a referência de partida.
// Lógica pura (teste: scripts/test-sap-resumo-medico.ts).

export interface KpiResumo { rotulo: string; agora: string; partida: string; melhorou: boolean | null }

export function montarResumoMedico(a: {
  nomeContato?: string | null;
  dia: number | null;
  kpis: KpiResumo[];
  principal?: { titulo: string; acaoClinica?: string | null; acaoDc?: string | null; prazo?: string | null } | null;
  proximaReuniao?: string | null;
  dadosSuficientes?: boolean;
}): string {
  const linhas: string[] = [];
  linhas.push(`Bom dia${a.nomeContato ? `, ${a.nomeContato}` : ""}! Resumo da semana do programa${a.dia !== null && a.dia >= 0 && a.dia <= 90 ? ` (dia ${a.dia} de 90)` : ""}:`);
  const comNumero = a.kpis.filter((k) => k.agora !== "—");
  if (comNumero.length) {
    linhas.push("");
    for (const k of comNumero) {
      const seta = k.melhorou === null ? "" : k.melhorou ? " ✅" : " ⚠️";
      linhas.push(`• ${k.rotulo}: ${k.agora} (partida: ${k.partida})${seta}`);
    }
  }
  if (a.principal) {
    linhas.push("", `Ponto principal da semana: ${a.principal.titulo}.`);
    if (a.principal.acaoDc) linhas.push(`Nossa ação: ${minuscula(a.principal.acaoDc)}`);
    if (a.principal.acaoClinica) linhas.push(`Proposta para vocês: ${minuscula(a.principal.acaoClinica)}${a.principal.prazo ? ` Prazo: ${a.principal.prazo.toLowerCase()}.` : ""}`);
  } else if (a.dadosSuficientes === false || a.kpis.length < 3 || a.kpis.some((k) => k.agora === "—" || k.partida === "—")) {
    linhas.push("", "Ainda faltam dados e baseline para concluir a leitura da semana. Vamos conferir as fontes e completar os registros antes de avaliar os indicadores.");
  } else {
    linhas.push("", "Nenhum ponto crítico nesta semana: seguimos a rotina combinada.");
  }
  if (a.proximaReuniao) linhas.push("", `Próxima reunião: ${a.proximaReuniao}.`);
  linhas.push("", "Qualquer dúvida, é só responder aqui.");
  return linhas.join("\n");
}

const minuscula = (s: string) => {
  const t = s.trim();
  const fim = /[.!?]$/.test(t) ? t : `${t}.`;
  return fim.charAt(0).toLowerCase() + fim.slice(1);
};
