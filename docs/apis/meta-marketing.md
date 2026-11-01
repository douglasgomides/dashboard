# Meta Marketing API — anúncios

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026, **doc oficial lida em 01/11/2026** e código no commit
> `89ae33c`. As linhas citadas mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo; o motivo vem ao lado.

**Resumo.** Gasto, impressões, leads e conversas batem com a Meta (outubro/2026). Status por conta e proteção contra "gasto trocado por
zero" já entraram (`anuncios-status.ts`, `anuncios-protecao.ts`). Sobram: **alcance somado** no PDF, nenhum controle de **limite de
chamadas** (cabeçalhos e códigos 4/17/613/80000), **vencimento do token** desconhecido e o limite de 4 trocas de orçamento por hora.

## 1. O que usamos

- **Versão:** `v26.0` (`api/_lib/meta-graph-versao.ts:5`). A v26.0 tem changelog próprio de Marketing API ("Released July 29, 2026,
  Available until TBD"), embora a tabela de versões da Marketing API ainda mostre a `v25.0` como a mais nova.
- **Doc oficial (lida em 01/11/2026):** [insights](https://developers.facebook.com/docs/marketing-api/insights),
  [referência de insights da conta](https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights),
  [boas práticas e limites de insights](https://developers.facebook.com/docs/marketing-api/insights/best-practices),
  [limites da Marketing API](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting),
  [limites da Graph](https://developers.facebook.com/docs/graph-api/overview/rate-limiting),
  [tokens](https://developers.facebook.com/docs/facebook-login/guides/access-tokens),
  [versões](https://developers.facebook.com/docs/graph-api/changelog/versions),
  [changelog v26.0](https://developers.facebook.com/docs/graph-api/changelog/version26.0).

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /act_{id}/insights` `level=campaign&time_increment=1&limit=500` | uma linha por campanha por dia | `date_start, campaign_id, campaign_name, objective, spend, impressions, reach, clicks, unique_clicks, frequency, inline_link_clicks, actions[]{action_type,value}` | `meta-ads-graph-sync.ts:119-164` |
| `GET /act_{id}/insights` `date_preset=last_7d` | alcance e frequência reais de 7 dias | `campaign_id, reach, impressions, frequency` | `meta-ads-graph-sync.ts:168-195` |
| `GET /act_{id}/adsets` | objetivo e destino do conjunto | `campaign_id, optimization_goal, destination_type` | `meta-ads-graph-sync.ts:200-220` |
| `GET /act_{id}?fields=spend_cap,amount_spent` | dias até o limite de gastos | `spend_cap, amount_spent` (centavos, texto) | `meta-ads-graph-sync.ts:281-286` |
| `GET /act_{id}`, `/campaigns`, `/ads`, `/adsets` com `issues_info` | diagnóstico de conta parada | `account_status, disable_reason, issues_info...` | `diagnostico-anuncios.ts:104-150` |
| `POST /{campaign_id}` ou `/{adset_id}` | pausar e mudar orçamento (escrita) | `status, daily_budget` | `anuncios-acoes.ts` |

Contas sem token próprio são lidas pela Windsor (`meta-ads-sync.ts`). Ver [windsor.md](windsor.md).

## 2. Significado de cada número

- **`spend`, `impressions`, `clicks`, `inline_link_clicks`:** somáveis dia a dia. Vêm como **texto**; o código converte com `Number()`.
- **Fuso (verificado):** "We report ad insights data in the ad account's timezone." `time_range` com datas `AAAA-MM-DD` é lido no fuso da
  conta. O código monta `since/until` com a data UTC de hoje (`meta-ads-graph-sync.ts:299-301`): efeito só na borda do dia de hoje.
  **O fuso de cada conta (`timezone_name`): não verificado** (exige ler cada conta com o token dela).
- **Atribuição (verificado):** "Beginning June 10, 2025 ... the use_unified_attribution_setting and action_report_time parameters will be
  disregarded and API responses will mimic Ads Manager settings: Attributed values will be based on ad set level attribution settings".
  O código não passa janela: vale a do conjunto, igual ao Gerenciador.
- **Conversas:** `onsite_conversion.messaging_conversation_started_7d` (o `_7d` faz parte do nome da ação). **Leads:** `lead`; o pixel
  (`offsite_conversion.fb_pixel_lead`) só entra quando `lead` não vem (`meta-ads-graph-sync.ts:104-111`). **Se a v26.0 pode trazer duas
  variantes da ação de conversa na mesma linha: não verificado** (a doc não lista os `action_type`; o contrato ao vivo avisa).
- **`reach`:** não se soma entre dias nem entre campanhas. Desde 10/06/2025 (verificado): "reach will no longer be returned for standard
  queries that apply breakdowns and use start_dates more than 13 months old". O código não usa breakdown: sem efeito.
- **Revisão (verificado):** "Insights refresh every 15 minutes and do not change after 28 days of being reported." Cada rodada relê no
  mínimo 30 dias (`api/sync/meta-ads.ts`). Datas além de 37 meses não são aceitas.

## 3. Limites

- **Taxa (verificado):** cota por caso de uso e por conta de anúncios. `ads_insights`, por conta e por hora: "(190000 if your app is in
  the Ads API Full access or 600 if your app is in the Dev tier) + 400 * Number of Active ads - 0.001 * User Errors" (erros **diminuem** a
  cota). `ads_management`: "(100000 ... or 300 ...) + 40 * Num of Active ads". Códigos: **80000, 80003, 80004, 80014** ("There have been
  too many calls from this ad-account"), **4** com subcódigo 1504022/1504039 (limite do app nos insights), **17** e **613** (rajada).
- **Cabeçalhos (verificado):** `X-Business-Use-Case` (`call_count`, `total_cputime`, `total_time`, `estimated_time_to_regain_access`),
  `X-FB-Ads-Insights-Throttle` (`app_id_util_pct`, `acc_id_util_pct`, `ads_api_access_tier`) e `X-Ad-Account-Usage`. A doc pede
  "Add a back-off mechanism to slow down or pause your /insights queries when you come close to hitting 100%".
- **O código não lê nenhum desses cabeçalhos.** Erro de carga (`code` 1/2, 5xx, tempo) refaz em janelas de 2 dias
  (`meta-ads-graph-sync.ts:223-262`); erro de limite (4/17/613/80000) **não** entra nessa regra e sobe direto: não multiplica chamadas,
  mas também não espera o tempo pedido.
- **Dado demais por chamada (verificado):** "error_code = 100, CodeException (error subcode: 1487534)"; a doc manda reduzir período ou
  campos. O código trata "reduce the amount of data" como erro de carga.
- **Paginação:** segue `paging.next` com trava de host; teto de 20 páginas dá erro em vez de cortar. Diagnóstico (`limit=100`,
  `diagnostico-anuncios.ts:133-134`) e mudança de orçamento (`limit=50`, `anuncios-acoes.ts:34`) não paginam.
- **Escrita (verificado):** "For each ad set, the budget is only allowed to change 4 times per hour" (613/1487632); "one edit per object
  every 30 seconds" (613/4841018). `anuncios-acoes.ts` não controla isso: a 5ª troca na hora volta erro da Meta.

## 4. Token

- **Leitura:** um token por conta em `client_ad_accounts.access_token`. Vai na URL (`?access_token=`); sem `appsecret_proof`.
- **Escrita:** `META_ADS_WRITE_TOKEN`, usuário de sistema com `ads_management` (`anuncios-acoes.ts`).
- **Validade (verificado):** token de usuário longo "generally lasts about 60 days"; token de usuário de sistema tem a validade escolhida
  na geração ("choose a token expiration preference"). `GET /debug_token` devolve `expires_at`, `data_access_expires_at`, `is_valid`.
  **Tipo e vencimento de cada token: não verificados** (exige `debug_token` com cada token; nenhuma chamada com credencial nesta revisão).
  Não há coluna de tipo nem de vencimento.
- **Quem renova:** Admin da Business Manager do cliente (gera e cola no Admin do Nexo).

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Alcance não se soma entre dias nem campanhas | Parcial (frequência 7d certa; `alcance_somado` no PDF com aviso) | `supabase/migrations/20261013200000_correcoes_auditoria_dados.sql:10-16`; `src/lib/pdf-relatorio-completo.tsx:749` |
| Janela de atribuição deve bater com o Gerenciador | Sim (não passa janela; a Meta ignora `use_unified_attribution_setting` desde 10/06/2025) | `meta-ads-graph-sync.ts:126-146` |
| Números revisados até 28 dias | Sim (relê 30 dias) | `api/sync/meta-ads.ts` |
| Fuso da conta × UTC em `since/until` | Parcial (só a borda de hoje) | `meta-ads-graph-sync.ts:299-301` |
| Limite de chamadas (4/17/613/80000) e cabeçalhos de uso | **Não** | `meta-ads-graph-sync.ts:150-155, 223` |
| Status "ok" quando uma conta ou parte do período falhou | **Sim** (status por conta, junta por cliente) | `anuncios-status.ts` |
| Gasto de dia passado trocado por zero | **Sim** (pula e conta em "precisa_reconferir") | `anuncios-protecao.ts`; `meta-ads-graph-sync.ts:410` |
| Motivo de conta parada sobrescrito pela outra conta | **Sim** (motivo fica na conta) | `meta-ads-graph-sync.ts:463-478`; `anuncios-status.ts` |
| Mesma conta de anúncios ligada a dois clientes | **Não** (sem filtro por campanha; decisão de negócio) | `client_ad_accounts` |
| Orçamento: no máximo 4 trocas por hora por conjunto | **Não** (erro 613 volta para a tela) | `anuncios-acoes.ts` |
| Token vencido descoberto tarde | **Não** (sem `debug_token`) | `diagnostico-anuncios.ts` |

## 6. Mudanças anunciadas (verificado em 01/11/2026)

- Marketing API: `v24.0` saiu em 06/10/2026; `v23.0` em 09/06/2026. A troca automática de versão da Marketing API começou em 29/07/2026.
- v26.0 Marketing: campos `daily_outcomes_curve`, `budget_guardrail`, `estimate_dau` saem de `delivery_estimate`; posição Explore e
  Messenger Stories saem; anúncio de enquete descontinuado; vale para todas as versões em **27/10/2026**. O código não usa nada disso.
- Graph v26.0: `GET /?ids=`, `date_format`, `pretty`, `debug` e `If-None-Match` descontinuados (todas as versões em 27/10/2026). O código
  não usa.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi resolvido |
|---|---|---|
| 30/10/2026 | Leads do pixel contados em dobro (116 contra 59 na Meta, num cliente) | `leads()` só usa o pixel quando `lead` não vem |
| 30/10/2026 | Ninguém lia o limite de gastos; conta parava sem aviso | `diasAteOLimite` |
| 21/10/2026 | Sync regravou o dia 21/09 com gasto zero em 4 clientes e registrou "ok" | `anuncios-protecao.ts` |
| 09–11/2026 | Uma conta parada há 39 dias e outra desde 01/2026 com status "ok" | `anuncios-status.ts` (status por conta) |

## Teste de contrato

`scripts/test-contrato-meta-marketing.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_META_ADS_TOKEN=... CONTRATO_META_ADS_CONTA=<id sem act_>`.
Mostra os cabeçalhos `facebook-api-version` e `x-business-use-case-usage` (só o começo, sem segredo) e avisa se uma linha tiver duas
ações de conversa. A escrita (POST) nunca é chamada.
