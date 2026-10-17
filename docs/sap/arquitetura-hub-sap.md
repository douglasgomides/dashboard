# Hub + SAP · Auditoria e Agentic Core (primeira entrega)

Feito em 17/10/2026. **Nada foi construído nesta etapa.** O documento descreve o que existe, o que falta e o que recomendo. Tudo que muda o sistema depende da sua aprovação.

Premissa corrigida: **Hub = Dashboard**, um produto só. O SAP é um módulo que alguns clientes do Hub contratam. Um cadastro, um banco, um login.

---

## 0. Clientes existentes (levantamento real do banco, 17/10/2026)

São 19 clientes ativos. **1 está no SAP** (Dra. Juliana Paola). **18 usam só o Hub.**

| Cliente | Login do cliente | Instagram | CRM | Contas de anúncio | WhatsApp (WTS) | SAP | Último dado |
|---|---|---|---|---|---|---|---|
| Doctor Creator | 2 (equipe) | Graph | Clint | 1 | — | não | 16/10 |
| Douglas Gomides | 1 (equipe) | Graph | Clint | 1 | — | não | 16/10 |
| Dr. Antônio Eduardo Pereira | **0** | Graph | Kommo | 1 | — | não | 17/10 |
| Dr. Antonione (IGM Palmas) | **0** | Graph | — | 1 | — | não | anúncios param em 10/09 |
| Dr. Keylon Lucarelli | **0** | Graph | — | 1 | — | não | 16/10 |
| Dr. Sergio Maia | **0** | Graph | FlwChat | 2 | 1.038 sessões | não | 16/10 |
| Dra. Ana Claudia Alves Pereira | **0** | Graph | Kommo | 2 | — | não | 17/10 |
| Dra. Betina Werlang | **0** | Graph | — | 1 | — | não | anúncios param em 04/09 |
| Dra. Fernanda Nunes | **0** | — | RD Station | 0 | — | não | 15/10 |
| Dra. Glauce Casaes | **0** | Graph | — | 2 (sem dado) | — | não | 17/10 |
| Dra. Juliana Carrion | 1 (viewer) | Graph | Kommo | 1 | — | não | leads param em 08/09; **1 fonte com erro** |
| **Dra. Juliana Paola** | **0** | Graph | FlwChat | 1 | 119 | **sim** | 16/10 |
| Dra. Lana Torres | 1 (viewer) | Graph | Kommo | 2 | — | não | 17/10 |
| Dra. Marcella Brasil | **0** | Graph | Planilha + FlwChat | 1 | — | não | 16/10 |
| Dra. Marcelly Achkar | **0** | Windsor | Clint | 0 | — | não | 16/10 |
| Dra. Mariela Muniz | **0** | Graph | FlwChat | 0 | 1.996 | não | 16/10 |
| Dra. Rafaela e Dr. Antonione (IGM Palmas) | **0** | Graph | Digisac | 0 | 7.653 | não | 16/10 |
| Dra. Samira | **0** | — | Kommo | 0 | — | não | 17/10 |
| HOMS · Hospital de Olhos MS | **0** | Graph | Kommo | 2 | — | não | 17/10 |

**O que isso mostra:**
- **15 dos 19 clientes não têm login.** O Hub deles é operado pela equipe (relatórios enviados). Só Lana Torres e Juliana Carrion entram como médico (viewer).
- **Nenhum plano ou recurso contratado está registrado no sistema.** Não existe campo de plano, assinatura ou módulo. Hoje todo cliente vê o Hub inteiro, e o SAP existe só para quem tem linha em `sap_clinicas`.
- **Você precisa me passar** o que cada cliente contratou (ou confirmar "todos têm o Hub completo como hoje"). Sem isso, não dá para controlar funcionalidade por plano sem arriscar tirar algo de alguém.

### Testes específicos para clientes exclusivos do Hub (17/10/2026)

