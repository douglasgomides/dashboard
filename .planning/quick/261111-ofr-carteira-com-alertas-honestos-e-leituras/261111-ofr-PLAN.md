---
phase: quick-261111-ofr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/carteira-alertas.ts
  - api/_lib/avisos-da-carteira.ts
  - api/_lib/request-validation.ts
  - api/sync/manual.ts
  - src/lib/admin-data.ts
  - src/routes/_authenticated.admin.index.tsx
  - src/lib/roi.ts
  - api/_lib/flwchat-sync.ts
  - api/sync/kommo-leads.ts
  - docs/apis/wts-flwchat.md
  - scripts/test-carteira-alertas.ts
  - scripts/test-roi.ts
  - scripts/test-flwchat-fechados.ts
  - tests/e2e/admin-dados.ts
  - tests/e2e/admin-painel.spec.ts
autonomous: true
requirements: [QUICK-261111-ofr]

estimate:
  tokens: 95000
  raw_tokens: 95000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Na Carteira (/admin), o cartão do acesso do médico mostra o alerta real: quantas clínicas ativas, fora do negócio próprio (0ef2c738-…, ba5231d4-…), têm acesso criado e ninguém da clínica entra há mais de 14 dias. Com os dados de produção do debug, dá 1 (a Lana, último acesso em 05/10). O fato da equipe vem ao lado, em tom neutro: 'N sem acesso criado (a equipe cria)', que em produção dá 16"
    - "Os dois fatos têm filtro próprio na lista ('Não entra' e 'Sem acesso criado'). A linha da clínica mostra 'Não entra há N dias' (atenção) ou 'Sem acesso criado · dar acesso' (neutro). Clínica inativa e negócio próprio não entram em nenhuma das duas contas"
    - "O último acesso (last_sign_in_at) só sai do servidor pelo alvo carteira_avisos, que é global e só de admin: quem não é admin recebe 403 pelo ramo que já existe. A resposta traz por clínica só usuarios, ultimo_acesso e criado_em, sem e-mail, sem id de usuário e sem token"
    - "O cartão 'Sem ROI calculável' não junta mais 6 motivos sob 'falta dado'. O valor conta as clínicas travadas por item que alguém precisa arrumar. A nota separa em três grupos: 'cliente (CRM)' para valor, origem ou canal; 'equipe (fonte ou etapa)' para sem CRM, sem anúncios, etapa não marcada ou CRM compartilhado; e 'não se aplica' para sem investimento, 0 vendas ou menos de 5 vendas de anúncio. Inativa e negócio próprio ficam fora"
    - "Com 0 vendas no período, os itens 'valor' e 'canal da venda' não travam nem contam como pendência: 0/0 não é falta de dado. O motivo passa a ser 'nenhuma venda foi ganha no período'. Com 0 leads, a origem segue a mesma regra"
    - "FlwChat: card que o Nexo marcou 'closed' e que a /crm/v2/panel/card lista com status WON vira won; com status LOST, vira lost. Só closed muda para won ou lost. Open e resultado confirmado não mudam. A conexão com cards_por_item (Dr. Sergio Maia) fica de fora. Se a v2 falhar, o card segue closed e a rodada só ganha um aviso, sem vermelho na fonte"
    - "O botão Sincronizar (posts e tudo) com perfil do Instagram pela Meta Graph não exige mais META_ACCESS_TOKEN global: usa o token do perfil (instagram_account_secrets), como a rotina agendada. Perfil sem token próprio e sem reserva ganha um erro próprio e claro, e os outros perfis continuam sendo lidos"
    - "Reserva do servidor ausente e usada por dado ativo aparece pelo NOME, nunca pelo valor. Na Carteira, aparece num alerta curto (por exemplo, KOMMO_API_TOKEN com 1 conexão Kommo sem token próprio). Na Saúde das fontes, aparece no texto do erro do Kommo. O helper fica exportado para o /readyz da VPS (handoff em vps/producao)"
  artifacts:
    - path: src/lib/carteira-alertas.ts
      provides: "DIAS_SEM_ENTRAR = 14, entraNaCarteira, agruparAcessos, fatoDeAcesso, avisosDeReserva e os tipos AcessoClinica, AvisoReserva, AvisosDaCarteira. Puro, só com import relativo .js"
    - path: api/_lib/avisos-da-carteira.ts
      provides: "lerAvisosDaCarteira(admin, temVariavel) e lerUsoDeReservas(admin). Lê último acesso por getUserById e conta reservas sem selecionar coluna de token"
    - path: api/sync/manual.ts
      provides: "alvo global carteira_avisos, só admin; sincronizarPosts sem exigir o token global"
    - path: src/lib/roi.ts
      provides: "regra 0/0; Roi.motivoFinal; GrupoSemRoi, ITENS_DA_EQUIPE, ITENS_DO_CLIENTE, ROTULO_GRUPO_SEM_ROI e grupoSemRoi"
    - path: src/routes/_authenticated.admin.index.tsx
      provides: "cartão 'Médico não entra', cartão 'Sem ROI calculável' com os três grupos, filtros novos, chips de linha e alerta de reserva"
    - path: api/_lib/flwchat-sync.ts
      provides: "idsComSituacao, reclassificarFechados, deveConferirFechadosV2, leitura v2 com Statuses=WON e Statuses=LOST dos closed"
    - path: scripts/test-carteira-alertas.ts
      provides: "casos de acesso (Lana 37 dias, sem acesso, inativa, negócio próprio, nunca entrou), contagem 16/1 no retrato do debug, avisos sem vazar valor, schema do alvo"
  key_links:
    - from: src/routes/_authenticated.admin.index.tsx
      to: api/sync/manual.ts
      via: "getAvisosDaCarteira (src/lib/admin-data.ts) faz POST em /api/sync/manual com alvo carteira_avisos e o Bearer da sessão"
      pattern: "carteira_avisos"
    - from: api/sync/manual.ts
      to: api/_lib/avisos-da-carteira.ts
      via: "o ramo do alvo carteira_avisos vem ANTES do ramo da conferência (if (alvoGlobal) em manual.ts:250)"
      pattern: "lerAvisosDaCarteira"
    - from: src/routes/_authenticated.admin.index.tsx
      to: src/lib/roi.ts
      via: "grupoSemRoi(montarRoi(d)) só para clínica com entraNaCarteira"
      pattern: "grupoSemRoi\\("
    - from: api/_lib/flwchat-sync.ts
      to: "https://api.wts.chat/crm/v2/panel/card"
      via: "flwGet com Statuses=WON e depois Statuses=LOST, só para os ids closed do painel"
      pattern: "/crm/v2/panel/card"
