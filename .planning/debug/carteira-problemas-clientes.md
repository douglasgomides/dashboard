---
status: diagnosed
trigger: "Carteira /admin 'Clientes do Nexo' mostra 3 precisam de atenção, 3 fonte parada/erro, 1 fonte atrasada, 16 médico sem login, 20 de 20 sem ROI calculável. João quer saber por clínica se é problema do cliente ou erro nosso de leitura/cálculo, e como corrigir."
created: 2026-11-11
updated: 2026-11-11
goal: find_root_cause_only
---

# Debug: problemas da carteira de clientes

## Symptoms

<!-- DATA_START -->
- **Expected:** os cartões da Carteira (/admin, "Clientes do Nexo") apontam só problemas reais de cada clínica, com critério correto.
- **Actual:** a print do João (11/11/2026, 20 clínicas) mostra:
  - 3 "Precisam de atenção": fonte atrasada, parada ou com erro.
  - 3 "Fonte parada ou com erro", há mais de 3 dias.
  - 1 "Fonte atrasada", de 2 a 3 dias.
  - 16 "Médico sem login": ninguém da clínica entra no painel.
  - 20 de 20 "Sem ROI calculável": falta dado para o retorno de 30 dias.
- **Errors:** não há mensagem de erro; são contagens nos cartões.
- **Timeline:** visto em 11/11/2026, na produção nexo.doctorcreator.com.br.
- **Reproduction:** entrar como admin em /admin (Carteira) e ler os cartões do topo.
- **Suspeita do João:** os cartões "Sem ROI 20/20" e "Médico sem login 16" parecem critério nosso, não problema do cliente.
<!-- DATA_END -->

## Constraints

- Leitura no Supabase de produção (projeto cvdnzoqduliopscfsrkc): autorizado só SELECT.
- Proibido: escrita, migration e SQL de escrita (só o João roda).
- SSH: só para ler logs, nada que mude algo.
- Não mexer no n8n.
- Não mexer no SAP.
- A máquina do João é fraca: não rodar build pesado nem e2e.

## Deliverable

1. Tabela clínica × problema com estas colunas:
   - causa provável;
   - evidência (consulta SQL ou arquivo:linha);
   - de quem é o problema: NOSSO (leitura, critério ou sync) ou DO CLIENTE (conexão, token, dado ou uso);
   - correção proposta;
   - quem resolve.
2. Não aplicar correção nesta sessão. Diagnosticar e propor; a correção entra depois como tarefa GSD.

## Current Focus

- status (rodada 3, 11/11 ~21h UTC): DIAGNOSTICADO. Tabela por clínica, tabela de variáveis e lista de correções fechadas em
  Resolution. Q6 a Q9 (e o novo Q10) seguem pendentes; só trocam linhas marcadas "a confirmar (Qn)", não mudam a causa.
- CONFIRMADO (orquestrador + código): Lana crm e WhatsApp = a conexão Kommo da Lana nunca teve access_token e dependia da
  reserva KOMMO_API_TOKEN do servidor; a migração de 08/11 não levou a variável. Erro NOSSO (migração incompleta). Correção:
  João grava o token próprio na conexão (UPDATE que ele roda), sem reserva global (docs/vps.md item 7).
- CONFIRMADO (rodada 3): o processo da VPS lê o secret doctor-hub-env-20261108-v1 (9 nomes, criado 08/11 18:41). O arquivo
  /etc/doctor-creator-hub/production.env tem 10 nomes: a SHORTIO_API_KEY foi recuperada às 20:10 de 08/11, mas o secret nunca foi
  recriado. Por isso a lista do orquestrador (feita do production.env) tem 8 faltas e a da rodada 2 (feita do secret) tinha a
  SHORTIO_API_KEY a mais.
- CONFIRMADO (rodada 3): META_ADS_TOKEN NÃO é a causa da Glauce. O estado "não lida" (anuncios-status.ts:113-116) exige que a
  conta não tenha nenhum dia em meta_ads_daily nos últimos 120 dias. Então nem a reserva da Vercel lia a 9641. A data 01/11 é o
  dia em que a regra por conta entrou no ar (db36241, 01/11 18:25 UTC). Q8 confirma.
- ACHADO NOVO (rodada 3): manual.ts:449-451 ainda EXIGE META_ACCESS_TOKEN no botão Sincronizar (posts/tudo) de perfil
  meta_graph. b2a3835 só tirou a exigência das rotinas agendadas. O erro é gravado em sync_status instagram (manual.ts:660-663),
  o que dá vermelho falso no Instagram da clínica até a próxima rodada boa. Hoje não aparece nos cartões (Q2 sem vermelho de
  Instagram), mas o risco é NOSSO.
