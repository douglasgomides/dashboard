-- Liberar uma resposta preparada abandonada sem arriscar repetir um envio já iniciado.
create function atendimento_operacional.cancelar_preparado(p_client uuid,p_pedido uuid,p_observacao text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); e atendimento_operacional.envios;
begin
 if u is null or p_client is null or not (public.is_app_admin() or public.is_client_member(p_client))
  or not public.tem_modulo(p_client,'hub') or not public.pode_editar_acoes(p_client) then
  raise exception 'Sem permissão para conferir este envio' using errcode='42501';
 end if;
 if length(btrim(coalesce(p_observacao,''))) not between 10 and 500 then raise exception 'Registre por que a resposta preparada será descartada'; end if;
 select * into e from atendimento_operacional.envios where id=p_pedido and client_id=p_client for update;
 if not found or e.estado<>'preparada' then raise exception 'A resposta já foi processada. Atualize a conversa e confira o resultado antes de repetir.' using errcode='40001'; end if;
 update atendimento_operacional.envios set estado='nao_enviada_equipe',erro=null where id=e.id;
 insert into atendimento_operacional.eventos(client_id,conversa_id,autor,acao,dados)
  values(p_client,e.conversa_id,u,'descartar_preparado',jsonb_build_object('pedido_id',e.id,'observacao',btrim(p_observacao)));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function atendimento_operacional.cancelar_preparado(uuid,uuid,text) from public,anon;
grant execute on function atendimento_operacional.cancelar_preparado(uuid,uuid,text) to authenticated;
create function public.central_cancelar_preparado(p_client_id uuid,p_pedido_id uuid,p_observacao text)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select atendimento_operacional.cancelar_preparado(p_client_id,p_pedido_id,p_observacao)
$$;
revoke all on function public.central_cancelar_preparado(uuid,uuid,text) from public,anon;
grant execute on function public.central_cancelar_preparado(uuid,uuid,text) to authenticated;
