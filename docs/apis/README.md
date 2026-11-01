# Memória do Nexo sobre as APIs

Uma ficha por API, todas com o mesmo roteiro, mais os testes de contrato que avisam quando uma API muda de formato.
Proposta da seção 6 da auditoria de confiabilidade de 01/11/2026.

## Fichas

| API | Ficha | Versão em uso | Situação depois da leitura da doc (01/11/2026) | Contrato |
|---|---|---|---|---|
| Meta Graph (Instagram) | [meta-graph-instagram.md](meta-graph-instagram.md) | v26.0 | risco (fuso já corrigido; sem leitura de limite nem de vencimento do token) | `test-contrato-meta-graph-instagram.ts` |
| Meta Marketing (anúncios) | [meta-marketing.md](meta-marketing.md) | v26.0 | risco (sem controle de limite de chamadas; alcance somado no PDF) | `test-contrato-meta-marketing.ts` |
| Clint | [clint.md](clint.md) | v1 + v2 | correto (`limit` dos canais corrigido; limite de taxa não publicado) | `test-contrato-clint.ts` |
| Kommo | [kommo.md](kommo.md) | v4 | risco (conta compartilhada; `closed_at` sem uso) | `test-contrato-kommo.ts` |
| WTS Chat / FlwChat (Helena) | [wts-flwchat.md](wts-flwchat.md) | /v1 (doc só tem v2) | risco (rotas v1 fora da doc; ordem das mensagens) | `test-contrato-wts-flwchat.ts` |
| Digisac | [digisac.md](digisac.md) | /api/v1 | risco (conta compartilhada; doc sem limites nem métricas) | `test-contrato-digisac.ts` |
| RD Station CRM | [rdstation.md](rdstation.md) | v1 (existe v2) | risco (visibilidade do token pode esconder negócios) | `test-contrato-rdstation.ts` |
| Windsor.ai | [windsor.md](windsor.md) | sem versão | risco (doc ainda bloqueada; lista vazia sem erro) | `test-contrato-windsor.ts` |
| Hubla | [hubla.md](hubla.md) | webhook v2 | risco (webhook parado no n8n; `disputed` contado como venda) | `test-contrato-hubla.ts` (só offline) |
| OpenAI e Anthropic | [openai-anthropic.md](openai-anthropic.md) | chat/completions, messages 2023-06-01 | risco (doc da OpenAI bloqueada; Anthropic ativa e conferida) | `test-contrato-openai-anthropic.ts` |
| Short.io | [shortio.md](shortio.md) | sem versão | risco (doc ainda bloqueada) | `test-contrato-shortio.ts` |
| Google Planilhas | [google-planilhas.md](google-planilhas.md) | CSV público | risco (linhas órfãs) | `test-contrato-google-planilhas.ts` |

Proposta do histórico diário da nota: [historico-confiabilidade.md](historico-confiabilidade.md).

### Roteiro de cada ficha

1. **O que usamos:** endpoints, campos, versão, link da doc oficial e data de leitura.
2. **Significado de cada número:** janela, fuso, atraso.
3. **Limites:** taxa, paginação, o que fazer em 429.
4. **Token:** tipo, validade, permissões, quem renova.
5. **Pegadinhas:** cada uma com "o código trata?" e `arquivo:linha`.
6. **Mudanças anunciadas.**
7. **Histórico do que quebrou.**

**Regras:** escrever em português simples; marcar como "não verificado" o que não foi confirmado na doc oficial nem ao vivo; não colocar
nome de paciente, telefone, e-mail, id de conta nem token. As linhas citadas são do commit em que a ficha foi lida: ao corrigir uma
pegadinha, atualize a linha "O código trata?" e o histórico na mesma mudança.

**Leitura da doc oficial em 01/11/2026:** liberados e lidos developers.facebook.com, clint-api.readme.io, developers.kommo.com,
helena.readme.io, developers.rdstation.com, hubla.gitbook.io, documenter.getpostman.com (coleção Digisac) e a doc da Anthropic
(`docs.claude.com`/`platform.claude.com`). Seguem bloqueados: windsor.ai, short.io, platform.openai.com e developers.google.com. Cada ficha
diz o que foi verificado (com link e trecho) e o que continua "não verificado" e por quê. Dica: os sites readme.io e GitBook servem a página em Markdown (com a definição OpenAPI)
acrescentando `.md` ao endereço, e têm índice em `/llms.txt`.

## Testes de contrato

Cada `scripts/test-contrato-<api>.ts` tem dois modos. A régua comum fica em `scripts/contrato/comum.ts`.

### Offline (sempre, dentro do `npm run check`)