**1. No banco, como a médica viewer da Lana Torres** (usuário real, transação desfeita):
- Vê os próprios posts (1.350), anúncios (2.863), ROI, métricas de CRM e fontes.
- Vê 0 posts e 0 leads de outra clínica.
- Vê 0 linhas do SAP (clínicas, marcos). A consulta do SAP de outra clínica devolve estrutura vazia.
- Os leads brutos do CRM são só de admin por desenho; o cliente vê os números pelas consultas que conferem permissão.

**2. Nas telas, simulando um médico viewer sem SAP** (375 e 1280 px):
- As 17 telas do Hub (Resumo, Conteúdo, Posts, Top, Audiência, Dúvidas, Ideias, Inspiração, Anúncios, Comercial, Guia do CRM, Próximas ações, Campanhas, Atendimento, Oportunidades, Relatório e a entrada) abrem **sem erro, sem rolagem lateral e sem nada do SAP**.
- `/admin` manda de volta para o Hub. ✅
- **Achado R1:** quem digita `/sap`, `/sap/<id>` ou o endereço antigo `/<id>/aquisicao` vê a moldura do SAP: menu, o tour "Bem-vindo ao seu programa" e depois "Sua clínica ainda não está no Sistema de Aquisição".
  - Não vaza dado.
  - Mas mostra o SAP para quem não contratou, e o tour pode gravar "primeiro acesso" para esse usuário.
  - **Correção proposta (pequena, sem mudar nada no Hub):** se o usuário não é admin e o cliente dele não tem SAP, as rotas `/sap*` vão direto para o Hub dele, sem moldura e sem tour.

### Riscos de regressão

| # | Risco | Onde | Proteção |
|---|---|---|---|
| R1 | Cliente só-Hub vê a moldura e o tour do SAP | `_authenticated.sap.tsx`, `$clientId.aquisicao` | Correção acima + teste `hub-only` |
| R2 | Controle por plano tira acesso de quem já tem | qualquer gate novo | **Regra: ausência de registro = comportamento de hoje.** O gate só restringe quando houver registro explícito |
| R3 | Contratar o SAP sobrescreve dado do Hub | cadastro da clínica SAP | O SAP só **lê** `clients` e as integrações; grava em tabelas `sap_*`. Manter assim |
| R4 | Encerrar o SAP remove acesso | `sap_clinicas.status = encerrada` | Encerrar nunca mexe em `client_members`, integrações nem dados. Teste dedicado |
| R5 | 13ª função na Vercel quebra o build | `api/` (limite de 12 no plano atual) | Novas rotinas entram como alvo no `api/sync/manual.ts`, ou no n8n |
| R6 | Sync diário falha sem ninguém ver | n8n → `api/sync/*` | Já existe `sync_status`; falta o aviso de falha (workflow publicado) |
| R7 | IA nova sem controle de custo | 3 arquivos com chamada direta | Registrar cada chamada (tabela de execuções) antes de criar agentes |

---

## Legenda de estado

- **✅ COMPROVADO:** testado nesta auditoria ou com dado real em produção.
- **🟡 PARCIAL:** existe, mas incompleto, desligado ou sem teste.
- **⬜ NÃO EXISTE.**

---

## 1. Diagnóstico da infraestrutura atual (as 18 perguntas do item 4)

