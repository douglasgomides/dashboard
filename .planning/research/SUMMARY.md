# Project Research Summary

**Project:** Nexo v5.0, Fase 0 + degrau v1 (clínica-piloto Lana)
**Domain:** painel de decisão para clínicas médicas no Brasil, brownfield: SPA React 19 + TanStack Router/Query, Supabase com RLS, dispatcher em função Vercel Hobby (`api/sync/manual.ts`)
**Researched:** 2026-11-09
**Confidence:** MÉDIA (ALTA no que foi lido no código e nas migrations; BAIXA no que depende de produto, Kommo em produção, Meta e jurídico)

## Executive Summary

O v5.0 não é um produto novo: é uma camada de confiança e uma tela de decisão sobre um painel que já tem a maior parte da infraestrutura. A stack não precisa de nenhuma dependência npm nova. Log por rota, selo, endpoint `hoje`, tela Hoje, lista de contato e job semanal são tabelas, uma migration por item, um ramo no dispatcher existente, um componente sobre as classes `dbx-*` e uma configuração de agendamento. O maior risco técnico é o limite de 12 funções da Vercel Hobby, que já está no máximo: nenhum arquivo novo em `api/`; tudo entra como `alvo` ou ramo de query no dispatcher, com `import()` dinâmico.

A recomendação de arquitetura: o selo é sempre gravado em `metricas_selo`, nunca calculado na tela; o endpoint `hoje` lê tabelas e caches prontos (`resultado_pronto`, `resultados_diarios`), nunca recalcula conta pesada; a máscara de nomes da lista é feita no servidor, e o log de abertura da lista é gravado na mesma requisição, com falha fechada. O log por rota é a primeira entrega de código porque ele é o relógio das decisões de corte (73 rotas escondidas, SAP em 90 dias), e nenhuma tela deve ser escondida antes de ele estar gravando e verificado em produção.

Os riscos principais são de definição e de dado. A conferência da Lana mostrou que os números batem com definições que a tela não explica (Agendaram 11 acumulado vs 7 que entraram; Foram 14 vindo de vendas; 10 de 13 vendas sem valor; 39% dos cartões removidos na origem). Enquanto as 4 definições não forem fechadas pelo João, nenhum número pode ser verde; a construção pode avançar com selo âmbar/neutro e os dois números escritos, mas a liberação espera. Os demais riscos: vazamento de dado de paciente pela API (máscara só no front), reconciliação que compara definições diferentes, limites do Kommo sem trava global entre instâncias, CFM/linguagem (previsão e adjetivo) e LGPD (lista de pessoas que escreveram a uma clínica é dado referente à saúde; a base legal do acesso nominal da equipe é a decisão 10, não é decisão de UI).

## Decisões abertas do João bloqueadas (NÃO resolvidas nesta síntese)

Nenhuma das 12 decisões foi respondida ou assumida.

| # | Decisão (resumo) | Bloqueia | Sem ela, segue |
|---|------------------|----------|----------------|
| 1 | As 4 definições da Fase 0: (a) Agendaram = entrou (7) ou chegou ao menos (11); (b) Foram = passou pela etapa (0) ou também vendeu (14); (c) venda sem valor conta como venda; (d) par lado a lado | Selo verde de Agendaram/Fecharam; `definicao_versao = 1`; rótulos do `hoje` e da tela; metas (versão); verde do job Kommo; números do resumo | Job calcula as duas contagens; selo versão 0 em âmbar com os dois números; nada verde |
| 2 | Confirmar com a equipe da Lana se "Incoming leads" do funil "Atendimento Clínico" é venda | Correção 7 da Fase 0 (ajuste do perfil de etapas); números históricos de venda | Resto do roadmap; número de Fecharam fica sob suspeita |
| 3 | Quais telas saem de vez (além das 3 do brief) | Lista final do menu (73 escondidas); decisão de corte e de "0 acessos em 90 dias" (v2/v3) | Esconder (flag) sem apagar; log já gravando |
| 4 | Paleta: azul `#2563EB` com barra escura ou lilás/roxo | Acabamento visual final da Tela Hoje | Identidade atual; roxo só em IA |
| 5 | Algum cliente foi vendido com SAP? | Esconder SAP por cliente; redirect SAP em `_authenticated.index.tsx` | SAP congelado para todos, sem remover rota |
| 6 | Rodar o SQL de `metricas_selo` (com texto curto), das metas e do opt-in do resumo | Primeiras linhas reais de selo em produção; seed de metas; opt-in (v1.5) | Código degrada ("tabela ausente = não medido"); tela mostra neutro |
| 7 | Autorizar o job Kommo (depois FlwChat e Digisac) e pedir o template à Meta | Agendamento em produção (Fase 6); pedido do template (Fase 9) | Job construído e testado sem rodar em produção |
| 8 | Piso de cobertura de `post_id`/`ad_id` e limite de casamento conversa→card | Condição 2 do "Quem chamar" (Fase 7); thresholds da Fase 2 | Hoje v1 não depende; Quem chamar não libera sem ele |
| 9 | Lista fechada de verbos e templates de texto | Frase da Tela Hoje (Fase 5); resumo em sombra (Fase 8); template Meta (Fase 9); deny-list CFM em CI | Frase mínima como template, com teste de lista proibida |
| 10 | Base contratual do acesso nominal da equipe à lista (LGPD) | Lista "Quem chamar" inteira (Fase 7); máscara "primeiro nome" | Lista só com iniciais para médico e contagem para agência; Fase 7 fica em design |
| 11 | Protótipo 400px com dados da Lana, teste de 10 s com 3 médicos, card sorting sobre os 3 itens de menu da equipe | Aceite visual da Tela Hoje (Fase 5); rótulos finais da equipe | Layout pela regra do sistema visual; protótipo com dado agregado ou sintético |
| 12 | Confirmar a chave de IA antes da v3 | Nada na v1 | Nada; só v3 |

