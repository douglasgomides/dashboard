-- O Storage testa autorização antes de conhecer o tamanho do multipart.
-- Na conclusão, seus metadados reais precisam corresponder à reserva: não
-- permite declarar poucos bytes para contornar a cota com um arquivo maior.
alter policy production_media_upload on storage.objects with check(
 bucket_id='nexo-production-private' and exists(
  select 1 from public.creative_production_media m where m.storage_path=name
   and m.uploader_id=auth.uid() and m.status='pending' and m.purpose='input'
   and m.created_at>now()-interval '15 minutes' and public.creative_allowed(m.client_id,true)
   and (metadata->>'size' is null or (metadata->>'size')::bigint=m.bytes)
   and (metadata->>'mimetype' is null or metadata->>'mimetype'=m.mime)
  )
);
alter policy production_media_upload_fence on storage.objects with check(
 bucket_id<>'nexo-production-private' or exists(
  select 1 from public.creative_production_media m where m.storage_path=name
   and m.uploader_id=auth.uid() and m.status='pending' and m.purpose='input'
   and m.created_at>now()-interval '15 minutes' and public.creative_allowed(m.client_id,true)
   and (metadata->>'size' is null or (metadata->>'size')::bigint=m.bytes)
   and (metadata->>'mimetype' is null or metadata->>'mimetype'=m.mime)
  )
);
