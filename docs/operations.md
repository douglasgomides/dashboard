# Validação e implantação das correções

## Reconciliação de 18/10/2026

A integração preserva as telas e os fluxos da PR169 e incorpora a revisão de engenharia da PR134. Para os ambientes hospedados existentes, aplicar **somente** `20261022170000_reconcile_hosted_security.sql`, depois de conferir os contratos e testar na branch `tezpmowkupeoabzzbxpf`. Não reaplicar as sete migrações antigas, nem fazer merge/rebase da branch Supabase. O delta consolidado recusa assinaturas ou corpos de RPCs de leitura desconhecidos antes de qualquer DDL.

O delta preserva os corpos e os paths vazios das RPCs operacionais, inclusive `tem_modulo` e `agentes_marcar_marco`. Não reabre a leitura de `digisac_url`, preserva `ticket_medio`, restringe classificações de posts e corrige busca, relações entre clínicas e receita. Não altera mensagens, campanhas, dados legados ou valida automaticamente constraints antigas. Defaults do owner gerenciável são ajustados somente no schema `public`; os defaults de `supabase_admin` continuam sujeitos ao acesso do provedor.

Validação desta reconciliação: `npm run check`, `npm audit`, build e as duas suítes de navegador. O teste local SQL executa a cadeia de 127 arquivos em PostgreSQL descartável. No Supabase de teste, executar `supabase/tests/prontidao_seguranca.sql` e `supabase/tests/operacao_verificavel.sql`, sempre com os dados fictícios e o rollback dos próprios arquivos. Não executar esses testes em produção. A comparação de sequências e definições globais faz parte da suíte hospedada; ela não faz login HTTP nem assina JWTs.

Antes de publicar, confira o projeto e a branch de cada ambiente. Em Preview, URL, chave pública e chave de servidor devem pertencer à mesma branch de teste. Nunca usar a chave de produção para completar a homologação. A versão Production deve ser gerada pela integração Git com suas próprias variáveis.

Depois da publicação, conferir os aliases, login, carregamento com sessão autorizada, API recusando visitantes, grants efetivos e integridade das RPCs preservadas. Para reversão do aplicativo, usar um deployment anterior de Production conhecido; não reabrir privilégios excessivos como procedimento de rollback. Este delta é aditivo e não apaga registros.

O piloto real exige uma clínica já escolhida, responsáveis e fontes atualizadas. Assumir um caso ou iniciar uma execução não comprova contato nem conclusão. O SAP exige vínculo exato da tarefa, evidência de acesso e aprovação; o Nexo exige mensagem real vinculada e desfecho observado. Não criar eventos fictícios para preencher painéis de produção.

## Ambiente de homologação

Use projeto Supabase, contas dos provedores e usuários de teste separados. A validação local não executa mudanças no ambiente hospedado.

O arquivo `supabase/audits/preflight.sql` prepara a conferência do ambiente de destino com uma transação somente de leitura. Execute com uma conta autorizada a inspecionar o esquema e confira o identificador do banco antes de usar qualquer ferramenta de migração. O relatório não exibe mensagens, telefones ou tokens. As contagens de registros legados geradas pelo script também são consultas somente de leitura; não executam reparos nem validam constraints automaticamente.

1. Faça uma cópia recuperável do banco e confirme que a restauração funciona.
2. Compare o histórico de versões do Supabase com os arquivos do repositório. Permanecem três identificadores históricos repetidos: `20261014120000`, `20261018120000` e `20261018130000`. É necessário conferir quais arquivos foram aplicados no serviço; não apague registros de histórico nem renomeie versões publicadas por tentativa.
3. Confira a prévia de aplicação das migrações, incluindo a correção de bootstrap anterior às versões existentes. Execute as migrações aditivas de segurança primeiro em homologação.
4. Compare as definições das RPCs de Jornada existentes somente no banco ativo. O bootstrap cria contratos ausentes, preservando definições cuja assinatura histórica não foi versionada.
5. Verifique anon, viewer, strategist/owner e admin em dois clientes distintos. Teste URLs diretas, RPCs e operações de escrita, além dos botões da interface.
6. Exercite erros dos provedores, interrupção na segunda página, falha do banco, reenvio de webhook e exclusão de lead. Um lote não persistido precisa voltar a ser processado.

Na conferência de 17/10/2026, o banco hospedado tinha 147 versões e objetos criados fora do histórico. Algumas migrações também carregam registros de clientes e credenciais antigas, fazendo a criação automática de uma branch vazia falhar. Não reproduza essas cargas em homologação. Use um snapshot somente do esquema, sem linhas de negócio, e aplique explicitamente os deltas revisados; não mescle o bootstrap auxiliar de homologação na produção.

Na auditoria original de 17/10, foram preparados sete deltas (`20261017171119`, `20261017172557` e `2026102212...` a `2026102216...`). Para a versão atual, seus efeitos necessários foram reconciliados no delta único descrito acima; as versões antigas também não podem substituir as RPCs mais rigorosas da PR169. Compare a lista segura com novas colunas públicas do catálogo antes de aplicar.