## Key Findings

### Recommended Stack

Zero pacotes novos. Reuso: `router.subscribe('onResolved')` (TanStack Router 1.170.45) para o log; `supabase-js` 2.112.3 com insert direto sob RLS; Postgres com RLS no padrão de `conferencia_ao_vivo`, `clinica_metas`, `resultados_diarios`; `pg_cron` já em produção (guardado por `pg_available_extensions`); `.dbx-bar` (8px); Cmd+K existente (`app-shell.tsx` + `buscarTelas` em `src/lib/nav.ts`); Zod 4.6.7 (lockfile). O `node_modules` local tem Zod 3.25.76: rodar `npm ci` antes de mexer em schemas.

- `router.subscribe('onResolved')`: um gancho para as 90 rotas, inclusive escondidas; registra a abertura inicial também. Logar o padrão da rota, nunca a URL nem query string.
- `supabase.from(...).insert(...)` direto do navegador: uma requisição, sem função Vercel. `sendBeacon` não serve: não leva o JWT.
- Tabelas + RLS em migrations idempotentes: `metricas_definicao`, `metricas_selo`, log de rotas, `quem_chamar_liberacao`, `lista_acessos`, `lista_acesso_nominal`, `resumos_semanais_sombra`.
- Dispatcher `api/sync/manual.ts` com novos `alvo` (`hoje`, `quem_chamar`) e ramos de query: o limite de 12 funções impede arquivo novo.
- Agendamento semanal: ver "Escolha em aberto". A pesquisa não escolhe.
- Verificação: SQL de leitura em `supabase/verificacao/` (`set default_transaction_read_only = on`), padrão de `scripts/alertas/verificar.sql`.

Restrições: Vercel Hobby cron mínimo diário, precisão por hora, semanal permitido, sem retry, pode falhar ou duplicar, só em produção, GET; docs de 2026-08-11 marcam Cron Jobs como "legacy". Graph API `meta-graph-versao.ts` (v26.0); limite de 100 criações de template por hora por conta.

Não usar: `cmdk`/`kbar`/`fuse.js`; Recharts na Hoje; Vercel Analytics/PostHog/Plausible para o log; feature-flag service; `pg_net` a partir do `pg_cron`; `CRON_SECRET` igual ao `SYNC_SECRET`; LLM (`ia.ts`) na v1; reusar `mascarar-pii.ts` para nomes (só mascara e-mail/CPF/telefone); arquivo novo em `api/`.

### Expected Features

**Table stakes:**
- Log por rota: rota-padrão (sem id), clínica, papel, horário, sessão e origem (menu, cmdk, link/url, redirect). Retenção bruta de pelo menos 120 dias (o relógio de 90 dias do SAP precisa disso).
- Consultas de verificação: mesma definição de data dos dois lados (data do evento na origem), fuso `America/Sao_Paulo`; timestamp por fonte do último dado gravado (separado da última tentativa); cobertura de `post_id`/`ad_id`. Em job ou tabela, nunca por linha na tela.
- `metricas_selo`: 4 estados (verde, neutro, âmbar, não medido), texto curto com data, por clínica × métrica × versão; verde expira em 30 dias; "não medido" nunca vira zero; ícone + texto sempre. "O que este número conta" em uma frase ao tocar.
- Endpoint `hoje`: status por bloco (ok, desatualizado, erro, não medido, vazio, sem selo), hora do dado e selo por bloco; nunca recalcula conta pesada.
- Tela Hoje: frase-resumo de modelo fixo, no passado, sem adjetivo, herda o pior selo; faixa de fontes com hora ("cálculo de 03:30 de ontem"); estados de carregamento (após 3 s: "Calculando, clínica grande leva até 30 s"), vazio (diz a condição que falta) e erro dentro do bloco; meta "12 de 20, faltam 8 em 9 dias" (sem projeção); funil com destaque de queda só se monotônico e sem etapa não medida, senão "funil inconsistente nesta clínica".
- Job de conferência: janela semanal fechada (seg a dom, BRT); grava os dois números, diferença, causa e id da execução; tolerância por faixa; falha vira "não conferido", nunca mantém verde velho.
- Quem chamar: motivo mecânico por linha ("escreveu há 3 dias, sem resposta"); exclusões (cartão removido, cópia do robô, quem já voltou, agendou ou cancelou); máximo 5 linhas; máscara no servidor; registro de quem abriu; botão do WhatsApp com confirmação, nunca envia sozinho.
- Menu: médico com 2 itens (Hoje, Ajuda e fontes); equipe com 3 (Carteira, Clínica, Conferência e fontes); rota escondida abre por link e a abertura é gravada; guarda de rota por papel; aviso "sem selo" nas telas da equipe.

**Differentiators:**
- Estado âmbar com os dois números escritos. Nenhuma das 50 plataformas pesquisadas reconcilia e mostra os dois [inferido da ausência nas fichas, MÉDIA].
- Selo auditável (quem/qual job, quando, qual versão).
- Par lado a lado ("7 entraram na etapa · 11 chegaram a ela ou além"; "13 vendas, 3 com valor").
- Job calcula sempre as duas contagens, independente da decisão 1.
- Rebaixamento do selo por mudança do perfil de etapas (pode ser v1 se barato).
- Verificação automática "número do texto = payload = `metricas_selo`".
- Modo de validação das 20 linhas: certo/errado com motivo, gravado sem nome.

