# SAP v2 · Prontidão técnica (auditoria + teste)

Feito em 16/10/2026. **Nenhum workflow foi ativado ou executado, nenhuma mensagem foi enviada e nenhuma conversão foi registrada. O Drive, o ClickUp e a produção não foram alterados.**
O teste no banco rodou dentro de uma transação que é sempre desfeita no fim. Conferido depois: 0 clínicas de teste, 0 leads e 0 eventos no banco.

## 1. Mapa técnico

| Peça | O que faz | Estado |
|---|---|---|
| Hub (dash.doctorcreator.com.br/sap) | Telas do programa: tarefas, cronograma, painel, leads, anúncios e sessões | Em produção |
| Supabase `cvdnzoqduliopscfsrkc` | Tabelas `sap_*` (clínicas, leads, eventos, marcos, papéis, peças…), view `sap_funil_semanal`, funções com checagem de permissão | Em produção; dados reais: só a clínica Paola, 0 leads |
| n8n: 10 workflows "SAP \|" | Lead → Tracker, Status → Tracker + conversões, alerta semanal, D0 onboarding, lembretes, formulário da recepção, investimento Google, resumo semanal, contrato → D0, conversões offline diárias | **Todos desligados**; nenhum tem workflow de erro |
| ClickUp | Modelo de 94 tarefas e 105 dependências (37 com a tag "cliente") | Não salvo como template |
| ZapSign | Contrato → webhook → D0 | Depende do workflow 9 |
| Meta CAPI / Google Ads | Conversões offline (EtapaA–D) | Meta: 1 token para todos os pixels. Google: sem credencial |
| Quaddro / WhatsApp | IA de atendimento e cadências | Tudo "[a confirmar]" nos documentos; nada verificável daqui |
| Drive | Pasta por clínica e documentos | Criação automática depende do D0 (workflow 4) |

## 2. Teste ponta a ponta · CLÍNICA TESTE SAP V2 (dados sintéticos)

| # | Etapa | Resultado | Evidência |
|---|---|---|---|
| 1 | Contrato fictício | Bloqueado: precisa de autorização (ZapSign + workflow 9) | — |
| 2 | D0 onboarding | Bloqueado: o workflow 4 tem placeholders (e-mail e template do ClickUp) | Auditoria do n8n, item 4.1/4.2 |
| 3 | Pasta no Drive | Bloqueado (depende de 2) | — |
| 4 | Tarefas no ClickUp | Bloqueado: template não salvo, ID vazio | Auditoria do ClickUp |
| 5 | Clínica no Tracker | **Aprovado em teste** | Insert em `sap_clinicas` OK (desfeito) |
| 6 | Lead fictício | **Aprovado em teste** no banco. O webhook do n8n não foi testado | 3 leads inseridos |
| 7 | Origem e identificadores | Parcial: os campos existem (utm, fbclid, gclid, hashes). Captura real não testada | — |
| 8 | Qualificação | **Aprovado em teste**: pontuação A/B conta como "qualificado" | View: qualificados = 2 de 3 |
| 9 | Conversa recepção/IA | Bloqueado (Quaddro não confirmada) | — |
| 10 | Agendamento | **Aprovado em teste** | agendamentos = 3 |
| 11 | Confirmação | Não testável: não existe campo nem workflow de confirmação no banco | — |
| 12 | Comparecimento | **Aprovado em teste** | consultas = 2 (compareceu = Sim) |
| 13 | Decisão da consulta | **Aprovado em teste** | fechamentos = 1 |
| 14 | Follow-up | **Com falha**: o workflow Status grava "Encerrada" em todo "não fechou" (D16) | Nó "Normalizar status" |
| 15 | Fechamento | **Aprovado em teste** | receita = 4500 |
| 16 | Indicadores | **Aprovado em teste**: a view soma certo | mediana da 1ª resposta = 17 min (4 e 30) |
| 17 | Resumo semanal | Bloqueado (workflow 8 desligado; enviaria à clínica) | — |
| 18 | Alertas internos | Bloqueado (workflow 3 desligado) | — |
| 19 | Conversões em teste | Bloqueado: falta o test_event_code e um token por pixel | — |
| 20 | Consistência ponta a ponta | Parcial: banco → view → Hub coerentes. O isolamento foi confirmado (o lead de teste não aparece em outra clínica; usuário de outra clínica vê 0 linhas e não grava) | Testes de RLS feitos antes |

