# Inteligência Comercial 360° — Fase 1

Implementação isolada em `codex/inteligencia-comercial-360`, baseada em `157aa785010338fc7030e5d4799e576d893d242f`, da branch `claude/doctor-creator-hub-nixvw6`. Referência remota conferida antes e depois do desenvolvimento. Nenhum deploy, merge, alteração de dados ou configuração foi executado em produção.

## Estado encontrado

A inspeção de código e consultas agregadas somente de leitura, em 18/10/2026, encontraram 56.532 registros ativos de CRM em 16 conexões e 35.316 conversas. Estes volumes são um retrato da consulta, não um total permanente nem pessoas únicas.

| Fonte | Dados observados | Situação e dependências |
| --- | --- | --- |
| Kommo | 37.778 oportunidades; 31.609 conversas | Sync, webhook, histórico de etapas e importador existentes. Mensagens de saída podem ter apenas metadados. Token, escopo e webhook continuam necessários; não foi feita nova chamada ao fornecedor nesta entrega. |
| Clint | 7.441 oportunidades | Conector existente com origens configuráveis. Não há confirmação de API pública de mensagens. |
| FlwChat | 9.048 oportunidades | Importador existente; `sessionId` permite associação direta com WTS quando a origem está identificada e há um único negócio candidato. |
| Digisac | 1.916 oportunidades; 252 conversas | Contatos/tickets/mensagens existentes. O importador mantém bloqueio de origem ambígua em contas compartilhadas; novas sessões guardam conexão e provedor. |
| RD Station | 129 oportunidades | Conector de negócios existente; mensagens não foram homologadas. |
| WTS | 3.455 conversas | Importação e indicadores existentes, com divisão por equipe. Tokens e recorte de departamentos continuam necessários. |
| Planilha | 220 registros | Entrada manual existente, mantida como fonte própria. |
| Instagram / Meta Ads / Windsor | Dados e rotinas existentes | Não foram refeitos. Os registros de sync mostraram um erro de CRM e 15 registros de Instagram com erro persistido; isso exige diagnóstico por fonte e não comprova indisponibilidade de todas as APIs. |
| Feegow / Ninsaúde | Somente planejamento/cadastro no catálogo | Não há conector administrativo homologado nesta entrega. |
| Clínica nas Nuvens | Sem conector identificado | Documentação, contrato de API, credencial e viabilidade serão avaliados na Fase 3. |

Dados existentes e último sucesso de sincronização demonstram coleta anterior, não completude atual ou funcionamento integral de cada API. Nenhum fornecedor foi marcado como homologado só por possuir registros.

Foram reaproveitados `crm_leads`, `crm_lead_eventos`, `crm_connections`, `crm_pipeline_statuses`, `crm_etapa_kpi`, `conversas`, `mensagens`, `wts_sessions`, `sync_status`, `acessos_conversas`, a rota Jornada e o catálogo centralizado. O histórico `toques`/`pessoas` foi preservado como leitura legada. Coortes, auditoria comercial, Oportunidades, Brand Brain, agentes, anúncios, conteúdo e SAP permanecem na base original. As estruturas de ações `operacao_recuperacao`/`operacao_historico` e as tarefas do SAP foram identificadas para reaproveitamento na Fase 2, sem criar outra ferramenta de tarefas.

## O que foi implementado