**Defer:** resumo ao médico pelo WhatsApp oficial (v1.5); "Já chamei"/adiar 12 h (v1.5); FlwChat e Digisac, "Esta semana", origem por post, fusões (v2); metas guiadas (v2); "pergunte ao Nexo" (v3, depende da decisão 12); painel "o que foi bem/melhorar" e "tipo de cliente" (fora por CFM/LGPD).

**Anti-features:** analytics de terceiros ou replay para o log; concluir "0 acessos" logo após esconder (viés de seleção); score sem fórmula; selo calculado na tela; verde "otimista"; botão "marcar como conferido"; culpar o CRM pela divergência; correção automática do Nexo a partir do CRM; projeção de meta; R$ solto em "Fecharam"; chip de variação em número sem selo verde; resumo com texto livre de IA; motivo com procedimento ou conteúdo de conversa; exportar a lista ou mostrar telefone; disparo automático; pedido de avaliação no Google; rastrear quem não escreveu; pizza, rosca, gauge, eixo duplo, funil em cone; menu de 13 itens; construtor de dashboard.

### Architecture Approach

Quatro caminhos, separados por risco:

1. **Log de rota:** SPA → insert direto (RLS: insert autenticado com `user_id = auth.uid()`, incluindo admin; select só `is_app_admin()`). Fire-and-forget, erro engolido, dedupe de 1,5–2 s.
2. **Selo:** job semanal (ou n8n) → `?conferencia_ao_vivo=1` (service role, GET-only no CRM) → `conferencia_ao_vivo` → `api/_lib/selo.ts` → `metricas_selo` → expiração por leitura (`expira_em`) e por cron guardado. Só `service_role` e RPC admin escrevem.
3. **Lista de contato:** `alvo: "quem_chamar"` → SQL service-only `quem_chamar_hoje()` → máscara no servidor (médico: iniciais; secretária com `lista_acesso_nominal`: primeiro nome; agência: contagem) → registro em `lista_acessos` na mesma requisição, falha fechada.
4. **Leitura da Tela Hoje:** SPA → `POST /api/sync/manual {alvo:"hoje"}` com bearer do usuário → cliente com o bearer do usuário (padrão de `central-canais.ts:32`; RLS e `is_client_member` continuam como barreira) → `resultado_pronto` / `resultados_diarios` / `metricas_selo` / `sync_status` → um bloco por métrica, cada um falhando sozinho (`Promise.allSettled` com orçamento próprio).

Componentes: log de rotas (hook no `AuthLayout`); registro de navegação (`situacao: "viva" | "escondida" | "tirada"` em `NavTab`; três lugares a honrar: menu da clínica, menu admin, menu SAP); selo (`metricas_definicao`, `metricas_selo`, `selo-data.ts`, `selo-badge.tsx`); composição do `hoje` (`api/_lib/hoje.ts` + `src/lib/hoje.ts` puro; testes em `scripts/test-hoje.ts`); `hoje_numeros()` (RPC set-based com `crm_perfil_etapas()` materializado); Tela Hoje (`src/routes/_authenticated.$clientId.hoje.tsx`, `src/components/hoje/*`); job Kommo (estender `conferencia-ao-vivo.ts`, sem terceiro reconciliador); Quem chamar (`api/_lib/quem-chamar.ts`, SQL `quem_chamar_hoje`, `quem_chamar_liberacao`); resumo sombra (`api/_lib/resumo-semanal.ts`, tabela só admin, sem envio); verificação (`supabase/verificacao/*.sql`).

Fatos de código: `pacientes_periodo` é wrapper de cache sobre `pacientes_periodo_calc`, que existe em produção como texto remendado por ~10 blocos `DO` com `replace()` exato; não remendar sem `pg_get_functiondef` de produção, e de preferência não tocar. `is_app_admin()`/`is_client_member()` leem `auth.uid()`: com service role dão 42501; por isso o `hoje` usa cliente com bearer. `status_das_fontes()` é só admin. `resultados_diarios` foi gravado com as definições antigas (desde 08/09, 20 clínicas). `clinica_metas` existe, vazia (métricas `mandaram_mensagem`, `agendaram`, `fecharam`). `api/sync/manual.ts` tem ~1338 linhas; membro com papel diferente de owner/strategist cai em 403 salvo `alvo` na lista `["audiencia","periodo_instagram","crm_negocio_resumo"]`. `alvo` não listado na enum dá 400. Achado lateral fora de escopo: `src/components/agentes-ia.tsx:214` envia `alvo: "anuncio_acao"`, que não está na enum.

### Critical Pitfalls

