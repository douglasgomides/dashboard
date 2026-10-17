# Protótipo: Hoje no HUB e no SAP

Primeira proposta navegável da experiência agêntica. Abra `index.html` diretamente no navegador; funciona sem dependências, login, acesso à rede ou variáveis de ambiente.

O protótipo reutiliza a linguagem visual e os tokens do Dashboard, o padrão de recomendação com evidências, tarefas por responsável e aprovações de agentes. Os componentes estão representados em uma página independente; ainda não foram substituídos os componentes React em produção.

## O que experimentar

1. Troque entre HUB e SAP, preservando a clínica selecionada.
2. Abra uma proposta, confira conteúdo, fontes, antes/depois e destino. A aprovação exige confirmação explícita e simula o andamento até a conclusão.
3. Solicite um ajuste com motivo. A proposta não será aprovada ou executada.
4. Pause/retome uma atividade e confira o histórico.
5. Mude a visualização para Clínica: não há aprovação de operador ou troca livre de clínica; o responsável pode registrar sua própria revisão.
6. Simule falha de fonte: aprovações ficam bloqueadas e resultados indisponíveis aparecem como ausência, sem virar zero. “Tentar novamente” recupera o cenário.
7. Troque de tema e experimente o celular.

São duas clínicas fictícias. Todos os estados ficam em memória e desaparecem ao recarregar. Nenhum dado de cliente, credencial, gravação no banco, comentário ClickUp, mudança de cronograma ou chamada de IA é utilizado. “Reiniciar demonstração” restaura os exemplos.

## Verificação

Com as dependências do repositório e Chromium instalados:

```sh
node prototypes/agentic-workspace/verify.mjs
```

Para usar o Chrome instalado localmente:

```sh
PLAYWRIGHT_CHANNEL=chrome node prototypes/agentic-workspace/verify.mjs
```

A verificação cobre os fluxos de ponta a ponta do protótipo, isolamento de contexto, ausência de chamadas externas, estados de erro, teclado, overflow e regras básicas WCAG A/AA com Axe em 375, 768 e 1440 px, nos temas claro/escuro. Resultados e capturas ficam em `test-results/prototype/`, ignorado pelo Git. Isso não equivale a testar permissões reais de API ou acessibilidade com leitores de tela.

## Integração após avaliação de uso

- Hoje deve consumir os contratos existentes de próximas ações, tarefas SAP e Central de Agentes, sem criar um segundo registro de tarefas/aprovações.
- Preservar os marcos, responsáveis e regras de pausa do cronograma real. A barra do exemplo representa dias decorridos, nunca percentual de entregas.
- Aprovações reais continuam limitadas à autorização no servidor, vinculadas à versão da proposta/evidência e ao cliente. A troca de visualização aqui é só um controle da demonstração.
- Estados de execução devem vir do motor real, com reconciliação de efeitos externos incertos. O temporizador usado neste exemplo não pode virar confirmação de sucesso na aplicação.
- Reverter uma ação só pode ser oferecido quando houver uma operação inversa suportada.
- Manter cliente, produto e período explícitos na navegação; descartar rascunhos e respostas tardias do contexto anterior.

## Hipóteses para validar com usuários

- A pessoa consegue identificar o próximo passo sem navegar por relatórios?
- Consegue dizer o que acontecerá antes de aprovar uma proposta?
- Consegue distinguir preparação, execução e resultado de negócio?
- Consegue recuperar uma falha ou pedir ajuste sem assistência?

Registrar tempo para completar essas tarefas, erros de contexto e pedidos de ajuda. O protótipo define a primeira hipótese de design; testes automatizados não comprovam facilidade de uso.
