---
phase: "3"
slug: "menu-da-equipe-esconder-com-o-log-gravando"
status: draft
shadcn_initialized: false
preset: none
created: "2026-11-09"
revised: "2026-11-09"
revision_note: "Revisão 1 pós-checker: tipografia (4 tamanhos nesta fase + reservados Phase 9), proveniência do inventário, ponto focal, disposição de --ai, CTA Buscar tela"
revision: "Sistema visual aprovado pelo João em 09/11/2026 (paleta Cobalto + réplica do NEXO/Behance)"
pending_owner_choices: 0
deferred_owner_choices: 1
---

# Phase 3 — UI Design Contract

> Contrato visual e de interação da Phase 3 (Menu da equipe). Gerado por gsd-ui-researcher, verificado por gsd-ui-checker.
> É o primeiro contrato visual do milestone v5.0 e fixa o **sistema visual base** que a Phase 9 (Tela Hoje) e as telas seguintes reaproveitam: tokens, tipografia, moldura, cartões, gráficos, movimento, avatares e ícones.
> Fonte de verdade visual: prancha aprovada pelo João em 09/11/2026 (https://claude.ai/artifact/Dmk7PJ4fqGvF4UQATGMfVQ; arquivo local `/private/tmp/claude-501/-Users-joao-dev-dashboard-gsd/6a1a2e6f-b21e-4a15-9785-d9993d677b10/scratchpad/prancha-azul-nexo.html`). Todo valor marcado "da prancha" foi lido desse arquivo.
> Texto da interface em português claro, sem jargão ("sync", "connection", "token"). Regras do CFM: sem promessa, sem previsão, passado e sem adjetivo em texto de dado.

## Resumo para quem planeja e executa

1. A equipe passa a ter 3 itens de menu (Carteira, Clínica, Conferência e fontes) nas duas cascas da equipe (casca da clínica e casca `/admin`). A estrutura do menu do médico (owner/viewer) não muda nesta fase; ela só recebe o novo visual da casca (tokens, fonte, moldura).
2. As outras telas deixam o menu e abrem pela busca: Cmd+K / Ctrl+K no computador e botão "Buscar tela" sempre visível no celular (alvo de toque de 44 px ou mais). Telas cujos números não têm selo mostram "sem selo" no resultado.
3. **Sistema visual fechado pelo dono (sem pendência de cor ou de barra lateral):** réplica 100% da referência NEXO, trocando só o roxo por **Cobalto** (`#1F4FD8` marca; rampa `--b1` a `--b6`). Fonte Urbanist; moldura cinza-clara `#F0F2F4` com a barra lateral **sobre a moldura** (sem fundo próprio) e o conteúdo em painel branco; cartões brancos de borda fina; ícones Tabler de traço 1,5; **sempre claro** (sem tema escuro e sem fundo preto); pizza e medidor semicircular permitidos; tudo anima ao carregar, respeitando `prefers-reduced-motion`.
4. Todo CSS novo desta fase usa só variáveis (`var(--b1)`, `var(--line)` etc.), nunca hex solto. Os valores ficam num único bloco de tokens (seção Color).
5. Nenhum componente React novo além do chip (`nx-chip`), do avatar gerado (`AvatarGerado`) e dos dois compartilhados do menu (`MenuEquipe`, `BuscaDeTelas`). O resto reaproveita `dbx-*`, `ws-*`, `workspace-*` e `BottomSheet`, restilizados por CSS.
6. **Decisão de dependência para o planner:** ícones Tabler (`@tabler/icons-react`, nova dependência) ou SVG inline. Recomendação e critério na seção Design System.

---

## Estado medido hoje (fatos do código, 2026-11-09)

O brief e o PROJECT.md falam em "azul `#2563EB` com barra `#111827`". Isso é só a camada de base. Nas telas logadas do Nexo, a cor que aparece é outra, porque três camadas de CSS se sobrepõem (a última vence):

| Ordem de carga | Arquivo | `--accent` | Barra lateral `--side` | Observação |
|---|---|---|---|---|
| 1 (base) | `src/styles.css` `:root` | `#2563EB` (escuro `#3B82F6`) | `#111827` | Valor citado no brief; fonte Inter na linha 67 |
| 2 | `src/nexo.css` `:root` | `#315b85` | `#111e30` | Troca `--ai` para dourado `#85632f` |
| 3 (efetiva nas telas logadas) | `src/styles/product-workspace.css` `.product-workspace` | `#194f73` (escuro `#acd3f3`) | `#101f30` | Botão `--action-bg #163f5c`, marcador do item ativo dourado `#e5c78e`, painel `ws-priority` petróleo `#173851` com dourado `#ead5ad` |

Consequências para a execução:

- Trocar só `src/styles.css` não muda nada visível. O bloco a trocar é `.product-workspace:not(.sap-workspace)` (valores claros; as variantes escuras `:root[data-theme="dark"]` e `@media (prefers-color-scheme: dark)` **deixam de valer para o Nexo**, ver "Sempre claro"). O `:root` de `styles.css` recebe os mesmos tokens para as páginas sem `.product-workspace` (janelas e componentes fora da casca).
- O SAP usa a mesma classe (`.product-workspace.sap-workspace`, com `--side` próprio). A troca de visual vale só para o Nexo: seletor `.product-workspace:not(.sap-workspace)`. Nada do SAP muda (restrição do dono), nem o tema escuro do SAP.
- Páginas públicas (`nexo.css`: landing, login, `/bem-vindo`) ficam como estão nesta fase. Só as telas logadas do Nexo entram. O símbolo da marca dentro da casca logada passa a ser o "N" em degradê da prancha (ver Layout).
- **Fonte:** `index.html` linha 9 carrega Inter; `src/styles.css` linha 67 fixa `font-family:"Inter"`, `font-size:15px` e `font-feature-settings:"cv11","ss01"` (recursos exclusivos da Inter). Passam a Urbanist, 16 px e sem `font-feature-settings`. Mudar o corpo de 15 para 16 px mexe em todas as telas: o planner inclui conferência de rolagem horizontal a 375 e 1440 px (V7).
- **Tema e destaque salvos no navegador:** `src/hooks/use-theme.ts` guarda `dc:tema` (claro/escuro/sistema) e `dc:accent` (6 cores, inclui violeta e rosa). No Nexo, o tema escuro e a cor de destaque deixam de ter efeito (sempre claro, sempre Cobalto). O controle "Aparência" sai das barras e da folha "Menu" da equipe e do médico. Ver UI Considerations (linha não resolvida).
- Texto abaixo de 14 px que existe hoje no menu e precisa subir nesta fase: `.workspace-pages a` 13 px, `.kbar` 12 px, `.workspace-search-results small` 12 px, `.workspace-nav-label` 11 px, `.bottomnav a` 11 a 12 px, `.workspace-menu-help` 13 px, `.workspace-nav-count` 11 px. Só os trechos que o menu da equipe e a busca usam entram na troca; telas de conteúdo ficam para as fases delas.
- Gradientes que usam `--ai` (roxo ou dourado) fora de IA, como o fundo do `.avatar` e do `.logo` em `styles.css`, e as iniciais de `ClientAvatar` (matiz derivado do nome, pode cair em roxo): na casca do Nexo, pessoas passam a usar o `AvatarGerado` (ver Avatares) e clínicas, o tile de iniciais em degradê Cobalto. O sistema novo não tem roxo; `--ai` fica como está (29 linhas medidas; disposição na seção Color) e a revisão delas é da Phase 9 / v3.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (não há `components.json`; o sistema é CSS próprio: `dbx-*`, `ws-*`, `workspace-*`, `product-workspace`) |
| Preset | not applicable |
| Component library | none (React 19 + TanStack Router 1.170.45; `<dialog>` nativo via `BottomSheet` em `app-shell.tsx`) |
| Dependency record (ícones) | `@tabler/icons-react@3.51.0`, licença MIT, **não instalado** hoje. Registro lido por `npm view @tabler/icons-react version license maintainers time.modified` em 2026-11-09. Mantenedores no registro: `codecalm` (autor do Tabler Icons) e `bartosz-do`. Downloads na última semana (2026-11-02 a 2026-11-08, `https://api.npmjs.org/downloads/point/last-week/@tabler/icons-react`): 5.220.384. Última publicação: 2026-11-08. Entrada ESM (`module: ./dist/esm/tabler-icons-react.mjs`) e `sideEffects: false`, ou seja, importação nomeada por ícone e remoção do que não é importado no pacote final. Tamanho do pacote publicado: 17,66 MB descompactado (só em `node_modules`; o pacote final leva apenas os ícones importados, a confirmar pela medição do planner). Fixar a versão exata ao instalar |
| Icon library | **Tabler Icons, estilo outline, traço 1,5** (decisão do dono). Recomendação: `@tabler/icons-react` (nova dependência, ver abaixo). `lucide-react@0.575.0` continua instalado só para as telas de conteúdo que ainda não migraram; nenhum componente novo desta fase usa lucide |
| Font | **Urbanist** (Google Fonts), pesos **400 e 500** (os dois declarados em Typography; 300 e 600 não são carregados porque nada usa). Fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. `font-variant-numeric: tabular-nums` em todo número alinhado em coluna |

Decisão sobre shadcn: não inicializar nesta fase. O dono manda "reutilizar `dbx-*` antes de criar componente", o milestone é um PR por fase e iniciar shadcn no meio dele mudaria 80 telas. Registry safety: não se aplica.

**Carga da fonte (da prancha):** `<link rel="preconnect" href="https://fonts.googleapis.com">`, `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` e `https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500&display=swap` (a prancha carrega 300 a 600; o contrato carrega só os dois pesos usados) no lugar do link da Inter em `index.html`. O menu tem largura fixa (232 px), então a troca de fonte (swap) não pode mudar a largura da barra (backstop nas UI Considerations). Hospedar a fonte no próprio site (arquivo woff2) é alternativa que o planner pode adotar sem mudar o contrato.

**Decisão de dependência: ícones Tabler (para o planner).**

| Opção | O que é | Custo | Quando escolher |
|---|---|---|---|
| **A (recomendada)** `@tabler/icons-react` | Pacote oficial, MIT, importação nomeada (`import { IconSearch } from "@tabler/icons-react"`), prop `stroke={1.5}` e `size`. Versão, mantenedores, downloads semanais (5,2 milhões) e suporte a remoção de código não usado estão na linha "Dependency record" acima; fixar a versão exata ao instalar | Nova dependência; milhares de ícones, mas só os importados entram no pacote final. O planner mede o tamanho do pacote da casca e o tempo de arranque do servidor de desenvolvimento antes de fechar | Padrão. Uma única fonte de ícones para a Phase 3, a Phase 9 e as seguintes (a Tela Hoje usa 30+ ícones) |
| B `SVG inline` | Arquivo `src/components/icons/tabler.tsx` com os caminhos dos ícones usados, copiados do repositório oficial (MIT, https://github.com/tabler/tabler-icons) | Zero dependência; cada ícone novo é manutenção manual | Se a medição da opção A mostrar aumento relevante do pacote da casca, ou se o dono não quiser dependência nova. Nesta fase bastam ~15 ícones |

Regras comuns às duas opções: `viewBox 0 0 24 24`, `fill: none`, `stroke: currentColor`, `stroke-width: 1.5`, `stroke-linecap/linejoin: round`, `aria-hidden="true"` (o texto ao lado é sempre o nome acessível; ícone sozinho leva `aria-label` no botão). Tamanhos: 16 (dentro de chip e de campo), 20 (padrão: menu, botões, filtros), 24 (grade de ícones e tiles grandes). Dentro do tile de ícone de 28 px: ícone 17 px com traço 1,7.
Os nomes usados nesta fase foram conferidos no repositório oficial em 2026-11-09 (`icons/outline/{nome}.svg` responde 200): `briefcase`, `stethoscope`, `shield-check`, `shield-off`, `snowflake`, `search`, `menu-2`, `chevron-right`, `chevron-down`, `arrow-right`, `x`, `logout`.

---

## Component Inventory

> Não há pacote de componentes a enumerar. O sistema reutilizável são classes CSS e dois componentes React. A lista abaixo foi enumerada por comando, não de memória, e é **não exaustiva**: o executor pode usar qualquer classe existente.

Enumerated by `grep -oE '\.dbx-[a-z0-9-]+' src/styles/databoard.css | sort -u | wc -l` — 33 classes `dbx-*`; `grep -rhoE '\.ws-[a-z0-9-]+' src/styles | sort -u | wc -l` — 22 classes `ws-*`; `grep -hoE '\.workspace-[a-z0-9-]+' src/styles/workspace-navigation.css | sort -u | wc -l` — 24 classes `workspace-*` — dashboard-gsd@bd419b4 (commit, `git rev-parse --short HEAD`) — 2026-11-09.
Mismatch: nenhum (as três contagens vêm de arquivos únicos; não há `ui-dir` para cruzar). O registro de dependência de ícones (`@tabler/icons-react`) está na tabela Design System, não neste inventário.

| Reaproveitar | Onde | Uso nesta fase (restilizado pelo sistema novo) |
|---|---|---|
| `BottomSheet` | `src/components/app-shell.tsx` | Folha "Menu" e diálogo "Buscar tela" (já é `<dialog>` com foco preso). Fundo atrás do diálogo (`::backdrop`) nunca preto |
| `.workspace-dialog` | `workspace-navigation.css` | Casca do diálogo (raio 22, sombra suave azulada) |
| `.workspace-search`, `.workspace-search-results` | `workspace-navigation.css` | Campo e lista de resultados |
| `nav.side.areas a` | `styles.css` + `product-workspace.css` | Os 3 itens do menu (46 px, raio 12, item atual em pílula degradê) |
| `.workspace-pages a` | `workspace-navigation.css` | Subtelas vivas sob o item ativo (44 px) |
| `.kbar`, `kbd` | `styles.css` | Campo "Buscar tela" da barra lateral |
| `.ws-action`, `.ws-action--secondary` | `product-workspace.css` | Botão "Buscar tela" do cabeçalho do celular (estilo contorno `cta out`) |
| `.icobtn` | `styles.css` | Botão "Menu" (só ícone, 44 x 44) |
| `.mais-item`, `LogoutButton` | `styles.css`, `app-shell.tsx` | Rodapé da folha "Menu" ("Trocar de clínica" e "Sair"). `.themes` / `TemaBotoes` saem (sem tema escuro) |
| `.ws-empty`, `.ws-empty-icon` | `product-workspace.css` | Estado "Nenhuma tela encontrada" |
| `.dbx-card`, `.dbx-bar` | `databoard.css` | Só a limpeza visual (tabela "Limpeza visual") |

**Novos (únicos):**
- `.nx-chip` com modificadores `--sem-selo` e `--congelado`. Motivo: nenhum chip existente tem 14 px / raio 6 / borda tracejada (`dbx-pill` é 12,5 px e depende de `.dbx-up`/`.dbx-down`; `dbx-badge` é 11,5 px e raio 99).
- `AvatarGerado` (React, SVG próprio). Motivo: `ClientAvatar` deriva matiz do nome e pode cair em roxo; o sistema novo pede pessoa em 3D gerada (ver Avatares).

**Dois componentes React compartilhados (para as duas cascas da equipe usarem o mesmo menu e a mesma busca):** `MenuEquipe` (3 itens + subtelas) e `BuscaDeTelas` (diálogo + atalho Cmd+K). Hoje a casca `/admin` (`_authenticated.admin.tsx`) não tem busca nenhuma e a casca da clínica tem a sua dentro de `app-shell.tsx`. O contrato exige o mesmo comportamento nas duas.

**Onde mora o CSS novo (sugestão ao planner):** um arquivo `src/styles/nexo-system.css`, carregado depois de `product-workspace.css`, com o bloco de tokens, a moldura, os cartões, os chips, o movimento e os gráficos. Moldura, barra lateral e painel são restilização dos elementos existentes da casca; se a marcação atual não permitir "barra sobre a moldura", o executor acrescenta só classes, sem componente React novo.

---

## Spacing Scale

Escala de espaçamento do dono (brief, "Sistema visual"): 4 / 8 / 12 / 16 / 24 / 32. Todos múltiplos de 4. Vale para espaços novos escritos nesta fase.

| Token | Value | Usage nesta fase |
|-------|-------|-------|
| xs | 4px | Gap interno do chip (o espaço entre itens do menu é 2 px, exceção da prancha; ver Layout item 3) |
| sm | 8px | Padding vertical do chip; gap entre título e descrição do resultado |
| md | 12px | Gap entre ícone e rótulo; padding da moldura; gap entre barra e painel |
| lg | 16px | Margem lateral do cabeçalho do celular; padding da folha; gap entre blocos; margem da moldura na tela |
| xl | 24px | Padding do diálogo no computador; separação entre menu e rodapé da barra |
| 2xl | 32px | Respiro entre o campo de busca e o primeiro resultado no diálogo |

**Dimensões da prancha, mantidas exatamente (tamanhos de componente, não espaçamento; a réplica 100% do dono prevalece sobre a grade de 4):**

| Peça | Valor da prancha |
|---|---|
| Moldura (`.frame`) | padding 12; borda 6 px; raio 30; fundo `--frame` |
| Grade da casca (`.app`) | barra 232 px + painel; gap 12 |
| Barra lateral (`.side`) | padding 14 8; gap 2 entre itens |
| Item de menu (`.nav`) | altura mínima 46; padding 0 14; gap 12; raio 12 |
| Painel (`.panel`) | padding 20 22; gap 18; raio 22 |
| Título do painel (`.ptitle`) | gap 14; padding-bottom 16; borda inferior 1 px |
| Caixa (`.box`) | padding 18; gap 16; raio 18 |
| Cartão KPI (`.kpi`) | padding 14 16 16; gap 14; raio 14; grade com gap 14 |
| Controles de filtro (`.ctl`) | altura 36; padding 0 12; raio 10; gap 8 |
| Botão primário (`.cta`) | altura 40; padding 0 18; raio 10 |
| Campo de busca (`.search`) | altura 42; padding 0 14; raio 12; fundo `--field` |

Dimensões desta fase: campo "Buscar tela" 44 px; botão "Buscar tela" (altura 44, largura pelo texto) e botão "Menu" 44 x 44 no mínimo; linha da folha "Menu" 56 px; subtela 44 px; resultado da busca 56 px no mínimo; cabeçalho do celular 56 px; barra lateral 232 px (recolhida 76 px, comportamento que já existe e a prancha não mostra).

Exceções: alvo de toque ≥44 px em tudo que é tocável (os botões de 36 a 42 px da prancha, como `.sq` 36 e `.ctl` 36, sobem para 44 quando forem tocáveis no celular). Os 44 px nunca são obtidos por margem negativa.

---

## Typography

Escala do dono (prancha, travada em PROJECT.md Key Decisions em 09/11/2026, commit bd419b4): "Urbanist com a escala tipográfica da referência (17 estilos; âncoras 40/24/16; corpo 400, títulos 500; inclui os tamanhos de apoio da referência, como 28 do valor de cartão e 12 de legenda)". O sistema completo tem portanto mais de 4 tamanhos **por decisão do dono**; esta fase, porém, só usa os que aparecem nas telas dela.

**Tamanhos declarados nesta fase (4):** 30 (palavra "Nexo"), 24, 16 e 14. **Pesos declarados (2):** 400 e 500.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Marca: palavra "Nexo" na barra lateral (peça da prancha, extra pelo travamento do dono) | 30px | 400, `letter-spacing:-.02em` | 36px (1,2) |
| Subtítulo: título da folha e do diálogo ("Menu", "Buscar tela"), título do painel | 24px | 500 | 32px (1,33) |
| Corpo: item do menu, subtela, resultado, texto digitado no campo, botões, nome da clínica no cabeçalho | 16px | 400 (item atual de subtela, título do resultado, botões e nome da clínica: 500) | 24px (1,5) |
| Apoio: descrição do resultado, texto de ajuda, rótulos de campo, chip, linha de estado, **dica de teclado `Ctrl K` / `⌘ K`** | 14px | 400; chip, rótulo de campo e dica de teclado em 500 | 20px (1,43) |

**Reservados para a Phase 9 (existem no sistema por travamento do dono; nenhum elemento desta fase os usa):**

| Tamanho | Peso / linha | Papel na referência | Fase |
|---|---|---|---|
| 40px | 500, `letter-spacing:-.01em` / 48px | Título de tela (H1) e valor central do medidor | Phase 9 |
| 28px | 500 / 32px | Valor do cartão KPI (`.kv`) | Phase 9 |
| 12px | 500 / 16px | Legendas de KPI ("vs. semana anterior"), eixos e legendas de gráfico, chip de variação (12/18) | Phase 9 |

O planner da Phase 9 reconcilia esses 12 px com a regra do PROJECT.md ("texto com sentido ≥14 px"): 12 px só para legenda decorativa ou redundante (eixos, que também têm o valor em texto 14 px); número ou informação única nunca fica em 12. **Nesta fase nenhum texto fica abaixo de 14 px**: a dica de teclado, que a prancha põe em 12, sobe para 14 (decorativa, `aria-hidden`).

Pesos: Urbanist 300 e 600 não são carregadas (nada as usa); os pesos 650 e 680 que existem em telas antigas não entram em nada novo.
Item de menu: 16 px **regular** (400) em todos os estados; o item atual se distingue pela pílula degradê com texto branco, nunca por peso.
Campo de busca em 16 px (o iOS não dá zoom ao focar com 16 px ou mais).
Rótulos de cartão (`.kt`): 16 px / 500 (Phase 9).
H1 dos conteúdos já existentes (32/36 no computador e 28/32 no celular) não é tocado nesta fase; só a fonte muda.
Números (contagens como "73") usam `tabular-nums`. Se a Urbanist não tiver o recurso `tnum`, a regra continua declarada e o executor registra no SUMMARY.

---

## Color

> Sempre claro. O dono não quer tema escuro nem fundo preto no Nexo. Todos os valores abaixo vêm da prancha (`:root` e `OP[0]` "Cobalto"), exceto os marcados "contrato" (variantes de contraste, criadas para passar 4,5:1 sem mudar o desenho).

### Paleta Cobalto (decisão 4 fechada pelo João em 09/11/2026)

| Token | Hex | Uso |
|---|---|---|
| `--b1` | `#1F4FD8` | Marca: texto e ícone de ação, anel de foco, início do degradê, título de herói |
| `--b2` | `#4675F0` | Fim do degradê de marca, início do degradê de tile e de barra |
| `--b3` | `#7D9EF6` | Fim do degradê de tile e de barra; coluna destacada; **só decorativo** |
| `--b4` | `#B6C9FB` | Borda de botão contorno, coluna intermediária, **só decorativo** |
| `--b5` | `#DCE6FD` | Chip de contagem, coluna base, intervalo de calendário |
| `--b6` | `#EFF4FF` | Fundo de coluna do funil, hover de linha, fim do fundo da página, chip azul |

Degradês (todos 135° exceto onde dito):

| Token | Valor | Onde |
|---|---|---|
| `--grad-brand` | `linear-gradient(135deg, var(--b1) 0%, var(--b2) 140%)` | Item atual do menu, botão primário, interruptor "ligado" (variante b2→b3, ver abaixo), FAB. **Contrato:** a prancha usa 0% a 100%; aqui o fim é 140% para o texto branco ficar ≥4,5:1 em qualquer ponto (branco sobre `#4675F0` puro dá 4,15; no ponto 100% do degradê estendido é `#3B6AE9`, 4,75) |
| `--grad-tile` | `linear-gradient(135deg, var(--b2), var(--b3))` | Tile de ícone de 28 px (KPI, ajustes), item ativo de segmento, bolha de mensagem enviada, play. Texto de tamanho normal **não** vai sobre `--grad-tile` (branco sobre `#7D9EF6` dá 2,59); só ícone decorativo e texto grande |
| `--grad-bar` | `linear-gradient(90deg, var(--b2), var(--b3))` | Preenchimento de barra e trilho horizontal; coluna destacada usa o mesmo degradê na vertical (`180deg`, b3 em cima, b2 embaixo) |

### Neutros e semânticos (da prancha)

| Token | Hex | Papel | Contraste medido |
|---|---|---|---|
| `--white` | `#FFFFFF` | Painel, cartão, diálogo (60% dominante) | base |
| `--frame` | `#F0F2F4` | Moldura e barra lateral (30% secundário) | texto `--text` sobre ele 16,69 |
| `--field` | `#F5F6F8` | Campo de busca, chip neutro, trilho vazio, bolha recebida | `--text` 17,32 |
| `--line` | `#E8EBEF` | Borda de cartão, divisores. Decorativo | sem exigência (não carrega informação) |
| `--line-2` | `#DDE1E7` | Borda de controle de filtro, separador da barra. Decorativo | 1,31 sobre branco: não serve como borda única de campo (ver `--control-border`) |
| `--text` | `#121212` | Texto principal, título | 18,73 sobre branco; 16,69 sobre `--frame` |
| `--text-2` | `#2B2B2D` | Texto secundário forte | 14,13 sobre branco; 13,07 sobre `--field` |
| `--muted-ink` | `#5F6570` | **Contrato.** Cinza para qualquer texto que informa algo (legenda de KPI, descrição do resultado, placeholder, e-mail do usuário) | 5,86 sobre branco; 5,22 sobre `--frame`; 5,42 sobre `--field`; 5,32 sobre `--b6` |
| `--muted-soft` | `#8C9099` | Cinza de rótulo da prancha, **só** para texto decorativo ou redundante (eixos, "Limpar tudo" quando há outro botão equivalente, ícones inativos) | **3,20** sobre branco; 2,85 sobre `--frame`: não passa 4,5:1, nunca é o único portador de informação |
| `--muted-2` | `#B4B8BF` | Texto desabilitado e ruído visual | 1,99; só desabilitado |
| `--control-border` | `#7C808A` | **Contrato.** Borda de campo e de controle quando a borda é o que identifica o controle (campo "Buscar tela", `<input>`) | 3,95 sobre branco; 3,52 sobre `--frame`; 3,66 sobre `--field` (exigência WCAG 1.4.11: 3:1) |
| `--up` / `--up-bg` / `--up-ink` | `#22B07D` / `#E7F7EF` / `#0B6B4A` | Alta, ativo. O verde puro é só ícone e ponto; **texto de chip usa `--up-ink`** | `--up` sobre `--up-bg` 2,50 (reprova); `--up-ink` sobre `--up-bg` 5,89 |
| `--dn` / `--dn-bg` / `--dn-ink` | `#EF4B5A` / `#FDEBED` / `#B4233A` | Queda, erro, destrutivo | `--dn` sobre `--dn-bg` 3,14 (reprova texto); `--dn-ink` 5,64 |
| `--or` / `--or-bg` / `--or-ink` | `#F59E0B` / `#FEF3E2` / `#8A5100` | Atenção | `--or` sobre `--or-bg` 1,96 (reprova); `--or-ink` 5,87 |

Contraste da marca (calculado pela fórmula WCAG 2.x; reproduzível pelo comando no fim desta seção):

| Combinação | Razão | Veredito |
|---|---|---|
| Branco sobre `--b1` `#1F4FD8` (texto do botão e do item atual no começo do degradê) | **6,63** | passa 4,5 |
| `--b1` sobre branco (link, ícone, anel de foco, texto de botão contorno) | **6,63** | passa 4,5 e 3 |
| `--b1` sobre `--b6` `#EFF4FF` (chip azul, hover) | **6,01** | passa |
| `--b1` sobre `--b5` `#DCE6FD` | 5,30 | passa |
| `--b1` sobre `--frame` `#F0F2F4` (subtela atual na barra) | 5,91 | passa |
| Branco sobre o degradê `--grad-brand` (pior ponto, 100% = `#3B6AE9`) | **4,75** | passa 4,5 (ponto médio 5,24) |
| Branco sobre `--b2` `#4675F0` puro | 4,15 | **reprova texto normal**; `--b2` não é cor de texto abaixo de 24 px |
| `--b2` sobre branco | 4,15 | só texto grande (≥24 px) como o número "+21%" da prancha, ou ícone/gráfico (3:1) |
| `--b2` sobre `--b6` | 3,76 | só gráfico e texto grande; chip azul usa `--b1`, não `--b2` |
| Branco sobre `--b3` `#7D9EF6` | 2,59 | só ícone decorativo (tile); nunca texto |
| `--b4` sobre branco | 1,65 | só borda decorativa |

Resultado: nesta fase, texto de tamanho normal é sempre `--text`, `--text-2`, `--muted-ink` ou `--b1` (ou branco sobre `--b1`/`--grad-brand`). Ícone branco dentro de `--grad-tile` é decorativo (`aria-hidden`) e o rótulo vizinho dá o nome.

Reproduzir os contrastes: `node -e "const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};const R=(a,b)=>((Math.max(L(a),L(b))+.05)/(Math.min(L(a),L(b))+.05)).toFixed(2);console.log(R('#FFFFFF','#1F4FD8'),R('#FFFFFF','#3B6AE9'),R('#5F6570','#F0F2F4'))"`

### Fundo da página (da prancha)

```css
background:
  radial-gradient(1200px 600px at 90% 0%, color-mix(in srgb, var(--b5) 80%, transparent), transparent 70%),
  radial-gradient(1000px 700px at 0% 100%, var(--b6), transparent 70%),
  linear-gradient(180deg, #FFFFFF, var(--b6));
background-attachment: fixed;
```
(os `#FFFFFF` literais viram `var(--white)` na implementação). Branco muito suave que vira `--b6`; é o único "fundo colorido" do app.

### Moldura, barra lateral e painel (da prancha)

| Peça | Especificação |
|---|---|
| Moldura (`.frame`) | `background: var(--frame)`; `border-radius: 30px`; `padding: 12px`; `border: 6px solid color-mix(in srgb, #fff 70%, var(--b6))`; `box-shadow: 0 40px 90px rgba(31,79,216,.13), 0 2px 8px rgba(18,18,18,.04)` |
| Barra lateral (`.side`) | **Sem fundo próprio**: fica direto sobre `--frame`. Coluna de 232 px, padding 14 8, gap 2 |
| Painel (`.panel`) | `background: var(--white)`; `border-radius: 22px`; padding 20 22 |
| Colocação na tela (contrato) | Moldura com 16 px de margem nos quatro lados no computador, altura mínima `calc(100dvh - 32px)`; barra lateral `position: sticky` (top 28 = 16 + 12); o painel rola com a página |
| Celular, 820 px ou menos (contrato; a prancha esconde a barra abaixo de 1000 px, o app mantém o corte de 820 px que já existe) | A moldura perde borda, raio, padding e sombra; o painel ocupa a largura toda, raio 0, fundo branco; a barra lateral some e entra o cabeçalho de 56 px |

### Uso da cor de marca — lista fechada

A cor de marca (degradê ou `--b1`) é reservada para:
1. **Item atual do menu:** pílula `--grad-brand` com texto e ícone brancos, raio 12 (substitui o marcador dourado `#e5c78e`).
2. **Botão primário** (`ws-action--primary`, `cta`): `--grad-brand`, texto branco 16/500, raio 10.
3. **Tile de ícone de 28 px** (`--grad-tile`, raio 8, ícone branco 17 px) nos cartões KPI e nos ajustes.
4. **Barra, trilho e coluna em destaque** (`--grad-bar`; colunas comuns `--b5`, intermediárias `--b4`, destacada em degradê).
5. **Anel de foco** de todo controle: `outline: 2px solid var(--b1)`, `outline-offset: 3px` (da prancha); dentro da barra lateral e de listas com corte de rolagem, `outline-offset: -2px`. Contraste do anel: 6,63 sobre branco, 5,91 sobre `--frame` (mínimo 3:1).
6. **Texto de ação e links:** `--b1` (`dbx-link`, "Limpar", aba selecionada com traço de 2 px `--b1`), botão contorno (`cta out`: fundo branco, texto `--b1`, borda 1 px `--b4`).
7. Título de herói (H1 de 40 px) em `--b1`, como na prancha. Aparece a partir da Phase 9.
8. Painel de destaque `.ws-priority`: fundo `--grad-brand`, texto branco (4,75 no pior ponto), sem dourado.

A cor de marca **não** é usada em: item de menu inativo, ícones inativos, chip "sem selo", fundo de barra lateral, título de painel, bordas de cartão, nem como cor de dado fora da rampa `--b1`..`--b5` (a decisão das séries de gráfico está na seção Gráficos).

Destructive: nenhuma ação destrutiva nesta fase. `--dn` / `--dn-ink` ficam declarados para as fases seguintes; o único uso existente (botão "Sair" da folha) não muda.
`--ai`: o sistema novo não usa roxo e o bloco de tokens abaixo **não redefine `--ai`** (continua valendo o `:root` de `nexo.css`, `#85632f`). Medição por `grep -rn "var(--ai" src | wc -l`, 2026-11-09, commit bd419b4: **29 linhas em 8 arquivos** (o "21 usos" do texto anterior estava errado). Disposição:

| Onde | Linhas | Dentro da casca desta fase? | Disposição |
|---|---|---|---|
| `src/styles.css` `.logo` (87) e `.avatar` (183) | 2 | Sim, se algum aparecer na casca do Nexo (`app-shell.tsx` e `_authenticated.admin.tsx` não referenciam as classes; o marcador do Nexo vira o "N" e as pessoas viram `AvatarGerado`) | Em `nexo-system.css`, override `.product-workspace:not(.sap-workspace) .logo, .product-workspace:not(.sap-workspace) .avatar { background: var(--grad-brand) }`. O resto do app fica como está |
| `src/styles.css` `.insight` (211, 213) | 2 | Não (cartão de insight de conteúdo) | Não muda nesta fase; revisão na Phase 9 / v3 |
| `barras.tsx` (2), `diagnostico-campanhas.tsx` (1), `qa.layout.tsx` (2), `_authenticated.$clientId.top.tsx` (1), `.posts.tsx` (8), `.conteudo.tsx` (1), `.audiencia.tsx` (10) | 25 | Não (telas de conteúdo e gráficos) | Não muda nesta fase; revisão na Phase 9 / v3. O planner não toca esses arquivos |

### Sempre claro (sem tema escuro, sem preto)

- O seletor `.product-workspace:not(.sap-workspace)` (e o `:root` das páginas fora da casca) declara `color-scheme: light` e **não tem variante escura**. As regras `:root[data-theme="dark"] ...` e `@media (prefers-color-scheme: dark)` que hoje atingem o Nexo são neutralizadas (removidas ou escopadas só ao SAP).
- Nenhum fundo preto ou quase preto em nenhum estado, inclusive `::backdrop` de diálogo e folha: o fundo atrás do diálogo é `color-mix(in srgb, var(--b6) 55%, rgba(140,144,153,.35))` com `backdrop-filter: blur(2px)` (da prancha, `.drawer .dim`).
- A barra lateral escura (opção S1 do contrato anterior), o painel `ws-priority` petróleo e os valores escuros por token deixam de existir para o Nexo.

### Bloco de tokens para o executor (valores finais; nada a preencher)

```css
/* Nexo (não SAP). Substitui os valores de .product-workspace e o :root de styles.css */
.product-workspace:not(.sap-workspace) {
  color-scheme: light;
  --b1:#1F4FD8; --b2:#4675F0; --b3:#7D9EF6; --b4:#B6C9FB; --b5:#DCE6FD; --b6:#EFF4FF;
  --grad-brand:linear-gradient(135deg,var(--b1) 0%,var(--b2) 140%);
  --grad-tile:linear-gradient(135deg,var(--b2),var(--b3));
  --grad-bar:linear-gradient(90deg,var(--b2),var(--b3));
  --white:#FFFFFF; --frame:#F0F2F4; --field:#F5F6F8; --line:#E8EBEF; --line-2:#DDE1E7;
  --text:#121212; --text-2:#2B2B2D; --muted-ink:#5F6570; --muted-soft:#8C9099; --muted-2:#B4B8BF;
  --control-border:#7C808A;
  --up:#22B07D; --up-bg:#E7F7EF; --up-ink:#0B6B4A;
  --dn:#EF4B5A; --dn-bg:#FDEBED; --dn-ink:#B4233A;
  --or:#F59E0B; --or-bg:#FEF3E2; --or-ink:#8A5100;
  --font:"Urbanist",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  /* aliases dos nomes que o CSS existente já usa (evita editar 80 telas) */
  --page:var(--white); --surface:var(--white); --surface-2:var(--field);
  --ink:var(--text); --ink-2:var(--text-2); --muted:var(--muted-ink);
  --border:var(--line); --grid:var(--line);
  --accent:var(--b1); --accent-hover:var(--b1);
  --accent-pressed:color-mix(in srgb,var(--b1) 88%,var(--text));
  --accent-tint:var(--b6); --accent-ink:#FFFFFF;
  --action-bg:var(--grad-brand); --action-hover:var(--b1); --action-ink:#FFFFFF;
  --focus:var(--b1);
  --good:var(--up-ink); --good-text:var(--up-ink); --warn:var(--or-ink); --crit:var(--dn-ink);
  --shadow:0 1px 2px rgba(18,18,18,.04);
}
```
Notas: (1) `--action-bg` passa a ser degradê; onde o CSS existente usa `background-color: var(--action-bg)`, trocar por `background`. O executor lista essas ocorrências por `grep`. (2) O alias `--muted` aponta para `--muted-ink` (5,86 sobre branco) para que todo texto cinza existente passe 4,5:1 sem edição; o cinza `#8C9099` da prancha existe só como `--muted-soft`. (3) V9: depois deste bloco, nenhum hex solto novo em CSS tocado nesta fase. (4) O bloco não contém `#000`: o escurecimento do estado pressionado usa `var(--text)`.

### Limpeza visual ("telas mais clean") — só CSS, sem mudar marcação das 80 telas

| Antes | Depois | Arquivo |
|---|---|---|
| `.dbx-card` raio 16, padding `20px 22px`, sombra dupla `0 1px 2px + 0 8px 24px`, borda a 45% | fundo `--white`, borda 1 px `--line`, raio 16 (cartão de KPI 14; caixa grande 18), padding 18, sombra `--shadow`; hover: borda `--b5` e sombra `0 10px 24px rgba(31,79,216,.07)` com transição de 200 ms | `databoard.css` |
| `.dbx-bar i` gradiente acento → `#6fa8c9` | `--grad-bar`, altura 12, raio 6, trilho `--field` | `databoard.css` |
| `.dbx-det` raio 14 | raio 14 (já igual), borda `--line` | `databoard.css` |
| `.workspace-dialog` raio 14 / folha 16, sombra `0 24px 100px` | raio 22 (folha: 22 só nos cantos de cima), sombra `0 24px 60px rgba(31,79,216,.14)` (do widget da prancha) | `workspace-navigation.css` |
| Fundo da página `#eaf0f5` | fundo degradê da seção "Fundo da página" | tokens |
| Marcador dourado do item atual | pílula `--grad-brand` | `product-workspace.css` linhas 161 e 172 |
| `.mhead` com `backdrop-filter: blur` e translucidez | fundo `var(--white)` opaco, borda inferior 1 px `--line` | `styles.css` |
| Barra lateral escura `--side` (`#101f30`) | sem fundo: transparente sobre `--frame` | `product-workspace.css` |

---

## Gráficos (sistema reaproveitado pela Phase 9; nenhum entra nas telas da Phase 3)

> Revogação do dono em 09/11/2026: **pizza e medidor semicircular são permitidos** (o brief os proibia). Continuam proibidos pelo brief: eixo duplo, 3D, funil em cone, eixo truncado, projeção. **Rosca** não foi citada na revogação; continua proibida até o João liberar (`.dbx-donut` fica sem uso e não é removido).

| Tipo | Especificação da prancha |
|---|---|
| Colunas (uso por dia) | 7 colunas, gap 8, altura do gráfico 190; coluna de 16 px com raio 8 e `height` animada; cor base `--b5`, intermediária (>40% do máximo) `--b4`, **destacada** `linear-gradient(180deg, var(--b3), var(--b2))` com pílula de valor acima (`--b1` de fundo, branco 12/500, raio 7). Eixo Y 12 px `--muted-ink` (a prancha usa 11 px), eixo X dos dias 12 px |
| Trilhos horizontais (agendaram por canal, uso por plataforma) | Linha com ícone + rótulo 16/400 e valor 14 `--text-2`; trilho de 12 px, raio 6, preenchimento `--grad-bar` animado em largura, resto `--field` |
| Pizza | Círculos com `stroke-dasharray`, `r=25`, `stroke-width=50`, `viewBox -12 -12 144 144`, largura até 240 px; cores na ordem `--b1`, `--b3`, `--b4`, `--b5`, `#EEF0F3`; rótulo de percentual em pílula branca com borda `--line` sobre cada fatia; legenda abaixo (quadrado 14 px raio 4 + rótulo 14 px) |
| Medidor semicircular | Arco de 180°, `R=110`, espessura 46, vão de 2,2° entre segmentos; cores `--b2`, `--b3`, `--b4`, `--b5`, `#E7EAEE`; rótulo de percentual em pílula branca em cada segmento; valor central 40/500 `--text` e legenda 14 `--muted-ink`; legenda lateral em lista |
| Cota (barra de uso) | Trilho 6 px raio 99, fundo `--b6`, preenchimento `--b2` |

Regras de leitura (contrato): todo segmento de pizza e de medidor tem **rótulo de percentual e legenda de texto** (cor sozinha não carrega o dado; as fatias claras `--b5` e `#EEF0F3` têm contraste baixo entre si, então o rótulo é obrigatório). Série de dados usa só a rampa `--b1`..`--b5` mais neutros; nenhum verde/vermelho como cor de série. Número sem selo não entra em gráfico (decisão do conselho; implementação na Phase 6/9).

---

## Movimento (tudo anima ao carregar; vale para o sistema todo)

Todas as animações ficam **dentro de `@media (prefers-reduced-motion: no-preference)`**. Fora dela (ou com `reduce`), o estado final aparece de imediato, sem transição, sem contagem, sem desenho. Padrão: o CSS base descreve o estado final; a animação é acréscimo (nada fica em `opacity: 0` se o script falhar).

| Efeito | Especificação da prancha | Fase em que entra |
|---|---|---|
| Subida dos cartões (`rise`) | `opacity 0→1`, `translateY(10px)→0`, 550 ms, `cubic-bezier(.2,.8,.2,1)`, atraso `índice × 55 ms` (limite de 12 cartões em sequência) | Phase 3: CSS puro em `.dbx-card` das telas existentes e no painel; Phase 9: cartões KPI |
| Contagem de números (`count-up`) | 950 ms, ease-out cúbico (`1 - (1-k)^3`), formato `pt-BR`. O valor final está no DOM desde o início (texto invisível para leitor de tela ou `aria-label`); só a parte visual conta | Phase 9 (hook `useContagem`) |
| Barras e trilhos crescem | `height`/`width` de 0 até o valor, 1,0 a 1,1 s, mesma curva; atraso `0,15 s + i × 50 ms` (trilhos) e `0,2 s + i × 70 ms` (colunas); pílula do valor aparece em 350 ms depois de 1 s | Phase 3: `.dbx-bar i` por CSS (`transform: scaleX` de 0 a 1, origem à esquerda); colunas na Phase 9 |
| Pizza | `stroke-dasharray` de 0 ao comprimento, 700 ms, atraso `0,1 s + i × 0,12 s`; rótulos sobem com `rise` | Phase 9 |
| Medidor | `stroke-dashoffset` do comprimento a 0, 800 ms, atraso `0,15 s + i × 0,14 s` | Phase 9 |
| Cota | largura 0 → valor, 1,2 s, atraso 0,3 s | Phase 9 |
| Hover de cartão | 200 ms em borda e sombra | Phase 3 |
| Abertura de diálogo e folha | fade de até 150 ms com `translateY(8px)→0`; sem animação de saída | Phase 3 |
| Troca de item do menu, abertura de resultado, digitação na busca | **sem animação** (a busca responde em ≤200 ms por tecla) | Phase 3 |

Reexecução: a animação roda quando a tela monta e quando o período ou o filtro muda o conjunto de dados; nunca a cada render. Testes E2E e axe rodam com `reducedMotion: 'reduce'` no Playwright, para medir contraste e posição sem cartões em `opacity` intermediária.

---

## Avatares

Quando a pessoa **não tem foto**, mostrar um avatar 3D gerado: SVG próprio, determinístico a partir do nome. Nunca copiar arte do designer da referência, nunca foto real de paciente.

| Regra | Especificação |
|---|---|
| Componente | `AvatarGerado({ nome, tamanho })` (React, SVG inline, `viewBox 0 0 100 100`). Referência de implementação: função `avatar()` da prancha, que o executor reescreve em TypeScript; os ids de gradiente vêm de `useId()` (a prancha usa contador global) |
| Determinismo | Semente = nome normalizado (sem espaços nas pontas, minúsculas, sem acento). Hash FNV-1a de 32 bits (`2166136261`, multiplicador `16777619`) como na prancha. O mesmo nome gera sempre o mesmo personagem, em qualquer tela e em qualquer sessão. Não se infere gênero pelo nome: o hash só sorteia traços |
| Traços sorteados | 5 tons de pele (cada um com par claro/escuro), 6 cores de cabelo, 5 estilos de cabelo, óculos em 25% dos casos, 6 cores de camisa (a primeira é `--b2`; as outras: branco com gravata escura, `#2B2B2D`, `--or`, `--up`, `--dn`) |
| Fundo | Degradê `--b4` → `--b2` (diagonal), cantos arredondados em 28% do tamanho (rotas de pessoa) |
| Tamanhos | 32 (cabeçalho, mensagem), 40 (lista, rodapé da barra), 86 (ficha). Raio de canto proporcional (`round(tamanho × .28)`) |
| Foto | Pessoa **da equipe ou usuário logado** com foto: `<img>` com `object-fit: cover`, mesmo raio, `alt=""`. **Paciente: sempre avatar gerado, nunca foto**, mesmo que a fonte (WhatsApp, Instagram) traga uma |
| Clínica (não é pessoa) | Tile de 32 px com iniciais (16/500, branco), `--grad-tile`, raio 9. Não usa o personagem |
| Acessibilidade | `aria-hidden="true"`; o nome sempre aparece em texto ao lado |
| Onde entra na Phase 3 | Rodapé da barra lateral (usuário logado, 40 px) e lista de pessoas que a casca exibir. O cabeçalho do celular mostra o tile da clínica, não pessoa |

---

## Layout e interação

### Os 3 itens (nas duas cascas da equipe)

Quem vê: `isAdmin` (equipe Doctor Creator). Médico (owner) e viewer continuam com o menu de hoje: mesma estrutura de itens, só o visual da casca muda (tokens, fonte, moldura).

| # | Rótulo (provisório) | Ícone Tabler 20 px | Destino | Subtelas vivas (nível 2, aparecem só com o item ativo) |
|---|---|---|---|---|
| 1 | Carteira | `IconBriefcase` | `/admin` | nenhuma |
| 2 | Clínica | `IconStethoscope` | `/$clientId` (Resultados da clínica) da última clínica aberta | Resultados da clínica, Relatório do período, Etapas do CRM, Configurar este cliente (máximo 4 linhas) |
| 3 | Conferência e fontes | `IconShieldCheck` | `/admin/conferencia` | Conferência de dados, Integrações (diagnóstico das fontes). A aba "Uso das telas" da Phase 2 mora dentro de Conferência e não vira subtela |

(`IconShieldCheck` é o ícone que a própria prancha usa para "Conferência e fontes".) Os rótulos são provisórios: o card sorting da decisão 11 pode mudá-los. Ficam numa constante única (`ROTULOS_MENU_EQUIPE`) e nunca repetidos como texto solto em teste ou componente (os testes leem a constante).
A distribuição acima das telas vivas nos 3 itens é a proposta do pesquisador a partir da tabela do conselho (Decisão 2). A contagem 14 / 73 / 3 é recontada na Phase 3 contra `src/routeTree.gen.ts` (nota de 09/11 no ROADMAP). Os itens fora dos 3 acima são rotas de acesso (login, redefinir senha, primeiro acesso, OAuth, sem acesso, conhecer, `/r/:slug`), nunca escondidas nem redirecionadas.

Regra do item atual: o destino exato recebe `aria-current="page"`. Qualquer tela `/$clientId/*` (viva ou escondida) deixa "Clínica" em pílula degradê (sem `aria-current`); `/admin/$clientId` também. Tela escondida fora desses grupos (ex.: `/admin/brain`, SAP) não destaca nenhum item. O cabeçalho da página continua mostrando o eyebrow "Nexo / {área antiga}".

"Clínica" a partir da casca `/admin` sem clínica lembrada: leva a `/admin` e mostra acima da lista uma linha de ajuda (14/20, `--muted-ink`): "Escolha uma clínica para abrir os resultados dela." (decisão de armazenamento da "última clínica" fica com o planner; ver UI Considerations).

O seletor Nexo/SAP (`TrocaProduto`) sai das duas barras e da folha "Menu". O SAP deixa de ser item de menu (fica escondido e congelado, decisão 5 pendente) e passa a ser achado pela busca com o chip `congelado`. A casca do SAP em si e o host `sap.` não mudam.

### Ponto focal

- **Computador:** a pílula degradê do item atual na barra lateral. É o único elemento saturado em toda a moldura cinza e branca; o olho vai a ela e depois ao título do painel. O campo "Buscar tela" é o segundo ponto de atenção (único campo com borda de controle).
- **Celular:** o botão "Buscar tela" no cabeçalho (único botão com texto de marca ao lado do nome da clínica e do botão "Menu", que é só ícone).
- **Diálogo de busca:** o campo de texto, que recebe o foco ao abrir; a lista de resultados vem logo abaixo e nenhum chip compete com o título do resultado (chip é neutro e tracejado).

### Computador (acima de 820 px)

Barra lateral de 232 px **sobre a moldura** (sem fundo próprio; 76 px recolhida, comportamento existente), de cima para baixo:
1. Marca: símbolo "N" em degradê da prancha (28 x 32 px, `linear-gradient(180deg, var(--b1), var(--b2))` com `clip-path: polygon(0 0,36% 0,36% 42%,74% 0,100% 0,100% 100%,64% 100%,36% 60%,36% 100%,0 100%)`) + palavra "Nexo" em 30 px / 400 / 36 px, `letter-spacing:-.02em`, padding `2px 10px 22px` (da prancha). Botão recolher à direita, 44 x 44, `IconChevronLeft`/`IconChevronRight`. Páginas públicas mantêm a marca atual.
2. Campo "Buscar tela" (`.kbar`, 44 px, raio 12, fundo `--field`, borda 1 px `--control-border`, ícone `IconSearch` 16 px, texto 16/24 `--muted-ink`, dica `Ctrl K` ou `⌘ K` conforme o sistema, 14/20 500 `--muted-ink`, `aria-hidden`). Abre o diálogo de busca.
3. `nav` "Menu da equipe": os 3 itens de 46 px, gap 2 px (da prancha), padding horizontal 14, ícone 20 px, gap 12 px, raio 12, texto 16/400 `--text`.
4. Subtelas do item ativo: lista de 44 px, recuo de 46 px (alinha com o texto do item), traço vertical de 1 px `--line-2` à esquerda; texto 16/400 `--text-2`; subtela atual `--b1` 500.
5. Divisor `.sep` (1 px `--line-2`, margem 12 8) e rodapé: "Conheça o Nexo" (link de 46 px), "Sair da conta" (`IconLogout`, 46 px) e, ao fim da coluna (`margin-top:auto`), o bloco do usuário: `AvatarGerado` 40, nome 16/20 `--text`, e-mail 14 `--muted-ink`. Não há "Aparência".

Recolhida (76 px): só ícones de 20 px centralizados, 48 x 48, `title` e texto `sr-only` com o rótulo; símbolo "N" sem a palavra; subtelas e o campo de busca viram o ícone `IconSearch` (48 x 48).

Os blocos "Explorar análises e ferramentas", "Em {área}", "Equipe e configuração" e o grupo "Marketing" com 14 telas deixam de existir para a equipe. As faixas de áreas da casca `/admin` (3 grupos, 9 itens) viram os mesmos 3 itens; o bloco `details.ws-admin-menu` do celular na casca `/admin` é substituído pelo cabeçalho do celular abaixo.

### Celular (820 px ou menos)

Sem barra inferior para a equipe (brief: "Sem barra inferior"). Alternativa registrada e não adotada: barra inferior de 4 posições (3 itens + Buscar). Só reabre por decisão do João.

Cabeçalho fixo de 56 px, margem lateral 16 px, fundo `--white` opaco, borda inferior 1 px `--line`:
`[tile da clínica 32] [nome da clínica, 16/24 500, truncado] [Buscar tela] [Menu]`

- **Buscar tela:** `.ws-action--secondary` no estilo contorno `cta out` (fundo branco, texto `--b1`, borda 1 px `--b4`, raio 10), ícone `IconSearch` 20 px + texto "Buscar tela" 16/500 sempre visível (nunca só ícone, mesmo rótulo do campo do computador), altura 44 px, largura mínima 44 px, padding 0 12. É o único caminho de busca no celular (não há Cmd+K).
- **Menu:** `.icobtn` 44 x 44 (`.sq`: borda 1 px `--line-2`, raio 10, fundo branco), ícone `IconMenu2` 20 px, `aria-label="Abrir menu"`, `aria-haspopup="dialog"`.
- O seletor de período (`periodo-chip`) segue onde está hoje, abaixo do cabeçalho, nas telas que o usam.
- Em tela de 360 px ou menos, o nome da clínica trunca com reticências antes de qualquer botão perder o texto.

Folha "Menu" (`BottomSheet`, título "Menu", 24/32 500, cantos de cima com raio 22, fundo branco): 3 linhas de 56 px (ícone 20, rótulo 16/24 400, `IconChevronRight` 16 à direita; a linha do item atual é a pílula `--grad-brand` com texto branco), seguidas por divisor e, nesta ordem, "Trocar de clínica" (linha `.mais-item`, 48 px) e "Sair da conta". As subtelas do item ativo aparecem recuadas abaixo dele, 48 px cada. Contêiner com `data-origem="menu"`.

### Busca de telas (diálogo, nas duas plataformas e nas duas cascas)

Abertura: Cmd+K / Ctrl+K (alterna), clique no campo "Buscar tela" (computador), botão "Buscar tela" (celular). Fecha com Esc, clique fora ou escolha de resultado. O foco vai para o campo ao abrir e volta ao botão que abriu ao fechar (`<dialog>` nativo faz isso).

Estrutura (`BottomSheet`, título "Buscar tela" 24/32 500; fundo branco, raio 22, sombra suave azulada; nada preto atrás):
1. Rótulo "Nome da tela ou assunto" (14/20 500) + campo `type="search"` (44 px, 16/24, fundo `--field`, borda 1 px `--control-border`, raio 12) com placeholder "Ex.: funil, relatório, integrações" (`--muted-ink`).
2. Linha de estado (`role="status"`, 14/20, `--muted-ink`): "{n} telas encontradas" / "1 tela encontrada". Sem texto digitado: "Todas as telas continuam disponíveis aqui. Digite o nome ou o assunto."
3. Lista de resultados (`nav` rotulada "Resultados da busca", `data-origem="busca"`): cada linha é um link de 56 px no mínimo, padding 12, raio 12, hover `--b6`, ícone Tabler da tela 20 px, título 16/24 500 (máx. 1 linha, reticências), linha de apoio 14/20 `--muted-ink` (área antiga · descrição, máx. 2 linhas com reticências), à direita os chips e `IconArrowRight` 16 px.
4. Rodapé do diálogo, só quando a lista tem ao menos um "sem selo": "Telas “sem selo” mostram números que ainda não têm selo de confiança." (14/20, `--muted-ink`).
5. Abaixo da lista, `details` fechado "Ver todas as telas ({N})" com as telas agrupadas pelas áreas antigas (Resultados, Marketing, Comercial, Plano de ação, Relatórios, Administração, SAP). É o caminho para quem não sabe o nome. Não é item de menu e não existe fora da busca; toda abertura aqui grava origem `busca`.

Conteúdo da busca para a equipe:
- Indexa as telas vivas, as escondidas (as 73) e o SAP, sem aplicar os filtros de fonte, `soCrm` e `semAudiencia` que hoje escondem telas por clínica. Uma tela que depende de fonte que a clínica não tem aparece com a linha de apoio "Sem {Instagram|anúncios|CRM|atendimento} nesta clínica" e continua abrindo (a própria tela tem o estado vazio). Assim o teste "73 abrem" não depende da clínica.
- As 3 telas tiradas não aparecem na busca nem no menu.
- Ordem: título começa com o termo > título contém > descrição ou termos; empate: vivas antes de escondidas, depois a ordem do registro.
- Filtro local sobre o registro (sem rede), com resposta em até 200 ms por tecla.

Teclado: do campo, `↓` vai ao primeiro resultado; `↑` e `↓` percorrem os resultados; `Enter` no campo abre o primeiro resultado; `Tab` percorre normalmente. Resultado selecionado tem o mesmo estilo do hover mais o anel de foco.

Chips (`.nx-chip`, 14/20 500, altura 28 px, padding 4 px 8 px, raio 6, ícone 16 px + texto, nunca só cor):
- `sem selo`: ícone `IconShieldOff`, fundo `--field`, texto `--text-2` (13,07 sobre `--field`), borda 1 px **tracejada** `--muted-soft` (borda decorativa; o ícone e o texto identificam). `aria-label` "Número sem selo de confiança". Vem do campo `semSelo: true` do registro (Pacientes do período, Resultados da clínica, Resultados dos anúncios, Funil comercial, Relatório do período, Resultados por origem). Nesta fase o chip é um rótulo estático do registro; nenhuma tela calcula selo (a tabela `metricas_selo` só existe na Phase 6). Quando a Phase 6/9 ligar o selo real, o chip passa a ler de lá e o visual é reconciliado com os 4 estados do selo.
- `congelado` (SAP): ícone `IconSnowflake`, mesmas cores e borda tracejada. Mesma largura mínima, mesmo lugar.

O aviso "sem selo" dentro da própria tela (MENU-05) é da Phase 9; não entra aqui.

Chips do sistema (para a Phase 9, da prancha; ver tamanhos reservados em Typography): variação em pastel com ícone triangular de 9 px — alta `--up-bg` + `--up-ink`, queda `--dn-bg` + `--dn-ink`, atenção `--or-bg` + `--or-ink`, azul `--b6` + `--b1`, neutro `--field` + `--text-2`; raio 6, 12/18 500 (reconciliar com a regra de 14 px na Phase 9). A variação sempre traz sinal e ícone, não só cor.

### Rotas tiradas e rotas de acesso

- As 3 rotas tiradas redirecionam (substituição de histórico, `replace`) para a tela certa, preservando `preset`, `from`, `to` e demais parâmetros de período; sem aviso, sem toast, sem 404. O destino de cada uma é um campo `destino` no registro, conferido pelo teste.
- `/login`, `/reset-password`, `/bem-vindo`, `/oauth/consent`, `/sem-acesso` e `/r/:slug` nunca recebem `situacao` escondida ou tirada e abrem exatamente como antes (teste dedicado).

### Estados dos controles (5 estados do botão, adaptados da prancha)

| Estado | Item do menu | Campo "Buscar tela" | Botão "Buscar tela" / "Menu" | Botão primário (`cta`, a partir da Phase 9) |
|---|---|---|---|---|
| Padrão | texto `--text`, sem fundo | fundo `--field`, borda `--control-border` | fundo branco, texto `--b1`, borda `--b4` ("Menu": borda `--line-2`, ícone `--text`) | `--grad-brand`, texto branco |
| Hover | fundo `color-mix(in srgb, #fff 60%, transparent)` sobre a moldura (texto `--text`, 17,93) | fundo `--white` | fundo `--b6`, borda `--b3` | fundo sólido `--b1` com sombra `0 8px 20px rgba(31,79,216,.30)` (**contrato:** a prancha clareia o botão para `--b3`→`--b4`, o que deixa o branco com 2,59:1; aqui o hover escurece) |
| Foco | anel 2 px `--b1`, offset -2 | anel 2 px `--b1`, offset 3 | anel 2 px `--b1`, offset 3 | `box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--b1)` (da prancha) |
| Pressionado | pílula em `--b5` | fundo `--b5` | fundo `--b5` | `--accent-pressed` (`--b1` 88% + `--text` 12% = `#1D48C0`, branco sobre ele 7,66:1) e `scale(.98)` (**contrato:** a prancha usa `--b3` com texto branco, 2,59:1) |
| Atual | pílula `--grad-brand`, texto e ícone brancos, `aria-current="page"` | (não se aplica) | (não se aplica) | (não se aplica) |
| Desabilitado | não existe item desabilitado no menu | não se aplica | não se aplica | fundo `--b6`, texto `--b4` (como na prancha; controle desabilitado está isento de contraste) |

### Marcas de origem para o log da Phase 2 (manter)

`data-origem="menu"` em: `<aside aria-label="Menu principal">`, `<aside aria-label="Menu do admin">` (substituído pelo menu compartilhado), folha "Menu" e `nav` de subtelas. `data-origem="busca"` na `nav` "Resultados da busca" (inclui o `details` "Ver todas as telas"). Não usar outro atributo. O listener de clique da Phase 2 lê `closest('[data-origem]')`; o novo `MenuEquipe` e `BuscaDeTelas` herdam os atributos nos contêineres, não nos links.

### Desempenho

Abrir menu ou busca não faz consulta de rede nem recalcula o registro além do filtro local (a Phase 2 mede o INP do menu). Animações usam só `opacity`, `transform` e `stroke-dash*` (sem layout). A fonte usa `display=swap`.

---

## Copywriting Contract

Língua: português do Brasil, tom direto, verbos no infinitivo ou no imperativo curto. Sem "sync", "connection", "token", "endpoint", "rota". Nenhuma frase desta fase descreve resultado clínico, promete ou prevê.

| Element | Copy |
|---------|------|
| Primary CTA da fase | "Buscar tela" (botão do celular e campo do computador: o mesmo rótulo nas duas plataformas) |
| Itens do menu da equipe | "Carteira", "Clínica", "Conferência e fontes" (provisórios até o card sorting, decisão 11) |
| Título da folha de navegação | "Menu" |
| Título do diálogo de busca | "Buscar tela" |
| Rótulo do campo | "Nome da tela ou assunto" |
| Placeholder | "Ex.: funil, relatório, integrações" |
| Estado antes de digitar | "Todas as telas continuam disponíveis aqui. Digite o nome ou o assunto." |
| Contagem de resultados | "{n} telas encontradas" / "1 tela encontrada" |
| Empty state heading | "Nenhuma tela encontrada" |
| Empty state body | "Tente outra palavra, como “funil”, “relatório” ou “integrações”. Também dá para abrir “Ver todas as telas”." |
| Chip sem selo | "sem selo" |
| Nota do chip (rodapé do diálogo) | "Telas “sem selo” mostram números que ainda não têm selo de confiança." |
| Chip SAP | "congelado" |
| Tela sem a fonte da clínica | "Sem {Instagram / anúncios / CRM / atendimento} nesta clínica" |
| Lista de todas as telas | "Ver todas as telas ({N})" |
| Clínica sem clínica lembrada | "Escolha uma clínica para abrir os resultados dela." |
| Botão do cabeçalho do celular (menu) | `aria-label` "Abrir menu" |
| Rodapé da barra lateral | "Conheça o Nexo", "Sair da conta" |
| Error state | A busca é local e não falha por rede. Se o registro de telas não carregar (erro de código), mostrar no lugar da lista: "Não foi possível mostrar as telas. Recarregue a página; se continuar, avise a equipe do Nexo." |
| Destructive confirmation | Nenhuma ação destrutiva nesta fase. Esconder e tirar telas não apaga nada nem pede confirmação ao usuário (é decisão de registro, revisável) |

---

## UI Considerations

> Estados da interface por elemento. Os textos de vazio e erro estão em Copywriting Contract e não se repetem aqui.

Applicable state considerations resolved: 12 covered, 4 backstop, 3 unresolved

Probe (`ui-consideration-probe.cjs`, 09/11/2026) rodado sobre 7 elementos (menu, botão Buscar tela, diálogo de busca, chips, folha Menu, avatar gerado, redirects): as categorias levantadas (empty, loading, error, populated, partial, overflow, zero-one-many, long-text) estão cobertas pelas linhas abaixo; os 3 itens ⚠ continuam como suposições para o planner.

| Category | Element(s) | Status | Resolution / Reason |
|---|---|---|---|
| empty | Lista de resultados da busca (sem texto) | ✅ covered | Sem texto digitado, a lista mostra a frase "Todas as telas continuam disponíveis aqui…" e o `details` "Ver todas as telas"; nunca uma lista vazia sem explicação |
| empty | Lista de resultados da busca (sem resultado) | ✅ covered | Mostra o estado vazio do Copywriting Contract com `ws-empty`, e o `details` continua disponível |
| zero-one-many | Contagem de resultados | ✅ covered | Singular para 1 ("1 tela encontrada"), plural para 2 ou mais; com 0 resultados a linha de contagem dá lugar ao estado vazio do Copywriting Contract |
| populated | Lista de resultados | ✅ covered | Com 81 telas o filtro vazio mostra o `details` fechado; com termo, a lista é limitada pela rolagem interna do diálogo (altura máxima 85 dvh) |
| overflow | Lista de resultados e diálogo | 🧪 backstop | Rolagem interna do diálogo no celular e no computador, sem rolagem horizontal; verificar a 375 px e a 1440 px com 81 resultados |
| long-text | Título e apoio do resultado | 🧪 backstop | Título em 1 linha com reticências; apoio em 2 linhas com reticências; teste visual a 375 px com o título mais longo do registro |
| long-text | Rótulo "Conferência e fontes" | 🧪 backstop | Na barra recolhida só o ícone aparece (rótulo em `sr-only`); no celular e na barra aberta de 232 px o rótulo cabe em 1 linha (16 px, ícone 20, padding 14); verificar por captura a 320 px e a 232 px |
| overflow | Nome da clínica no cabeçalho do celular | ✅ covered | Trunca com reticências antes de os botões "Buscar tela" e "Menu" perderem o texto |
| loading | Nome da clínica no cabeçalho | ✅ covered | Mantém o texto atual "Carregando…" enquanto o nome não chega; o menu e a busca funcionam sem esperar (registro local) |
| partial | Resultados cuja fonte a clínica não tem | ✅ covered | Aparecem com a linha "Sem {fonte} nesta clínica" e continuam abrindo; nunca somem por filtro |
| error | Registro de telas | ✅ covered | Mensagem do Copywriting Contract no lugar da lista; o menu de 3 itens não depende dele |
| error | Rota tirada sem destino | ✅ covered | O teste do registro falha se algum `destino` não existir; nenhum 404 chega ao usuário |
| partial | Item "Clínica" a partir da casca `/admin` sem clínica lembrada | ⚠ unresolved | Contrato diz: ir a `/admin` com linha de ajuda. O planner decide onde guardar a "última clínica" (hoje não há chave de armazenamento) e confirma que o fluxo cabe |
| partial | Papel `strategist` sem ser admin do app | ⚠ unresolved | Hoje as telas "equipe" aparecem para `papel` diferente de owner e viewer (`nav.ts:451`). O contrato fala em `isAdmin`. O planner confirma se o estrategista não admin recebe o menu de 3 itens ou o de hoje |
| partial | Preferência de tema escuro e de cor de destaque já salva no navegador (`dc:tema`, `dc:accent`) | ⚠ unresolved | Contrato: o Nexo ignora as duas (sempre claro, Cobalto fixo) e o controle "Aparência" sai das cascas do Nexo. O planner decide se remove o uso do hook `use-theme` na casca do Nexo ou só neutraliza no CSS, e confirma que o SAP continua funcionando com ele |
| motion | Animações de entrada | ✅ covered | Só dentro de `prefers-reduced-motion: no-preference`; estado final é o CSS base; E2E e axe rodam com `reducedMotion: 'reduce'` |
| contrast | Texto branco sobre o degradê de marca | ✅ covered | Fim do degradê em 140% garante 4,75:1 no pior ponto (medido); verificação V11 |
| empty | Pessoa sem foto | ✅ covered | `AvatarGerado` do nome; nunca círculo vazio, nunca foto de paciente |
| loading | Troca de fonte (Urbanist com `display=swap`) | 🧪 backstop | Barra lateral de largura fixa (232 px); verificar que o menu e o cabeçalho do celular não mudam de largura nem quebram linha ao trocar a fonte (captura com a fonte bloqueada e liberada) |

---

## Verificações de aceite (para o plano e para o print do site no ar)

| # | Verificação | Critério do ROADMAP |
|---|---|---|
| V1 | Equipe (admin) vê exatamente 3 links no `nav` "Menu da equipe" a 1440 px e na folha "Menu" a 375 px, nas duas cascas; viewer/owner vê os mesmos itens de hoje, sem diferença de estrutura | 1 |
| V2 | Para cada uma das telas escondidas do registro, a busca encontra e abre; a linha gravada pela Phase 2 tem `origem = busca`. O teste E2E abre uma por área antiga e o teste de registro cobre as 73 | 2 |
| V3 | Botão "Buscar tela" visível a 375 px (e a 320 px, com o nome da clínica truncado), com texto, 44 x 44 ou mais, nas duas cascas | 2 |
| V4 | Chip "sem selo" nas 6 telas listadas; nenhuma outra tela o recebe | decisão 3 do conselho |
| V5 | 3 redirects chegam ao destino com o período preservado; 6 rotas de acesso abrem como antes; `git diff` sem mudança em `sap_*` e na casca/host do SAP (inclui o tema escuro do SAP intacto) | 3 |
| V6 | Teste do registro: 14 vivas + 73 escondidas + 3 tiradas contra o conjunto medido em `routeTree.gen.ts` | 4 |
| V7 | axe `wcag2a` + `wcag2aa` sem violação no menu, na folha e no diálogo, a 375 e 1440 px (só tema claro), com `reducedMotion: 'reduce'`; sem rolagem horizontal nas telas existentes depois do corpo de 15 para 16 px | acessibilidade |
| V8 | Print do site no ar conferido: menu da equipe no computador e no celular e uma tela escondida aberta pela busca. Comparação lado a lado com a prancha aprovada (moldura, barra sobre a moldura, pílula degradê, Urbanist) | 5 |
| V9 | Nenhum hex solto novo em CSS desta fase (`grep -nE '#[0-9a-fA-F]{3,8}'` nos arquivos tocados só acha o bloco de tokens) | tokens |
| V10 | Os `e2e` existentes `navigation-architecture.spec.ts` e `workspace-navigation.spec.ts` (que hoje esperam 3 áreas, 14 telas de Marketing e o diálogo "O que você quer fazer?") são atualizados para o menu novo; o fluxo do médico continua passando sem mudança | regressão |
| V11 | Contraste medido de texto sobre `--grad-brand` (item atual, botão) ≥ 4,5:1 nos dois extremos e no meio; nenhum texto normal sobre `--grad-tile`, `--b2`, `--b3` ou `--b4` | acessibilidade |
| V12 | Sempre claro: nenhuma regra `prefers-color-scheme: dark` nem `data-theme="dark"` atinge `.product-workspace:not(.sap-workspace)`; nenhum `background` preto ou quase preto fora do bloco de tokens (`grep` por `#000`, `#0` e `#1` de 3 e 6 dígitos nos arquivos tocados, **excluindo explicitamente o bloco de tokens da seção Color**, onde `--text:#121212` existe como cor de texto e não de fundo; o bloco em si não tem `#000`); `::backdrop` do diálogo é o da seção Color | decisão do dono |
| V13 | `AvatarGerado` com o mesmo nome produz o mesmo SVG em duas renderizações e em duas telas; nome diferente produz traços diferentes; paciente nunca renderiza `<img>` de foto | decisão do dono |
| V14 | Com `prefers-reduced-motion: reduce` nenhum elemento fica em `opacity` menor que 1 nem em `transform` deslocado; sem a preferência, os cartões sobem em sequência e `.dbx-bar i` cresce | decisão do dono |

---

## Escolhas pendentes (resumo para o João)

| # | Escolha | Estado |
|---|---|---|
| P1 | Tom do azul | **Fechada em 09/11/2026: Cobalto** (`#1F4FD8`, rampa `--b1`..`--b6`, degradê 135° b1→b2 nos elementos de marca) |
| P2 | Barra lateral | **Fechada em 09/11/2026: sobre a moldura cinza-clara `#F0F2F4`, sem fundo próprio, como na referência.** A opção escura (S1) foi descartada |
| P3 | Rótulos dos 3 itens | Carteira, Clínica, Conferência e fontes; manter até o card sorting. **Depende da decisão 11** (única escolha em aberto; não bloqueia a fase) |

Nenhuma escolha do João bloqueia a Phase 3. Decisões que o pesquisador tomou dentro do sistema aprovado e que o João pode reverter sem refazer o contrato (todas listadas porque mudam algo visível em relação à prancha):

| # | Decisão | Motivo |
|---|---|---|
| D1 | O cinza de rótulo `#8C9099` da prancha fica só para texto decorativo ou redundante; texto que informa usa `#5F6570` | `#8C9099` dá 3,20:1 sobre branco e 2,85:1 sobre a moldura (WCAG pede 4,5:1). A diferença visual é pequena |
| D2 | Fim do degradê de marca em 140% em vez de 100% | Texto branco sobre `#4675F0` puro dá 4,15:1; com 140% o pior ponto dá 4,75:1 |
| D3 | Hover e pressionado do botão primário escurecem (a prancha clareia) | O branco sobre `--b3` dá 2,59:1 |
| D4 | Texto de chip de variação usa as tintas `--up-ink`, `--dn-ink`, `--or-ink` (a prancha usa o verde, vermelho e laranja puros sobre pastel) | Os puros dão 2,50, 3,14 e 1,96:1 |
| D5 | Corte da barra lateral para cabeçalho do celular em 820 px (a prancha corta em 1000 px) | É o corte que o app já usa; a equipe precisa do menu em tablet |
| D6 | Título de painel em 24 px (a prancha usa 22) e eixos em 12 px, reservados à Phase 9 (a prancha usa 11) | Ficar na escala 40 / 24 / 16 do dono e não passar abaixo de 12 |
| D7 | Rosca continua proibida; só pizza e medidor foram liberados | A revogação do dono citou pizza e medidor |
| D8 | Controle "Aparência" sai das cascas do Nexo | Não existe mais tema escuro |

Para o planner: (a) escolher entre `@tabler/icons-react` e SVG inline (seção Design System); (b) decidir a hospedagem da fonte (link do Google Fonts como na prancha ou arquivo próprio); (c) resolver as 3 linhas "unresolved" das UI Considerations.

Ordem de execução sugerida: (1) registro `situacao` + busca + menus (independe do visual, usa só variáveis); (2) bloco de tokens, fonte e moldura (já com os valores finais); (3) limpeza visual, avatar gerado e movimento; (4) E2E, axe e prints, comparando com a prancha. Não há mais prancha de cores a fazer: a escolha está feita.
Esta fase só começa a esconder telas depois dos 7 dias de log gravando em produção (D-14 de `02-CONTEXT.md`); a parte visual pode andar antes.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | nenhum (shadcn não inicializado) | not applicable |
| Terceiros | nenhum bloco de interface. Pacote de ícones `@tabler/icons-react` (opção A) é dependência npm, não registro de componentes | not applicable — nenhum bloco de terceiros declarado nem usado; a decisão sobre a dependência de ícones é do planner |

---

## Checker Sign-Off

Preenchido só pelo gsd-ui-checker. Nenhuma dimensão foi marcada pelo pesquisador.

- [ ] Dimension 1 Copywriting
- [ ] Dimension 2 Visuals
- [ ] Dimension 3 Color
- [ ] Dimension 4 Typography
- [ ] Dimension 5 Spacing
- [ ] Dimension 6 Registry Safety
- [ ] Dimension 7 Inventory Provenance

**Approval:** pending (aguarda o checker; paleta e barra lateral já decididas pelo João)