1. **Máscara só no React, ou RLS por linha vazando nome para viewer.** RLS é por linha; `is_client_member` ignora o papel; `is_app_admin()` dá passe em quase toda policy; `resultado_pronto` é igual para todos os papéis. Prevenção: sem `select` direto para `authenticated` na tabela de contatos; RPC `security definer` com `set search_path = public, pg_temp`; máscara por JWT e atributo explícito, nunca por parâmetro do cliente; fora do `resultado_pronto`; payload sem telefone (`wa.me` emitido no clique, com registro). Teste por papel com `curl`. (Fase 7)
2. **Dispatcher com service role sem checagem caller→clínica, ou 13ª função.** Prevenção: helper `exigirAcessoAoCliente()` como primeira linha de todo ramo de usuário; testes 401/403; `SYNC_SECRET` rejeitado em ramo de usuário; nenhum arquivo novo em `api/`; `import()` dinâmico. (Fases 1, 4, 7)
3. **Selo verde sem conferência, calculado na tela, ou que sobrevive à definição.** Prevenção: `CHECK (estado <> 'verde' or (conferido_em is not null and evidência is not null))`; expiração na leitura e no cron; falha do job não altera o selo; versão nova derruba verde antigo; verde só para métrica só-CRM com leitura ao vivo ok; nunca verde quando a fonte inclui conversa. Teste do pior selo (não medido > âmbar > neutro > verde). (Fases 3, 6)
4. **Reconciliação que compara definições diferentes, ou terceiro reconciliador.** Estoque, fluxo e acumulado são coisas diferentes. Cópia do robô tem regra diferente no Nexo e na API desde 01/11/2026. Prevenção: estender `conferencia-ao-vivo.ts`; uma função compartilhada para "cópia do robô" e "removido na origem"; cada lado do par reconciliado separadamente; nunca `confirmar: true` em job não assistido. (Fases 6, 0)
5. **Kommo: limite por processo, não por domínio.** `ritmoKommo` guarda o intervalo num `Map` em memória; duas instâncias = 12 req/s; 403 pode ser bloqueio. Prevenção: lease por domínio no banco; uma clínica por chamada; 429 = parar e retomar; 403 = circuit breaker; progresso por página. (Fase 6)
6. **Três relógios.** Instagram usa `America/Los_Angeles`; pg_cron, Vercel e GitHub rodam em UTC; `FUSO_BR` fixo em 3 h. "Hoje" é a foto de ontem às 03:30. Prevenção: helper de fuso compartilhado entre `api/_lib` e `src/lib`; testes de borda (domingo 22:00 BRT, fim de mês, 00:00 de segunda); nomear o dia no cartão; mês-até-hoje pelo RPC do período, nunca somando `resultados_diarios`. (Fases 2, 4, 5, 6, 10)

Adicionais: CFM/linguagem ("em risco", "deve", "vai", adjetivo; `clinica_metas` e alerta n8n já usam "meta em risco") precisam de deny-list em CI; WhatsApp (escolher `wa.me` ou API antes de pedir template; `utility` vs `marketing`); log que não grava admin (política com `is_client_member` falha para staff) e que grava parâmetros com id; migration não aplicada quando o código sobe (código deve degradar); `coalesce(…,0)` / `?? 0` em "não medido".

## Já existe: estender, não reconstruir

| Item | Onde está | O que falta |
|------|-----------|-------------|
| Conferência ao vivo | `api/_lib/conferencia-ao-vivo.ts`, tabela `conferencia_ao_vivo` (`20261102180000`), ramo `?conferencia_ao_vivo=1`, UI `conferencia-ao-vivo-resumo.tsx` | Comparar métricas de funil (hoje compara contagem de leads), gravar selo, agendar. Não criar job novo. |
| Reconciliação de leads | `api/_lib/kommo-reconcile.ts` via `kommo-leads.ts?reconcile=1` (marca `removido_na_origem`) | Agendar antes da conferência semanal. Não é "construir reconciliador". |
| Cmd+K | `app-shell.tsx` (~293–320, 630–680), `buscarTelas` em `nav.ts:510` | Incluir escondidas para equipe, origem `cmdk`, botão "Buscar" visível (celular). Não trocar por `cmdk`. |
| Metas | `clinica_metas` (`20261106120000`), vazia | Seed por SQL; leitor no `hoje`. Sem tela admin na v1. |
| Barras | `.dbx-bar` (8px) em `databoard.css` | Reusar. Sem Recharts. |
| Cache e histórico | `resultado_pronto` (20 min), `resultados_diarios` (03:30 BRT) | Coluna de versão; invalidação. |
| SQL e testes | `scripts/test-migrations.ts`, `scripts/test-db-security.ts`, `scripts/alertas/verificar.sql` | Um caso por tabela nova (outra clínica lê 0; viewer não escreve; anon não chama RPC). |
| Alertas | n8n (`resumo_equipe`, "meta em risco") | Padrão para o resumo em sombra; trocar "em risco" por fato. |

## Implications for Roadmap

Ordem do brief (log → verificação → selo → hoje → Tela Hoje → job Kommo → Quem chamar → resumo sombra → template Meta → metas), com três refinamentos da pesquisa, marcados: (1) menu escondido logo após o log verificado em produção; (2) pedido do template à Meta antecipado no calendário; (3) "Quem chamar" com gate de design antes do código. Também: antecipar o seed de metas para antes da captura da Fase 5.

Regra: a construção não espera a Fase 0; a liberação espera. Cada fase termina com print do site no ar. Uma migration por vez, aplicada pelo João; código degradando se a tabela não existir.

### Fase 0: Conferência à mão (manual, em paralelo às Fases 1–3)
- **Rationale:** única fonte de evidência das definições.
- **Entrega:** tabela "número × origem × diferença × causa × correção" nas 3 clínicas (Lana/Kommo, Marcella/FlwChat, Antonione/Digisac), contra o CRM ao vivo, uma semana fechada; catálogo fechado de causas; correções como migrations novas.
- **Evita:** Pitfalls 5, 7, 8 (Lana foi conferida contra o próprio banco; FlwChat só lista cartão aberto e Digisac não tem ganho/perda: "Fecharam" nelas é "não verificável" ou vem de outra fonte), 12 (nada de nome/telefone em arquivo versionado).
- **Bloqueado por:** decisões 1 e 2 (saem daqui). Não bloqueia código.
- **Research flag:** SIM. Retenção do endpoint de eventos do Kommo e se `lead_status_changed` registra movimento de robô; cobertura de movimento de etapa (só desde 14/10/2025, 36% dos cartões).

