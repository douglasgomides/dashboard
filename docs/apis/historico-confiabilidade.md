# Histórico diário da nota de confiabilidade (proposta)

> **Só desenho.** Nenhuma tabela, função, migração ou rotina foi criada. Baseado na seção 7 da auditoria de confiabilidade de 01/11/2026
> (nota 63/100, 70% verificado). Para virar realidade, precisa de uma migração revisada e de decisão sobre onde roda a rotina.

## Para que serve

Hoje a nota sai de uma auditoria feita de vez em quando. Com o histórico, a equipe vê **todo dia**:
- a nota por critério e por cliente, e quanto dela foi realmente verificado;
- **o que mudou desde ontem** e por quê (ex.: "−2: a conta 2 da clínica X falhou e agora o status mostra");
- os itens "não verificados" em destaque (valem no máximo metade do ponto).

## Tabela `confiabilidade_diaria`

Uma linha por **dia × critério × cliente** (cliente nulo = nota geral do critério).

| Coluna | Tipo | O que guarda |
|---|---|---|
| `dia` | `date` | dia da medição, no fuso de São Paulo |
| `criterio` | `text` | `1A`, `1B`, `2`, `3`, `4`, `5`, `6` (mesmos da auditoria) |
| `client_id` | `uuid` nulo | cliente; nulo = geral |
| `nota` | `numeric(5,2)` | pontos no critério (de 0 ao peso) |
| `peso` | `numeric(5,2)` | peso do critério naquele dia (12,5; 15; 20; 10...) |
| `pct_verificado` | `numeric(5,2)` | % da nota que foi verificada de verdade (regra da metade aplicada) |
| `origem` | `text` | `automatico` (rotina diária) ou `mensal` (auditoria por agentes) ou `manual` |
| `itens` | `jsonb` | evidência de cada item: `[{ chave, pontos, max, verificado, evidencia, fonte }]`, **sem dado pessoal e sem token** |
| `falhas_graves` | `jsonb` | itens que acionam o teto (ex.: `{ chave: "status_mente_anuncios", desde: "2026-10-21" }`) |
| `versao_nexo` | `text` | commit em produção naquele dia (`VERCEL_GIT_COMMIT_SHA`) |
| `calculado_em` | `timestamptz` | quando a linha foi gravada |

- **Chave única:** `(dia, criterio, client_id, origem)`. A rotina pode rodar de novo no mesmo dia e regrava a linha.
- **Nota do dia** = soma dos critérios da origem mais recente de cada critério; aplica o **teto de 70** enquanto houver falha grave aberta.
- **Diferença do dia** = comparação item a item (`itens.chave`) com o dia anterior: é o que alimenta "o que mudou desde ontem".
- **Acesso:** só admin (`is_app_admin()`), como `sync_status`. O cliente nunca vê a tabela crua.
- **Guarda:** linhas diárias por 400 dias; depois, só a média mensal.

Esboço (não é migração):

```sql
-- desenho; não aplicar sem revisão
create table confiabilidade_diaria (
  dia date not null,
  criterio text not null check (criterio in ('1A','1B','2','3','4','5','6')),
  client_id uuid references clients(id),
  nota numeric(5,2) not null,
  peso numeric(5,2) not null,
  pct_verificado numeric(5,2) not null,
  origem text not null check (origem in ('automatico','mensal','manual')),
  itens jsonb not null default '[]',
  falhas_graves jsonb not null default '[]',
  versao_nexo text,
  calculado_em timestamptz not null default now()
);
create unique index on confiabilidade_diaria (dia, criterio, coalesce(client_id, '00000000-0000-0000-0000-000000000000'), origem);
-- RLS: select só para is_app_admin(); escrita só pela service role da rotina.
```

## O que é automático (rotina diária, só leitura)

Roda uma vez por dia no servidor, depois dos syncs da manhã, com a service role do banco e **tokens só de leitura**. Nunca escreve em CRM,
anúncios ou n8n. Grava só em `confiabilidade_diaria`.

