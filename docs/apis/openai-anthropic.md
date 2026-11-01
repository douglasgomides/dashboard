# OpenAI e Anthropic (IA)

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026, código no commit `89ae33c` e **doc oficial da Anthropic lida em
> 01/11/2026**. A doc da OpenAI **continua sem abrir** na segunda leitura (01/11/2026): `platform.openai.com` responde, mas toda página de
> doc devolve **301 para `developers.openai.com`** (ex.: `/docs/deprecations` → `developers.openai.com/api/docs/deprecations`), e esse host
> é recusado pelo proxy (403 no CONNECT); a referência da API em `platform.openai.com/docs/api-reference/...` devolve 403. Para ler, é
> preciso liberar `developers.openai.com`. O que está abaixo como "por busca" veio de trechos de busca que citam a página oficial.
> "Não verificado" = não confirmado na doc oficial nem ao vivo; o motivo vem ao lado.

**Resumo.** A OpenAI é a IA principal; a Anthropic é a reserva e entra quando a OpenAI falha (401/402/403/429/5xx/rede e, agora,
**404 / `model_not_found`**, `ia.ts:93-97`). Na Anthropic, todos os modelos usados estão ativos (doc lida). Na OpenAI, **por busca**, todos
os quatro modelos padrão têm desligamento anunciado, e o `gpt-image-1` **já teria saído em 23/10/2026** (ver seção 6). A troca de modelo
padrão é decisão do dono e não foi feita.

## 1. O que usamos

| Chamada | Para quê | Modelo padrão | Campos lidos | Código |
|---|---|---|---|---|
| OpenAI `POST /v1/chat/completions` (`response_format: json_object`, `max_completion_tokens`) | agentes, resumos, SAP, conteúdo | `gpt-4o-mini`; "forte": `gpt-4.1` (variáveis `AGENTES_MODELO`, `AGENTES_MODELO_FORTE`) | `choices[0].message.content`, `usage.prompt_tokens/completion_tokens` | `ia.ts:85-104`; também `resumo-conversa.ts`, `sessao-ia.ts`, `conteudo-ia.ts`, `sap-gerar.ts` |
| Anthropic `POST /v1/messages` (`anthropic-version: 2023-06-01`, `output_config.effort: "low"`) | reserva | `ia.ts`: `claude-haiku-5-5`; "forte": `claude-sonnet-5-5`. `resumo-conversa.ts`, `sessao-ia.ts`, `conteudo-ia.ts`: `claude-haiku-4-5-20251001` | `content[].text` (recorta do primeiro `{` ao último `}`), `usage.input_tokens/output_tokens` | `ia.ts:106-125` |
| OpenAI `POST /v1/audio/transcriptions` | transcrição de Reels | `gpt-4o-mini-transcribe` (`language=pt`, `json`) | texto | `transcrever-reels.ts:17` |
| OpenAI `POST /v1/images/generations` | arte de criativos | `gpt-image-1` (1024x1536, `b64_json`) | imagem | `creative-arte.ts:13, 69` |