## 3. Confiabilidade (testado no banco, desfeito)

| Caso | Resultado |
|---|---|
| Mesmo `id` de lead duas vezes | Bloqueado (chave primária) ✅ |
| Mesmo telefone (hash) duas vezes | **Aceito** ❌ (duplica lead) |
| Mesmo `meta_lead_id` duas vezes (webhook recebido duas vezes) | **Aceito** ❌ |
| Lead sem clínica | **Aceito** ❌ (lead órfão) |
| Lead sem data de entrada e sem canal | **Aceito** ❌ (fica fora da view semanal) |
| "Fechou" sem valor | **Aceito** ❌ (a receita fica subestimada; o Hub já marca "dado incompleto") |
| "Fechou" com compareceu = Não | **Aceito** ❌ (status fora de ordem) |
| Canal inválido | Bloqueado ✅ |
| Credencial expirada, API fora, atraso do fornecedor, retomada de workflow | Não testado: exige rodar o n8n. Nenhum workflow tem tratamento de erro configurado |
| IA passando para humano | Não verificado (Quaddro) |
| Backup e restauração (PITR) | Não verificado |

## 4. Falhas por prioridade

**P0 (bloqueiam a ativação)**
1. O webhook `sap-lead` do n8n não tem autenticação e aceita `clinica_id` vindo do corpo. Qualquer pessoa grava leads em qualquer clínica e manipula o filtro de duplicidade.
2. O segredo do webhook do ZapSign está em texto puro em 3 nós e nas execuções. Dá para forjar "contrato assinado".

**P1 (impedem uma etapa)**
3. Um token Meta CAPI para todos os pixels (workflows 2 e 10).
4. O D0 manda o placeholder `PREENCHER_EMAIL…` na mensagem de boas-vindas.
5. O ID do template do ClickUp está vazio e o modelo não está salvo como template.
6. O formulário da recepção é protegido só por PIN de 4 a 6 dígitos, sem limite de tentativas.
7. Não há credencial do Google Ads (investimento e conversões).
8. O status "não fechou" encerra a cadência (D16), o que derruba o follow-up e o KPI de conversão.
9. A entrada de leads da Meta está sem página/formulário e com a clínica em placeholder.

**P2**
10. O banco aceita leads duplicados por telefone e por `meta_lead_id`, leads sem clínica e status fora de ordem.
11. Pode haver envio duplo à Meta (workflow Status e o diário).
12. Nenhum workflow de erro; falhas ficam silenciosas.
13. ClickUp: recorrências inativas, sem responsáveis, sem status "Não se aplica", sem checklist de evidência.
14. Supabase: `roi_periodo` pode ser executada por anônimo (retorna vazio, mas não deveria ser executável). `search_path` não está fixado em 3 funções. A proteção contra senha vazada está desligada.

**P3**
15. Datas fixas no ClickUp, nome "D0–D90" com tarefas até o D120, palavra "Fundador" onde hoje é Condutor.
16. 5 tabelas com RLS ligado e sem política (ficam fechadas; só precisa ser documentado).

## 5. Correções propostas (todas pedem sua aprovação)

