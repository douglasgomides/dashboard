# Matriz de rastreabilidade: Dúvidas, Ideias, Relatório, Inspiração, Admin, casca e navegação

Auditoria só de leitura. Nenhum arquivo de código foi alterado.

- **Baseline:** commit `477eb43` ("Conferência de dados + métricas do jeito do Instagram"), antes desta sessão.
- **Atual:** `HEAD` = `68c0e40`. No fim desta auditoria apareceram na árvore de trabalho alterações feitas por outra sessão (`src/lib/insight.ts` modificado e `src/components/resumo-do-mes.tsx` de volta, sem commit). Elas não fazem parte desta matriz.
- **Commits entre os dois que mexem no escopo:** `a77c5c9` (datas no fuso de Brasília, PDF, "Este mês"), `3ada73b` (navegação em 5 áreas e casca responsiva), `a89548f` (Central de voz do paciente), `246e21f` (Relatório em 3 versões: WhatsApp, executiva e PDF).
- **Arquivos do escopo idênticos ao baseline** (`git diff 477eb43 HEAD` vazio): `_authenticated.$clientId.inspiracao.tsx`, `_authenticated.admin.tsx`, `_authenticated.admin.index.tsx`, `_authenticated.admin.$clientId.tsx`, `_authenticated.admin.conferencia.tsx`, `_authenticated.admin.referencia.tsx`, `_authenticated.index.tsx`, `_authenticated.tsx`, `login.tsx`, `reset-password.tsx`, `sem-acesso.tsx`, `components/client-avatar.tsx`, `components/client-profile-form.tsx`, `components/theme-menu.tsx`, `lib/pdf-report.tsx`.

Legenda de status: **MANTIDO** · **MOVIDO** · **ALTERADO (aparência)** · **ALTERADO (regra/cálculo)** · **REMOVIDO** · **NOVO** (não existia no baseline; listado para completar o quadro).

---

## 1. Casca, navegação e cabeçalho do cliente

Baseline: tudo em `src/routes/_authenticated.$clientId.tsx` (355 linhas). Atual: a rota (139 linhas) passa os dados para `src/components/app-shell.tsx` e a configuração do menu fica em `src/lib/nav.ts`.

### 1.1 Itens de navegação e regras de visibilidade

| Elemento | Tipo | Definição no baseline (`_authenticated.$clientId.tsx`) | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Grupo "Portfólio": Visão geral → `/admin` | nav | L61, `admin: true` | Avançado → "Admin · Portfólio" (`nav.ts` L118, `absoluto`) | MOVIDO | Os dois atalhos para `/admin` (L61 e L82) viraram um só. |
| Grupo "Sistema": Admin → `/admin` | nav | L82, `admin: true` | o mesmo item acima | MOVIDO | Junto com o anterior. |
| Título de grupo "Cliente · {nome}" | nav | L63 | — | REMOVIDO | Era só um rótulo; o nome continua no cabeçalho. |
| Resultado → `/$clientId` (exact) | nav | L65 | Área "Resumo", aba "Resumo" (`nav.ts` L62) | MOVIDO | Mudou de nome: "Resultado" virou "Resumo". |
| Conteúdo → `/conteudo` | nav | L66 | Área "Conteúdo", aba "Visão" (L72) | MOVIDO | A aba se chama "Visão". |
| Posts → `/posts` (fonte instagram) | nav | L67 | Conteúdo › "Posts" (L73) | MOVIDO | Regra igual. |
| Top conteúdos → `/top` (instagram) | nav | L68 | Conteúdo › "Melhores" (L74) | MOVIDO | Mudou de nome. |
| Audiência → `/audiencia` (instagram) | nav | L69 | Conteúdo › "Público" (L75) | MOVIDO | Mudou de nome. |
| Anúncios → `/anuncios` (anuncios) | nav | L70 | Área "Anúncios", 1 aba (L83) | MOVIDO | A área some quando não há fonte de anúncios, como antes. |
| Comercial → `/crm-painel` (crm) | nav | L71 | Área "Comercial" › "Funil" (L91) | MOVIDO | A tela virou a aba "Funil". |
| WhatsApp → `/atendimento` (atendimento) | nav | L72 | Comercial › "WhatsApp" (L92) | MOVIDO | |
| Jornada → `/jornada` (admin) | nav | L73 | Comercial › "Jornada" (L93, admin) | MOVIDO | |
| Conversas → `/conversas` (admin + atendimento) | nav | L74 | Avançado › "Conversas" (L111) | MOVIDO | Fica recolhido no Avançado. |
| Dúvidas → `/duvidas` (instagram) | nav | L75 | Área "Ideias" › "Dúvidas dos pacientes" (L103) | MOVIDO | |
| Ideias → `/ideias` | nav | L76 | Área "Ideias" › "Ideias" (L102) | MOVIDO | |
| Relatório → `/relatorio` | nav | L77 | Área "Resumo" › "Relatório" (L63) | MOVIDO | Também tem um botão "Montar relatório para o cliente" no Resumo (`index.tsx` L523). |
| A analisar → `/analisar` (admin + crm) | nav | L78 | Avançado › "A analisar" (L112) | MOVIDO | |
| Biblioteca: Inspiração → `/inspiracao` | nav | L81 | Área "Ideias" › "Inspiração" (L104) | MOVIDO | |
| `/crm-estrutura`, `/vendas-kommo` | nav | **sem item de menu** (só pelo endereço) | Avançado (L113–L114, admin + crm) | NOVO (caminho de acesso) | Antes não havia link para elas em nenhum lugar do `src`. |
| `/vendas`, `/consultas`, `/automacoes` | nav | **sem item de menu** | Avançado (L115–L117, admin) | NOVO (caminho de acesso) | Para quem não é admin, continuam acessíveis só pelo endereço, como no baseline. |
| Regra `admin` | regra | L145 `!it.admin \|\| isAdmin` | `tabVisivel` (`nav.ts` L142) | MANTIDO | Mesma expressão. |
| Regra `fonte` (aba só aparece com a fonte conectada; enquanto carrega, mostra tudo) | regra | `fonteOk` L99–106 | `fonteOk` (`nav.ts` L126–133) | MANTIDO | Lógica idêntica. |
| Regra do cliente só com CRM (lista `CLIENTES_SO_CRM` e redirecionamento para `/crm-painel` fora de `ROTAS_DO_CRM`) | regra | L47–48, L108–115, filtro L147 | `nav.ts` L123–124 + rota L34–41 + `tabVisivel` | MANTIDO | Mesmo ID (Dra. Fernanda Nunes), mesmas rotas e mesmo filtro (`!soCrm \|\| admin \|\| fonte==="crm"`). |
| Área esconde quando não sobra aba visível | regra | grupo vazio some (L149) | `areasVisiveis` (L147–149) | MANTIDO | |
| Item da área leva à 1ª aba visível | nav | — | `primeira()` (`app-shell.tsx` L66) | NOVO | |
| Abas da área (desktop: linha abaixo do cabeçalho; celular: controle que rola de lado) | nav | — | `AreaTabs` (L115–128) | NOVO | Só aparecem quando a área tem 2 ou mais abas visíveis. |
| Frase da área ("O que aconteceu e o que fazer esta semana"…) | insight-texto | — | `.areadesc` (L245–250) | NOVO | Escondida na impressão. |
| Item ativo (`aria-current`) | nav | `activeProps` L161 | `data-on` + `aria-current` exato (L50) | ALTERADO (aparência) | A área inteira fica acesa em qualquer uma das suas abas. |
| Navegação no celular | nav | Gaveta lateral (hambúrguer) L216–248 com o menu completo, os botões de tema e Sair | Barra inferior com as 5 áreas + "Mais" (L256–267); folha "Mais" (L281–313) | ALTERADO (aparência) | O hambúrguer deixou de existir. Tudo o que estava na gaveta tem caminho: áreas e abas, Avançado, tema e Sair na folha "Mais". |
| Marca "Intelligence Hub" + logo | aviso-estado | Barra lateral L181–186 e gaveta L224–229 | Só na barra lateral (L169–174) | ALTERADO (aparência) | No celular a marca não aparece mais (era só no topo da gaveta). |
| Rodapé "Intelligence Hub · Doctor Creator" | aviso-estado | L206 | L206 | MANTIDO | Só no computador, como antes (a gaveta não tinha). |

