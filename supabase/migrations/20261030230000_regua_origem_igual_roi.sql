-- Uma régua só para a origem (auditoria de 30/10/2026): o alerta "leads sem origem" contava cards dos últimos 90 dias
-- (com paciente antigo contando como origem) e só disparava com 50% sem origem; o ROI conta pessoas novas e exige 70%
-- com origem (LIMITES.roi.origemMinima em src/lib/limites.ts). Na Dra. Marcella o alerta via 54% com origem e o ROI
-- via 0,2%, e o alerta não aparecia. Agora o alerta usa crm_pessoas_novas e o mesmo mínimo do ROI.
-- Reversão: trocar de volta os trechos abaixo (novo -> antigo) em qualidade_dados.

do $migra$
declare
  def text := pg_get_functiondef('public.qualidade_dados(uuid)'::regprocedure);
  a1 text := '  if v_leads90 >= 30 and v_sem_origem::numeric / v_leads90 >= 0.5 then';
  n1 text := '  -- Mesma base e mesmo mínimo do ROI (LIMITES.roi.origemMinima = 0,7): pessoas novas, sem paciente antigo.
  select count(*), count(*) filter (where not com_origem) into v_leads90, v_sem_origem
    from public.crm_pessoas_novas(p_client_id, (current_date - 90), current_date);
  if v_leads90 >= 30 and v_sem_origem::numeric / v_leads90 > 0.3 then';
  a2 text := '''titulo'', format(''%s%% dos leads dos últimos 90 dias estão sem origem preenchida'', round(v_sem_origem * 100.0 / v_leads90)),';
  n2 text := '''titulo'', format(''%s%% das pessoas novas dos últimos 90 dias estão sem origem: o retorno do investimento não pode ser calculado'', round(v_sem_origem * 100.0 / v_leads90)),';
  a3 text := '''evidencia'', format(''%s de %s leads sem origem: nem o campo, nem etiqueta, canal de entrada ou campo de rastreio dizem de onde vieram.'', v_sem_origem, v_leads90)';
  n3 text := '''evidencia'', format(''%s de %s pessoas novas sem origem (paciente antigo não entra na conta): nem o campo, nem etiqueta, canal de entrada ou campo de rastreio dizem de onde vieram. O retorno do investimento precisa de 70%% com origem.'', v_sem_origem, v_leads90)';
begin
  if position('crm_pessoas_novas(p_client_id, (current_date - 90)' in def) > 0 then return; end if;
  if position(a1 in def) = 0 or position(a2 in def) = 0 or position(a3 in def) = 0 then
    raise exception 'qualidade_dados: trechos do alerta de origem não encontrados; revisar a migration';
  end if;
  execute replace(replace(replace(def, a1, n1), a2, n2), a3, n3);
end
$migra$;

-- "Ganhos" numa unidade só: vendas = cards ganhos, igual ao ROI e ao painel. O Resultado contava pessoas (Dr. Sergio:
-- 78 no Resultado contra 140 no ROI e no painel). Uma pessoa que compra duas vezes são duas vendas.
create or replace function public.crm_leads_resumo_periodo(p_client_id uuid, p_from date, p_to date)
returns table(novos bigint, ganhos bigint, perdidos bigint, valor numeric)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with ok as (select (public.is_app_admin() or public.is_client_member(p_client_id)) as pode),
  per as (select * from public.crm_pessoas_leads(p_client_id) b where b.d between p_from and p_to and (select pode from ok)),
  ganhou as (select distinct pk from per where outcome = 'won')
  select
    (select count(*) from public.crm_pessoas_novas(p_client_id, p_from, p_to) where (select pode from ok)),
    (select count(*) from per where outcome = 'won'),
    (select count(distinct pk) from per where outcome = 'lost' and pk not in (select pk from ganhou)),
    coalesce((select sum(price) from per), 0);
$$;

-- Classificador de origem: "Insta - Lana" e "Insta- Elité" (8.947 e 1.825 leads da Lana) ficavam sem categoria;
-- "Cliente Ativo" (Fernanda: 50 pessoas, 34% das novas) contava como lead novo.
do $migra$
declare
  def text := pg_get_functiondef('public.crm_origem_classifica(text)'::regprocedure);
  a1 text := '(instagram|^insta$|^ig$|';
  n1 text := '(instagram|^insta\M|^ig$|';
  a2 text := '|paciente ativ|';
  n2 text := '|paciente ativ|cliente ativ|';
begin
  if position('cliente ativ' in def) > 0 then return; end if;
  if position(a1 in def) = 0 or position(a2 in def) = 0 then raise exception 'crm_origem_classifica: trechos não encontrados'; end if;
  execute replace(replace(def, a1, n1), a2, n2);
end
$migra$;

-- Telas e PDF de origem do Kommo: sem o campo de origem no card, a origem caía em "Não informado" mesmo quando o Nexo
-- já tinha lido a origem em outro sinal (canal, etiqueta, mensagem). Lana: 84% com origem no banco, 31% no PDF.
-- Agora, sem o campo, vale crm_leads.source passado pelo classificador (o canal "WhatsApp Lite" da Carrion não vira origem).
do $migra$
declare
  f text;
  def text;
  a1 text := 'case when cl.provider <> ''kommo'' then cl.source end,';
  n1 text := 'case when cl.provider <> ''kommo'' then cl.source else public.crm_origem_classifica(cl.source) end,';
begin
  foreach f in array array['public.crm_funil_por_campo(uuid,text)', 'public.crm_funil_por_campo_periodo(uuid,text,date,date)'] loop
    def := pg_get_functiondef(f::regprocedure);
    if position('crm_origem_classifica(cl.source)' in def) > 0 then continue; end if;
    if position(a1 in def) = 0 then raise exception '%: trecho não encontrado', f; end if;
    execute replace(def, a1, n1);
  end loop;
end
$migra$;