| # | Correção | Onde | Reversão |
|---|---|---|---|
| A | Revogar o EXECUTE de anônimo em `roi_periodo` e fixar `search_path` em 3 funções | Supabase (migração) | `grant execute … to anon` e `alter function … reset search_path` |
| B | Índices únicos parciais: (clinica_id, meta_lead_id) e (clinica_id, telefone_hash) onde não for nulo; `clinica_id not null`. Hoje há 0 leads, então não quebra nada | Supabase | `drop index`, `alter column … drop not null` |
| C | Checagem: "Fechou" exige compareceu = Sim | Supabase | `drop constraint` |
| D | Webhook `sap-lead` com autenticação por header e clínica resolvida pelo token, não pelo corpo | n8n (workflow desligado) | Restaurar a versão anterior pelo histórico do n8n |
| E | Trocar o segredo do ZapSign e passar a validação para credencial ou header | n8n + painel ZapSign | Versão anterior do workflow; o segredo antigo fica invalidado (sem volta, de propósito) |
| F | "não fechou" deixa de gravar "Encerrada" | n8n workflow 2 | Versão anterior |
| G | Um caminho só de envio à Meta + workflow de erro que avisa a equipe | n8n | Desligar o workflow de erro; versão anterior |
| H | Ligar a proteção contra senha vazada | Supabase Auth | Desligar no painel |

A, B, C e H são pequenos e reversíveis. D a G mexem em workflows desligados, então não têm efeito em cliente até a ativação.

### Aplicado em 16/10/2026 (aprovado pelo Fundador) e retestado

| # | O que mudou | Reteste | Reversão |
|---|---|---|---|
| A | `roi_periodo` sem EXECUTE para anônimo (segue para logado); `search_path` fixo nas 3 funções | anon = false, authenticated = true | Comentário em `supabase/migrations/20261019120000_sap_prontidao_integridade.sql` |
| B | Índice único (clinica_id, meta_lead_id); `clinica_id` obrigatório. **Telefone repetido continua permitido** (o n8n deduplica em 30 dias e o paciente pode voltar depois), então o índice de telefone proposto antes foi descartado | Meta repetido bloqueado; lead sem clínica bloqueado; telefone repetido aceito | Idem |
| C | Decisão só para quem não faltou | "Fechou" + faltou bloqueado; "Fechou" + compareceu aceito | Idem |
| D | n8n "SAP \| Lead → Tracker": webhook exige o header do "SAP Webhook Token"; a clínica vem só da Config (UUID validado) | Leitura do workflow; não executado | Restaurar versão `88b86ce7` |
| E | n8n "SAP \| Proposta aceita → Contrato → D0": o segredo foi apagado dos 3 Config; a assinatura é conferida em `GET /docs/{token}/` do ZapSign com a credencial "ZapSign API token" (o corpo do webhook não é mais confiável). Com isso, a URL cadastrada no ZapSign não precisa mais de `?segredo=` | Leitura do workflow; não executado | Restaurar versão `15748cdb` |
| F | n8n "SAP \| Status": "não fechou" e "pensando" ficam com cadência **Ativa**; "Encerrada" só quando vier explícito. "Fechou", "não fechou" e "pensando" gravam compareceu = Sim | Leitura do workflow; não executado | Restaurar versão `4a851aff` |
| G | Um caminho só para a Meta: clínica com a fila do CRM ligada (`conversoes_meta`) envia só pelo workflow diário. Workflow de erro "SAP \| Avisar falhas" criado (avisa o grupo da equipe no WhatsApp) | Criado; **falta publicar** | Arquivar o workflow |
| H | Proteção contra senha vazada | **Pendente: ligar no painel do Supabase (Auth → Settings)** | Desligar no painel |

**Pendente com você:** publicar o "SAP | Avisar falhas" (n8n bloqueia apontar o workflow de erro para um workflow não publicado; ele só roda quando outro falha e não dispara nada sozinho). Depois disso eu ligo o aviso de erro nos 10 workflows SAP. Também falta ligar o item H no painel.

## 6. Dependências de fornecedor (sem confirmação técnica)
- Quaddro: API, janela de envio, passagem para humano, webhooks. Tudo "[a confirmar]".
- Meta: token de sistema do BM com acesso a todos os pixels e test_event_code para o teste 19.
- Google Ads: developer token + OAuth.
- ZapSign: troca do segredo do webhook.
- ClickUp: salvar o template (feito na interface; a API não salva template de pasta).

