# Nexo e SAP · Doctor Creator

Dois produtos com entradas, contratos e permissões próprios: o Nexo acompanha marketing, vendas e oportunidades; o SAP organiza a implantação do Sistema de Aquisição de Pacientes. Compartilham a base técnica e o cadastro de clínicas. O Brand Brain fornece contexto aos fluxos autorizados.

A aplicação é uma SPA React/TypeScript com TanStack Router e Query, banco PostgreSQL no Supabase e funções HTTP na Vercel. Os conectores sincronizam dados externos para o banco; a interface lê dados sujeitos às políticas de acesso de cada cliente.

## Desenvolvimento

Requisitos: Node.js 22.12 ou superior e npm. A versão de referência está em `.nvmrc`.

```sh
npm ci
cp .env.example .env.local
# Preencha a URL e a chave pública do seu projeto de desenvolvimento.
npm run dev
```

As variáveis `VITE_` entram no JavaScript entregue ao navegador. Use esse prefixo apenas para a URL e a chave pública do Supabase. Credenciais de serviço e dos provedores pertencem exclusivamente ao servidor.

```sh
npm run routes:generate # gera src/routeTree.gen.ts sem precisar compilar o app
npm run check           # segredos, lint, tipos e todos os scripts de teste
npm run build           # produção em dist/
npm run preview         # inspeção local do build
npm audit               # alertas conhecidos das dependências instaladas
```

`src/routeTree.gen.ts` é gerado pelo TanStack Router e não deve ser editado ou versionado. `npm run typecheck` já gera esse arquivo em um checkout novo.

## Estrutura

| Diretório | Responsabilidade |
| --- | --- |
| `src/routes` | Rotas, autorização de navegação e telas |
| `src/components` | Interface compartilhada e componentes dos módulos |
| `src/lib` | Regras de domínio, consultas, indicadores e relatórios |
| `src/hooks` | Sessão, papel do usuário e estado compartilhado |
| `api/sync` | Entradas de sincronização automática e manual |
| `api/admin` | Criação de acessos, restrita a administradores |
| `api/integrations` | Webhooks de provedores |
| `api/_lib` | Conectores e serviços executados no servidor |
| `supabase/migrations` | Esquema, RLS, permissões, funções e integridade |
| `scripts/test-*.ts` | Regressões de domínio, APIs e banco |
| `tests/e2e` | Navegação, permissões e acessibilidade no navegador |

## Acesso e segurança

Administradores da aplicação gerenciam clientes e integrações. Cada vínculo em `client_members` identifica o cliente e o papel `owner`, `strategist` ou `viewer`. A interface usa esse papel para oferecer ações; RLS e validações no servidor aplicam a autorização de fato.

O cliente `service_role` ignora RLS. Endpoints que o usam precisam validar a sessão, o cliente e a permissão de escrita antes de executar qualquer ação. Webhooks e tarefas automáticas têm autenticação própria. Tokens de integrações não são selecionados pelas consultas da interface.

Veja [SECURITY.md](SECURITY.md) para os limites das verificações e [docs/operations.md](docs/operations.md) para aplicar as mudanças no ambiente hospedado.

## Banco de desenvolvimento e homologação

Use um projeto separado e dados fictícios. Vincule o CLI do Supabase ao projeto pretendido e confira o histórico antes de aplicar SQL. O repositório contém migrações históricas com versões repetidas e algumas correções de bootstrap anteriores a arquivos já existentes; não renomeie migrações publicadas nem aplique todas às cegas em produção.

```sh
npx supabase migration list
npx supabase db push --include-all --dry-run
```

O teste `npm run test:migrations` executa os arquivos SQL ordenados em um PostgreSQL descartável, com interfaces mínimas de Auth e Storage. `scripts/test-db-security.ts` verifica isolamento por papel e cliente, grants, funções privilegiadas e referências entre tenants. Esses testes não validam o histórico do CLI nem substituem homologação no serviço Supabase.

As correções de integridade usam FKs compostas `NOT VALID`: novas relações entre clientes são impedidas, mas registros históricos precisam ser auditados antes de validar as constraints.

## Testes de navegador

Na Inteligência Criativa, Reels com áudio transcrito exibem o roteiro falado original completo, com cópia do texto e consulta aos tempos. O laboratório envia todos os segmentos reconhecidos no áudio como fonte primária para a adaptação, junto da análise visual e do Brand Brain. A comparação por bloco usa os segmentos que cruzam aquele intervalo, mantendo as palavras e os tempos originais; um segmento que cruza blocos aparece inteiro para conferência. A fala original nunca é reconstruída a partir de descrições de cenas ou textos na tela. Transcrições são automáticas e precisam de conferência de termos e nomes; adaptações antigas só mudam quando uma nova proposta é solicitada.

```sh
npx playwright install chromium
npm run test:e2e
npm run test:interface # apresentações, logins, separação dos produtos e pilotos operacionais
```

O servidor de testes recebe configuração fictícia do Supabase, e as chamadas são interceptadas no navegador. Não são necessárias credenciais reais. Para usar o Chrome instalado na máquina:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Os testes cobrem rotas em 375 e 1280 px, acesso anônimo, perfil de leitura, falhas de autenticação/dados e regras básicas de acessibilidade do login. A suíte de interface também confere os produtos em 375, 768 e 1440 px e os fluxos de acompanhamento do Nexo e acessos do SAP. Eles não comprovam que as integrações externas estejam configuradas corretamente. Capturas e traces de falhas ficam em `test-results/`, fora do Git.

## Integrações e execução

O botão de atualização usa a sessão do usuário; operações de escrita exigem papel de edição. Sincronizações automáticas usam o segredo do servidor. Provedores, contas, tokens e equipes podem variar por cliente; contas compartilhadas precisam de atribuição explícita para não misturar atendimentos.

Os conectores preservam checkpoints quando há falha de persistência. Reenvios de webhook devem ser idempotentes, e exclusões da origem usam marcação para preservar o histórico. Métricas ausentes não devem ser convertidas em zero nem apagar valores anteriores.

A automação deve respeitar limites e paginação dos provedores. Uma sincronização com sucesso não é prova de que toda a fonte está coberta: confira cobertura, período e mensagens de erro antes de interpretar indicadores.

## Publicação

A Vercel serve `dist/` e as funções de `api/`, usando `vercel.json` para fallback da SPA, limites de execução e cabeçalhos de segurança. Configure as variáveis no ambiente correspondente e valide o preview antes de promover uma versão. Os tipos HTTP locais descrevem o contrato estrutural das funções sem instalar o builder da Vercel no aplicativo.

O workflow `.github/workflows/quality.yml` executa instalação reproduzível, auditoria de dependências, checagens de código, testes, build e navegação. As actions estão fixadas por commit e o job não recebe credenciais de produção.
