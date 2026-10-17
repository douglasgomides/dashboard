# Contrato de experiência e autorização · HUB / SAP

Requisito confirmado em 17/10/2026: HUB e SAP são ferramentas diferentes para o usuário. Somente o administrativo acompanha as duas. Funcionários internos e funcionários das clínicas têm acessos individuais e permissões diferentes. Este documento orienta a integração; não declara que a política já foi implementada no backend.

## Organização

- Duas apresentações públicas, duas entradas de clínica e identidade visual consistente. Entrada interna por produto e entrada administrativa própria.
- A clínica pode manter a mesma identidade de negócio no banco e o histórico da jornada SAP → HUB. Esse compartilhamento não dá acesso automático às duas interfaces.
- Cada pessoa usa sua identidade. A função vem da autorização persistida no servidor, nunca de um parâmetro, seletor do formulário ou nome de domínio.
- Clientes antigos continuam no HUB. A conclusão do SAP não é uma migração destrutiva nem um redirecionamento exclusivamente por data; uma pessoa autorizada provisiona a continuidade apropriada.

## Matriz inicial

| Capacidade | Administrativo | Equipe interna | Gestão da clínica | Funcionário da clínica / recepção |
|---|---|---|---|---|
| HUB e SAP | Ambos | Somente o produto autorizado | Somente o produto autorizado | Somente o produto autorizado |
| Clínicas | Carteira autorizada à administração | Somente atribuídas | Própria | Própria |
| Equipes, convites e permissões | Gerencia conforme sua alçada | Não concede acesso global | Convites limitados à clínica, se autorizados | Sem gestão de acessos |
| Análise e recomendações | Visão de gestão | Funções concedidas | Resultados e decisões da clínica | Fila e indicadores operacionais da função |
| Propostas dos agentes | Revisa conforme alçada | Revisa conforme alçada | Revisões de negócio próprias; sem operação administrativa | Sem aprovação de mídia ou orçamento |
| Tarefas | Acompanha carteira | Atua nas atribuídas | Acompanha clínica e executa suas decisões | Atua nas atribuídas à pessoa/função |
| Credenciais de integração | Conecta/revoga por canal seguro; não expõe segredos | Somente se houver permissão específica | Conecta fontes autorizadas da clínica | Sem leitura de segredos |

Gestão e recepção são dois exemplos de papéis na clínica. Outras funções podem ser acrescentadas por capacidade, sem conceder acesso excessivo para contornar limitações do desenho. A equipe interna também pode ter diferenças entre tráfego, conteúdo e relacionamento.

## Controles necessários no backend

Resolver o usuário autenticado, vínculo ao produto, escopo de clínica e capacidade exigida em cada operação. O `client_id` enviado pelo navegador não é prova de autorização. O worker precisa receber um escopo validado e reconferir a permissão para efeitos externos quando aplicável. Negar por padrão vínculos inválidos ou revogados.

Não usar `app_admins` como substituto para funcionário interno. Preservar o controle de módulos existentes e a compatibilidade dos clientes atuais durante a migração, com levantamento de vínculos antes de ligar os novos bloqueios. Ativar por etapas e testar leitura, escrita e jobs em uma clínica de homologação.

Logins diferentes podem usar o mesmo provedor de identidade existente. Não exigem três bancos de senhas nem duplicação dos dados da clínica. Hosts distintos podem ajudar a apresentação e o contexto, mas a API continua validando produto e capacidade.

## Casos obrigatórios para a integração

- Usuário sem convite, convite expirado e acesso revogado.
- Clínica HUB tentando URL, API, RPC ou arquivo SAP; o inverso também.
- Funcionário interno consultando clínica não atribuída.
- Recepção tentando resultados restritos, custos, tokens ou aprovação de agentes.
- Parâmetro de papel, ID de clínica e destino de redirecionamento adulterados.
- Logout, troca de sessão, cache anterior e resposta atrasada de outra clínica/produto.
- Encerramento SAP, continuidade HUB e cliente antigo sem perder histórico ou ganhar acesso indevido.
- Aprovação pendente após mudança de papel, proposta, evidência ou permissão.

O protótipo apresenta parte desses cenários de navegação com dados fictícios. A homologação real deve exercitar o servidor e o banco, não apenas os elementos visíveis.