| # | Tema | O que existe | Estado |
|---|---|---|---|
| 1 | Stack | SPA Vite + React 19 + TanStack Router; Supabase (Postgres + RLS + RPCs); 12 funções Vercel; n8n externo como agendador | ✅ |
| 2 | Banco | 82 tabelas, todas com RLS. Volume real: 65 mil leads de CRM, 370 mil eventos de CRM, 27 mil posts, 352 mil comentários, 33 mil mensagens de WhatsApp | ✅ |
| 3 | Identificação da clínica | `clients.id` é o tenant único. O SAP liga por `sap_clinicas.client_id` | ✅ |
| 4 | Autenticação | Supabase Auth (e-mail e senha), primeiro acesso com troca de senha | ✅ |
| 5 | Permissões | `app_admins` (admin), `client_members` (owner, strategist, viewer), `sap_papeis` (papéis do SAP). RLS "admin ou membro" | ✅ testado 16 e 17/10 |
| 6 | Hub | 17 telas de cliente + admin (saúde das fontes, conferência, referência, relatórios em lote) | ✅ testado (`hub-only`) |
| 7 | SAP | Cronograma 35 marcos, Minhas tarefas, papéis, sessões, painel, metas e garantia, rastreamento, banco de anúncios, documentos | ✅ smoke 54/54 |
| 8 | Integrações | Instagram (Graph/Windsor), Meta Ads, 6 CRMs, WTS, Short.io | ✅ dados chegando até 16–17/10 na maioria dos clientes |
| 9 | n8n | 10 workflows SAP (todos desligados; P0 corrigidos em 16/10) + o "SAP \| Avisar falhas" (não publicado) | 🟡 |
| 10 | ClickUp | Pasta-modelo "SAP \| Modelo D0–D90": 94 tarefas, 105 dependências, critério e evidência na descrição, sem responsável, sem recorrência ativa, sem checklist, não salva como template. **Nenhuma integração por API no código** | 🟡 |
| 11 | Drive | Pasta "Sistema de Aquisição v2" (método). O Hub guarda só links (dicionário `sap-docs.ts`). **Nenhuma integração por API no código** | 🟡 |
| 12 | CRM | Kommo, Clint, RD Station, FlwChat, Digisac, planilha (Feegow e Ninsaúde sem código) | ✅ |
| 13 | Instagram | Posts, métricas diárias, stories, comentários; público consultado ao vivo (não guardado) | ✅ |
| 14 | Mensuração | Funil por etapa do CRM, ROI, qualidade de lead por campanha, conversões offline (fila `sap_conversoes`), rastreamento 05.03 | ✅ no Hub; 🟡 envio à Meta desligado |
| 15 | IA já construída | Classificação de posts, auditoria de conversas (`conversas_resumos`), rascunho do pós-sessão. OpenAI `gpt-4o-mini` com Anthropic de reserva, via `fetch` direto | ✅ funciona; sem log de custo |
| 16 | Limites | **12 funções na Vercel** (o 13º arquivo quebra o build); sem fila nem worker; sem cron no banco (`pg_cron` não instalado); n8n é o único agendador | ✅ confirmado no código |
| 17 | Segurança | RLS ok; P0 do n8n corrigidos; proteção contra senha vazada desligada (você liga no painel); backup não verificado | 🟡 |
| 18 | Custos | **Não tenho acesso às faturas.** Fixos já pagos: Supabase, Vercel (Hobby), n8n, ClickUp, Windsor, OpenAI/Anthropic por uso. Custo de IA por clínica **não é medido hoje** | ⬜ medição |

## 2. O que aproveitar

| Funcionalidade | Situação atual | Evidência | O que aproveitar | O que alterar | Prioridade |
|---|---|---|---|---|---|
| Cadastro, login, RLS | ✅ | testes de 16 e 17/10 | Tudo | Somar `cliente_modulos` (flags por cliente) | Etapa 1 |
| Saúde das fontes (`sync_status`) | ✅ | admin e cliente | Base de "falhas de integração" da Central | Somar falhas do n8n e da IA | Etapa 1 |
| Auditoria de conversas com IA | ✅ | 100 resumos | Base do Sales Intelligence | Registrar custo; rubrica 06.09 | Etapa 4 |
| Temas, dúvidas, ideias, roteiros de anúncio | ✅ | telas Conteúdo/Ideias | Base do Creative e do Audience | Ler o Brain | Etapa 4 |
| Funil, coorte, ROI, perda | ✅ | RPCs `crm_*` | Ferramentas de leitura do Growth | Nenhuma | Etapa 4 |
| Cronograma SAP (35 marcos) com auto-detecção e evidência obrigatória | ✅ | `sap_marcar_tarefa`, `deteccoes` | **Esqueleto da jornada agêntica** (objetivo, pronto quando, evidência por etapa) | Ligar cada marco às tarefas do ClickUp | Etapa 2 |
| Ficha, acessos, papéis, sessões, metas | ✅ | tabelas `sap_*` | Fonte do Operations e do Brain | — | Etapa 2–3 |
| Banco de anúncios com semáforo e ciente | ✅ | `sap_pecas` (vermelho nunca aprova) | Regra de aprovação do Creative | — | Etapa 4 |
| Relatórios Hub e SAP | ✅ | PDFs | Continuity | Gerador do D60 | Etapa 5 |
| Modelo ClickUp | 🟡 | 94 tarefas | Tarefas granulares do Operations | Salvar como template, campo "Marco", responsáveis | Etapa 2 |
| n8n | 🟡 | 10 workflows | Ponte com ClickUp, Drive e WhatsApp | Fechar os P1 | Etapa 1 |

