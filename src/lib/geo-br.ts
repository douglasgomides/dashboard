// Estado (UF) a partir do texto de cidade que a Meta devolve ("Belo Horizonte, Minas Gerais").
// A Meta escreve o estado por extenso; para o Distrito Federal pode vir em inglês.
const UFS: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "federal district": "DF",
  "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG",
  para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN",
  "rio grande do sul": "RS", rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};

const limpa = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(state\)/g, "")
    .replace(/^(state|estado) (of|de|do) /, "")
    .trim();

export function ufDaCidade(bruto: string): string | null {
  const partes = bruto.split(",");
  if (partes.length < 2) return null;
  return UFS[limpa(partes[partes.length - 1])] ?? null;
}
