# Entregas do Nexo: capacidade, acesso e operação

Conferência de 18/10/2026 na branch `codex/producao-criativa`. Este documento substitui qualquer interpretação de que todos os itens pedidos já estão concluídos. Código, homologação e produção são estados diferentes. Não foi feito deploy de produção nesta entrega.

## Conteúdo e produção

| Capacidade solicitada | Estado conferido | O que falta para aceite |
|---|---|---|
| Melhores conteúdos da própria conta | Implementado: métricas existentes e ranking por objetivo, clínica e conta | Não comprova causalidade comercial nem diferencia mídia paga sem fonte |
| Carrossel completo, copy e design | Homologado com referência própria de 10 slides; análise por slide e DNA | Ampliar amostra de formatos/contas e revisão editorial |
| Reels: palavras, cenas e edição | Transcrição integral e comparação implementadas; observação visual por frames | Vídeo visualmente integral não homologado; frames permanecem cobertura parcial |
| Biblioteca de estruturas com evidências | Implementada com estados de evidência e fonte | Repetir testes publicados antes de chamar uma estrutura de vencedora comprovada |
| Adaptação com Brand Brain | Homologada com carrossel e Reel próprios | Roteirista legado ainda não consome as análises criativas completas; documentos antigos não são regenerados automaticamente |
| Carrossel preservando arte da mesma pessoa | Geração com referência integral e exportação real homologadas | Fidelidade exige conferência; modo de arte gerada não equivale a todos os elementos editáveis |
| Editor visual | Estúdio com revisões, imagens, copy, composição e exportação | Melhorar qualidade editorial; preservar modo de referência e não substituir por um template genérico |
| Vídeo profissional com Remotion | Renderer, cortes, legendas e exportação funcionam; qualidade editorial parcial | Templates de edição, storyboard, decisões baseadas na referência, áudio/B-roll e validação com gravação bruta. Renderizar MP4 não satisfaz esse aceite |
| Ideias → adaptação → produção → planejador | Conectado nesta entrega, usando os documentos e RPCs existentes | Publicação externa e aprovação são etapas distintas |
| Pesquisa de tendências Instagram/TikTok | Código de pesquisa externa existe, mas worker confirma `external_search=false` | Configurar fonte autorizada, limites/custos e homologar busca, aquisição e comparação reais |
| Radar News | Não há coleta editorial de notícias homologada | Selecionar fontes, registrar data/origem, deduplicar, verificar relevância e revisão |
| Raio-X de perfil | Métricas, melhores conteúdos e diagnóstico existentes reaproveitáveis | Não há entrega unificada equivalente homologada; usar essas fontes sem duplicar painel |
| Aprovação editorial no WhatsApp | Não implementada de ponta a ponta | Provedor/canal autorizado, template quando necessário, identidade do aprovador, estados, expiração, vínculo com revisão exata e auditoria |
| Calendário editorial | Planejador interno existente com dia e status | Data planejada não comprova postagem. Agendamento/publicação automática ainda não homologados |
| Aprendizado por resultado de adaptação | Vínculo explícito com publicação e observações implementados | Homologar ciclo de novas publicações, métricas posteriores, comparação e sugestão usando os resultados |
| MCP do motor criativo | Ausente no servidor MCP atual | MCP existente tem nove ferramentas de leitura de métricas/Brain; faltam ferramentas criativas e contratos de autorização/orçamento para escritas |
| Estratégia de campanha online e presencial | Novo contrato e interface no fluxo existente, com diagnóstico, jornada, frentes online/presencial, recursos e medição | Proposta exige revisão da equipe; papéis/custos não são aprovações nem execução. Ver `docs/campanhas-estrategia.md` |
| Roteirista semanal | Motor e acionamento administrativo existem | Zero execução nesta clínica de teste. Depende do agendador externo; não há promessa de segunda-feira nem geração em todas as clínicas |
| Worker permanente | Worker local ativo na homologação | Serviço persistente, observabilidade, retenção e teste de carga antes da operação comercial |

## Inteligência comercial 360°