### 1.2 Elementos do cabeçalho do cliente

| Elemento | Tipo | Baseline | Agora, computador | Agora, celular | Status | Observação |
|---|---|---|---|---|---|---|
| Foto/avatar (`ClientAvatar`) | aviso-estado | L262, 46px, um cabeçalho só para todas as larguras | `.top` L230 (46px) | `.mhead` L214 (32px) e folha "Mais" L283 (40px) | MANTIDO | |
| Nome do cliente | aviso-estado | L264 (h1) | L232 | L216 (negrito, cortado com "…") e "Mais" L285 | MANTIDO | |
| Especialidade · @instagram | aviso-estado | L265–270 | L233 (`linhaInfo`) | Só na folha "Mais" (L286) | MOVIDO (celular) | Saiu do cabeçalho fixo do celular. |
| Selo "CFM em conformidade" (`cfm_score_status === "verde"`, com a dica "Status definido pela equipe…") | aviso-estado | L273–277 | L236 | Só na folha "Mais" (L289) | MOVIDO (celular) | Mesmo texto e mesma regra. |
| Estado de cada integração e data do último dado (`SyncFreshnessBadge`: Instagram / Anúncios / CRM / WhatsApp até dd/mm, cor por atraso, Comentários só se der erro) | aviso-estado | L278 | L237 (completo) | Versão compacta no cabeçalho (`compacto`: um ponto com a cor da pior fonte e a frase "Dados em dia / com atraso / parados"; o detalhe fica no `title` e em `sr-only`) + versão completa na folha "Período" (L278) | ALTERADO (aparência) | No celular, as datas de cada fonte saíram da tela inicial e ficaram a 1 toque, na folha do período. A regra de cor (≤1 dia, 2–3, >3 ou erro) não mudou. |
| Seletor de período | seletor | `DateRangePicker` L280–283, com `<select>` | L239 (`<select>`, altura 44px no celular e 36px a partir de 821px) | Botão `periodo-chip` com o rótulo (L219–222), que abre a folha "Período" com a lista de botões (`variante="lista"`) | ALTERADO (aparência) | Mesmo parâmetro de busca (`preset/from/to`) e mesmo padrão `90d`. |
| Opções do período: Este mês, Últimos 7 / 30 / 90 dias, Últimos 6 meses, Último ano, Personalizado (De/Até) | filtro | `date-range.ts` `RANGE_PRESETS` | igual | igual (grade de 2 colunas; a folha fecha ao escolher, menos em Personalizado) | MANTIDO (lista) / ALTERADO (regra) "Este mês" | `a77c5c9`: "Este mês" agora vai do dia 1 até **hoje**, e não mais até o último dia do mês. Isso muda o período anterior usado na comparação. |
| "Sobre o período" (aviso de histórico curto da conta Meta) | aviso-estado | `date-range-picker.tsx` L79–83 (baseline) | `sobre`, nas duas variantes | dentro da folha "Período" | MANTIDO | Mesmo texto. No celular, a área de toque é de 44px. |
| Ação de sincronizar/atualizar | ação-botão | Não ficava no cabeçalho; estava em cada página (`SyncButton`) | igual (nas páginas) | igual | MANTIDO | Veja 1.3. |
| Tema claro/escuro | ação-botão | Rodapé da barra lateral L197–204 e da gaveta L236–243 | Rodapé da barra lateral (`TemaBotoes`, L204) | Folha "Mais" › "Aparência" (L310–311) | MANTIDO / MOVIDO (celular) | `ThemeMenu` (`components/theme-menu.tsx`) não era usado no baseline e continua sem uso. |
| Buscar cliente (Ctrl/Cmd+K, só admin, paleta com até 40 resultados por nome, especialidade ou @; Enter abre o 1º) | ação-botão | Botão `kbar` L187–194 + atalho L123–136 + `ClientPalette` L294–355 | `kbar` L175–182 + atalho na rota L46–56 + `ClientPalette` (idêntica) | "Trocar de cliente" na folha "Mais" (L290–301) | MANTIDO | No baseline, o celular não tinha a busca (a gaveta não mostrava o `kbar`). Agora tem. |
| Sair (logout) | ação-botão | Barra lateral L205 e gaveta L244 | Barra lateral L205 | Folha "Mais" (L312, em vermelho) | MANTIDO / MOVIDO (celular) | `LogoutButton` só ganhou a prop `className`. |
| Esc fecha a paleta e a gaveta | regra | L129–132 | Fecha a paleta (rota L52) e as folhas (`BottomSheet` L73) | igual | MANTIDO | |
| Impressão | regra | Esconde aside, `.who` etc. | Também esconde `.mhead`, `.bottomnav`, `.dtabs`, `.areadesc`, `.sheet` | — | MANTIDO | |
| Página de teste da casca `/qa/layout` | nav | — | `qa.layout.tsx` (renderiza só com `import.meta.env.DEV`) | — | NOVO | Em produção a rota existe, mas mostra uma tela vazia. |

### 1.3 Componentes

