-- Compatível também com versões do Storage que só testam RLS antes do upload:
-- reserva o máximo permitido pelo bucket até o worker verificar bytes/hash.
alter table public.creative_production_media add column storage_bucket text not null default 'nexo-production-private'
 check(storage_bucket in ('nexo-production-private','nexo-production-input-images'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nexo-production-input-images','nexo-production-input-images',false,20971520,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;

alter policy production_media_read on storage.objects using(bucket_id in ('nexo-production-private','nexo-production-input-images') and exists(select 1 from public.creative_production_media m where m.storage_path=name and m.storage_bucket=bucket_id and public.creative_allowed(m.client_id,false)));
alter policy production_media_read_fence on storage.objects using(bucket_id not in ('nexo-production-private','nexo-production-input-images') or exists(select 1 from public.creative_production_media m where m.storage_path=name and m.storage_bucket=bucket_id and public.creative_allowed(m.client_id,false)));
alter policy production_media_anon_fence on storage.objects using(bucket_id not in ('nexo-production-private','nexo-production-input-images'));
alter policy production_media_upload on storage.objects with check(bucket_id in ('nexo-production-private','nexo-production-input-images') and exists(select 1 from public.creative_production_media m where m.storage_path=name and m.storage_bucket=bucket_id and m.uploader_id=auth.uid() and m.status='pending' and m.purpose='input' and m.created_at>now()-interval '15 minutes' and public.creative_allowed(m.client_id,true) and (metadata->>'size' is null or (metadata->>'size')::bigint=m.bytes) and (metadata->>'mimetype' is null or metadata->>'mimetype'=m.mime)));
alter policy production_media_upload_fence on storage.objects with check(bucket_id not in ('nexo-production-private','nexo-production-input-images') or exists(select 1 from public.creative_production_media m where m.storage_path=name and m.storage_bucket=bucket_id and m.uploader_id=auth.uid() and m.status='pending' and m.purpose='input' and m.created_at>now()-interval '15 minutes' and public.creative_allowed(m.client_id,true) and (metadata->>'size' is null or (metadata->>'size')::bigint=m.bytes) and (metadata->>'mimetype' is null or metadata->>'mimetype'=m.mime)));
alter policy production_media_update_fence on storage.objects using(bucket_id not in ('nexo-production-private','nexo-production-input-images')) with check(bucket_id not in ('nexo-production-private','nexo-production-input-images'));
alter policy production_media_delete_fence on storage.objects using(bucket_id not in ('nexo-production-private','nexo-production-input-images'));

create or replace function public.creative_production_upload(p_client_id uuid,p_project_id uuid,p_mime text,p_bytes bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.creative_productions; m uuid:=gen_random_uuid(); path text; bucket text; reservation bigint;
begin
 if not public.creative_allowed(p_client_id,true) or auth.uid() is null then raise exception 'Sem permissão' using errcode='42501'; end if;
 if p_bytes is null or p_bytes not between 1 and 209715200 or p_mime not in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime') or (p_mime like 'image/%' and p_bytes>20971520) then raise exception 'Arquivo não permitido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_client_id::text,1903));
 bucket:=case when p_mime like 'image/%' then 'nexo-production-input-images' else 'nexo-production-private' end;
 reservation:=case when p_mime like 'image/%' then 20971520 else 209715200 end;
 if (select coalesce(sum(case when status='ready' and sha256 is not null then bytes when storage_bucket='nexo-production-input-images' then 20971520 else 209715200 end),0) from public.creative_production_media where client_id=p_client_id and purpose='input' and created_at>=current_date)+reservation>536870912 then raise exception 'Limite diário de 512 MiB atingido. Renderize os arquivos pendentes ou aguarde a renovação diária'; end if;
 select * into p from public.creative_productions where id=p_project_id and client_id=p_client_id for update;
 if not found then raise exception 'Arquivo não permitido'; end if;
 if (select count(*) from public.creative_production_media where project_id=p.id and created_at>=current_date and purpose='input')>=40 then raise exception 'Limite diário de uploads do projeto atingido'; end if;
 path:=p.client_id::text||'/'||p.account_id::text||'/'||p.id::text||'/'||m::text;
 insert into public.creative_production_media(id,client_id,account_id,project_id,purpose,storage_path,storage_bucket,mime,bytes,uploader_id)
 values(m,p.client_id,p.account_id,p.id,'input',path,bucket,p_mime,p_bytes,auth.uid());
 return jsonb_build_object('id',m,'path',path,'bucket',bucket);
end $$;
