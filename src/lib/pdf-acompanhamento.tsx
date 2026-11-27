import { Document, Page, Text, View, Link, StyleSheet, Font, pdf } from '@react-pdf/renderer';
import { secoesDoCliente, sinalDoCliente, type RelatorioSemanal } from './relatorio-acompanhamento';
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
  cards: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 10 },
  card: { width: '24%', padding: 11, borderRadius: 7, backgroundColor: '#edf3fc' },
  value: { fontSize: 23, fontWeight: 700, lineHeight: 1.25, marginBottom: 5 },
  label: { fontSize: 8, color: '#526174' },
  badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 5, fontSize: 9 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  block: { padding: 10, borderRadius: 7, marginTop: 10, borderLeftWidth: 3, borderLeftColor: '#dce2ec', backgroundColor: '#f7f9fc' },
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
      <View style={s.cards} wrap={false}>{[
        { valor: r.itens.length, rotulo: 'Clientes incluídos', fundo: '#edf3fc', cor: '#2459a6' },
        { valor: atuais.length, rotulo: 'Revisões no período', fundo: '#eaf6ee', cor: '#14633c' },
        { valor: r.itens.length - atuais.length, rotulo: 'Revisões pendentes', fundo: '#fff3dd', cor: '#8a4b08' },
        { valor: r.itens.reduce((n, i) => n + i.atrasadas, 0), rotulo: 'Ações vencidas', fundo: '#fff0f0', cor: '#a52830' },
      ].map(c => <View key={c.rotulo} style={{ ...s.card, backgroundColor: c.fundo }}><Text style={{ ...s.value, color: c.cor }}>{c.valor}</Text><Text style={s.label}>{c.rotulo}</Text></View>)}</View>
      <Text style={s.muted}>Leitura rápida: confira a cobertura, veja os clientes que precisam de atenção e termine nas decisões solicitadas.</Text>
      <View style={s.notice}><Text>{atuais.filter(i => i.revisao?.dados.balanco === 'Melhorou').length} melhoraram  |  {atuais.filter(i => i.revisao?.dados.balanco === 'Piorou').length} pioraram  |  {atuais.filter(i => i.revisao?.dados.balanco === 'Estável').length} estáveis  |  {atuais.filter(i => !i.revisao?.dados.balanco || i.revisao.dados.balanco === 'Sem conclusão').length} sem conclusão</Text><Text style={{ fontSize: 8, marginTop: 4 }}>Balanço informado pela equipe nas revisões do período. A prioridade indica urgência de acompanhamento.</Text></View>
      <Text style={s.h3}>Resumo da carteira</Text>
      {r.itens.map(i => <View key={i.cliente.id} style={s.row} wrap={false}><View style={s.topRow}><Text style={{ fontWeight: 700, width: '62%' }}>{i.cliente.name}</Text><Text style={{ ...s.badge, color: sinalDoCliente(i).cor, backgroundColor: sinalDoCliente(i).fundo }}>{sinalDoCliente(i).texto}</Text></View><Text>{i.atrasadas} ações vencidas</Text><Text style={s.muted}>{i.faltas.length ? `${i.faltas.length} campos a conferir` : 'Campos preenchidos'}{i.revisao ? ` | Revisão de ${br(i.revisao.data)}` : ''}</Text></View>)}
      <Text style={s.h3}>Decisões para o Douglas</Text><Text style={s.muted}>A equipe apresenta o contexto e sua recomendação em cada solicitação.</Text>
      {atuais.filter(i => i.revisao?.dados.decisao?.trim()).map(i => <View key={i.cliente.id} style={s.row}><Text style={{ fontFamily: 'NexoReport', fontWeight: 700 }} minPresenceAhead={40}>{i.cliente.name}</Text><Text>{i.revisao?.dados.decisao}</Text></View>)}
      {!atuais.some(i => i.revisao?.dados.decisao?.trim()) && <Text>Decisões ainda não registradas pela equipe.</Text>}
      <Text style={s.muted}>As conclusões são registradas pela equipe. Este relatório consolida as fichas salvas. Não faz nova coleta de dados nem presume melhora ou piora a partir de campos vazios. Os períodos das métricas aparecem em cada ficha.</Text><Text fixed style={s.footer}>Nexo | Doctor Creator | Uso interno da equipe</Text>
    </Page>
    {r.itens.map(item => <Page size="A4" style={s.page} key={item.cliente.id}>
      <Text style={s.brand}>ACOMPANHAMENTO SEMANAL / DOCTOR CREATOR</Text><Text style={s.h2}>{item.cliente.name}</Text><View style={{ ...s.badge, alignSelf: "flex-start", color: sinalDoCliente(item).cor, backgroundColor: sinalDoCliente(item).fundo, marginBottom: 8 }}><Text>{sinalDoCliente(item).texto}</Text></View>
      <Text style={s.muted}>{item.revisao ? `Revisão ${br(item.revisao.data)} | Prioridade ${item.revisao.prioridade} | Próxima checagem ${item.revisao.proxima_checagem ? br(item.revisao.proxima_checagem) : 'A definir'}` : 'Sem revisão até o fim do período'}</Text>
      {!item.atualizada && <View style={s.notice}><Text>REVISÃO PENDENTE NO PERÍODO</Text><Text>{item.revisao ? 'A ficha abaixo é anterior ao período selecionado e precisa ser atualizada.' : 'A equipe precisa preparar a ficha deste cliente.'}</Text></View>}
      {item.faltas.length > 0 && <View style={{ ...s.notice, backgroundColor: "#fff3dd" }}><Text style={{ fontSize: 9, color: "#8a4b08" }}>A equipe precisa completar ou justificar</Text><Text style={{ fontSize: 9 }}>{item.faltas.join(', ')}.</Text></View>}
      {secoesDoCliente(item).map((sec, n) => {
        const cor = sec.titulo === 'O que funcionou' ? '#14633c' : sec.titulo === 'O que precisa melhorar' ? '#a52830' : '#2459a6';
        const fundo = sec.titulo === 'O que funcionou' ? '#eaf6ee' : sec.titulo === 'O que precisa melhorar' ? '#fff0f0' : '#f7f9fc';
        return <View key={sec.titulo} style={{ ...s.block, borderLeftColor: cor, backgroundColor: fundo }}><Text style={{ ...s.h3, color: cor, marginTop: 0 }} minPresenceAhead={32}>{String(n + 1).padStart(2, '0')} / {sec.titulo}</Text><Text>{sec.texto}</Text></View>;
      })}
      <Text style={s.h3} minPresenceAhead={50}>Ações e execução</Text>
      {!item.revisao?.dados.acoes.length && <Text>Ações ainda não registradas.</Text>}
      {item.revisao?.dados.acoes.map(a => <View key={a.id} style={{ ...s.block, borderLeftColor: "#2459a6" }}>
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