| Critério | Item automático | Como mede | Fonte |
|---|---|---|---|
| 1A Fidelidade Instagram/anúncios | amostra de 1 dia fechado por cliente | alcance, seguidores, gasto, conversas do banco × Meta (e × Windsor onde não há token) | Graph, Marketing API, Windsor |
| 1B Fidelidade CRM/vendas | totais por cliente | `crm_conferencia` (já existe) × total da fonte; vendas do mês × Hubla `list_sales` e Clint `won_at` | Kommo, Clint, RD, Digisac, WTS, Hubla |
| 2 Cobertura e frescor | dias sem dado, contas nunca lidas | último dia com dado por conta × hoje; conta ativa com 0 linhas em 30 dias | banco |
| 3 Cálculos e definições | conferências de consistência | ex.: "vendas" igual em todas as telas (mesma função); "0 seguidores novos" com alcance alto; `alcance_somado` × alcance real | banco (funções do painel) |
| 4 Conhecimento das APIs | **testes de contrato ao vivo** | `npm run contrato:ao-vivo` com `CONTRATO_SAIDA_JSON`; `ok` = ponto inteiro, `nao_conferido` = metade, `mudou_ou_falhou` = zero e alerta | [README.md](README.md) |
| 4 (cont.) | tokens perto de vencer | `debug_token` da Meta e datas guardadas dos outros; aviso com 14 dias | Meta, banco |
| 4 (cont.) | versões e modelos | versão da Graph × tabela de fim de versões; `GET /v1/models/{modelo}` da IA | contrato |
| 5 Segurança e integridade | travas e segredos | contagem das travas entre tabelas, RLS das tabelas de token, `npm run secrets:check` no commit em produção | banco, repositório |
| 6 Honestidade da interface | **status que mentem** | `sync_status` "ok" × conta sem dado no período; falha que não aparece (Short.io, planilha); "não medido" no lugar de 0 | banco |

Cada item grava `verificado: true` só quando a comparação foi feita com uma **fonte independente** naquele dia. Se a fonte não respondeu
ou faltou token, o item vale no máximo metade e aparece em "não verificados".

## O que é mensal (auditoria por agentes)

Uma vez por mês, uma rodada completa como a de 01/11/2026 (auditores + revisores independentes, só leitura), para o que precisa de leitura
humana ou de julgamento:

- abrir as telas no navegador e ler o que o médico vê (critério 6);
- reler a doc oficial de cada API e atualizar as fichas em `docs/apis/` (data de leitura, mudanças anunciadas);
- revisar definições ("venda", "agendado", "compareceu") e as decisões pendentes;
- auditar funções de diagnóstico comercial que a rotina não cobre;
- recalibrar pesos e a lista de itens automáticos (o que a auditoria achou e a rotina não pegou vira item novo).

A rodada mensal grava linhas com `origem = 'mensal'`. Nos dias seguintes, os critérios que só a mensal mede repetem a última nota mensal
(com a data de origem visível), e os automáticos seguem a rotina diária.

## Telas e avisos (proposta)

- **Admin › Confiabilidade:** gráfico da nota por dia; nota por cliente; lista "o que mudou desde ontem" com o ponto ganho ou perdido e o
  motivo; "não verificados" em destaque; falhas graves abertas (que mantêm o teto de 70).
- **Resumo semanal no chat** da equipe: nota da semana e as 3 maiores mudanças.
- **Alerta de contrato** separado do alerta de dado: "a API X mudou o formato do campo Y" (vem do teste de contrato ao vivo).

## Fora deste desenho

- Migração, função de cálculo, agendamento e tela: nada foi criado.
- Conferência ao vivo de Kommo, FlwChat, Digisac e RD depende da decisão 5 da auditoria (autorizar a rotina de leitura no servidor).
- Leitura da doc oficial depende da decisão 6 (liberar os domínios de documentação na rede).