- `jornada_vinculos`: uma associação por conversa, com cliente, conexão, IDs estáveis, método, referência de evidência e estado. Não mescla pessoas por nome, telefone ou e-mail.
- Registro por servidor de referências recebidas nos eventos do Kommo; associação FlwChat↔WTS por `sessionId`; associação Digisac por ticket, contato e conexão explícitos.
- Idempotência e lock transacional por clínica. Evidências contraditórias deixam o vínculo em conflito; uma tentativa posterior não o reaprova silenciosamente.
- Revalidação na leitura: troca de ID, exclusão na origem, perda da mensagem de referência ou múltiplos candidatos deixam de contar como associação verificada.
- Provedor/conexão nas novas sessões e conexão nas conversas Kommo/Digisac. Colisões de IDs entre contas são bloqueadas, preservando a origem já registrada.
- RPC de qualidade por clínica, período e página, com preenchimento, cobertura, histórico disponível, vínculos e limitações. Último sucesso compartilhado do CRM é apresentado como compartilhado, sem certificar uma conexão individual.
- Linha do tempo administrativa por oportunidade: entrada no CRM, mudanças observadas, conversa e primeira saída armazenada. A leitura registra acesso e não devolve texto de mensagens, nome, telefone, e-mail ou prontuário.
- Interface na Jornada, com paginação, detalhe, estados de erro e contrato de resposta validado. Comparações antigas ficam acessíveis na seção legada. O catálogo central liga à conferência de qualidade.

As novas leituras exigem membro/admin da clínica **e** contrato Nexo (`hub`). Um contrato exclusivamente SAP não concede essas RPCs. A navegação Jornada conserva sua visibilidade administrativa existente; a leitura técnica foi testada também com membro autorizado. Escritas de associação são exclusivas do servidor. As chaves compostas protegem cliente, conexão, lead e conversa mesmo com `service_role`.

## Definições e limites de interpretação

O período seleciona a **coorte de entrada no CRM**. Desfechos e conversas mostram o estado observado atualmente, não uma reconstrução histórica do estado no último dia do filtro. Quando a data de origem falta, o recebimento serve apenas para inclusão no período e a lacuna é sinalizada.

`com_conversa_verificada` conta oportunidades distintas com associação ainda válida. `com_saida_observada` exige mensagem de saída armazenada, sem inferir atendimento humano ou qualidade. O `sessionId` comprova uma associação de registros; não comprova a origem de marketing.

`sinal_agendamento_crm` usa somente uma etapa explicitamente mapeada pela equipe em `crm_etapa_kpi`. Negócio ganho não vira agendamento automaticamente nesta leitura. O valor dos negócios ganhos é a soma dos valores disponíveis no CRM; ausência de preço é contada à parte. Não se afirma que seja receita contratada, faturada, recebida ou lucro. Comparecimento e receita atribuída permanecem **indisponíveis**, sem converter ausência em zero. Não são calculados ROI, ROAS ou CAC de pacientes.

A origem registrada no CRM é declarada pela fonte; uma referência de link em conversa não é promovida a aquisição direta ou receita atribuída. Associações antigas por pessoa/telefone ficam fora das contagens verificadas. Não há deduplicação entre CRMs sem uma evidência explícita. Uma conversa relacionada a vários negócios entra como conflito, sem escolher arbitrariamente um deles.

## Migração e infraestrutura

`supabase/migrations/20261022180001_commercial_journey_evidence.sql` foi criada com o Supabase CLI e ordenada após a última migração da base. Acrescenta duas tabelas, uma view interna com `security_invoker`, quatro RPCs, duas funções de gatilho e dois gatilhos de proteção de origem, índices, RLS, grants restritos e referências compostas. É reaplicável sem apagar histórico. A interface não ganhou novas funções HTTP: os 12 handlers existentes da Vercel foram preservados. O processamento desta fase é consulta e associação no PostgreSQL; não há mídia pesada, IA ou novo serviço pago.

Na homologação, o MCP registrou a migração como `20261018170603 commercial_journey_evidence`. Ajustes de homologação foram exercitados via SQL e consolidados no arquivo versionado. O catálogo da branch já tinha histórico diferente do repositório e status de preparação `MIGRATIONS_FAILED`, embora o banco esteja acessível. **Não executar `db push` cego**, reset ou conciliação automática. A entrega de produção deve comparar catálogo, histórico e dependências e aplicar primeiro a migração, depois o aplicativo. As rotinas atualizadas gravam colunas novas e dependem desse primeiro passo.

Não houve backfill global de identidades. As sessões antigas sem origem ficam desconhecidas até conferência por fonte. O pipeline continua preservando os dados quando uma conferência de vínculo falha; a falha é sinalizada. Não há escrita nos CRMs externos, envio de mensagens ou publicação de conversões por esta fase.

