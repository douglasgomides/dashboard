# Kanban operacional dos pilotos

O quadro fica em Comercial → Contatos e oportunidades, em /<clientId>/crm-contatos.
A liberação é por clínica em crm_operacional.pilotos. O padrão é desligado.
Nenhum contato ou lead existente é convertido automaticamente. A equipe seleciona um contato da base (telefone mascarado), ou cria uma oportunidade manual.

## Operação
- Etapas: Novo contato → Em atendimento → Demonstrou interesse → Quer agendar → Agendado; Encerrado para finalizar.
- Abrir o cartão permite definir responsável, próxima ação e prazo. Arrastar para outra coluna abre a confirmação; o seletor oferece a mesma operação no celular e teclado.
- A movimentação registra autor, motivo, antes/depois e versão na mesma transação. A última movimentação pode ser desfeita se não houver alteração posterior.
- A versão impede que uma edição antiga sobrescreva outra. Uma conversa só pode ter um cartão neste piloto.
- A abertura mostra “Para hoje e atrasadas”, calculado no banco pelo dia de Brasília. A equipe pode ver todas, atrasadas ou sem próximo passo, filtrar responsável (inclusive “Minhas oportunidades”) e etapa.
- As três prioridades numéricas são da clínica inteira; as contagens das colunas seguem os filtros do quadro. Agendados/encerrados ficam fora das pendências.
- Cada coluna tem sua própria paginação (12), mantendo visíveis oportunidades das outras etapas. Os prazos mais próximos aparecem primeiro; a atualização em tela ocorre a cada 30 segundos.
- O responsável é escolhido entre membros com permissão de edição da clínica ou o administrador atual. A atribuição grava o ID do usuário; nomes legados não são vinculados por semelhança.
- “Contatos sem oportunidade” é uma fila de leitura dos contatos com conversa importada e sem cartão anterior. Abrir, pesquisar ou escolher um contato não cria nada. “Criar oportunidade” confirma a inclusão; a fila é atualizada depois. Não há importação em massa nem alteração dos contatos/conversas existentes.
- O painel importado passa a se chamar “Funil comercial · resultados” apenas para os pilotos e oferece acesso ao quadro operacional. Nenhuma sincronização bidirecional foi adicionada.
- O período do relatório não filtra o estoque operacional. O prazo representa a próxima ação, não o horário de consulta.

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

## Limites e próximos passos
Esta versão oferece prioridades dentro da ferramenta; não envia notificações fora dela. A fila depende dos contatos e conversas já importados, e não resolve automaticamente conversas sem pessoa vinculada.
A IA permanece supervisionada, com cobertura completa exigida. A integração da agenda, novas mensagens de WhatsApp, automação de mudanças de etapa e Google Ads/Perfil da Empresa são entregas seguintes.
A migration deste PR foi revisada antes de qualquer publicação em produção; o ALTER ADD COLUMN IF NOT EXISTS permite atualizar a homologação que recebeu a versão inicial. Não houve ativação das clínicas piloto nem mudanças nos registros reais durante os testes.