## 7. Matriz de prontidão

| Componente | Estado | Testado? | Evidência | Problema | Próxima ação |
|---|---|---|---|---|---|
| Hub (telas SAP) | Aprovado em produção | Sim | Smoke 54/54 rotas (375 e 1280 px); testes automatizados | — | — |
| Supabase: isolamento/RLS | Aprovado em teste | Sim | Usuário de outra clínica: 0 linhas, escrita bloqueada | — | — |
| Supabase: integridade de leads | Testado com falhas | Sim | §3 | Duplicados e órfãos aceitos | Correções B e C |
| Supabase: segurança geral | Testado com falhas | Sim | Advisors | `roi_periodo` anon, search_path, senha vazada | A e H |
| Supabase: backup | Não verificado | Não | — | — | Conferir o plano/PITR no painel |
| n8n 1 Lead → Tracker | Testado com falhas (leitura) | Não executado | Auditoria | P0 webhook aberto | D |
| n8n 2 Status → conversões | Testado com falhas (leitura) | Não | Auditoria | Token único, D16 | F + token por pixel |
| n8n 3 Alerta semanal | Configurado, mas não testado | Não | — | Sem workflow de erro | G |
| n8n 4 D0 onboarding | Bloqueado | Não | Placeholders | Mensagem errada ao cliente | Preencher e-mail e template |
| n8n 5 Lembretes | Bloqueado | Não | Depende do 4 | — | — |
| n8n 6 Formulário recepção | Testado com falhas (leitura) | Não | PIN fraco | P1 | Basic Auth + PIN longo |
| n8n 7 Investimento Google | Bloqueado | Não | Sem credencial | P1 | Credencial Google Ads |
| n8n 8 Resumo semanal | Configurado, mas não testado | Não | — | — | Teste com número interno |
| n8n 9 Contrato → D0 | Testado com falhas (leitura) | Não | Segredo exposto | P0 | E |
| n8n 10 Conversões diárias | Testado com falhas (leitura) | Não | Token único | P1 | Token por pixel |
| ClickUp | Configurado, mas não testado | Não | 94 tarefas | Não é template | Salvar como template |
| Quaddro / WhatsApp | Não verificado | Não | — | — | Confirmação técnica do fornecedor |
| Meta CAPI | Bloqueado | Não | — | Token e test code | Token de sistema |
| Google Ads | Bloqueado | Não | — | Sem credencial | Credencial |
| Drive (pasta automática) | Bloqueado | Não | — | Depende do D0 | — |

## 8. Go / no-go
- [ ] P0 1 e 2 corrigidos (feito em 16/10) e retestados numa execução de teste (falta)
- [x] Correções B e C no banco (duplicados e status), retestadas
- [ ] Workflow de erro publicado e ligado nos 10 workflows
- [ ] Token Meta por pixel ou de sistema, testado com test_event_code
- [ ] D0 sem placeholders, testado com um e-mail interno
- [ ] Template do ClickUp salvo e ID preenchido
- [ ] Workflow de erro ligado e testado
- [ ] Cadência "não fechou" corrigida (D16)
- [ ] Quaddro: janela de envio e passagem para humano confirmadas
- [ ] Backup do Supabase confirmado
- [ ] Teste ponta a ponta com número interno autorizado, etapas 1 a 20

**Decisão hoje: NO-GO para ativar automações.** O Hub e o banco podem continuar em uso manual, como já está.

## 9. Nota de prontidão: 5/10 (era 4 antes das correções A–G)
- Hub e banco: firmes (isolamento comprovado; indicadores batem).
- Automações: nenhuma foi executada, 2 falhas críticas e 7 altas, sem tratamento de erro.
- Fornecedores: nenhum confirmado tecnicamente.
