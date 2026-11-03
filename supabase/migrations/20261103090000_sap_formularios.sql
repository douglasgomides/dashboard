-- SAP · Formulários dentro do Hub: cada documento do programa (03.01, 02.04, 09.03, 01.05 e os registros de entrega)
-- é preenchido na própria plataforma. As perguntas ficam no código (src/lib/sap-formularios.ts); aqui ficam só as respostas.
-- Prints e PDFs vão para o bucket sap-evidencias já existente (caminho <clinica>/<item>/...), guardados como "arquivo:<caminho>".
-- clinica_id nulo = documento de pré-venda (01.05), ligado a um interessado pelo campo ref.
create table if not exists public.sap_documento_resposta (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.sap_clinicas(id) on delete cascade,
  documento text not null,
  ref text not null default '',
  dados jsonb not null default '{}'::jsonb,
  concluido_em timestamptz,
  atualizado_por uuid default auth.uid(),
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
create unique index if not exists sap_documento_resposta_uq
  on public.sap_documento_resposta (coalesce(clinica_id, '00000000-0000-0000-0000-000000000000'::uuid), documento, ref);

alter table public.sap_documento_resposta enable row level security;
drop policy if exists "sap ler respostas de documento" on public.sap_documento_resposta;
create policy "sap ler respostas de documento" on public.sap_documento_resposta for select to authenticated
  using (case when clinica_id is null then public.is_app_admin() else public.sap_pode_ler(clinica_id) end);
grant select on public.sap_documento_resposta to authenticated;

-- Grava (ou atualiza) as respostas. p_concluir = true carimba a conclusão; false mantém rascunho (e reabre se já estava concluído).
create or replace function public.sap_salvar_documento_resposta(p_clinica_id uuid, p_documento text, p_ref text, p_dados jsonb, p_concluir boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_ref text := coalesce(p_ref, ''); v_id uuid;
begin
  if not public.is_app_admin() then raise exception 'sem permissao'; end if;
  if coalesce(btrim(p_documento), '') = '' then raise exception 'documento invalido'; end if;
  if p_clinica_id is null and v_ref = '' then raise exception 'referencia obrigatoria'; end if;
  if jsonb_typeof(p_dados) is distinct from 'object' then raise exception 'dados invalidos'; end if;
  select id into v_id from sap_documento_resposta
   where coalesce(clinica_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_clinica_id, '00000000-0000-0000-0000-000000000000'::uuid)
     and documento = p_documento and ref = v_ref;
  if v_id is null then
    insert into sap_documento_resposta (clinica_id, documento, ref, dados, concluido_em, atualizado_por, atualizado_em)
    values (p_clinica_id, p_documento, v_ref, p_dados, case when p_concluir then now() end, auth.uid(), now());
  else
    update sap_documento_resposta
       set dados = p_dados, concluido_em = case when p_concluir then coalesce(concluido_em, now()) end, atualizado_por = auth.uid(), atualizado_em = now()
     where id = v_id;
  end if;
end;
$function$;
revoke all on function public.sap_salvar_documento_resposta(uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.sap_salvar_documento_resposta(uuid, text, text, jsonb, boolean) to authenticated;
