-- SAP · Lote D: texto livre do Plano de Ação e Metas (03.07) e do Relatório de Encerramento D90 (08.07).
-- Os números saem dos dados; aqui fica só o que a equipe escreve (resumo, aprendizados, recomendação, decisão).
create table if not exists public.sap_documento_texto (
  clinica_id uuid not null references public.sap_clinicas(id) on delete cascade,
  documento text not null check (documento in ('plano','d90')),
  secao text not null,
  texto text,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  primary key (clinica_id, documento, secao)
);
alter table public.sap_documento_texto enable row level security;
create policy "sap ler documentos" on public.sap_documento_texto for select to authenticated using (public.sap_pode_ler(clinica_id));

create or replace function public.sap_salvar_documento_texto(p_clinica_id uuid, p_documento text, p_secao text, p_texto text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  insert into sap_documento_texto (clinica_id, documento, secao, texto, atualizado_por, atualizado_em)
  values (p_clinica_id, p_documento, p_secao, nullif(btrim(p_texto), ''), auth.uid(), now())
  on conflict (clinica_id, documento, secao) do update set texto = excluded.texto, atualizado_por = excluded.atualizado_por, atualizado_em = now();
end;
$function$;
revoke all on function public.sap_salvar_documento_texto(uuid, text, text, text) from public, anon;
grant execute on function public.sap_salvar_documento_texto(uuid, text, text, text) to authenticated;
grant select on public.sap_documento_texto to authenticated;