| Componente | Mudança | Status |
|---|---|---|
| `sync-button.tsx` | Só aparência: altura mínima de 44px no celular e `minWidth: min(260px,100%)`. Os alvos, as frases e o fluxo não mudaram. | ALTERADO (aparência) |
| Onde há `SyncButton` | Dúvidas (`comentarios`), Anúncios, Atendimento, CRM, Posts e Conteúdo continuam. No Resumo (`index.tsx`), o botão "tudo" saiu do topo e foi para o fim da página (L567). O botão "tudo" do estado "Sem dados sincronizados nesse período" (baseline L364) **não existe mais**, porque a tela foi reescrita. O "histórico" (só admin) continua, agora dentro dos alertas de cobertura (L406–410). | MOVIDO / REMOVIDO (estado vazio do Resumo) |
| `date-range-picker.tsx` | Nova `variante="lista"`, `rotuloPeriodo()`, campos de 44px e `aria-label`. | ALTERADO (aparência) |
| `client-avatar.tsx`, `client-profile-form.tsx`, `theme-menu.tsx` | Sem diferença. | MANTIDO |
| `visual.tsx` (`Ajuda`) | A área de toque do "i" passou a 44px no celular; o círculo visível continua igual. | ALTERADO (aparência) |
| `sync-freshness-badge.tsx` | Nova prop `compacto`. | ALTERADO (aparência) |
| `logout-button.tsx` | Nova prop `className`. | ALTERADO (aparência) |

---

## 2. Dúvidas (`/$clientId/duvidas`)

Baseline: 188 linhas. Atual: 345 linhas, "Voz do paciente" (`a89548f`).

| Elemento | Tipo | Definição no baseline | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Fonte dos dados | regra | `getPatientQuestions(clientId)`: `is_question = true`, os 200 mais recentes, **sem filtro de período** (L104–107) | `getComentariosVozDoPaciente(clientId, start, end)`: `is_question = true` **ou** texto com valor/preço/quanto custa/agendar/consulta/atende/convênio, até 1.500, **dentro do período do cabeçalho** (L205–208) | ALTERADO (regra/cálculo) | Agora a tela obedece ao período. Antes mostrava sempre as últimas 200 perguntas. |
| Triagem do "é pergunta?" | regra | `filtrarPerguntas` → `categoriaDoComentario` (`comentarios.ts` baseline) | `analisarVozDoPaciente` (`voz-do-paciente.ts`) | ALTERADO (regra/cálculo) | Veja "Regras alteradas" (R1, R2). |
| Botão Sincronizar comentários | ação-botão | L129–131 | L249–251 | MANTIDO | |
| Aviso de topo ("matéria-prima pra pauta… heurística…") | insight-texto | L132–139 | Explicação `OQueE` (L268–271) + limitação "voz-heuristica" (L217–222) | MOVIDO / ALTERADO (aparência) | |
| Título da página | insight-texto | Não havia `hpagehead` | "Voz do paciente" + período (L232–237) | NOVO | O nome no menu é "Dúvidas dos pacientes". |
| Números: comentários lidos / perguntas reais de N pessoas / ficaram de fora | métrica | — | L253–267 | NOVO | "Pessoas" conta cada @ uma vez. |
| Cards de conclusão (`insightsDaVoz`: preço/agendamento, dúvida que mais se repete, pedidos de dose) | insight-texto | — | L274–280 | NOVO | |
| Bloco "Dúvidas mais repetidas" (agrupamento com Jaccard ≥ 0,4, grupo com 2+ **comentários**, número "N×" = comentários, texto representativo = comentário mais curtido) | tabela/insight | `DuvidasFrequentes` L55–100 | "Dúvidas que mais se repetem (N)", com `GrupoCard` (L293–304) | ALTERADO (regra/cálculo) | O número agora é de **pessoas diferentes**. O grupo tem um nome de assunto ("Cortisol alto e estresse"…) e até 3 exemplos anonimizados, no lugar do comentário inteiro. |
| "Ver/Ocultar os N comentários" do grupo | ação-botão | L80–94 | "Ver os N comentários / Esconder" (L127–157) | MANTIDO | Dentro do grupo, cada comentário aparece com o @ trocado por "@…", a data, o tema do post e o link "Abrir o post para responder". |
| Cartão de pergunta: miniatura do post | tabela | `QuestionCard` L18–20 | — | REMOVIDO | |
| Cartão de pergunta: @ do autor completo | tabela | L24 | Exemplos com `@ab•••` (anonimizado); a lista aberta não mostra o autor | ALTERADO (regra) | Escolha de privacidade. |
| Cartão de pergunta: data, tema do post, "ver post ↗" | tabela | L25–43 | Só nos comentários abertos dentro de um grupo (L145–151) | MOVIDO | Nas perguntas avulsas não aparecem data nem link (veja abaixo). |
| **Lista completa de todas as perguntas** (filtradas, uma por cartão) | tabela | L171–185 | Não há lista única. As perguntas ficam divididas em grupos (abertos sob demanda), "Pedem dose ou remédio" e "Ver as N perguntas que só uma pessoa fez" (L318–339) | ALTERADO (aparência) | As avulsas aparecem sem data, sem tema e sem link do post: só o texto anonimizado, a intenção, o assunto e o aviso de diagnóstico. |
| Busca "Buscar nas perguntas…" (no texto de cada pergunta) | filtro | L144–150, L121–125 | "Buscar nas dúvidas (ex.: cortisol, valor)" (L282–291): procura no rótulo, no resumo e nos textos dos **grupos** | ALTERADO (regra) | A busca **não filtra mais as perguntas avulsas** nem a lista de excluídas. Só aparece quando existe pelo menos 1 grupo. |
| Filtro "Todos os temas" (select por `instagram_posts.tema`) | filtro | L110–118, L151–165, L124 | — | **REMOVIDO** | Não há filtro por tema do post. |
| Contador "N pergunta(s)" | métrica | L166–168 | Substituído pelos 3 números do topo | ALTERADO (aparência) | |
| Estado vazio "Ainda sem comentários sincronizados. O sync de comentários roda no job diário." | aviso-estado | L175–176 | "Nenhum assunto foi perguntado por 2 pessoas diferentes ou mais neste período…" (L297–299) | ALTERADO (aparência) | A explicação sobre o job diário de sincronização saiu. |
| Estado vazio "Nenhuma pergunta encontrada com esses filtros." | aviso-estado | L177 | "Nenhuma dúvida com esse termo." | MANTIDO | |
| Carregando / erro | aviso-estado | "Carregando…" L171–172 | `Carregando` / `ErroCarga` (L239–240) | ALTERADO (aparência) | O baseline não tinha estado de erro. |
| Selo do grupo (Cuidado médico / Responder hoje / Vira conteúdo), pessoas, intenção, potencial de conteúdo, "Chance de virar consulta" | insight-texto | — | `GrupoCard` L66–74 | NOVO | |
| Resposta sugerida + "Copiar resposta" | ação-botão | — | L94–99 | NOVO | |
| Abordagem comercial (no direct) | insight-texto | — | L100–104 | NOVO | |
| Sugestão de post + "Copiar pauta completa" | ação-botão | — | L105–115 | NOVO | |
| Aviso CFM do grupo | aviso-estado | — | L116–124 | NOVO | |
| Seção "Pedem dose ou remédio: responder com cuidado" | tabela | — | L306–316 | NOVO | |
| "Por que N comentários ficaram de fora" (por motivo, até 4 exemplos) | tabela | — | `ForaDaLista` L162–196 | NOVO | |
| Limitações (sem @, profissionais, pouco volume, limite de 1.500, heurística) | aviso-estado | — | `ListaLimitacoes` L342 | NOVO | |

