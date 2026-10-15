// SAP · fidelização, reativação e indicação (08.02, 08.03, Sessão 6). Registro semanal da equipe (o CRM não mostra retorno,
// recompra, código de indicação nem avaliação no Google). Lógica pura (teste: scripts/test-sap-fidelizacao.ts).
//   V16 indicação não acontece: nenhuma indicação nas últimas 4 semanas lançadas, ou mais de 50% sem código IND.
//   V17 retorno e recompra parados: nenhum retorno nem recompra nas últimas 4 semanas lançadas.
// As duas só valem depois da Sessão 6 (D48) e das réguas ativas (D52), com pelo menos 2 semanas lançadas.
// Taxa de SAIR (pediu para não receber mensagens) acima de 5% dos contatados é alerta de régua agressiva.

export interface SemanaFidelizacao {
  semana: string;
  retornos: number | null;
  recompras: number | null;
  contatados_reativacao: number | null;
  reativados_agendaram: number | null;
  indicacoes: number | null;
  indicacoes_com_codigo: number | null;
  avaliacoes_google: number | null;
  sair: number | null;
  contatados_regua: number | null;
}

export interface ResumoFidelizacao {
  semanas: number;
  retornos: number;
  recompras: number;
  reativacao: { contatados: number; agendaram: number; taxa: number | null };
  indicacoes: number;
  semCodigo: number | null; // fração das indicações sem código
  avaliacoes: number;
  sair: number | null; // fração dos contatados
  gatilhos: { codigo: "V16" | "V17"; motivo: string }[];
  alertas: string[];
}

const n = (v: number | null | undefined) => Number(v) || 0;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function resumoFidelizacao(semanas: SemanaFidelizacao[], dia: number | null, ultimas = 4): ResumoFidelizacao {
  const s = [...semanas].sort((a, b) => b.semana.localeCompare(a.semana)).slice(0, ultimas);
  const soma = (k: keyof SemanaFidelizacao) => s.reduce((a, x) => a + n(x[k] as number | null), 0);
  const ind = soma("indicacoes");
  const comCod = soma("indicacoes_com_codigo");
  const contReat = soma("contatados_reativacao");
  const agReat = soma("reativados_agendaram");
  const contReg = soma("contatados_regua") + contReat;
  const sair = soma("sair");
  const r: ResumoFidelizacao = {
    semanas: s.length,
    retornos: soma("retornos"),
    recompras: soma("recompras"),
    reativacao: { contatados: contReat, agendaram: agReat, taxa: contReat ? agReat / contReat : null },
    indicacoes: ind,
    semCodigo: ind ? Math.max(0, ind - comCod) / ind : null,
    avaliacoes: soma("avaliacoes_google"),
    sair: contReg ? sair / contReg : null,
    gatilhos: [],
    alertas: [],
  };
  const valendo = dia !== null && dia >= 52 && s.length >= 2;
  if (valendo) {
    if (ind === 0) r.gatilhos.push({ codigo: "V16", motivo: `Nenhuma indicação registrada nas últimas ${s.length} semanas.` });
    else if (r.semCodigo !== null && r.semCodigo > 0.5) r.gatilhos.push({ codigo: "V16", motivo: `${pct(r.semCodigo)} das indicações chegaram sem código (limite 50%).` });
    if (r.retornos + r.recompras === 0) r.gatilhos.push({ codigo: "V17", motivo: `Nenhum retorno nem recompra registrado nas últimas ${s.length} semanas.` });
  }
  if (r.sair !== null && contReg >= 20 && r.sair > 0.05) r.alertas.push(`${pct(r.sair)} dos contatados pediram para sair (limite 5%): a régua está insistente demais.`);
  return r;
}
