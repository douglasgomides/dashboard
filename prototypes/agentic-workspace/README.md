# HUB e SAP · agentes, marketing e vendas

Protótipo independente da revisão visual. Mantém a marca Doctor Creator: azul-marinho, branco, azul contido e dourado discreto; tipografia editorial nas páginas públicas e hierarquia operacional no produto. Não usa mascotes, ilustrações de robôs ou promessas de resultados.

O HUB se apresenta como inteligência de marketing e vendas com agentes que preparam trabalho para revisão. O SAP conserva a implantação assistida de 90 dias e a jornada da atração à fidelização. A direção de Service as Software aparece em entregas concretas e limites de autonomia, sem anunciar todos os módulos como agentes já implementados.

A página **Ferramentas** torna visíveis as áreas da aplicação atual permitidas ao perfil. Seu catálogo é comparado automaticamente com 47 itens dos menus existentes. Os botões explicam a cobertura; não substituem nem executam as telas completas. Método, escopo, capacidades atuais e evoluções planejadas estão em [PRESERVATION.md](PRESERVATION.md).

Abra `index.html` diretamente no navegador. Não requer instalação, variáveis de ambiente ou rede. Na barra superior, **Telas e perfis** é uma ferramenta exclusiva da demonstração: não faz parte da interface dos produtos.

## Entradas

| Endereço após `index.html` | Tela |
|---|---|
| `#/hub` | Apresentação do HUB |
| `#/sap` | Apresentação do SAP |
| `#/hub/entrar` e `#/sap/entrar` | Login da clínica, separado por produto |
| `#/hub/equipe` e `#/sap/equipe` | Entrada da equipe interna, por produto |
| `#/admin/entrar` | Entrada administrativa |

Os logins têm dados fictícios fixos e campos somente leitura. O botão “Entrar na demonstração” inicia uma sessão simulada em memória; não recebe nem valida credenciais reais. Recuperação de senha também é simulada e não envia e-mail.

## Perfis apresentados

| Perfil | Experiência do exemplo |
|---|---|
| Administrativo | Alterna entre HUB/SAP e entre as duas clínicas fictícias; acompanha propostas e operação. |
| Equipe interna | Um produto, clínica atribuída, análise, propostas e atividades; não escolhe outro perfil. |
| Gestão da clínica | Um produto e sua clínica; resultados, plano e revisões próprias. Não aprova a operação dos agentes. |
| Recepção da clínica | Um produto e sua clínica; fila, rotina e histórico próprios. Não vê indicadores estratégicos nem controles de agentes. |

Somente o administrativo possui seletor de produto. Não há seletor de papel no workspace. Alterar o endereço de um painel para o outro produto retorna ao login correspondente quando a sessão fictícia não tem esse acesso. Um parâmetro `role` no endereço não altera o perfil. **Esses são cenários de interface; não são autorização real no servidor.**

HUB e SAP têm apresentação, entrada e ambiente próprios. A identidade da clínica e o histórico podem continuar compartilhados no backend, mas a conclusão do SAP não deve liberar uma segunda interface por simples passagem de D90. A continuidade no HUB depende de provisionamento explícito. Clientes antigos permanecem no HUB.

## Fluxos preservados

- Propostas com evidência, antes/depois, destino e confirmação antes da aprovação simulada.
- Pedido de ajuste com motivo, orientação de análise e histórico.
- Pausa/retomada dos próximos passos do agente.
- Revisão própria da clínica e conferência de rotina da recepção.
- Falha de fonte bloqueia aprovação; resultado ausente não vira zero.
- Dois temas no workspace, teclado/Escape e navegação responsiva.

Todos os dados são fictícios e ficam em memória. Recarregar o documento elimina as sessões e os registros. Não há chamadas a banco, ClickUp, cronograma, IA ou plataformas de anúncios. O CSP bloqueia conexões e envio de formulário. “Reiniciar demonstração” limpa os registros do cenário; “Sair” elimina a sessão fictícia.

## Verificação

Com as dependências do repositório e Chromium instalados:

```sh
node prototypes/agentic-workspace/verify.mjs
```

Para usar o Chrome instalado localmente:

```sh
PLAYWRIGHT_CHANNEL=chrome node prototypes/agentic-workspace/verify.mjs
```

O verificador exercita fluxos do workspace, páginas públicas, logins, diferenças entre quatro perfis, recuperação simulada, saída, navegação direta, isolamento de contexto, ausência de chamadas externas, teclado, overflow e regras básicas WCAG A/AA com Axe. As páginas públicas têm tema claro; o workspace tem temas claro/escuro. Larguras verificadas: 375, 768 e 1440 px, com uma matriz adicional de perfis em 375 e 1440 px. Relatórios e capturas ficam em `test-results/prototype/`, ignorado pelo Git.

Isso não equivale a homologar login real, RLS, autorização de APIs, leitores de tela ou facilidade de uso com pessoas reais.

## Integração com a aplicação real

1. Conectar as entradas ao Supabase Auth existente. Uma identidade por pessoa; não criar senha compartilhada por clínica nem escolher um papel no formulário. O servidor determina função, produto e clínicas atribuídas.
2. Aplicar a autorização também às APIs, RPCs, arquivos e tarefas assíncronas. Domínio, rota e menu não são fronteiras de segurança. Usuário de clínica não recebe privilégio administrativo; funcionário interno não recebe acesso global.
3. Reutilizar próximas ações, tarefas SAP e Central de Agentes existentes, com versão de proposta/evidência e destino autorizado. Não criar um segundo registro paralelo de aprovações.
4. Manter papéis operacionais e permissões de produto separados dos módulos contratados pela clínica. Um módulo contratado não autoriza todas as pessoas a operar suas funções.
5. Preservar marcos, pausas e pendências reais. A barra D0–D90 demonstra tempo decorrido, não percentual de entrega.
6. Obter estado de execução do motor real. O temporizador demonstrativo não pode ser convertido em confirmação de publicação ou sucesso externo.
7. Definir expiração, revogação e transição de acesso, auditoria e resposta a efeito externo incerto. Uma aprovação antiga não autoriza uma proposta modificada.
8. Preservar todas as áreas inventariadas, os materiais, sessões, regras e históricos. A página Ferramentas apresenta a organização proposta, não substitui as telas atuais. Não habilitar gravação de consultas ou operação autônoma de campanhas: são evoluções futuras.

O contrato de acesso e seus casos de homologação estão em [ACCESS.md](ACCESS.md).

## Validação com usuários

Observar se cada perfil identifica o produto, sua clínica, suas responsabilidades e o efeito da aprovação; se encontra o próximo passo e se diferencia trabalho executado de resultado comercial. Medir conclusão de tarefas, erros de contexto e pedidos de ajuda. Testes automatizados não comprovam que a experiência ficou intuitiva ou sofisticada para o público.
