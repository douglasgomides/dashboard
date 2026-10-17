# Segurança

O aplicativo trata dados separados por cliente. A autorização deve ser aplicada no banco (RLS e RPCs) e nas funções HTTP que usam service role; esconder controles na interface não concede nem revoga permissão.

Credenciais de serviço, tokens de CRM/Meta/WhatsApp e chaves de IA ficam apenas no servidor ou em tabelas com acesso restrito. Somente `VITE_SUPABASE_URL` e a chave pública do Supabase pertencem ao bundle. Não use prefixo `VITE_` para credenciais privadas.

## Antes de publicar

1. Execute `npm ci`, `npm run check`, `npm run build`, `npm audit` e `npm run test:e2e`.
2. Confira as migrações em homologação com dados fictícios e usuários separados por papel/cliente. O teste SQL local usa PostgreSQL embutido, não o serviço Supabase hospedado.
3. Teste a integração com credenciais de teste do provedor, inclusive falhas, paginação, reenvio e contas compartilhadas.
4. Compare o histórico remoto com `supabase migration list` e confira a prévia do deploy de banco. Migrações antigas já publicadas não devem ser renomeadas para corrigir o histórico.
5. Faça backup antes de mudanças no banco e confirme recuperação. As novas chaves compostas impedem relações inválidas novas sem apagar dados legados; a validação de registros históricos deve ocorrer separadamente.

## Limites das verificações

O scanner local de segredos procura alguns formatos conhecidos no checkout atual. Não substitui scanner do histórico, rotação de chaves nem inspeção de logs/backups. `npm audit` cobre alertas publicados para as dependências instaladas; zero alertas não prova ausência de vulnerabilidades.

Os testes de navegador usam respostas simuladas. Passar neles não confirma que credenciais externas, webhooks, configurações de produção, retenção de mensagens, permissões dos provedores ou recuperação de backups estejam corretos.

Se identificar exposição, evite abrir uma issue pública contendo credenciais ou dados de pacientes. Informe o responsável pelo sistema por um canal privado já utilizado pela equipe; revogue as credenciais afetadas e preserve registros de auditoria sem publicar os dados.