---

## 3. Ideias (`/$clientId/ideias`)

| Elemento | Tipo | Definição no baseline | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Título "Ideias (N)" + período | insight-texto | L118–125 | L174–179 | ALTERADO (aparência) | O texto do subtítulo mudou. |
| Estados: carregando / erro de fontes / sem Instagram (`SemFonte`) / erro de dados | aviso-estado | L127–131 | L181–185 | MANTIDO | |
| Fonte das perguntas | regra | `getPatientQuestionsPeriodo` (só `is_question`) | `getComentariosVozDoPaciente` (`is_question` ou termos comerciais) + `analisarVozDoPaciente` | ALTERADO (regra/cálculo) | A mesma base da tela Dúvidas. |
| "O que o seu melhor conteúdo tem em comum" (top 20 por salvamento, `padroesDoTop`) | insight-texto | L111–115, L136–146 | L167–171, L192–204 | MANTIDO | Mesmo cálculo. |
| Linha "N posts no período · N perguntas de pacientes" | métrica | L147–150 | L206–212 | ALTERADO (regra) | Agora mostra "perguntas reais (de N comentários lidos)" e "N pedidos de dose ou remédio ficaram fora". |
| Cartão de ideia: etiqueta da regra | insight-texto | "Pergunta repetida / Tema que salva mais / Formato de maior alcance" L18–22 | "Dúvida de pacientes / Tema que o público mais salva / Formato que mais alcança" (`SeloStatus`) L23–27 | ALTERADO (aparência) | |
| Cartão: título = `tema` (na regra pergunta, era o **texto do comentário**) | insight-texto | L43 | `titulo` (título de post pronto) L54–56 | ALTERADO (regra) | |
| Cartão: chips de formato, **funil** e **estágio** | insight-texto | L44–48 | Formato em "Formato recomendado" (L57–59); **funil e estágio não aparecem mais na tela** | **REMOVIDO** (funil/estágio na tela) | Os campos ainda são calculados e aparecem no PDF ("Funil · Estágio"). Também saíram do texto copiado (`ideiaParaTexto`). |
| Cartão: "O que fazer" (`acao`) | insight-texto | L49 | Substituído por Gancho pronto, Roteiro curto e CTA (L62–82) | ALTERADO (regra) | `acao` continua existindo para o PDF. |
| Cartão: "Por quê" (`porque`) | insight-texto | L50–52 | "Por que vale testar" (L84–89) + "Ver a evidência e a confiança" (L91–97) | ALTERADO (aparência) | |
| Chips de objetivo e confiança | insight-texto | — | L50–51 | NOVO | |
| Aviso de segurança médica | aviso-estado | — | L99–107 | NOVO | |
| Botão "Copiar ideia" | ação-botão | L26–41 | "Copiar ideia completa" (L110) + "Copiar gancho" (L66) | MANTIDO / ALTERADO (texto copiado) | O texto copiado agora traz Título, Formato, Objetivo, Confiança, Por que, Evidência, Gancho, Roteiro, CTA e Atenção, e não mais Funil/Estágio/O que fazer/Por quê. |
| Link "Ver as N pessoas que perguntaram" → Dúvidas | nav | — | L111–113 | NOVO | |
| Plano de 7 dias + "Copiar plano" | ação-botão | L59–84 | L120–139 ("Copiar plano da semana") | MANTIDO / ALTERADO (regra) | Cada linha do plano agora diz "Formato. Título. Gancho: …" no lugar de "Formato. Ação". A ordem e a hora sugerida continuam iguais. |
| Estado "Nenhuma ideia por regra" com a lista do que falta | aviso-estado | L152–161 | "Nenhuma ideia com base suficiente" (L214–218) + a lista em `ListaLimitacoes` | MOVIDO | |
| Card "Regras sem ideia neste período" | aviso-estado | L170–181 | `ListaLimitacoes` "O que ainda limita as ideias" (L230), que junta as `faltas` e as limitações da voz | MOVIDO | |
| Nota com as regras | insight-texto | L184–188 | Seção "De onde vêm as ideias" + `OQueE` (L232–245) | MOVIDO / ALTERADO (texto) | |

Regras de geração: veja R4 na seção "Regras alteradas".

---

## 4. Relatório (`/$clientId/relatorio`)