## 3. Desenho técnico do Agentic Core ⬜

**Princípio:** um motor só, no Supabase que já existe. Não é um serviço novo, nem um chatbot, nem oito IAs soltas.

**Por que no Supabase:** as Edge Functions **não contam no limite de 12 da Vercel**, ficam ao lado dos dados (RLS, segredos) e o `pg_cron` agenda sem depender do n8n.

```
Objetivo (pessoa, regra do painel ou marco do SAP)
   └─▶ agente_execucoes (estado persistente)
          └─▶ Orquestrador (Edge Function "agentes", acordada a cada minuto pelo pg_cron)
                 1. lê a próxima execução com lease (FOR UPDATE SKIP LOCKED)
                 2. carrega o contexto autorizado (Brain aprovado + dados do cliente + regras do método)
                 3. planeja o próximo passo (plano FIXO do fluxo; IA só onde precisa de texto ou julgamento)
                 4. chama uma ferramenta do registro (com esquema, permissão, limite e chave de idempotência)
                 5. grava o passo em agente_passos (entrada, saída, custo, erro)
                 6. risco médio/alto → cria item em aprovacoes e PAUSA a execução
                 7. verifica o critério de sucesso → avança, tenta de novo (máx. N) ou escala para pessoa
                 8. encerra com evidências registradas
```

**A. Orquestrador:**
- Cada fluxo é uma **máquina de estados declarada em código**: passos, pré-requisitos, critério de sucesso.
- A IA preenche conteúdo e classifica; **não inventa o processo**.
- Isso atende "agentes recebem objetivos, planejam, usam ferramentas e verificam resultado" sem autonomia livre onde ela é perigosa.

**B. Registro de ferramentas:**
- Tabela `ferramentas` + módulo TypeScript com esquema (zod) de entrada e saída.
- Cada ferramenta declara:
  - risco: baixo, médio ou alto;
  - permissão exigida;
  - limite por dia por cliente;
  - timeout;
  - se é reversível;
  - critério de sucesso.

| Ferramenta | Risco | Fonte | Estado |
|---|---|---|---|
| `sap.ler_cronograma`, `sap.ler_acessos`, `sap.ler_ficha` | baixo | RPCs SAP | ⬜ (dados ✅) |
| `hub.metricas` (funil, ROI, anúncios, Instagram) | baixo | RPCs atuais | ⬜ (dados ✅) |
| `crm.agregados` (sem dado individual) | baixo | RPCs `crm_*` | ⬜ (dados ✅) |
| `brain.ler` (só aprovado) / `brain.propor` | baixo / médio | `brain_itens` | ⬜ |
| `clickup.ler_tarefas`, `clickup.comentar` | baixo | API ClickUp | ⬜ |
| `clickup.atualizar_status` | médio | API ClickUp | ⬜ |
| `drive.ler_documento` | baixo | API Drive (conta de serviço ou n8n) | ⬜ |
| `drive.criar_rascunho` (cópia de modelo na pasta do cliente) | médio | API Drive | ⬜ |
| `sap.registrar_evidencia`, `sap.marcar_marco` | médio | `sap_marcar_tarefa` (já exige evidência) | ⬜ (RPC ✅) |
| `ia.gerar_texto` | baixo | `ia.ts` único | 🟡 (3 cópias hoje) |
| `whatsapp.enviar_cliente`, `meta.publicar`, `meta.mudar_verba` | **alto** | — | **não entra no MVP** |