---

<objective>
Corrigir os defeitos NOSSOS que o debug carteira-problemas-clientes achou na Carteira (/admin, "Clientes do Nexo") e nas leituras por trás dela. São 5 itens, todos de dev, sem migration:
1. O cartão de login conta acesso que a equipe nunca criou como "médico que não entra". Passa a mostrar dois fatos: "não entra há mais de 14 dias" (o alerta real; em produção, a Lana) e "sem acesso criado" (neutro, tarefa da equipe).
2. O cartão "Sem ROI calculável" junta 6 motivos sob "falta dado". Passa a separar cliente, equipe e "não se aplica". Com 0 vendas, o 0/0 deixa de travar.
3. No FlwChat, o ganho fechado vira "closed" e some das vendas (Juliana Paola, Marcella). Os closed passam a ser conferidos na v2, que diz WON ou LOST.
4. O botão Sincronizar do Instagram pela Graph exige a variável global que a VPS não tem. Passa a usar o token por perfil.
5. Reserva global ausente não aparecia em lugar nenhum. Passa a aparecer pelo nome na Carteira e no erro do Kommo, com o helper pronto para o /readyz.

Purpose: a equipe confia no cartão. Cada número aponta um problema real e diz de quem é (core value do PROJECT.md).
Output: dois módulos novos (src/lib/carteira-alertas.ts, api/_lib/avisos-da-carteira.ts), o alvo carteira_avisos, roi.ts com grupos, a Carteira com os cartões honestos, a leitura v2 dos fechados do FlwChat, o botão do Instagram sem a reserva global, e testes unitários e e2e.
</objective>

<execution_context>
@/Users/joao/dev/dashboard-gsd/.claude/gsd-core/workflows/execute-plan.md
@/Users/joao/dev/dashboard-gsd/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/debug/carteira-problemas-clientes.md (Evidence; "Tabela por clínica" ~l.920; variáveis ~l.954; "Correções em ordem de prioridade" ~l.976)
@src/routes/_authenticated.admin.index.tsx (l.235-271 login e ROI; l.275-288 filtros; l.386-389 contagens; l.403-413 cartões; l.428-431 chips; l.490-494 chip da linha; l.505-513 célula do ROI)
@src/lib/roi.ts (l.215-373 montarRoi; l.375-382 resumoRoi)
@src/lib/negocio-proprio.ts
@api/sync/manual.ts (l.133; l.188-230 autenticação e alvoGlobal; l.234-249 bloco agentes; l.250 ramo da conferência; l.449-462 sincronizarPosts; l.655-663 executar)
@api/_lib/request-validation.ts (l.12 enum; l.40 exceção do client_id)
@api/_lib/resumo-equipe.ts (padrão getUserById com service role)
@src/lib/audiencia.ts (l.40-54: padrão de POST em /api/sync/manual com Bearer)
@api/_lib/flwchat-sync.ts (l.1-27 cabeçalho; l.84 flwGet; l.141-160 fetchCards v1; l.379-392 config e avisos; l.528-532 linha do card; l.561-604 fechamento e config)
@docs/apis/wts-flwchat.md (l.36, l.51-54, l.92: a v2 tem status e o filtro Statuses = OPEN, WON, LOST, ARCHIVED)
@api/sync/kommo-leads.ts (l.98-99, l.134-135)
@api/_lib/meta-graph-sync.ts (l.749-757: token da conta primeiro, env como reserva)
@tests/e2e/admin-painel.spec.ts (teste "Carteira")
@tests/e2e/admin-dados.ts (mockCarteira, CLINICAS, roi_periodo, client_members)
@scripts/test-roi.ts
@scripts/test-flwchat-fechados.ts

<interfaces>
Contratos que o executor cria (os nomes valem, a implementação é livre):

src/lib/carteira-alertas.ts (puro, só com import relativo terminado em .js, para o api/ conseguir importar, como em api/_lib/resumo-equipe.ts):
- DIAS_SEM_ENTRAR = 14
- entraNaCarteira(c: { id: string; active?: boolean | null }): boolean. É c.active !== false && !ehNegocioProprio(c.id).
- type AcessoClinica = { client_id: string; usuarios: number; ultimo_acesso: string | null; criado_em: string | null }
- type AvisoReserva = { variavel: "KOMMO_API_TOKEN" | "META_ACCESS_TOKEN"; conexoes: number; texto: string }
- type AvisosDaCarteira = { acessos: AcessoClinica[]; reservas: AvisoReserva[] }
- agruparAcessos(membros: { client_id: string; user_id: string }[], equipe: Set<string>, usuarios: Map<string, { last_sign_in_at: string | null; created_at: string | null }>): AcessoClinica[]
- fatoDeAcesso(x: { clinica: { id: string; active?: boolean | null }; membrosCliente: number | undefined; acesso: AcessoClinica | null | undefined; lido: boolean; hoje: number }): { fato: "fora" | "sem_acesso" | "nao_entra" | "entra" | "nao_lido"; dias: number | null }
- avisosDeReserva(uso: { kommoSemTokenProprio: number; instagramGraphSemTokenProprio: number }, temVariavel: (nome: string) => boolean): AvisoReserva[]

api/_lib/avisos-da-carteira.ts:
- lerUsoDeReservas(admin: SupabaseClient): Promise<{ kommoSemTokenProprio: number; instagramGraphSemTokenProprio: number }>
- lerAvisosDaCarteira(admin: SupabaseClient, temVariavel?: (nome: string) => boolean): Promise<AvisosDaCarteira>

