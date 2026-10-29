-- Auditoria de 29/10/2026: seis funções ainda contavam leads apagados no CRM (crm_leads.removido_na_origem).
-- As telas principais já descontavam; estas não: jornada do paciente (jornada_pessoa, jornada_resumo de um argumento),
-- conteúdo comercial (conteudo_comercial, conteudo_comercial_profundo) e plano da semana (plano_agendou, plano_ticket).
-- Na Dra. Lana são 8.661 leads apagados no Kommo ou do funil "Leads Excluídos" que entravam nessas telas.
-- Cada função recebe só o filtro, trocando o trecho exato que lê crm_leads; o resto da definição não muda.
-- Função sem o trecho sem filtro (versão diferente da auditada) fica como está. Já aplicada, não faz nada.
-- Reversão: trocar de volta cada "novo" pelo "antigo" abaixo (mesmo bloco, com os pares invertidos).
do $migra$
declare
  r record;
  def text;
begin
  for r in
    select * from (values
      ('public.conteudo_comercial(uuid,date,date)'::regprocedure,
       'left join crm_leads l on l.id = c.lead_id',
       'left join crm_leads l on l.id = c.lead_id and l.removido_na_origem is null'),
      ('public.conteudo_comercial_profundo(uuid,date,date)'::regprocedure,
       'left join crm_leads l on l.id = c.lead_id',
       'left join crm_leads l on l.id = c.lead_id and l.removido_na_origem is null'),
      ('public.jornada_pessoa(uuid)'::regprocedure,
       'from public.crm_leads where pessoa_id = p_pessoa',
       'from public.crm_leads where pessoa_id = p_pessoa and removido_na_origem is null'),
      ('public.jornada_resumo(uuid)'::regprocedure,
       'from public.crm_leads where client_id = p_client',
       'from public.crm_leads where client_id = p_client and removido_na_origem is null'),
      ('public.plano_agendou(uuid,timestamptz)'::regprocedure,
       'join crm_leads l on l.id = c.lead_id',
       'join crm_leads l on l.id = c.lead_id and l.removido_na_origem is null'),
      ('public.plano_ticket(uuid)'::regprocedure,
       'where l.client_id = p_client and l.outcome',
       'where l.client_id = p_client and l.removido_na_origem is null and l.outcome')
    ) as v(fn, antigo, novo)
  loop
    def := pg_get_functiondef(r.fn);
    if position(r.novo in def) > 0 then
      continue; -- já aplicada
    end if;
    if position(r.antigo in def) = 0 then
      -- Versão diferente da auditada (ex.: a do repositório já desconta os removidos ou nem lê crm_leads):
      -- não há o trecho sem filtro, então não há o que corrigir nela.
      raise notice '%: sem o trecho sem filtro; mantida como está', r.fn;
      continue;
    end if;
    execute replace(def, r.antigo, r.novo);
  end loop;
end
$migra$;