**C. Memória:**

| Tipo | Onde |
|---|---|
| Identidade, Audiência, Comercial, Criativa, Decisão | `brain_itens`, com tipo fato, observado, hipótese ou recomendação, e estado proposto ou aprovado |
| Conhecimento operacional | O método, em código e no Drive |
| Dados e métricas | As tabelas atuais (não copiar) |
| Experimentos | `experimentos` |
| Contexto temporário | `agente_execucoes.contexto`, apagado ao encerrar |

**Uma hipótese da IA nunca vira fato:** só uma pessoa autorizada muda o estado para aprovado.

**D. Motor de execução:**
- Fila e estados: `agente_execucoes` com estado pendente, rodando, aguardando aprovação, pausada, concluída, falhou ou cancelada.
- Lease com expiração: se a função cair no meio, outra retoma.
- **Idempotência:** cada chamada externa leva `chave_idempotencia` (execução + passo). Repetir não duplica comentário no ClickUp nem marco no SAP.
- Retentativa com backoff, no máximo 3; depois disso, escala para pessoa.
- Pausar e retomar pela Central.
- Timeout por passo.
- **Teto de custo de IA** por cliente/mês e por execução: estourou, pausa e avisa.
- Tudo logado em `agente_passos`.

## 4. Estrutura de dados e permissões ⬜

Nenhuma tabela atual muda. Todas as novas têm RLS: admin vê tudo; equipe vê as clínicas atribuídas; cliente vê só o próprio aprovado, e só se tiver o módulo.

```
cliente_modulos     (client_id, modulo['hub','sap','brand_brain','agentes'], status, inicio, fim, origem)
                    -- SEM registro = comportamento de hoje (nenhum cliente perde nada)
ferramentas         (nome, versao, risco, reversivel, limite_dia_cliente, timeout_s, ativa)
agente_execucoes    (id, client_id, agente, fluxo, objetivo, estado, passo_atual, contexto jsonb,
                     lease_ate, tentativas, custo_ia, criado_por, criado_em, encerrado_em, resultado)
agente_passos       (id, execucao_id, ordem, ferramenta, entrada jsonb, saida jsonb, ok, erro,
                     chave_idempotencia unique, custo_ia, duracao_ms, criado_em)
aprovacoes          (id, execucao_id, client_id, risco, resumo, proposta jsonb, evidencias jsonb,
                     estado['pendente','aprovada','rejeitada','correcao'], decidido_por, decidido_em, comentario)
brain_itens         (id, client_id, memoria['identidade','audiencia','comercial','criativa','decisao'],
                     chave, valor, tipo['fato','observado','hipotese','recomendacao_ia'], fonte, fonte_ref,
                     confianca, estado['proposto','aprovado','rejeitado','arquivado'], versao,
                     aprovado_por, aprovado_em, criado_por, criado_em)
brain_itens_historico (item_id, versao, valor, estado, alterado_por, alterado_em)
experimentos        (id, client_id, hipotese, variavel, inicio, fim, metrica, resultado, limitacoes,
                     decisao, aprendizado, aprovado)
ia_execucoes        (id, client_id, execucao_id, finalidade, modelo, tokens_in, tokens_out, custo, ok, erro, criado_em)
tarefas_clickup     (clickup_task_id, client_id, marco, status, responsavel, prazo, sincronizado_em)
```

