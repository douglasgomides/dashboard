# OpenAI e Anthropic (IA)

> Ficha de memória da API. Base: auditoria de confiabilidade de 01/11/2026 e leitura do código no commit `c01b2b9`.
> As linhas citadas são desse commit e mudam com as correções. "Não verificado" = não confirmado na doc oficial nem ao vivo.

**Resumo.** A OpenAI é a IA principal; a Anthropic é a reserva, **mas só entra quando não existe chave da OpenAI**, não quando a OpenAI falha.
De 23 a 27/10/2026 a chave da OpenAI ficou inválida: ~2.764 chamadas falharam e nenhuma foi para a Anthropic. Os modelos padrão têm
desligamento anunciado (fonte de terceiros) para 14/01/2027.

## 1. O que usamos

| Chamada | Para quê | Modelo padrão | Campos lidos | Código |
|---|---|---|---|---|
| OpenAI `POST /v1/chat/completions` (`response_format: json_object`, `max_completion_tokens`) | agentes, resumos, SAP, conteúdo | `gpt-4o-mini`; "forte": `gpt-4.1` (variáveis `AGENTES_MODELO`, `AGENTES_MODELO_FORTE`) | `choices[0].message.content` (JSON em texto), `usage.prompt_tokens`, `usage.completion_tokens` | `ia.ts:54-71`; também `resumo-conversa.ts:60`, `sessao-ia.ts:45`, `conteudo-ia.ts:96`, `sap-gerar.ts:97` |
| Anthropic `POST /v1/messages` (`anthropic-version: 2023-06-01`) | reserva | `claude-haiku-4-5-20251001`; "forte": `claude-sonnet-5-5` | `content[].text` (o código pega do primeiro `{` ao último `}`), `usage.input_tokens/output_tokens` | `ia.ts:72-86` |
| OpenAI `POST /v1/audio/transcriptions` | transcrição de Reels | `gpt-4o-mini-transcribe` (`language=pt`, `json`) | texto | `transcrever-reels.ts:51` |
| OpenAI `POST /v1/images/generations` | arte de criativos | `gpt-image-1` (1024x1536, `b64_json`) | imagem | `creative-arte.ts:35` |

- **Doc oficial:** <https://platform.openai.com/docs/deprecations>, <https://platform.openai.com/docs/api-reference/models>,
  <https://docs.anthropic.com/en/api/messages>, <https://docs.anthropic.com/en/api/models>. **Não lidas direto em 01/11/2026**: OpenAI por
  fontes de terceiros; Anthropic pela referência interna de 06/10/2026.
- **Custo:** estimativa por tabela de preço (`ia.ts:19-23`), não é a fatura; modelo fora da tabela fica com custo nulo (o Sonnet hoje).
- Cada chamada é registrada em `ia_execucoes` (ok/erro, tokens, custo, ms).

## 2. Significado de cada número

- **Tokens:** `prompt_tokens`/`completion_tokens` (OpenAI) e `input_tokens`/`output_tokens` (Anthropic), gravados em `ia_execucoes`.
- **Custo em US$:** tokens × preço público por milhão (estimativa).
- **Falha:** a resposta cortada pelo limite de tamanho não é conferida (`finish_reason`/`stop_reason`); o `JSON.parse` falha e a execução
  vira erro (não grava lixo, mas gasta a chamada).

## 3. Limites

- **Taxa:** depende do plano da conta (**não verificado**). Sem tratamento de 429, sem espera crescente, sem nova tentativa na mesma chamada.
  O `tema_conversa` para o cliente na rodada ao receber 4xx (evita insistir).
- **Tempo:** 45 s (padrão) ou 90 s ("forte").
- **Recuperação:** pela rodada seguinte (temas, transcrições pendentes).

## 4. Token

- **Tipo:** chave única do servidor, `OPENAI_API_KEY` e `ANTHROPIC_API_KEY` (variáveis de ambiente).
- **Validade:** não vence sozinha; pode ser revogada (foi o que aconteceu de 23 a 27/10/2026, com 401).
- **Cuidado:** o erro 401 da OpenAI devolve a chave mascarada com alguns caracteres finais; 5 linhas de `ia_execucoes.erro` têm esse trecho
  (só admin lê). O erro da Anthropic guarda só o código HTTP (`ia.ts:80`).
- **Quem renova:** dono da conta OpenAI/Anthropic gera chave nova e troca na Vercel.

## 5. Pegadinhas

| Pegadinha | O código trata? | Onde |
|---|---|---|
| Reserva da Anthropic só quando falta a chave da OpenAI, não quando ela falha (401, 429, 5xx) | **Não** | `ia.ts:54` |
| Resposta JSON cortada por `max_tokens` | Parcial (vira erro; não confere `finish_reason`) | `ia.ts:68-71, 83-85` |
| 401 da OpenAI traz a chave mascarada | Parcial (só admin lê) | `ia.ts` (mensagem de erro com 160 caracteres do corpo) |
| Modelo fora da tabela de preço fica com custo nulo | Parcial | `ia.ts:19-23` |
| Transcrição marca 401 da OpenAI como erro permanente | **Não** | `transcrever-reels.ts:86` |
| `anthropic-version` nova (2026-10-21) dá 400 se mandar `temperature/top_p/top_k` | Sim (não manda) | `ia.ts:76-77` |
| Texto antes do JSON na resposta da Anthropic | Sim (recorta do primeiro `{` ao último `}`) | `ia.ts:83-85` |

## 6. Mudanças anunciadas

- **OpenAI:** `gpt-4o`, `gpt-4o-mini`, `gpt-4.1` e `gpt-4.1-mini` saem da API em **14/01/2027** (duas fontes de terceiros que citam a página
  oficial; **não confirmado na OpenAI**). Situação de `gpt-4o-mini-transcribe` e `gpt-image-1`: não verificada. Decisão pendente: escolher o
  substituto antes da data.
- **Anthropic:** `anthropic-version: 2023-06-01` ainda aceita; existe `2026-10-21`. `claude-haiku-4-5-20251001` ativo.
- O teste de contrato ao vivo faz `GET /v1/models/{modelo}` para cada modelo padrão: quando um modelo sair, ele acusa antes de as chamadas
  começarem a falhar.

## 7. Histórico do que quebrou

| Quando | O que quebrou | Como foi (ou será) resolvido |
|---|---|---|
| 23–27/10/2026 | Chave da OpenAI inválida: 3, 459, 628, 771 e 903 erros 401 por dia; 0 sucesso de 24 a 26/10; nada foi para a Anthropic | Chave trocada em 27/10. Pendente: reserva automática quando a OpenAI falhar (decisão 7 da auditoria) |
| 24/10/2026 | 5 transcrições com 401 marcadas como permanentes | Pendente |

## Teste de contrato

`scripts/test-contrato-openai-anthropic.ts`. Offline: passa as respostas da amostra pelo `chamarIAJson` real, com `fetch` e banco falsos na
memória (não sai nada para a rede). Ao vivo: `CONTRATO_AO_VIVO=1 CONTRATO_OPENAI_KEY=... CONTRATO_ANTHROPIC_KEY=...` só faz
`GET /v1/models/{modelo}` (não gera texto, não gasta tokens). O formato de `chat/completions` e `messages` (POST) fica só offline.