### Fase 1: Log por rota (PR 1)
- **Rationale:** relógio das decisões de corte e do SAP.
- **Entrega:** tabela de log (nome a fechar: `uso_rota` ou `rota_acessos`; campos `user_id`, `client_id`, `rota` padrão, `origem`, `papel`, `sessao`, `criado_em`); RLS (insert autenticado incluindo admin; select só `is_app_admin()`); hook no `AuthLayout`; origem por marcação (`cmdk`, `menu`, `url` no primeiro carregamento, `redirect` nas guardas); índices `(rota, criado_em)` e `(client_id, criado_em)`; visão admin agregada.
- **Gate de liberação:** 24 h de linhas em produção de admin **e** de viewer; Playwright: abrir direto e navegar pelo Cmd+K produz `direto` e depois `busca`; sem atraso perceptível.
- **Evita:** Pitfalls 9, 10, 7.
- **Bloqueado por:** nada.
- **Research flag:** baixo. Confirmar `onResolved` no primeiro carregamento (lido, não rodado).

### Fase 1b: Menu, parte da equipe (depois do gate da Fase 1)
- **Rationale:** refinamento da pesquisa. Esconder sem linha de base mede o efeito do menu, não o uso.
- **Entrega:** `situacao` em `NavTab` (enum de 3 valores); busca Cmd+K para equipe com escondidas e rótulo "sem selo"; botão "Buscar" visível; guarda de rota por papel e situação; redirects das 3 telas tiradas (inclusive `/ideias` duplicado e `marketing.tsx`); teste de registro 90 = 14 + 73 + 3; atualizar `navigation-architecture.spec.ts` e `workspace-navigation.spec.ts`.
- **Menu do médico NÃO entra aqui:** ele ficaria sem Hoje. Entra na Fase 5.
- **Evita:** Pitfall 11 (`/login`, `/reset-password`, `/bem-vindo`, `/oauth/consent`, `/sem-acesso`, `/r/:slug`, `/conhecer` nunca escondidos nem redirecionados).
- **Bloqueado por:** decisões 3, 5, 11 (pode começar com a lista atual).
- **Research flag:** médio (três árvores de menu; E2E).

### Fase 2: Consultas de verificação (PR 2)
- **Rationale:** insumo da Fase 6, da condição 4 do Quem chamar e do piso da decisão 8.
- **Entrega:** `supabase/verificacao/01-cobertura-post-id-ad-id.sql`, `02-timestamp-por-fonte.sql`, `03-cartoes-removidos-e-copias.sql` (somente leitura); timestamp por fonte; testes de borda de fuso; grão de data único.
- **Evita:** Pitfalls 7, 17 (sem data = excluído, não chutado).
- **Bloqueado por:** decisão 8 só para thresholds.
- **Research flag:** SIM. Kommo sem coluna equivalente a `ad_id`: cobertura da Lana tende a ficar perto de 0% pela tabela de origem; olhar `raw_payload` e `links_rastreados`. "Não medido" pode ser o resultado correto.

### Fase 3: `metricas_selo` (PR 3)
- **Rationale:** nenhuma tela mostra número sem selo; o `hoje` precisa da tabela, mesmo com linhas âmbar.
- **Entrega:** `metricas_definicao (metrica, versao, o_que_conta, vigente, vigente_desde)`; `metricas_selo (client_id, metrica, definicao_versao, estado, texto_curto, valor_nexo, valor_origem, fonte, conferido_em, expira_em, evidencia, definido_por)` com PK `(client_id, metrica, definicao_versao)`; RLS de leitura; escrita só `service_role` e RPC admin `selo_definir` com `search_path`; expiração por leitura e cron guardado; leitor e badge.
- **Versão 0:** âmbar com os dois números; versão 1 só quando o João fechar as definições.
- **Evita:** Pitfalls 4, 9, 16.
- **Bloqueado por:** decisão 6 (SQL com texto curto) e decisão 1 (verde e versão 1).
- **Research flag:** baixo.

### Fase 4: Endpoint `hoje` (PR 4)
- **Rationale:** centro de leitura de todas as telas novas; nunca recalcula conta pesada.
- **Entrega:** `alvo: "hoje"` na enum e na allowlist de leitura; ramo com `import()`; cliente com bearer do usuário; blocos `fontes`, `agendaram` (par), `fecharam` (de `pacientes_periodo.numeros.fecharam`), `chamaram`, `foram` (estrito via `hoje_numeros`), `funil` (puro), `meta`, `quem_chamar` (só `{liberado, n}`), `frase` (template); HTTP 200 com `status` por bloco (nunca `ok:false` para erro parcial); owner/viewer: bloco sem selo volta `sem_selo` sem número; admin/strategist: número com aviso; `hoje_numeros()` set-based.
- **Evita:** Pitfalls 2, 3, 7, 15, 16.
- **Bloqueado por:** decisão 1; janela da Hoje (gap 7); `statement_timeout` (gap 8).
- **Research flag:** SIM. p50/p95 em produção antes e depois (lição de 04/11). Não tocar em `pacientes_periodo_calc` sem `pg_get_functiondef` de produção; preferido: não tocar.