| Elemento | Tipo | Definição no baseline | Onde está agora | Status | Observação |
|---|---|---|---|---|---|
| Fontes de dados | regra | métricas IG, posts, perguntas, `getAdsResumo`, `getWtsResumo` | + alcance único da Meta (`getResumoPeriodo`, prazo de 12s), anúncios por objetivo (`getAdsCampanhasPeriodo` + `diagnosticarAds`), WhatsApp + dias, **CRM** (resumo do período + dias) | ALTERADO (regra/cálculo) | O CRM entra no relatório. |
| Estado sem nenhuma fonte | aviso-estado | L101–111 (IG/anúncios/WhatsApp) | L132–139 (inclui o CRM) | MANTIDO | |
| Card "Não incluído por falta de dado" (lista `omitidos`) | aviso-estado | L136–141 | Item "Dado completo" da Checagem + seção "Dados incompletos ou limitações" dentro do texto | ALTERADO (regra) | Não são mais avisados: "seguidores (menos de 2 dias)", "post destaque (nenhum post com alcance)" e "ações recomendadas (sem dado suficiente)". Em compensação, entram cobertura por dia, o dia de hoje parcial, alcance somado e CRM. |
| **"O que entra no texto": caixas de marcar por bloco (Alcance, Seguidores, Post destaque, Anúncios, Atendimento, Próximas ações), que refazem o texto** | ação-botão / filtro | L142–159 (`excluir` em `hub-relatorio.ts`) | — | **REMOVIDO** | Não há mais como incluir ou excluir seções. O que sobra é editar o texto à mão. |
| Área de texto editável | ação-botão | Uma só, L166–186 | Uma por versão: WhatsApp (L201–215) e Executiva (L217–223), em abas WhatsApp / Reunião / PDF (L179–199) | ALTERADO (aparência) | A edição volta ao texto gerado quando o período ou os dados mudam (L116–121), como antes. |
| Botão "Copiar" | ação-botão | L188–190 | "Copiar para WhatsApp" / "Copiar versão executiva" | MANTIDO | |
| Botão "Refazer texto" | ação-botão | L194–196 | "Voltar ao texto gerado" (L326–328), desativado quando não há edição | MANTIDO | |
| Botão "Exportar PDF completo" (desativado com texto vazio) | ação-botão | L191–193 | Aba "PDF" › "Baixar PDF detalhado" (L238–247), com mensagem de erro | MOVIDO | O PDF leva o `envio` validado e o texto de WhatsApp como estiver editado. O texto executivo **não** vai para o PDF. |
| Nota "O envio direto pelo WhatsApp é fase 2…" | aviso-estado | L198 | L250 | MANTIDO | |
| Estado "Sem dado para montar o texto" | aviso-estado | L160–164 | L173–174 (`vazio` = todas as seções vazias, menos limitações) | MANTIDO | |
| Contador de caracteres (limite de 900) + "Editado à mão" | aviso-estado | — | L305–311 | NOVO | |
| Checagem CFM do texto editado | regra | — | L290, L312–323 | NOVO | |
| "Checagem antes de enviar" (4 itens com detalhes que abrem) | aviso-estado | — | `Checagem` L334–379 | NOVO | |
| Lista das 6 seções com quantidade de itens (aba PDF) | insight-texto | — | L230–237 | NOVO | |
| "Recomendações que passaram na checagem" (`InsightCard`) | insight-texto | — | L254–265 | NOVO | |
| Conteúdo: Alcance | métrica | Soma do alcance diário (`hub-relatorio` L60–69) | Alcance único da Meta; sem ele, a soma diária + uma limitação | ALTERADO (regra/cálculo) | |
| Conteúdo: Seguidores | métrica | Ganho/perda e total (L71–86) | Vitória quando é ganho, atenção quando é perda | MANTIDO (cálculo) / ALTERADO (forma) | |
| Conteúdo: Post destaque, com link | métrica | Maior alcance, trecho da legenda, salvos e **permalink no texto** (L88–103) | Vitória "post de maior alcance"; o link vai só para o PDF ("Abrir no Instagram") | ALTERADO (aparência) | No WhatsApp não há mais link nem legenda. |
| Conteúdo: Anúncios | métrica | Gasto, conversas **totais** e custo por conversa do `ads_resumo` (L105–119) | Gasto + conversas e custo **só das campanhas de mensagem**; desperdício, escalar e conversa mais barata por objetivo | ALTERADO (regra/cálculo) | R6. |
| Conteúdo: Atendimento | métrica | Atendimentos, contatos distintos e **mediana da 1ª resposta sempre que medida** (L121–132) | Atendimentos (no texto do PDF, também contatos); a espera só aparece como **atenção quando passa de 15 min** | ALTERADO (regra) | Uma espera boa deixou de aparecer no WhatsApp e na executiva. Continua nos KPIs do PDF. |
| Conteúdo: Próximas ações | insight-texto | As 3 primeiras ideias de `buildIdeias` (L134–145) | Candidatas (formato, tema, dúvida, anúncios, WhatsApp, CRM) validadas por evidência e amostra mínima; seções "Ações" e "Próximos testes" | ALTERADO (regra/cálculo) | R5. |
| Saudação e fecho | insight-texto | "Olá, {nome sem Dr./Dra.}! Segue o resumo do período de X." … "Qualquer dúvida, estamos à disposição." | "Olá, Dra. Fulana! Segue o resumo de X." … "O relatório completo vai em PDF. Qualquer dúvida, estou à disposição." | ALTERADO (aparência) | |
| Limpeza de emoji e travessão (`limparTexto`) | regra | Tirava todo emoji | O WhatsApp usa de propósito ✅ e ⚠️ e tira os travessões | ALTERADO (regra) | |

---

## 5. PDF completo (`pdf-relatorio-completo.tsx`, `relatorio-completo.ts`) e `pdf-report.tsx`

`pdf-report.tsx` não mudou. No PDF completo:

| Elemento | Tipo | Baseline | Agora | Status | Observação |
|---|---|---|---|---|---|
| Página 1: "O achado do período" (`computeHeadline`) | insight-texto | sim | — | REMOVIDO | |
| Página 1: "O que aconteceu" (post mais salvo, formato mais forte com %, anúncios, "Merece atenção", WhatsApp, CRM com leads/ganhos/perdidos/em atendimento) | insight-texto | sim | Substituído pelas 6 seções do `envio` + "Checagem antes de enviar" | ALTERADO (regra) | O insight de formato por engajamento (`computeFormatInsight`) e o "em atendimento" do CRM não estão mais na página 1. O CRM continua na página Comercial. |
| Página 1: "Próximas ações recomendadas" | insight-texto | Ideias + cortar/atrai + escalar + espera > 10 min + dúvida mais repetida (citava o comentário) | Seção "Ações recomendadas" do `envio` (o limite da espera passa a 15 min) | ALTERADO (regra/cálculo) | |
| KPI Alcance / Taxa de engajamento | métrica | "Alcance" e "Taxa de engajamento" em % | "Soma dos alcances diários" e "Interações a cada 100 de alcance" | ALTERADO (aparência) | Mesmo cálculo. |
| KPI de anúncios na página 1 (gasto, conversas, custo/conversa, impressões/CTR) | métrica | `ads_resumo` | Gasto, conversas e custo **só de campanhas de mensagem**; **Impressões/CTR saíram da página 1** | ALTERADO (regra) / REMOVIDO (Impressões na pág. 1) | Impressões e CTR continuam na página de Anúncios. |
| Página Anúncios: CTR | métrica | `pct(ctr*100 se ≤1)` | `ctr.toFixed(2)` como "Cliques a cada 100 impressões" | ALTERADO (cálculo) | O SQL já devolve o CTR em %; o baseline multiplicava por 100 os CTR abaixo de 1% (bug). |
| Página Anúncios: "Resultado por objetivo" | tabela | `getAdsPorObjetivo` (conversas, custo/conversa) | `diagnosticarAds.grupos` (+ custo por resultado do objetivo) | ALTERADO (regra/cálculo) | |
| Diagnóstico por campanha | tabela | Vereditos do RPC `ads_diagnostico` (Cortar / Atrai mas não converte / Escalar…); colunas Conv., Custo/conv. e **Freq.** | Vereditos por objetivo; colunas Objetivo e Custo por resultado; **sem Conversas, sem Custo/conv. e sem Frequência** | ALTERADO / REMOVIDO (colunas) | |
| WhatsApp por departamento: % | métrica | `fatia*100 se ≤1` | `fatia` direto | ALTERADO (cálculo) | O SQL já devolve em %. |
| Dúvidas dos pacientes | tabela | "Dúvida mais representativa" (texto do comentário) + quantidade de comentários | "Assunto da dúvida" (palavra-chave, passada pelo `tornarSeguro`) + pessoas diferentes; usa `duvidasRepetidas` | ALTERADO (regra) | O comentário deixou de ser citado. |
| Ideias de conteúdo | insight-texto | Todas as regras | **Tira a regra "pergunta"**; `acao/porque` passam pelo `tornarSeguro` | ALTERADO (regra) / REMOVIDO (ideias de dúvida no PDF) | As faltas da regra pergunta continuam listadas. |
| Mensagem para o cliente | insight-texto | Texto editado | O texto de WhatsApp editado | MANTIDO | Vindo do Resumo ("Baixar PDF completo do período"), vai sem mensagem, como antes. |

---

## 6. Inspiração (`/$clientId/inspiracao`)

O arquivo é idêntico ao baseline. A única mudança é o caminho no menu (Biblioteca → área Ideias › Inspiração).

