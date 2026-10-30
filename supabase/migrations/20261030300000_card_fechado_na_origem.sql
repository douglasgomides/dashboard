-- Cards fechados no FlwChat (auditoria de 30/10/2026, achado 25): a API do FlwChat só lista os cards abertos. Quando
-- a equipe fecha um card (ganho ou perdido), ele some da lista e ficava "aberto" no Nexo para sempre, inflando
-- abertos e parados (Marcella: 688 cards na lista, 1.068 no Nexo). Como a API não diz se fechou ganho ou perdido,
-- o card passa a "closed": fechado na origem, resultado não informado. Não conta como aberto, nem como ganho, nem
-- como perdido; continua contando como lead que entrou. Se o card voltar a aparecer aberto, volta a "open".
-- Novo evento "fechou" no histórico do card.
-- Reversão: update public.crm_leads set outcome = 'open' where outcome = 'closed'; depois devolver as duas
-- restrições e o case de crm_registrar_evento ao estado anterior.

alter table public.crm_leads drop constraint if exists crm_leads_outcome_check;
alter table public.crm_leads add constraint crm_leads_outcome_check check (outcome = any (array['open', 'won', 'lost', 'closed']));

alter table public.crm_lead_eventos drop constraint if exists crm_lead_eventos_tipo_check;
alter table public.crm_lead_eventos add constraint crm_lead_eventos_tipo_check
  check (tipo = any (array['entrou', 'mudou_etapa', 'ganhou', 'perdeu', 'reabriu', 'fechou']));

do $migra$
declare
  def text := pg_get_functiondef('public.crm_registrar_evento()'::regprocedure);
  ancora text := 'case n_out when ''won'' then ''ganhou'' when ''lost'' then ''perdeu'' else ''reabriu'' end';
begin
  if position('''fechou''' in def) > 0 then return; end if;
  if position(ancora in def) = 0 then raise exception 'crm_registrar_evento: trecho não encontrado'; end if;
  execute replace(def, ancora, 'case n_out when ''won'' then ''ganhou'' when ''lost'' then ''perdeu'' when ''closed'' then ''fechou'' else ''reabriu'' end');
end
$migra$;
