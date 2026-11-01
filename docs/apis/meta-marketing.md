# Meta Marketing API — anúncios

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e leitura do código no commit `c01b2b9`.
> As linhas citadas são desse commit e mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo.

**Resumo.** Gasto, impressões, leads e conversas batem com a Meta (outubro/2026, ao centavo nas contas conferidas). Os riscos são
o **status "ok" quando parte falhou**, o **alcance somado** e a falta de controle de **limite de chamadas** e de **vencimento do token**.

## 1. O que usamos

- **Versão:** `v26.0` (`api/_lib/meta-graph-versao.ts:5`).
- **Doc oficial:** <https://developers.facebook.com/docs/marketing-api/reference/ad-account/insights>,
  <https://developers.facebook.com/docs/marketing-apis/rate-limiting>, changelog
  <https://developers.facebook.com/docs/graph-api/changelog/versions>. **Lida em 01/11/2026 só por trechos de busca** (domínio bloqueado).

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /act_{id}/insights` `level=campaign&time_increment=1&limit=500` | uma linha por campanha por dia | `date_start, campaign_id, campaign_name, objective, spend, impressions, reach, clicks, unique_clicks, frequency, inline_link_clicks, actions[]{action_type,value}` | `meta-ads-graph-sync.ts:119-160` |
| `GET /act_{id}/insights` `date_preset=last_7d` | alcance e frequência reais de 7 dias | `campaign_id, reach, impressions, frequency` | `meta-ads-graph-sync.ts:168-187` |
| `GET /act_{id}/adsets` | objetivo e destino do conjunto | `campaign_id, optimization_goal, destination_type` | `meta-ads-graph-sync.ts:192-212` |
| `GET /act_{id}?fields=spend_cap,amount_spent` | dias até o limite de gastos | `spend_cap, amount_spent` (centavos, texto) | `meta-ads-graph-sync.ts:268-273` |
| `GET /act_{id}`, `/campaigns`, `/ads`, `/adsets` com `issues_info` | diagnóstico de conta parada | `account_status, disable_reason, funding_source...` | `diagnostico-anuncios.ts` |
| `POST /{campaign_id}` ou `/{adset_id}` | pausar e mudar orçamento (escrita) | `status, daily_budget` | `anuncios-acoes.ts` |

Contas sem token próprio são lidas pela Windsor (`meta-ads-sync.ts`). Ver [windsor.md](windsor.md).

## 2. Significado de cada número

- **`spend`, `impressions`, `clicks`, `inline_link_clicks`:** somáveis dia a dia. Vêm como **texto**; o código converte com `Number()`.
- **Conversas:** `onsite_conversion.messaging_conversation_started_7d`. O `_7d` faz parte do nome da ação, não é a janela.
  Sem `action_attribution_windows`, vale a atribuição do conjunto de anúncios (o mesmo número do Gerenciador).
- **Leads:** `lead` (já é o total da Meta); o pixel (`offsite_conversion.fb_pixel_lead`) só entra quando `lead` não vem.
- **`reach`:** **não se soma** entre dias nem entre campanhas. `meta_ads_daily` guarda o alcance do dia por campanha, e `ads_resumo`
  soma em `alcance_somado` (em outubro/2026, +46% a +90% acima do alcance real). A frequência de 7 dias é lida certa da Meta.
- **Fuso:** a Meta lê as datas no fuso da conta; o código monta `since/until` em UTC (`meta-ads-graph-sync.ts:291-294`). Efeito só na
  borda do dia de hoje (totais do mês bateram).
- **Revisão:** a Meta revisa números até 28 dias depois. Cada rodada relê no mínimo 30 dias (`api/sync/meta-ads.ts:56-59`).

## 3. Limites

- **Taxa:** cota por caso de uso (Ads Insights), códigos 17, 80000 e 613 ("Calls to this api have exceeded the rate limit"); o tempo
  para voltar vem em `X-Business-Use-Case-Usage` (`estimated_time_to_regain_access`); erros de pedido **diminuem** a cota (trechos de busca).
  **O código não lê `X-Business-Use-Case-Usage`, `X-FB-Ads-Insights-Throttle` nem `X-App-Usage`** e não reconhece 4/17/613/80000.
  Em erro de carga, refaz em janelas de 2 dias (até ~30 chamadas para 30 dias): mais chamadas justamente quando a Meta pede menos.
- **Paginação:** segue `paging.next` com trava de host (`integration-http.ts`); teto de 20 páginas **dá erro** em vez de cortar
  (`meta-ads-graph-sync.ts:155, 185`). Mas conjuntos (`:198-212`), diagnóstico (`diagnostico-anuncios.ts:104, 133-145`) e
  mudança de orçamento (`anuncios-acoes.ts:34`, `limit=50`) cortam sem avisar.
- **O que fazer em 429/limite:** esperar o tempo do cabeçalho; não multiplicar chamadas.

## 4. Token

- **Leitura:** um token por conta em `client_ad_accounts.access_token` (texto no banco; `authenticated` e `anon` não leem a coluna).
  Vai na URL (`?access_token=`); sem `appsecret_proof`.
- **Escrita:** `META_ADS_WRITE_TOKEN`, usuário de sistema com `ads_management` (`anuncios-acoes.ts`).
- **Validade:** token de usuário longo ~60 dias; usuário de sistema não vence (não verificado por conta). **Não há coluna de tipo nem de
  vencimento**, nem chamada a `/debug_token`. O 190 só aparece no diagnóstico, depois de 2 dias sem dado.
- **Quem renova:** Admin da Business Manager do cliente (gera e cola no Admin do Nexo).

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Alcance não se soma entre dias nem campanhas | Parcial (frequência 7d certa; `alcance_somado` no PDF com aviso que só fala de campanhas) | `supabase/migrations/20261013200000_correcoes_auditoria_dados.sql:36`; `src/lib/pdf-relatorio-completo.tsx:749` |
| Janela de atribuição deve bater com o Gerenciador | Sim (não passa janela; vale a do conjunto) | `meta-ads-graph-sync.ts:136-139` |
| Números revisados até 28 dias | Sim (relê 30 dias) | `api/sync/meta-ads.ts:56-59` |
| Fuso da conta × UTC em `since/until` | Parcial | `meta-ads-graph-sync.ts:291-294, 439-441` |
| Limite de chamadas (17/80000/613) e cabeçalhos de uso | **Não** | `meta-ads-graph-sync.ts:216, 233-249` |
| Status "ok" quando uma conta ou parte do período falhou | **Não** (`okSeHouveLinhas`) | `sync-status.ts:120, 42`; `api/sync/meta-ads.ts:86, 165` |
| Motivo de conta parada sobrescrito pela outra conta do mesmo cliente | **Não** | `meta-ads-graph-sync.ts:466-470` |
| Mesma conta de anúncios ligada a dois clientes | **Não** (sem filtro por campanha) | `client_ad_accounts` |
| Paginação cortada sem aviso | Parcial | ver Limites |
| Token vencido descoberto tarde | **Não** | `diagnostico-anuncios.ts:71`; `meta-ads-graph-sync.ts:463-465` |
| Nome da ação de conversa casado por "contém": duas variantes na mesma linha somam em dobro | Não verificado (hoje bate) | `meta-ads-graph-sync.ts:94`. O contrato ao vivo avisa se acontecer |

## 6. Mudanças anunciadas

- `v26.0` (29/07/2026) sem data de fim; a troca automática de versão da Marketing API começou em 29/07/2026. A `v24.0` saiu da
  Marketing API em 06/10/2026 (o código não usa).
- Desde 12/01/2026 as janelas `7d_view` e `28d_view` não vêm mais por `action_attribution_windows` (blog da Meta, 16/10/2025).
  O código não usa: sem efeito.
- `use_unified_attribution_setting` e `action_report_time` ignorados desde 10/06/2025 (fonte de terceiros). O código não usa.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| 30/10/2026 | Leads do pixel contados em dobro (116 contra 59 na Meta, num cliente) | `leads()` só usa o pixel quando `lead` não vem |
| 30/10/2026 | Ninguém lia o limite de gastos; conta parava sem aviso | `diasAteOLimite` |
| 21/10/2026 | Sync regravou o dia 21/09 com gasto zero em 4 clientes e registrou "ok" | Pendente: não aceitar zero por cima de valor antigo sem segunda leitura |
| 09–11/2026 | Uma conta parada há 39 dias e outra desde 01/2026 com status "ok" | Pendente: status por conta e por período |

## Teste de contrato

`scripts/test-contrato-meta-marketing.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_META_ADS_TOKEN=... CONTRATO_META_ADS_CONTA=<id sem act_>`.
Mostra os cabeçalhos `facebook-api-version` e `x-business-use-case-usage` (só o começo, sem segredo) e avisa se uma linha tiver duas
ações de conversa. A escrita (POST) nunca é chamada.
