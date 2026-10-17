-- Cadastro de pessoas (equipe da Doctor Creator e contatos das clínicas), sem exigir login. "Quem é quem" do SAP passa a
-- escolher daqui e mostra o nome (antes listava só quem tinha login e aparecia o e-mail). Quando a pessoa tem login com o
-- mesmo e-mail, o cadastro é ligado ao login e ela vê as próprias tarefas em Minhas tarefas.
-- Reversão: alter table sap_papeis drop column pessoa_id; (user_id volta a ser obrigatório só se não houver papel sem
-- login: alter table sap_papeis alter column user_id set not null); drop function pessoas_salvar, pessoas_listar,
-- sap_salvar_papel_pessoa, sap_papeis_pessoas; drop table pessoas_equipe.

create table if not exists public.pessoas_equipe (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 1),
  tipo text not null default 'equipe' check (tipo in ('equipe', 'clinica')),
  client_id uuid references public.clients(id) on delete cascade,
  funcoes text[] not null default '{}',
  email text,
  whatsapp text,
  user_id uuid unique references auth.users(id) on delete set null,
  ativa boolean not null default true,
  observacao text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (tipo = 'equipe' or client_id is not null)
);
create unique index if not exists pessoas_equipe_email on public.pessoas_equipe (lower(email)) where email is not null and email <> '';
alter table public.pessoas_equipe enable row level security;
create policy "admin le pessoas" on public.pessoas_equipe for select to authenticated using (public.is_app_admin());
grant select on public.pessoas_equipe to authenticated;

alter table public.sap_papeis add column if not exists pessoa_id uuid references public.pessoas_equipe(id) on delete set null;
alter table public.sap_papeis alter column user_id drop not null;

-- Salvar (criar ou editar). Liga ao login pelo e-mail, se existir um usuário com o mesmo e-mail.
create or replace function public.pessoas_salvar(p_id uuid, p_dados jsonb)
returns uuid
language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid := p_id; v_email text := nullif(lower(btrim(coalesce(p_dados->>'email', ''))), ''); v_user uuid;
  v_tipo text := coalesce(nullif(p_dados->>'tipo', ''), 'equipe');
  v_cli uuid := nullif(p_dados->>'client_id', '')::uuid;
  v_fun text[] := coalesce(array(select jsonb_array_elements_text(p_dados->'funcoes')), '{}');
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email invalido'; end if;
  if v_email is not null then select id into v_user from auth.users where lower(email) = v_email limit 1; end if;
  if v_id is null then
    insert into pessoas_equipe (nome, tipo, client_id, funcoes, email, whatsapp, user_id, ativa, observacao)
    values (btrim(p_dados->>'nome'), v_tipo, case when v_tipo = 'clinica' then v_cli end, v_fun, v_email,
      nullif(btrim(coalesce(p_dados->>'whatsapp', '')), ''), v_user, coalesce((p_dados->>'ativa')::boolean, true), nullif(btrim(coalesce(p_dados->>'observacao', '')), ''))
    returning id into v_id;
  else
    update pessoas_equipe set nome = btrim(p_dados->>'nome'), tipo = v_tipo, client_id = case when v_tipo = 'clinica' then v_cli end,
      funcoes = v_fun, email = v_email, whatsapp = nullif(btrim(coalesce(p_dados->>'whatsapp', '')), ''), user_id = v_user,
      ativa = coalesce((p_dados->>'ativa')::boolean, true), observacao = nullif(btrim(coalesce(p_dados->>'observacao', '')), ''), atualizado_em = now()
    where id = v_id;
    -- Papéis já atribuídos a esta pessoa acompanham a troca de login.
    update sap_papeis set user_id = v_user where pessoa_id = v_id;
  end if;
  return v_id;
end;
$function$;