| Ação | Admin | Equipe (a ativar) | Cliente com módulo | Cliente só Hub |
|---|---|---|---|---|
| Hub como hoje | ✅ | ✅ atribuídas | ✅ | ✅ |
| Telas do SAP | ✅ | ✅ | ✅ menu clínica | ❌ volta ao Hub (R1) |
| Central de Agentes | ✅ | ✅ (sem aprovar risco alto) | ❌ | ❌ |
| Aprovar risco médio | ✅ | ✅ | ❌ | ❌ |
| Aprovar risco alto | ✅ explícito | ❌ | ❌ | ❌ |
| Ver Brain aprovado | ✅ | ✅ | ✅ | ❌ |
| Aprovar item do Brain | ✅ | ❌ (propõe) | propõe | ❌ |
| Custo de IA, logs | ✅ | ❌ | ❌ | ❌ |
| Mudar módulo do cliente | ✅ (com sua decisão comercial) | ❌ | ❌ | ❌ |

## 5. Arquitetura do Brand Brain ⬜

- **Um Brain por clínica, no Hub** (`brain_itens`), lido pelo SAP e pelos agentes. Disponível só para quem tiver o módulo `brand_brain`.
- **Cinco memórias:** Identidade, Audiência, Comercial, Criativa e Decisão.
- **Fontes que já existem e não precisam de formulário novo:**

| Fonte | Alimenta |
|---|---|
| Ficha SAP (decisor, ambição, serviços, ticket) | Comercial |
| Sessões (`sap_sessao_registro`) | Identidade, Decisão |
| Resumos de conversa (objeções, motivos) | Audiência, Comercial |
| Motivos de perda do CRM | Comercial |
| Temas e dúvidas do Instagram | Audiência, Criativa |
| Banco de anúncios + campanhas | Criativa |
| Documentos do Drive autorizados (04.05 Paciente Ideal e Proposta de Valor) | Identidade, Audiência |

- **Ciclo:** fonte → agente Brand propõe (estado proposto, com fonte e confiança) → pessoa aprova, corrige ou rejeita → nova versão. Toda versão fica no histórico e pode ser restaurada.
- **Nunca entra no Brain:** nome, telefone ou mensagem de paciente, nem dado clínico individual. Só padrões agregados ("objeção de preço em 34% das conversas de setembro, n = 120").
- **Busca:** começa por categoria e chave (texto curto). Vetores (pgvector) só se o volume pedir.

## 6. Integrações necessárias

| Integração | Para quê | Como | Estado |
|---|---|---|---|
| ClickUp API | Ler tarefas da pasta do cliente, comentar, mudar status, ler dependências | Token na Edge Function (segredo); webhook do ClickUp para mudanças → `tarefas_clickup` | ⬜ (modelo 🟡) |
| Google Drive API | Ler documentos do método e do cliente; copiar modelos para a pasta do cliente | Conta de serviço com acesso à pasta, ou via n8n (OAuth já conectado lá) | ⬜ |
| Supabase `pg_cron` + Edge Functions | Acordar o orquestrador | Instalar a extensão e publicar a função (**produção: precisa da sua autorização**) | ⬜ |
| OpenAI / Anthropic | Texto e classificação | `ia.ts` único com registro de custo | 🟡 |
| n8n | Continua com os syncs e o WhatsApp interno da equipe | Sem mudança | 🟡 |
| Meta (publicar, verba) | — | **Fora do MVP** (risco alto) | ⬜ |

## 7. Desenho da Central de Agentes ⬜

**Onde:** uma tela admin no Hub (`/admin/agentes`), não visível a clientes. Responde a uma pergunta só: **"o que precisa de mim agora?"**

1. **Fila de exceções** (topo):
   - aprovações pendentes por risco;
   - execuções que falharam ou escalaram;
   - integrações com erro (de `sync_status`);
   - clínicas em risco (alertas de escalonamento atuais).
   - Cada item tem botões reais: **Aprovar, Rejeitar, Pedir correção, Ver evidências, Ver log**.
2. **Execuções:**
   - em andamento, pausadas, concluídas hoje, com o passo atual;
   - botões **Pausar, Retomar, Cancelar**.
3. **Por clínica:** etapa D0–D90, execuções, aprovações, custo de IA no mês.
4. **Números do operador:** intervenções humanas, tempo até decidir, retrabalho (correções pedidas), custo de IA, horas estimadas.

Cada botão chama uma RPC que muda o estado da execução e registra quem decidiu. **Sem botão que simule automação.**