src/lib/roi.ts (acréscimos):
- Roi.motivoFinal: "item" | "so_crescimento" | "sem_investimento" | "sem_venda" | "sem_separacao" | "sem_venda_anuncio" | "poucas_vendas_anuncio" | null
- type GrupoSemRoi = "cliente" | "equipe" | "nao_se_aplica"; ITENS_DA_EQUIPE; ITENS_DO_CLIENTE; ROTULO_GRUPO_SEM_ROI; grupoSemRoi(r: Roi): GrupoSemRoi | null

api/_lib/flwchat-sync.ts (acréscimos):
- idsComSituacao(itens: unknown, situacao: "WON" | "LOST"): Set<string>
- reclassificarFechados(fechados: string[], ganhos: Set<string>, perdidos: Set<string>): { won: string[]; lost: string[] }
- deveConferirFechadosV2(config: { cards_por_item?: boolean; fechados_v2_em?: string }, agora: number): boolean
- FECHADOS_V2_INTERVALO_MS = 6 h
</interfaces>
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Acesso do médico de ponta a ponta. O servidor lê o último acesso e as reservas; a Carteira mostra "não entra há mais de 14 dias" e "sem acesso criado"</name>
  <files>src/lib/carteira-alertas.ts, api/_lib/avisos-da-carteira.ts, api/_lib/request-validation.ts, api/sync/manual.ts, src/lib/admin-data.ts, src/routes/_authenticated.admin.index.tsx, scripts/test-carteira-alertas.ts, tests/e2e/admin-dados.ts, tests/e2e/admin-painel.spec.ts</files>
  <behavior>
    - entraNaCarteira: clínica com active=false dá false; Doctor Creator (0ef2c738-…) e Douglas Gomides (ba5231d4-…) dão false; clínica ativa comum dá true.
    - fatoDeAcesso com hoje = 2026-11-11T12:00Z, nos casos abaixo:
      - Caso Lana: 1 membro, ultimo_acesso 2026-10-05 → nao_entra, dias 37.
      - O mesmo membro com ultimo_acesso 2026-11-01 → entra.
      - 0 membros → sem_acesso.
      - Inativa ou negócio próprio → fora, mesmo com 0 membros.
      - Acesso criado e nunca usado (ultimo_acesso null): criado_em de 3 dias atrás → entra; criado_em de 30 dias atrás → nao_entra.
      - lido=false, ou membrosCliente undefined → nao_lido.
    - Retrato do debug (Q1), montado como fixture com 20 clínicas: 19 ativas e 1 inativa (Carrion, com 1 membro e último acesso em 28/09). Entre as ativas estão os 2 do negócio próprio, sem membro, e a Lana, com 1 membro e último acesso em 05/10. As outras 16 não têm membro. Resultado esperado: sem_acesso = 16 e nao_entra = 1.
    - agruparAcessos: membro que está em app_admins fica fora. usuarios conta os não-admin distintos. ultimo_acesso e criado_em são os maiores da clínica. JSON.stringify do resultado não contém o user_id de entrada.
    - avisosDeReserva({ kommoSemTokenProprio: 1, instagramGraphSemTokenProprio: 0 }, () => false) dá 1 item: variavel KOMMO_API_TOKEN, conexoes 1. Com o predicado true, a lista sai vazia. Com as duas contagens em 0, também sai vazia.
    - Sem vazar valor: o predicado sai de um env falso { META_ACCESS_TOKEN: "valor-secreto-de-teste" } com instagramGraphSemTokenProprio = 2. A lista não tem META_ACCESS_TOKEN, e JSON.stringify dela não contém "valor-secreto-de-teste".
    - manualRequestSchema.safeParse({ alvo: "carteira_avisos" }).success === true (sem client_id).
  </behavior>
  <action>
Comece pelo teste vermelho em scripts/test-carteira-alertas.ts, com os casos do behavior, e rode para ver falhar. Depois implemente, nesta ordem:

(1) src/lib/carteira-alertas.ts, novo e puro, com o contrato de interfaces. Ele importa ehNegocioProprio de "./negocio-proprio.js" (import relativo .js, sem o alias @/, para o api/ conseguir importar). O limite é dias > DIAS_SEM_ENTRAR. A referência é ultimo_acesso ?? criado_em; sem nenhum dos dois, o fato é nao_lido. O texto do aviso de reserva é técnico, para a equipe, e cita só nome e contagem:
- KOMMO_API_TOKEN: "N conexão(ões) Kommo ativa(s) sem token próprio depende(m) da reserva KOMMO_API_TOKEN, que o servidor não tem. Grave o token na própria conexão."
- META_ACCESS_TOKEN: o equivalente para "perfil(is) do Instagram pela Meta", terminando em "Grave o token do perfil."

avisosDeReserva só recebe o predicado temVariavel (booleano), nunca o env inteiro. Assim o valor não tem como chegar à saída.

(2) api/_lib/avisos-da-carteira.ts, novo. Importa tipos e funções puras de "../../src/lib/carteira-alertas.js".
- lerAvisosDaCarteira lê client_members (client_id, user_id) e app_admins (user_id) com o client de service role, paginando por range de 1000.
- Para cada user_id distinto que não é admin, chama admin.auth.admin.getUserById, no padrão de api/_lib/resumo-equipe.ts:17, em lotes de 10 com Promise.all. Guarda só last_sign_in_at e created_at; e-mail e metadados ficam fora. Depois chama agruparAcessos.
- lerUsoDeReservas(admin) faz as contagens sem nunca pôr access_token nem meta_access_token num select:
  - clínicas ativas: clients com active=true e eh_teste=false;
  - Kommo: crm_connections select("id, client_id"), com provider=kommo, active=true e o filtro or("access_token.is.null,access_token.eq."), contando só clínica ativa;
  - Instagram: instagram_accounts select("id, client_id"), com active=true e sync_source=meta_graph. Os perfis com token saem de instagram_account_secrets select("instagram_account_id"), com in(ids), not("meta_access_token","is",null) e neq("meta_access_token",""). Conta só os de clínica ativa que ficam sem token.
