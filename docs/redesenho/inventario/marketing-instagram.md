# Inventário: Marketing, Instagram (plano 03.1-05)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. As 5 telas estão no molde novo: `PaginaNexo` com a leitura por regra no topo (`LeituraDaTela`), até 4 cartões, um gráfico e o resto em Detalhes.
O cartão de projeção em 30 dias é previsão: saiu dos cartões e a leitura nunca o cita; a estimativa fica só como linha tracejada no gráfico de seguidores, dentro da própria tela.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/conteudo | Analisar desempenho | O perfil está crescendo e o que alcança mais gente? | D3 | novo | 03.1-05 | | 10/11/2026 |
| /_authenticated/$clientId/top | Encontrar destaques | Quais publicações mais se destacaram e por quê? | D3 | novo | 03.1-05 | | 10/11/2026 |
| /_authenticated/$clientId/posts | Consultar publicações | O que foi publicado e como cada post foi? | D3 | novo | 03.1-05 | | 10/11/2026 |
| /_authenticated/$clientId/audiencia | Público do Instagram | Quem acompanha o perfil e quando está online? | | novo | 03.1-05 | | 10/11/2026 |
| /_authenticated/$clientId/conteudo-comercial | Conteúdo × Comercial | O conteúdo está trazendo conversa e agendamento? | D3 | novo | 03.1-05 | | 10/11/2026 |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/conteudo | Seguidores hoje e variação no período | NxKpi | Dois NxKpi nos cartões: Seguidores hoje e Variação no período | 03.1-05 |
| /_authenticated/$clientId/conteudo | Projeção em 30 dias | NxKpi · previsão | Saiu dos cartões; a leitura não o cita; a estimativa fica só tracejada no gráfico de evolução | 03.1-05 |
| /_authenticated/$clientId/conteudo | Formato que mais alcança | NxKpi com IconeFormato | NxKpi nos cartões, com o alcance mediano ao lado | 03.1-05 |
| /_authenticated/$clientId/conteudo | Evolução de seguidores | NxCard com IgLinhaSeguidores | Gráfico principal da página, em NxCard com IgLinhaSeguidores e avisos de dado em NxAviso | 03.1-05 |
| /_authenticated/$clientId/conteudo | Crescimento bruto e líquido | NxCard com IgColunasSaldo e SeguidoresSemana | Dentro de Detalhes, com NxKpi, IgColunasSaldo e SeguidoresSemana | 03.1-05 |
| /_authenticated/$clientId/conteudo | Alcance mediano por formato | NxCard com TabelaGrupo · tabela crua | NxTabela dentro de NxRecolhido, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/conteudo | Alcance por pilar ou tema | NxCard com TabelaGrupo · tabela crua | NxTabela dentro de NxRecolhido, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/conteudo | Seguidores vindos de anúncio | SeguidoresImpulsionados · Recharts, tabela crua e Painel de visual.tsx | SeguidoresSemana no desenho nx (03.1-04), em Detalhes | 03.1-05 |
| /_authenticated/$clientId/conteudo | O que isso quer dizer | IgLeitura e IgNota | LeituraDaTela no topo da página, por regra | 03.1-05 |
| /_authenticated/$clientId/conteudo | Como ler cada gráfico | IgMetodo | NxComoCalcula recolhido dentro de cada cartão | 03.1-05 |
| /_authenticated/$clientId/conteudo | Sem fonte do Instagram | SemFonte · peça congelada do SAP | NxVazio com o que falta, quem resolve e "Sem leitura:" na leitura | 03.1-05 |
| /_authenticated/$clientId/top | Pódio dos 3 primeiros | NxCard com IgVitrine | NxCard com IgVitrine no corpo da página | 03.1-05 |
| /_authenticated/$clientId/top | Distância entre os primeiros | NxCard com NxColunas | Gráfico principal da página (NxColunas) | 03.1-05 |
| /_authenticated/$clientId/top | O que os melhores têm em comum | IgNota e ListaDePosts | NxCard com lista de padrões e NxAviso, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/top | Do 4º ao último lugar | NxListRow com Miniatura | NxListRow com Miniatura dentro de NxRecolhido, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/top | Stories guardados e no ar agora | NxCard com NxListRow | Guardados no corpo e "No ar agora" em Detalhes, com NxCarregando, NxAviso e NxErro | 03.1-05 |
| /_authenticated/$clientId/top | Posts ou Reels no período | NxKpi | Três NxKpi nos cartões | 03.1-05 |
| /_authenticated/$clientId/top | Sem dado do Instagram | SemFonte · peça congelada do SAP | NxVazio com o que falta e quem resolve | 03.1-05 |
| /_authenticated/$clientId/posts | Posts no período, salvamentos e engajamento | NxKpi | Quatro NxKpi nos cartões | 03.1-05 |
| /_authenticated/$clientId/posts | Top 5 do período | Painel · cartão Tailwind | NxCard com IgVitrine no corpo da página | 03.1-05 |
| /_authenticated/$clientId/posts | Ranking de posts | Painel · cartão Tailwind com tabela | NxTabela com Miniatura, NxTag e o botão Classificar no corpo da página | 03.1-05 |
| /_authenticated/$clientId/posts | O que repetir e o que revisar | Painel · cartão Tailwind | NxCard com NxHBar dentro de Mais análises, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/posts | Conceitos vencedores | Painel · cartão Tailwind | NxCard com NxListRow dentro de Mais análises, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/posts | Salvamentos por tema e formato | Painel · cartão Tailwind com BarraFina | NxCard com NxHBar dentro de Mais análises, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/posts | Melhores ganchos e retenção dos reels | Painel · cartão Tailwind | NxCard com NxListRow e NxKpi dentro de Mais análises, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/posts | Próximos ângulos | Painel · cartão Tailwind | NxCard com lista de ângulos dentro de Mais análises, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/posts | Explorador de posts | Painel com Selo e IconeFormato | NxCard com galeria em CSS próprio e NxTabela, dentro de NxRecolhido, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/audiencia | Idade e gênero dos seguidores | NxCard com IgBarras e NxPizza | Idade como gráfico principal (NxColunas); gênero em NxPizza dentro de Detalhes | 03.1-05 |
| /_authenticated/$clientId/audiencia | Seguidores × alcançados | NxCard com Recharts (BarChart) | NxCard com BarrasPareadas em tokens, sem Recharts, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/audiencia | Origem das visualizações | NxCard com IgDividida | NxCard com IgBarras e IgDividida em Detalhes | 03.1-05 |
| /_authenticated/$clientId/audiencia | Seguiu × deixou de seguir | NxCard com NxKpi | NxCard com NxKpi em Detalhes; o saldo também é cartão e fato da leitura | 03.1-05 |
| /_authenticated/$clientId/audiencia | Interações por dia | NxCard com NxColunas | NxCard com NxLinhaTempo (uma linha por tipo de interação), sem Recharts, em Detalhes | 03.1-05 |
| /_authenticated/$clientId/audiencia | Seguidores online por dia e hora | NxCard com MapaDeCalor | NxCard com MapaDeCalor em tokens (rampa b6 a b1), em Detalhes | 03.1-05 |
| /_authenticated/$clientId/audiencia | Onde moram os seguidores | NxCard com MapaBrasil e MapaMundo | NxCard com MapaBrasil e MapaMundo em tokens (rampa b6 a b1), em Detalhes | 03.1-05 |
| /_authenticated/$clientId/audiencia | O que isso quer dizer | IgLeitura e IgNota | LeituraDaTela no topo; as frases de cada aba ficam em "Em palavras simples" dentro de Detalhes | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Pessoas que chamaram e conversas novas | NxKpi | Quatro NxKpi nos cartões | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Posts e conversas por dia | NxCard com NxLinhaTempo | Gráfico principal da página (NxLinhaTempo) | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | O que os números dizem | IgLeitura | LeituraDaTela no topo; a origem por post sai como "Sem leitura: origem por post não medida" | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Tema do post × assunto da conversa | NxCard com tabela crua | NxTabela em Detalhes | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Dia da semana e hora | NxCard com tabela crua | NxTabela com células coloridas em Detalhes | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Posts que atraem quem quer comprar | NxCard com NxListRow e Miniatura | NxCard com NxListRow e Miniatura em Detalhes | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Etapa do funil por semana | NxCard com tabela crua | NxTabela em Detalhes | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Objeções que aparecem nas conversas | NxCard com IgBarras | NxCard com IgBarras em Detalhes | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Tempo da primeira resposta × agendamento | NxCard com barras e tabela crua | NxCard com barras e NxTabela em Detalhes | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Tema da conversa × venda fechada no CRM | NxCard com tabela crua | NxTabela em Detalhes | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | O que mais pedem nas conversas | NxCard com IgBarras | NxCard com IgBarras em Detalhes | 03.1-05 |
