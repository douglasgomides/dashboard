// Conta de anúncios ligada a mais de um cliente (RPC contas_anuncio_compartilhadas): o gasto aparece inteiro em cada um.
// Até o dono decidir de quem é a conta, as duas telas de Anúncios avisam com o nome do outro cliente.

export interface ContaAnuncioCompartilhada {
  ad_account_id: string;
  outros_clientes: number;
  nomes: string[] | null;
}

/** Frase do aviso: "Conta de anúncios compartilhada com <outro cliente>: ...". */
export function avisoContaAnuncioCompartilhada(c: ContaAnuncioCompartilhada): string {
  const nomes = (c.nomes ?? []).filter(Boolean);
  const com = nomes.length
    ? nomes.join(", ")
    : `${c.outros_clientes} outro${c.outros_clientes > 1 ? "s" : ""} cliente${c.outros_clientes > 1 ? "s" : ""}`;
  return (
    `Conta de anúncios compartilhada com ${com} (conta ${c.ad_account_id}): o gasto e os resultados aparecem inteiros nos dois clientes. ` +
    "Não some os clientes. Enquanto não estiver definido de quem é a conta, os números de anúncios são da conta inteira."
  );
}
