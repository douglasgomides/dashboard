# Validação e implantação das correções

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

Inclua `20261017171119_hosted_credential_boundary.sql` e `20261017172557_literal_people_search.sql` no plano de aplicação junto das cinco migrações `2026102212...` a `2026102216...`. A primeira fecha grants reais de credenciais sem depender de reaplicar arquivos históricos; a segunda corrige a busca preservando o retorno de quatro ou cinco colunas e recusa contratos desconhecidos. Sua publicação deve acompanhar o frontend que já usa seleção explícita de colunas. Compare a lista segura com novas colunas públicas do catálogo antes de aplicar.

As sete migrações de correção passaram na branch PostgreSQL 17.11 com 86 verificações de permissões/regras e mais 33 de receita, sempre com rollback das fixtures. O bootstrap auxiliar de catálogo nunca deve ser mesclado na produção. A criação automática da branch parou em uma carga histórica; o esquema de teste foi reconstruído manualmente, sem executar essa carga. Não use rebase/merge automático dessa branch para promover o banco; aplique somente os sete deltas revisados por um plano explícito.

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
