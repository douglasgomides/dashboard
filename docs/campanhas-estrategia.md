# Campanhas com estratégia online e presencial

O fluxo existente `campanhas_estrategia` passa a produzir um plano integrado de aquisição e um de relacionamento, em vez de dez sugestões curtas. As novas execuções usam o modelo forte já configurado no Agentic Core, com o teto de custo da execução preservado. O agendador não foi alterado.

## Conteúdo exigido

Cada plano exige diagnóstico, hipótese a testar, objetivo, posicionamento/oferta, referências às fontes lidas e lacunas. A execução exige pelo menos uma ação online e uma presencial, com público, entrega, papel responsável a atribuir, momento, mensagem para revisão, rastreio, próximo passo e dependências. Presencial pode incluir recepção/experiência da consulta, parceiros ou eventos quando viáveis, sem presumir autorização ou parceria existente.

A jornada precisa conter captação, atendimento, agendamento, consulta e continuidade, cada uma com conduta administrativa/comercial, papel e registro. Exige preparo, teste e revisão com critério de avanço, recursos a orçar e aprovar, três indicadores com fórmula/fonte/frequência/regra de decisão e riscos.

Papéis e prazos são propostos, não atribuições já feitas. Valor estimado não é orçamento aprovado. Não se cria evento externo, tarefa duplicada, anúncio ou mensagem ao aprovar o cartão. A execução e o resultado continuam no acompanhamento da campanha existente; o plano pode ser copiado integralmente.

## Dados e validação

O catálogo de evidências é montado no servidor a partir da ficha, Brand Brain e dados agregados consultados para a clínica. O modelo só pode referenciar identificadores desse catálogo. As evidências exibidas são reconstruídas pelo servidor, com período e limitações, em vez de confiar nos números escritos pelo modelo. A validação estrutural não garante a veracidade de toda hipótese ou copy: revisão da equipe continua necessária.

O diagnóstico observado e o porquê do cartão são reconstruídos de fatos do catálogo no servidor; o texto do modelo permanece apenas como hipótese/plano. O contexto diferencia coorte por criação, estado atual de ganho e valor das oportunidades. Não afirma receita recebida, comparecimento ou causalidade sem as fontes. Comentários/conversas não são exportados como identificadores de pacientes. As mesmas barreiras de dados pessoais e revisão de copy existentes continuam valendo. A crítica recebe o plano completo dentro do limite de contexto, e não apenas título/mensagem. O agente escolhe códigos de indicadores distintos de um catálogo do servidor; as fórmulas e fontes são reconstruídas pelo código. O tempo de resposta é primeira resposta menos primeira mensagem recebida, e ganho no CRM não vira agendamento ou comparecimento. Restrições na descrição interna da oferta não são confundidas com copy publicitária; mensagens públicas de cada canal continuam passando pela verificação existente.

Se nenhuma proposta passar pela validação, a execução falha com motivo; não termina com sucesso aparente e biblioteca vazia. O transporte normaliza um risco textual para uma lista de um item sem inventar conteúdo. Os passos resumidos da tabela antiga são derivados das fases do plano, evitando duas sequências divergentes.

## Persistência e compatibilidade

A migration `20261023103100_campaign_strategy_on_off.sql` acrescenta apenas `campanhas_ideias.estrategia`, JSONB anulável, com versão e limite de 64 KiB. A estrutura completa é validada no servidor. Permissões e RLS existentes não são ampliados. Nexo/Campanhas e SAP/Mídia continuam usando seus acessos e o componente existente.

A migration foi criada pelo CLI e ordenada após as dependências já presentes na branch. Aplicar somente esta mudança aditiva ao ambiente escolhido; não reconciliar nem mesclar integralmente a branch de teste com produção. A homologação recebeu a coluna; produção não foi alterada.

Ideias antigas permanecem com texto, evidências, passos, estados e resultados; a interface indica que não possuem plano completo. Execuções antigas que já leram contexto mantêm o contrato legado. A seleção de mês segue controlando as ações táticas e datas, sem sugerir que filtre os planos estratégicos.

## Verificação

`scripts/test-campanha-estrategia.ts`: cobertura obrigatória online/presencial, jornada completa, referências, privacidade, valores inválidos, rejeição de planos vazios, transporte, compatibilidade, entrada da crítica e persistência JSONB real com PGlite.

`tests/e2e/campaign-strategy.spec.ts`: plano completo em celular/desktop, sugestão legada, acesso de leitura e erro de consulta. As respostas externas nesses testes são interceptadas.

`scripts/test-db-security.ts`: regressão de permissões e migrações. O manifesto de preflight foi atualizado para incluir a migration; novos privilégios não foram concedidos.

## Limites

Nenhum template garante uma estratégia boa para todas as clínicas. A homologação precisa conferir especificidade, dados ausentes, viabilidade de equipe/agenda, copy, rastreio e custos reais. Planejamento e aprovação não comprovam execução ou resultado. Sem agenda/financeiro integrados, comparecimento e receita continuam indisponíveis. A confirmação e implantação em produção permanecem uma etapa separada.

## Homologação real

Um plano foi gerado e permaneceu como proposta para a clínica autorizada: duas ações online, duas presenciais, cinco etapas da jornada, três fases e três indicadores. A revisão técnica foi registrada no histórico da execução, com hashes dos documentos antes/depois; ela corrigiu fórmula, inferência de causa, metas não aprovadas e início de teste anterior ao preparo. Não equivale a aprovação médica ou publicitária. A leitura com usuário autenticado da clínica recuperou o documento salvo; consulta a outro identificador de clínica retornou zero linhas. As quatro rodadas de modelos somaram US$ 0,2305407 estimados; as respostas rejeitadas permaneceram no histórico e não foram apresentadas como planos aceitos. As verificações de segurança da Supabase não mudaram após a coluna. Sem deploy de produção e sem ações comerciais externas.

Na rodada final do contrato novo, dois planos foram gerados e salvos pelo motor (aquisição e relacionamento), cada um com duas ações online, uma presencial, jornada e indicadores do catálogo. O campo observado foi normalizado com as fontes do servidor. As cinco rodadas totalizaram US$ 0,2934049 estimados em modelos, sem custo de infraestrutura incluído. A versão de teste anterior revisada foi preservada.
