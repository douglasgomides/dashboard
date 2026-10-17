# Posicionamento e preservação de informações

## Direção da copy

HUB: **inteligência de marketing e vendas, com agentes de IA que preparam trabalho para a equipe**. O foco é estudar conteúdo, mídia e atendimento, organizar evidências e apoiar prioridades. A interface deve mostrar a entrega, sua origem e a decisão pendente. Não apresentar o HUB como sistema genérico de gestão da clínica.

SAP: **implantação assistida de 90 dias para a jornada de aquisição, da atração à fidelização**. Método, execução técnica e software apoiam a operação. Preservar seis sessões individuais, kickoff, diagnóstico, plano, materiais, leitura semanal e relatório D90. A clínica participa das sessões, atende e mantém os registros; a equipe conduz a implantação técnica.

A direção segue a tese discutida pela Sequoia em [Services: The New Software](https://sequoiacap.com/article/services-the-new-software): entregar trabalho definido por software. Nossa aplicação dessa tese é começar por entregas verificáveis, com fonte, revisão e histórico, e ampliar a autonomia por fluxo. Isso é uma direção de produto, não uma declaração de autonomia integral já implementada nem de vínculo com a Sequoia.

O método foi conferido com os materiais internos SAP 00.03, 01.02, 01.03, 07.02 e 08.05. Não foram publicados preços, propostas comerciais internas ou informações de clientes. Os documentos de contrato e regras não foram alterados. A estratégia de Service as Software solicitada pelo fundador orienta a apresentação nova; não modifica obrigações comerciais anteriores.

## Contrato de preservação

O JSON `capability-map` embutido no HTML contém **47 itens de navegação da aplicação atual**, agrupados em 13 áreas. O verificador compara seus caminhos e rótulos com os menus de origem. A contagem é de itens do menu, não de 47 telas novas implementadas. Alguns itens apontam ao mesmo contexto com rótulos diferentes.

| Origem | Itens | Organização proposta |
|---|---:|---|
| `src/lib/nav.ts` — AREAS e AVANCADO | 21 | Inteligência e prioridades; conteúdo e audiência; anúncios; atendimento e vendas; relatórios; configuração do cliente. |
| `src/routes/_authenticated.sap.tsx` — ITENS | 14 | Minha implantação; preparação; sessões e jornada; leitura semanal; metas e continuidade. |
| SAP — entradas gerais | 4 | Clínicas, operação, biblioteca e início guiado. |
| `src/routes/_authenticated.admin.tsx` | 8 | Carteira, referência, conferência, relatórios, agentes, Brand Brain, integrações e equipe. |

O workspace adiciona **Ferramentas**, com descrições e os itens de cada área. Os botões abrem explicações da cobertura; não fingem executar as telas completas. A aplicação real, suas rotas, dados, materiais, regras e permissões não são modificados por este protótipo. Recepção conserva somente fila, rotina e histórico. O catálogo oculta itens administrativos dos demais perfis.

| Informação importante | Como permanece representada |
|---|---|
| Conteúdo, posts, top conteúdos, audiência, ideias e inspiração | Catálogo HUB: Conteúdo e audiência. Fontes disponíveis condicionam a análise real. |
| Próximas ações, campanhas e oportunidades | Catálogo HUB: Inteligência e prioridades; início continua destacando a decisão do dia. |
| CRM, sua organização, WhatsApp, dúvidas e jornada | Catálogo HUB: Atendimento e vendas. Jornada permanece administrativa. |
| Anúncios, investimento e origem comercial | Áreas de anúncios e configuração preservadas; atribuição depende dos registros. |
| Relatórios e trabalho dos agentes | Proposta, evidência, confirmação, publicação simulada e histórico preservados. |
| Brain e administração | Inventariados no catálogo administrativo, sem exposição à clínica. |
| Seis sessões e jornada completa do SAP | Apresentação detalha diagnóstico, paciente ideal, atração, conversa, confirmação, comunicação na consulta, follow-up, fidelização e indicações. |
| Cronograma, responsáveis, reuniões e rastreamento | Inventário SAP preserva cada item. Critérios, pausas e cronograma real permanecem na aplicação. |
| Marco D60 e período final | Marco previsto até D60; D61–D90 para otimizar, comparar e planejar continuidade. Não é uma implantação de 60 dias nem conclusão automática. |
| Consulta consultiva | Roteiros, apresentação do plano, opções, limites, dúvidas e retorno; decisão clínica permanece médica e decisão do paciente é livre. |
| Gravação de criativos | Parte do método de atração; explicitamente distinta da gravação de consultas. |
| Metas e garantia | Área preservada. Metas operacionais e condições contratuais; nenhuma promessa de receita ou lucro. |
| Plano, relatório D90 e continuidade | Área preservada. Acesso ao HUB é provisionado separadamente; D90 não concede acesso. |
| Verba e atendimento diário | FAQ diferencia gestão de tráfego, verba da clínica, licenças e atendimento diário pela equipe da clínica. |

## Capacidade atual, demonstração e futuro

Na base usada por este estudo, `api/_lib/agentes.ts` registra dois fluxos: `acessos_criticos` e `brain_carga`. Eles conferem/cobram acessos e propõem memória de marca, respectivamente. A disponibilidade real depende de módulo, configuração, fontes e autorização. Relatório semanal e revisão de rastreamento são exemplos de interação deste protótipo, não fluxos implementados nesse motor. A existência de outras análises, telas e roteiros não prova autonomia de um agente sobre essas funções. O catálogo preserva sua organização sem atribuir execução autônoma a todos os módulos.

O HTML é uma demonstração isolada com sessões e dados fictícios em memória; não executa os fluxos reais. Login, autorizações e ações externas precisam ser integrados e validados no servidor.

Gravação/análise de consultas, operação autônoma de campanhas e novas fontes/agentes são evoluções planejadas. Não há gravador, upload de áudio ou promessa de integração universal. Rotas futuras e aliases antigos continuam no código real, mas não são anunciados como módulos prontos.

Para integrar, conservar o dicionário de materiais do SAP, seis sessões, roteiro cronológico, critérios de entrega, pausas, metas, garantias condicionais e histórico de cada clínica. Uma visão enxuta deve oferecer acesso ao restante do conteúdo autorizado, sem criar um registro paralelo da operação.