| Elemento | Tipo | Baseline | Agora | Status | Observação |
|---|---|---|---|---|---|
| Filtro de grupo (Todos / Cases Doctor / Referências Nacionais) | filtro | L181–190 | igual | MANTIDO | |
| Filtro de especialidade | filtro | L191–203 | igual | MANTIDO | |
| Filtro de mídia (Post e reel / Post / Reel) | filtro | L204–213 | igual | MANTIDO | |
| Busca por título, gancho ou tema | filtro | L214–218 | igual | MANTIDO | |
| Contador "N referência(s)" | métrica | sim | igual | MANTIDO | |
| Cartão: grupo, especialidade, formato, métrica, multiplicador ×mediana, título, link da fonte, gancho; ao abrir: estrutura, por que funcionou, como adaptar, replicabilidade | insight-texto | L20–135 | igual | MANTIDO | |
| Acesso pelo menu | nav | grupo "Biblioteca" | Área "Ideias" › "Inspiração" | MOVIDO | |

## 7. Admin (`/admin`, `/admin/`, `/admin/$clientId`, `/admin/conferencia`, `/admin/referencia`)

Todos os arquivos são idênticos ao baseline. O admin usa uma casca própria (`_authenticated.admin.tsx`), sem `AppShell`.

| Elemento | Tipo | Onde | Status | Observação |
|---|---|---|---|---|
| Proteção `is_app_admin` (quem não é admin vai para `/`) | regra | `admin.tsx` L6–9 | MANTIDO | |
| Cabeçalho "Painel admin" + abas Saúde das fontes / Referência entre clientes / Conferência de dados + Sair | nav | `admin.tsx` L16–40 | MANTIDO | Sem tema, sem busca Ctrl+K e sem atalho para clientes, como antes. |
| Alerta de fontes paradas há mais de 3 dias / com erro, `ResumoDonos`, `LinhaMotivo` | aviso-estado | `admin.index.tsx` | MANTIDO | |
| Tabela de clientes (avatar, nome, especialidade · @, Instagram/Anúncios/CRM/WhatsApp, "Gerenciar →") | tabela | `admin.index.tsx` | MANTIDO | |
| "Cadastrar admin ou cliente" (`NewAdminForm`, `NewClientForm`) | ação-botão | `admin.index.tsx` | MANTIDO | |
| Detalhe do cliente: voltar, avatar, "Ver o painel deste cliente →", Perfil (`ClientProfileForm`), Conta Instagram (conectar + lista), CRM (conectar + lista + remover), Novo usuário (papel owner/strategist/viewer), Usuários vinculados (remover, redefinir senha) | ação-botão / tabela | `admin.$clientId.tsx` L36–497 | MANTIDO | |
| Conferência de dados (rodar conferência, filtro por grupo) | ação-botão / filtro | `admin.conferencia.tsx` | MANTIDO | |
| Referência entre clientes (tabela por formato: clientes, posts, alcance e salvamentos em mediana) | tabela | `admin.referencia.tsx` | MANTIDO | |
| Chegar ao admin a partir do painel do cliente | nav | Baseline: "Visão geral" e "Admin" no menu | Avançado › "Admin · Portfólio" (computador: Avançado recolhido; celular: Mais › Avançado) | MOVIDO | Agora fica a 1 clique a mais no computador (precisa abrir o Avançado). Ele abre sozinho quando a tela atual é do Avançado. |

## 8. Entrada e acesso (`/`, `/login`, `/reset-password`, `/sem-acesso`, `_authenticated`)

Arquivos idênticos ao baseline. Tudo MANTIDO: o redirecionamento de `/` (admin vai para `/admin`, membro vai para o 1º cliente, sem vínculo vai para `/sem-acesso`), o login (e-mail, senha, "Entrar", "Esqueci minha senha" com aviso de link enviado), o reset (nova senha, "Senha atualizada. Te levando pro painel…"), a página "Nenhum cliente vinculado" e a proteção `_authenticated` (sem usuário vai para `/login?redirect=`).

---

## REMOVIDOS OU SEM CAMINHO DE ACESSO

Nenhuma rota foi apagada. Nenhuma tela ficou sem caminho de acesso: todas as que tinham item de menu no baseline continuam com um. O que saiu foram elementos dentro das telas:

1. **Relatório: escolher o que entra no texto** (caixas por bloco, que refazem o texto). Baseline `_authenticated.$clientId.relatorio.tsx` L64, L142–159; `hub-relatorio.ts` L17–18 e L147. Hoje não existe.
2. **Relatório: card "Não incluído por falta de dado"** com a lista completa de omitidos. Baseline `relatorio.tsx` L136–141. Foi substituído pela Checagem e pelas Limitações, que não cobrem "seguidores sem 2 dias", "post destaque sem alcance" nem "ações sem dado".
3. **Dúvidas: filtro por tema do post** ("Todos os temas"). Baseline `duvidas.tsx` L110–118, L151–165.
4. **Dúvidas: lista plana de todas as perguntas** com miniatura, @ completo, data, tema e "ver post ↗". Baseline `duvidas.tsx` L14–49 e L171–185. A miniatura e o @ completo saíram. Nas perguntas avulsas não há mais data, tema nem link do post.
5. **Dúvidas: leitura sem período** (as últimas 200 perguntas, de qualquer data). Baseline `duvidas.tsx` L104–107; `client-data.ts` `getPatientQuestions`. A função continua no código (L219), mas ninguém a usa.
6. **Dúvidas: mensagem "O sync de comentários roda no job diário"**. Baseline `duvidas.tsx` L176.
7. **Ideias: chips de Funil e Estágio no cartão e no texto copiado.** Baseline `ideias.tsx` L44–48; `hub-conteudo.ts` `ideiaParaTexto` (Funil/Estágio). Continuam só no PDF.
8. **PDF: "O achado do período"**, o insight de formato por engajamento, Impressões/CTR na página 1, as colunas Conversas, Custo/conv. e Frequência no diagnóstico por campanha, e as ideias da regra "pergunta". Baseline `pdf-relatorio-completo.tsx` L185–186, L234, L276–345 e L665–675.
9. **Resumo (`index.tsx`): botão Sincronizar do estado "Sem dados sincronizados nesse período"**. Baseline `index.tsx` L355–366. Fora do escopo principal; registrado por ser uma ação de sincronizar.
10. **Celular: gaveta (hambúrguer) e a marca "Intelligence Hub" no topo.** Baseline `_authenticated.$clientId.tsx` L216–248 e L252–260. As funções da gaveta foram para a barra inferior e a folha "Mais".
11. **Código sem uso** (nenhuma tela usa): `getPatientQuestions`, `categoriaDoComentario`, `computeDuvidasFrequentes` (reescrita, mas sem chamador), `buildRelatorio` (só em `scripts/test-hub-conteudo.ts`) e `ThemeMenu` (já sem uso no baseline).

## REGRAS ALTERADAS (antes → depois)

