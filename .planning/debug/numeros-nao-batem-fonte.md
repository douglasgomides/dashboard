---
status: awaiting_human_verify
trigger: "Números do Nexo não batem com a fonte: leads/CRM, seguidores do Instagram e cliques dos links short.gy vêm muito pra cima ou muito pra baixo. O Nexo tem que mostrar o mesmo número que a fonte mostra."
created: 2026-11-16
updated: 2026-11-16 (cycle 3)
goal: find_and_fix
---

# Números do Nexo não batem com a fonte

## Symptoms

- expected: cada número do Nexo (leads e etapas do CRM, seguidores do Instagram, cliques dos links short.gy) é o MESMO
  número que a fonte mostra no mesmo período (o CRM da clínica, o Instagram, o painel do short.io), mesmo quando a
  equipe usa mal a fonte. Diferença só quando o Nexo explica na tela por que difere.
- actual: a equipe relata números "muito pra cima ou muito pra baixo" em várias clínicas (todas, segundo o João):
  leads do CRM, seguidores, cliques nos links short.gy.
- errors: nenhum erro visível; números errados em silêncio.
- timeline: relatado em 16/11/2026; não se sabe desde quando.
- repro: abrir Carteira, Hoje, Resultados, Instagram e Anúncios de qualquer clínica ativa e comparar com a fonte no
  mesmo período.

## Regras desta sessão (obrigatórias)

- Repositório PÚBLICO: este arquivo e qualquer commit NUNCA levam nome de cliente, client_id, número de conta, telefone
  ou número por clínica. Evidência por clínica fica fora do repo, em
  /private/tmp/claude-501/-Users-joao-dev-dashboard-gsd/6a1a2e6f-b21e-4a15-9785-d9993d677b10/scratchpad/debug-numeros/
  (criar a pasta). Aqui só padrões ("em 4 clínicas o Kommo..."), sem identificar quem.
- Produção Supabase cvdnzoqduliopscfsrkc: só SELECT (leitura autorizada pelo João). Escrita, migração e SQL que grava:
  só o João roda. Preparar o arquivo em supabase/migrations ou supabase/operacoes e parar para ele.
- Nunca trocar papel/claim de JWT para se passar por admin. Funções de tela que conferem admin não rodam pela MCP:
  reproduzir a conta delas com SELECT sobre as tabelas.
- Nunca comparar clínicas entre si em tela.
- Medir velocidade antes/depois de qualquer mudança em função SQL por linha (lento em 04/11).
- Código vai para o ar na VPS com `NEXO_SEM_LINK_BASE=1 NEXO_VITE_SUPABASE_URL=https://cvdnzoqduliopscfsrkc.supabase.co bash scripts/vps/publicar.sh --publicar`
  e depois `bash scripts/vps/publicar.sh --conferir` ("conferir: ok"). A API (api/) roda na VPS. Árvore limpa exigida.
- Testes: `node --import ./scripts/test-network-guard.mjs --import tsx scripts/NOME.ts`; tsc tem 3 falhas conhecidas
  (test-contas-no-banco, test-perfil-da-clinica, workers/creative/intelligence); npm test tem 6 conhecidas.

## Already done today (do not redo)

- Chamaram por pessoa em 30 dias (migração 20261116100000 aplicada, histórico de 90 dias refeito).
- Instagram compara o mesmo número de dias medidos (Meta atrasa 2 dias); Anúncios compara só dias fechados.
- Conta de anúncios duplicada entre duas clínicas removida; disparo em massa fora das contas numa clínica Clint;
  funis Clint ignorados pelo nome; CRM/WhatsApp "Sem movimento" em vez de "Atrasada".
- Checado: instagram_account_daily_metrics.followers_count bate com new_followers − unfollowers em 30 dias em todas as
  clínicas; os últimos 2 dias vêm nulos (atraso da Meta). Cliques de anúncio usam link_clicks.

## Leads to investigate (hypotheses to test, not conclusions)

1. CRM: o Nexo conta leads/etapas com regras próprias (pacientes_periodo_calc: regex de etapa de entrada, pessoa
   única, crm_leads_do_cliente com filtro de conta compartilhada, etapas_base, removido_na_origem). Comparar, por
   clínica e período, o que o CRM mostra (Clint: MCP claude_ai_Clint leads_novos/resumo_funil; Kommo/FlwChat/Digisac/RD:
   o que temos em crm_leads e crm_lead_eventos) com o que cada tela mostra. Achar onde diverge e por quê.
2. Seguidores: telas diferentes podem mostrar números diferentes (saldo líquido x novos brutos x total; período com
   dias nulos no fim; Windsor x Graph em instagram_accounts.sync_source). Conferir com o total que o Instagram mostra.
3. short.gy: cliques dos links (sincronizarShortio em api/_lib, atribuição do link ao cliente pela bio/@/nome).
   Hipóteses: link atribuído à clínica errada, cliques somados em dobro (mesmo link em mais de um cliente ou em duas
   linhas), período/fuso, cliques de robô contados ou não como no painel do short.io.

## Current Focus