| Capacidade | Estado conferido | Pendência |
|---|---|---|
| CRMs, WhatsApp, anúncios e Instagram | Conectores, métricas e telas existentes | Credenciais, histórico e cobertura variam por clínica; não declarar todas as fontes operacionais |
| Jornada com associação de eventos | Fase 1 implementada, com origem, confiabilidade e associações estáveis | Fontes sem identificadores suficientes permanecem não atribuídas |
| Diagnóstico → responsável → ação → resultado | Oportunidades e acompanhamento verificável existentes | Fase 2 completa ainda parcial; reaproveitar tarefas e conferir cada fluxo com dados reais |
| Agenda clínica | Feegow, Clínica nas Nuvens e Ninsaúde constam como planejados no catálogo | Cadastro do fornecedor não é conector. Falta API/contrato/credenciais e homologação somente leitura |
| Comparecimento e receita financeira | Indisponíveis na jornada atual | Agenda e dados financeiros verificáveis; distinguir ganho do CRM, contratado, faturado e recebido |
| Atribuição comercial por campanha/conteúdo | Parcial, conforme evidência disponível | Não inventar vínculo, CAC paciente, ROI ou ROAS quando faltam comparecimento, pagamento ou custos |
| Copiloto 360° | Agentes/Brain/copiloto existentes | Conectar eventos administrativos e financeiros ausentes, responder com período/evidência/lacunas e avaliar recomendações |

## Correção funcional desta entrega

- `Ideias` passa a listar as adaptações salvas, inclusive anteriores ao filtro de métricas e fora do histórico do agente legado. Paginação de vinte documentos.
- Leitura e cópia integrais de slides/falas, legenda, briefings e cuidados médicos.
- Envio ao planejador reutiliza `creative_to_pauta`, com idempotência e permissões existentes. Nenhuma tabela ou tarefa duplicada.
- Links abrem a clínica, conta, adaptação e projeto correspondente. Adaptação indisponível não abre outro conteúdo silenciosamente.
- O planejador recupera o documento original e preserva a sequência de slides/falas. Não acrescenta capa ou encerramento genéricos a uma adaptação completa.
- Viewers consultam os documentos sem criar pautas ou produzir arquivos. Os filtros de clínica/conta, RLS e contratos existentes são preservados.

## Evidências desta entrega

Consulta real usando usuário autenticado de clínica e RLS na homologação: cinco adaptações, duas com projetos vinculados, um carrossel no planejador, texto integral preservado. Consulta a outro identificador de clínica retornou zero linhas. Isso é evidência pontual de acesso, complementada pelos testes existentes de banco; não substitui toda a auditoria multiempresa.

Worker consultado: visão/transcrição/produção habilitados; busca externa e vídeo nativo desabilitados. A integração editorial não gerou conteúdo pago nem migrações. A evolução de Campanhas acrescentou uma coluna apenas à homologação e foi testada em cinco rodadas de modelos (US$ 0,2934049 estimados no total), com dois planos novos salvos pelo motor e uma versão anterior revisada preservada. Nenhuma ação externa ou alteração de produção.

Validação: 96 scripts de teste, lint, typecheck, build e testes de navegador do fluxo editorial e regressão de Ideias, transcrição e estúdio. Testes de interface usam transporte interceptado; a consulta real de homologação usa RLS e não gera conteúdo pago.

## Próximos aceites, em ordem

1. Qualidade editorial: roteiro e adaptação alimentando o Roteirista existente; templates Remotion com teste em gravação bruta e referência autorizada; avaliação humana de copy/design/legibilidade antes da exportação.
2. Pesquisa real: configurar e homologar Instagram/TikTok, comparar fontes externas com a própria conta e guardar as evidências sem prometer resultado.
3. Fechar operação editorial: aprovação de revisão exata, canal WhatsApp autorizado, calendário e eventual publicação; medir conteúdo publicado e aprender com os resultados.
4. Expor leitura criativa aos agentes via MCP existente, depois escrita supervisionada com orçamento e idempotência.
5. Retomar fases comerciais: ações e CRM, primeiro conector de agenda autorizado, comparecimento/receita, atribuição e copiloto.

Cada aceite requer tela acessível, operação persistida, isolamento, erro recuperável e evidência real. Não usar percentual global de prontidão sem pesos e critérios definidos.