- O temVariavel padrão é (n) => !!process.env[n]?.trim(). Exporte as duas funções: server/vps.ts, que só existe em vps/producao, vai reusar lerUsoDeReservas e avisosDeReserva no /readyz (handoff na seção output).

(3) api/_lib/request-validation.ts: ponha "carteira_avisos" no enum do alvo (l.12) e na exceção do client_id do superRefine (l.40), junto de conferencia e agentes.

(4) api/sync/manual.ts:
- Ponha carteira_avisos no alvoGlobal (l.197). Assim, quem não é admin recebe 403 pelo ramo das l.210-213.
- Dentro do try, logo depois do bloco do alvo agentes (l.238-249) e ANTES do if (alvoGlobal) da conferência (l.250), responda 200 com { alvo, ok: true, ...(await lerAvisosDaCarteira(admin)) }. Se ficar depois, o alvo cai na conferência.

(5) src/lib/admin-data.ts: crie getAvisosDaCarteira(): Promise<AvisosDaCarteira>, com POST em /api/sync/manual, Bearer da sessão e body { alvo: "carteira_avisos" }, no padrão de src/lib/audiencia.ts:40-54. Quando r.ok for falso, lance o erro, para a query ir a isError.

(6) src/routes/_authenticated.admin.index.tsx:
- Mantenha a query de client_members menos app_admins (l.236-250): ela é a fonte de membrosCliente. Crie a useQuery ["admin-avisos-carteira"] com getAvisosDaCarteira, staleTime de 5 min e retry false.
- Troque o helper das l.251 e 387 por fatoDeAcesso por clínica (hoje = Date.now()). Daí saem nNaoEntra e nSemAcesso; a clínica com fato "fora" não entra em nenhuma das duas contas.
- Cartão i=4 (l.408):
  - rotulo "Médico não entra", valor nNaoEntra;
  - nota `Há mais de ${DIAS_SEM_ENTRAR} dias · ${nSemAcesso} sem acesso criado (a equipe cria)`;
  - tom: atencao com nNaoEntra > 0; ok com 0; neutro enquanto lê;
  - com a query em erro: valor "–" e nota "Não consegui ler o último acesso · N sem acesso criado (a equipe cria)";
  - o onClick filtra "nao_entra".
- Filtros: no tipo do filtro (l.275), troque o id antigo por "nao_entra" e "sem_acesso"; as l.286 e 431 viram dois chips, "Não entra" (nNaoEntra) e "Sem acesso criado" (nSemAcesso).
- Linha (l.490-494), por fato:
  - sem_acesso: chip tom "neutro", "Sem acesso criado · dar acesso", com o mesmo Link para /admin/$clientId#acesso e o title "A equipe ainda não criou o acesso de ninguém da clínica.";
  - nao_entra: chip tom "atencao", "Não entra há N dias", com o mesmo Link e o title "Último acesso de alguém da clínica: dd/mm" (ou "Acesso criado e nunca usado").
- Logo abaixo dos AdmContadores, com reservas.length > 0, mostre um NxAlertaCurto tom "atencao": titulo "O servidor não tem uma reserva que uma conexão ativa usa", e o texto de cada aviso numa linha.

A tela continua com 6 cartões (decisão minha, de discrição: um cartão com o alerta no valor e o fato neutro na nota, para não quebrar a grade).

(7) tests/e2e/admin-dados.ts, no mockCarteira: registre "**/api/sync/manual". Ele responde só quando postDataJSON().alvo === "carteira_avisos"; para o resto, route.fallback().
- acessos: id(4) com ultimo_acesso quando(37); id(5) quando(2); id(6) quando(1); id(7) quando(3). Todos com usuarios 1.
- reservas: [{ variavel: "KOMMO_API_TOKEN", conexoes: 1, texto }], com o texto do item (1).
- O client_members mock já dá membro a CLINICAS.slice(1, 5). Então CID e id(8) ficam sem acesso.

(8) tests/e2e/admin-painel.spec.ts, no teste "Carteira", acrescente:
- 6 .adm-cont continua;
- o valor do .adm-cont com "Médico não entra" é "1", e a nota contém "2 sem acesso criado";
- o alerta contém "KOMMO_API_TOKEN";
- clicar no cartão deixa aria-pressed=true e 1 linha (Dra. Ana Souza), com o chip "Não entra há 37 dias";
- o chip de filtro "Sem acesso criado" dá 2 linhas.
  </action>
  <verify>
    <automated>node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-carteira-alertas.ts && node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-api-security.ts && grep -Eq 'const alvoGlobal = .*"carteira_avisos"' api/sync/manual.ts && test "$(grep -v '^\s*//' src/routes/_authenticated.admin.index.tsx | grep -c 'Médico sem login')" -eq 0 && test -f api/_lib/avisos-da-carteira.ts && test "$(grep -v '^\s*//' api/_lib/avisos-da-carteira.ts | grep -Ec 'select\([^)]*access_token')" -eq 0 && npm run routes:generate >/dev/null && test "$(npx tsc --noEmit 2>&1 | grep 'error TS' | grep -Ev '^(scripts/test-perfil-da-clinica\.ts|workers/creative/intelligence\.ts)\(' | wc -l | tr -d ' ')" -eq 0 && set -o pipefail && VITE_SUPABASE_URL=http://localhost:9 VITE_SUPABASE_PUBLISHABLE_KEY=fake-public-test-key npm run build 2>&1 | tail -n 5 && PLAYWRIGHT_PORT=5199 PLAYWRIGHT_SKIP_BUILD=1 npx playwright test tests/e2e/admin-painel.spec.ts --workers=1 -g "Carteira"</automated>
    <fails_when>Falha quando acontece qualquer um destes:
- test-carteira-alertas sai diferente de 0. Exemplos:
  - a Lana com 37 dias não dá nao_entra;
  - o retrato do debug não dá 16 e 1;
  - um user_id ou o valor falso do env aparece na saída;
  - o schema recusa o alvo sem client_id.
