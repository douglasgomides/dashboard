# Itens adiados da Phase 2

## e2e frágil já existente: `navigation-architecture.spec.ts:82` (viewer)

- Teste: "commercial results remain restricted and are categorized under Comercial for viewer".
- O teste espera ver o link "Guia de organização do CRM" (tela `equipe: true` em `src/lib/nav.ts`) para o papel `viewer`, mas `src/lib/nav.ts:451` esconde telas de equipe de `viewer` e `owner` assim que o papel carrega. Ele só passa se o `expect` pegar o instante em que `papel` ainda está carregando.
- No commit base 9c8344d o teste passa por esse instante. Qualquer mudança que desloque o tempo do bundle (aqui, só três atributos `data-origem` em `src/components/app-shell.tsx`, confirmado por bisseção numa cópia do base) faz o instante passar sem o `expect` vê-lo, e o teste falha de forma determinística.
- Não é regressão de comportamento: nenhum item de menu, rótulo ou visibilidade mudou. Fora do escopo do plano 02-02 (o menu e o visual são da Phase 3). Corrigir o teste (ou a regra de equipe) é decisão de quem mexer em nav.

## e2e que já falhavam no base 9c8344d (não tocados)

- `navigation-architecture.spec.ts:8` (Marketing, 375 e 1440 px)
- `routes.spec.ts:12` (`/pacientes` em 375 px: "Essa página não carregou")
- `workspace-navigation.spec.ts:8`, `:48`, `:137` e `:263` (375 e 1440 px)

## e2e que falham igual antes da fase (conferido no plano 02-04, suíte inteira)

Rodados no worktree da fase e em 8f719b4 (anterior à fase): mesmas 11 falhas nos 4 arquivos abaixo, 37 passes.

- `agents-workspace.spec.ts:99` e `:109`
- `audit-reliability.spec.ts:4`
- `auth-profile.spec.ts:4` (login cai em `/pacientes?preset=30d`, o teste espera `/<clínica>`) e `:31`
- `numbers-first.spec.ts:7` (375 e 1440 px), `:60`, `:90`, `:265`, `:274`

Suíte inteira na branch: 308 passam, 20 falham (estas 11 mais as 9 da seção acima). `npm run test:e2e` não sai com 0 por causa delas.
