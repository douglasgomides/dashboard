/**
 * Paciente novo × já é paciente na Central de Atendimento, a partir do histórico que já temos (CRM e conversas), sem
 * prontuário. RPC relacionamento_pessoas: só datas e contagens, nada de valor, procedimento ou dado clínico.
 */
export interface Relacionamento { pessoa_id: string; ja_paciente: boolean; compras: number; ultima_compra: string | null; conversou_antes: boolean; primeiro_contato: string | null }
export type TipoRelacionamento = "paciente" | "contato_antigo" | "novo";

const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function rotuloRelacionamento(r: Relacionamento | null | undefined): { tipo: TipoRelacionamento; rotulo: string; detalhe: string } | null {
  if (!r) return null;
  if (r.ja_paciente) {
    const quando = r.ultima_compra ? `última compra em ${dataBR(r.ultima_compra)}` : "consulta registrada no CRM";
    return { tipo: "paciente", rotulo: "Já é paciente", detalhe: r.compras > 1 ? `${r.compras} compras · ${quando}` : quando };
  }
  if (r.conversou_antes) return { tipo: "contato_antigo", rotulo: "Já falou com a clínica", detalhe: r.primeiro_contato ? `primeiro contato em ${dataBR(r.primeiro_contato)}, sem compra registrada` : "sem compra registrada" };
  return { tipo: "novo", rotulo: "Primeiro contato", detalhe: "sem compra nem conversa anterior registradas" };
}