- test-api-security quebra.
- carteira_avisos não está no alvoGlobal. Nesse caso, quem não é admin passaria do 403.
- O rótulo antigo do cartão de login continua fora de comentário. Baseline: 2.
- avisos-da-carteira.ts não existe ou tem um select com coluna de token.
- O tsc tem erro fora dos 2 arquivos já conhecidos. Baseline: 0 fora deles; 4 dentro.
- O build falha.
- O e2e da Carteira falha. Exemplos: o cartão não mostra 1; a nota não diz "2 sem acesso criado"; o alerta não cita KOMMO_API_TOKEN; o filtro não dá 1 e 2 linhas; a tela deixa de ter 6 cartões.</fails_when>
  </verify>
  <done>O admin abre /admin e vê "Médico não entra" com a contagem de quem tem acesso e não entra há mais de 14 dias. Na nota, vê quantas clínicas ainda não têm acesso criado. Inativa e negócio próprio ficam fora. Os dois fatos filtram a lista. Uma reserva ausente aparece pelo nome. O último acesso só sai por um alvo só de admin, e só em agregado por clínica.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: "Sem ROI calculável" em três grupos honestos (cliente, equipe, não se aplica), com 0/0 que não trava</name>
  <files>src/lib/roi.ts, src/routes/_authenticated.admin.index.tsx, scripts/test-roi.ts, tests/e2e/admin-dados.ts, tests/e2e/admin-painel.spec.ts</files>
  <behavior>
    - 0 vendas com o resto em dia (base com ganhos 0, ganhos_com_valor 0, ganhos_com_canal 0, receita 0, ganhos_anuncio 0):
      - os itens valor e origem_vendas ficam feito;
      - motivoSemCalculo casa com /nenhuma venda foi ganha no período/;
      - motivoFinal "sem_venda";
      - grupoSemRoi "nao_se_aplica".
      Isso substitui a asserção antiga da l.79 de test-roi.ts, que esperava "falta: preencher o valor".
    - 0 leads: o item origem fica feito, com detalhe sem percentual.
    - Juliana Paola (Q3): flwchat, investido 8136, leads 132, leads_com_origem 18, ganhos 0. Pendências ["origem"]; grupo "cliente".
    - Fernanda Nunes: rdstation, ganhos 0, origem em dia. Grupo "nao_se_aplica", com "nenhuma venda".
    - Keylon: tem_crm false, investido 4191. Grupo "equipe".
    - Antonione: ganho_identificavel false, leads_com_origem 59 de 223, investido 0. Grupo "equipe" (a equipe vem antes do cliente).
    - Lana: ganhos_com_valor 6 de 46. Grupo "cliente".
    - Samira: valor 0/6, origem 20/104, canal 4/6. Grupo "cliente".
    - Resto em dia com ganhos_anuncio 3: motivoFinal "poucas_vendas_anuncio", grupo "nao_se_aplica".
    - Resto em dia com investido_aquisicao 0 e investido 0: motivoFinal "sem_investimento", grupo "nao_se_aplica".
    - ganhos_anuncio null: motivoFinal "sem_separacao", grupo "equipe".
    - base calculável: motivoFinal null, grupoSemRoi null.
    - O caso juliana da l.49, com ganhos 6, segue igual: pendências ["valor", "origem"] e "faltam 2 itens".
  </behavior>
  <action>
Comece ajustando scripts/test-roi.ts com o behavior (vermelho primeiro). Depois:

(1) src/lib/roi.ts, em montarRoi (l.215-307), aplique a regra 0/0: denominador zero não é falta de dado.
- "valor" (l.272) fica feito quando d.ganhos <= 0, com detalhe "Nenhuma venda ganha no período: não há valor a conferir.".
- "origem_vendas" (l.296) fica feito quando d.ganhos <= 0, com detalhe "Nenhuma venda ganha no período: não há canal a conferir.".
- "origem" (l.284) fica feito quando d.leads <= 0, com detalhe "Nenhum lead no período: não há origem a conferir.".
Com isso, o motivo de 0 vendas vira o texto leigo que já existe na l.326.

Acrescente Roi.motivoFinal, calculado na mesma cascata de motivoSemCalculo (l.319-333):
- "item" quando há bloqueio;
- depois so_crescimento, sem_investimento, sem_venda, sem_separacao, sem_venda_anuncio e poucas_vendas_anuncio;
- null quando calculável.

Exporte:
- GrupoSemRoi;
- ITENS_DA_EQUIPE (anuncios, crm, compartilhado, etapas) e ITENS_DO_CLIENTE (valor, origem, origem_vendas);
- ROTULO_GRUPO_SEM_ROI: cliente "Falta dado no CRM (cliente)"; equipe "Falta ligar fonte ou mapear etapa (equipe)"; nao_se_aplica "Não se aplica: sem venda, sem investimento ou amostra pequena".

grupoSemRoi(r) segue esta regra:
- null quando calculável;
- "equipe" quando algum item bloqueante não feito está em ITENS_DA_EQUIPE, ou quando motivoFinal é "sem_separacao";
- senão, "cliente" quando algum está em ITENS_DO_CLIENTE;
- senão, "nao_se_aplica".

A precedência equipe > cliente é decisão minha, de discrição: sem fonte ou etapa, o dado do cliente nem pode ser lido. Os textos que o médico vê no Resultado continuam leigos; só muda o caso de 0 vendas, que passa a dizer a verdade.

(2) src/routes/_authenticated.admin.index.tsx:
- Troque semRoi (l.268-271) por grupoDe(c). Ele devolve null quando !entraNaCarteira(c) (de src/lib/carteira-alertas.ts, Task 1) e grupoSemRoi(roiDe(c.id)) nos outros casos.
- Conte nCliente, nEquipe e nNaoSeAplica.
- Cartão i=5 (l.409):
  - rotulo "Sem ROI calculável" (fica);
  - valor nCliente + nEquipe;
  - nota `${nCliente} cliente (CRM) · ${nEquipe} equipe (fonte ou etapa) · ${nNaoSeAplica} não se aplica`, no lugar do texto antigo da l.409;
  - titulo (tooltip) com os três ROTULO_GRUPO_SEM_ROI;
  - tom atencao com valor > 0.
