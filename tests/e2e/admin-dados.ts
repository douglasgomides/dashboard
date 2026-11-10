import type { BrowserContext, Route } from "@playwright/test";
import { CID, client } from "./fixtures";

// Dados de teste das telas da equipe (Carteira, Conferência, Integrações e Configurar cliente): seis clínicas com fontes
// em dia, atrasadas e paradas, números dos últimos 60 dias, uma conferência salva e conexões dos conectores. Nada aqui
// fala com banco de verdade: são rotas do Supabase falso registradas por cima do mockAccount.

const id = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-aaaa-4aaa-8aaa-${String(n).repeat(12)}`;
export const CLINICAS = [
  { ...client },
  { ...client, id: id(4), name: "Dra. Ana Souza", specialty: "Ginecologia", instagram_handle: "draanasouza" },
  { ...client, id: id(5), name: "Dr. Bruno Lima", specialty: "Ortopedia", instagram_handle: "drbrunolima" },
  { ...client, id: id(6), name: "Clínica Sorriso", specialty: "Odontologia", instagram_handle: null },
  { ...client, id: id(7), name: "Dra. Carla Mendes", specialty: "Dermatologia", instagram_handle: "dracarla" },
  { ...client, id: id(8), name: "Dr. Diego Rocha", specialty: "Cardiologia", instagram_handle: "drdiegorocha" },
];

const dia = (atras: number) => new Date(Date.now() - atras * 86_400_000).toISOString().slice(0, 10);
const quando = (atras: number) => new Date(Date.now() - atras * 86_400_000).toISOString();

function paginar(route: Route, linhas: unknown[]) {
  const url = new URL(route.request().url());
  // Leitura de um cliente só (client_id=eq.x): devolve só as linhas dele, como o banco faria.
  const doCliente = url.searchParams.get("client_id");
  if (doCliente?.startsWith("eq.")) linhas = (linhas as { client_id?: string }[]).filter((l) => l.client_id === doCliente.slice(3));
  const range = route.request().headers()["range"]?.split("-").map(Number);
  const off = Number(url.searchParams.get("offset") ?? range?.[0] ?? 0);
  const lim = Number(url.searchParams.get("limit") ?? (range ? range[1] - range[0] + 1 : 1000));
  return route.fulfill({ json: linhas.slice(off, off + lim) });
}

// Dias desde o último dado de cada fonte: 0 em dia, 2 atrasada, 6 parada, null sem fonte ligada.
const ATRASO: Record<string, Record<string, number | null>> = {
  [CID]: { instagram: 0, anuncios: 0, crm: 0, atendimento: null },
  [id(4)]: { instagram: 0, anuncios: 6, crm: 0, atendimento: 0 },
  [id(5)]: { instagram: 2, anuncios: 0, crm: 0, atendimento: null },
  [id(6)]: { instagram: null, anuncios: null, crm: 0, atendimento: null },
  [id(7)]: { instagram: 0, anuncios: 0, crm: 5, atendimento: 0 },
  [id(8)]: { instagram: 0, anuncios: 0, crm: 0, atendimento: 0 },
};

export async function mockCarteira(context: BrowserContext) {
  await context.route("**/rest/v1/clients?**", (route) => {
    const single = (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const url = new URL(route.request().url());
    const filtroId = url.searchParams.get("id")?.replace(/^eq\./, "");
    if (single) return route.fulfill({ json: CLINICAS.find((c) => c.id === filtroId) ?? CLINICAS[0] });
    return paginar(route, CLINICAS.map((c) => ({ ...c, meta_ad_account_id: null, wts_company_id: c.id === id(8) ? "wts-1" : null })));
  });
  await context.route("**/rest/v1/rpc/status_das_fontes**", (route) =>
    route.fulfill({
      json: CLINICAS.flatMap((c) =>
        Object.entries(ATRASO[c.id]).map(([fonte, atraso]) => ({
          client_id: c.id,
          fonte,
          cadastro: atraso != null,
          data_ate: atraso == null ? null : dia(atraso + 1),
          last_attempt_at: atraso == null ? null : quando(0),
          last_success_at: atraso == null ? null : quando(atraso),
          last_error: atraso != null && atraso >= 5 ? "Token expirado na origem" : null,
          motivo: null,
          motivo_dono: null,
          nao_usa: false,
        })),
      ),
    }),
  );
  await context.route("**/rest/v1/resultados_diarios?**", (route) =>
    paginar(
      route,
      CLINICAS.flatMap((c, k) =>
        Array.from({ length: 60 }, (_, i) => ({
          client_id: c.id,
          dia: dia(i + 1),
          mandaram_mensagem: 6 + ((i + k) % 5) + (i < 30 ? k : 0),
          leads_novos: 3,
          antigos: 1,
          agendaram: 2 + ((i + k) % 3),
          negociacao: 1,
          compareceram: 1,
          fecharam: (i + k) % 4 === 0 ? 1 : 0,
        })),
      ),
    ),
  );
  await context.route("**/rest/v1/app_admins?**", (route) => route.fulfill({ json: [{ user_id: "33333333-3333-4333-8333-333333333333" }] }));
  await context.route("**/rest/v1/client_members?**", (route) => {
    const single = (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const select = new URL(route.request().url()).searchParams.get("select");
    if (single || select !== "client_id,user_id,role") return route.fallback();
    return route.fulfill({ json: CLINICAS.slice(1, 5).map((c, i) => ({ client_id: c.id, user_id: `medico-${i}`, role: "owner" })) });
  });
  await context.route("**/rest/v1/rpc/qualidade_dados**", (route) => {
    const corpo = route.request().postDataJSON() as { p_client_id?: string } | null;
    if (corpo?.p_client_id !== id(7)) return route.fulfill({ json: [] });
    return route.fulfill({
      json: [{ id: "q1", fonte: "crm", severidade: "alta", titulo: "Vendas sem valor no CRM", evidencia: "8 de 10 vendas sem valor", causa: "Campo não preenchido", correcao: "Preencher o valor", responsavel: "Clínica", afeta: "Retorno" }],
    });
  });
  await context.route("**/rest/v1/rpc/roi_periodo**", (route) => {
    const corpo = route.request().postDataJSON() as { p_client_id?: string } | null;
    if (corpo?.p_client_id !== id(8)) return route.fulfill({ json: [] });
    return route.fulfill({
      json: { tem_anuncios: true, tem_crm: true, investido: 3000, investido_aquisicao: 3000, investido_estimado: 0, leads: 80, leads_com_origem: 80, ganhos: 6, ganhos_com_valor: 6, receita: 24000, ganhos_anuncio: 6, ganhos_anuncio_com_valor: 6, receita_anuncio: 24000, ganhos_com_canal: 6, ganho_identificavel: true },
    });
  });
}

export async function mockConferencia(context: BrowserContext) {
  await context.route("**/rest/v1/conferencias_dados?**", (route) =>
    route.fulfill({
      json: {
        id: "conf-1",
        iniciada_em: quando(1),
        concluida_em: quando(1),
        contas_vistas_na_meta: 14,
        tokens_testados: 6,
        etapas: [
          { etapa: "duplicidades", status: "ok", achados: 0, verificados: 12 },
          { etapa: "contas_meta", status: "ok", achados: 1, verificados: 14 },
          { etapa: "inconsistencias", status: "ok", achados: 1, verificados: 9 },
          { etapa: "parados", status: "ok", achados: 1, verificados: 18 },
          { etapa: "fontes_obrigatorias", status: "erro", erro: "Tempo esgotado" },
        ],
        achados: [
          { id: "a1", gravidade: "alta", tipo: "conta_sem_cliente", etapa: "contas_meta", cliente: null, titulo: "Conta de anúncios com gasto e sem cliente", detalhe: "A conta 9988 gastou R$ 1.200 nos últimos 7 dias e não está ligada a nenhum cliente.", acao: "Ligar a conta ao cliente certo em Configurar cliente.", risco: "O gasto não entra no retorno de ninguém." },
          { id: "a2", gravidade: "media", tipo: "gasto_diferente", etapa: "inconsistencias", cliente: "Dra. Ana Souza", titulo: "Gasto do painel 18% abaixo da Meta", detalhe: "Painel: R$ 820 · Meta: R$ 1.000 nos últimos 7 dias.", acao: "Rodar a sincronização de anúncios deste cliente." },
          { id: "a3", gravidade: "baixa", tipo: "parado", etapa: "parados", cliente: "Dra. Carla Mendes", titulo: "CRM diz sucesso, mas sem lead novo há 5 dias", detalhe: "A última sincronização deu certo, mas o último lead é de 5 dias atrás.", acao: "Confirmar com a clínica se o CRM está em uso." },
        ],
        verificados: [
          { etapa: "duplicidades", tipo: "conta_anuncios", nome: "Conta 1234", cliente: "Clínica de teste", ok: true, nota: "Só neste cliente" },
          { etapa: "parados", tipo: "crm", nome: "Kommo", cliente: "Dra. Carla Mendes", ok: false, nota: "Sem lead novo há 5 dias" },
        ],
      },
    }),
  );
  await context.route("**/rest/v1/conferencia_ao_vivo?**", (route) =>
    route.fulfill({
      json: [
        { client_id: CID, fonte: "kommo", metrica: "abertos", ok: true, rodado_em: quando(0) },
        { client_id: CID, fonte: "kommo", metrica: "ganhos", ok: true, rodado_em: quando(0) },
        { client_id: id(7), fonte: "kommo", metrica: "abertos", ok: false, rodado_em: quando(0) },
        { client_id: id(7), fonte: "kommo", metrica: "ganhos", ok: true, rodado_em: quando(0) },
      ],
    }),
  );
}

export async function mockIntegracoes(context: BrowserContext) {
  await context.route("**/rest/v1/crm_connections?**", (route) =>
    paginar(route, [CID, id(4), id(5), id(7), id(8)].map((c, i) => ({ id: `crm-${i}`, client_id: c, provider: "kommo", active: true, subdomain: "clinica", tem_token: true, tem_webhook: true }))),
  );
  await context.route("**/rest/v1/instagram_accounts?**", (route) =>
    paginar(route, CLINICAS.filter((c) => c.instagram_handle).map((c, i) => ({ id: `ig-${i}`, client_id: c.id, sync_source: "meta_graph", active: true, ig_username: c.instagram_handle, windsor_account_id: `1780${i}` }))),
  );
  await context.route("**/rest/v1/client_ad_accounts?**", (route) =>
    paginar(route, [CID, id(4), id(5), id(7), id(8)].map((c, i) => ({ client_id: c, ad_account_id: `act_${100 + i}`, active: true }))),
  );
  await context.route("**/rest/v1/sync_status?**", (route) =>
    paginar(
      route,
      CLINICAS.flatMap((c) =>
        Object.entries(ATRASO[c.id])
          .filter(([, a]) => a != null)
          .map(([fonte, a]) => ({ client_id: c.id, fonte, last_attempt_at: quando(0), last_success_at: quando(a as number), last_error: (a as number) >= 5 ? "Token expirado na origem" : null })),
      ),
    ),
  );
}
