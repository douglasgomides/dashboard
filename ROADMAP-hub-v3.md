# Intelligence Hub v3 — roadmap de reconstrução

Referências (pasta `Dashboard - alteracoes/`): `Intelligence-Hub-Prototipo-v3.html` (UI/UX/lógica fiel, com snapshot de dados reais + cálculo no navegador), `Intelligence-Hub-Handoff-Tecnico.pdf` (spec nível A), `Intelligence-Hub-Adendo-1.pdf` (erratas, achados novos, contrato de dados, regras de insight, telas novas, queries de auditoria).

Princípio central do adendo: **o Hub diz quando NÃO tem dado** — nunca número zerado/gráfico vazio sem explicação; toda tela mostra qual dado falta, para qual insight e quem resolve.

## Marcos

### M1 — Fundação (ESTE PR)
- [x] Design tokens exatos do protótipo em `src/styles.css` (tema claro/escuro 3 estados, séries s1/s2/s3/s7, status good/warn/serious/crit, accent/ai, sombras, tipografia system-ui — corrige BUG-13 Manrope; `:focus-visible` — corrige BUG-02) + classes de componentes do protótipo (.card, .kpi, .insight, .stat, .bm, .seg, tabelas .t, sidebar/nav, etc.).
- [x] Sidebar unificada fiel (Portfólio · Cliente · Biblioteca · Sistema) aplicada ao layout de cliente, com toggle Claro/Escuro e busca.
- [x] Rotas novas (stub com estado "falta dado"): Conteúdo, Ideias, Relatório.
- [ ] `npm run build` verde.

### M2 — Visão geral (Portfólio / todos os clientes)
Hoje `/admin` é só uma lista. Reconstruir conforme o protótipo:
- 6 KPIs: Clientes ativos, Precisam de atenção, Alcance somado, Seguidores ganhos, Investimento em anúncios, Conversas e leads dos anúncios.
- "Prioridades desta semana": sinais graves (coleta/conexão quebrada primeiro, depois queda), com Abrir / Resolvido / Adiar 7 dias (grava usuário+data em `alert_state` — query §6.5).
- Tabela de clientes: Status, Alcance, Tendência (sparkline 12 pts), Seguidores (ganhos), Investimento, Resultado dos anúncios, CRM (base) — filtros Todos/Precisam de atenção/Com anúncios/Com CRM/Com WhatsApp/Em onboarding + Ordenar por (Atenção/Alcance/Variação/Seguidores/Investimento/Nome).
- **Precisa:** RPC(s) de agregação cross-cliente (ou fetch raw + cálculo no cliente, como o protótipo). FUN-08: nunca mostrar nome de outro cliente em benchmark.

### M3 — Páginas por cliente (reconstruir na cara do protótipo, ligando os dados reais já existentes)
Dados já disponíveis em `src/lib/client-data.ts` (RPCs `ads_*`, `crm_*`, `wts_*`, posts, métricas — já exigem login após SEC-02).
- **Resultado** (`/$clientId`): insight principal + KPIs + "A história do período" (3 beats) + "Do alcance ao paciente" (2 trilhas orgânico/pago, nunca somadas) + "Retorno do investimento" (ROAS quando CRM tiver valor; senão aceita receita/vendas digitadas sem gravar) + "Posição na carteira" (5 métricas, mediana, marcador) + "O que o Hub ainda não consegue dizer" (14 insights × situação × dado × quem resolve) + faixa de coleta parada.
- **Conteúdo**: projeção 30d de seguidores (linear, ≥60% dias com dado e ≥5 dias).
- **Posts**: ranking + coluna de triagem de publicidade médica (palavra-chave §5.6, aviso não bloqueio) + legenda completa (NEW-06).
- **Anúncios**: veredito por campanha do MESMO objetivo (INT-01), selo de fadiga freq≥1,8 (INT-02), "só tráfego, sem conversa" como aviso (DAT-06).
- **Comercial**: funil/estágios, valor da venda (crm_leads.price), ROAS/custo por venda/ticket quando houver valor+origem.
- **WhatsApp**: calculadora "Quanto custa o silêncio" (sessões sem 1ª resposta × conversão × ticket; campos vazios), separar robô/spam (NEW-07).
- **Dúvidas**: comentários com pergunta (classificador melhor + dedupe — NEW-05).
- **Ideias**: ângulos por regra (pergunta repetida→carrossel; tema 2+ posts e salvos↑→variação; formato de maior alcance→novo conteúdo). Badge com contador da fila.
- **Relatório** (página nova): texto pronto p/ WhatsApp (alcance, seguidores, destaque, anúncios, atendimento, ações), editável, copiar + exportar PDF.
- **Inspiração** (Biblioteca): cards (já existe).

### M4 — Regras de insight (§4) + dados (§3) + achados (§2)
- Regras §4 (limites e amostra mínima): alcance vs período anterior (±25%, 60% dias, ≥30 contas/dia), tendência interna (±30%, 9 dias), cruzamento alcance×seguidores, verba×alcance, concentração em 1 post, custo por conversa, recomendação por formato, "nenhuma regra disparou" + botão "Ver regra e dados usados".
- Dados a coletar (§3): valor da venda obrigatório ao marcar ganho (crm_leads.price), UTM padronizado, origem do clique WhatsApp, consulta realizada, token WTS no cofre, frequency diário, cadastro de campanhas antes do gasto, série diária de seguidores.
- Achados (§2): NEW-01 série de seguidores parada 11/09 (coleta); NEW-02 alerta de coleta parada (FUN-06) + painel de saúde (FUN-03); NEW-03 campanhas sem cadastro; NEW-04 profile_visits/follows por post; NEW-05 is_question; NEW-06 legenda completa; NEW-07 sessões sem resposta.
- `alert_state` (§6.5), queries de auditoria §6 (1–4) para medir evolução.

### Segurança (pendente de autorização do Douglas — NÃO aplicar sem OK)
- SEC-01 (view meta_ads_daily_v) e SEC-02 (execute anon nas RPCs): **JÁ aplicados em 30/09** (migration `sec_fix_meta_ads_view_and_rpc_anon`) — ver memória.
- SEC-05: mover tokens (`clients.wts_api_token`, conexões de CRM) para o cofre de segredos; nenhuma tela recebe token. **Pendente de autorização.**
- SEC-03: leaked-password + MFA admin (painel Supabase Auth). Pendente.

## Mapa nav (protótipo) → rota
| Protótipo | Rota | Status |
|---|---|---|
| Portfólio › Visão geral | `/admin` (todos os clientes) | reconstruir (M2) |
| Cliente › Resultado | `/$clientId` | reconstruir (M3) |
| Cliente › Conteúdo | `/$clientId/conteudo` | **rota nova (stub M1)** |
| Cliente › Posts | `/$clientId/posts` | reconstruir (M3) |
| Cliente › Anúncios | `/$clientId/anuncios` | reconstruir (M3) |
| Cliente › Comercial | `/$clientId/crm-painel` | reconstruir (M3) |
| Cliente › WhatsApp | `/$clientId/atendimento` | reconstruir (M3) |
| Cliente › Dúvidas | `/$clientId/duvidas` | reconstruir (M3) |
| Cliente › Ideias | `/$clientId/ideias` | **rota nova (stub M1)** |
| Cliente › Relatório | `/$clientId/relatorio` | **rota nova (stub M1)** |
| Biblioteca › Inspiração | `/$clientId/inspiracao` | existe |
| Sistema › Admin | `/admin` | existe |