cycle: 4 (fixing, João's decisions of 16/11). Plan, in order:
  1. G1 agendou = consulta de lead novo: NEW migration 20261116150000 (after 140000; 120000-140000 untouched): exame added to
     the 130000 exclusion; old patients out of "agendaram" (CRM origin, conversation reading, first card in compra/base
     funnel, optional per-connection age limit); sale exclusion keeps the broad booking name (130000 side effect); same
     name rule in crm_funis_periodo, crm_perfil_para_analise and the "agendado em diante" functions. + G2 flag crm_registra.
  2. G2 UI: "O CRM não registra isso" instead of 0, conversation number apart (degrades: flag absent = today's text).
  3. D1 UI: líquido and bruto paired, 7 closed days; D2 rebuild (test what is testable).
  4. Per-clinic reading rules (migration 20261116160000, config-driven) + scratchpad para-joao-config-ciclo4.sql.
  5. short.gy proposals + Jornada lifetime clicks.
done: 1 (150000 + reversal) and the SQL half of 4 (160000 nao_e_lead / ganho_sem_valor_card_antigo_dias + reversal);
  scripts/test-agendou-lead-novo.ts passes on migration-built defs AND with NEXO_DEFS_VIVAS=<scratchpad defs-live-16-11>
  (before/after, idempotent, reversal md5 = before). preflight manifest 227/223/160000. test-agendou-e-etapa-sem-uso scoped.
  2 G2 UI (pacientes.ts ajustarNumeros/textoNaoMedido/textoPelaConversa; tiles in index.tsx and pacientes.tsx; test
  scripts/test-crm-nao-registra.ts). 3 D1 (metricas.ts saldoSeguidores = novos − saídas + bruto, SEGUIDORES names,
  janelaDeDiasFechados; cinco-resultados medidasDoInstagram shifted window + líquido row; use-resultado extra query;
  Instagram verdict/card "no líquido" + "líquido · bruto"; PDF/WhatsApp/hub-relatorio named). D2: not testable without
  live Graph (needs a timestamped anchor snapshot; see Resolution). 5: Jornada short.io clicks "—" in the period
  (cliquesDoLinkNoPeriodo); ownerless-link rule = proposal only. Tests updated: resumo-relatorio, cinco-resultados,
  cinco-instagram, tela-honesta (G2 label), ver-tudo-jornada.
next_action: write scratchpad consultas-ciclo4.sql (EXPLAIN + M10 + config values) and para-joao-config-ciclo4.sql; full
  suite + tsc + build; commit (grep staged diff); publicar.sh --publicar / --conferir; return CHECKPOINT data_request.
fragments: checked against BOTH the live defs (defs-live-16-11 + 120000..140000 applied in pglite) and the migration-built
  defs; they differ only by comments, fragment counts are equal (scratchpad ciclo4/live-140000 vs pglite-140000).

cycle 3 (kept for history):
plan_cycle_3:
  A (code, no decision; tests; deploy): (A1) short.io skipped for a missing key is written as an error in
    sync_status_geral and in the response, never as an old "ok"; (A2) the short.gy card sums every link (no top-50 cut),
    labels the window "30 dias até dd/mm" from stats_em and says "Leitura parada desde dd/mm" when stale; (A3) remove the
    false claims "Os últimos 28 dias foram reconstruídos" and "igual ao 'Seguidores' do Instagram"; (A4) follower numbers
    that stop at the last closed day say "até dd/mm"; (A5) Carteira sums the daily history with coverage (a missing or
    null day is never 0; partial periods show "N de 30 dias" and no comparison).
  B (generic SQL, migration for João, not applied): M11 (rewrite the last days nightly; log each clinic's error instead
    of swallowing it), M13 (agendou regex exclusions that are clearly not a booking), M5 (the Resultados KPI without
    prospecting), dead stage -> "não medido" (compareceu/fecharam), M10 if not fixable in the sync.
  C (per-clinic config, scratchpad only): para-joao-config-por-clinica.sql.
  D (João): D1/D2 Instagram reference, G1-G3, shared-account split, SHORTIO_API_KEY in the VPS secret.
next_action: A is verified (suite 229/236 = the 7 known HEAD failures; tsc = the 3 known files; vite build ok) and goes
  to the VPS with publicar.sh. Then João: (1) restore SHORTIO_API_KEY (new Docker secret, D); (2) run medir-velocidade.sql
  section 2 and apply the B migrations in order; (3) answer D1/D2, G1-G3 and the per-clinic questions; (4) run the clear
  blocks of para-joao-config-por-clinica.sql. Human check: Carteira, the short.gy card and Instagram after the deploy.
reasoning_checkpoint:
  hypothesis: "Each number moves for its own reason (AND-gate = no): (SG) short.io is skipped because the VPS process never
    received SHORTIO_API_KEY, and nothing says so (status stays on the last ok, the card shows 9-day-old clicks as '30
    dias'); (IG) screens claim things never checked ('28 dias reconstruídos', 'igual ao Seguidores') and cut the last 2
    days without saying 'até dd/mm'; (CRM-1) Carteira sums missing/null days as 0 and the cron swallows per-clinic errors
    and never rewrites late days; (CRM-2) the definition differs from the CRM by design, plus generic rule bugs (M13 regex,
    dead stage as measured 0, M5 prospecting in the KPI)."
  confirming_evidence:
    - "Q7: 0 links read in 24 h, all readings from 07/11; n8n's hourly meta-ads response has no shortio key; the old handler
       returns 200 without shortio when the key is absent (reproduced in scripts/test-shortio-status.ts against HEAD)."
    - "Q5: previous window has null 'Chamaram' days that Carteira adds as 0; resultados_gravar_dia has `exception when others
       then null`; one shared account has tags set after the 03:30 write (M11)."
    - "Q2/Q2b: the ladder from deals to Nexo closes exactly in every clinic; the study shows dead stages (3 clinics), M13
       stage names and M5 in the KPI."
    - "pglite before/after (scripts/test-agendou-e-etapa-sem-uso.ts): old functions give 3 'agendaram' for 1 real booking,
       count the prospecting-only person in 'Contatos novos', and return 0 'medido' for never-used stages."
  falsification_test: "After the fix, the card/status would still show an old reading as current, Carteira would still
    compare a 16-of-30-days side, or the pglite run of the new migrations would still count 'Aguardando agendamento'."
  fix_rationale: "Each fix makes the screen say what was measured (reading date, days covered, coverage, não medido) or
    removes a rule error; none invents a new definition. Definitions (G1-G3, DMs, shared splits) stay with João."
  blind_spots: "No production numbers after the B migrations (João applies them; speed queries ready). Q9 (short.io panel
    total vs human clicks) not run. crm_vendas_periodo / crm_perfil_para_analise carry the same M13 regex (live defs not
    read). M10 needs a live check of the FlwChat v2 response."
  candidate_causes:
    - "environment: SHORTIO_API_KEY missing from the Docker secret the VPS process reads (config/deploy)"
    - "code: Carteira sum without coverage; false claims; unlabeled day cuts"
    - "code (SQL): M11 swallow + no rewrite; M13 regex; dead stage zero; M5"
    - "data: each team's CRM use (DM inboxes, won batches, shared-account tags) -> per-clinic config/questions"
  and_gate: "no: each defect moves one number on its own; fixing one does not depend on another."

bug_class: Bohrbug (deterministic: same inputs give the same wrong number; no timing dependence found).
known_pattern_candidate: none (no knowledge-base.md yet).
hypothesis: several independent causes, one per area (AND-gate = no, these are separate defects that each move one number):
  - IG (confirmed as a mechanism, 19/19): the stored data matches the source. The screens show 4 different measures
    and windows (gross, net by the total, net from novos−saídas, Público over a fixed window) under labels that look
    alike. Plus M4: the rebuild of the history has been dead since 01/11 (2/19). Waiting for João's decision on the
    reference figure. IG-1 (two accounts) was eliminated.
  - SG-1: the short.gy card adds up only the 50 links with the most clicks, and each link's "30 days" ends on a
    different day (stats_em), so a client with more than 50 links, or with old stats, shows fewer clicks than short.io.
  - SG-2: the Jornada table shows lifetime clicks (links_rastreados.cliques_total, period=total) for short.io links,
    whatever period is selected.
  - CRM-1: Carteira adds up the daily history (resultados_diarios) and treats a missing or null day as 0, with no
    "measured on N of M days" note (Hoje has that note), so a failed day, which the function swallows silently, lowers
    the 30-day number.
  - CRM-2: the definition differs from the CRM, and the screen does not say by how much. Nexo counts "new people", while
    the CRM counts deals created. The gap is the sum of: duplicate cards for the same person, a person who already had a
    card earlier, "Paciente antigo", purchase/base funnels, prospecting, cards marked removido_na_origem (gone from read
    funnels / etapas_base), and the shared-account rule.
test: production SELECTs (data_request below) + helper files crm-fonte-vs-nexo.md / instagram-seguidores.md / shortio-cliques.md.
expecting: each hypothesis is confirmed only if the production counts show the mechanism actually firing for some clinic.
next_action: the manager runs data_request Q1-Q9 (read-only) into the scratchpad. Next cycle: confirm or eliminate SG-1,
  SG-2, CRM-1 and CRM-2 against those files, plus shortio-cliques.md and section 3 of crm-fonte-vs-nexo.md. Then apply
  the confirmed fixes: Carteira with coverage, the short.gy card summing every link with the date of the reading, and
  Jornada without lifetime clicks. Instagram waits for João's decision D1/D2.
reasoning_checkpoint:
tdd_checkpoint:

## Evidence

- timestamp: 2026-11-16 (cycle 2)
  checked: Instagram, how the screens read the daily series. src/lib/client-data.ts:37-47 (getMonthlyMetrics)
  found: the query filters `.eq("client_id", clientId)` only. There is no filter on instagram_account_id, and none on
    instagram_accounts.active. The only uniqueness is (instagram_account_id, date), set by the upsert onConflict in
    api/_lib/meta-graph-sync.ts:356 and api/_lib/instagram-sync.ts:426. The same function feeds Resultados
    (src/routes/_authenticated.$clientId.index.tsx:709 saldoSeguidores), Instagram/Desempenho
    (src/routes/_authenticated.$clientId.conteudo.tsx:111-129 analyzeFollowers/analyzeGrowth and cinco-instagram), Hoje
    (hoje.tsx analyzeGrowth), the PDF (src/lib/pdf-relatorio-completo.tsx:245) and WhatsApp (src/lib/relatorio-envio.ts:400).
  implication: with two accounts on the same client, src/lib/metricas.ts:96 (last total minus first total) can subtract
    one account's total from the other's, which gives huge numbers in either direction. src/lib/hub-conteudo.ts:164-166
    keeps whichever row comes last for each date. src/lib/hub-conteudo.ts:128-141 and
    src/lib/leitura/cinco-resultados.ts:255-258 add new_followers row by row, so the gross number doubles.
    Fires only if some client has more than one account with rows in the period (Q2).

- timestamp: 2026-11-16 (cycle 2)
  checked: Instagram, which number each screen calls "seguidores"
  found: there are three different measures under similar labels. (a) Net from the total: last total minus first total in
    the period (src/lib/metricas.ts:89-107 saldoSeguidores, used by Resultados/PDF/WhatsApp; and
    src/lib/leitura/cinco-instagram.ts:73-80 "ganhou N seguidores" on the Instagram top card). (b) Gross new followers,
    the sum of new_followers (src/lib/leitura/cinco-resultados.ts:255-258 "Seguidores novos" on the Resultados top, and
    conteudo.tsx:280 "Novos seguidores (bruto)", which skips the 2 open days). (c) The current total,
    cinco-instagram.ts:203-209 "na última coleta". Also, (a) is a fence-post count: N days in the period yield N-1 daily
    changes, so the first day's growth is lost.
  implication: two screens can show "seguidores" numbers that differ by the unfollows, and both differ from the
    Instagram "Seguidores" figure, depending on which view the team opens. This is a definition/labelling cause, not a
    data bug. It needs João's decision on which Instagram figure is the reference (see instagram-seguidores.md when it arrives).

- timestamp: 2026-11-16 (cycle 2)
  checked: Instagram, the day convention of the total. api/_lib/meta-graph-sync.ts:349-357 and 452-497
  found: today's snapshot (Graph followers_count) is written on the Brasília date of the sync time. The rebuilt history
    (reconstruirSeguidores) writes the end-of-day total on California dates (laData/janelaDoDia). Windsor writes
    followers_count only on the current day (instagram-sync.ts:408-418).
  implication: the series mixes "now" (the last point) with "end of the California day" (the earlier points). This shifts
    the result by hours, not by large amounts. Recorded, but it does not explain "muito pra cima/baixo".

- timestamp: 2026-11-16 (cycle 2)
  checked: Instagram, the Público screen. api/_lib/meta-audiencia.ts:269-272, src/routes/_authenticated.$clientId.audiencia.tsx:430-437
  found: a fourth "seguidores" number, "Saldo de seguidores (N dias)". It is read live from the Graph (follows_and_unfollows
    FOLLOWER − NON_FOLLOWER) over a fixed window (a.periodo.dias), not the header's period, and not from the stored series.
  implication: inside the same client, Público, Desempenho and Resultados can show three different follower balances for
    "the period", because each uses a different window or measure.

- timestamp: 2026-11-16 (cycle 2)
  checked: short.gy, how clicks reach the screen. api/_lib/shortio-sync.ts:172-226, src/components/links-shortio.tsx:26-61
  found: cliques_total and cliques_humanos are the `period=last30&tzOffset=-180` values on the day the link was read
    (stats_em) (shortio-sync.ts:193). Reading happens at the end of the ads sync with a 70 s budget
    (api/sync/meta-ads.ts:194). That budget also has to cover one Graph `?fields=website` call per active client, done in
    sequence (shortio-sync.ts:101-117), plus listing every link. Stats run at 1 per second and at most 50 per minute
    (shortio-sync.ts:61), so each round refreshes at most ~50 links, and the rest stays old. The screen card
    (links-shortio.tsx:30-35) reads only `.limit(50)`, ordered by cliques_total, and sums `cliques_humanos ?? cliques_total`
    (line 43) under the label "Cliques de pessoas (30 dias)" (line 61). It ignores the period chosen in the header.
  implication: SG-1. A client with more than 50 links shows fewer clicks than it has. Links whose stats are days old count
    a different 30-day window. The card shows human clicks, while short.io may be showing total clicks or all-time clicks.
    Needs Q3 plus shortio-cliques.md.

- timestamp: 2026-11-16 (cycle 2)
  checked: short.gy, the second table and the Jornada screen
  found: links_rastreados keeps its own cliques_total, filled only by the manual action "links_stats" with `period=total`
    and `humanClicks ?? totalClicks` (api/sync/manual.ts:1179-1196; api/_lib/shortio.ts:51-61). links_funil
    (supabase/migrations/20261105140000_perfil_da_clinica_telas_restantes.sql:482-484) uses period clicks only for the
    Nexo's own links (slug). For short.io links it returns l.cliques_total, which is the lifetime count, shown in
    src/routes/_authenticated.$clientId.jornada.tsx:402.
  implication: SG-2. For short.io links, Jornada shows the lifetime number (and whatever was last read by hand) as if it
    were the period's number, which comes out "muito pra cima" for any closed period. Each link is also assigned to a
    client separately in the two tables (shortio_links.client_id vs links_rastreados.client_id), so one link can belong
    to two different clients (Q3c).

- timestamp: 2026-11-16 (cycle 2)
  checked: short.gy, assigning a link to a client. api/_lib/shortio-sync.ts:31-51
  found: the handle rule matches any substring of length 4 or more inside the joined text (title, path, tags and the full
    destination URL, including wa.me digits and the text). A link of an inactive client can move to an active client by
    name (inactive clients are left out of the list, line 102). There is no dedup across links: shortio_links.id is the
    primary key, so the same link cannot be counted twice in that table.
  implication: wrong assignment is possible (one link given to the client whose @ is contained in another client's @).
    Double counting inside shortio_links is ruled out by the primary key; across the two tables it remains possible (Q3c).

- timestamp: 2026-11-16 (cycle 2)
  checked: CRM, Carteira and Hoje via the daily history. supabase/migrations/20261106130000_resultados_diarios.sql:96,
    20261116100000_chamaram_por_pessoa.sql:49-134, src/routes/_authenticated.admin.index.tsx:504-541, hoje.tsx:83-120
  found: the cron writes each day once, at 03:30 Brasília the next morning (`resultados_gravar_dia(ontem)`), and never
    rewrites it. Leads that arrive late, deletions and stage moves made afterwards stay out of the history until someone
    refills by hand. In resultados_gravar_dia, `exception when others then null` (line 128-129) skips the clinic's day
    silently: no row, or the old row stays. Carteira (admin.index.tsx:536) sums `lado[k] = (lado[k] ?? 0) + Number(r[k])`
    and skips nulls and missing days without any coverage note. It shows the result as "últimos 30 dias" and compares it
    with the 30 days before, which may have different coverage. Hoje uses somaDiariaComCobertura (hoje.tsx:94) and shows
    "N de M dias" or "Falta dado".
  implication: CRM-1. In Carteira, Chamaram, Agendaram and Fecharam come out lower without any warning whenever a day is
    missing or null. Q4 measures how often this happens per clinic.

- timestamp: 2026-11-16 (cycle 2)
  checked: CRM, what "Leads novos" / "Contatos novos no CRM" count. 20261031150000_pacientes_do_periodo.sql:351-380,
    20261030170000_lead_novo_por_pessoa.sql:118-156 (crm_pessoas_leads/crm_pessoas_novas), patched by
    20261102160000_crm_por_medico.sql:233-273 (crm_leads_do_cliente). Also index.tsx:1498 (roi_periodo leads) and
    src/lib/pacientes.ts:97 (the "i" text).
  found: Nexo counts people (chave_pessoa = normalized phone, otherwise the CRM contact, otherwise the card) whose FIRST
    card ever falls in the period. It leaves out: cards removed at the source, purchase/base funnels, anyone with a
    "Paciente antigo" card, prospecting-only people (pacientes_periodo only), and cards outside the client's slice of a
    shared account. Clint marks as removed both the deals that "sumiram" from the funnels it reads, which includes deals
    moved to a funnel nobody reads (api/_lib/clint-sync.ts:398-431), and deals in etapas_base (clint-sync.ts:251-256, 319).
    The "i" on Pacientes explains the rule (pacientes.ts:97), but no screen shows the CRM's number next to the Nexo's
    number, or how many cards each rule removed.
  implication: CRM-2. Nexo comes out lower than the CRM by design, and the screen does not show the size of the gap. On
    top of that, if chave_pessoa collapses different people (a shared or placeholder phone), Nexo goes much lower (Q8).
    Removals in bulk would also lower it (Q7). Per-clinic confirmation comes from crm-fonte-vs-nexo.md plus the Q6 waterfall.

- timestamp: 2026-11-16 (cycle 2)
  checked: helper file crm-fonte-vs-nexo.md (scratchpad, partial; sections 1-2 only)
  found: patterns only. Several clinics share a CRM account: one Clint account serves 2 clients, one Kommo account serves
    3 clients split by a custom field, one Digisac account serves 2 clients split by pipeline, one WTS account serves 2
    clients split by panel. One Clint account is not covered by the Clint MCP. The helper confirmed, against the live
    function definitions, that occurred_at equals the source's created_at for every provider (0 differences), and that
    Carteira/Hoje read the daily sums while Resultados reads the period function plus roi_periodo.
  implication: the date of entry is ruled out as a cause (see Eliminated). The shared-account slicing is a live factor
    for about half of the clinics with a CRM.

- timestamp: 2026-11-16 (cycle 2)
  checked: helper file instagram-seguidores.md (scratchpad; production SELECT plus Windsor), patterns only
  found: (1) All active clinics have exactly 1 active Instagram account, all with sync_source=meta_graph. No account is
    linked to two clinics, and no metric row has a client_id different from its account's. (2) The stored data matches
    the source. Today's total matches Windsor in every account that could be checked (≤0.02%, which is the time of the
    snapshot). New followers per day match Windsor follower_count_1d day by day in every account checked (29 days each).
    (3) What differs is WHICH number each screen shows and WHICH window it covers. M1: the "gross" screens (Hoje and
    Resultados "Seguidores novos"; Instagram "Novos seguidores (bruto)") versus the "net" screens (the Instagram card and
    verdict, Resultados "saldo", PDF/WhatsApp). Over 30 days gross is 1.03x to 4.3x net, and in 3 clinics the sign is
    flipped (gross positive, net negative). M2: there are two net numbers over different days. "By the total" loses the
    1st day and takes in today's 2 open days; "novos − saídas" covers only the closed days. They differ by 1% to 19% over
    30 days and by up to 78% over 7 days. M3: gross and net add up only the closed days (until today−2) under the label
    "N dias": 5 of 7 days, or 28 of 30. With 7 days, Resultados shows "Falta dado". M5: day convention (small).
  implication: the Instagram data is right, and the mismatch "muito pra cima/baixo" against Instagram comes from the
    screens: different measures and windows under labels that look alike, with the note "igual ao 'Seguidores' do
    Instagram" (conteudo.tsx:280) that nobody checked against the app. This is confirmed 19/19 as a mechanism. Fixing it
    needs João's decision on which Instagram figure is the reference (net "Geral", gross "Seguiram", or both, labelled).

- timestamp: 2026-11-16 (cycle 2)
  checked: rebuilding the follower history. api/_lib/meta-graph-sync.ts:455-512 (commit 7016f1d, 01/11/2026); there is no
    test for reconstruirSeguidores in scripts/
  found: `const parcial = await saldo(inicioDeHoje, agora); if (parcial == null) return` (line 484-485). Today is always
    an open day for Meta ("vazio" → null), so the rebuild has not filled anything since 01/11. Even with today's partial,
    yesterday is open too (saldos[0] null → `break`, line ~503), so at most 1 day would be filled. Before 7016f1d, an open
    day counted as 0, so the totals rebuilt back then carry a constant offset equal to the net change of the open days.
    The helper shows: an account linked on 01/11 never got history, and another account has a 13-day hole in its daily
    snapshots that was never filled. Meanwhile the screen still says "Os últimos 28 dias foram reconstruídos"
    (conteudo.tsx:251).
  implication: M4 is confirmed (2 of 19 clinics). In those clinics "saldo pelo total" covers only part of the period
    (from the first day with a total) without saying so in the number. The fix needs a new anchor for the rebuild (an old
    snapshot from a day Meta has already closed), not just removing the `return`. It is a design decision; not applied
    in this cycle.

- timestamp: 2026-11-16 (cycle 3)
  checked: production SELECTs Q1-Q8 (read-only; scratchpad resultado-ciclo2.md, raw/ and defs/). Q9 (short.io panel) not run:
    the key is only in .env files, which the secret guard blocks on purpose.
  found: |
    - Q1: 13 live definitions saved and md5-checked. The 13/11 and 14/11 migrations change functions by text replacement,
      so the live definition is the reference, not the migration file.
    - Q2/Q2b (CRM-2): from "deals created" to the Nexo's number, the steps add up exactly in every clinic with a CRM. The drop
      is 10% or more in about half of them, and the step that removes most differs by clinic (cards -> people, removed at the
      source / etapas_base, "Paciente antigo", purchase/base funnels). No unexplained step. A literal 'Paciente antigo' test
      undercounts against crm_origem_classifica in a few clinics.
    - Q3: one large one-off removal batch exists, outside both 30-day windows. Inside the window what weighs is the continuous
      etapas_base marking (2 clinics), whose removal date is always the last sync (today).
    - Q4: ruled out (see Eliminated).
    - Q5/Q5b (CRM-1): the current window has no missing or null day and the cron has no failed run. But today's 90-day rebuild
      rewrote every row, and resultados_gravar_dia swallows each clinic's error (`exception when others then null`), so a
      cron "succeeded" does not prove each clinic was written. The previous window has "Chamaram" null at its start in a few
      clinics (first measured day inside it), which Carteira sums as 0 and so inflates the comparison. In one shared account,
      about a quarter of a doctor's new contacts got the doctor's tag after the 03:30 write, so the daily history keeps them
      on the other client (M11). The cache-warming job had timeouts on 06-07/11 and none since.
    - Q6: thin coverage. The period cache (Resultados) and the daily sum (Carteira/Hoje) differ: "Chamaram" is higher in the
      period cache in every clinic with cache rows (period counts a person once in the period; the daily sum once in 30 days).
    - Q7: CONFIRMED in every clinic with links. The short.io sync has not run since 08/11: 0 links read in 24 h, every reading
      from 07/11. n8n calls meta-ads?fonte=windsor hourly and succeeds, but the response has no `shortio` key: the
      `if (process.env.SHORTIO_API_KEY)` block (api/sync/meta-ads.ts:186-204) is skipped silently, while sync_status_geral
      still shows the last "ok". The top-50 cut and "each link ends on a different day" are ruled out today. More than half
      of the links have no client. Human clicks are under 70% of the total in about half of the clinics.
    - Q8: ruled out (see Eliminated).
  implication: CRM-2 is a definition gap (no data loss); CRM-1 is a latent mechanism plus a confirmed effect on the previous
    window; SG-1 as "top-50" is not firing, but the stale reading is, in all clinics, and the screen does not say so.

- timestamp: 2026-11-16 (cycle 3)
  checked: the per-clinic CRM study (scratchpad crm-por-clinica.md, parts 1 and 2), patterns only
  found: |
    - In about 5 clinics the card is not a lead (a budget item from the clinic system, one card per contact that never moves,
      an attendance log that expires, a contact plus a tag). In 3 clinics plus 1 partial, an Instagram DM/bait inbox the team
      does not work counts as "lead novo". Funnels with no papel count as captação (M6).
    - A shared Kommo account is split by a doctor field filled only at booking: the doctors' "leads novos" are really new
      patients who booked, and the leads that did not book stay on the hospital client.
    - A shared Digisac account uses an exclude filter that sends every untagged contact to one doctor (M7).
    - "Won" is used as a clean-up batch or for something that is not a sale in several clinics.
    - Dead stages named like "Compareceu" or "Ganho" make the daily history show a measured 0 instead of "não medido" in 3
      clinics (the multi-day rule exists; the daily and the "fecharam" rules do not look at use). Compareceu is copied from
      "venda" in the perfil in 2 clinics. A real "Reunião realizada" stage is missed by the regex in 1.
    - "Agendou" comes mostly from the conversation AI in some clinics; it includes existing patients' procedures and returns;
      the regex also catches "Aguardando ... agendamento", "REAGENDAMENTO", "PREMIO AGENDADO" and exams (M13).
    - Panels unused or stopped while the sync is healthy, with no warning, in 3 clinics; a funnel created on 05/11 is read
      by no connection in 1.
    - FlwChat won/lost dates are the sync day (M10); an automatic 30-day expiry counts as "perdido" in 1.
    - A whole reactivation funnel set to 'ignorar' drops real bookings and sales in 1.
    - The Resultados KPI includes prospecting (M5). Two screens use different "agendada" rules (crm_funis_periodo vs Resultados).
  implication: most gaps come from how each team uses its CRM. The Nexo must not invent or inflate: mapping that the team's
    use makes clear goes to per-clinic config (C, outside the repo); anything ambiguous stays a question for João (D).

- timestamp: 2026-11-16 (cycle 3)
  checked: how the VPS API gets its environment. scripts/vps/publicar.sh, origin/vps/producao:Dockerfile and server/vps.ts,
    and the read-only findings of .planning/debug/carteira-problemas-clientes.md (11/11)
  found: server/vps.ts only reads process.env. The service runs `node --env-file=/run/secrets/hub.env build/vps.mjs`; hub.env
    is the Docker secret doctor-hub-env-20261108-v1 (9 names, no SHORTIO_API_KEY). /etc/doctor-creator-hub/production.env has
    the key since 08/11 20:10, but a Docker secret never changes after it is created, and publicar.sh only runs
    `docker service update --image`, which keeps the same secret. Publishing code never fixes the key.
  implication: the key has to go into a NEW secret built from production.env, swapped on the service
    (`--secret-rm` the v1, `--secret-add source=<v2>,target=hub.env`). That restarts only the Nexo container. João decides
    and runs it (D).

- timestamp: 2026-11-16 (cycle 3, deploy)
  checked: publicar.sh --publicar (commits f470f9f, 84a7217, d563af2 merged into vps/producao 64442426d0cd), then
    publicar.sh --conferir, then the served bundle (read-only GETs).
  found: image doctor-creator-hub:64442426d0cd live; healthz 200 on the 3 domains; "conferir: ok". The served chunks
    contain "Leitura parada desde" and "Cliques de pessoas (30 dias até", and no longer contain "foram reconstruídos" or
    "igual ao “Seguidores”". The B migrations are only files in the repo (not applied).
  implication: A is live. Visible effect right away: the short.gy card says the reading stopped; the next hourly
    meta-ads call writes the missing-key reason in sync_status_geral (Saúde das fontes) and answers 207.

## Eliminated

- hypothesis: Q4, the person key (chave_pessoa) joins different people under one key and lowers "leads novos".
  evidence: the largest group in 90 days is about a dozen cards, and every group of 5+ cards is the same CRM contact with
    several cards, not different people.
  timestamp: 2026-11-16 (cycle 3)
- hypothesis: Q8 / SG-2 moves numbers today, a short.io link counted in both shortio_links and links_rastreados.
  evidence: 0 links are in both tables. The only short.io link in links_rastreados is outside the sync, with 0 clicks. The
    lifetime-clicks mechanism in links_funil still exists in code but changes no number today.
  timestamp: 2026-11-16 (cycle 3)
- hypothesis: SG-1 as stated, the top-50 cut and per-link windows ending on different days lower the card.
  evidence: only 1 client has more than 50 links, and the links past the top 50 have 0 human clicks; every reading is from
    the same 3-hour window. What fires is the stale reading (all links), not the cut.
  timestamp: 2026-11-16 (cycle 3)

- hypothesis: IG-1, two Instagram accounts on the same client mix the series (getMonthlyMetrics has no account filter).
  evidence: instagram-seguidores.md shows 1 active account per clinic, none linked to two clinics, and no rows of an
    inactive account in the period. The code risk is still there (client-data.ts:37-47) if a second account is ever linked.
  timestamp: 2026-11-16 (cycle 2)
- hypothesis: the follower data saved by the Nexo is different from the source.
  evidence: the total matches Windsor in all checked accounts (≤0.02%), and new followers per day match day by day.
  timestamp: 2026-11-16 (cycle 2)

- hypothesis: leads land in the wrong period because crm_leads.occurred_at is not the CRM's creation date.
  evidence: the helper compared occurred_at with created_at in raw_payload for every provider: 0 differences (crm-fonte-vs-nexo.md section 2).
  timestamp: 2026-11-16 (cycle 2)
- hypothesis: the same short.gy link is counted twice inside shortio_links.
  evidence: shortio_links.id is the primary key and the upsert uses onConflict "id" (api/_lib/shortio-sync.ts:163).
    Double counting is only possible across shortio_links and links_rastreados (still open, Q3c).
  timestamp: 2026-11-16 (cycle 2)

## Resolution

root_cause: |
  Several independent causes (AND-gate = no). Classified A (code, no decision), B (generic SQL, migration for João),
  C (per-clinic config, outside the repo), D (decision for João).
  - SG (A + D): the VPS process reads the Docker secret doctor-hub-env-20261108-v1, which never had SHORTIO_API_KEY, so the
    short.io block in api/sync/meta-ads.ts is skipped silently every hour; sync_status_geral keeps the last "ok" and the
    short.gy card shows the 07/11 reading as "Cliques de pessoas (30 dias)". The top-50 cut is latent (not firing today).
  - IG (A + D): the stored data matches the source; the screens show different measures under similar labels, cut the 2
    open days without saying so, and claim "Os últimos 28 dias foram reconstruídos" (the rebuild has filled nothing since
    01/11, M4) and "igual ao 'Seguidores' do Instagram" (never checked). Which Instagram figure is the reference: D1/D2.
  - CRM-1 (A + B): Carteira summed the daily history treating missing/null days as 0 and compared sides with different
    coverage; resultados_gravar_dia swallows each clinic's error and the cron writes each day once (M11).
  - CRM-2 (B + C + D): the Nexo counts people, the CRM counts deals (definition, closes exactly). On top: the booking regex
    catches stage names that are not bookings (M13); a stage nobody uses gives a measured 0 (dead stage); the Resultados
    KPI keeps prospecting (M5); FlwChat won/lost dates are the sync day (M10, deferred). The rest is how each team uses
    its CRM (DM inboxes, won batches, shared-account tags): config where clear (C), questions where not (D).
fix: |
  A (deployed with this commit):
  - A1 api/sync/meta-ads.ts + api/_lib/shortio-sync.ts (statusDaRodadaShortio): a missing key is an error with the reason in
    sync_status_geral and in the response (207), never the old "ok".
  - A2 src/lib/shortio-leitura.ts + src/components/links-shortio.tsx + cabecaDosLinks: sums every link, "30 dias até dd/mm"
    from stats_em, "Leitura parada desde dd/mm" (tom atenção) when the last reading is 2+ days old.
  - A3 conteudo.tsx: removed "Os últimos 28 dias foram reconstruídos" and "igual ao 'Seguidores' do Instagram" (and the
    "Como ler" claim); guard test scripts/test-telas-sem-afirmacao-falsa.ts.
  - A4 analyzeGrowth.ultimoMedido -> "até dd/mm" on the Instagram gross/net KPIs; medidasDoInstagram.ate -> "Seguidores
    novos até dd/mm" / "Salvos a cada mil alcançados até dd/mm" in Resultados when the period was cut.
  - A5 numerosDaCarteiraComCobertura + comparavelNaCarteira: Carteira shows "N de 30 dias" when a day is missing and
    compares only when both sides were measured every day.
  B (prepared, NOT applied; João applies in order, speed queries in the scratchpad medir-velocidade.sql):
  - 20261116120000_historico_regravado_e_erros.sql (M11 + per-clinic error table; 6 extra cron jobs rewrite D-7..D-2 in
    ascending order before the D-1 job, one job per day because the cron has a 120 s statement limit).
  - 20261116130000_agendou_e_etapa_sem_uso.sql (M13 exclusions: aguard, reagend, desmarc, cancel, não agend/veio, prêmio;
    exam left for João; dead stage -> "não medido" for compareceu 90 d, agendou 90 d, fecharam 180 d).
  - 20261116140000_contatos_novos_sem_prospeccao.sql (M5).
  - Reversals in supabase/operacoes/20261116-reverter-*.sql (pglite: apply -> revert restores the exact md5s).
  - Deferred: Instagram rebuild (no recorded Graph responses; needs a new anchor), M10 (needs the live v2 response
    checked; the event date comes from the trigger), M13 in crm_vendas_periodo / crm_perfil_para_analise.
  C: scratchpad para-joao-config-por-clinica.sql (2 clear blocks with row-count guards; everything else as questions).
  D: D1/D2 Instagram reference; G1-G3; shared-account split (Kommo by doctor field, Digisac exclude filter); restoring
    SHORTIO_API_KEY = new Docker secret from /etc/doctor-creator-hub/production.env swapped on the service.
verification: |
  - New tests: test-shortio-status (fails on HEAD's handler: 200 and no shortio key), test-shortio-leitura,
    test-carteira-cobertura, test-telas-sem-afirmacao-falsa (fails on HEAD's conteudo.tsx), test-agendou-e-etapa-sem-uso
    (pglite: measures before with the old functions, applies the 3 migrations twice, measures after).
  - Updated tests: test-ver-tudo-crm-painel, test-cinco-resultados, test-domain-metrics; fixtures of test-contas-no-banco,
    test-origem-e-cobertura and test-historico-diario now say whether the stage is in use (old "stage exists = 0 medido"
    becomes "stage in use = 0 medido"; never-used = "não medido", asserted); preflight.sql manifest 225/221.
  - Known failures at HEAD (clean worktree): 7 test scripts (contagem-por-clinica, creative-discovery, creative-theme,
    kommo-closed-at, nao-medido, status-que-nao-mente, tela-honesta) and tsc in 3 files; nothing new fails.
files_changed:
  - api/sync/meta-ads.ts
  - api/_lib/shortio-sync.ts
  - src/lib/shortio-leitura.ts
  - src/components/links-shortio.tsx
  - src/lib/leitura/ver-tudo-crm-painel.ts
  - src/routes/_authenticated.$clientId.conteudo.tsx
  - src/lib/hub-conteudo.ts
  - src/lib/leitura/cinco-resultados.ts
  - src/lib/leitura/fatos-resultados.ts
  - src/routes/_authenticated.admin.index.tsx
  - supabase/migrations/20261116120000_historico_regravado_e_erros.sql
  - supabase/migrations/20261116130000_agendou_e_etapa_sem_uso.sql
  - supabase/migrations/20261116140000_contatos_novos_sem_prospeccao.sql
  - supabase/operacoes/20261116-reverter-historico-regravado.sql
  - supabase/operacoes/20261116-reverter-agendou-e-etapa-sem-uso.sql
  - supabase/operacoes/20261116-reverter-contatos-sem-prospeccao.sql
  - supabase/audits/preflight.sql
  - scripts/test-*.ts (5 new, 6 updated)

## Ciclo 4 (16/11, decisões do João): o que foi feito

- G1 (migration 20261116150000, NOT applied; reversal supabase/operacoes/20261116-reverter-agendou-lead-novo.sql):
  "exame" joins the 130000 exclusion; "Agendaram" drops old patients (CRM origin "Paciente antigo" on any card, conversation
  read as paciente_antigo, first card in a compra/base funnel; optional config.agendou_lead_ate_dias); won-without-value in a
  booking-named stage stays out of sales (130000 had narrowed it); same name rule in crm_funis_periodo,
  crm_perfil_para_analise and the 6 "agendado em diante" functions (lookahead regex, literal swap). crm_vendas_periodo keeps
  the broad name on purpose (it is the sale exclusion: narrowing would count more sales). "Etapa usada = 0 medido; nunca
  usada = não medido" kept (the in-use checks use the new rule).
- G2: the same migration adds numeros.agendaram.crm_registra = false (no CRM person in the period and no booking stage used
  in 90 days). UI (deployable without the migration): "O CRM não registra isso" for agendaram/compareceram/fecharam when the
  stage is missing or unused, and "N pela conversa (leitura da IA)" apart. Daily-history screens (Hoje, Carteira) keep the
  combined daily number (resultados_diarios has no per-source split): open.
- Item 4 (migration 20261116160000, NOT applied; reversal 20261116-reverter-leitura-por-clinica.sql): config.nao_e_lead
  (card parked in a listed stage/funnel is not a lead: DM/robot inbox, bait, budget funnels) in crm_pessoas_leads, and
  config.ganho_sem_valor_card_antigo_dias in pacientes_periodo_calc (non-profile) and crm_vendas_periodo (non-profile).
  Per-clinic values: scratchpad para-joao-config-ciclo4.sql (dry-run in pglite with fake clinics: ok). Card-per-budget
  CRMs are already per person (chave_pessoa = FlwChat contactId) in leads, agendou and fecharam; the budget funnel leaves
  "leads" via nao_e_lead. DM + WhatsApp of the same person: no shared key in the source (DM cards have no phone, different
  CRM contacts), so only the inbox rule removes the double count; generic dedup not possible without inventing a match.
  M10 needs Q3 of consultas-ciclo4.sql. Shared accounts: options only (in the config file), nothing applied.
- D1 (code): líquido = novos − saídas and bruto = novos, named side by side (SEGUIDORES in metricas.ts), in N closed days
  ending today − 2 (janelaDeDiasFechados); Resultados (agora × antes rows + old card), Instagram (verdict "no líquido", card
  "líquido · bruto · N dias até dd/mm", Ver tudo KPIs), PDF, WhatsApp, hub-relatorio ("variação do total" named as such).
- D2: NOT testable without live Graph data. The rebuild anchors on today's total minus today's partial saldo, and Meta
  answers "vazio" for any open day, so it stops at once. A fix needs an anchor snapshot with its exact time on a day Meta
  has closed (a new timestamp column + sync change, a migration for João) and a live check that follows_and_unfollows
  answers a partial window of a closed day. Since D1 the líquido/bruto numbers no longer use the totals; only the
  "Evolução de seguidores" chart and the "variação do total" fallback do, and both show their coverage.
- Item 5: Jornada "Links rastreados" shows "—" (Cliques no período) for short.io links instead of the lifetime count.
  Proposals (not applied): ownerless link → the client that already owns the SAME WhatsApp number in another link, only
  when exactly one client owns it (ambiguous stays in Admin); one-word name match only with the dr/dra prefix and a unique
  word across active clients. Clinic with no short.io link: the card says "Nenhum link do short.io ligado a esta
  clínica" (with the Admin path) instead of hiding.

## Decisões do João (16/11, depois do ciclo de correção A)

- **Onde corrigir:** no Nexo. A leitura de cada CRM é ajustada no Nexo; o CRM das clínicas não é mexido.
- **D1 Seguidores:** mostrar os dois, com nome claro e lado a lado: líquido (novos menos os que saíram) e bruto
  (novos). Nenhuma tela usa "Seguidores" sozinho para um dos dois.
- **G1 Agendou:** só consulta de lead novo. Exame, reagendamento, "aguardando", prêmio e paciente antigo não contam.
- **G2 Sem registro:** quando o CRM não registra a etapa, mostrar "o CRM não registra isso" no lugar de 0; o número
  da conversa (IA/WhatsApp) aparece à parte, com o nome da fonte.
- **Chave do short.io:** religada na VPS em 16/11 18:45 UTC (secret novo; o antigo ficou guardado). Leitura volta na
  próxima rodada horária do n8n.
- **Velocidade antes das migrações B:** medida em 16/11 18:48 UTC (fora do repo, scratchpad).
