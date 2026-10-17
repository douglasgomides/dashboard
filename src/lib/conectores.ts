// Integration Core: catálogo único das conexões do Hub e o estado real de cada uma por cliente.
// O estado vem do banco (contas ligadas + último registro de sincronização em sync_status). Conector que ainda não
// existe no código aparece como "planejado" e nunca como disponível: nada aqui simula conexão.

export type Categoria = "conteudo" | "anuncios" | "crm" | "atendimento" | "links" | "agenda";
export type EstadoConector = "disponivel" | "planejado";
export type EstadoCliente = "conectado" | "atrasado" | "erro" | "sem_registro" | "nao_conectado";
export type FonteSync = "instagram" | "comentarios" | "anuncios" | "crm" | "atendimento";

export interface Conector {
  id: string;
  nome: string;
  categoria: Categoria;
  estado: EstadoConector;
  alimenta: string;
  autenticacao: string;
  /** Qual linha de sync_status mostra a saúde desta conexão (null = não registra sincronização). */
  fonte: FonteSync | null;
  observacao?: string;
}

export const CATEGORIAS: Record<Categoria, string> = {
  conteudo: "Conteúdo", anuncios: "Anúncios", crm: "CRM e vendas", atendimento: "Atendimento", links: "Links", agenda: "Agenda e prontuário",
};

export const CONECTORES: Conector[] = [
  { id: "meta_graph", nome: "Instagram (Meta Graph)", categoria: "conteudo", estado: "disponivel", fonte: "instagram", alimenta: "Posts, métricas da conta, comentários e perguntas", autenticacao: "Token da Meta por conta (guardado no servidor)" },
  { id: "windsor", nome: "Instagram (Windsor)", categoria: "conteudo", estado: "disponivel", fonte: "instagram", alimenta: "Posts e métricas da conta", autenticacao: "Chave da Windsor no servidor" },
  { id: "meta_ads", nome: "Anúncios Meta", categoria: "anuncios", estado: "disponivel", fonte: "anuncios", alimenta: "Gasto, resultados e campanhas", autenticacao: "Conta de anúncio ligada ao cliente + token da Meta no servidor" },
  { id: "kommo", nome: "Kommo", categoria: "crm", estado: "disponivel", fonte: "crm", alimenta: "Leads, etapas, motivos de perda e, quando o webhook de mensagens está ligado, as mensagens recebidas (fonte do Brand Brain)", autenticacao: "Token OAuth do Kommo por cliente" },
  { id: "clint", nome: "Clint", categoria: "crm", estado: "disponivel", fonte: "crm", alimenta: "Negócios e etapas", autenticacao: "Chave da API por cliente", observacao: "A API pública da Clint não traz as conversas; falta confirmar com o suporte se existe API ou webhook de mensagens." },
  { id: "rdstation", nome: "RD Station CRM", categoria: "crm", estado: "disponivel", fonte: "crm", alimenta: "Negócios e funis", autenticacao: "Token por cliente" },
  { id: "flwchat", nome: "FlwChat", categoria: "crm", estado: "disponivel", fonte: "crm", alimenta: "Cards, painéis e conversas completas do WhatsApp (mesma API da WTS), que entram na auditoria comercial", autenticacao: "Token por cliente" },
  { id: "digisac", nome: "Digisac", categoria: "atendimento", estado: "disponivel", fonte: "crm", alimenta: "Contatos, atendimentos e conversas completas do WhatsApp, que entram na auditoria comercial", autenticacao: "Token por cliente" },
  { id: "planilha", nome: "Planilha (CRM manual)", categoria: "crm", estado: "disponivel", fonte: "crm", alimenta: "Leads lançados à mão", autenticacao: "Sem login externo" },
  { id: "wts", nome: "WTS (WhatsApp)", categoria: "atendimento", estado: "disponivel", fonte: "atendimento", alimenta: "Conversas, tempo de resposta e resumos", autenticacao: "Token da WTS no servidor" },
  { id: "shortio", nome: "Short.io", categoria: "links", estado: "disponivel", fonte: null, alimenta: "Cliques dos links rastreados", autenticacao: "Chave do Short.io no servidor" },
  { id: "google_ads", nome: "Google Ads", categoria: "anuncios", estado: "planejado", fonte: null, alimenta: "Gasto e conversões do Google", autenticacao: "OAuth do Google (a fazer)", observacao: "O SAP já guarda o ID da conta, mas nenhum cliente está sincronizando." },
  { id: "whatsapp_business", nome: "WhatsApp Business (API oficial)", categoria: "atendimento", estado: "planejado", fonte: null, alimenta: "Conversas direto da Meta", autenticacao: "Cadastro na Meta (a fazer)", observacao: "Hoje o WhatsApp da clínica chega pela WTS ou pelo CRM." },
  { id: "feegow", nome: "Feegow", categoria: "agenda", estado: "planejado", fonte: null, alimenta: "Agendamentos e comparecimento", autenticacao: "Token da API (a confirmar com o fornecedor)" },
  { id: "clinica_nas_nuvens", nome: "Clínica nas Nuvens", categoria: "agenda", estado: "planejado", fonte: null, alimenta: "Agendamentos e comparecimento", autenticacao: "A confirmar com o fornecedor" },
  { id: "google_sheets", nome: "Google Sheets", categoria: "crm", estado: "planejado", fonte: null, alimenta: "Planilhas da clínica lidas automaticamente", autenticacao: "OAuth do Google (a fazer)", observacao: "Hoje a planilha é lançada à mão (conector Planilha)." },
];

export interface RegistroSync { last_attempt_at: string | null; last_success_at: string | null; last_error: string | null }

/** Estado de uma conexão de um cliente: ligada ou não, e como foi a última sincronização. */
export function estadoDoCliente(ligado: boolean, sync: RegistroSync | null | undefined, agora = Date.now(), diasAtraso = 3): EstadoCliente {
  if (!ligado) return "nao_conectado";
  if (!sync) return "sem_registro";
  const ok = sync.last_success_at ? new Date(sync.last_success_at).getTime() : 0;
  const tentou = sync.last_attempt_at ? new Date(sync.last_attempt_at).getTime() : 0;
  if (sync.last_error && tentou >= ok) return "erro";
  if (!ok) return "sem_registro";
  return agora - ok > diasAtraso * 86_400_000 ? "atrasado" : "conectado";
}

export const NOME_ESTADO: Record<EstadoCliente, string> = {
  conectado: "Conectado", atrasado: "Sem sincronizar há dias", erro: "Com erro", sem_registro: "Ligado, sem registro de sincronização", nao_conectado: "Não conectado",
};
