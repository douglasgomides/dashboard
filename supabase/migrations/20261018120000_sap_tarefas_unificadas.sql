-- SAP · Cronograma como fonte única de tarefas.
-- 1. Status de cada item: a fazer, feito automaticamente (detectado), feito manualmente, não se aplica; quem marcou,
--    quando, e desfazer com motivo (histórico).
-- 2. Rotinas semanais (itens recorrentes): uma marcação por semana.
-- 3. Quem é quem: uma pessoa do Hub por papel em cada clínica.
-- 4. Preferências do usuário (tour e Comece aqui vistos), no banco.
-- 5. Fontes ligadas e etapas do CRM marcadas, para várias clínicas de uma vez.
-- Escrita só pela equipe (is_app_admin), como o resto do SAP. Leitura pelas mesmas regras (sap_pode_ler).

alter table public.sap_marco_status add column if not exists estado text check (estado in ('manual', 'nao_se_aplica'));
alter table public.sap_marco_status add column if not exists detectado_em date;
alter table public.sap_marco_status add column if not exists desfeito_em timestamptz;
alter table public.sap_marco_status add column if not exists desfeito_por uuid;
alter table public.sap_marco_status add column if not exists desfeito_motivo text;
update public.sap_marco_status set estado = 'manual' where concluido_em is not null and estado is null;

create table if not exists public.sap_rotina_semana (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  marco integer not null check (marco between 1 and 35),
  semana date not null, -- segunda-feira da semana
  feito_em date not null,
  evidencia text,
  feito_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, marco, semana)
);
alter table public.sap_rotina_semana enable row level security;
create policy "sap ler rotina semana" on public.sap_rotina_semana for select to authenticated using (public.sap_pode_ler(clinica_id));
grant select on public.sap_rotina_semana to authenticated;

create table if not exists public.sap_tarefa_historico (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  marco integer not null,
  semana date,
  acao text not null check (acao in ('feito', 'nao_se_aplica', 'desfazer')),
  data date,
  evidencia text,
  motivo text,
  por uuid default auth.uid(),
  em timestamptz not null default now()
);
alter table public.sap_tarefa_historico enable row level security;
create policy "sap ler historico tarefa" on public.sap_tarefa_historico for select to authenticated using (public.is_app_admin());
grant select on public.sap_tarefa_historico to authenticated;

-- Itens que podem ser marcados sem evidência (ver SEM_EVIDENCIA em src/lib/sap-tarefas.ts).
create or replace function public.sap_item_sem_evidencia(p_marco integer)
returns boolean language sql immutable as $$ select p_marco = any (array[6, 30]) $$;

create or replace function public.sap_marcar_tarefa(p_clinica_id uuid, p_marco integer, p_acao text, p_data date,
  p_evidencia text, p_motivo text, p_semana date default null)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_ev text := nullif(btrim(coalesce(p_evidencia, '')), ''); v_mot text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_marco < 1 or p_marco > 35 then raise exception 'item invalido'; end if;
  if p_acao = 'feito' and v_ev is null and not public.sap_item_sem_evidencia(p_marco) then raise exception 'evidencia obrigatoria'; end if;
  if p_acao in ('desfazer', 'nao_se_aplica') and v_mot is null then raise exception 'motivo obrigatorio'; end if;
  if p_semana is not null then
    if p_acao = 'feito' then
      insert into sap_rotina_semana (clinica_id, marco, semana, feito_em, evidencia, feito_por)
      values (p_clinica_id, p_marco, p_semana, coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date), v_ev, auth.uid())
      on conflict (clinica_id, marco, semana) do update set feito_em = excluded.feito_em, evidencia = excluded.evidencia, feito_por = excluded.feito_por, atualizado_em = now();
    elsif p_acao = 'desfazer' then
      delete from sap_rotina_semana where clinica_id = p_clinica_id and marco = p_marco and semana = p_semana;
    else raise exception 'acao invalida'; end if;
  else
    if p_acao = 'feito' or p_acao = 'nao_se_aplica' then
      insert into sap_marco_status (clinica_id, marco, concluido_em, evidencia, observacao, estado, atualizado_por, atualizado_em)
      values (p_clinica_id, p_marco, coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date), v_ev, v_mot,
        case when p_acao = 'feito' then 'manual' else 'nao_se_aplica' end, auth.uid(), now())
      on conflict (clinica_id, marco) do update set concluido_em = excluded.concluido_em, evidencia = excluded.evidencia,
        observacao = excluded.observacao, estado = excluded.estado, atualizado_por = excluded.atualizado_por, atualizado_em = now(),
        desfeito_em = null, desfeito_por = null, desfeito_motivo = null;
    elsif p_acao = 'desfazer' then
      update sap_marco_status set concluido_em = null, evidencia = null, estado = null, desfeito_em = now(), desfeito_por = auth.uid(),
        desfeito_motivo = v_mot, atualizado_em = now()
      where clinica_id = p_clinica_id and marco = p_marco;
    else raise exception 'acao invalida'; end if;
  end if;
  insert into sap_tarefa_historico (clinica_id, marco, semana, acao, data, evidencia, motivo)
  values (p_clinica_id, p_marco, p_semana, p_acao, p_data, v_ev, v_mot);