- **Doc oficial:** Anthropic, lida em 01/11/2026:
  [Model deprecations](https://platform.claude.com/docs/en/about-claude/model-deprecations),
  [Versions](https://platform.claude.com/docs/en/api/versioning), [Rate limits](https://platform.claude.com/docs/en/api/rate-limits),
  [Effort](https://platform.claude.com/docs/en/build-with-claude/effort) (o endereço antigo `docs.anthropic.com` não respondeu; `docs.claude.com`
  e `platform.claude.com` sim). OpenAI: <https://platform.openai.com/docs/deprecations> redireciona (301) para <https://developers.openai.com/api/docs/deprecations>, **bloqueado** (403 do proxy em 01/11/2026).
- **Custo:** estimativa por tabela de preço (`ia.ts:21-29`), não é a fatura.
- Cada chamada é registrada em `ia_execucoes` (ok/erro, tokens, custo, ms).

## 2. Significado de cada número

- **Tokens:** `prompt_tokens`/`completion_tokens` (OpenAI) e `input_tokens`/`output_tokens` (Anthropic), gravados em `ia_execucoes`.
- **Custo em US$:** tokens × preço público por milhão (estimativa; preços da tabela **não verificados** nesta revisão).
- **Falha:** a resposta cortada pelo limite de tamanho não é conferida (`finish_reason`/`stop_reason`); o `JSON.parse` falha e vira erro.

## 3. Limites

- **Anthropic (verificado):** limites por minuto de pedidos (RPM) e de tokens de entrada e saída, por classe de modelo; "If you exceed any of
  the rate limits, you will get a 429 error ... When the response has a `retry-after` header, wait that many seconds". "Not every 429
  carries it; the spend-cap 429 never does" (teto de gasto do mês: pausa até 00:00 UTC do dia 1º). O Nexo não repete na mesma chamada.
- **OpenAI:** **não verificado** (doc `developers.openai.com/api/docs/guides/rate-limits` bloqueada; não há trecho de busca confiável com
  os números do nosso nível). Sem nova tentativa na mesma chamada; 401/402/403/404/429/5xx passam para a Anthropic. Sem leitura de
  `Retry-After` nem dos cabeçalhos `x-ratelimit-*` (não verificado o nome exato).
- **Transcrição:** limite de **25 MB** por arquivo: o código já corta em 25 MB (`transcrever-reels.ts:19`) e marca como permanente;
  **não verificado** nesta leitura (guia `speech-to-text` bloqueado), vem da leitura anterior e do 413 que a API devolve.
- **Tempo:** 45 s (padrão) ou 90 s ("forte").

## 4. Token

- **Tipo:** chave única do servidor, `OPENAI_API_KEY` e `ANTHROPIC_API_KEY` (variáveis de ambiente).
- **Validade:** não vence sozinha; pode ser revogada (foi o que aconteceu de 23 a 27/10/2026, com 401).
- **Cuidado:** o erro da OpenAI passa por `semChave` antes de gravar (`ia.ts:102`).
- **Quem renova:** dono da conta OpenAI/Anthropic gera chave nova e troca na Vercel.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Reserva da Anthropic só quando faltava a chave da OpenAI | **Sim** (agora também em 401/402/403/404/429/5xx/rede e `model_not_found`) | `ia.ts:93-97` |
| Resposta JSON cortada por `max_tokens` | Parcial (vira erro; não confere `finish_reason`/`stop_reason`) | `ia.ts:104, 121-125` |
| Modelo fora da tabela de preço fica com custo nulo | Parcial | `ia.ts:21-29` |
| Transcrição marcava 401 da OpenAI como permanente | **Sim** (erro de chave é passageiro) | `transcrever-reels.ts:9, 24` |
| `temperature`/`top_p`/`top_k`: 400 na versão `2026-10-21` e, nas versões antigas, em Claude 4.7+ com valor fora do padrão (verificado) | Sim (não manda) | `ia.ts:117` |
| `output_config.effort` só existe nos modelos da lista da doc (Haiku 5.5, Sonnet 5.5, Opus 4.5+...); **Haiku 4.5 não está na lista** | Parcial (padrão `claude-haiku-5-5` está na lista; trocar `AGENTES_MODELO_CLAUDE` para Haiku 4.5 pode dar 400) | `ia.ts:17, 117` |
| Texto antes do JSON na resposta da Anthropic | Sim (recorta do primeiro `{` ao último `}`) | `ia.ts:121-125` |
| Modelo da OpenAI desligado: 404 `model_not_found` em toda chamada, sem reserva | **Sim** (404 ou `error.code = "model_not_found"` passam para a Anthropic; o código fica em `ErroProvedorIA.codigo`) | `ia.ts:68-97, 145-150`; `scripts/test-docs-apis-2.ts` |
| Arte de criativos (`gpt-image-1`) não tem reserva: modelo desligado vira "O serviço de imagens recusou a solicitação (404)" | **Não** (a trava `MODELO !== "gpt-image-1"` também impede trocar por variável sem mudar o código e validar o custo) | `creative-arte.ts:13, 41, 69` |
| Transcrição com modelo desligado: 404 | Parcial (404 da transcrição é passageiro, nova tentativa em 24 h; não marca o vídeo como permanente) | `transcrever-reels.ts:24, 75` |

## 6. Mudanças anunciadas

- **Anthropic (verificado em 01/11/2026, tabela "Model deprecations"):** `claude-haiku-5-5` ativo, "Not sooner than October 7, 2027";
  `claude-sonnet-5-5` ativo, "Not sooner than September 28, 2027"; `claude-haiku-4-5-20251001` ativo, "Not sooner than October 15, 2026"
  (a data já passou: pode ser anunciada a qualquer momento, com "at least 60 days' notice"). `claude-sonnet-4-5-20250929` sai em
  30/11/2026 (o Nexo não usa). `anthropic-version: 2023-06-01` continua aceito; a mais nova é `2026-10-21` (remove `temperature`, `top_p`,
  `top_k`).
- **OpenAI (por busca em 01/11/2026; página oficial <https://developers.openai.com/api/docs/deprecations> bloqueada):**

  | Modelo em uso | Onde | Desligamento anunciado | Substituto indicado | Fonte |
  |---|---|---|---|---|
  | `gpt-image-1` | `creative-arte.ts:13` | **23/10/2026 (já passou)** | `gpt-image-2.5-sunburst` ou `gpt-image-2.5-flare` (cópias antigas da página: `gpt-image-2`) | trecho da página oficial na busca |
  | `gpt-4o-mini` (aponta para `gpt-4o-mini-2024-07-18`) | `ia.ts:15`, `resumo-conversa.ts:18`, `sessao-ia.ts:18`, `conteudo-ia.ts:9, 21` | **14/01/2027** | `gpt-6-luna` | terceiros (datanorth.ai, dev.to, pacote `lastorders` 0.4.5 de 16/10/2026); o trecho oficial visto não mostrou essa linha |
  | `gpt-4.1` (aponta para `gpt-4.1-2025-04-14`) | `ia.ts:19`, `sap-gerar.ts:14` | **14/01/2027** | `gpt-6-luna` | idem |
  | `gpt-4o-mini-transcribe` | `transcrever-reels.ts:17` | **26/02/2027** (snapshot `2025-12-15`; o `2025-03-20` sai em 20/01/2027). Aviso enviado em 26/08/2026, junto com `whisper-1`, `gpt-4o-transcribe` e `gpt-4o-transcribe-diarize` | `gpt-live-transcribe` ou `gpt-transcribe` | trecho da página oficial na busca |

  **Não verificado na página** (bloqueada): confirmar antes de trocar. O `gpt-image-1` é o urgente: se a data valer, a geração de arte já
  está devolvendo erro desde 23/10/2026 e **não tem reserva**. Os modelos de texto têm a Anthropic de reserva (inclusive em 404, desde
  esta mudança), mas a troca do padrão (`AGENTES_MODELO`, `AGENTES_MODELO_FORTE`, `TRANSCRICAO_MODELO`, `ARTE_MODELO` + a trava de custo
  em `creative-arte.ts:69`) é **decisão do dono**. O teste de contrato ao vivo faz `GET /v1/models/{modelo}` e acusa quando um modelo sair.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi resolvido |
|---|---|---|
| 23–27/10/2026 | Chave da OpenAI inválida: milhares de 401; nada foi para a Anthropic | Chave trocada em 27/10; reserva automática na falha (`deveUsarReserva`) |
| 24/10/2026 | 5 transcrições com 401 marcadas como permanentes | Erro de chave passou a ser passageiro |
| 23/10/2026 (por busca) | Desligamento anunciado do `gpt-image-1` | Pendente: decisão do dono sobre o substituto e o custo (`creative-arte.ts:13, 69`) |
| 01/11/2026 | Risco: modelo desligado (404) não passava para a Anthropic | `deveUsarReserva` aceita 404 e `model_not_found` |

## Teste de contrato

`scripts/test-contrato-openai-anthropic.ts`. Offline: passa as respostas da amostra pelo `chamarIAJson` real, com `fetch` e banco falsos na
memória. Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_OPENAI_KEY=... CONTRATO_ANTHROPIC_KEY=...` só faz `GET /v1/models/{modelo}`.