- bug_class: Bohrbug (contagem determinística: banco + regra no front; variável ausente é determinística)
- reasoning_checkpoint (Glauce x META_ADS_TOKEN):
    hypothesis: "A falta de META_ADS_TOKEN na VPS não causou nem impede consertar o 'não lida' da conta 9641. A conta nunca foi
      lida por via nenhuma, e a regra por conta de 01/11 só passou a mostrar isso."
    confirming_evidence: ["anuncios-status.ts:113: nao_lida só com !ultimoDado ou ultimoDado > 120 dias (meta_ads_daily por
      client+conta, anuncios-status.ts:279-283)", "db36241 (01/11 18:25 UTC) criou a regra; último sucesso da Glauce = 01/11,
      ainda na Vercel", "meta-ads-graph-sync.ts:327-334: com reserva, a Graph tentaria a 9641; leitura boa teria gravado dia em
      meta_ads_daily, e o estado seria ok ou erro da Graph, nunca nao_lida"]
    falsification_test: "Q8 mostrar a 9641 com ultimo_dia nos últimos 120 dias, ou leitura via=graph ok depois de 01/11"
    fix_rationale: "Recuperar a 9641 é dar acesso por conta (token em client_ad_accounts, ou Windsor) ou desativar; a reserva
      global não entra"
    blind_spots: "Não sei a mensagem de 01/11 a 08/11 (pode ter sido erro de permissão da Graph com a reserva da Vercel)"
    candidate_causes: ["data/cliente: conta sem ads_read para a BM da Doctor Creator", "config: reserva global ausente
      (descartada como causa)", "cadastro/equipe: conta errada ou não usada"]
    and_gate: "não: basta a conta não estar acessível por nenhuma via"
- next_action: o orquestrador roda Q6, Q6b, Q7, Q7a, Q7b, Q8, Q9 e Q10 quando puder e cola em Evidence. As linhas
  "a confirmar" da tabela (Glauce, Mariela, Juliana Paola, Marcella, Sergio, central de canais) se resolvem com isso; a
  correção vira tarefa GSD.

## SELECTs pendentes (só leitura; nenhum chama wrapper que grava cache)

Período do ROI da tela em 11/11/2026: resolveDateRange({preset:"30d"}) = 2026-10-13 a 2026-11-11 (src/lib/date-range.ts:61-65).
Não chamar status_das_fontes() nem roi_periodo(): os wrappers fazem INSERT/UPDATE em resultado_pronto(_geral).
fontes_base() e roi_periodo_calc() são `language sql stable` (só leem).

### Q0. Versões das funções e idade do cache

```sql
select p.proname::text as item, md5(pg_get_functiondef(p.oid)) as valor
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('status_das_fontes', 'status_das_fontes_calc', 'fontes_base', 'roi_periodo', 'roi_periodo_calc', 'crm_origem_classifica')
union all
select 'roi_calc usa conversas_origem_anuncio?',
       (position('conversas_origem_anuncio' in pg_get_functiondef('public.roi_periodo_calc(uuid,date,date)'::regprocedure)) > 0)::text
union all
select 'cache ' || funcao, calculado_em::text from public.resultado_pronto_geral
union all
select 'cache roi 30d', count(*)::text || ' linhas, mais antiga ' || coalesce(min(calculado_em)::text, '-')
from public.resultado_pronto where funcao = 'roi_periodo' and de = '2026-10-13' and ate = '2026-11-11';
```

### Q1. Carteira (o que listAllClients devolve) + acesso de cliente (cartão "Médico sem login")

```sql
with adm as (select user_id from public.app_admins),
m as (
  select cm.client_id,
         count(*) as membros,
         count(*) filter (where cm.user_id not in (select user_id from adm)) as membros_cliente,
         count(*) filter (where cm.user_id not in (select user_id from adm) and u.last_sign_in_at is not null) as cliente_ja_entrou,
         max(u.last_sign_in_at) filter (where cm.user_id not in (select user_id from adm)) as ultimo_login_cliente,
         string_agg(distinct cm.role, ',') filter (where cm.user_id not in (select user_id from adm)) as papeis_cliente
  from public.client_members cm left join auth.users u on u.id = cm.user_id
  group by cm.client_id
)
select c.name, c.active, c.created_at::date as criado,
       c.id in ('0ef2c738-1961-4a90-b347-d1d45ac8098c', 'ba5231d4-a973-47da-9018-82af6c5a5661') as negocio_proprio,
       coalesce(m.membros, 0) as membros, coalesce(m.membros_cliente, 0) as membros_cliente,
       coalesce(m.cliente_ja_entrou, 0) as cliente_ja_entrou, m.ultimo_login_cliente::date as ultimo_login_cliente, m.papeis_cliente,
       exists (select 1 from public.sap_clinicas s where s.client_id = c.id) as no_sap,
       exists (select 1 from public.sap_clinicas s join public.sap_papeis p on p.clinica_id = s.id
               where s.client_id = c.id and p.papel = 'clinica') as sap_tem_papel_clinica,
       (select count(*) from public.client_members) as total_linhas_client_members
from public.clients c left join m on m.client_id = c.id
where c.eh_teste = false
order by c.name;
```

Q1b (usuário não-admin ligado a várias clínicas = provável pessoa da equipe fora de app_admins, contaria como "login do cliente"):

```sql
select cm.user_id, count(*) as clinicas, string_agg(distinct cm.role, ',') as papeis, max(u.last_sign_in_at)::date as ultimo_login
from public.client_members cm left join auth.users u on u.id = cm.user_id
where cm.user_id not in (select user_id from public.app_admins)
group by cm.user_id having count(*) >= 2
order by 2 desc;
```

### Q2. Cor de cada fonte por clínica, com a MESMA regra do front (status-fonte.ts:91-131 + motivos.ts:56-87)

Reproduz os cartões: "Fonte parada ou com erro" = linhas VERMELHO; "Fonte atrasada" = linhas AMARELO;
"Precisam de atenção" = clínicas distintas com VERMELHO ou AMARELO.

```sql
with h as (select (now() at time zone 'America/Sao_Paulo')::date as d),
fer as (select array['2026-01-01','2026-02-16','2026-02-17','2026-04-03','2026-04-21','2026-05-01','2026-06-04',
                     '2026-09-07','2026-10-12','2026-11-02','2026-11-20','2026-12-25','2027-01-01']::date[] as a),
s as (select * from public.fontes_base(null)),
b as (
  select c.name, s.client_id, s.fonte, s.cadastro, s.planilha, s.nao_usa, s.data_ate, s.last_attempt_at, s.last_success_at,
         nullif(btrim(s.last_error), '') as erro, nullif(btrim(s.motivo), '') as motivo, s.motivo_dono,
         h.d as hoje, (s.last_success_at at time zone 'UTC')::date as suc,
         case when s.data_ate is null then null
              when s.fonte in ('crm', 'atendimento') then
                (select count(*)::int from generate_series((s.data_ate + 1)::timestamp, h.d::timestamp, interval '1 day') g(x)
                  where extract(isodow from g.x) < 6 and not (g.x::date = any (fer.a)))
              else h.d - s.data_ate end as base
  from s join public.clients c on c.id = s.client_id cross join h cross join fer
  where not c.eh_teste
),
e as (
  select b.*,
    case when base is null then null
         when fonte = 'instagram' then greatest(greatest(0, base - 2), case when suc is null then 0 else greatest(0, hoje - suc) end)
         else greatest(0, base) end as dias,
    (cadastro or data_ate is not null or motivo_dono = 'manual') as ligado,
    (suc is not null and hoje - suc <= 1) as rodou_agora,
    case when motivo_dono is not null and motivo_dono not in ('origem', 'manual') then motivo_dono end as dono_aviso
  from b
),
m as (
  select e.*, coalesce(erro, motivo,
           case when data_ate is not null and dias > 3 and (last_attempt_at is null or rodou_agora) then '(derivado)' end) as motivo_ef
  from e
),
r as (
  select m.*,
    case
      when not ligado then case when nao_usa then 'cinza: Não usa' else 'cinza: Não ligado' end
      when dias is null then case when erro is not null then 'VERMELHO: Erro' else 'VERMELHO: Sem dado' end
      when erro is not null then 'VERMELHO: Erro'
      when dias <= 1 and fonte = 'anuncios' and motivo_ef is not null and dono_aviso is not null then 'AMARELO: Atenção'
      when dias <= 1 then 'verde'
      when rodou_agora and dono_aviso = 'cliente' and motivo_ef is not null then 'cinza: Parada pelo cliente'
      when dias > 3 and rodou_agora and dono_aviso is null then 'cinza: Sem movimento'
      when dias <= 3 then 'AMARELO: Atrasada'
      else 'VERMELHO: Parada' end as cor
  from m
)
select name, fonte, cor, dias, data_ate, cadastro, planilha, nao_usa, last_attempt_at::date as tentou, last_success_at as sucesso,
       rodou_agora, left(erro, 160) as erro, left(motivo, 160) as motivo, motivo_dono
from r
where cor not in ('verde', 'cinza: Não ligado')
order by (cor like 'VERMELHO%') desc, (cor like 'AMARELO%') desc, name, fonte;
```

### Q3. ROI dos 30 dias como a tela leu (cache) e o que trava, item a item (roi.ts:215-334)

```sql
with r as (
  select c.name, c.active, x.calculado_em, x.resultado as j
  from public.resultado_pronto x join public.clients c on c.id = x.client_id
  where x.funcao = 'roi_periodo' and x.de = '2026-10-13' and x.ate = '2026-11-11' and not c.eh_teste
),
v as (
  select name, active, calculado_em,
    coalesce((j->>'tem_anuncios')::bool, false) as ads, coalesce((j->>'tem_crm')::bool, false) as crm, j->>'crm_provider' as prov,
    coalesce((j->>'crm_compartilhado')::bool, false) as comp, coalesce((j->>'ganho_identificavel')::bool, false) as gid,
    (j->>'investido')::numeric as inv, (j->>'investido_aquisicao')::numeric as inv_aq,
    (j->>'leads')::int as leads, (j->>'leads_com_origem')::int as leads_or,
    (j->>'ganhos')::int as g, (j->>'ganhos_com_valor')::int as g_val, (j->>'ganhos_com_canal')::int as g_can,
    (j->>'ganhos_anuncio')::int as g_ad, (j->>'anuncios_planilha')::bool as planilha, j->>'anuncios_ate' as ads_ate,
    j->'receita_por_origem' as por_origem
  from r
),
w as (
  select v.*,
    (not ads or not crm or (crm and (comp or not gid
       or not coalesce(g_val::numeric / nullif(g, 0) >= 0.8, false)
       or not coalesce(leads_or::numeric / nullif(leads, 0) >= 0.7, false)
       or not coalesce(g_can::numeric / nullif(g, 0) >= 0.7, false)))) as bloqueado
  from v
)
select name, active, prov, inv, inv_aq, leads, leads_or, g, g_val, g_can, g_ad, planilha, ads_ate,
  concat_ws(' | ',
    case when not ads then 'sem anúncios' end,
    case when not crm then 'sem CRM' end,
    case when crm and comp then 'CRM compartilhado' end,
    case when crm and not gid then 'etapa de venda não marcada' end,
    case when crm and not coalesce(g_val::numeric / nullif(g, 0) >= 0.8, false) then 'valor <80% (' || g_val || '/' || g || ')' end,
    case when crm and not coalesce(leads_or::numeric / nullif(leads, 0) >= 0.7, false) then 'origem do lead <70% (' || leads_or || '/' || leads || ')' end,
    case when crm and not coalesce(g_can::numeric / nullif(g, 0) >= 0.7, false) then 'canal da venda <70% (' || coalesce(g_can::text, 'null') || '/' || g || ')' end
  ) as itens_faltando,
  case
    when bloqueado then 'bloqueado por item'
    when inv_aq <= 0 then case when inv > 0 then 'todo investimento em crescimento' else 'sem investimento em anúncio' end
    when g <= 0 then 'nenhuma venda no período'
    when g_ad is null then 'banco sem separação por origem'
    when g_ad = 0 then 'nenhuma venda de anúncio'
    when g_ad < 5 then 'menos de 5 vendas de anúncio (' || g_ad || ')'
    else 'CALCULÁVEL' end as motivo_final,
  left(por_origem::text, 200) as receita_por_origem, calculado_em
from w
order by name;
```

Se Q0 disser "cache roi 30d 0 linhas", trocar o CTE `r` por este (cálculo ao vivo, só leitura; precisa das claims de admin
porque roi_periodo_calc confere is_app_admin()). Rodar as duas instruções na mesma chamada:

```sql
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id from public.app_admins order by user_id limit 1), 'role', 'authenticated')::text, false);
-- r as (select c.name, c.active, now() as calculado_em, public.roi_periodo_calc(c.id, '2026-10-13', '2026-11-11') as j
--         from public.clients c where not c.eh_teste),
```

### Q4. Origem dos cards do período (trava "origem"/"canal" do ROI) e anúncio do WhatsApp (CTWA) que o ROI não usa

```sql
with l as (
  select x.id, x.client_id, nullif(btrim(x.source), '') as src, public.crm_origem_classifica(x.source) as classe, x.outcome, x.price
  from public.crm_leads x
  where x.removido_na_origem is null and x.occurred_at is not null
    and (x.occurred_at at time zone 'America/Sao_Paulo')::date between '2026-10-13' and '2026-11-11'
),
ctwa as (
  select distinct v.lead_id from public.conversas v
  join public.conversas_origem_anuncio o on o.conversa_id = v.id
  where v.lead_id is not null
)
select c.name, count(*) as cards, count(l.src) as com_texto_origem, count(l.classe) as com_canal,
       count(*) filter (where l.classe = 'Anúncio') as anuncio_no_card,
       count(*) filter (where k.lead_id is not null) as card_com_ctwa,
       count(*) filter (where k.lead_id is not null and l.classe is distinct from 'Anúncio') as ctwa_sem_anuncio_no_card,
       count(*) filter (where l.outcome = 'won') as ganhos_card,
       count(*) filter (where l.outcome = 'won' and l.price > 0) as ganhos_com_valor,
       (select string_agg(z.src || ' (' || z.n || ')', '; ') from (
          select l2.src, count(*) as n from l l2 where l2.client_id = c.id and l2.src is not null and l2.classe is null
          group by l2.src order by n desc limit 5) z) as textos_que_nao_viram_canal
from l
join public.clients c on c.id = l.client_id
left join ctwa k on k.lead_id = l.id
where not c.eh_teste
group by c.id, c.name
order by c.name;
```

### Q5. Datas cruas por fonte (causa de cada vermelho/amarelo) e avisos por conta de anúncio

```sql
select c.name,
  (select max(date) from public.instagram_account_daily_metrics m where m.client_id = c.id and m.reach is not null) as ig_diario,
  (select max(metrics_updated_at)::date from public.instagram_posts p where p.client_id = c.id) as ig_posts_metricas,
  (select max(posted_at)::date from public.instagram_posts p where p.client_id = c.id) as ig_ultimo_post,
  (select count(*) from public.instagram_accounts i where i.client_id = c.id and i.active) as contas_ig,
  (select max(date) from public.meta_ads_daily d where d.client_id = c.id) as ads_ultimo_dia,
  (select max(date) from public.meta_ads_daily d where d.client_id = c.id and d.spend > 0) as ads_ultimo_gasto,
  (select max(analise_em) from public.ads_planilha_semanal s where s.client_id = c.id) as ads_planilha,
  (select count(*) from public.client_ad_accounts a where a.client_id = c.id and a.active) as contas_ads,
  (select string_agg(x.provider || case when x.active then '' else '(inativa)' end, ',') from public.crm_connections x where x.client_id = c.id) as crms,
  (select max(occurred_at)::date from public.crm_leads l where l.client_id = c.id) as crm_ultimo_card,
  (select max(started_at)::date from public.wts_sessions w where w.client_id = c.id) as wts_ultima,
  (select max(ultima_msg_em)::date from public.conversas v where v.client_id = c.id) as conversa_ultima,
  (select string_agg(distinct v.provider, ',') from public.conversas v where v.client_id = c.id) as conversa_provedores
from public.clients c
where not c.eh_teste and c.active
order by c.name;
```

Q5b:

```sql
select c.name, s.ad_account_id, s.via, s.last_success_at, left(s.last_error, 160) as erro, left(s.motivo, 160) as motivo, s.motivo_dono
from public.sync_status_contas s join public.clients c on c.id = s.client_id
where not c.eh_teste and (s.last_error is not null or s.motivo is not null)
order by c.name;
```

## SELECTs pendentes, rodada 2 (só leitura; nenhum devolve token, telefone ou nome de paciente)

### Q6. Kommo: quem tem token próprio e o que o sync gravou (confirma que a Lana nunca teve token próprio)

Previsão: Lana com tem_token_proprio=false e tem_webhook=true, e as outras clínicas do Kommo com true. O token_vence da Lana
foi gravado antes de 08/11 e vem do JWT da variável do servidor (kommo-leads.ts:163). O erro é "Conexão sem token Kommo", com
last_attempt depois de 08/11 18:41 UTC.

```sql
select c.name, k.created_at::date as conexao_criada, k.active,
       coalesce(btrim(k.access_token), '') <> '' as tem_token_proprio,
       coalesce(btrim(k.webhook_secret), '') <> '' as tem_webhook,
       s.fonte, s.last_attempt_at, s.last_success_at, s.data_ate, s.token_expira_em::date as token_vence,
       left(s.last_error, 120) as erro
from public.crm_connections k
join public.clients c on c.id = k.client_id
left join public.sync_status s on s.client_id = k.client_id and s.fonte in ('crm', 'atendimento')
where k.provider = 'kommo' and not c.eh_teste
order by c.name, s.fonte;
```

Q6b. O webhook da Lana (não precisa de token) continua entregando depois de 08/11?

```sql
select l.event_type, count(*) as linhas, max(l.received_at) as ultimo_recebido
from public.crm_leads l join public.clients c on c.id = l.client_id
where c.name ilike '%lana%' and not c.eh_teste and l.provider = 'kommo' and l.received_at >= '2026-11-07'
group by 1 order by 1;
```

### Q7. Sergio Maia: o que são os 122 ganhos (cards x pessoas x itens) e onde está o valor

Previsão: pessoas_com_primeiro_card_no_periodo fica bem abaixo de pessoas (base antiga). itens_paciente_procedimento fica perto de
cards_ganhos (um card por procedimento). com_monetaryAmount_no_payload fica perto de 0.

```sql
with s as (select id from public.clients where name ilike '%sergio%' and not eh_teste),
g as (
  select l.* from public.crm_leads l
  where l.client_id in (select id from s) and l.provider = 'flwchat' and l.removido_na_origem is null
    and l.outcome = 'won' and l.occurred_at is not null
    and (l.occurred_at at time zone 'America/Sao_Paulo')::date between '2026-10-13' and '2026-11-11'
),
primeiro as (
  select l.raw_payload->'contactIds'->>0 as contato, min(l.occurred_at) as primeiro_card
  from public.crm_leads l
  where l.client_id in (select id from s) and l.removido_na_origem is null and l.occurred_at is not null
  group by 1
)
select coalesce(ps.pipeline_name, g.pipeline_id) as painel, fp.papel, ps.status_name as etapa,
       count(*) as cards_ganhos,
       count(distinct g.raw_payload->'contactIds'->>0) as pessoas,
       count(distinct g.raw_payload->'contactIds'->>0)
         filter (where (p.primeiro_card at time zone 'America/Sao_Paulo')::date >= '2026-10-13') as pessoas_com_primeiro_card_no_periodo,
       count(distinct (g.raw_payload->'contactIds'->>0) || '|' ||
             lower(coalesce(g.raw_payload->'custom_fields_values'->0->'values'->0->>'value', '?'))) as itens_paciente_procedimento,
       count(*) filter (where g.price > 0) as com_valor,
       count(*) filter (where jsonb_typeof(g.raw_payload->'monetaryAmount') = 'number') as com_monetaryAmount_no_payload
from g
left join primeiro p on p.contato = g.raw_payload->'contactIds'->>0
left join public.crm_funil_papel fp on fp.crm_connection_id = g.crm_connection_id and fp.pipeline_id = g.pipeline_id
left join public.crm_pipeline_statuses ps on ps.crm_connection_id = g.crm_connection_id and ps.pipeline_id = g.pipeline_id
                                          and ps.status_id = g.status_id
group by 1, 2, 3
order by 4 desc;
```

Q7a. Que campos o card ganho do Sergio traz (só os NOMES das chaves; serve para achar o valor do orçamento):

```sql
select 'raw_payload' as nivel, k, count(*) as cards
from public.crm_leads l join public.clients c on c.id = l.client_id
cross join lateral jsonb_object_keys(case when jsonb_typeof(l.raw_payload) = 'object' then l.raw_payload else '{}'::jsonb end) k
where c.name ilike '%sergio%' and not c.eh_teste and l.provider = 'flwchat' and l.outcome = 'won' and l.removido_na_origem is null
  and (l.occurred_at at time zone 'America/Sao_Paulo')::date between '2026-10-13' and '2026-11-11'
group by 1, 2
union all
select 'customFields', k, count(*)
from public.crm_leads l join public.clients c on c.id = l.client_id
cross join lateral jsonb_object_keys(case when jsonb_typeof(l.raw_payload->'customFields') = 'object'
                                           then l.raw_payload->'customFields' else '{}'::jsonb end) k
where c.name ilike '%sergio%' and not c.eh_teste and l.provider = 'flwchat' and l.outcome = 'won' and l.removido_na_origem is null
  and (l.occurred_at at time zone 'America/Sao_Paulo')::date between '2026-10-13' and '2026-11-11'
group by 1, 2
order by 1, 3 desc;
```

### Q7b. FlwChat: ganho some como "closed"? (Juliana Paola, Marcella, Mariela, Sergio)

Previsão: nas três com 0 vendas, outcome 'closed' > 0 e 'won' = 0, e nenhuma etapa de ganho confirmada.

```sql
select c.name, l.outcome, count(*) as cards
from public.crm_leads l join public.clients c on c.id = l.client_id
where l.provider = 'flwchat' and not c.eh_teste and l.removido_na_origem is null and l.occurred_at is not null
  and (l.occurred_at at time zone 'America/Sao_Paulo')::date between '2026-10-13' and '2026-11-11'
group by 1, 2
order by 1, 2;
```

```sql
select c.name, x.config->'etapas_ganho' as etapas_ganho_config, x.config->>'cards_por_item' as cards_por_item,
       count(e.*) filter (where e.outcome = 'won') as etapas_ganho_confirmadas,
       string_agg(distinct ps.status_name, ', ') filter (where e.outcome = 'won') as nomes_etapas_ganho
from public.crm_connections x
join public.clients c on c.id = x.client_id
left join public.crm_etapa_resultado e on e.crm_connection_id = x.id
left join public.crm_pipeline_statuses ps on ps.crm_connection_id = e.crm_connection_id and ps.pipeline_id = e.pipeline_id
                                          and ps.status_id = e.status_id
where x.provider = 'flwchat' and x.active and not c.eh_teste
group by c.name, x.config->'etapas_ganho', x.config->>'cards_por_item'
order by 1;
```

### Q8. Glauce, conta final 9641 (e qualquer conta sem token próprio, agora que a VPS não tem META_ADS_TOKEN)

Previsão: a 9641 sem token, sem nenhum dia em meta_ads_daily e só com leitura da Windsor (linhas=0). Se a Glauce tiver outra
conta com dado recente, a 9641 é conta extra ou errada no cadastro.

```sql
with contas as (
  select a.client_id, regexp_replace(a.ad_account_id, '^act_', '') as conta, a.active,
         coalesce(btrim(a.access_token), '') <> '' as tem_token, 'client_ad_accounts' as onde
  from public.client_ad_accounts a
  union all
  select c.id, regexp_replace(c.meta_ad_account_id, '^act_', ''), true, false, 'clients.meta_ad_account_id (Windsor)'
  from public.clients c where coalesce(c.meta_ad_account_id, '') <> ''
)
select c.name, right(k.conta, 4) as final, k.onde, k.active, k.tem_token,
  (select max(d.date) from public.meta_ads_daily d
    where d.client_id = k.client_id and regexp_replace(d.ad_account_id, '^act_', '') = k.conta) as ultimo_dia,
  (select max(d.date) from public.meta_ads_daily d
    where d.client_id = k.client_id and regexp_replace(d.ad_account_id, '^act_', '') = k.conta and d.spend > 0) as ultimo_gasto,
  (select string_agg(s.via || ' linhas=' || coalesce(s.last_rows, 0) || ' ok=' || coalesce(s.last_success_at::date::text, '-')
                     || ' tentou=' || coalesce(s.last_attempt_at::date::text, '-') || coalesce(' erro=' || left(s.last_error, 50), ''), ' | ')
     from public.sync_status_contas s
    where s.client_id = k.client_id and regexp_replace(s.ad_account_id, '^act_', '') = k.conta) as leituras
from contas k join public.clients c on c.id = k.client_id
where c.active and not c.eh_teste and (c.name ilike '%glauce%' or not k.tem_token)
order by (c.name ilike '%glauce%') desc, c.name, final;
```

### Q9. Mariela (e Marcelly, mesma leitura de planilha): o sync da planilha está rodando? A planilha tem semana nova?

Como ler: se ultima_leitura_do_sync for de hoje ou ontem e ultima_analise_com_valor for 21/10, a planilha não foi preenchida
(EQUIPE). Se ultima_leitura_do_sync e last_success_at forem velhos, o sync da planilha parou (NOSSO). O vermelho "Parada" no lugar
de "Sem movimento" indica last_success_at com 2 dias ou mais (status-fonte.ts:118-130). A outra explicação é motivo_dono
diferente de 'manual' (outro gravador por cima do da planilha), e a coluna motivo_dono mostra qual dos dois é.

```sql
select c.name, c.active, coalesce(c.ads_planilha_url, '') <> '' as tem_link_planilha,
  (select max(p.atualizado_em) from public.ads_planilha_semanal p where p.client_id = c.id) as ultima_leitura_do_sync,
  (select max(p.analise_em) from public.ads_planilha_semanal p
    where p.client_id = c.id and p.removido_em is null and p.analise_em <= current_date) as ultima_analise,
  (select max(p.analise_em) from public.ads_planilha_semanal p
    where p.client_id = c.id and p.removido_em is null and p.analise_em <= current_date and p.valor_periodo is not null) as ultima_analise_com_valor,
  (select string_agg(x.analise_em::text || ': ' || x.n || ' linhas, ' || x.v || ' com valor', '; ' order by x.analise_em)
     from (select p.analise_em, count(*) as n, count(p.valor_periodo) as v from public.ads_planilha_semanal p
           where p.client_id = c.id and p.removido_em is null and p.analise_em between '2026-10-01' and current_date
           group by 1) x) as analises_desde_01_10,
  (select count(*) from public.client_ad_accounts a where a.client_id = c.id and a.active) as contas_ads_ativas,
  s.last_attempt_at, s.last_success_at, s.data_ate, left(s.last_error, 120) as erro, s.motivo_dono
from public.clients c
left join public.sync_status s on s.client_id = c.id and s.fonte = 'anuncios'
where not c.eh_teste and (coalesce(c.ads_planilha_url, '') <> '' or c.name ilike '%mariela%')
order by c.name;
```

Leitura extra do Q8 (rodada 3): a segunda parte (`or not k.tem_token`) mostra toda conta sem token próprio. Uma conta com
ultimo_dia até 08/11, leitura via=graph parada em 08/11 e via=windsor linhas=0 lia pela reserva META_ADS_TOKEN da Vercel. Ela
perdeu a leitura na troca e hoje aparece como "ok" com aviso de conta parada (anuncios-status.ts:117-128), e o aviso põe a culpa
no cliente. Se não aparecer nenhuma conta assim, a META_ADS_TOKEN não fazia falta para ninguém.

### Q10. Reservas globais que ainda podem fazer falta (rodada 3)

Q10a. Central de canais oficial (NEXO_META_APP_ID/SECRET/VERIFY_TOKEN e NEXO_CHANNELS_ENCRYPTION_KEY). Algum canal já foi
ligado? Com 0 canais é recurso não ativado. Com canal e credencial cifrada, a chave original tem de voltar (docs/vps.md item 5).

```sql
select (select count(*) from atendimento_operacional.canais) as canais,
       (select count(*) from atendimento_operacional.canais where ativo) as canais_ativos,
       (select max(ultimo_evento_em) from atendimento_operacional.canais) as ultimo_evento,
       (select count(*) from atendimento_operacional.eventos) as eventos;
```

Q10b. Instagram pela Graph sem token próprio. Esses perfis dependiam do META_ACCESS_TOKEN global; sem ele, a rotina das
contas falha. Previsão: 0 linhas com tem_token_proprio=false. Hoje não há vermelho de Instagram no Q2.

```sql
select c.name, i.sync_source,
       coalesce(btrim(s.meta_access_token), '') <> '' as tem_token_proprio
from public.instagram_accounts i
join public.clients c on c.id = i.client_id
left join public.instagram_account_secrets s on s.instagram_account_id = i.id
where i.active and c.active and not c.eh_teste and i.sync_source = 'meta_graph'
order by tem_token_proprio, c.name;
```

## Evidence

- timestamp: 2026-11-11
  checked: src/routes/_authenticated.admin.index.tsx (cartões do topo, linhas 205-409)
  found: |
    Clínicas = listAllClients() (src/lib/admin-data.ts:6-15): clients com eh_teste=false, SEM filtro de active.
    "Precisam de atenção" (l.361) = clínicas com alguma fonte de status.peso >= 2 (amarelo ou vermelho).
    "Fonte parada ou com erro" (l.226-233,406) = número de FONTES vermelhas (soma), nota diz em quantas clínicas.
    "Fonte atrasada" (l.379-384,407) = número de fontes amarelas.
    Status de cada fonte = saudeDaFonte (src/components/source-health.tsx:52) -> statusDaLinha (src/lib/motivos.ts:84-87)
      -> statusDaFonte (src/lib/status-fonte.ts:91-131), com as linhas da RPC status_das_fontes (src/lib/saude-fontes.ts:151-172).
    "Médico sem login" (l.235-251,387) = clínica sem NENHUMA linha em client_members cujo user_id não está em app_admins,
      excluindo Doctor Creator e Douglas Gomides (src/lib/negocio-proprio.ts:4-7). Não olha last_sign_in_at: mede
      "acesso não criado", não "não entra". Conta também clínica inativa.
    "Sem ROI calculável" (l.253-271,386) = clínicas cujo roi_periodo(últimos 30d) dá montarRoi(...).calculavel=false
      (src/lib/roi.ts:215-373). Não exclui negócio próprio nem inativas.
  implication: dois cartões (login e ROI) são critério nosso que precisa ser lido por clínica; os de fonte dependem da regra única de status.

- timestamp: 2026-11-11
  checked: supabase/migrations/20261105130000_resultado_pronto_geral.sql e 20261105120000_resultado_pronto.sql
  found: |
    status_das_fontes() é wrapper com cache de 15 min em resultado_pronto_geral(funcao='status_das_fontes'); o cálculo é
    status_das_fontes_calc() = fontes_base(null) (20261029160000_fontes_e_numeros_unicos.sql:17-72), que só lê clients WHERE active.
    roi_periodo() é wrapper com cache de 20 min em resultado_pronto(funcao='roi_periodo', de, ate); cálculo em roi_periodo_calc.
    Os dois wrappers gravam (INSERT/UPDATE) no cache: não podem ser chamados na leitura de produção.
  implication: dá para ler, só com SELECT, exatamente o JSON que a tela usou (resultado_pronto) ou recalcular via fontes_base/roi_periodo_calc.

- timestamp: 2026-11-11
  checked: src/lib/roi.ts:215-334 e src/lib/limites.ts:7-19 (régua do ROI)
  found: |
    calculavel=false sempre que QUALQUER um destes falha: conta de anúncios ligada; CRM ligado; CRM não compartilhado;
    etapa de venda identificável; >=80% das vendas com valor; >=70% dos leads (pessoas novas) com origem; >=70% das
    vendas com canal conhecido; investimento em aquisição > 0; >=1 venda; >=1 venda de anúncio; >=5 vendas de anúncio.
    O cartão diz "Falta dado para o retorno de 30 dias" para todos esses casos, inclusive "sem investimento",
    "nenhuma venda de anúncio" e "1 a 4 vendas de anúncio" (roi.ts:321-333), que não são falta de dado.
  implication: 20/20 é esperado por construção; o rótulo do cartão é falso para parte das clínicas (critério nosso).

- timestamp: 2026-11-11
  checked: supabase/migrations/20261031110000_roi_receita_dos_anuncios.sql:17-31, 20261101110000_roi_vendas_com_canal.sql:16-17,
           20261030160000_origem_rotulos_anuncio_e_base.sql:11-37, 20261014105000_conversas_origem_anuncio.sql:1-16
  found: |
    "Venda de anúncio" no ROI = card ganho cuja origem texto (crm_leads.source) vira 'Anúncio' em crm_origem_classifica, no
    próprio card ou noutro card da mesma pessoa. O ROI NÃO usa conversas_origem_anuncio (referral do clique-para-WhatsApp
    que o sync do WTS já grava). crm_origem_classifica não reconhece textos como "Meta", "CTWA", "WhatsApp Ads" sozinhos.
  implication: candidato a erro NOSSO de leitura: venda que veio de anúncio pelo WhatsApp e cujo card não tem origem escrita
    conta como "sem origem". Q0 (linha "roi_calc usa conversas_origem_anuncio?") e Q4 (ctwa_sem_anuncio_no_card) medem.

- timestamp: 2026-11-11
  checked: src/lib/status-fonte.ts:87-131, src/lib/saude-problemas.ts:97-117, src/lib/saude-fontes.ts:164-168
  found: |
    (a) "Ligado" = cadastro OU dado gravado OU manual (status-fonte.ts:87-89): fonte desligada (cadastro=false) com dado antigo
        continua "ligada" e fica VERMELHO "Parada" para sempre.
    (b) "Não usa" só vale se a fonte NÃO está ligada (status-fonte.ts:94-96): marcar "É intencional" numa fonte que já teve
        dado não tira o vermelho.
    (c) Planilha de anúncios (semanal) fica VERMELHO com 4 dias (status-fonte.ts:126-130); a aba Problemas usa 10 dias
        (saude-problemas.ts:105-111, LIMITES.planilha.diasParaParada). status_das_fontes nem devolve a coluna planilha.
    (d) "Sem movimento" (cinza) exige última atualização sem erro hoje/ontem (rodouAgora). WhatsApp lido das conversas do
        Kommo não tem linha 'atendimento' em sync_status (só WTS, Clint e Digisac gravam: api/sync/wts.ts:128,
        api/sync/clint.ts:87,160), então nunca é "Sem movimento": 4 dias úteis sem conversa = VERMELHO.
  implication: quatro formas de a regra pintar de vermelho algo que não é falha; Q2 (colunas cadastro, planilha, nao_usa,
    rodou_agora) diz se alguma delas está entre os 3 vermelhos e o 1 amarelo.

- timestamp: 2026-11-11
  checked: .planning/PROJECT.md (Current Milestone) e supabase/migrations/20260822000000_fase1_schema.sql:20-30
  found: |
    O v5 prevê login de médico só na clínica-piloto ("v1 — clínica-piloto Lana (equipe + 1 médico)"). client_members foi
    pensado como "o próprio estrategista + o médico, se tiver login"; quem cria o acesso é a equipe (api/admin/create-user.ts:99).
  implication: "Médico sem login" em 16 clínicas é, por desenho, acesso que a equipe ainda não deu — não falha do cliente.
    Q1 confirma (membros_cliente, cliente_ja_entrou, ultimo_login_cliente).


### Evidência do orquestrador, 11/11/2026 ~19h20 UTC (SELECTs só leitura em produção)

**Q1 Login.** Dados de 20 clínicas fora de teste: 19 ativas e 1 inativa (Juliana Carrion).
- Só 2 clínicas têm usuário de cliente em `client_members`:
  - Lana: 1 viewer, último login em 05/10/2026, há 37 dias.
  - Carrion (inativa): 1 viewer, último login em 28/09.
- As outras 18 ativas têm 0 usuário de cliente. Duas delas são negócio próprio: Doctor Creator e Douglas Gomides.
- Conta: 19 ativas − Lana − 2 negócio próprio = 16. Isso confirma H-LOGIN: o cartão conta "acesso não criado pela equipe". Não conta "médico que não entra".
- O único caso real de "não entra" é a Lana, há 37 dias, e o cartão não pega ele. A Carrion, inativa, não entra na conta.

**Q0 Cache.** O cache roi_periodo de 2026-10-13 a 2026-11-11 tem 20 linhas, calculadas em 2026-11-11 19:10 UTC. O cache está fresco.

**Q3 ROI.** As 20 clínicas estão "bloqueado por item", e nenhuma chega ao motivo final de investimento ou de vendas. O que trava cada uma:
- Doctor Creator (clint): canal 2/26.
- Douglas: sem anúncios e sem CRM.
- Douglas Gomides (clint): valor 0/0, origem 30/58, canal 0/0.
- Antônio Eduardo (kommo): valor 0/1, origem 10/57, canal 0/1.
- Antonione (digisac): etapa de venda não marcada, valor 0/0, origem 59/223, canal 0/0. Investimento 0.
- Keylon: sem CRM. Investimento 4191.
- Sergio Maia (flwchat): valor 1/122, origem 8/13, canal 19/122. 122 ganhos para 13 leads: suspeito de leitura nossa.
- Ana Claudia (kommo): valor 0/1, origem 23/93, canal 0/1.
- Betina: sem CRM.
- Fernanda Nunes (rdstation): valor 0/0, canal 0/0. Nenhuma venda.
- Glauce: sem CRM.
- Juliana Carrion (inativa): sem anúncios e sem CRM.
- Juliana Paola (flwchat): valor 0/0, origem 18/132, canal 0/0. Investimento 8136 e nenhuma venda.
- Lana (kommo): valor 6/46. 46 ganhos e só 6 com valor, sendo 3 de anúncio. É a única que trava num item só.
- Marcella Brasil (flwchat): valor 0/0, origem 1/226, canal 0/0.
- Marcelly Achkar (clint): valor 2/24, canal 16/24. Investimento 0.
- Mariela (flwchat): valor 0/0, origem 2/19, canal 0/0.
- Rafaela (digisac): sem anúncios, etapa de venda não marcada, valor 0/0, canal 0/0.
- Samira (kommo): valor 0/6, origem 20/104, canal 4/6.
- HOMS (kommo): valor 0/2, origem 641/1265.

**Q2 Cores das fontes.** A minha reprodução em SQL marca "VERMELHO: Sem dado" em fontes com cadastro=false, o que diverge do front. A regra `ligado` em SQL pode não bater com `statusDaFonte`. Os vermelhos reais e prováveis, que somam os 3 do cartão, são:
- Glauce, anúncios: "Erro: Conta final 9641 não lida: não tem token próprio e a Windsor não devolve nenhum dado dela". Último sucesso em 01/11; a tentativa de 11/11 falhou.
- Lana, crm: "Erro: Conexão sem token Kommo". Último sucesso em 08/11, dado até 08/11.
- Mariela, anúncios: planilha=true, "Parada" há 21 dias, data_ate 21/10. A planilha semanal não foi atualizada.

Amarelo, o 1 do cartão:
- Lana, atendimento: 3 dias úteis, dado até 08/11. Sai do mesmo Kommo sem token.

As 3 clínicas de "Precisam de atenção" são Glauce, Lana e Mariela.

**Lana: token do Kommo apagado.** Em `crm_connections` (kommo, active=true, criada em 25/08), `access_token` está NULL. O config ainda tem as chaves kommo_* (conversas_ate, contatos_em etc.). O sync funcionou até 08/11, então o token existia e foi apagado ou zerado entre 08 e 11/11.
- PERGUNTA ABERTA, prioridade 1: que código grava `access_token` null? Pode ser refresh OAuth falho, desconexão, a migração para a VPS ou dois processadores (Vercel e VPS) disputando o refresh do token.

### Rodada 2 do debugger (11/11/2026): token do Kommo da Lana

- timestamp: 2026-11-11
  checked: todo caminho que grava em crm_connections (grep em api/, src/, workers/, scripts/, supabase/)
  found: |
    Nenhum código grava access_token null ou vazio. As escritas são só estas:
    - config: clint-sync.ts:247, conversas-clint.ts:88, digisac-sync.ts:384, kommo-contatos.ts:176, conversas-kommo.ts:161,170,
      flwchat-sync.ts:601;
    - webhook_secret: admin-data.ts:101 (renovarWebhookKommo);
    - insert: admin-data.ts:71 (createCrmConnection, com token) e admin-data.ts:87-96 (createKommoWebhookConnection, SEM token);
    - delete: admin-data.ts:111 (apaga a linha, não zera a coluna).
    Nenhuma migração faz UPDATE em crm_connections.access_token; 20261102190000_restos_auditoria.sql:76-100 só tira o SELECT do navegador.
    Não existe refresh OAuth do Kommo no código. O token é de longa duração e não tem refresh_token (docs/apis/kommo.md:67-70;
    comentário em api/sync/kommo-leads.ts:158-160). Por isso não há corrida de refresh entre Vercel e VPS.
  implication: o token da Lana não foi apagado por código nosso; a premissa "existia e foi zerado" precisa ser revista.

- timestamp: 2026-11-11
  checked: git log -S KOMMO_API_TOKEN (5c7adb1 de 26/08, b7311fd de 17/10) e api/sync/kommo-leads.ts:98-103,134-139
  found: |
    O sync do Kommo nasceu em 26/08 (5c7adb1) usando SÓ a variável KOMMO_API_TOKEN do servidor. O commit b7311fd (17/10) diz:
    "Conexão sem token próprio usa KOMMO_API_TOKEN, como o sync de leads (Dra. Lana)". O docs/apis/kommo.md:67 repete:
    "uma conta usa KOMMO_API_TOKEN do servidor". O código faz `conn.access_token || KOMMO_API_TOKEN`
    (kommo-leads.ts:103,139; conversas-kommo.ts:104; manual.ts:562,822). O erro "Conexão sem token Kommo" só sai quando OS DOIS
    faltam (kommo-leads.ts:134-135).
  implication: o access_token da Lana estava NULL desde 25/08, por desenho. A conexão foi criada pelo fluxo de webhook,
    sem token. O que mudou entre 08 e 11/11 foi o servidor: o processo que roda o sync perdeu KOMMO_API_TOKEN.

- timestamp: 2026-11-11
  checked: memória do projeto (publicar-nexo-na-vps) e docs/vps.md da branch origin/codex/hostinger-hub-20261108 (commits 3a5192d e b2a3835, 08/11 14:51 e 15:33)
  found: |
    Desde 08/11/2026 o Nexo e os /api/sync rodam na VPS (serviço Docker Swarm doctor-creator-hub) e a Vercel saiu dos domínios.
    docs/vps.md, item 7: "Credenciais globais legadas só podem ser recuperadas de uma fonte comprovadamente vinculada à mesma conta.
    Validar essa associação antes de configurar o fallback." O commit b2a3835 tirou a Meta da dependência do token global
    (META_ACCESS_TOKEN); para o Kommo nada foi feito. O /readyz da VPS só confere SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e
    SYNC_SECRET (server/vps.ts:99-100), então falta de KOMMO_API_TOKEN não aparece na troca.
  implication: a data bate. O último sucesso foi em 08/11, dia da troca para a VPS. Hipótese H-KOMMO-ENV: o container da VPS não
    tem KOMMO_API_TOKEN. A confirmação vem só de ler os NOMES das variáveis do serviço (sem valores) e o log do sync.

- timestamp: 2026-11-11 (~19h40 UTC)
  checked: VPS por SSH, só leitura. Comandos: `docker service inspect doctor-creator-hub` e, dentro do container, `cut -d= -f1`
    do arquivo de ambiente. Só os nomes das variáveis foram lidos, nenhum valor.
  found: |
    O serviço (criado em 08/11 18:41 UTC, atualizado em 11/11 18:59 UTC) roda `node --env-file=/run/secrets/hub.env build/vps.mjs`.
    O arquivo vem do secret doctor-hub-env-20261108-v1 e tem só 9 variáveis: OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL,
    SYNC_SECRET, VITE_LINK_BASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL, WINDSOR_API_KEY, WTS_API_TOKEN.
    `grep -c '^KOMMO_API_TOKEN=.'` deu 0: NÃO existe KOMMO_API_TOKEN na VPS.
    Também faltam variáveis que o código usa como reserva global: META_ACCESS_TOKEN, META_ADS_TOKEN, META_ADS_WRITE_TOKEN,
    SHORTIO_API_KEY, APIFY_API_TOKEN, CLICKUP_API_TOKEN, NEXO_CHANNELS_ENCRYPTION_KEY e a chave da Anthropic
    (.planning/codebase/INTEGRATIONS.md:182; docs/vps.md item 5).
  implication: H-KOMMO-ENV CONFIRMADA. Lana crm (vermelho) e Lana atendimento (amarelo) têm a mesma causa: a variável não foi
    levada para a VPS na troca de 08/11. O token da clínica não mudou. É erro NOSSO, de configuração do deploy.

- timestamp: 2026-11-11 (~19h50 UTC)
  checked: log da VPS, só leitura (`docker service logs --since 26h`), contando os registros api.completed por endpoint e status
    (o registro não leva payload nem token, observability.ts:27)
  found: |
    sync/kommo-leads: 25 chamadas, as 25 com 207 (deu erro em alguma conexão).
    sync/meta-ads: 8, as 8 com 207.
    sync/meta-graph: 12 com 200 e 64 com 207.
    sync/wts: 18 com 200 e 46 com 207.
    sync/manual: 42 com 200, 5 com 400 e 9 com 503.
    sync/clint: 22 com 200. sync/instagram: 4 com 200. sync/meta-comments: 4 com 200.
  implication: o n8n chama a VPS normalmente; o Kommo falha em toda rodada (Lana). Os 503 do sync/manual são exceção sem
    tratamento. Pode ser falta de outra variável (ver lista acima), mas está fora do escopo dos cartões e fica como risco.

- timestamp: 2026-11-11
  checked: régua do ROI com 0 vendas (src/lib/roi.ts:216-219,268-305) e fonte do investimento
    (supabase/migrations/20261029160000_fontes_e_numeros_unicos.sql:123-127,135-146)
  found: |
    (e) Com 0 ganhos, os itens "valor" (roi.ts:272) e "canal da venda" (roi.ts:296) ficam não feitos e bloqueiam. O texto vira
        "falta preencher o valor da venda", tarefa de CRM do cliente, quando o fato é "nenhuma venda no período". Isso pega
        Douglas Gomides, Antonione, Fernanda Nunes, Juliana Paola, Marcella Brasil, Mariela e Rafaela.
    (f) investido = soma de meta_ads_daily (linhas 123-127, 144). O gasto da planilha (ads_planilha_semanal.valor_periodo) não
        entra, mas tem_anuncios fica true pela planilha (linha 137). Marcelly e Mariela nunca terão ROI, mesmo com CRM perfeito.
  implication: dois critérios NOSSOS a mais no cartão "Sem ROI".

- timestamp: 2026-11-11
  checked: venda no FlwChat (api/_lib/flwchat-sync.ts:13-14,141-145,311-359,408-413,528-532,561-593) e unidades do ROI
    (20261030170000_lead_novo_por_pessoa.sql:120-157,245-247; 20261105100000_perfil_da_clinica_resto.sql:152-156,173-178)
  found: |
    - outcome do card: primeiro crm_etapa_resultado (confirmado pela equipe); senão, o nome da etapa contém
      config.etapas_ganho/perdido; senão, "open" (flwchat-sync.ts:408-413,532). O mapeamento em si não infla.
    - "ganhos" no ROI = count(*) de CARDS ganhos criados no período, em QUALQUER funil (inclusive compra/base) e de QUALQUER
      pessoa (perfil_da_clinica_resto.sql:152-156,176). "leads" = PESSOAS novas (primeiro card no período, em funil de captação,
      sem "Paciente antigo"; lead_novo_por_pessoa.sql:141-157,245-247). São unidades e universos diferentes.
    - Sergio (Support Clinic → WTS): cada item de orçamento e cada mudança de status vira um card novo (flwchat-sync.ts:311-316).
      marcarSubstituidos só marca card ABERTO com sucessor e ganho repetido no MESMO dia com o MESMO valor (linhas 340-349).
      122 cards ganhos são procedimentos liberados de pacientes de toda a base no mês, não 122 vendas para 13 pessoas novas.
    - Preço só vem de monetaryAmount (linha 530). 1/122 com valor quer dizer que o Support Clinic não preenche esse campo,
      ou que o valor vem noutro campo que não lemos. Q7a decide.
    - A listagem v1 só traz cards ABERTOS (linha 13). Card ganho que sai do painel vira "closed" (resultado não informado,
      linhas 561-563,590), nunca "won". Clínica do FlwChat sem etapa final de ganho visível no painel sempre terá 0 vendas
      (Juliana Paola investe 8.136 e tem 0 vendas; Marcella e Mariela também têm 0).
  implication: Sergio = critério NOSSO (unidade de contagem) + valor ausente na origem. Não é bug de mapeamento do outcome.
    Juliana Paola/Marcella/Mariela = provável limitação NOSSA de leitura (v1 só abertos). Q7/Q7b confirmam.

### Rodada 3 (11/11/2026): causa da Lana fechada e variáveis que faltam na VPS

- timestamp: 2026-11-11 (~20h30 UTC)
  checked: confirmação independente do orquestrador (Q6 não rodado; o orquestrador leu a conexão e a VPS)
  found: |
    A conexão Kommo da Lana (26c4f791-...) nunca teve access_token próprio e sempre usou a reserva process.env.KOMMO_API_TOKEN do
    servidor (api/sync/manual.ts:562,822,1332; api/sync/kommo-leads.ts:37; api/_lib/conversas-kommo.ts:104). A migração para a
    VPS em 08/11 não levou a KOMMO_API_TOKEN. O serviço lê o Docker secret doctor-hub-env-20261108-v1, feito de
    /etc/doctor-creator-hub/production.env, e esse arquivo tem 0 variáveis KOMMO. Daí o "Conexão sem token Kommo" desde 08/11.
    A Lana é a única clínica Kommo ativa sem token próprio; as outras 4 têm token.
    Correção escolhida: o João grava o token na própria conexão da Lana com um UPDATE que só ele roda. Assim não volta uma reserva
    global que pode misturar contas (docs/vps.md item 7: credencial global legada só de fonte comprovadamente da mesma conta).
    Variáveis do .env.example que não existem na VPS: ANTHROPIC_API_KEY, CLICKUP_API_TOKEN, KOMMO_API_TOKEN, LINK_BASE_URL,
    META_ACCESS_TOKEN, META_ADS_TOKEN, SHORTIO_DOMAIN, SYNC_DAYS.
  implication: causa da Lana fechada. É erro NOSSO, de migração incompleta; o cliente não mudou nada. A correção não precisa
    de deploy.

- timestamp: 2026-11-11 (~20h40 UTC)
  checked: revisão no ar, por SSH só leitura (git log em /opt/doctor-creator-hub; docker service inspect --format da imagem)
  found: |
    O serviço roda a imagem doctor-creator-hub:bafc5c3, atualizada em 11/11 19:48 UTC. A branch vps/producao, em bafc5c3, é o
    merge de gsd/nexo-v5 (d319b65, o HEAD local) com os commits da VPS (3a5192d, b2a3835, b5994d1). O grep dos nomes de variável
    no código da VPS dá as mesmas linhas do HEAD local. A exceção são meta-graph.ts, meta-comments.ts e backfill-thumbnails.ts:
    na VPS, b2a3835 trocou ali `process.env.META_ACCESS_TOKEN` por `?? ""` e tirou a exigência. As linhas citadas abaixo valem
    para o código no ar.
  implication: o arquivo:linha da tabela de variáveis vale para produção.

- timestamp: 2026-11-11 (~20h45 UTC)
  checked: só os NOMES das variáveis, por SSH só leitura. Fontes: o secret montado no container (cut -d= -f1 /run/secrets/hub.env),
    /etc/doctor-creator-hub/production.env, docker secret ls, docker service inspect (Secrets e Env) e ls com datas em
    /etc/doctor-creator-hub
  found: |
    - O secret ativo é doctor-hub-env-20261108-v1, montado como hub.env. O arquivo active-secret-name diz o mesmo e é de 08/11 18:41.
      Tem 9 nomes: OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, SYNC_SECRET, VITE_LINK_BASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_URL, WINDSOR_API_KEY, WTS_API_TOKEN. O serviço não tem Env fora do arquivo.
    - production.env tem 10 nomes: os 9 acima mais SHORTIO_API_KEY. O arquivo mudou em 08/11 20:10, junto com shortio-ready e
      shortio-recovery.log (recover-shortio.py é de 18:39). A chave do Short.io foi recuperada para o arquivo 1h29 depois de o
      secret v1 ser criado. Docker secret não muda depois de criado e não existe v2, então o processo NUNCA recebeu a
      SHORTIO_API_KEY.
    - Os nomes que o código de servidor lê (grep em api/ server/ workers/ na VPS) e a VPS não tem: KOMMO_API_TOKEN, META_ACCESS_TOKEN,
      META_ADS_TOKEN, META_ADS_WRITE_TOKEN, SHORTIO_API_KEY, LINK_BASE_URL, ANTHROPIC_API_KEY, CLICKUP_API_TOKEN,
      GITHUB_DISPATCH_TOKEN, NEXO_META_APP_ID, NEXO_META_APP_SECRET, NEXO_META_VERIFY_TOKEN, NEXO_CHANNELS_ENCRYPTION_KEY,
      APIFY_API_TOKEN e CREATIVE_* (só no worker), e os nomes de modelo (*_MODELO*, META_GRAPH_VERSION, PORT), que têm padrão.
    - SHORTIO_DOMAIN e SYNC_DAYS: nenhuma leitura no servidor (SHORTIO_DOMAIN não aparece em lugar nenhum; SYNC_DAYS só em
      scripts/sync-instagram.ts:19, script de linha de comando).
  implication: as duas listas se conciliam. O orquestrador comparou o .env.example com o production.env e achou 8 faltas. A
    rodada 2 comparou com o secret, que é o que o processo lê, e por isso também tinha a SHORTIO_API_KEY. APIFY_API_TOKEN e
    NEXO_CHANNELS_ENCRYPTION_KEY não estão no .env.example. A APIFY nem é variável da VPS: o worker criativo roda no GitHub Actions
    com secret próprio (.github/workflows/creative-worker.yml:35-37).

- timestamp: 2026-11-11 (~20h50 UTC)
  checked: caminho da conta 9641 da Glauce. Arquivos: api/_lib/meta-ads-graph-sync.ts:320-334, api/_lib/anuncios-status.ts:84-131,271-287,
    api/sync/meta-ads.ts:76-86,121-130. git log -S do texto do erro e da regra de pular conta sem token
  found: |
    - A Graph usa `conta.access_token || env.accessToken` (env.accessToken é a META_ADS_TOKEN) e PULA a conta quando os dois
      faltam, sem gravar leitura (meta-ads-graph-sync.ts:327-334, regra de 01/10, 7c14e52). Toda conta sem token é lida pela
      Windsor (5229f39, 01/10).
    - "não lida: não tem token próprio e a Windsor não devolve" (anuncios-status.ts:113-116) só sai quando três coisas valem
      juntas: nenhuma leitura boa nas últimas 48 h; a Windsor voltou vazia; e a conta NÃO tem nenhum dia em meta_ads_daily nos
      últimos 120 dias (ultimoDado = max(date) por cliente e conta, anuncios-status.ts:279-283).
    - O texto e a regra por conta nasceram em db36241, em 01/11/2026 18:25 UTC, ainda na Vercel. O último sucesso da fonte
      anúncios da Glauce é 01/11. Antes, o status juntava as contas do cliente e escondia a 9641.
    - Conciliação: se a META_ADS_TOKEN da Vercel lesse a 9641, haveria dia em meta_ads_daily (ultimoDado recente), e o estado
      hoje seria "ok" (com aviso de conta parada), nunca "não lida". Se a reserva existia sem acesso, de 01/11 a 08/11 o erro era
      o da Graph ("(#200) ... ads_read"). Na VPS a Graph pula a conta e o texto virou o de "não lida". Nos dois casos ninguém
      lia a 9641 antes da troca.
  implication: a falta da META_ADS_TOKEN não causou o erro da Glauce. Pôr a reserva de volta também não recupera a conta, a não
    ser que a reserva seja de uma BM com acesso à 9641, e o histórico diz que não é. A conta volta com ads_read ou token próprio,
    com ligação na Windsor ou desativando a conta. A data de 01/11 é da regra nova, não de uma quebra. Q8 confirma.

- timestamp: 2026-11-11 (~20h55 UTC)
  checked: todo uso de META_ACCESS_TOKEN no código no ar (manual.ts:133,449-456,489,707,746; meta-graph.ts:19 na VPS;
    shortio-sync.ts:106; transcrever-reels.ts:83-100) e o executar do botão (manual.ts:655-684)
  found: |
    Todos os caminhos usam primeiro o token da conta (instagram_account_secrets) e deixam a variável como reserva. A exceção é
    sincronizarPosts: com perfil sync_source='meta_graph', manual.ts:449-451 lança "Perfil servido pela Meta Graph API, mas
    META_ACCESS_TOKEN não está configurado no servidor". Isso acontece mesmo que o perfil tenha token próprio, e o
    runMetaGraphSync já usa o token da conta (meta-graph-sync.ts:757). O executar grava o erro em sync_status instagram
    (manual.ts:660-663). Na VPS, clicar em Sincronizar (posts ou tudo) numa clínica com Instagram pela Graph pinta o Instagram
    dela de VERMELHO "Erro" até a próxima rodada agendada boa. b2a3835 corrigiu meta-graph.ts, meta-comments.ts e
    backfill-thumbnails.ts, mas não este caminho.
  implication: bug NOSSO latente, que veio com a migração. Hoje não está nos cartões (Q2 sem vermelho de Instagram), mas o
    próximo clique no botão cria um vermelho falso. A correção é no código, sem pôr a variável global de volta.

- timestamp: 2026-11-11 (~21h UTC)
  checked: LINK_BASE_URL e Links. Arquivos: src/lib/rastreio.ts:90-101; api/sync/manual.ts:958-959,1040; src/routes/_authenticated.$clientId.links.tsx:31,42,95,146-148;
    vercel.json:12-13; server/vps.ts (rewrites preservados). Também comparei, por SSH e sem imprimir, o VITE_LINK_BASE_URL da VPS
    com o padrão
  found: |
    O servidor lê SÓ LINK_BASE_URL (manual.ts:959), não lê VITE_LINK_BASE_URL. Sem a variável, baseDoLink devolve
    LINK_BASE_PADRAO = https://dash.doctorcreator.com.br (rastreio.ts:91,94-96). A tela lê SÓ VITE_LINK_BASE_URL, no build
    (links.tsx:31). A comparação deu "igual_ao_padrao_dash": a tela e o servidor geram o mesmo domínio. O /r/:slug é servido pelo
    hub (vercel.json:12-13, reescrita preservada no server/vps.ts) nos domínios que apontam para a VPS, dash incluso.
    SHORTIO_DOMAIN não é lida em lugar nenhum. A SHORTIO_API_KEY só serve aos links antigos do short.gy: o sync dentro de
    sync/meta-ads (meta-ads.ts:189-203, grava o status 'shortio' em sync_status_geral) e o botão de cliques legado (manual.ts:1161-1163).
  implication: LINK_BASE_URL ausente não quebra nada hoje. É padrão igual ao valor da tela; vale pôr no próximo secret para
    não divergir se o domínio mudar. SHORTIO_DOMAIN é legado. Desde 08/11 os cliques dos links antigos do short.gy estão
    congelados, enquanto os links próprios (/r/<nome>) funcionam.

- timestamp: 2026-11-11 (~21h UTC)
  checked: ANTHROPIC_API_KEY (api/_lib/ia.ts:52,161,192-215,223), CLICKUP_API_TOKEN (agentes.ts:51,218; manual.ts:157-178,
    AGENTES_DESLIGADOS), GITHUB_DISPATCH_TOKEN (manual.ts:1070-1071; creative-worker.yml:7-9), META_ADS_WRITE_TOKEN
    (anuncios-acoes.ts:14,51; agentes-ia.tsx:251), NEXO_* (central-canais.ts:13,42-43; docs/operacao-verificavel.md:53-60)
  found: |
    - ANTHROPIC_API_KEY: reserva da OpenAI, que está presente. Sem ela, quando a OpenAI der 401/402/403/429/5xx, não há segunda
      tentativa. O comentário em meta-graph-sync.ts:845 ("só roda com ANTHROPIC_API_KEY") está velho: conteudo-ia.ts:118-119
      aceita qualquer uma das duas.
    - CLICKUP_API_TOKEN: só a ferramenta clickup.ler_tarefa dos agentes, e os agentes estão desligados desde 11/11 por decisão do
      João (AGENTES_DESLIGADOS).
    - GITHUB_DISPATCH_TOKEN: sem ele o "rodar agora" da Inteligência Criativa responde sem_token/agendado. O cron de 10 min do
      GitHub roda o trabalho.
    - META_ADS_WRITE_TOKEN: a ação de 1 clique nos anúncios nunca foi ligada. A tela já diz "aguardando o token" e ainda cita a
      Vercel.
    - NEXO_*: a central de atendimento oficial está em "ativação assistida" pendente. Sem as 4 variáveis, conectar e enviar
      respondem 503 "configuração do aplicativo Meta pendente" (central-canais.ts:42). Q10a diz se algum canal chegou a ser ligado.
  implication: nada disso mexe nos cartões da Carteira. A tabela de variáveis em Resolution diz o que importa.

## Eliminated

- hypothesis: "Algum código nosso (refresh OAuth em 401/invalid_grant, desconectar, migração) gravou null no access_token da Lana"
  evidence: nenhum UPDATE de access_token no repositório; não há refresh OAuth do Kommo (token de longa duração, sem refresh_token);
    o desconectar apaga a linha (admin-data.ts:111), e a linha da Lana ainda existe, criada em 25/08. Commit b7311fd e
    docs/apis/kommo.md:67 mostram que a conexão da Lana nunca teve token próprio.
  timestamp: 2026-11-11

- hypothesis: "Vercel e VPS renovando o token do Kommo ao mesmo tempo se invalidaram (rotação de refresh token)"
  evidence: o código não faz refresh do Kommo; o token é de longa duração (docs/apis/kommo.md:67-70). Sem refresh, não há rotação nem corrida.
  timestamp: 2026-11-11

- hypothesis: "RLS esconde client_members do admin e infla 'Médico sem login'"
  evidence: policy "read own membership or admin reads all" (20260824170000_admin_roles.sql:44-46, ajustada em
    20261021290000_desempenho_indices_rls.sql:27-28) deixa o admin ler todas as linhas; app_admins é legível por admin
    (20260824190000_fix_rls_security_holes.sql:10-12). Resta só o limite de 1000 linhas do PostgREST (a leitura não tem
    .limit/paginação, admin.index.tsx:240) — Q1 traz total_linhas_client_members para descartar.
  timestamp: 2026-11-11

- hypothesis: "Erro na RPC de ROI conta como 'Sem ROI'"
  evidence: getRoiPeriodo lança no erro (client-data.ts:900-903); com a query em erro, roiDe devolve null e semRoi é false
    (admin.index.tsx:263-271). Erro deixa o cartão em "…" ou tira a clínica da conta, não soma.
  timestamp: 2026-11-11

- hypothesis: "A falta de META_ADS_TOKEN na VPS (desde 08/11) causou o 'Conta final 9641 não lida' da Glauce"
  evidence: o erro existe desde 01/11, ainda na Vercel, quando entrou a regra por conta (db36241). O estado "não lida" exige
    nenhum dia da conta em meta_ads_daily nos últimos 120 dias (anuncios-status.ts:113, 279-283), ou seja, a reserva da Vercel
    também não lia a 9641. Na VPS mudou só o texto: de erro da Graph, se havia reserva sem acesso, para "não lida".
  timestamp: 2026-11-11

- hypothesis: "Sem LINK_BASE_URL os links rastreados saem com domínio errado ou quebrado"
  evidence: o padrão do servidor (rastreio.ts:91) é igual ao VITE_LINK_BASE_URL da VPS (comparado sem imprimir), e o /r/:slug é
    servido pelo hub nesse domínio (vercel.json:12-13, preservado no server/vps.ts).
  timestamp: 2026-11-11

- hypothesis: "APIFY_API_TOKEN faltando na VPS desliga o radar de mercado"
  evidence: só o worker criativo lê a variável (workers/creative/providers.ts:201, main.ts:45-47), e ele roda no GitHub Actions
    com secret próprio (.github/workflows/creative-worker.yml:35-37), não na VPS.
  timestamp: 2026-11-11

## Resolution

root_cause (rodada 3; "a confirmar (Qn)" = depende dos SELECTs pendentes, que não mudam a causa, só o "de quem" da linha):
- Cartão "Médico sem login" (16): critério NOSSO. O cartão conta "nenhum usuário de cliente criado" (admin.index.tsx:235-251),
  não "ninguém entra". Q1: 16 = 19 ativas − Lana − 2 de negócio próprio. O único caso real de "não entra" é a Lana (37 dias), e o
  cartão não pega.
- Cartão "Sem ROI calculável" (20/20): critério NOSSO. Junta 6 motivos sob "falta dado". Com 0 vendas, os itens "valor" e "canal"
  travam como se fossem tarefa do cliente (roi.ts:272,296). O gasto da planilha não entra no investimento
  (20261029160000_fontes_e_numeros_unicos.sql:123-127,144), e a inativa e o negócio próprio entram na conta. O que sobra como
  problema DO CLIENTE: valor e origem no CRM, CRM não ligado e etapa de venda não marcada.
- Lana crm (vermelho) e Lana WhatsApp (amarelo; vermelho a partir de 12/11): NOSSO, migração incompleta. A conexão Kommo da Lana
  nunca teve access_token e dependia da reserva KOMMO_API_TOKEN do servidor (kommo-leads.ts:98-103,134-139;
  conversas-kommo.ts:104). A troca para a VPS em 08/11 não levou a variável (secret doctor-hub-env-20261108-v1 com 0 KOMMO).
  Nada apagou o token. AND-gate: a falha só acontece com as duas coisas juntas.
- Glauce anúncios (vermelho): a conta final 9641 não é lida por via nenhuma, por falta de acesso. É do cliente ou da equipe, não
  é bug, e não tem relação com a META_ADS_TOKEN: a conta já não era lida na Vercel, e o 01/11 é a data da regra por conta. Q8 diz
  se a conta é usada.
- Mariela anúncios (vermelho, 21 dias): a planilha semanal parou. Q9 decide entre sync parado (NOSSO) e planilha não preenchida
  (EQUIPE).
- Sergio Maia, 122 ganhos para 13 leads: critério NOSSO, de unidade. O ROI conta cards ganhos de toda a base e compara com pessoas
  novas. O valor ausente (1/122) vem da origem (a confirmar Q7a).
- Juliana Paola, Marcella e Mariela com 0 vendas: provável leitura NOSSA. A v1 do FlwChat só lista cards abertos, e o ganho
  fechado vira "closed" (a confirmar Q7b).
- Fora dos cartões, mas da mesma migração: o processo da VPS nunca recebeu a SHORTIO_API_KEY. Ela foi recuperada no
  production.env depois do secret v1, e o secret nunca foi recriado. Com isso o short.gy está congelado desde 08/11. Além disso,
  o botão Sincronizar ainda exige META_ACCESS_TOKEN para Instagram pela Graph (manual.ts:449-451), o que dá vermelho falso
  quando alguém clica.

### Tabela por clínica

| clínica | problema/cartão | causa provável | evidência (SQL ou arquivo:linha) | de quem | correção proposta | quem resolve |
|---|---|---|---|---|---|---|
| 16 ativas (todas menos Lana, Doctor Creator e Douglas Gomides) | Médico sem login | O cartão conta acesso que a equipe não criou. No v5 só a piloto Lana tem login previsto. | Q1; admin.index.tsx:235-251; PROJECT.md (v1 = piloto Lana) | NOSSO: critério | Contar só "login previsto e não criado" e "acesso criado e sem entrar há mais de 14 dias" | dev; João decide quem ganha login |
| Todas (20/20) | Sem ROI calculável | 6 motivos sob "falta dado". Com 0 vendas, "valor" e "canal" travam como higiene do CRM. Entram a inativa e o negócio próprio. | Q3; roi.ts:272,296,319-333; admin.index.tsx:253-271 | NOSSO: critério | Separar em "falta ligar fonte", "CRM incompleto (cliente)" e "sem venda ou sem investimento"; tirar a inativa e o negócio próprio | dev |
| Lana | Fonte parada: CRM ("Conexão sem token Kommo"), desde 08/11 | A conexão nunca teve token próprio e usava a KOMMO_API_TOKEN do servidor. A migração para a VPS em 08/11 não levou a variável. Única clínica Kommo ativa sem token próprio. | secret doctor-hub-env-20261108-v1 e production.env com 0 KOMMO; kommo-leads.ts:37,98-103,134-139; manual.ts:562,822,1332; commit b7311fd; log 25/25 chamadas com 207; confirmação do orquestrador (Q6 reforça) | NOSSO: sync/deploy (migração incompleta) | Gravar o token próprio de longa duração na conexão da Lana, sem reserva global (docs/vps.md item 7). Depois rodar o sync de leads para cobrir 08 a 11/11 | João (UPDATE com o token, que só ele roda) + dev (rodar o sync e conferir sync_status) |
| Lana | Fonte atrasada: WhatsApp (3 dias úteis; vermelho a partir de 12/11) | A mesma reserva: conversas e contatos do Kommo usam `access_token \|\| KOMMO_API_TOKEN` | conversas-kommo.ts:104; kommo-leads.ts:81,114; kommo-contatos.ts:160; Q2 | NOSSO: sync/deploy | O mesmo UPDATE; depois rodar kommo-leads?conversas=1&dias=7 | João + dev |
| Lana | Sem ROI | Valor em 6 de 46 ganhos (13%). Os dados param em 08/11. | Q3 | DO CLIENTE: dado (+ NOSSO: 3 dias sem sync) | Preencher o valor ao marcar ganho no Kommo | clínica, cobrada pela equipe |
| Lana | Não entra no painel (o cartão não pega) | Viewer criado; último login em 05/10, há 37 dias | Q1 | DO CLIENTE: uso | Falar com a médica; o cartão novo de "sem entrar" pegaria | equipe |
| Glauce | Fonte parada: anúncios ("Conta final 9641 não lida") | A conta não tem token próprio, a Windsor volta vazia e não há nenhum dia em 120 dias. Nunca foi lida. O "desde 01/11" é a data da regra por conta, não de uma quebra. A META_ADS_TOKEN não é a causa. | anuncios-status.ts:113-116,279-283; meta-ads-graph-sync.ts:327-334; db36241 (01/11 18:25 UTC); Q5b; a confirmar (Q8) | DO CLIENTE: conexão (ou EQUIPE, se a conta é errada ou não usada) | Se a conta é usada: o dono dá ads_read à BM da Doctor Creator e o token vai para client_ad_accounts, ou a equipe liga a conta na Windsor. Se não é usada: desativar no cadastro | clínica + equipe |
| Glauce | Sem ROI | Sem CRM | Q3 | DO CLIENTE: conexão | Ligar o CRM ou marcar "não usa" | equipe |
| Mariela | Fonte parada: anúncios (planilha, 21 dias, dados até 21/10) | Nenhuma semana com "Valor no Período" depois de 21/10. O vermelho no lugar de "Sem movimento" indica sync sem sucesso nos últimos 2 dias, ou motivo_dono diferente de 'manual'. | Q2; status-fonte.ts:118-130; ads-planilha-sync.ts:279-325; meta-ads.ts:133-149; a confirmar (Q9) | a confirmar (Q9): NOSSO (sync) ou EQUIPE (planilha) | Se o sync está velho: achar por que a leitura da planilha não roda na VPS. Se o sync está recente: a equipe preenche as semanas de 28/10, 04/11 e 11/11. Planilha semanal fica vermelha com 10 dias, não 4 | dev ou equipe |
| Mariela | Sem ROI | 0 vendas (valor 0/0, canal 0/0) e origem 2/19. O investimento é sempre 0, porque o ROI não lê a planilha. | Q3; 20261029160000_fontes_e_numeros_unicos.sql:123-127,144; flwchat-sync.ts:13,561-563; a confirmar (Q7b) | NOSSO: leitura (gasto da planilha, ganho do FlwChat) + DO CLIENTE: origem | O ROI soma o valor_periodo da planilha; ler o ganho do FlwChat pela v2 | dev + clínica |
| Sergio Maia | Sem ROI; 122 ganhos para 13 leads | Unidades diferentes: cards ganhos de qualquer funil e paciente contra pessoas novas. No Support Clinic cada item de orçamento vira um card. O valor só vem de monetaryAmount, que vem em 1 de 122. Origem 8/13. | flwchat-sync.ts:311-316,340-349,530,532; perfil_da_clinica_resto.sql:152-156,176; lead_novo_por_pessoa.sql:141-157,245-247; a confirmar (Q7, Q7a) | NOSSO: critério (unidade) + DO CLIENTE/integração: valor | Contar venda por pessoa ou orçamento, no mesmo universo dos leads; ler o valor se vier noutro campo (Q7a); senão, pedir ao Support Clinic | dev + equipe |
| Juliana Paola | Sem ROI (investe 8.136 e tem 0 vendas) | Provável: a v1 só lista cards abertos, e o ganho fechado vira "closed". Origem 18/132. | flwchat-sync.ts:13,141-145,561-563,590; Q3; a confirmar (Q7b) | NOSSO: leitura (+ DO CLIENTE: origem) | Ler pela /crm/v2/panel/card com status WON/LOST (comparar v1 e v2 antes), ou manter os ganhos numa etapa final mapeada | dev; equipe mapeia a etapa |
| Marcella Brasil | Sem ROI | 0 vendas (mesma causa provável do FlwChat) e origem 1/226 | Q3; a confirmar (Q7b) | NOSSO: leitura + DO CLIENTE: origem | A mesma correção do FlwChat; a clínica preenche a origem | dev + clínica |
| Antônio Eduardo | Sem ROI | Valor 0/1, origem 10/57 (18%), canal 0/1 | Q3 | DO CLIENTE: dado | Preencher a origem do lead e o valor ao ganhar, no Kommo | clínica |
| Ana Claudia | Sem ROI | Valor 0/1, origem 23/93 (25%), canal 0/1 | Q3 | DO CLIENTE: dado | A mesma da linha acima | clínica |
| Samira | Sem ROI | Valor 0/6, origem 20/104 (19%), canal 4/6 | Q3 | DO CLIENTE: dado | A mesma da linha acima | clínica |
| HOMS | Sem ROI | Valor 0/2, origem 641/1265 (51%) | Q3 | DO CLIENTE: dado | A mesma da linha acima | clínica |
| Marcelly Achkar | Sem ROI | Valor 2/24, canal 16/24. Investimento 0, porque o gasto da planilha não entra. | Q3; 20261029160000_fontes_e_numeros_unicos.sql:123-127,144 | DO CLIENTE: valor + NOSSO: planilha fora do ROI | Preencher o valor no Clint; o ROI soma a planilha | clínica + dev |
| Antonione | Sem ROI | Etapa de venda não marcada, 0 vendas, origem 59/223, investimento 0 | Q3 | EQUIPE: mapear a etapa (+ DO CLIENTE: origem) | Marcar a etapa de venda em "A analisar". Sem investimento no período, o ROI não calcula do mesmo jeito | equipe |
| Rafaela | Sem ROI | Sem anúncios e etapa de venda não marcada | Q3 | EQUIPE: cadastro/mapeamento | Ligar a conta de anúncios ou marcar "não usa"; mapear a etapa | equipe |
| Keylon | Sem ROI | Sem CRM, com 4.191 investidos | Q3 | DO CLIENTE: conexão | Ligar o CRM que a clínica usa | equipe |
| Betina | Sem ROI | Sem CRM | Q3 | DO CLIENTE: conexão | Ligar o CRM ou marcar "não usa" | equipe |
| Fernanda Nunes | Sem ROI | Nenhuma venda marcada como ganha no RD Station em 30 dias | Q3 | DO CLIENTE: uso (a confirmar com a clínica) | Confirmar se a clínica marca ganho no RD | equipe |
| Doctor Creator (negócio próprio) | Sem ROI | Canal da venda em 2 de 26 | Q3 | EQUIPE: dado + NOSSO: negócio próprio no cartão | Registrar a origem de quem compra; tirar o negócio próprio do cartão | equipe + dev |
| Douglas Gomides (negócio próprio) | Sem ROI | 0 vendas no período; origem 30/58 | Q3 | EQUIPE: uso + NOSSO: negócio próprio no cartão | Marcar ganho no Clint; tirar o negócio próprio do cartão | equipe + dev |
| Douglas | Sem ROI e sem login | Nenhuma fonte ligada (sem anúncios, CRM ou login). Parece cadastro de teste ou duplicado. | Q1; Q3 | EQUIPE: cadastro | Confirmar; se for teste, marcar eh_teste ou desativar | João |
| Juliana Carrion (inativa) | Sem ROI | Inativa contada no 20/20 | admin.index.tsx:253-271 (sem filtro de active); Q1 | NOSSO: critério | Tirar inativas do cartão | dev |
| Clínicas com Instagram pela Graph (risco; fora dos cartões hoje) | Vermelho falso "Erro" no Instagram depois de clicar em Sincronizar | manual.ts:449-451 exige META_ACCESS_TOKEN, mesmo com token por conta. O erro é gravado em sync_status instagram. | manual.ts:449-451,660-663; meta-graph-sync.ts:757; b2a3835 não cobriu esse caminho; Q10b | NOSSO: sync (migração) | Usar o token da conta como em meta-graph.ts:19 (VPS) e não exigir a variável | dev |
| Todas com link antigo do short.gy (fora dos cartões) | Cliques do short.gy congelados desde 08/11 | O processo nunca recebeu a SHORTIO_API_KEY: a chave entrou no production.env depois do secret v1 | secret v1 (9 nomes) x production.env (10 nomes, 08/11 20:10); meta-ads.ts:189-203; manual.ts:1161-1163 | NOSSO: deploy | Criar o secret v2 a partir do production.env e trocar no serviço | dev, com o aval do João |

### Variáveis que faltam na VPS (código no ar: vps/producao bafc5c3)

| variável | onde é lida (arquivo:linha) | o que quebra sem ela | importa? | correção |
|---|---|---|---|---|
| KOMMO_API_TOKEN | api/sync/kommo-leads.ts:37,81,98-103,114,134-139,163; api/_lib/conversas-kommo.ts:104; api/_lib/kommo-contatos.ts:160; api/sync/manual.ts:562-568,822,1332; api/sync/clint.ts:62 → conferencia-crm.ts:65 | Toda leitura do Kommo de conexão sem token próprio: leads, conversas (WhatsApp), contatos, conferência do CRM e botão Sincronizar. Hoje só a Lana: "Conexão sem token Kommo" | Sim, só para a Lana | Token próprio na conexão da Lana (UPDATE do João). NÃO repor a variável global (docs/vps.md item 7). Depois do UPDATE, a variável vira legado |
| META_ADS_TOKEN | api/sync/meta-ads.ts:78,95,121; api/sync/manual.ts:254,289,321; api/_lib/meta-ads-graph-sync.ts:28,324-334; api/_lib/meta-token-validade.ts:108 | Conta de anúncio sem token próprio deixa de ser tentada pela Graph e fica só na Windsor. A conferência de dados dos anúncios perde a reserva. NÃO causa o erro da Glauce | Legado (reserva); importa só se alguma conta sem token próprio era lida por ela e a Windsor não cobre: a confirmar (Q8, parte "not tem_token") | Não repor a global; conta que precisar ganha token em client_ad_accounts ou entra na Windsor |
| META_ACCESS_TOKEN | api/sync/manual.ts:133,449-451 (obrigatória), 489, 707, 746; api/sync/meta-graph.ts:19, meta-comments.ts:17, backfill-thumbnails.ts:16 (opcional na VPS desde b2a3835); api/_lib/shortio-sync.ts:106; api/_lib/transcrever-reels.ts:83 | As rotinas usam o token por conta. O botão Sincronizar (posts/tudo) de perfil meta_graph lança erro e grava vermelho falso no Instagram | Sim, só pelo bug do botão; como reserva é legado | Dev: tirar a exigência em manual.ts:449-451; não repor a global. Q10b confirma que todo perfil meta_graph tem token próprio |
| SHORTIO_API_KEY | api/sync/meta-ads.ts:189-203; api/sync/manual.ts:1161-1163 | O sync dos links antigos do short.gy não roda (cliques congelados; status 'shortio' em sync_status_geral parado), e o botão de cliques legado responde "Só admin, com SHORTIO_API_KEY configurada". Os links próprios /r/<nome> não dependem dela | Sim, para os links antigos | Já está no production.env (recuperada 08/11 20:10). Criar o secret v2 a partir dele e trocar no serviço com `docker service update --secret-rm/--secret-add` (reinicia só o container; nunca a VPS) |
| LINK_BASE_URL | api/sync/manual.ts:958-959 → src/lib/rastreio.ts:91-101 (o servidor NÃO lê VITE_LINK_BASE_URL; a tela lê só VITE_LINK_BASE_URL em links.tsx:31) | Nada: o padrão https://dash.doctorcreator.com.br é igual ao VITE_LINK_BASE_URL da VPS, e o hub serve /r/:slug nesse domínio | Tem padrão (igual) | Opcional: no secret v2, pôr LINK_BASE_URL com o mesmo valor do VITE_LINK_BASE_URL |
| SHORTIO_DOMAIN | nenhuma (grep vazio no repo e em /opt/doctor-creator-hub) | Nada | Legado | Tirar do .env.example:22 |
| SYNC_DAYS | scripts/sync-instagram.ts:19 (script de linha de comando, padrão 365) | Nada no servidor | Legado (só script) | Nenhuma; opcional tirar do .env.example:30 |
| ANTHROPIC_API_KEY | api/_lib/ia.ts:52,161,198-199,223; conteudo-ia.ts:118-119; resumo-conversa.ts:60; sessao-ia.ts:44; sap-gerar.ts:107 | Nada enquanto a OPENAI_API_KEY (presente) responder. Sem ela não há segunda tentativa quando a OpenAI falhar (ia.ts:192-215) | Reserva de IA | Opcional: repor quando houver chave. Corrigir o comentário velho em meta-graph-sync.ts:845 |
| CLICKUP_API_TOKEN | api/_lib/agentes.ts:51,218 (src/lib/agentes-data.ts:86 mostra a pendência) | A ferramenta clickup.ler_tarefa dos agentes pausaria com "Configuração pendente" | Legado agora: agentes desligados desde 11/11 (AGENTES_DESLIGADOS, manual.ts:157-178) | Nenhuma enquanto os agentes estiverem desligados |
| APIFY_API_TOKEN (fora do .env.example) | workers/creative/providers.ts:201; workers/creative/main.ts:45-47 | Nada na VPS: o worker roda no GitHub Actions com secret próprio (creative-worker.yml:35-37) | Não é variável da VPS | Nenhuma (corrige a lista da rodada 2) |
| NEXO_CHANNELS_ENCRYPTION_KEY + NEXO_META_APP_ID, NEXO_META_APP_SECRET, NEXO_META_VERIFY_TOKEN (fora do .env.example) | api/_lib/central-canais.ts:13,42-43 | Central de atendimento oficial: conectar e enviar respondem 503 "configuração do aplicativo Meta pendente"; o histórico continua | Recurso não ativado (ativação assistida pendente, docs/operacao-verificavel.md:53-60); a confirmar (Q10a) | Com 0 canais, nada. Se houver canal, recuperar a chave ORIGINAL (outra chave não decifra; docs/vps.md item 5) |
| META_ADS_WRITE_TOKEN (fora do .env.example) | api/_lib/anuncios-acoes.ts:14,51; src/components/agentes-ia.tsx:251 | A ação de 1 clique nos anúncios fica "ainda não configurado" | Recurso não ativado | Nenhuma agora; trocar "na Vercel" por "no servidor" nos textos |
| GITHUB_DISPATCH_TOKEN (fora do .env.example) | api/sync/manual.ts:1070-1071 | O "rodar agora" da Inteligência Criativa vira "agendado"; o cron de 10 min do GitHub roda (creative-worker.yml:7-9) | Tem padrão (atraso de até 10 min) | Opcional |
| Nomes de modelo (*_MODELO*, CLASSIFICADOR_*, TRANSCRICAO_MODELO), META_GRAPH_VERSION, META_GRAPH_API_VERSION, PORT | api/_lib/ia.ts e vizinhos; meta-graph-versao.ts:5; central-meta.ts:77; server/vps.ts:151 | Nada | Tem padrão | Nenhuma |

Observação: o /readyz só confere SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SYNC_SECRET (server/vps.ts:99-100). Foi por isso que
a falta de reserva não apareceu na troca.

### Correções em ordem de prioridade

NOSSO (dev):
1. Urgente, Lana: o João grava o token (item 1 da lista de baixo). Em seguida, rodar sync/kommo-leads da conexão (cobre de 08 a
   11/11) e kommo-leads?conversas=1&dias=7, e conferir crm e atendimento verdes em sync_status. A partir de 12/11 o WhatsApp dela
   fica vermelho.
2. Secret da VPS: criar o doctor-hub-env-<data>-v2 a partir do /etc/doctor-creator-hub/production.env, que já tem a
   SHORTIO_API_KEY (opcionalmente com LINK_BASE_URL igual ao VITE_LINK_BASE_URL). Trocar no serviço e guardar o v1 para voltar.
   Sem KOMMO_API_TOKEN, META_ADS_TOKEN ou META_ACCESS_TOKEN globais. Reinicia só o container, nunca a VPS.
3. manual.ts:449-451: o botão Sincronizar não deve exigir META_ACCESS_TOKEN para perfil meta_graph (usar o token da conta, como
   a VPS já faz em meta-graph.ts:19). Assim o clique para de gravar vermelho falso no Instagram.
4. Aviso de reserva: o /readyz ou a Saúde das fontes deve listar conexão que depende de reserva global ausente (Kommo sem token
   próprio; conta de anúncio sem token e sem Windsor). "Conexão sem token Kommo" passa a dizer "e o servidor não tem reserva".
5. Cartão "Sem ROI": separar os motivos. Com 0 vendas, dizer "nenhuma venda" em vez de "falta valor/canal" (roi.ts:272,296).
   Tirar a inativa e o negócio próprio.
6. Cartão "Médico sem login": contar só quem tem login previsto e quem não entra há N dias.
7. ROI soma o gasto da planilha (Marcelly, Mariela).
8. FlwChat: ler o ganho fechado pela v2 (Juliana Paola, Marcella, Mariela). Confirmar com Q7b antes.
9. ROI: contar venda por pessoa ou orçamento, no mesmo universo dos leads (Sergio).
10. Mariela: se Q9 mostrar o sync da planilha parado, consertar. Planilha semanal fica vermelha com 10 dias, não 4.
11. Limpeza: tirar SHORTIO_DOMAIN e SYNC_DAYS do .env.example; trocar "na Vercel" por "no servidor" (anuncios-acoes.ts:51,
    agentes-ia.tsx:251, comentário em manual.ts:1062); corrigir o comentário de meta-graph-sync.ts:845.

CLIENTE/EQUIPE (João):
1. Lana: gravar o token próprio de longa duração na conexão Kommo dela, com o UPDATE que só o João roda. O token tem de vir de
   fonte comprovadamente da conta da Lana, como um token novo do admin do Kommo da clínica (docs/vps.md item 7).
2. Autorizar a troca do secret da VPS (item 2 de cima), que reinicia o container.
3. Rodar Q6 a Q10 quando puder, para fechar as linhas "a confirmar".
4. Glauce, conta 9641 (depois do Q8): o dono dá ads_read à BM da Doctor Creator, ou a equipe liga a conta na Windsor, ou
   desativa a conta se ela não é usada.
5. Mariela: preencher a planilha das semanas que faltam, se Q9 mostrar que o sync está lendo.
6. Higiene do CRM:
   - valor ao ganhar: Lana, Samira, HOMS, Marcelly, Antônio, Ana Claudia;
   - origem do lead: Antônio, Ana Claudia, Samira, HOMS, Marcella, Mariela, Juliana Paola, Antonione.
7. Mapear a etapa de venda: Antonione e Rafaela.
8. Ligar o CRM (Keylon, Betina, Glauce) ou marcar "não usa".
9. Cadastro "Douglas": é teste ou duplicado?
10. A Lana não entra há 37 dias: falar com a médica.
11. Decidir quem ganha login de médico no v5.

fix: (não aplicar nesta sessão; goal = find_root_cause_only)
verification: (n/a, find_root_cause_only)
files_changed: []

## Specialist Review

- specialist_hint: typescript (skill mapeada: typescript-expert)
- resultado: NÃO EXECUTADA. O gerente da sessão não tinha a ferramenta Skill. Como nenhuma correção entra nesta
  sessão, a revisão do rumo da correção fica para a tarefa GSD que aplicar as correções.
- pendente para o orquestrador: rodar Q6, Q6b, Q7, Q7a, Q7b, Q8, Q9 e Q10 (só leitura) para fechar as linhas
  "a confirmar (Qn)" da tabela. Nenhuma delas muda uma causa já fechada.