As sete migrações originais passaram na branch PostgreSQL 17.11 com 86 verificações de permissões/regras e mais 33 de receita, sempre com rollback das fixtures. Essa é evidência histórica, anterior à PR169; a suíte reconciliada atual deve passar novamente. O bootstrap auxiliar de catálogo nunca deve ser mesclado na produção. A criação automática da branch parou em uma carga histórica; o esquema de teste foi reconstruído manualmente, sem executar essa carga. Não use rebase/merge automático dessa branch para promover o banco.

O novo delta `20261022160000_receita_em_jogo_integrity.sql` depende do DDL `20261021170000_receita_em_jogo.sql`. Na produção, coluna e RPCs já existiam e suas definições foram comparadas com a versão original; na branch vazia, esse DDL foi aplicado antes do delta. O índice `20261021160000_kommo_mensagens_indice.sql` é idempotente e já estava no catálogo de produção. Não execute `20261021180000_marcella_atendimento_flwchat.sql` na homologação nem como parte deste plano: contém UPDATE específico de cliente, preservado do histórico remoto. Não aplique o diretório inteiro de migrações de forma automática.

O editor de ticket aceita inteiro ou valor brasileiro (`1234,56` ou `1.234,56`), preserva centavos e permite null somente por “Voltar ao automático”. A RPC recusa valores não finitos, não positivos e clientes inexistentes. O check de tickets foi criado `NOT VALID`: novas escritas são protegidas, mas valores históricos precisam de contagem e revisão antes de validar a constraint. Somam-se 21 FKs e um check aguardando essa validação legada.

## Dados históricos

O antigo sync da WTS podia atribuir atendimentos de outros clientes ao cadastro com equipe geral quando a atualização era disparada para um único cliente. A correção impede novas atribuições desse tipo, mas não apaga nem corrige automaticamente dados anteriores. Compare os atendimentos com as equipes e contas da origem e faça um reprocessamento controlado no intervalo afetado, preservando trilha de auditoria.

As novas FKs compostas protegem novas escritas. Para validar registros legados, cada constraint com `convalidated = false` precisa ser auditada antes de `ALTER TABLE ... VALIDATE CONSTRAINT`. Isso pode demandar correção de vínculos e janela de manutenção. Índices e alterações de constraints também podem bloquear escritas conforme volume e concorrência.

O preflight também identifica defaults globais implícitos de funções. Revogar `EXECUTE` apenas no schema não neutraliza um grant global de `PUBLIC`. As funções atuais têm revogação explícita, e o CI verifica todo o catálogo `public` após as migrações. Confira as roles proprietárias antes de alterar defaults globais: uma mudança por proprietário pode atingir funções futuras de outros schemas.

Confira se métricas ou páginas históricas foram afetadas pelos antigos erros de checkpoint antes de decidir por backfill. Reprocessamentos devem usar uma conta e um período conhecidos, com comparação dos totais na origem.

Credenciais literais antigas foram detectadas no histórico SQL hospedado. Confira sua validade, planeje rotação das ainda ativas e atualização dos consumidores, e sanitize as instruções sensíveis em uma operação revisada que preserve versões e nomes. Não exporte esses valores para relatórios, logs ou branches de teste. Habilite a proteção contra senhas vazadas do Supabase Auth na configuração apropriada do projeto, conforme o plano contratado.

## Conectores e diagnósticos

A sonda CRM exige sessão de `app_admin`; o segredo de sincronização não autoriza esse diagnóstico. Ela devolve status e estrutura limitada, sem conteúdo de mensagens. Não altere allowlists de hosts para aceitar URLs arbitrárias ou redirecionamentos autenticados.

A importação Digisac exige origem verificável. Como `wts_sessions` ainda não distingue provedor/conexão, um cliente com WTS e Digisac ou várias conexões Digisac é recusado para impedir atribuição cruzada. Mensagens sem vínculo inequívoco ao atendimento também são recusadas. Ajuste e migre o vínculo de origem antes de liberar essas configurações. Checkpoints só avançam após persistência das mensagens; erros parciais devem ser repetidos, e o endpoint responde 207 quando alguma integração falha.

O mascaramento de texto do Brand Brain reduz identificadores estruturados; nomes e outros dados pessoais em texto livre continuam sujeitos a limites heurísticos. Revise minimização e autorização dos dados antes de ligar provedores reais de IA.

## Ações externas com resultado incerto

Antes de enviar um comentário ao ClickUp, o motor registra uma intenção com chave única em `agente_passos`. Se a conexão cair ou a confirmação não puder ser persistida, a execução fica pausada e não reenvia automaticamente. Confira a tarefa no ClickUp e a intenção indicada no erro antes de reconciliar o registro ou cancelar a execução. Não basta clicar em retomar: uma intenção pendente continua bloqueando o envio. Isso reduz duplicações por retomada, mas não fornece uma transação única entre banco e provedor.

## Produção

Promova o código somente depois de conferir compatibilidade com o esquema hospedado e o histórico de migrações. Valide também políticas de Storage, configurações de Auth, expiração/rotação das credenciais, permissões dos provedores, agendamentos externos e alertas de falha. Esses itens não são configurados pelo ZIP ou pelo teste local.

A revisão não certifica conformidade legal, ausência absoluta de falhas ou prontidão para qualquer volume de tráfego. Não foram realizados testes de carga, pentest independente nem restauração real de backups. Cada conclusão do relatório de engenharia deve ser lida junto da evidência e do ambiente em que foi validada.
