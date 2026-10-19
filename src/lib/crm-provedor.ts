export function nomeCrm(provider: string | null | undefined): string {
  const nomes: Record<string, string> = { kommo: "Kommo", clint: "Clint", rdstation: "RD Station", flwchat: "FlwChat", wts: "WTSChat", wtschat: "WTSChat", digisac: "Digisac", planilha: "planilha" };
  return provider ? nomes[provider] ?? provider : "CRM";
}