- O filtro "sem_roi" (l.287) e o chip "Sem ROI" (l.430) passam a usar só os grupos cliente e equipe.
- Na célula do ROI da linha (l.505-509), o title vira `${ROTULO_GRUPO_SEM_ROI[grupo]}: ${motivoSemCalculo}` quando há grupo.

(3) tests/e2e/admin-dados.ts, no roi_periodo mock (l.100-106), acrescente, além do id(8) calculável:
- id(6) com 0 vendas: tem_anuncios true, tem_crm true, ganho_identificavel true, investido 1500, investido_aquisicao 1500, investido_estimado 0, leads 40, leads_com_origem 36, ganhos 0, ganhos_com_valor 0, ganhos_com_canal 0, receita 0, ganhos_anuncio 0, ganhos_anuncio_com_valor 0, receita_anuncio 0;
- id(7), grupo cliente: os mesmos campos com ganhos 10, ganhos_com_valor 2, ganhos_com_canal 9, ganhos_anuncio 6, receita 4000, receita_anuncio 3000.
As outras (CID, id(4), id(5)) seguem com [] e caem em equipe.

(4) tests/e2e/admin-painel.spec.ts, no teste "Carteira":
- o valor do cartão "Sem ROI calculável" é "4";
- a nota contém "1 cliente (CRM)", "3 equipe" e "1 não se aplica";
- clicar no cartão dá 4 linhas.
  </action>
  <verify>
    <automated>node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-roi.ts && node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-carteira-alertas.ts && grep -q 'export function grupoSemRoi' src/lib/roi.ts && grep -q 'grupoSemRoi(' src/routes/_authenticated.admin.index.tsx && test "$(grep -c 'Falta dado para o retorno de 30 dias' src/routes/_authenticated.admin.index.tsx)" -eq 0 && npm run routes:generate >/dev/null && test "$(npx tsc --noEmit 2>&1 | grep 'error TS' | grep -Ev '^(scripts/test-perfil-da-clinica\.ts|workers/creative/intelligence\.ts)\(' | wc -l | tr -d ' ')" -eq 0 && set -o pipefail && VITE_SUPABASE_URL=http://localhost:9 VITE_SUPABASE_PUBLISHABLE_KEY=fake-public-test-key npm run build 2>&1 | tail -n 5 && PLAYWRIGHT_PORT=5199 PLAYWRIGHT_SKIP_BUILD=1 npx playwright test tests/e2e/admin-painel.spec.ts --workers=1 -g "Carteira"</automated>
    <fails_when>Falha quando acontece qualquer um destes:
- test-roi sai diferente de 0. Exemplos:
  - 0 vendas ainda trava em "valor";
  - a Juliana Paola não cai em cliente;
  - o Antonione não cai em equipe;
  - poucas vendas de anúncio não cai em não se aplica;
  - o caso juliana antigo muda.
- test-carteira-alertas quebra.
- grupoSemRoi não está exportado nem usado na Carteira. Baseline: 0.
- A nota antiga do cartão de ROI continua na rota. Baseline: 1.
- O tsc tem erro fora dos 2 arquivos conhecidos.
- O build falha.
- O e2e da Carteira falha. Exemplos: o cartão de ROI não dá 4; a nota não separa 1/3/1; o filtro não dá 4 linhas; os cartões de login da Task 1 regrediram.</fails_when>
  </verify>
  <done>O cartão de ROI diz quantas clínicas travam por algo a arrumar e de quem é a vez: cliente no CRM ou equipe na fonte ou etapa. A nota diz quantas não se aplicam (sem venda, sem investimento ou amostra pequena). 0/0 não aparece mais como "falta preencher". Inativa e negócio próprio não contam.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Leituras honestas. O ganho e a perda fechados do FlwChat vêm pela v2; o botão do Instagram não exige mais a reserva global; o erro do Kommo cita a reserva ausente</name>
  <files>api/_lib/flwchat-sync.ts, scripts/test-flwchat-fechados.ts, api/sync/manual.ts, api/sync/kommo-leads.ts, docs/apis/wts-flwchat.md</files>
  <behavior>
    - idsComSituacao([{ id: "a", status: "WON" }, { id: "b", status: "OPEN" }, { id: "c" }, { status: "WON" }, { id: "d", status: "won" }], "WON") devolve Set{"a", "d"}. O status não diferencia maiúscula. Item sem status ou sem id fica fora: se a API ignorar o filtro, ela não consegue reclassificar card aberto.
    - idsComSituacao(null | {} | "x" | { items: [...] }, "LOST"): aceita o array direto ou body.items; o resto dá Set vazio.
    - reclassificarFechados(["a", "b", "c", "d"], Set{"a", "d"}, Set{"b", "d"}) → { won: ["a"], lost: ["b"] }. "d" está nos dois (contradição) e fica closed; "c" fica closed.
    - deveConferirFechadosV2:
      - { cards_por_item: true } → false (Sergio fora);
      - { fechados_v2_em: 1 h atrás } → false;
      - { fechados_v2_em: 7 h atrás } → true;
      - {} → true;
      - data inválida → true.
    - Os casos que já existem em test-flwchat-fechados, test-flwchat-reconciliacao e test-flwchat-substituidos continuam passando.
  </behavior>
  <action>
Comece estendendo scripts/test-flwchat-fechados.ts com o behavior (vermelho). Depois:

(1) api/_lib/flwchat-sync.ts. Use a v2, que o repo documenta como verificada em docs/apis/wts-flwchat.md:51-54: /crm/v2/panel/card tem `status` e o filtro `Statuses` = OPEN, WON, LOST, ARCHIVED. Implemente a troca mais segura, que NÃO tira a v1 da listagem dos abertos. O comentário das l.141-145 continua valendo, porque a v1 decide o que está aberto e o que fechou.

