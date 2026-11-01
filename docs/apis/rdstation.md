# RD Station CRM

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e leitura do código no commit `c01b2b9`.
> As linhas citadas são desse commit e mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo.

**Resumo.** Um cliente usa. Leitura correta e honesta quanto a erros (conferência 157 = 157). O ponto fraco é a **data da venda**:
o código ignora `closed_at`. Já existe uma v2 com OAuth; a v1 continua mantida. O RD Station **Marketing** não é usado.

## 1. O que usamos

- **Versão:** API **v1** do CRM, token na query (`?token=`). Só GET.
- **Base:** `https://crm.rdstation.com/api/v1` (`rdstation-sync.ts:17`).
- **Doc oficial:** <https://developers.rdstation.com/reference/rdcrm-introducao-e-requisitos> (v1),
  <https://developers.rdstation.com/reference/crm-v2-introduction> e <https://developers.rdstation.com/reference/crm-v2-authentication> (v2).
  **Lidas em 01/11/2026 só por trechos de busca** (domínio bloqueado).

| Endpoint | Para quê | Campos lidos | Código |
|---|---|---|---|
| `GET /deal_pipelines` | funis e etapas | lista (ou `deal_pipelines`) com `id, name, deal_stages[]._id/id/name` | `rdstation-sync.ts:88-91` |
| `GET /deals?limit=200&page=N` | negociações | `_id, name, amount_total, win, created_at, updated_at, deal_stage._id, deal_source.name, contacts[0].name/emails[0]/phones[0]`; `has_more` | `rdstation-sync.ts:93-105, 160-190` |
| `GET /deals?limit=1&page=1` | total para a conferência | `total` | `conferencia-crm.ts:99` |

Chegam sem virar coluna: `closed_at`, `hold`, `deal_lost_reason`, `user`, `last_activity_at`, `rating`, `organization` (algumas funções do
banco leem do `raw_payload`).

## 2. Significado de cada número

- **Entrada** (`occurred_at`) = `created_at` (fuso −03:00, convertido certo).
- **Ganho / perdido / aberto:** `win` true / false / null. O status **pausado** (`hold`) não é tratado (hoje 0 casos).
- **Valor:** `amount_total` (valor único + mensal); 0 vira "sem valor". Muitos ganhos sem valor no RD subestimam o faturamento.
- **Origem:** `deal_source.name`.
- **Venda no período:** pela data do evento "ganhou", que só existe desde 15/10/2026 e é datado no momento do sync, não pelo `closed_at`.
  Antes disso, pela data de entrada.
- **`received_at`** = `updated_at` do RD (última edição), não a hora em que o Nexo recebeu.

## 3. Limites

- **Taxa (doc):** **120 pedidos por minuto** (v1 e v2). Acima disso, a v2 devolve **429 com `Retry-After`**. Uso real: ~3 chamadas por dia.
- **O código** não espera nem tenta de novo em 429/5xx (`rdstation-sync.ts:78-86`): a rodada do cliente falha, mas **com erro visível**.
- **Paginação:** `page` + `limit=200`, para em `has_more=false` ou página vazia; teto de 100 páginas. **A listagem devolve só os primeiros
  10 mil registros** (doc): acima disso corta sem aviso. A busca de apagados no banco usa `.limit(50_000)` (o banco corta em 1.000).

## 4. Token

- **v1:** token de API por conta, ligado ao usuário que gerou; vai **na URL** (exigência da v1); fica em `crm_connections.access_token`.
  O código não repete a URL no erro (`rdstation-sync.ts:82`). Validade **não verificada**; não se sabe se morre quando o usuário sai.
- **v2 (se migrar):** OAuth2; chave de acesso de **2 h** (7200 s) e chave de renovação **trocada a cada uso** (tem de gravar a nova toda vez).
- **Quem renova:** usuário admin do RD gera o token e cola no Admin.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Listagem só traz os primeiros 10 mil registros | Parcial (teto de 20 mil, confia em `has_more`, não compara com `total`) | `rdstation-sync.ts:20-22` |
| 429 com `Retry-After` acima de 120/min | Parcial (falha visível, sem nova tentativa) | `rdstation-sync.ts:78-86` |
| `win=null` = aberto; existe `hold` (pausado) | Parcial (`hold` ignorado) | `rdstation-sync.ts:72-76` |
| Data da venda é `closed_at`, não `created_at` | **Não** | `rdstation-sync.ts:182`; gatilho em `supabase/migrations/20261030220000_eventos_sem_reclassificacao.sql:36` |
| Token no endereço pode vazar em log | Sim (erro não leva a URL) | `rdstation-sync.ts:82` |
| Datas em −03:00 | Sim | — |
| Negócio apagado some da listagem | Sim (só com lista completa e trava de 20%) | `rdstation-sync.ts:211-231` |
| Negócio com vários contatos | **Não** (pega só o primeiro; impacto pequeno) | `rdstation-sync.ts:172` |
| Etapa anterior não vem na listagem | Parcial (histórico pelo gatilho, desde 15/10/2026) | — |
| Falha ao ler funis apaga o funil de todos os negócios e cria "mudou de etapa" falso | **Não** | `rdstation-sync.ts:135-139, 180, 196-202` |
| Fim da v1 | Não verificado | — |

## 6. Mudanças anunciadas

- v2 do CRM publicada (`https://api.rd.services/crm/v2`, OAuth2, `page[number]`/`page[size]` com 20 por padrão, links no lugar de `has_more`).
- v1 sem data de saída encontrada; o changelog ainda publica correções da v1. O RD já desligou versões antigas do Marketing: acompanhar.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| até 10/2026 | Vendas antigas contadas no mês de entrada (4 de 9 ganhos sem evento fecharam em outro mês) | Pendente: usar `closed_at` |
| 30–31/10 e 01/11/2026 | Conferência bateu (157 = 157) | — |

## Teste de contrato

`scripts/test-contrato-rdstation.ts`. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_RD_TOKEN=...` (2 chamadas). O token vai na query, como a v1
exige; o script nunca imprime a URL. Avisa quando `total` passa de 10 mil.
