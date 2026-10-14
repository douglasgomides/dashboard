# Checklist de QA responsivo

Como testar: `npm run dev` e abrir no DevTools (modo dispositivo) em cada largura.
Sem login, a casca do app (menu, cabeçalho, abas, barra inferior) com dados de exemplo
fica em `/qa/layout?p=/posts` (troque `p` pela tela simulada; `&admin=0` mostra a visão
do cliente). Essa página só existe em desenvolvimento: no build de produção ela não
renderiza nada e o conteúdo de exemplo nem entra no pacote.

Larguras: **360** (Android pequeno) · **375** (iPhone SE/13 mini) · **414** (iPhone Plus) ·
**768** (tablet em pé) · **1024** (tablet deitado / notebook pequeno) · **1280** (notebook).

Corte de layout: até 820px = celular/tablet (cabeçalho compacto + barra inferior);
acima de 820px = computador (barra lateral). Abaixo de 640px valem as regras de
"celular" (fonte maior, tabelas em cartões).

## Itens e critérios

| # | Item | Passa quando | Falha quando |
|---|------|--------------|--------------|
| 1 | Sem rolagem lateral | `document.documentElement.scrollWidth === clientWidth` em toda tela | qualquer pixel de rolagem lateral na página |
| 2 | Largura do conteúdo | no celular o conteúdo ocupa a largura toda menos 16px de cada lado | sobra faixa vazia à direita ou o conteúdo fica "estreito" |
| 3 | Navegação principal | ≤820px: barra inferior com Resumo, Conteúdo, Anúncios, Comercial, Ideias e Mais; >820px: barra lateral com as 5 áreas + descrição curta + "Avançado" recolhido | mais de 5 áreas, item sem rótulo, ou "Avançado" aberto sem pedir |
| 4 | Abas da área | aparecem quando a área tem 2+ telas; no celular rolam de lado (única rolagem lateral permitida) e a aba ativa fica destacada | aba ativa errada, abas quebram em várias linhas no celular |
| 5 | Regras de visibilidade | telas com `fonte` somem sem a fonte; telas `admin` só para a equipe; cliente "só CRM" vê só o Comercial | item que leva a tela vazia ou de outra pessoa |
| 6 | Cabeçalho do celular | fixo no topo: foto/nome do cliente, situação dos dados, botão do período | cabeçalho rola junto ou ocupa mais de ~110px |
| 7 | Período no celular | o botão abre uma folha de baixo com os períodos em botões grandes e o detalhe "Dados: …" | seletor pequeno, folha não fecha (Esc, toque fora, X) |
| 8 | "Mais" | abre folha com Avançado (equipe), trocar de cliente (equipe), Claro/Escuro e Sair | cliente sem acesso ao Sair |
| 9 | Alvos de toque | todo botão, link, aba, filtro e select ≥44px de altura em ≤820px | qualquer controle < 44px |
| 10 | Gráficos | cabem no cartão (largura = cartão), eixo X com poucas datas sem sobrepor, primeira e última sempre visíveis, legenda quebra linha | gráfico corta, empurra a página, datas encavaladas |
| 11 | Tabelas | <640px: viram cartões empilhados (rótulo à esquerda, valor à direita) ou rolam só dentro do cartão com aviso "Arraste para o lado →" | tabela espremida ilegível ou rolando a página toda |
| 12 | Cartões | uma coluna no celular; 2+ colunas só quando cabe | dois cartões espremidos lado a lado em 375px |
| 13 | Leitura | corpo ≥14px no celular; textos de apoio ≥12px | parágrafo principal < 14px |
| 14 | Métricas iguais | celular e computador mostram exatamente os mesmos números e cartões (só muda a disposição) | número escondido no celular |
| 15 | Impressão | menu, abas, barra inferior e folhas somem no PDF/impressão | navegação aparece no PDF |

## Resultados (13/10/2026, Chromium do Playwright 1.56)

Medição automática em `/qa/layout?p=/posts` (dados de exemplo: 4 KPIs, 3 InsightCards,
2 gráficos de 90 dias, 1 tabela, 1 lista de limitações) e nas rotas reais com o
Supabase simulado (respostas vazias): Resumo, Conteúdo, Posts, Público, Anúncios,
Funil, Ideias, Conversas e login.

| # | 360 | 375 | 414 | 768 | 1024 | 1280 | Observação |
|---|-----|-----|-----|-----|------|------|------------|
| 1 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | scrollWidth = largura em todas as telas medidas |
| 2 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `.mainwrap` 360/375/414/768 px com padding 16px; no computador fica centralizado (máx. 1260px) |
| 3 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | barra inferior até 820px, barra lateral acima |
| 4 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | testado em Posts (Conteúdo) e Resumo/Relatório |
| 5 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | mesma regra de antes, agora em `src/lib/nav.ts` (revisado no código; mock com todas as fontes) |
| 6 | ✅ | ✅ | ✅ | ✅ | — | — | só no layout celular |
| 7 | ✅ | ✅ | ✅ | ✅ | — | — | escolher um período troca o endereço (`?preset=`) e fecha a folha |
| 8 | ✅ | ✅ | ✅ | ✅ | — | — | |
| 9 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | 0 controles < 44px até 820px. No computador (mouse) alguns ficam compactos de propósito: select do período 36px, "Ver evidência" 36px, "i" 24px |
| 10 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | gráfico = largura do cartão (294 px em 360); 10 datas no eixo em 360 contra 17 em 1280 |
| 11 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | cartões empilhados <640px; acima disso, tabela normal |
| 12 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 1 cartão por linha até 414; 2 em 768+ |
| 13 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | corpo 14–15px; menor texto medido 12,5px (legendas) no celular |
| 14 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | nenhum conteúdo é escondido por largura; só a navegação muda |
| 15 | — | — | — | — | — | ✅ | regras de `@media print` atualizadas (não testado em PDF real) |

### Causa da "tela estreita com espaço vazio no celular"

1. `.app{grid-template-columns:232px 1fr}`: `1fr` deixa a coluna crescer até o item mais
   largo; qualquer tabela ou gráfico largo fazia a página toda rolar de lado e o
   navegador do celular reduzia o zoom (conteúdo estreito, faixa vazia). Agora
   `minmax(0,1fr)` em todas as larguras.
2. Grades com largura mínima fixa maior que a tela (Conteúdo: `minmax(340px,1fr)` estoura
   em 360px) → `minmax(min(340px,100%),1fr)`.
3. Gráfico de Público com largura mínima de 22px por dia (90 dias = 1.980px) → o gráfico
   agora cabe no cartão.
4. Regras de botão/select fora de `@layer` venciam as classes do Tailwind: todos os
   botões e filtros saíam com 16px e sem a borda pedida. Movidas para `@layer base`.

### Não testado / limites

- Telas com dados reais não foram vistas (sem credenciais); as rotas reais foram
  renderizadas com respostas vazias, então tabelas e gráficos de verdade só foram
  conferidos na página de QA e no código.
- Safari/iOS real não testado (só Chromium); `env(safe-area-inset-bottom)` aplicado
  para o iPhone com "notch".
- As telas reservadas a outros agentes (Resumo, Relatório, Anúncios, Funil, Jornada,
  Ideias, Dúvidas) não tiveram ajustes internos; só herdam a casca e o CSS global.