**R1. "É pergunta?" (triagem)**
- **Antes** (`comentarios.ts` baseline): fica todo comentário `is_question = true` (o sync marca pela pontuação ou pela palavra interrogativa). Só saem:
  - o que tem menos de 6 letras/números;
  - comentário do próprio perfil;
  - 13 padrões de sorteio ou convite.
  - "Na dúvida, o comentário fica."
- **Depois** (`voz-do-paciente.ts` `triarComentario`): "Na dúvida, o comentário sai e fica listado com o motivo." Saem:
  - só emoji, vazio, ou menos de 3 palavras / 10 letras;
  - comentário do próprio perfil;
  - spam (15 padrões: link, `.com`, marca, app, sorteio, "me segue", renda extra…);
  - **profissional de saúde**, pelo @ (`dr`, `dra`, `nutri`, `fisio`…) ou pelo texto ("sou médica", CRM/CRN/CRP…);
  - só marcação de alguém, ou texto que começa com @ de outra pessoa (conversa entre seguidores);
  - pergunta para os outros seguidores ("alguém…", "quem aí…");
  - risada (kkk, rsrs, 😂);
  - comentário sem pergunta real: precisa de "?" numa frase com palavra interrogativa, de um pedido explícito ("gostaria de saber", "me explica"…) ou de começar perguntando.
  - Exceção: um pedido comercial claro (preço ou agendamento) fica mesmo curto e sem "?".
  - Na leitura das telas, também entram comentários **sem** `is_question` que tenham termos comerciais.
- `filtrarPerguntas` (usado por `getPatientQuestionsPeriodo`, ou seja, Relatório e PDF) agora aplica esta triagem e ainda a remoção de repetidos.

**R2. Filtro de resposta do dono**
- **Antes:** o autor é igual a um `ig_username` da conta (normalizado).
- **Depois:** a mesma comparação, ignorando "@".
- **Novo:** se o comentário marca o dono, ele não é tratado como "só marcação" nem como "conversa entre seguidores".

**R3. Contagem de pessoas e agrupamento**
- **Antes** (`computeDuvidasFrequentes`):
  - Jaccard ≥ 0,4 sobre palavras de 4 ou mais letras, comparando com o 1º item do grupo;
  - grupo com 2 ou mais **comentários**;
  - `count` = comentários (a mesma pessoa contava 2 vezes).
- **Depois** (`analisarVozDoPaciente`):
  - repetido da mesma pessoa (mesmo texto ou Jaccard ≥ 0,5) sai como "repetido";
  - sem @, cada comentário é uma pessoa, e o mesmo texto no mesmo post conta uma vez;
  - agrupa por intenção comercial (preço/agendamento), por "cuidado" (pedido de dose ou remédio) ou por **assunto** (22 regex de assunto) + intenção;
  - sem assunto conhecido, usa Jaccard ≥ 0,34;
  - o grupo exige 2 ou mais **pessoas diferentes** (grupos de cuidado entram com qualquer tamanho);
  - `count` = pessoas.
- **O relatório usa um terceiro algoritmo** (`relatorio-envio.ts` `duvidasRepetidas`): escolha gulosa por palavra-chave, com stopwords e "palavras de nicho", aplicado **depois** do R1.
  - Por isso, Dúvidas/Ideias e Relatório/PDF podem mostrar números diferentes para a mesma dúvida.
  - O "ruído" que a checagem do relatório mostra é medido sobre perguntas já triadas, então fica abaixo do ruído real.

**R4. Geração de ideias** (`hub-conteudo.ts` `buildIdeias`)
- **Regra "pergunta":**
  - **Antes:** com 3 ou mais perguntas, até 5 clusters de qualquer tipo; título = texto do comentário; formato e ação por `tipoDaDuvida` (preço, agendar, uso, sintoma, resultado, geral); na "geral", o formato era o melhor da conta; funil C1 / estágio Confiança.
  - **Depois:** com 3 ou mais perguntas **reais** (após R1 e R3), até 5 grupos de conteúdo + **1** comercial. Os grupos de dose/remédio **nunca** viram ideia e entram como "falta".
  - Título, gancho, roteiro e CTA vêm de modelos fixos por intenção (dúvida, medo, objeção, comparação, comercial).
  - Formato da intenção: Carrossel; Reels para medo/objeção; "Reels ou Stories" para comercial.
  - Confiança por número de pessoas (5+ alta, 3+ média).
  - Funil C2 / estágio Venda para os comerciais.
- **Regra "tema":** os limites são os mesmos (8+ posts no período, 2+ posts no tema, mediana de salvos ≥ 1,25 × a da conta, até 4 temas). Mudanças:
  - o formato padrão passou de "A definir" para "Carrossel";
  - ganhou título, gancho e roteiro de modelo;
  - o aviso CFM vem do assunto.
- **Regra "formato":** os limites são os mesmos (3+ posts no formato). Ganhou modelo de texto.
- **Plano de 7 dias:** a linha passou a mostrar título + gancho.

**R5. Ações recomendadas do relatório**
- **Antes:** as 3 primeiras ideias do R4 (antigo).
- **Depois:** as candidatas só passam com evidência e amostra mínima. As que não passam aparecem como "Descartada" na checagem.

| Candidata | Mínimo para passar |
|---|---|
| Formato | 8 posts, em 2 ou mais formatos, com 3 por formato e mediana ≥ 1,25× |
| Tema mais salvo | 3 posts |
| Dúvida | 2 pessoas |
| Cortar campanhas | 1 campanha |
| Mensagem mais barata | 10 conversas |
| Escalar | 1 campanha (vira vitória, não ação) |
| Espera no WhatsApp | > 15 min, com 10 atendimentos medidos |
| CRM sem ganho | 30 contatos novos |

- A confiança é dada por `confiancaPorAmostra`.
- A ordem é impacto × tom.
- "Próximos testes": até 3.

**R6. Anúncios no relatório e no PDF**
- **Antes:** conversas e custo por conversa de **todas** as campanhas (`ads_resumo`); "gasto ruim" = vereditos "Cortar" / "Atrai mas não converte" do RPC `ads_diagnostico`, com régua na mediana da conta.
- **Depois:** `diagnosticarAds` compara cada campanha só com as do **mesmo objetivo**:
  - o custo por conversa considera **só campanhas de mensagem**;
  - "desperdício" = Cortar + Sem resultado;
  - "Escalar" = custo ≤ 60% do típico;
  - "Cortar" = custo ≥ 2× o típico, com 1.000 ou mais impressões e R$ 50 ou mais de gasto.
- A migração `20261013200000_correcoes_auditoria_dados.sql` (que alinha o `ads_resumo`: CTR por clique no link, custo por conversa só de campanha de mensagem) está no repositório, mas o commit `3dccea3` diz "não aplicada".

**R7. Reescrita CFM** (`linguagem-cfm.ts`, novo)
- Todo item do relatório (texto curto, texto longo e evidência) passa por `tornarSeguro`, que procura:
  - promessa: garantido, 100%, cura, antes e depois, sem dor/risco, definitivo, "de vez", "nunca mais";
  - preço ou promoção;
  - superlativo: "o melhor" vira "um bom"; único, milagre, número 1;
  - sensacionalismo;
  - @ de pessoa (é removido);
  - cerca de 90 nomes de medicamento (trocados por "medicamento");
  - R$ junto de serviço médico.