- Lê a amostra **inventada, sem dado real** em `scripts/fixtures/contrato/<api>.json`, no formato que o código espera.
- Confere os campos e tipos de que o código depende (ex.: `data[].won_at?: string|null`).
- Passa a amostra pelas **funções reais** de leitura do código (`linhaDoLead`, `mensagemClint`, `normalizarWebhookHubla`,
  `interpretarPlanilha`, `chamarIAJson` com `fetch` falso...). Só importa; não muda nada em `api/_lib`.
- Trava contra dado real na amostra: e-mail só `@exemplo.com`, telefone só com `0000`, campo de segredo só `EXEMPLO`.
- É descoberto sozinho pelo `scripts/run-tests.mjs` (todo `scripts/test-*.ts`), com a rede bloqueada (`scripts/test-network-guard.mjs`).

Rodar um só: `node --import ./scripts/test-network-guard.mjs --import tsx scripts/test-contrato-kommo.ts`.

### Ao vivo (rotina diária no servidor; **nunca no CI**)

- Só com `CONTRATO_AO_VIVO=1` e sem a variável `CI`.
- **Só GET**, sem seguir redirecionamento (exceto a planilha, que não leva segredo), com lista de hosts aceitos por API e prazo de 20 s.
- **Nunca imprime** token, URL com query ou corpo. Imprime só: nome do campo, tipo esperado, tipos vistos, código HTTP e alguns
  cabeçalhos sem segredo (`facebook-api-version`, começo de `x-business-use-case-usage`).
- Amostras pequenas (`limit=5`, `perPage=5`, poucos dias). Corpos lidos ficam só na memória para pegar um id de exemplo.
- Resultado por API: `ok`, `nao_conferido` (faltou variável: **não conta como conferido**) ou `mudou_ou_falhou`.

Todas de uma vez (sai com código 1 se alguma mudou ou falhou):

```
npm run contrato:ao-vivo
# só algumas:            CONTRATO_SO=kommo,clint npm run contrato:ao-vivo
# resumo em arquivo:     CONTRATO_SAIDA_JSON=/caminho/contratos.json npm run contrato:ao-vivo
```

Variáveis (use tokens **só de leitura** quando a API permitir, separados dos tokens do sync):

| API | Variáveis |
|---|---|
| meta-graph-instagram | `CONTRATO_META_TOKEN`, `CONTRATO_META_IG_ID` |
| meta-marketing | `CONTRATO_META_ADS_TOKEN`, `CONTRATO_META_ADS_CONTA` (sem `act_`) |
| clint | `CONTRATO_CLINT_TOKEN` |
| kommo | `CONTRATO_KOMMO_DOMINIO`, `CONTRATO_KOMMO_TOKEN` |
| wts-flwchat | `CONTRATO_WTS_TOKEN`, `CONTRATO_FLW_PAINEL` (opcional) |
| digisac | `CONTRATO_DIGISAC_SUBDOMINIO`, `CONTRATO_DIGISAC_TOKEN` |
| rdstation | `CONTRATO_RD_TOKEN` |
| windsor | `CONTRATO_WINDSOR_KEY`, `CONTRATO_WINDSOR_CONTA_ANUNCIO`, `CONTRATO_WINDSOR_CONTA_IG` |
| openai-anthropic | `CONTRATO_OPENAI_KEY`, `CONTRATO_ANTHROPIC_KEY` (só `GET /v1/models/{modelo}`) |
| shortio | `CONTRATO_SHORTIO_KEY` |
| google-planilhas | `CONTRATO_PLANILHA_URL` |
| hubla | — (webhook; não há GET) |

**Rotina diária sugerida** (não criada): um agendamento no servidor (n8n ou GitHub Actions com segredos próprios, fora do job `quality`),
uma vez por dia, fora do horário dos syncs. Se sair com código 1, abre um alerta **separado do alerta de dado**: "a Kommo mudou o formato do
campo X", e não "sem dado". O resumo JSON alimenta a tabela `confiabilidade_diaria` ([historico-confiabilidade.md](historico-confiabilidade.md)).

### O que os contratos não cobrem

- Chamadas POST (lote de insights da Meta, chat da OpenAI/Anthropic, criação de link no Short.io, escrita de anúncios): só offline.
- Webhooks (Kommo, Hubla): só offline; o formato real só aparece quando um evento chega.
- Significado dos números (ex.: se `timeWait` mede o que achamos): o contrato vê formato, não sentido. Isso fica na conferência ao vivo de totais.
- Mensagens de conversa da Clint v2: só offline (pedir um chat real abriria conversa de paciente).