end;
$function$;

-- Compatível com o modo sessão: marcar continua igual, agora registra o estado e o histórico.
create or replace function public.sap_marcar_marco(p_clinica_id uuid, p_marco integer, p_concluido_em date, p_evidencia text, p_observacao text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_marco_status (clinica_id, marco, concluido_em, evidencia, observacao, estado, atualizado_por, atualizado_em)
  values (p_clinica_id, p_marco, p_concluido_em, nullif(btrim(p_evidencia), ''), nullif(btrim(p_observacao), ''),
    case when p_concluido_em is null then null else 'manual' end, auth.uid(), now())
  on conflict (clinica_id, marco) do update set concluido_em = excluded.concluido_em, evidencia = excluded.evidencia,
    observacao = excluded.observacao, estado = excluded.estado, atualizado_por = excluded.atualizado_por, atualizado_em = now();
  insert into sap_tarefa_historico (clinica_id, marco, acao, data, evidencia, motivo)
  values (p_clinica_id, p_marco, case when p_concluido_em is null then 'desfazer' else 'feito' end, p_concluido_em, nullif(btrim(p_evidencia), ''), nullif(btrim(p_observacao), ''));
end;
$function$;

-- Primeira data em que o sistema detectou cada item (selo "detectado pelo sistema"). Só guarda a data; o status
-- continua vindo do dado ao vivo. p_avaliados: itens que o painel sabe detectar; os não detectados perdem a data.
create or replace function public.sap_registrar_deteccao(p_clinica_id uuid, p_detectados integer[], p_avaliados integer[])
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; m integer;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  foreach m in array coalesce(p_detectados, '{}') loop
    insert into sap_marco_status (clinica_id, marco, detectado_em) values (p_clinica_id, m, v_hoje)
    on conflict (clinica_id, marco) do update set detectado_em = coalesce(sap_marco_status.detectado_em, v_hoje);
  end loop;
  update sap_marco_status set detectado_em = null
  where clinica_id = p_clinica_id and marco = any (coalesce(p_avaliados, '{}')) and not (marco = any (coalesce(p_detectados, '{}')))
    and detectado_em is not null;
end;
$function$;

-- Quem é quem.
create table if not exists public.sap_papeis (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  papel text not null check (papel in ('comercial', 'coordenador', 'onboarding', 'trafego', 'editor', 'cs', 'condutor', 'clinica', 'fundador')),
  user_id uuid not null references auth.users(id) on delete cascade,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, papel)
);
alter table public.sap_papeis enable row level security;
create policy "sap ler papeis" on public.sap_papeis for select to authenticated using (public.sap_pode_ler(clinica_id));
grant select on public.sap_papeis to authenticated;

create or replace function public.sap_salvar_papel(p_clinica_id uuid, p_papel text, p_user_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_user_id is null then
    delete from sap_papeis where clinica_id = p_clinica_id and papel = p_papel;
  else
    insert into sap_papeis (clinica_id, papel, user_id) values (p_clinica_id, p_papel, p_user_id)
    on conflict (clinica_id, papel) do update set user_id = excluded.user_id, atualizado_por = auth.uid(), atualizado_em = now();
  end if;
end;
$function$;

-- Nome para exibir de uma pessoa do Hub: o nome do cadastro, se houver; senão, a parte do e-mail antes do @.
create or replace function public.sap_nome_usuario(p_user_id uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), nullif(btrim(u.raw_user_meta_data->>'name'), ''), split_part(u.email, '@', 1))
  from auth.users u where u.id = p_user_id
$$;
revoke all on function public.sap_nome_usuario(uuid) from public, anon, authenticated;

-- Pessoas que podem ser atribuídas: equipe (admins) e usuários ligados a cada cliente. Só a equipe vê a lista.
create or replace function public.sap_pessoas_hub()
returns table(user_id uuid, nome text, email text, equipe boolean, client_ids uuid[])
language sql stable security definer set search_path to 'public'
as $function$
  select u.id, public.sap_nome_usuario(u.id), u.email::text, exists (select 1 from app_admins a where a.user_id = u.id),
    coalesce((select array_agg(cm.client_id) from client_members cm where cm.user_id = u.id), '{}')
  from auth.users u
  where public.is_app_admin()
  order by 4 desc, 2;