Crie as funções puras do contrato e FECHADOS_V2_INTERVALO_MS = 6 * 3_600_000.

Crie fetchIdsV2(token, panelId, situacao, procurados: Set<string>, deadlineMs). Ela pagina flwGet(token, "/crm/v2/panel/card", { panelId, Statuses: situacao, pageSize: PAGE_SIZE, pageNumber }), com um valor só por chamada (WON numa, LOST noutra), para não depender de como a API codifica array. Para quando acontece qualquer um destes:
- hasMorePages falso;
- todos os procurados foram achados;
- o teto de 30 páginas;
- o deadline.
Ela devolve idsComSituacao ∩ procurados.

Na volta por painel do bloco de fechamento (l.563-598), depois do update que grava "closed", faça a conferência só quando deveConferirFechadosV2(configAtual, Date.now()) for true:
- leia os external_lead_id com outcome "closed" daquela conexão e painel, paginando por range de 1000 como a leitura dos abertos;
- se houver algum, busque WON e LOST;
- aplique reclassificarFechados com update outcome "won" ou "lost", em lotes de 300, filtrando eq("outcome", "closed"). Só closed muda; open e resultado confirmado nunca são tocados.
- Erro ou resposta inesperada da v2 vai para `avisos`, não para `errors`. Exemplo: "painel X: a v2 não confirmou ganho/perda dos fechados; seguem como fechados". Assim a fonte não fica vermelha por causa da tentativa.
- No fim, grave config.fechados_v2_em = agora (ISO), junto da escrita de config que já existe (l.599-604), ou numa escrita própria no mesmo padrão. Isso limita a uma conferência a cada 6 h por conexão.

Deixe um comentário curto e claro no código: "v2 com Statuses: confirmado só pela doc (docs/apis/wts-flwchat.md:51-54); conferir ao vivo com o teste de contrato antes de confiar no número". Atualize também o cabeçalho das l.12-14.

A conexão com config.cards_por_item (Support Clinic do Dr. Sergio Maia) fica fora de propósito. A contagem dele é a pendência "venda por pessoa vs card" e não muda nesta tarefa.

(2) api/sync/manual.ts, em sincronizarPosts (l.449-462): tire o throw das l.449-451.
- Antes da volta, leia de instagram_account_secrets quais perfis de perfisGraph têm token próprio: select("instagram_account_id"), com in(ids), not("meta_access_token","is",null) e neq("meta_access_token",""). Nunca selecione a coluna do token.
- Perfil sem token próprio, com a reserva vazia: empurre em contas { accountId: perfil.id, posts: 0, errors: ["Perfil do Instagram sem token próprio da Meta, e o servidor não tem a reserva META_ACCESS_TOKEN"] } e siga para o próximo perfil.
- Os outros perfis chamam runMetaGraphSync com accessToken: META_ACCESS_TOKEN ?? "". O runMetaGraphSync já usa o token do perfil primeiro (meta-graph-sync.ts:757), igual ao que b2a3835 fez em meta-graph.ts na VPS.
- Ajuste o comentário de sincronizarComentarios (l.466-468), que diz que os posts exigem a variável.

(3) api/sync/kommo-leads.ts, l.99 e l.135: o erro passa a ser "Conexão sem token Kommo próprio, e o servidor não tem a reserva KOMMO_API_TOKEN". Esse texto aparece na Saúde das fontes.

(4) docs/apis/wts-flwchat.md: na tabela das l.36 e l.92, registre que os fechados agora são conferidos na v2 (Statuses=WON e Statuses=LOST, a cada 6 h, fora cards_por_item) e que falta a conferência ao vivo (CONTRATO_AO_VIVO=1 CONTRATO_WTS_TOKEN=... CONTRATO_FLW_PAINEL=<id>).
  </action>
  <verify>
    <automated>for t in test-flwchat-fechados test-flwchat-reconciliacao test-flwchat-substituidos test-contrato-wts-flwchat; do node --import ./scripts/test-network-guard.mjs --import tsx scripts/$t.ts || exit 1; done && grep -q 'export function idsComSituacao' api/_lib/flwchat-sync.ts && grep -q '"/crm/v2/panel/card"' api/_lib/flwchat-sync.ts && test "$(grep -v '^\s*//' api/sync/manual.ts | grep -c 'mas META_ACCESS_TOKEN')" -eq 0 && test "$(grep -c 'servidor não tem a reserva KOMMO_API_TOKEN' api/sync/kommo-leads.ts)" -ge 2 && npm run routes:generate >/dev/null && test "$(npx tsc --noEmit 2>&1 | grep 'error TS' | grep -Ev '^(scripts/test-perfil-da-clinica\.ts|workers/creative/intelligence\.ts)\(' | wc -l | tr -d ' ')" -eq 0</automated>
    <fails_when>Falha quando acontece qualquer um destes:
- Algum dos 4 scripts sai diferente de 0. Exemplos:
  - item OPEN ou sem status vira won;
  - id nos dois conjuntos sai reclassificado;
  - cards_por_item não bloqueia a conferência;
  - o intervalo de 6 h não vale;
  - a reconciliação ou os substituídos antigos regrediram.
- idsComSituacao não está exportado, ou a rota v2 não aparece como string no código. Baseline: 0; hoje ela só aparece em comentário.
- O throw do token global continua em manual.ts. Baseline: 1.
- O erro novo do Kommo não está nas 2 linhas. Baseline: 0.
- O tsc tem erro fora dos 2 arquivos conhecidos.</fails_when>
  </verify>
  <done>Na próxima rodada, o card ganho e fechado no FlwChat volta como venda: Juliana Paola, Marcella e Mariela deixam de ter 0 por leitura nossa. Isso depende da conferência ao vivo da v2, sinalizada no SUMMARY. O Sergio fica como está. Clicar em Sincronizar no Instagram pela Graph não pinta mais vermelho falso. O erro do Kommo da Lana passa a dizer que falta a reserva no servidor.</done>
</task>

</tasks>

