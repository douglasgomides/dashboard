# Inventário: Marketing, Instagram (plano 03.1-05)

Conferido contra os arquivos de rota em 10/11/2026 (varredura de imports de `scripts/test-telas-inventario.ts --listar` e leitura de cada rota).
Contrato do molde: `docs/redesenho/molde-da-pagina.md`. Pergunta e Decisão são proposta; a seção confirma ao refazer a tela.
A coluna "Depois" fica vazia até a seção desenhar o cartão no molde novo. O cartão de projeção em 30 dias é previsão: a leitura nunca o cita.

## Telas

| Rota | Tela | Pergunta | Decisão | Estado | Plano | Exceção | Conferido |
|---|---|---|---|---|---|---|---|
| /_authenticated/$clientId/conteudo | Analisar desempenho | O perfil está crescendo e o que alcança mais gente? | D3 | pendente | 03.1-05 | | |
| /_authenticated/$clientId/top | Encontrar destaques | Quais publicações mais se destacaram e por quê? | D3 | pendente | 03.1-05 | | |
| /_authenticated/$clientId/posts | Consultar publicações | O que foi publicado e como cada post foi? | D3 | pendente | 03.1-05 | | |
| /_authenticated/$clientId/audiencia | Público do Instagram | Quem acompanha o perfil e quando está online? | | pendente | 03.1-05 | | |
| /_authenticated/$clientId/conteudo-comercial | Conteúdo × Comercial | O conteúdo está trazendo conversa e agendamento? | D3 | pendente | 03.1-05 | | |

## Cartões e blocos

| Rota | Card ou bloco | Antes | Depois | Plano |
|---|---|---|---|---|
| /_authenticated/$clientId/conteudo | Seguidores hoje e variação no período | NxKpi | | 03.1-05 |
| /_authenticated/$clientId/conteudo | Projeção em 30 dias | NxKpi · previsão | | 03.1-05 |
| /_authenticated/$clientId/conteudo | Formato que mais alcança | NxKpi com IconeFormato | | 03.1-05 |
| /_authenticated/$clientId/conteudo | Evolução de seguidores | NxCard com IgLinhaSeguidores | | 03.1-05 |
| /_authenticated/$clientId/conteudo | Crescimento bruto e líquido | NxCard com IgColunasSaldo e SeguidoresSemana | | 03.1-05 |
| /_authenticated/$clientId/conteudo | Alcance mediano por formato | NxCard com TabelaGrupo · tabela crua | | 03.1-05 |
| /_authenticated/$clientId/conteudo | Alcance por pilar ou tema | NxCard com TabelaGrupo · tabela crua | | 03.1-05 |
| /_authenticated/$clientId/conteudo | Seguidores vindos de anúncio | SeguidoresImpulsionados · Recharts, tabela crua e Painel de visual.tsx | | 03.1-05 |
| /_authenticated/$clientId/conteudo | O que isso quer dizer | IgLeitura e IgNota | | 03.1-05 |
| /_authenticated/$clientId/conteudo | Como ler cada gráfico | IgMetodo | | 03.1-05 |
| /_authenticated/$clientId/conteudo | Sem fonte do Instagram | SemFonte · peça congelada do SAP | | 03.1-05 |
| /_authenticated/$clientId/top | Pódio dos 3 primeiros | NxCard com IgVitrine | | 03.1-05 |
| /_authenticated/$clientId/top | Distância entre os primeiros | NxCard com NxColunas | | 03.1-05 |
| /_authenticated/$clientId/top | O que os melhores têm em comum | IgNota e ListaDePosts | | 03.1-05 |
| /_authenticated/$clientId/top | Do 4º ao último lugar | NxListRow com Miniatura | | 03.1-05 |
| /_authenticated/$clientId/top | Stories guardados e no ar agora | NxCard com NxListRow | | 03.1-05 |
| /_authenticated/$clientId/top | Posts ou Reels no período | NxKpi | | 03.1-05 |
| /_authenticated/$clientId/top | Sem dado do Instagram | SemFonte · peça congelada do SAP | | 03.1-05 |
| /_authenticated/$clientId/posts | Posts no período, salvamentos e engajamento | NxKpi | | 03.1-05 |
| /_authenticated/$clientId/posts | Top 5 do período | Painel · cartão Tailwind | | 03.1-05 |
| /_authenticated/$clientId/posts | Ranking de posts | Painel · cartão Tailwind com tabela | | 03.1-05 |
| /_authenticated/$clientId/posts | O que repetir e o que revisar | Painel · cartão Tailwind | | 03.1-05 |
| /_authenticated/$clientId/posts | Conceitos vencedores | Painel · cartão Tailwind | | 03.1-05 |
| /_authenticated/$clientId/posts | Salvamentos por tema e formato | Painel · cartão Tailwind com BarraFina | | 03.1-05 |
| /_authenticated/$clientId/posts | Melhores ganchos e retenção dos reels | Painel · cartão Tailwind | | 03.1-05 |
| /_authenticated/$clientId/posts | Próximos ângulos | Painel · cartão Tailwind | | 03.1-05 |
| /_authenticated/$clientId/posts | Explorador de posts | Painel com Selo e IconeFormato | | 03.1-05 |
| /_authenticated/$clientId/audiencia | Idade e gênero dos seguidores | NxCard com IgBarras e NxPizza | | 03.1-05 |
| /_authenticated/$clientId/audiencia | Seguidores × alcançados | NxCard com Recharts (BarChart) | | 03.1-05 |
| /_authenticated/$clientId/audiencia | Origem das visualizações | NxCard com IgDividida | | 03.1-05 |
| /_authenticated/$clientId/audiencia | Seguiu × deixou de seguir | NxCard com NxKpi | | 03.1-05 |
| /_authenticated/$clientId/audiencia | Interações por dia | NxCard com NxColunas | | 03.1-05 |
| /_authenticated/$clientId/audiencia | Seguidores online por dia e hora | NxCard com MapaDeCalor | | 03.1-05 |
| /_authenticated/$clientId/audiencia | Onde moram os seguidores | NxCard com MapaBrasil e MapaMundo | | 03.1-05 |
| /_authenticated/$clientId/audiencia | O que isso quer dizer | IgLeitura e IgNota | | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Pessoas que chamaram e conversas novas | NxKpi | | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Posts e conversas por dia | NxCard com NxLinhaTempo | | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | O que os números dizem | IgLeitura | | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Tema do post × assunto da conversa | NxCard com tabela crua | | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Dia da semana e hora | NxCard com tabela crua | | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Posts que atraem quem quer comprar | NxCard com NxListRow e Miniatura | | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Etapa do funil por semana | NxCard com tabela crua | | 03.1-05 |
| /_authenticated/$clientId/conteudo-comercial | Objeções que aparecem nas conversas | NxCard com IgBarras | | 03.1-05 |
