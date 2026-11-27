import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { PainelAcompanhamento } from '@/lib/acompanhamento-data';
import { montarRelatorioSemanal, secoesDoCliente } from '@/lib/relatorio-acompanhamento';

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
export function RelatorioAcompanhamento({ painel, bloqueado }: { painel: PainelAcompanhamento; bloqueado: boolean }) {
  const [ate, setAte] = useState(hoje);
  const [de, setDe] = useState(() => { const d = new Date(`${hoje()}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 6); return d.toISOString().slice(0, 10); });
  const [ids, setIds] = useState(() => painel.clientes.map(c => c.id));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const valido = !!de && !!ate && de <= ate;
  const relatorio = valido ? montarRelatorioSemanal(painel.clientes.filter(c => ids.includes(c.id)), painel.revisoes, painel.envios, de, ate, hoje()) : null;
  async function baixar() {
    if (!relatorio || bloqueado) return;
    setOcupado(true); setErro('');
    try { const { baixarRelatorioSemanal } = await import('@/lib/pdf-acompanhamento'); await baixarRelatorioSemanal(relatorio); }
    catch { setErro('Não foi possível gerar o PDF. Tente novamente.'); }
    finally { setOcupado(false); }
  }
  return <section className="ac-report" aria-label="Relatório semanal da carteira">
    <div className="ac-section-head"><div><h3>Relatório semanal da carteira</h3><p>Consolidado das revisões salvas. Confira a prévia antes de enviar ao Douglas.</p></div><button className="btn primary" type="button" disabled={ocupado || bloqueado || !relatorio?.itens.length} onClick={() => void baixar()}>{ocupado ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}{ocupado ? 'Gerando PDF…' : 'Baixar PDF'}</button></div>
    <div className="ac-dates"><label>Revisões de<input type="date" value={de} onChange={e => setDe(e.target.value)} /></label><label>Até<input type="date" value={ate} onChange={e => setAte(e.target.value)} /></label></div>
    <details><summary>Clientes incluídos ({ids.length})</summary><button type="button" className="btn" onClick={() => setIds(painel.clientes.map(c => c.id))}>Selecionar todos</button><button type="button" className="btn" onClick={() => setIds([])}>Limpar seleção</button><div className="ac-report-clients">{painel.clientes.map(c => <label key={c.id}><input type="checkbox" checked={ids.includes(c.id)} onChange={e => setIds(v => e.target.checked ? [...v, c.id] : v.filter(id => id !== c.id))} />{c.name}</label>)}</div></details>
    {!valido && <p role="alert">Confira o período do relatório.</p>}{erro && <p role="alert">{erro}</p>}
    {bloqueado && <p role="status">Salve as alterações da ficha para gerar o relatório atualizado.</p>}
    {relatorio && <>
      <p className="ac-report-summary">{relatorio.itens.length} clientes · {relatorio.itens.filter(i => i.atualizada).length} com revisão no período · {relatorio.itens.filter(i => !i.atualizada).length} sem revisão no período · {relatorio.itens.reduce((n, i) => n + i.atrasadas, 0)} ações vencidas</p>
      <p>O balanço é informado pela equipe. Dados ausentes aparecem como pendência. Revisões anteriores ficam identificadas. Este botão consolida as fichas e não atualiza as integrações nem envia o arquivo automaticamente.</p>
      <div className="ac-report-preview">{relatorio.itens.map(item => <details key={item.cliente.id}><summary>{item.cliente.name} · {item.atualizada ? item.revisao?.dados.balanco ?? 'Sem conclusão' : 'Revisão pendente'}</summary>
        {!item.atualizada && <p>{item.revisao ? `Última revisão em ${item.revisao.data}, fora do período escolhido.` : 'Sem revisão registrada.'}</p>}
        <p>{item.faltas.length ? `Campos a conferir: ${item.faltas.join(', ')}.` : 'Campos do relatório preenchidos.'}</p>
        {secoesDoCliente(item).map(s => <div key={s.titulo}><h4>{s.titulo}</h4><p>{s.texto}</p></div>)}
        {item.revisao?.dados.acoes.map(a => <p key={a.id}><b>{a.titulo}</b> · {a.estado} · {a.responsavel || 'Responsável a definir'} · {a.prazo || 'Prazo a definir'}<br />Conclusão: {a.criterio || 'A definir'}<br />Resultado: {a.resultado || 'Ainda não registrado'}</p>)}
        {item.tarefas.map(t => t.tarefa_url && <p key={t.acao_id}><a href={t.tarefa_url} target="_blank" rel="noreferrer">Tarefa no ClickUp</a></p>)}
        {item.revisao?.dados.fontes.map((url, i) => <p key={url}><a href={url} target="_blank" rel="noreferrer">Fonte {i + 1}</a></p>)}
      </details>)}</div>
    </>}
  </section>;
}
