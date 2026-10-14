// PDF do manual de organização do CRM (src/lib/manual-crm.ts), com a marca Doctor Creator,
// para enviar à equipe da clínica. Carregado sob demanda (import dinâmico) para não pesar a tela.
import { Document, Page, pdf, Text, View } from "@react-pdf/renderer";
import { MANUAL_CRM } from "@/lib/manual-crm";

const INK = "#0F172A";
const INK2 = "#475569";
const OURO = "#C49A5C";

function Manual({ cliente }: { cliente?: string | null }) {
  return (
    <Document title="Manual de organização do CRM" author="Doctor Creator">
      <Page size="A4" style={{ padding: 40, fontFamily: "Helvetica", fontSize: 10, color: INK, lineHeight: 1.45 }} wrap>
        <Text style={{ fontFamily: "Times-Roman", fontSize: 18, marginBottom: 4 }}>
          Doctor<Text style={{ fontFamily: "Times-Bold", color: OURO }}>Creator</Text>
        </Text>
        <Text style={{ fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 }}>Manual de organização do CRM</Text>
        <Text style={{ color: INK2, marginBottom: 16 }}>
          {cliente ? `Para a equipe de ${cliente}. ` : ""}Como deixar o CRM legível para o painel mostrar o retorno do investimento.
        </Text>
        {MANUAL_CRM.map((s, i) => (
          <View key={i} style={{ marginBottom: 14 }} wrap={false}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12.5, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: OURO, paddingLeft: 6 }}>
              {i + 1}. {s.titulo}
            </Text>
            {s.intro ? <Text style={{ color: INK2, marginBottom: 4 }}>{s.intro}</Text> : null}
            {s.itens.map((it, k) => (
              <View key={k} style={{ flexDirection: "row", marginBottom: 3 }}>
                <Text style={{ width: 10 }}>•</Text>
                <Text style={{ flex: 1 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{it.titulo}: </Text>
                  {it.texto}
                </Text>
              </View>
            ))}
          </View>
        ))}
        <Text style={{ marginTop: 10, color: INK2, fontSize: 8.5 }} fixed>
          Doctor Creator · Intelligence Hub · Dúvidas sobre o CRM: fale com a equipe Doctor Creator.
        </Text>
      </Page>
    </Document>
  );
}

export async function baixarManualCrm(cliente?: string | null) {
  const blob = await pdf(<Manual cliente={cliente} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "manual-organizacao-crm-doctor-creator.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