-- Lista para a tela Equipe e para o "Quem é quem" (só a equipe vê). Diz se a pessoa tem login.
create or replace function public.pessoas_listar()
returns table(id uuid, nome text, tipo text, client_id uuid, funcoes text[], email text, whatsapp text, user_id uuid, tem_login boolean, ativa boolean, observacao text, papeis integer)
language sql stable security definer set search_path to 'public'
as $function$
  select p.id, p.nome, p.tipo, p.client_id, p.funcoes, p.email, p.whatsapp, p.user_id, p.user_id is not null, p.ativa, p.observacao,
    (select count(*)::int from sap_papeis s where s.pessoa_id = p.id)
  from pessoas_equipe p
  where public.is_app_admin()
  order by p.ativa desc, p.tipo, p.nome;
$function$;

-- Atribuir uma pessoa do cadastro a um papel da clínica (ou tirar, com p_pessoa nulo).
create or replace function public.sap_salvar_papel_pessoa(p_clinica_id uuid, p_papel text, p_pessoa uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_user uuid;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if p_pessoa is null then
    delete from sap_papeis where clinica_id = p_clinica_id and papel = p_papel;
    return;
  end if;
  select user_id into v_user from pessoas_equipe where id = p_pessoa and ativa;
  if not found then raise exception 'pessoa nao encontrada ou inativa'; end if;
  insert into sap_papeis (clinica_id, papel, user_id, pessoa_id) values (p_clinica_id, p_papel, v_user, p_pessoa)
  on conflict (clinica_id, papel) do update set user_id = excluded.user_id, pessoa_id = excluded.pessoa_id, atualizado_por = auth.uid(), atualizado_em = now();
end;
$function$;

-- Nome no card: o do cadastro de pessoas; se o papel ainda for do formato antigo (só login), o nome do login.
-- Função nova (sap_papeis_nomes continua igual, para não precisar derrubar a antiga).
create or replace function public.sap_papeis_pessoas(p_clinica_ids uuid[])
returns table(clinica_id uuid, papel text, user_id uuid, nome text, pessoa_id uuid)
language sql stable security definer set search_path to 'public'
as $function$
  select p.clinica_id, p.papel, p.user_id, coalesce(pe.nome, public.sap_nome_usuario(p.user_id)), p.pessoa_id
  from sap_papeis p left join pessoas_equipe pe on pe.id = p.pessoa_id
  where p.clinica_id = any (p_clinica_ids) and public.sap_pode_ler(p.clinica_id);
$function$;

revoke all on function public.pessoas_salvar(uuid, jsonb) from public, anon;
revoke all on function public.pessoas_listar() from public, anon;
revoke all on function public.sap_salvar_papel_pessoa(uuid, text, uuid) from public, anon;
revoke all on function public.sap_papeis_pessoas(uuid[]) from public, anon;
grant execute on function public.sap_papeis_pessoas(uuid[]) to authenticated;
grant execute on function public.pessoas_salvar(uuid, jsonb) to authenticated;
grant execute on function public.pessoas_listar() to authenticated;
grant execute on function public.sap_salvar_papel_pessoa(uuid, text, uuid) to authenticated;

-- Carga inicial: a equipe com login (admins) entra no cadastro, e os papéis já atribuídos passam a apontar para o cadastro.
insert into public.pessoas_equipe (nome, tipo, email, user_id)
select public.sap_nome_usuario(a.user_id), 'equipe', lower(u.email), a.user_id
from public.app_admins a join auth.users u on u.id = a.user_id
on conflict do nothing;
-- Médicos e equipes das clínicas que já têm login entram como contato da clínica (para o papel "Clínica").
insert into public.pessoas_equipe (nome, tipo, client_id, email, user_id, funcoes)
select distinct on (m.user_id) public.sap_nome_usuario(m.user_id), 'clinica', m.client_id, lower(u.email), m.user_id, '{clinica}'
from public.client_members m join auth.users u on u.id = m.user_id
where not exists (select 1 from public.app_admins a where a.user_id = m.user_id)
order by m.user_id, m.created_at
on conflict do nothing;
update public.sap_papeis s set pessoa_id = pe.id from public.pessoas_equipe pe where pe.user_id = s.user_id and s.pessoa_id is null;