$function$;

-- Papéis com o nome da pessoa, para o card ("Gestor de Tráfego · nome"). Quem lê a clínica vê.
create or replace function public.sap_papeis_nomes(p_clinica_ids uuid[])
returns table(clinica_id uuid, papel text, user_id uuid, nome text)
language sql stable security definer set search_path to 'public'
as $function$
  select p.clinica_id, p.papel, p.user_id, public.sap_nome_usuario(p.user_id)
  from sap_papeis p where p.clinica_id = any (p_clinica_ids) and public.sap_pode_ler(p.clinica_id);
$function$;

-- Fontes ligadas e marcos do CRM já marcados, por cliente (mesma regra do client_fontes).
create or replace function public.sap_fontes_etapas(p_client_ids uuid[])
returns table(client_id uuid, tem_crm boolean, tem_atendimento boolean, tem_anuncios boolean, marcos text[])
language sql stable security definer set search_path to 'public'
as $function$
  select c.id,
    exists (select 1 from crm_connections x where x.client_id = c.id and x.active),
    (c.wts_company_id is not null or c.digisac_url is not null),
    exists (select 1 from client_ad_accounts a where a.client_id = c.id and a.active and not coalesce(a.provisional, false))
      or coalesce(c.meta_ad_account_id, '') <> '' or coalesce(c.ads_planilha_url, '') <> '',
    coalesce((select array_agg(distinct m.marco) from sap_etapa_marco m join crm_connections cc on cc.id = m.crm_connection_id
              where cc.client_id = c.id and cc.active and m.marco is not null), '{}')
  from clients c
  where c.id = any (p_client_ids) and (public.is_app_admin() or public.is_client_member(c.id));
$function$;

-- Preferências do usuário (tour visto, Comece aqui visto).
create table if not exists public.sap_usuario_pref (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  tour_visto_em timestamptz,
  comece_visto_em timestamptz
);
alter table public.sap_usuario_pref enable row level security;
create policy "sap ler propria pref" on public.sap_usuario_pref for select to authenticated using (user_id = auth.uid());
grant select on public.sap_usuario_pref to authenticated;

create or replace function public.sap_marcar_visto(p_chave text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'sem login'; end if;
  insert into sap_usuario_pref (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  if p_chave = 'tour' then update sap_usuario_pref set tour_visto_em = coalesce(tour_visto_em, now()) where user_id = auth.uid();
  elsif p_chave = 'comece' then update sap_usuario_pref set comece_visto_em = coalesce(comece_visto_em, now()) where user_id = auth.uid();
  elsif p_chave = 'tour_reset' then update sap_usuario_pref set tour_visto_em = null where user_id = auth.uid();
  else raise exception 'chave invalida'; end if;
end;
$function$;

revoke all on function public.sap_marcar_tarefa(uuid, integer, text, date, text, text, date) from public, anon;
revoke all on function public.sap_registrar_deteccao(uuid, integer[], integer[]) from public, anon;
revoke all on function public.sap_salvar_papel(uuid, text, uuid) from public, anon;
revoke all on function public.sap_pessoas_hub() from public, anon;
revoke all on function public.sap_papeis_nomes(uuid[]) from public, anon;
revoke all on function public.sap_fontes_etapas(uuid[]) from public, anon;
revoke all on function public.sap_marcar_visto(text) from public, anon;
grant execute on function public.sap_marcar_tarefa(uuid, integer, text, date, text, text, date) to authenticated;
grant execute on function public.sap_registrar_deteccao(uuid, integer[], integer[]) to authenticated;
grant execute on function public.sap_salvar_papel(uuid, text, uuid) to authenticated;
grant execute on function public.sap_pessoas_hub() to authenticated;
grant execute on function public.sap_papeis_nomes(uuid[]) to authenticated;
grant execute on function public.sap_fontes_etapas(uuid[]) to authenticated;
grant execute on function public.sap_marcar_visto(text) to authenticated;

-- Evidência por upload de print (privado; só a equipe envia e lê). O card guarda "arquivo:<caminho>".
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sap-evidencias', 'sap-evidencias', false, 10485760, array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;
create policy "sap evidencias equipe envia" on storage.objects for insert to authenticated with check (bucket_id = 'sap-evidencias' and public.is_app_admin());
create policy "sap evidencias equipe le" on storage.objects for select to authenticated using (bucket_id = 'sap-evidencias' and public.is_app_admin());