<threat_model>
ASVS L1. Não há instalação de pacote (o package.json não muda).

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| navegador → /api/sync/manual (alvo carteira_avisos) | o Bearer do usuário entra; a resposta leva dado de auth.users em agregado |
| processo do servidor → resposta HTTP | os nomes das variáveis podem sair; os valores nunca |
| Nexo → API FlwChat v2 | a resposta externa decide o resultado de um card |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-ofr-01 | Information disclosure | avisosDeReserva / alerta da Carteira | high | mitigate | A função só recebe o predicado booleano temVariavel e devolve nome e contagem. O teste usa um env falso com "valor-secreto-de-teste" e prova que o valor não sai. Este é também o contrato do /readyz (handoff). |
| T-ofr-02 | Information disclosure | alvo carteira_avisos (last_sign_in_at) | high | mitigate | O alvo está em alvoGlobal, então quem não é admin recebe 403 (manual.ts:210-213). O gate grep confere isso. A resposta tem só client_id, usuarios, ultimo_acesso e criado_em. O teste prova que o user_id não sai, e o e-mail nunca é guardado. |
| T-ofr-03 | Information disclosure | lerUsoDeReservas e o pré-check do Instagram | medium | mitigate | A presença do token é filtrada no banco (is.null, eq., not is null). access_token e meta_access_token nunca entram num select; o gate grep checa avisos-da-carteira.ts. |
| T-ofr-04 | Tampering | reclassificação dos fechados do FlwChat | medium | mitigate | Só closed vira won ou lost (eq outcome closed). O status do item precisa ser igual ao pedido, e o id nos dois conjuntos fica closed. cards_por_item fica fora. Uma falha vira aviso. |
| T-ofr-05 | Denial of service | chamadas v2 por rodada | low | mitigate | Uma conferência a cada 6 h por conexão, teto de 30 páginas, parada quando acha todos e respeito ao deadline. O limite da Helena é 1.000 por 5 min. |
| T-ofr-06 | Denial of service | /readyz com leitura no banco (handoff) | low | mitigate | No handoff, os avisos ficam com cache de 5 min e timeout de 1,5 s, e o erro vira avisos: null. O status 200/503 segue só pelas 3 variáveis essenciais. |
| T-ofr-SC | Tampering | npm installs | low | accept | Nenhum pacote novo; o package.json fica igual. |
</threat_model>

<verification>
- `npm run routes:generate && npx tsc --noEmit`: só os 4 erros já conhecidos, em scripts/test-perfil-da-clinica.ts e workers/creative/intelligence.ts.
- `npm test 2>&1 | grep '^FAIL' | grep -Ev 'test-(creative-discovery|creative-theme|kommo-closed-at|nao-medido|status-que-nao-mente|tela-honesta)\.ts'`: não imprime nada. As 6 falhas conhecidas ficam de fora.
- O e2e da Carteira, depois do build com as variáveis falsas, passa com `--workers=1`.
- `git diff --stat -- package.json package-lock.json supabase/migrations src/routes/sap* src/lib/sap*`: vazio. Sem migration e sem SAP.
</verification>

<success_criteria>
- Os 5 itens NOSSOS da lista do debug estão entregues.
- O /readyz fica com o helper pronto e a ligação descrita para vps/producao, porque o server/vps.ts não existe em gsd/nexo-v5.
- Com os dados do debug, os cartões dariam:
  - "Médico não entra" 1 (Lana), com 16 sem acesso criado;
  - "Sem ROI calculável" sem a inativa e sem o negócio próprio, separado por grupo.
- Nenhum valor de variável e nenhum dado de auth.users além do agregado sai para o navegador.
</success_criteria>

<output>
Criar `.planning/quick/261111-ofr-carteira-com-alertas-honestos-e-leituras/261111-ofr-SUMMARY.md` ao terminar. O SUMMARY precisa ter estas seções:

1. "Handoff para vps/producao (/readyz)". O server/vps.ts só existe em origin/vps/producao. No merge, o orquestrador:
   - importa lerUsoDeReservas de "../api/_lib/avisos-da-carteira.js" e avisosDeReserva de "../src/lib/carteira-alertas.js";
   - no ramo `/readyz` (server/vps.ts:99-100), mantém `ready` pelas 3 variáveis;
   - acrescenta o campo `avisos` (lista de { variavel, conexoes, texto }). Ele vem de uma leitura com createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), cache de 5 min e timeout de 1,5 s; o erro vira `avisos: null`;
   - deixa o status igual: 200 quando ready.
2. "A confirmar ao vivo": o filtro Statuses da v2 do FlwChat. Antes de confiar nas vendas da Juliana Paola, da Marcella e da Mariela, rodar o teste de contrato com CONTRATO_AO_VIVO, ou conferir na produção (SELECT) se closed virou won.
3. "Deferido", com a lista abaixo.

Deferido (fora deste plano):
- Planilha semanal fica vermelha com 10 dias, não 4 (status-fonte.ts:126-130 x saude-problemas.ts:105-111).
- O ROI somar o gasto da planilha (ads_planilha_semanal.valor_periodo) em roi_periodo_calc. Isso exige SQL ou migration, que esta tarefa não pode fazer (Marcelly e Mariela).
- Limpeza do .env.example (SHORTIO_DOMAIN, SYNC_DAYS) e dos textos "na Vercel" (anuncios-acoes.ts:51, agentes-ia.tsx:251, manual.ts:1062, meta-graph-sync.ts:845).
- Sergio Maia: "venda por pessoa vs card" (unidade de contagem do ROI). A conexão cards_por_item ficou fora de propósito.
- FlwChat: card ganho que nunca apareceu aberto (inserir pela v2) e preço (monetaryAmount) do card que virou won. As duas coisas ficam para depois da conferência ao vivo.
- Usuário que não é admin e está em várias clínicas (Q1b) conta como acesso da clínica. Também falta o conceito de "login previsto", porque o João decide quem ganha login no v5.
- Fora do dev: o UPDATE do token Kommo da Lana (João) e o secret v2 da VPS com a SHORTIO_API_KEY (ops, com o aval do João).
</output>
