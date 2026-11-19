# Operação verificável: Nexo e SAP

Entrega de 18/10/2026. Complementa os documentos históricos de auditoria; Nexo e SAP são produtos com contratos e entradas separados. O administrador tem visão dos dois. Sem contrato registrado, permanece a compatibilidade de Nexo para clientes antigos; quando há contratos explícitos, somente os módulos concedidos ficam ativos.

## Nexo: acompanhamento assistido de oportunidades

A proposta é uma detecção, não uma ação executada. Ao assumir, um editor (admin, owner ou strategist da clínica) vira responsável, escolhe prazo e abre um trabalho único. O sistema revalida desde a detecção original: resposta, avanço, perda ou intervenção anterior à aprovação impedem que um caso volte indevidamente à fila de contato.

O contato é realizado pela equipe. O vínculo deve apontar para uma mensagem sincronizada da mesma clínica/conversa, posterior à aprovação e anterior ao avanço observado. O provedor confirma o registro; a autoria humana é declarada e auditada pela equipe. Copiar um rascunho não comprova envio. Robôs conhecidos são excluídos, sem presumir que todas as demais saídas sejam humanas.

Os estados são contato a realizar, aguardando resposta, bloqueio de fonte, revisão da equipe, caso avançou e encerrado. A rotina agendada e a conferência manual observam os fatos; resposta/avanço interrompem a cadência, mas o caso continua em observação para eventos posteriores. Prazo vencido ou outra ação da equipe exige revisão. Não há repetição automática de mensagens. A revisão pode ser assumida por outro editor com novo prazo, preservando o histórico.

A atualidade exige coleta completa das mensagens do caso e CRM dentro de 36 horas. Sincronização de sessões não comprova ingestão de mensagens. WTS/Digisac registram cobertura por conversa e priorizam casos ativos; paginação aberta, retorno ambíguo e falha de persistência bloqueiam a cobertura. Kommo só declara cobertura quando a leitura dos eventos chega ao cursor atual sem erro ou limite de paginação. Este piloto não promete tempo real.

Agendamento, comparecimento e venda são eventos distintos. Agendamento vem de etapa explicitamente mapeada no CRM; nem lead ganho nem interpretação da IA viram consulta agendada. Venda não confirma recebimento financeiro. Resultados posteriores não demonstram causalidade do agente. Lições de recuperação passam a usar somente contatos vinculados. O histórico legado da medição é preservado; feitos automáticos recentes sem decisão humana voltam à revisão.

As tarefas e seu histórico têm RLS por clínica e módulo. Não há escrita direta por usuários. O acesso pontual às mensagens registra usuário, clínica e conversa; viewers não executam ações. A conferência processa lotes com carimbo separado para não deixar casos mais novos sem atendimento. A janela de acompanhamento é de 30 dias; encerrar não apaga o histórico.

## SAP: acessos críticos até o marco 5

A reconferência cria ou atualiza nove ações nativas, com código estável por clínica e acesso. Elas alimentam o marco existente, sem duplicar a pendência como ação avulsa da call. Responsáveis vêm de Quem é quem; prazos seguem D7, pausas, finais de semana e os feriados do calendário do programa. Falta de D0 ou pessoa atribuída permanece explícita.

Confirmação exige data, responsável e ausência de revogação. Dispensa exige justificativa. A mesma regra vale no checklist, cronograma, motor e banco. Revogação reabre ação e marco com histórico.

O fluxo confere a tarefa exata vinculada ao marco no ClickUp, a pasta da clínica e o estado fechado. Sem token/vínculo/pasta ou com tarefa aberta, permanece aguardando com motivo. O piloto não comenta nem altera tarefas externas. Aprovar o rascunho de cobrança registra apenas aprovação, sem afirmar envio.

A aprovação de conclusão é vinculada à execução, clínica, cliente, passo, rodada e evidência. O banco trava os registros, relê acessos e recusa cancelamento, prova antiga, troca de vínculo ou aprovação consumida cujo efeito foi desfeito. Repetição de uma aprovação ainda vigente não duplica histórico. A conclusão indica o próximo passo: conferir kickoff, formulário e baseline para preparar a Sessão 1.

## Motor e verificação

O motor confirma persistência antes de avançar. O cache novo guarda transição, contexto, destino, resultado e custo; cache legado incompleto pausa para conferência. Timers são limpos em todos os caminhos. A marcação SAP e a criação/vinculação de casos têm proteção própria no banco. Não há promessa de execução exatamente uma vez para todos os efeitos históricos do motor quando o próprio registro do efeito falha.

- `npm test`: regras de produto, motor, retomada e provedores fictícios.
- `scripts/verify-nexo-interface.mjs`: navegação, perfis, acessibilidade, celular, contatos vinculados e pendências SAP com respostas interceptadas.
- `supabase/tests/operacao_verificavel.sql`: testes reais de banco, permissões e fluxo, com dados fictícios e rollback. Executar exclusivamente em banco de teste.

A migração aditiva `20261022090000_acompanhamento_verificavel.sql` é aplicada primeiro ao ambiente de teste. Ela não envia mensagens, conversões ou campanhas. Depois dos checks, aplicar somente essa migração à produção e publicar o código pela integração Git/Vercel. A branch Supabase de teste contém uma base específica para homologação e não deve ser mesclada integralmente em produção. Preview e Production mantêm suas próprias configurações.

