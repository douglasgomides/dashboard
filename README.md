# Doctor Creator Intelligence Hub

Módulo de decisão e medição pro ecossistema Doctor Creator — nunca produz
conteúdo. Une inteligência de conteúdo Instagram (Windsor.ai), atribuição de
conversão real (consulta ou venda de infoproduto) e, na Fase 3, um motor de
regras de automação sobre a metodologia DC (funil de consciência C0–C3 +
Diferencial → Narrativa → Percepção → Confiança → Venda → Multiplicação).

Stack: Vite + TanStack Router (SPA, React) + Supabase (Postgres/RLS). Deploy: Vercel.

## Estado atual: Fase 1

Portado manualmente, sem onboarding self-service ainda — os clientes piloto
são cadastrados à mão (ver `supabase/seed_clients_fase1.example.sql`).

Telas:
- **Visão geral do mês** (`/$clientId`) — KPIs (novos seguidores, alcance,
  taxa de engajamento, salvamentos) + série diária.
- **Ranking & próximos ângulos** (`/$clientId/posts`) — ranking de posts do
  mês por salvamento, classificação manual por tema/funil C0–C3/estágio da
  metodologia/formato, conversão real por tema/formato, e sugestão heurística
  de próximos ângulos (`public.suggest_next_angles`).
- **O que virou paciente** / **O que virou venda** / **Automações** — telas
  reservadas (Fase 2 e 3), só aparecem cheias quando o cliente tiver aquela
  fonte conectada.

Não construído de propósito (ver o brief): agendador/publicador de post, CRM
próprio, geração de criativo — isso é o Arsenal/gerador de carrossel.

## Setup

```bash
npm install
cp .env.example .env.local   # preencha as chaves abaixo
npm run dev
```

Variáveis de ambiente (`.env.local`):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — cliente (browser).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — server-side (sync job). Nunca
  expor no client.
- `WINDSOR_API_KEY` — só o sync job usa.

## Banco

1. `supabase link` no projeto Supabase + `supabase db push` (aplica
   `supabase/migrations/20260822000000_fase1_schema.sql`).
2. Cadastre os 2 clientes piloto com
   `supabase/seed_clients_fase1.example.sql` (copie pra um arquivo local,
   preencha os IDs reais, rode no SQL editor).
3. Rode o sync manual: `npm run sync:instagram` (puxa posts + métricas
   diárias da Windsor.ai pros últimos `SYNC_DAYS` dias, default 90).
4. Classifique alguns posts na tela de Ranking (tema/funil/estágio/formato)
   — sem isso a conversão por tema/formato e os próximos ângulos ficam vazios,
   já que a Meta API não sabe a classificação editorial.

`src/routeTree.gen.ts` é gerado automaticamente no primeiro `npm run dev` ou
`npm run build` — não commitado, não editar à mão.

## Dois caminhos de sync — e o botão "Atualizar dados"

Cada conta de Instagram é alimentada por um de dois syncs, e a coluna
`instagram_accounts.sync_source` diz qual:

| `sync_source` | Fonte | Cobertura |
|---|---|---|
| `windsor` (padrão) | Windsor.ai | todas as contas conectadas |
| `meta_graph` | Meta Graph API direta | só as contas dentro da Business Manager cobertas pelo `META_ACCESS_TOKEN` |

Rodar o sync errado numa conta não é inofensivo: sobrescreve dado bom por dado
com buraco (a Windsor já perdeu os reels da Lana Torres uma vez). Por isso
`api/sync/refresh.ts` despacha por `sync_source` em vez de rodar os dois.

O botão "Atualizar dados" fica no cabeçalho do cliente, ao lado do logout, e
mostra de quando é o dado. Diferente de `api/sync/instagram.ts` e
`api/sync/meta-graph.ts` (máquina-chamando-máquina, com `SYNC_SECRET`), ele
autoriza pelo usuário logado: token de sessão do Supabase + checagem de que a
pessoa é membro daquele cliente ou admin. Janela padrão de 7 dias — é pra
destravar a tela, não pra refazer histórico.

> O sync diário do n8n ("Sync diário — Instagram Intelligence Hub", 6h) hoje
> só cobre as contas `meta_graph`. Conta `windsor` depende do botão ou de
> `npm run sync:instagram` até alguém agendar o `api/sync/instagram`.

## Retenção de reels (hook rate)

`instagram_posts` guarda `reel_skip_rate`, `reel_avg_watch_time_ms`,
`reel_total_watch_time_ms`, `profile_visits` e `media_follows`.

- **Hook rate** = `(1 - reel_skip_rate) * 100`. A Windsor devolve o skip rate
  como **fração** (0.515 = 51,5%) apesar de declarar o campo como PERCENT.
- **Body rate / hold rate** não são calculáveis: exigem a duração do vídeo, e
  nem a Windsor nem a Graph API expõem esse campo. O tempo médio assistido
  aparece em segundos absolutos, nunca como percentual estimado.
- `profile_visits` e `media_follows` a Meta **não suporta em reels** — null em
  reel é esperado, não é falha de sync.
- O caminho `meta_graph` não tem skip rate (a Graph API não expõe): nessas
  contas a seção de retenção explica a ausência em vez de mostrar zero.

## Deploy (Vercel)

App SPA puro (Vite + `vercel.json` com rewrite de fallback) — zero-config no
Vercel. Via dashboard (deploy automático a cada push):

1. [vercel.com/new](https://vercel.com/new) → importe o repositório
   `douglasgomides/dashboard`, branch `claude/doctor-creator-hub-nixvw6` (ou
   `main`, depois do merge).
2. Framework preset: **Vite** (auto-detectado). Build command `npm run
   build`, output directory `dist` — ambos já são o default do preset, não
   precisa mexer.
3. Em **Settings → Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — client-side (SPA).
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — server-side, sem prefixo
     `VITE_`, marcar como *Sensitive*. Usadas pela única rota server-side do
     app, `api/admin/create-user.ts` (Admin API do Supabase pra criar login
     de outro usuário — não dá pra fazer isso só com RLS no navegador).
   `WINDSOR_API_KEY` só é usada pelo `npm run sync:instagram` local/cron.
4. Deploy. Todo push nessa branch gera um preview; promova pra produção
   quando o backend (Supabase) estiver de pé.

> Nota: uma tentativa de deploy direto via API (sem passar pelo dashboard)
> esbarrou num 403 de permissão do lado do Vercel num projeto
> `doctor-creator-intelligence-hub` que ficou órfão fora do escopo do time
> "Douglas' projects" — se aparecer um projeto com esse nome que você não
> reconhece ao importar, é esse; pode apagar.

## Próximos passos (fora do escopo desta entrega)

- **Fase 2**: conectores read-only Feegow/Ninsaúde (consulta) e UTM
  automático + webhooks Hubla/Hotmart/Eduzz/Kiwify (venda infoproduto).
- **Fase 3**: construtor de regras (condição sobre métrica/etapa → pausar
  campanha / realocar orçamento / alertar WhatsApp), com log de auditoria.
  As ações reais (`pause_campaign`, `set_campaign_budget` etc.) já existem no
  conector `facebook` da Windsor.ai — falta só o construtor de condições e o
  agendamento por cima.
- Onboarding self-service (OAuth) só depois que os 2 clientes piloto
  validarem a Fase 1.