## 8. Primeiro fluxo ponta a ponta para validação (Etapa 2) ⬜

**Operations Agent · Marco 5 "Acessos críticos" (D1 a D5).** Por que este marco:
- já tem dados estruturados (29 itens em `sap_acessos`);
- tem critério objetivo (acesso confirmado);
- tem tarefas no ClickUp (T0xx de acessos);
- tem documento no Drive (02.05);
- tem um passo externo arriscado (cobrar a clínica) que testa a aprovação.

**Ambiente de teste:** clínica sintética "CLÍNICA TESTE SAP V2" num **branch do Supabase** (banco separado, sem tocar produção) e uma **pasta de teste no ClickUp** criada a partir do modelo.

| Passo | O que o agente faz | Ferramenta | Risco |
|---|---|---|---|
| 1 | Lê o objetivo e o critério do marco 5 (método) | código | — |
| 2 | Lê o checklist de acessos da clínica e vê o que falta | `sap.ler_acessos` | baixo |
| 3 | Lê as tarefas de acesso no ClickUp da clínica e confere status e prazo | `clickup.ler_tarefas` | baixo |
| 4 | Lê o procedimento 02.05 no Drive para o texto de cada acesso | `drive.ler_documento` | baixo |
| 5 | Prepara a mensagem de cobrança à clínica, só com os itens pendentes, no tom do 02.02 | `ia.gerar_texto` | baixo |
| 6 | **Pede aprovação** para enviar (mensagem externa) | `aprovacoes` | alto |
| 7 | Aprovada: a pessoa envia (no MVP **não há envio automático**); o agente registra "cobrança feita" e comenta na tarefa do ClickUp | `clickup.comentar` | baixo |
| 8 | Todo dia confere de novo; quando todos os críticos estão confirmados, registra a evidência e propõe marcar o marco | `sap.registrar_evidencia` | médio |
| 9 | Pessoa aprova (ou regra pré-aprovada) → marco 5 "feito" no SAP + tarefa fechada no ClickUp | `sap.marcar_marco`, `clickup.atualizar_status` | médio |
| 10 | Encerra, com custo, passos e intervenções medidos | — | — |

**O teste prova:**
- estado persistente e retomada (derrubar a função no passo 5);
- idempotência (repetir o passo 7 não duplica o comentário);
- aprovação bloqueando a ação de risco;
- evidência obrigatória;
- custo medido;
- nenhum dado de outra clínica no contexto.

## 9. Custo e complexidade (estimativas, não medições)

| Etapa | Complexidade | Custo novo |
|---|---|---|
| 1 · Base (módulos, R1, `ia.ts`, motor, tabelas) | média | Supabase: Edge Functions e `pg_cron` entram no plano atual dentro de limites (**conferir o plano**). Branch de teste do Supabase é cobrado por hora enquanto existir |
| 2 · Operations Agent | média | IA: poucos centavos por execução (mensagem curta, modelo pequeno). ClickUp API: sem custo além do plano (limite de requisições por minuto do plano, **não confirmado**) |
| 3 · Brand Brain | média | Carga inicial por clínica: centavos a poucos reais de IA |
| 4 · Brand, Creative, Strategy, Growth | alta | Proporcional ao uso; teto por cliente configurável |
| 5 · Expansão operacional | alta | — |
| 6 · Hub agêntico | alta | Depende do plano comercial (decisão sua) |

Nenhum número de custo será afirmado antes de a `ia_execucoes` medir.

## 10. Roadmap

1. **Etapa 1 (base):**
   - R1 + teste `hub-only` no repositório;
   - `cliente_modulos` só registrando;
   - `ia.ts` único + `ia_execucoes`;
   - tabelas do motor;
   - Edge Function do orquestrador com um fluxo "eco" de teste;
   - Central de Agentes (fila e execuções);
   - fechar os P1 do n8n.
2. **Etapa 2:**
   - ferramentas do ClickUp e do Drive;
   - Operations Agent no marco 5, no branch de teste;
   - medir intervenções e custo;
   - **Demonstração para você antes de qualquer produção.**