### Fase 5: Tela Hoje (PR 5)
- **Rationale:** primeira tela de decisão.
- **Entrega:** rota `_authenticated.$clientId.hoje.tsx` + `src/components/hoje/*` (`dbx-*`); coluna única 400px / 720px; uma `useQuery` com render por bloco; sem Recharts; `Ajuda e fontes` (lê `sync_status`); menu do médico trocado para Hoje + Ajuda e fontes; `CoberturaPeriodo`, `DisponibilidadeFontes` e seletor de período fora de `/hoje`; decisão do redirect SAP em `_authenticated.index.tsx`; `npm run routes:generate`.
- **Evita:** Pitfalls 13, 15, 16, 7.
- **Bloqueado por:** decisões 4, 5, 9, 11.
- **Research flag:** SIM para UX (teste de 10 s, card sorting). Implementação é padrão.

### Fase 6: Job Kommo semanal (PR 6)
- **Rationale:** única fonte possível de verde; depende das Fases 2 e 3.
- **Entrega:** métricas da semana fechada (BRT) como linhas de `conferencia_ao_vivo` (`agendaram_entraram`, `agendaram_ao_menos`, `compareceram_estrito`, `fecharam_vendas`, `fecharam_com_valor`), sempre as duas contagens; escritor do selo (`selo.ts`): verde só para métrica só-CRM, com leitura ao vivo ok, tolerância `TOL_EXATA`; âmbar com os dois números; leitura falha = selo intocado; lease por domínio; uma clínica por chamada; progresso por página; reconciliação de leads antes; alerta "último ciclo > 8 dias"; nunca `confirmar: true`.
- **Evita:** Pitfalls 4, 5, 6, 21.
- **Bloqueado por:** decisão 7; decisão 1 (verde com versão); escolha do agendamento.
- **Research flag:** SIM. Retenção e cobertura de eventos; semana acima de 300 s (fatiar por dia com cursor).

### Fase 7: "Quem chamar hoje" (PR 7), com gate de design antes do código
- **Rationale:** maior risco (LGPD, CFM, dado de paciente, dependência de pessoas).
- **Gate de design (sem código até fechar):** decisão 10; decisão 8 (casamento conversa→cartão); regra de cópia do robô em nível de cartão (saída da Fase 0; hoje só há heurística de venda, janela de 3 dias); coluna de "tempo parado" (saída da Fase 2); instrumento das 20 linhas (gap 2); fluxo do botão (gap 11); modelo de secretária (`lista_acesso_nominal` sobre `owner|strategist|viewer`).
- **Entrega após o gate:** `quem_chamar_hoje()` service-only, `security definer`, `search_path` fixo, derivado de `recuperacao_sem_resposta()`, com `removido_na_origem is null`, `crm_leads_do_cliente()`, máximo 5 linhas; máscara em `api/_lib/quem-chamar.ts`; `lista_acessos` fail-closed; `quem_chamar_liberacao` como dado (`liberado = c1 and c2 and validadas >= 20 and acertos >= 18 and c4`); botão só com liberação e template aprovado; `paraChamarAgora()` continua separado.
- **Evita:** Pitfalls 1, 2, 12, 14, 17.
- **Bloqueado por:** decisões 10, 8, 7, 9; saídas das Fases 0 e 2; papéis (gap 1).
- **Research flag:** SIM, o mais pesado. Teste por papel com `curl`; teste de que admin também registra linha.

### Fase 8: Resumo semanal em sombra (PR 8)
- **Rationale:** mede a condição da v1.5 sem enviar nada.
- **Entrega:** `acao: "resumo_semanal"` no ramo `SYNC_SECRET`; `resumo-semanal.ts` compondo das mesmas funções puras da Hoje e só do selo gravado; `resumos_semanais_sombra` (admin only); regras de silêncio (selo não verde, grupo <5, fonte >1 dia, etapa fora de ordem ⇒ "resumo suspenso"); linter de verbos; opt-in como SQL entregue e não usado.
- **Evita:** Pitfalls 13, 18 (sem caminho de envio).
- **Bloqueado por:** decisões 9 e 6 (só entrega).
- **Research flag:** baixo.

### Fase 9: Pedido do template do WhatsApp à Meta (PR 9, sem código)
- **Rationale:** aprovação tem prazo externo; começa no calendário antes das Fases 6 e 7 terminarem.
- **Entrega:** decisão do fluxo (`wa.me` ou API); WABA confirmado (id, número com API Cloud, verificação, onboarding novo ou coexistência); texto neutro, passado, pt_BR, com amostra real, sem variável no início ou fim, URL direta da clínica; categoria `utility` com fato e sem promoção (conteúdo promocional vira `marketing`, mais caro e exige opt-in); registro de nome, versão e categoria.
- **Evita:** Pitfall 14.
- **Bloqueado por:** decisões 7 e 9; fluxo do botão.
- **Research flag:** SIM. WABA não inspecionado; coexistência é fonte de fornecedor.

### Fase 10: Metas por SQL (PR 10)
- **Rationale:** dado, não código. Antecipar: seed antes da captura da Fase 5.
- **Entrega:** `supabase/seeds/metas_lana.sql` (seed; o João roda); meta vinculada à métrica e à versão; leitor no `hoje`; meta exibida só se o selo não for "não medido".
- **Evita:** Pitfalls 19, 7 (MTD pelo RPC do período).
- **Bloqueado por:** decisões 1 e 6.
- **Research flag:** baixo.

### Phase Ordering Rationale
- Log antes de tudo que esconde (linha de base).
- Verificação antes de selo e de Kommo (evidência e fuso testados).
- Selo antes de Hoje (contrato "nenhum número sem selo").
- Job Kommo antes de Quem chamar (`removido_na_origem` fresco).
- Quem chamar depois de gate de design (decisões 8 e 10 e regra de cópia são pré-requisitos).
- Template Meta cedo no calendário (latência externa).
- Metas antes da captura da Fase 5 (verificável no print).

