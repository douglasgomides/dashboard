import { atrasoDaAcao, type Revisao, type EnvioClickUp } from './acompanhamento';

export type ClienteRelatorio = { id: string; name: string; active: boolean };
export type ItemRelatorio = { cliente: ClienteRelatorio; revisao: Revisao | null; atualizada: boolean; faltas: string[]; atrasadas: number; tarefas: EnvioClickUp[] };
export type RelatorioSemanal = { de: string; ate: string; emitidoEm: string; itens: ItemRelatorio[] };
export function montarRelatorioSemanal(clientes: ClienteRelatorio[], revisoes: Revisao[], envios: EnvioClickUp[], de: string, ate: string, hoje: string): RelatorioSemanal {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || de > ate) throw new Error('Confira o período do relatório.');
  const itens = clientes.filter(c => c.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(cliente => {
    const revisao = revisoes.filter(r => r.client_id === cliente.id && r.data <= ate).sort((a, b) => b.data.localeCompare(a.data) || (b.atualizado_em ?? '').localeCompare(a.atualizado_em ?? ''))[0] ?? null;
    const d = revisao?.dados;
    const faltas: string[] = [];
    for (const [rotulo, valor] of [['Objetivo', d?.objetivo], ['Instagram', d?.instagram], ['Conteúdos', d?.conteudo], ['Leads e agendamentos', d?.leads], ['Acertos', d?.acertos], ['Problemas', d?.problemas], ['Anúncios', d?.anuncios], ['Cliques', d?.cliques], ['Decisão do Douglas', d?.decisao]] as const) if (!valor?.trim()) faltas.push(rotulo);
    if (!d?.fontes.length) faltas.push('Fontes');
    if (!d?.acoes.length) faltas.push('Próximas ações');
    return { cliente, revisao, atualizada: !!revisao && revisao.data >= de, faltas, atrasadas: d?.acoes.filter(a => atrasoDaAcao(a, hoje)).length ?? 0, tarefas: envios.filter(e => e.revisao_id === revisao?.id && e.estado === 'criada') };
  });
  return { de, ate, emitidoEm: new Date().toISOString(), itens };
}
export function secoesDoCliente(item: ItemRelatorio): { titulo: string; texto: string }[] {
  const r = item.revisao;
  if (!r) return [{ titulo: 'Revisão pendente', texto: 'Nenhuma revisão encontrada até o fim deste período. A equipe precisa preparar a análise.' }];
  const d = r.dados;
  return [
    { titulo: 'Objetivo atual', texto: d.objetivo },
    { titulo: 'O que funcionou', texto: d.acertos ?? '' },
    { titulo: 'O que precisa melhorar', texto: d.problemas ?? '' },
    { titulo: `Instagram • dados de ${d.periodo_de} a ${d.periodo_ate}`, texto: d.instagram },
    { titulo: 'Conteúdos e referências de desempenho', texto: d.conteudo },
    { titulo: 'Anúncios', texto: d.anuncios ?? '' },
    { titulo: 'Cliques nos links', texto: d.cliques ?? '' },
    { titulo: 'Leads, qualificação e agendamentos', texto: d.leads },
    { titulo: 'Hipótese e próximo teste', texto: d.hipotese },
    { titulo: 'Execução e decisões da equipe', texto: d.notas },
    { titulo: 'Decisão necessária do Douglas', texto: d.decisao ?? '' },
  ].map(s => ({ ...s, texto: s.texto.trim() || 'Não informado pela equipe. Registrar o dado ou explicar por que não se aplica.' }));
}

export function sinalDoCliente(item: ItemRelatorio) {
  if (!item.atualizada) return { texto: 'Revisão pendente', cor: '#8a4b08', fundo: '#fff3dd' };
  const balanco = item.revisao?.dados.balanco;
  if (balanco === 'Melhorou') return { texto: 'Melhorou', cor: '#14633c', fundo: '#eaf6ee' };
  if (balanco === 'Piorou') return { texto: 'Piorou', cor: '#a52830', fundo: '#fff0f0' };
  if (balanco === 'Estável') return { texto: 'Estável', cor: '#2459a6', fundo: '#edf3fc' };
  return { texto: 'Sem conclusão', cor: '#526174', fundo: '#f0f2f6' };
}
