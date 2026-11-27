# Acompanhamento semanal

Área interna em `/admin/acompanhamento`. Acesso restrito aos administradores existentes. Mantém revisão, fontes, transcrição, propostas, execução e resultados por cliente.

Na reunião, abra a ficha, confira o período e registre a leitura de leads. Registre decisões em Reuniões ou importe TXT, MD, DOCX, VTT ou SRT. Salve. A IA consulta a revisão atual e as três anteriores e identifica as referências utilizadas. As sugestões entram como propostas e precisam de responsável, prazo e critério de conclusão.

A consulta às fontes usa as funções existentes de Instagram e CRM. Cobertura incompleta e unidades diferentes devem ser conferidas antes de interpretar os números. Os cliques e o conteúdo das publicações só fazem parte da análise quando registrados nas fontes da ficha. O módulo não busca novamente cada publicação ou o Short.io ao abrir a página.

Para usar ClickUp, configure `CLICKUP_API_TOKEN` exclusivamente no servidor, escolha o ID da lista, confirme os campos da ação e salve. O envio registra uma intenção única por ação. Falhas sem confirmação bloqueiam reenvio automático para evitar duplicação. A opção Copiar tarefa inclui objetivo, ação, responsável, critério, fontes e referência interna. O responsável em texto não atribui automaticamente um usuário do ClickUp e a conclusão não sincroniza de volta.

A IA reutiliza o provedor do Nexo. Configuração do servidor exige `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e ao menos uma das chaves de IA existentes. A migração `20261127183304_acompanhamento_revisoes.sql` cria somente duas tabelas e suas políticas. Dados reais das fichas são gravados diretamente no banco e não constam do repositório público.

Validação local cobre datas, fontes, isolamento por papel, edição concorrente e unicidade de envio. O teste de navegador em `tests/e2e/acompanhamento.spec.ts` usa dados fictícios e transporte isolado. O TypeScript geral já apresenta falhas em testes antigos e dependências do worker criativo; a nova área não acrescentou erro de tipagem.

## Relatório semanal em PDF e prévia digital

No topo de Acompanhamento, use Relatório semanal, escolha o período e confira os clientes selecionados. O botão Baixar PDF consolida as fichas salvas em um resumo da carteira, decisões para o Douglas e fichas por cliente, com ações e links. Clientes sem revisão no período permanecem visíveis com aviso. Fichas anteriores são identificadas; revisões futuras não entram no corte. O período das métricas aparece separado da data da revisão.

A equipe preenche o balanço da semana, acertos, problemas, anúncios, cliques e decisão necessária do Douglas. Campos vazios viram pendências explícitas. O relatório não presume desempenho a partir de um campo vazio. O texto já registrado nas fichas antigas é preservado. A geração é solicitada pelo usuário e não coleta dados novos nem faz envio automático. As fontes tipográficas estão incluídas no aplicativo para preservar acentos, setas e números no PDF sem depender de serviços externos.