- Frase que não dá para reescrever **é removida**. Se o item ficar vazio, ele sai do relatório.
  - Exemplo: um post destaque cuja legenda tenha "cura" ou "garantido".
  - Exemplo: uma campanha cujo nome tenha "promoção".
- Tudo o que muda fica listado na checagem "Linguagem segura".
- O texto editado à mão é conferido (`checarLinguagemCFM`), mas não é reescrito.
- No PDF, os assuntos de dúvida e as ideias também passam pelo `tornarSeguro`.

**R8. Período**
- "Este mês" termina hoje (antes ia até o fim do mês).
- Os posts e comentários do período usam os limites do fuso de Brasília (`limitesBR`): antes, `lte('…T23:59:59')` sem fuso deixava de fora parte do último dia.
- Dúvidas passou a respeitar o período.

**R9. Alcance no relatório:** usa o alcance único da Meta quando ele vem; sem ele, a soma diária, com uma limitação explícita.

**R10. Espera no WhatsApp:** no texto, só aparece como alerta acima de 15 min. Antes, a mediana aparecia sempre. Na ação do PDF, o limite subiu de 10 para 15 min.

## ROTAS

| Rota | Existe no baseline | Existe agora | Como se chega pela navegação agora |
|---|---|---|---|
| `/login` | sim | sim | Redirecionamento sem sessão; botão Sair |
| `/reset-password` | sim | sim | Link do e-mail de "Esqueci minha senha" |
| `/sem-acesso` | sim | sim | Redirecionamento de `/` para usuário sem vínculo |
| `/` | sim | sim | Raiz: redireciona para `/admin` ou `/$clientId` |
| `/admin` (casca) e `/admin/` | sim | sim | Avançado › "Admin · Portfólio" (só admin); `/` para admin |
| `/admin/$clientId` | sim | sim | `/admin` › "Gerenciar →" |
| `/admin/conferencia` | sim | sim | Abas do admin › "Conferência de dados" |
| `/admin/referencia` | sim | sim | Abas do admin › "Referência entre clientes" |
| `/$clientId` (Resumo) | sim | sim | Área **Resumo** › aba Resumo; Ctrl+K / "Trocar de cliente"; admin › "Ver o painel deste cliente" |
| `/$clientId/relatorio` | sim | sim | Resumo › **Relatório**; botão "Montar relatório para o cliente" no Resumo |
| `/$clientId/conteudo` | sim | sim | Área **Conteúdo** › Visão |
| `/$clientId/posts` | sim | sim | Conteúdo › Posts (instagram) |
| `/$clientId/top` | sim | sim | Conteúdo › Melhores (instagram) |
| `/$clientId/audiencia` | sim | sim | Conteúdo › Público (instagram) |
| `/$clientId/anuncios` | sim | sim | Área **Anúncios** (anuncios) |
| `/$clientId/crm-painel` | sim | sim | Área **Comercial** › Funil (crm); destino do redirecionamento "só CRM" |
| `/$clientId/atendimento` | sim | sim | Comercial › WhatsApp (atendimento) |
| `/$clientId/jornada` | sim | sim | Comercial › Jornada (admin) |
| `/$clientId/ideias` | sim | sim | Área **Ideias** › Ideias; botões de insight "Ver ideias…" |
| `/$clientId/duvidas` | sim | sim | Ideias › Dúvidas dos pacientes (instagram); "Ver as N pessoas que perguntaram" |
| `/$clientId/inspiracao` | sim | sim | Ideias › Inspiração |
| `/$clientId/conversas` | sim | sim | Avançado › Conversas (admin + atendimento) |
| `/$clientId/analisar` | sim | sim | Avançado › A analisar (admin + crm) |
| `/$clientId/crm-estrutura` | sim (sem menu) | sim | Avançado › Estrutura do CRM (admin + crm). **Antes, só pelo endereço** |
| `/$clientId/vendas-kommo` | sim (sem menu) | sim | Avançado › Vendas (Kommo) (admin + crm). **Antes, só pelo endereço** |
| `/$clientId/vendas` | sim (sem menu) | sim | Avançado › Vendas (admin). **Antes, só pelo endereço** |
| `/$clientId/consultas` | sim (sem menu) | sim | Avançado › Consultas (admin). **Antes, só pelo endereço** |
| `/$clientId/automacoes` | sim (sem menu) | sim | Avançado › Automações (admin). **Antes, só pelo endereço** |
| `/qa/layout` | não | sim | Nenhum link; só em desenvolvimento (`import.meta.env.DEV`) |

No computador, o Avançado fica recolhido na barra lateral e abre sozinho quando a tela atual é dele. No celular, ele aparece em Mais › Avançado.

## Resumo (10 linhas)

1. Nenhuma rota foi removida e toda tela que tinha item de menu no baseline continua com um. Cinco telas que antes só abriam pelo endereço (crm-estrutura, vendas-kommo, vendas, consultas, automacoes) ganharam menu no "Avançado", só para admin.
2. As regras de quem vê o quê (admin, fonte conectada, cliente só CRM com redirecionamento) foram movidas para `nav.ts` sem mudança de lógica.
3. Cabeçalho: tudo continua no computador. No celular, especialidade/@, selo CFM, tema, busca e Sair foram para a folha "Mais", e as datas de cada fonte para a folha "Período" (o cabeçalho mostra só um resumo do estado).
4. Perda de função mais clara: o Relatório não deixa mais escolher quais seções entram no texto, e o card de omitidos perdeu três avisos.
5. Dúvidas perdeu o filtro por tema do post, a miniatura, o @ completo e a lista plana. As perguntas avulsas ficaram sem data e sem link do post, e a busca não alcança as avulsas.
6. Ideias tirou Funil e Estágio da tela e do texto copiado (continuam no PDF).
7. As regras de comentário mudaram muito: a triagem ficou mais rígida, a mesma pessoa conta uma vez, os grupos são por assunto e por pessoas diferentes, pedido de dose nunca vira ideia, e Dúvidas passou a respeitar o período e a ler também comentários comerciais sem "?".
8. Existem três algoritmos de dúvida (voz-do-paciente, duvidasRepetidas no relatório e computeDuvidasFrequentes sem uso). Por isso Dúvidas/Ideias e Relatório/PDF podem dar números diferentes; o relatório lê só `is_question` e aplica uma segunda triagem.
9. Os cálculos do relatório e do PDF mudaram: alcance único, custo por conversa só de mensagem, diagnóstico por objetivo, ações com amostra mínima, espera só acima de 15 min, CTR e % de departamento corrigidos, e a reescrita CFM pode apagar itens inteiros.
10. Inspiração, todo o Admin, login, reset, sem-acesso, `pdf-report.tsx`, `client-avatar`, `client-profile-form` e `theme-menu` estão idênticos ao baseline.
