-- SAP · Modo sessão: o que cada reunião do programa registra (preparo feito, notas ao vivo, decisões, pós-sessão).
-- Uma linha por (clínica, sessão, chave). "texto" guarda a nota; "feito_em" marca um passo do preparo/pós-sessão
-- e também o início e o fim da sessão (chaves "inicio" e "fim"). Só a equipe lê e grava: são notas internas
-- (hipótese do Fundador, citações) que vão para o relatório revisado, não direto para a clínica.
create table if not exists public.sap_sessao_registro (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  sessao text not null,
  chave text not null,
  texto text,
  feito_em timestamptz,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, sessao, chave)
);
alter table public.sap_sessao_registro enable row level security;
create policy "admin le registro de sessao" on public.sap_sessao_registro for select to authenticated using (public.is_app_admin());
grant select on public.sap_sessao_registro to authenticated;

-- Pasta do cliente no Drive (cópia do "SAP · Modelo de Pasta do Cliente"), para os links das sessões.
alter table public.sap_clinicas add column if not exists drive_pasta_url text;

create or replace function public.sap_salvar_sessao(p_clinica_id uuid, p_sessao text, p_chave text, p_texto text, p_feito boolean)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_sessao_registro (clinica_id, sessao, chave, texto, feito_em, atualizado_por, atualizado_em)
  values (p_clinica_id, p_sessao, p_chave, p_texto, case when p_feito then now() end, auth.uid(), now())
  on conflict (clinica_id, sessao, chave) do update set
    texto = excluded.texto,
    feito_em = case when p_feito is null then sap_sessao_registro.feito_em when p_feito then coalesce(sap_sessao_registro.feito_em, now()) else null end,
    atualizado_por = excluded.atualizado_por, atualizado_em = now();
end;
$function$;

create or replace function public.sap_salvar_pasta_drive(p_clinica_id uuid, p_url text)
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if nullif(trim(p_url), '') is not null and trim(p_url) !~ '^https://drive\.google\.com/' then raise exception 'link do Drive invalido'; end if;
  update sap_clinicas set drive_pasta_url = nullif(trim(p_url), ''), atualizado_em = now() where id = p_clinica_id;
end;
$function$;

revoke all on function public.sap_salvar_sessao(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.sap_salvar_pasta_drive(uuid, text) from public, anon;
grant execute on function public.sap_salvar_sessao(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.sap_salvar_pasta_drive(uuid, text) to authenticated;