3. **Etapa 3:** Brand Brain (tabelas, carga das fontes atuais, aprovação, versões, tela).
4. **Etapa 4:** Creative (briefs e roteiros com Brain + banco de anúncios), Growth (gargalos → experimentos), Sales Intelligence (auditoria já existe), Strategy.
5. **Etapa 5:** mais marcos do SAP no Operations; Quality conferindo entregáveis; Continuity com o D60/D90.
6. **Etapa 6:** Hub agêntico por plano: Audience Intelligence, Brain contínuo, relatórios.

## 11. Riscos e dependências

- **Dependem de você:**
  - recursos contratados por cliente;
  - aprovação de cada etapa;
  - autorização para publicar a Edge Function, instalar o `pg_cron` e criar o branch de teste;
  - publicar o "SAP | Avisar falhas";
  - decidir a divisão ClickUp × SAP.
- **Fornecedores:** limites da API do ClickUp no plano; acesso do Drive (conta de serviço ou n8n); Quaddro sem confirmação.
- **Técnicos:**
  - limite de 12 funções na Vercel (por isso o motor fica no Supabase);
  - concorrência no ClickUp: a mesma tarefa editada por pessoa e agente. Regra: o agente só comenta e muda status em tarefa ligada a marco, nunca apaga nem recria.
- **Regulatórios:**
  - comunicação médica e anúncios sempre com aprovação humana;
  - nada de dado individual de paciente no Brain;
  - o agente Quality **não** substitui revisão médica ou jurídica.
- **Produto:** R2 (gate tirar acesso) é evitado pela regra "sem registro = como hoje".

## 12. Critérios de aceite e plano de testes

**Etapa 1:**
- `hub-only` 23/23 (hoje 19/23, falhando só pelo R1).
- Smoke admin 54/54.
- Teste de RLS como viewer só-Hub, viewer com SAP e usuário de outra clínica.
- Fluxo "eco" sobrevive a uma queda simulada.
- Repetir um passo não duplica a ação.
- Cada chamada de IA gera uma linha de custo.

**Etapa 2 (MVP):**
- O fluxo do marco 5 roda de ponta a ponta no branch de teste.
- Para numa aprovação de risco alto e só continua com decisão registrada.
- Comenta e fecha a tarefa certa no ClickUp de teste, uma vez só.
- Marca o marco só com evidência.
- Mede intervenções (meta: ≤ 2 por execução: a aprovação da mensagem e a do marco) e custo.
- Não lê nenhum dado de outra clínica.

**Sempre:**
- `scripts/test-*.ts`, `tsc`, build;
- teste do banco em transação desfeita;
- reversão documentada em cada migração;
- nada em produção sem sua autorização.

---

## Proposta de MVP em ambiente de teste

**Escopo:** Etapa 1 + Etapa 2, só no **branch de teste do Supabase** e numa **pasta de teste do ClickUp**.

**Entrega:**
- motor (fila, estados, idempotência, retomada, custo);
- registro com 8 ferramentas de leitura e escrita interna;
- Central de Agentes com fila de exceções e ações reais;
- Operations Agent executando o marco 5 da CLÍNICA TESTE SAP V2.

**Fora:** envio externo automático, publicação de anúncio e mudança de verba. Produção, clientes reais e o Hub dos clientes atuais não mudam.

## O que preciso de você para começar

1. **Recursos contratados por cliente**, ou "todos têm o Hub completo como hoje".
2. **Ok para a correção R1** (rotas do SAP só para quem tem SAP). É a única mudança que toca a produção agora, é pequena e reversível.
3. **Ok para o ambiente de teste:** criar um branch do Supabase (custo por hora enquanto existir) e uma pasta de teste no ClickUp a partir do modelo.
4. **Divisão ClickUp × SAP:** ClickUp dono das 94 tarefas granulares e SAP dono dos 35 marcos (recomendo), ou outra.
5. **Publicar o "SAP | Avisar falhas"** no n8n.