### Research Flags
Precisam de pesquisa/spike: Fases 0 e 6 (eventos do Kommo); Fase 2 (`ad_id` no Kommo); Fase 4 (desempenho, `statement_timeout`); Fase 5 (validação com médicos); Fase 7 (gate inteiro); Fase 9 (WABA e coexistência).
Padrões conhecidos: Fases 1, 3, 8, 10 e 1b (com cuidado nos três menus).

## Escolha em aberto: agendamento do job Kommo (a pesquisa não escolhe)

| Opção | A favor | Contra | Quem defendeu |
|-------|---------|--------|---------------|
| **A. Vercel Cron semanal** (`crons` no `vercel.json`, `GET`, `CRON_SECRET` aceito só no ramo de conferência) | Mesmo PR, versionado, sem passo manual; semanal permitido no Hobby | Marcado "legacy"; sem retry; pode falhar ou duplicar; segundo segredo | STACK (recomenda) |
| **B. n8n semanal** (`Bearer SYNC_SECRET`, timeout ≥300 s) | Sem deploy; mesmo segredo; falha notifica; padrão do time | Fora do repo e do PR (o dono cria à mão); roda na VPS que hospeda a produção | ARCHITECTURE e PITFALLS |
| **C. pg_cron + pg_net** | Tudo no banco | Segredo no banco; extensão só o dono concede | Rejeitado por todos |
| **D. GitHub Actions `schedule`** | Padrão do repo (`alertas.yml`) | Roda pela branch padrão (`prod-fix`); `SYNC_SECRET` copiado | Segunda linha |

**Ponto factual a verificar:** PITFALLS diz "não adicionar `crons`" por limite de frequência; STACK diz que semanal cabe no Hobby. A regra de frequência só afeta expressões mais frequentes que diárias. Confirmar nos docs antes. Em qualquer opção: alerta de "último ciclo > 8 dias", job idempotente, lease por domínio.

## Divergências entre as pesquisas

| Tema | Divergência | Tratamento |
|------|-------------|------------|
| Gravação do log | FEATURES: lote via `sendBeacon` no dispatcher. STACK, ARCH, PITFALLS: insert direto | **Insert direto.** `sendBeacon` não leva JWT; FEATURES parece desatualizado |
| Agendamento | STACK: Vercel Cron. ARCH/PITFALLS: n8n | **Aberto** |
| Frequência do cron | STACK: semanal ok. PITFALLS: "não usar crons" | **Verificar nos docs** |
| Botão "Quem chamar" | STACK: `wa.me` na v1. FEATURES/ARCH: template aprovado | **Aberto** (gap 11) |
| Template Meta | STACK: pedido sem código. FEATURES: depende de D7 e D9. ARCH: já. PITFALLS: após copy CFM | **Antecipar** assim que D7 for autorizada e houver rascunho |
| Metas | Brief: última. ARCH: seed antes da Fase 5 | **Antecipar o seed**; versão vinculada à D1 |
| Estado de rota | STACK: booleano `escondida`. ARCH: `situacao` | **Enum de 3 valores** |
| Origem do log | Quatro listas diferentes (STACK, ARCH, PITFALLS, FEATURES) | **Unificar** (gap 4); incluir `bloqueada` |
| "Esta semana" na Hoje | Citado no brief; fora do PROJECT | **Confirmar** (gap 7 relacionado) |
| Dado da Hoje | Snapshot 03:30 vs leitura viva; janela em aberto | **Aberto** (gap 7) |
| Regra de robô | Heurística de venda (Nexo) vs regra por assinatura | **Uma regra compartilhada**, saída da Fase 0 |

## Gaps fora das 12 decisões

1. **Secretária com acesso nominal não tem papel.** Enum `owner|strategist|viewer` não representa a secretária. Mecanismo: `lista_acesso_nominal` (base legal, data, quem concedeu). Quem recebe é decisão 10.
2. **Medir "≥18 de 20" não tem instrumento.** Tabela `quem_chamar_validacao` (linha, veredito, motivo, quem, quando), sem nome; amostra em ≥2 dias, incluindo linhas excluídas; dentro do app, sem planilha.
3. **Busca no celular.** Cmd+K não existe no celular; botão visível de busca no cabeçalho.
4. **Origem e linha de base antes de esconder.** Unificar origens; gravar `bloqueada`; janela de linha de base antes de esconder; "0 acessos" nunca é prova.
5. **Quem escreve o selo.** Só job e SQL do João; nenhum botão "conferido"; `authenticated` sem escrita em `metricas_selo`.
6. **`definicao_versao` em `resultados_diarios`.** Coluna nova; refill em janelas de até 14 dias; invalidar `resultado_pronto`.
7. **Janela do período da Hoje.** Rolante até ontem, segunda até ontem, última semana fechada ou mês? Decisão de produto fora das 12: o João responde.
8. **`statement_timeout`: 8 s ou 30 s.** Comentário de `use-pacientes-periodo.ts` diz 8 s; PROJECT diz 30 s. Owner verifica produção para `authenticated`.
9. **Conflito do SAP.** `_authenticated.index.tsx` manda clínica SAP para `/sap/.../painel`, conflitando com "SAP congelado". Decisão, não mudança silenciosa; depende da decisão 5.
10. **LGPD em arquivos versionados.** Nenhum dado real de paciente em `.planning/`, fixture, protótipo ou doc. A conferência trabalha com contagem e id interno. Protótipo da decisão 11 com dado agregado ou sintético. Histórico do git guarda o que for commitado.
11. **Fluxo do botão de WhatsApp.** `wa.me` (sem template) vs API com template (BSP). Não está nas 12 e muda o pedido à Meta.
12. **Regra de cópia do robô por cartão.** Regra por assinatura, validada por clínica, datada de 01/11/2026. Saída da Fase 0; bloqueia condição 1.
13. **Kommo: retenção e cobertura de eventos.** Não documentadas; spike na Fase 0.
14. **Agendamento atual desconhecido.** Nenhum cron ou workflow no repo para `conferencia_ao_vivo` ou `kommo-leads?reconcile=1`. Confirmar no n8n.
15. **WABA, número e BSP.** WABA não inspecionado; BSP por clínica desconhecido; número novo ou coexistência.
16. **"Incoming leads" = venda?** Decisão 2.
17. **Zod local desatualizado.** 3.25.76 local vs 4.6.7 no lockfile. `npm ci` antes de schemas.
18. **Nome das tabelas.** `uso_rota` (STACK) vs `rota_acessos` (ARCH). Escolher antes da Fase 1.
19. **Campo de estado de rota.** `situacao` com 3 valores (decisão de síntese).
20. **Gate da v1.5 sem critério mensurável (G4).** Proposta a validar: linhas por dia por papel durante N dias. O número é do João.
21. **Achado lateral.** `agentes-ia.tsx:214` envia `alvo` fora da enum (400 hoje). Registrar, não corrigir sem decisão.
22. **Dispatcher no limite.** 12/12 funções; nada novo em `api/`; 100 deploys/dia; juntar mudanças por PR; rollback por PR.

