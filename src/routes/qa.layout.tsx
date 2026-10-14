import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Line, LineChart, Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { Users, Eye, Heart, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { InsightCard, ListaLimitacoes } from "@/components/insight-card";
import { Kpi, Painel } from "@/components/visual";
import { CaixaGrafico, LEGENDA, useEixos } from "@/components/grafico";
import type { Insight, Limitacao } from "@/lib/insight";
import type { DateRangeState } from "@/lib/date-range";

// Página de QA visual, SÓ em desenvolvimento (npm run dev): mostra a casca do
// Hub (menu, cabeçalho, abas, barra inferior) com dados de exemplo, para testar
// o layout em várias larguras sem login. Em produção a rota existe mas não
// renderiza nada: o bloco abaixo vira `null` no build (import.meta.env.DEV é
// false) e o Vite descarta o conteúdo de exemplo.
//
// Uso: /qa/layout?p=/posts  (p = tela simulada)   &admin=0 (visão do cliente)

export const Route = createFileRoute("/qa/layout")({
  validateSearch: (s: Record<string, unknown>): { p?: string; admin?: string } => ({
    p: typeof s.p === "string" ? s.p : undefined,
    admin: typeof s.admin === "string" ? s.admin : undefined,
  }),
  component: () => (import.meta.env.DEV ? <QaLayout /> : null),
});

const CID = "qa-cliente";

const INSIGHTS: Insight[] = [
  {
    id: "1",
    area: "anuncios",
    tom: "ruim",
    titulo: "Duas campanhas gastaram R$ 1.240 sem trazer nenhuma conversa",
    diagnostico: "O público é amplo demais e o anúncio leva para o perfil, não para o WhatsApp.",
    evidencia: "Campanha A: R$ 780, 0 conversas. Campanha B: R$ 460, 0 conversas (30 dias).",
    confianca: "alta",
    motivoConfianca: "30 dias completos de dado",
    impacto: "alto",
    impactoTexto: "≈ 25 conversas a mais por mês com a mesma verba",
    acao: { texto: "Pausar as campanhas A e B e passar a verba para a campanha de WhatsApp.", rota: "/$clientId/anuncios", botao: "Ver campanhas" },
    responsavel: "gestor_trafego",
    risco: "Conversas abertas pelo Direct não entram nessa conta.",
  },
  {
    id: "2",
    area: "conteudo",
    tom: "bom",
    titulo: "Carrosséis de dúvidas salvaram 3 vezes mais que o post típico",
    diagnostico: "Quem salva quer rever depois: é o tipo de post que traz paciente.",
    evidencia: "Mediana de 41 salvamentos contra 13 nos demais (24 posts).",
    confianca: "media",
    impacto: "medio",
    acao: { texto: "Fazer mais 2 carrosséis de dúvidas por semana." },
    responsavel: "social_media",
  },
  {
    id: "3",
    area: "comercial",
    tom: "atencao",
    titulo: "Metade das conversas do WhatsApp esperou mais de 2 horas pela primeira resposta",
    diagnostico: "A espera longa derruba o agendamento: quem espera procura outro médico.",
    evidencia: "Mediana de espera: 2h14. 312 conversas no período.",
    confianca: "baixa",
    motivoConfianca: "só 9 dias com dado",
    impacto: "alto",
    responsavel: "atendimento",
  },
];
const LIMITACOES: Limitacao[] = [
  { id: "l1", area: "comercial", texto: "Sem o CRM ligado, não dá para saber quantas conversas viraram consulta.", resolve: "equipe_hub", comoResolver: "Conectar o CRM na tela de admin." },
];

// 90 dias determinísticos de exemplo.
const DIAS = Array.from({ length: 90 }, (_, i) => {
  const d = new Date(2026, 6, 15 + i);
  const rot = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const onda = Math.sin(i / 6) * 40;
  return {
    dia: rot,
    Seguidores: 12000 + i * 18 + Math.round(onda),
    Curtidas: 300 + Math.round(onda * 3 + (i % 7) * 20),
    Comentários: 40 + (i % 5) * 6,
    Salvamentos: 60 + (i % 9) * 8,
  };
});

const TABELA = [
  { equipe: "Recepção", atend: 412, fatia: "48,2%", espera: "1h 12min", fechar: "3h 40min" },
  { equipe: "Comercial", atend: 268, fatia: "31,4%", espera: "24min", fechar: "1h 05min" },
  { equipe: "Pós-consulta", atend: 174, fatia: "20,4%", espera: "2h 30min", fechar: "6h 10min" },
];

function QaLayout() {
  const { p = "/posts", admin } = Route.useSearch();
  const [range, setRange] = useState<DateRangeState>({ preset: "30d" });
  const eixos = useEixos();
  return (
    <AppShell
      clientId={CID}
      client={{ name: "Dra. Ana Beatriz Moreira", specialty: "Dermatologia", instagram_handle: "draanabeatriz", cfm_score_status: "verde" }}
      pathname={`/${CID}${p}`}
      dateRange={range}
      onDateRange={setRange}
      vis={{ isAdmin: admin !== "0", fontes: { tem_instagram: true, tem_anuncios: true, tem_crm: true, tem_atendimento: true }, soCrm: false }}
      frescor={
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          Dados: <b style={{ color: "var(--good)" }}>Instagram até 12/10</b> · <b style={{ color: "var(--warn)" }}>Anúncios até 09/10</b>
        </span>
      }
      frescorCompacto={
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs" style={{ color: "var(--text-dim)" }}>
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--warn)" }} /> Dados com atraso
        </span>
      }
      onBuscarCliente={admin !== "0" ? () => undefined : undefined}
    >
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(160px,100%),1fr))", marginBottom: 16 }}>
        <Kpi icone={Users} rotulo="Seguidores" valor="13.602" tendencia={{ sobe: true, texto: "+412 no período" }} />
        <Kpi icone={Eye} rotulo="Alcance" valor="182 mil" dica="Pessoas diferentes que viram algum post" />
        <Kpi icone={Heart} rotulo="Salvamentos" valor="1.904" cor="var(--crit)" tendencia={{ sobe: false, texto: "-8% contra o período anterior" }} />
        <Kpi icone={MessageCircle} rotulo="Conversas" valor="312" cor="var(--ai)" />
      </div>

      <div className="grid gap-3 md:grid-cols-2" style={{ marginBottom: 16 }}>
        {INSIGHTS.map((i) => (
          <InsightCard key={i.id} insight={i} clientId={CID} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2" style={{ marginBottom: 16 }}>
        <Painel icone={Users} titulo="Evolução de seguidores" resumo="90 dias, uma marca por dia" ajuda="Exemplo de gráfico de linha com 90 pontos.">
          <CaixaGrafico altura={260} alturaMobile={220}>
            <LineChart data={DIAS} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="dia" {...eixos.x} />
              <YAxis {...eixos.y} domain={["auto", "auto"]} />
              <Tooltip />
              <Line type="monotone" dataKey="Seguidores" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </CaixaGrafico>
        </Painel>
        <Painel icone={Heart} titulo="Interações por dia" resumo="Barras empilhadas com legenda" ajuda="Exemplo de barras com legenda que quebra linha.">
          <CaixaGrafico altura={260} alturaMobile={240}>
            <BarChart data={DIAS}>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="dia" {...eixos.x} />
              <YAxis {...eixos.y} />
              <Tooltip />
              <Legend {...LEGENDA} />
              <Bar dataKey="Curtidas" stackId="i" fill="var(--accent)" />
              <Bar dataKey="Comentários" stackId="i" fill="var(--ai)" />
              <Bar dataKey="Salvamentos" stackId="i" fill="var(--good)" />
            </BarChart>
          </CaixaGrafico>
        </Painel>
      </div>

      <div className="rounded-xl border p-4" style={{ background: "var(--surface)", borderColor: "var(--border)", marginBottom: 16 }}>
        <div className="mb-3 text-sm font-semibold">Por equipe (tabela que vira cartões no celular)</div>
        <table className="w-full text-sm empilha">
          <thead>
            <tr style={{ color: "var(--text-faint)" }}>
              <th className="py-2 text-left font-medium">Equipe</th>
              <th className="py-2 text-right font-medium">Atendimentos</th>
              <th className="py-2 text-right font-medium">Fatia</th>
              <th className="py-2 text-right font-medium">Espera</th>
              <th className="py-2 text-right font-medium">Até fechar</th>
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
            {TABELA.map((r) => (
              <tr key={r.equipe} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td data-label="Equipe" className="py-2">{r.equipe}</td>
                <td data-label="Atendimentos" className="py-2 text-right">{r.atend}</td>
                <td data-label="Fatia" className="py-2 text-right">{r.fatia}</td>
                <td data-label="Espera" className="py-2 text-right">{r.espera}</td>
                <td data-label="Até fechar" className="py-2 text-right">{r.fechar}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ListaLimitacoes itens={LIMITACOES} />
    </AppShell>
  );
}