## Limite desta entrega

São dois pilotos operacionais, com contato humano e decisão supervisionada. Integração de agenda, envio automático a pacientes, alteração de mídia, pagamento conciliado e retorno de conversões exigem suas próprias integrações, autorizações e testes. Nenhuma dessas capacidades é ativada por esta entrega.

## Atualização de 22/10/2026: central de atendimento

A rota `/$clientId/central-atendimento`, em Comercial, reúne fila, histórico, responsável e situação. A clínica começa pelos números de conversas em aberto, sem resposta, sem responsável e aguardando retorno. Admin, owner e strategist podem operar; viewer não recebe históricos pela nova RPC. Os acessos às conversas são auditados. O filtro de relatório do cabeçalho não limita a fila operacional.

O vínculo com Contatos e oportunidades reutiliza o contato e o cartão existentes. Criar uma oportunidade exige o piloto CRM ativo e não altera os registros do CRM externo. O endereço `crm-contatos?card=<uuid>` abre o cartão com a autorização da própria clínica. Nenhuma etapa do funil é movida automaticamente por esta central.

O transporte implementado recebe webhooks oficiais da Meta e envia respostas manuais de texto. Os dois endereços públicos usam rewrites para a função HTTP existente, respeitando o limite de 12 funções do plano Hobby. Os handlers mantêm autenticação independente, e o webhook lê o corpo bruto antes de qualquer desserialização. O servidor verifica HMAC SHA-256 sobre os bytes originais, roteia pela conta externa conectada e deduplica IDs de mensagens. Contas desconhecidas não geram registros. Mensagens não textuais aparecem como indicação para conferência no aplicativo; não há envio ou reprodução de anexos nesta versão. O histórico recebido desde a ativação permanece marcado como parcial, sem inventar cobertura anterior.

O envio só usa uma conversa que chegou pelo canal oficial e com mensagem de entrada nas últimas 24 horas. Histórico importado permanece para consulta. O pedido tem UUID persistente; apenas uma requisição reivindica o envio. Não há repetição automática de POST à Meta. Timeout, falha de rede, erro 5xx ou ausência de ID de confirmação deixam o envio incerto e bloqueiam outro envio até conferência. Recibos não rebaixam uma mensagem já lida para enviada. Uma resposta apenas preparada pode ser descartada por outro operador com justificativa auditada; a trava do banco impede descartar se o envio já começou. Confirmação manual fica identificada como declaração da equipe, com justificativa auditada.

### Ativação assistida dos canais

Publicar o código não conecta contas Meta. Antes de operar com pacientes, a equipe deve concluir o aplicativo, permissões e teste com destinatário autorizado:

1. Identificar o aplicativo Meta destinado ao Nexo e a empresa que o administra. Aprovar os produtos e permissões necessários, respeitando a revisão da Meta para contas de outras empresas.
2. Configurar no servidor `NEXO_META_APP_ID`, `NEXO_META_APP_SECRET`, `NEXO_META_VERIFY_TOKEN` e `NEXO_CHANNELS_ENCRYPTION_KEY` (32 bytes aleatórios em hexadecimal). Nunca usar prefixo `VITE_` nesses segredos. `META_GRAPH_API_VERSION` é opcional; padrão `v23.0`. Para o Instagram Login, configurar também `NEXO_INSTAGRAM_APP_SECRET` (chave do app do Instagram exibida em “Configuração da API com login do Instagram”), porque a Meta assina esses eventos com ela e não com a chave do app Meta.
3. Cadastrar `https://dash.doctorcreator.com.br/api/atendimento/meta-webhook` e o token de verificação no aplicativo. Assinar mensagens de WhatsApp Business e Instagram.
4. Em Canais e conexão, validar o telefone dentro da WABA e conectar com token de `whatsapp_business_messaging` e `whatsapp_business_management`. Para Instagram Login, validar `user_id` em `/me` e usar `instagram_business_basic` e `instagram_business_manage_messages`. Tokens ficam cifrados com AES-256-GCM, AAD de clínica/canal/conta, IV aleatório e autenticação; nunca retornam pela RPC de configuração.
5. Conferir o primeiro evento real de uma conta de teste autorizada. Até esse evento, a tela mostra “aguardando primeiro evento”, sem afirmar conexão operacional. Conferir recebimento, resposta, recibo, repetição do webhook e desconexão. Não usar contatos reais para homologação.

Conexão com um clique, modelos para iniciar conversas fora da janela, anexos, importação retroativa e secretária autônoma não fazem parte desta etapa. A tela informa a ativação pendente quando faltam segredos do aplicativo; não gera dados demonstrativos em produção.

Validação: `test-central-db.ts` executa todas as migrações em banco local e verifica clínicas, papéis, conflitos de versão, janela, repetição, CRM, recibos e paginação. `test-central-meta.ts` usa transportes fictícios para validar criptografia, assinatura, autorização, hosts, falhas e envio idempotente. `central-atendimento.spec.ts` cobre operação no computador/celular, acessibilidade, consulta importada, envio incerto, viewer e indisponibilidade. Testes interceptados não comprovam aprovação nem entrega real da Meta; essa homologação depende da ativação descrita acima.