## Confidence Assessment

| Área | Confiança | Notas |
|------|-----------|-------|
| Stack | ALTA (repo), MÉDIA (WhatsApp) | Código, lockfile, `vercel.json`, migrations, docs oficiais Vercel (2026-07/08). WABA não inspecionado. |
| Features | MÉDIA | Padrões de 50 plataformas lidos de fichas de segunda mão; nenhuma tela vista. CFM/LGPD/WhatsApp web: BAIXA. Não é parecer jurídico. |
| Arquitetura | ALTA (integração), MÉDIA (produção) | Não verificados em produção: `pg_get_functiondef`, crons e n8n agendados, `statement_timeout`, região do Supabase. |
| Pitfalls | ALTA (código), MÉDIA (Kommo, Meta, LGPD, CFM) | Riscos de código verificados nas linhas citadas. LGPD e CFM não revisados por advogado. |

**Confiança geral: MÉDIA.** Forte no que o código faz e nas regras de dado; fraca em validação de produto, no comportamento real do Kommo em semanas antigas e em toda a parte jurídica.

### Gaps to Address
- Decisões 1 a 12: nenhuma resolvida; cada fase deve declarar o que espera delas.
- Gaps 1 a 22: tratar no planejamento de cada fase.
- Antes de planejar as Fases 4, 7 e 9: respostas (ou premissas registradas) para as decisões 1, 6, 7, 8, 10 e os gaps 7 e 11.
- Spike de Kommo na Fase 0, antes da Fase 6.

## Sources

**Repo (alta):** `package.json`, `package-lock.json`, `vercel.json`, `src/router.tsx`, `src/components/app-shell.tsx`, `src/lib/nav.ts`, `src/routes/_authenticated.tsx`, `_authenticated.index.tsx`, `_authenticated.admin.tsx`, `src/lib/pacientes.ts`, `src/hooks/use-pacientes-periodo.ts`, `src/lib/conferencia-ao-vivo.ts`, `src/components/agentes-ia.tsx`, `src/styles/databoard.css`; `api/sync/manual.ts`, `api/_lib/request-validation.ts`, `conferencia-ao-vivo.ts`, `kommo-reconcile.ts`, `api/sync/kommo-leads.ts`, `central-canais.ts`, `resumo-equipe.ts`, `observability.ts`, `dia-meta.ts`, `mascarar-pii.ts`; migrations `20261031150000`, `20261102150000`, `20261102180000`, `20261104100000`, `20261105120000`, `20261105130000`, `20261105160000`, `20261106120000`, `20261106130000`, `20261014105000`, `20261021240000`; `.github/workflows/alertas.yml`, `scripts/alertas/verificar.sql`, `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`; `node_modules/@tanstack/router-core` (`onResolved`).

**Oficial:** Vercel cron usage (https://vercel.com/docs/cron-jobs/usage-and-pricing); Vercel manage cron (https://vercel.com/docs/cron-jobs/manage-cron-jobs); Vercel limits (https://vercel.com/docs/functions/limitations); TanStack Router events (https://tanstack.com/router/latest/docs/framework/react/api/router/RouterEventsType); WhatsApp message templates (https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates); WhatsApp template categorization (https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization); Kommo events (https://developers.kommo.com/reference/events-list); Kommo limits (https://developers.kommo.com/docs/limitations, via busca).

**Secundárias:** Supabase cron (https://supabase.com/docs/guides/cron); comunidade Vercel sobre 12 funções (https://community.vercel.com/t/serverless-function-limit/12797); CFM 2.336/2023 (https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2023/2336_2023.pdf; artigos não lidos na íntegra); LGPD (Lei 13.709/2018, arts. 5 II, 6, 7 IX, 11, 18, 33, 37, 46, 48; parecer jurídico necessário); fornecedores de WhatsApp (coexistência e preço, baixa confiança); concorrentes e padrões (fichas de segunda mão).

---
*Research completed: 2026-11-09*
*Ready for roadmap: yes, com as 12 decisões em aberto explícitas. Não assumir nenhuma.*