## Evidências e testes

O piloto real utilizou a clínica já autorizada na homologação, com **40 oportunidades FlwChat, uma conversa WTS, uma sessão e 43 metadados de mensagens**. Foram omitidos nomes, telefones, e-mails, texto e dados clínicos. Sem origem de sessão confirmada, a reconciliação retornou zero; após conferir no recorte o `provider` WTS e o `sessionId` exato e único, retornou um vínculo. Nenhum vínculo em produção foi promovido. Os 40 registros sem origem permaneceram sem atribuição.

Com usuário autenticado restrito à clínica, a RPC respondeu em aproximadamente 194 ms na primeira execução registrada e exibiu três eventos reais. A conversa precede a entrada do negócio no CRM; a linha do tempo mantém as datas recebidas sem inventar uma sequência. As mensagens do recorte são explicitamente parciais. O piloto valida associação e apresentação de metadados já coletados; **não homologa uma nova chamada às APIs externas** nem a cobertura completa da clínica.

- `npm run check`: 86 scripts passaram, além de secrets check, lint e TypeScript.
- PostgreSQL embarcado: replay de 131 migrações, dez cenários novos de jornada e 65 cenários de segurança da base; inclui anon, viewer, editor, admin, service_role, SAP exclusivo, conflitos, idempotência, minimização, soft-delete, paginação, proveniência e colisão de origens.
- Navegador: 156 regressões de rotas/integrações passaram. Os três cenários novos da jornada passaram na execução final, incluindo 375/1280 px, WCAG A/AA, paginação, detalhe e indisponibilidade de fonte. A primeira execução identificou e permitiu corrigir uma região rolável sem foco de teclado.
- Build de produção executado pelos testes. A base ainda emite o aviso preexistente de chunks maiores que 500 kB; não é uma validação de capacidade de produção.
- Navegador real: painel e abertura do registro vinculado conferidos contra a homologação, sem fixture de resposta.
- Advisors do Supabase consultados. Os avisos de [RPCs SECURITY DEFINER acessíveis a usuários autenticados](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) incluem as duas leituras intencionais desta entrega; seus gates por clínica/contrato, grants e payload minimizado foram testados. Permanecem avisos anteriores de tabelas internas sem policy de cliente e proteção de senha vazada desabilitada. Não foram alteradas configurações de autenticação.

Reproduzir o piloto somente com os arquivos locais protegidos já existentes:

```sh
npm run check
npx playwright test tests/e2e/commercial-journey.spec.ts
npx tsx scripts/commercial-pilot-report.ts --out=work/commercial-pilot-report.json
```

O script de piloto recusa outro hostname de Supabase e não inclui credenciais em logs ou relatórios. Não registra novamente dados de produção nem chama APIs de CRM.

## Próximas entregas

1. **Fase 2:** usar os vínculos para melhorar permanência por etapa, responsáveis, próxima ação, filas sem resposta e diagnóstico contextual; integrar ações às estruturas existentes e registrar resultado observado. A qualidade atual não basta para inferir ausência de resposta humana ou motivo de perda.
2. **Fase 3:** escolher um fornecedor realmente usado por uma clínica e homologar documentação, credencial, escopos administrativos, limites e condições comerciais antes do primeiro conector de agenda somente leitura. Não importar prontuário.
3. **Fase 4:** eventos de agendamento/comparecimento e valores contratados/faturados/recebidos separados; atribuição por evidência, fórmulas e deduplicação de transações. Sem esses dados, métricas financeiras continuam indisponíveis.
4. **Fase 5:** ampliar os agentes existentes com consultas comerciais minimizadas e respostas que incluam evidência, período, lacunas, ação e avaliação. Não executar ações externas automaticamente.

A Fase 1 entrega a base funcional de qualidade e associação. A jornada completa até retenção e receita e a homologação de todos os fornecedores ainda não estão concluídas.
