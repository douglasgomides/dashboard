import { Document, Page, Text, View, Link, StyleSheet, Font, pdf } from '@react-pdf/renderer';
import { secoesDoCliente, type RelatorioSemanal } from './relatorio-acompanhamento';
const regular = new URL('../assets/fonts/nexo-regular.ttf', import.meta.url);
const bold = new URL('../assets/fonts/nexo-bold.ttf', import.meta.url);
Font.register({ family: 'NexoReport', fonts: [
  { src: regular.protocol === 'file:' ? decodeURIComponent(regular.pathname) : regular.href, fontWeight: 400 },
  { src: bold.protocol === 'file:' ? decodeURIComponent(bold.pathname) : bold.href, fontWeight: 700 },
] });
const s = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 45, paddingHorizontal: 38, fontFamily: 'NexoReport', fontSize: 10, color: '#17213a', lineHeight: 1.45 },
  brand: { fontSize: 9, color: '#526174', marginBottom: 10, letterSpacing: 1.2 },
  h1: { fontSize: 25, lineHeight: 1.25, fontFamily: 'NexoReport', fontWeight: 700, marginBottom: 8 },
  h2: { fontSize: 18, lineHeight: 1.3, fontFamily: 'NexoReport', fontWeight: 700, marginBottom: 8 },
  h3: { fontSize: 11, lineHeight: 1.4, fontFamily: 'NexoReport', fontWeight: 700, marginBottom: 4, marginTop: 13 },
  muted: { color: '#526174', fontSize: 9, marginBottom: 6 },
  notice: { backgroundColor: '#edf3fc', padding: 10, marginTop: 10, marginBottom: 10 },
  row: { borderBottomWidth: 1, borderColor: '#dce2ec', paddingVertical: 8 },
  link: { color: '#2459c6', fontSize: 9 },
  footer: { position: 'absolute', bottom: 22, left: 38, right: 38, fontSize: 8, color: '#526174' },
});
const br = (v: string) => v.slice(0, 10).split('-').reverse().join('/');
export function DocumentoRelatorioSemanal({ relatorio: r }: { relatorio: RelatorioSemanal }) {
  const atuais = r.itens.filter(i => i.atualizada);
  return <Document title={`Relatório semanal - Clientes - ${br(r.ate)}`} author="Doctor Creator" language="pt-BR">
    <Page size="A4" style={s.page}>
      <Text style={s.brand}>DOCTOR CREATOR / NEXO</Text><Text style={s.h1}>Relatório semanal de clientes</Text>
      <Text>Revisões de {br(r.de)} a {br(r.ate)}</Text><Text style={s.muted}>Emitido em {new Date(r.emitidoEm).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}</Text>
      <View style={s.notice}><Text>{r.itens.length} clientes selecionados | {atuais.length} revisados no período | {r.itens.length - atuais.length} sem revisão atualizada</Text><Text>{r.itens.reduce((n, i) => n + i.atrasadas, 0)} ações com prazo vencido nas últimas fichas</Text></View>
      <Text style={s.h3}>Resumo da carteira</Text>
      {r.itens.map(i => <View key={i.cliente.id} style={s.row} wrap={false}><Text style={{ fontFamily: 'NexoReport', fontWeight: 700 }}>{i.cliente.name}</Text><Text>{i.atualizada ? i.revisao?.dados.balanco ?? 'Sem conclusão da equipe' : 'Sem revisão no período'} | {i.atrasadas} ações vencidas</Text><Text style={s.muted}>{i.faltas.length ? `${i.faltas.length} campos a conferir` : 'Campos preenchidos'}{i.revisao ? ` | Revisão de ${br(i.revisao.data)}` : ''}</Text></View>)}
      <Text style={s.h3}>Decisões para o Douglas</Text>
      {atuais.filter(i => i.revisao?.dados.decisao?.trim()).map(i => <View key={i.cliente.id} style={s.row}><Text style={{ fontFamily: 'NexoReport', fontWeight: 700 }}>{i.cliente.name}</Text><Text>{i.revisao?.dados.decisao}</Text></View>)}
      {!atuais.some(i => i.revisao?.dados.decisao?.trim()) && <Text>Decisões ainda não registradas pela equipe.</Text>}
      <Text style={s.muted}>As conclusões são registradas pela equipe. Este relatório consolida as fichas salvas. Não faz nova coleta de dados nem presume melhora ou piora a partir de campos vazios. Os períodos das métricas aparecem em cada ficha.</Text><Text fixed style={s.footer}>Nexo | Doctor Creator | Uso interno da equipe</Text>
    </Page>
    {r.itens.map(item => <Page size="A4" style={s.page} key={item.cliente.id}>
      <Text style={s.brand}>ACOMPANHAMENTO SEMANAL / DOCTOR CREATOR</Text><Text style={s.h2}>{item.cliente.name}</Text>
      <Text style={s.muted}>{item.revisao ? `Revisão ${br(item.revisao.data)} | Prioridade ${item.revisao.prioridade} | Próxima checagem ${item.revisao.proxima_checagem ? br(item.revisao.proxima_checagem) : 'A definir'}` : 'Sem revisão até o fim do período'}</Text>
      {!item.atualizada && <View style={s.notice}><Text>REVISÃO PENDENTE NO PERÍODO</Text><Text>{item.revisao ? 'A ficha abaixo é anterior ao período selecionado e precisa ser atualizada.' : 'A equipe precisa preparar a ficha deste cliente.'}</Text></View>}
      {item.faltas.length > 0 && <Text style={s.muted}>Campos a conferir: {item.faltas.join(', ')}.</Text>}
      {secoesDoCliente(item).map(sec => <View key={sec.titulo}><Text style={s.h3} minPresenceAhead={32}>{sec.titulo}</Text><Text>{sec.texto}</Text></View>)}
      <Text style={s.h3} minPresenceAhead={50}>Ações e execução</Text>
      {!item.revisao?.dados.acoes.length && <Text>Ações ainda não registradas.</Text>}
      {item.revisao?.dados.acoes.map(a => <View key={a.id} style={s.row}>
        <Text style={{ fontFamily: 'NexoReport', fontWeight: 700 }}>{a.titulo}</Text><Text>{a.descricao}</Text><Text>{a.estado} | {a.responsavel || 'Responsável a definir'} | Prazo {a.prazo ? br(a.prazo) : 'A definir'}</Text><Text>Conclusão: {a.criterio || 'A definir'}</Text><Text>Resultado: {a.resultado || 'Ainda não registrado'}</Text>
        {item.tarefas.find(t => t.acao_id === a.id)?.tarefa_url && <Link style={s.link} src={item.tarefas.find(t => t.acao_id === a.id)!.tarefa_url!}>Abrir tarefa no ClickUp</Link>}
      </View>)}
      <Text style={s.h3} minPresenceAhead={30}>Fontes e entregas</Text>{item.revisao?.dados.fontes.map((url, i) => <Link key={url} style={s.link} src={url}>Fonte {i + 1}: {url}</Link>)}
      <Text fixed style={s.footer}>Nexo | Doctor Creator | Uso interno da equipe</Text>
    </Page>)}
  </Document>;
}
export async function baixarRelatorioSemanal(relatorio: RelatorioSemanal) {
  const blob = await pdf(<DocumentoRelatorioSemanal relatorio={relatorio} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `Relatorio_semanal_Clientes_${relatorio.ate.split('-').reverse().join('-')}.pdf`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
