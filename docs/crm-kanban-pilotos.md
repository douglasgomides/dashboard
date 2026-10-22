# Kanban operacional dos pilotos

O quadro fica em Comercial → Contatos e oportunidades, em /<clientId>/crm-contatos.
A liberação é por clínica em crm_operacional.pilotos. O padrão é desligado.
Nenhum contato ou lead existente é convertido automaticamente. A equipe seleciona um contato da base (telefone mascarado), ou cria uma oportunidade manual.

## Operação
- Etapas: Novo contato → Em atendimento → Demonstrou interesse → Quer agendar → Agendado; Encerrado para finalizar.
- Abrir o cartão permite definir responsável, próxima ação e prazo. Arrastar para outra coluna abre a confirmação; o seletor oferece a mesma operação no celular e teclado.
- A movimentação registra autor, motivo, antes/depois e versão na mesma transação. A última movimentação pode ser desfeita se não houver alteração posterior.
- A versão impede que uma edição antiga sobrescreva outra. Uma conversa só pode ter um cartão neste piloto.
- A listagem é paginada (50), com contagens do quadro inteiro. O período do relatório não filtra o estoque operacional.

## IA supervisionada
O botão usa o resumo por IA existente em /api/sync/manual e depois pede uma sugestão ao banco.
Uma sugestão não movimenta cartões. Exige leitura atualizada, cobertura completa, conversa comercial sem alerta, evidência literal conferida e avanço de etapa.
O resultado “agendou” do resumo gera somente “Quer agendar”. O agendamento precisa de confirmação humana.
A aprovação verifica novamente versão, validade de 24h e última mensagem. Não há envio de WhatsApp, mudança no CRM externo, confirmação de presença ou faturamento.

## Dados e acesso
A operação mora em esquema privado, com RLS e sem acesso direto do navegador às tabelas.
A RPC verifica sessão e vínculo com a clínica. Admin/owner/strategist podem editar; viewer só consulta.
Os dados importados de pessoas, crm_leads, conversas e mensagens não são reescritos pelo Kanban.
O teste PostgreSQL descartável e os testes de navegador usam apenas clínicas, pessoas e mensagens fictícias.
