-- SAP · Anexos por clínica: texto dos documentos que os prompts do gerador pedem (04.05, transcrições, exports do
-- Tracker, políticas). Um anexo atual por clínica e por "slot"; subir de novo substitui. Só admin lê e grava: são
-- documentos internos (transcrição de sessão, números da clínica). Migração aditiva.
create table if not exists public.sap_anexos (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  slot text not null check (slot ~ '^[a-z0-9_]{2,40}$'),
  nome text not null,
  texto text not null check (length(texto) between 1 and 200000),
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, slot)
);
alter table public.sap_anexos enable row level security;
create policy "sap anexos admin le" on public.sap_anexos for select to authenticated using (public.is_app_admin());
grant select on public.sap_anexos to authenticated;

create or replace function public.sap_salvar_anexo(p_clinica_id uuid, p_slot text, p_nome text, p_texto text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_anexos (clinica_id, slot, nome, texto, atualizado_por, atualizado_em)
  values (p_clinica_id, p_slot, left(btrim(p_nome), 200), p_texto, auth.uid(), now())
  on conflict (clinica_id, slot) do update set nome = excluded.nome, texto = excluded.texto, atualizado_por = excluded.atualizado_por, atualizado_em = now();
end;
$function$;
revoke all on function public.sap_salvar_anexo(uuid, text, text, text) from public, anon;
grant execute on function public.sap_salvar_anexo(uuid, text, text, text) to authenticated;

create or replace function public.sap_apagar_anexo(p_clinica_id uuid, p_slot text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  delete from sap_anexos where clinica_id = p_clinica_id and slot = p_slot;
end;
$function$;
revoke all on function public.sap_apagar_anexo(uuid, text) from public, anon;
grant execute on function public.sap_apagar_anexo(uuid, text) to authenticated;
