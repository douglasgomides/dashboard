-- Origem da Clint pela ordem das tags (auditoria de 30/10/2026): negócios do Douglas com as mesmas tags caíam em
-- "Formulário" (175) ou "Anúncio" (37) conforme a ordem em que a Clint devolvia as tags, e 150 deles têm os campos do
-- formulário do Meta (formulario_facebook, ad_id, form_id). Esses campos são prova de anúncio: passam a valer antes
-- das tags genéricas (a etiqueta que diz "origem" continua valendo antes de tudo).
-- Reversão: trocar de volta os trechos (novo -> antigo) em crm_origem_inferida.

do $migra$
declare
  def text := pg_get_functiondef('public.crm_origem_inferida(text,jsonb)'::regprocedure);
  bloco text := '  if p_provider = ''clint'' and jsonb_typeof(p_raw->''fields'') = ''object''
     and (p_raw->''fields'' ?| array[''formulario_facebook'', ''ad_id'', ''form_id'']) then
    origem := ''Anúncio''; como := ''formulario''; return;
  end if;
';
  ancora text := '  foreach v in array tags loop
    origem := public.crm_origem_classifica(v);';
begin
  if position(bloco || ancora in def) > 0 then return; end if;
  if position(bloco in def) = 0 or position(ancora in def) = 0 then
    raise exception 'crm_origem_inferida: trechos não encontrados; revisar a migration';
  end if;
  def := replace(def, bloco, '');
  execute replace(def, ancora, bloco || ancora);
end
$migra$;
