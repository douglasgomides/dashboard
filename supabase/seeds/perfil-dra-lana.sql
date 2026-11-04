-- Perfil da clínica da Dra. Lana (Kommo) — dados do piloto. NÃO é migração e não roda sozinho:
-- aplicar à mão, depois da migração 20261104100000_perfil_da_clinica.sql, quando a equipe aprovar.
-- Cliente 65630f0d-9285-41da-ab9e-8fd1f3cc88ae, conexão 26c4f791-dcb7-403e-b8f3-a471c822761b.
-- IDs conferidos em crm_pipeline_statuses em 04/11/2026. Os status 142 (ganho) e 143 (perdido) do Kommo se repetem em
-- todos os funis: cada linha leva o pipeline_id. Etapa sem linha = sem papel (não conta como agendado, venda etc.).
--
-- Sem linha de propósito (passagem ou automação): Comercial 1 "Consulta Agendada" (89 de 95 seguem para o Comercial 2),
-- Instagram "Consulta Agendada (Automação)" e "Consulta Realizada (Automação)".
-- Sem linha por não estarem no mapeamento combinado: Instagram [Dra. Lana] "Agendar Consulta", "Follow Up",
-- "REABORDAGEM 2º E 3º"; Instagram [Elité Clinic] "Follow Up ATIVO", "COMERCIAL (pendencias)", "Fidelização";
-- Comercial 2 "Incoming leads"; Cadência "Incoming leads" (todas com 0 cards hoje).
-- Acréscimo ao mapeamento combinado: status 142 dos funis Instagram e Cadência = venda (Kommo só põe ganho ali;
-- 3 cards no Instagram [Dra. Lana] e 1 na Cadência). Tirar as três linhas marcadas "acréscimo" se a equipe discordar.
--
-- Reversão: delete from public.crm_perfil_etapa where crm_connection_id = '26c4f791-dcb7-403e-b8f3-a471c822761b';

begin;

do $seed$
declare
  v_conn constant uuid := '26c4f791-dcb7-403e-b8f3-a471c822761b';
  v_esperadas int;
  v_achadas int;
begin
  if not exists (select 1 from public.crm_connections c
                  where c.id = v_conn and c.client_id = '65630f0d-9285-41da-ab9e-8fd1f3cc88ae' and c.provider = 'kommo') then
    raise exception 'conexão da Dra. Lana não encontrada';
  end if;

  create temp table perfil_lana (pipeline_id text, status_id text, papel text, nota text) on commit drop;
  insert into perfil_lana (pipeline_id, status_id, papel, nota) values
    -- Instagram [Dra. Lana]
    ('9847371', '75647475', 'novo', 'Incoming leads'),
    ('9847371', '75647787', 'novo', 'Contato Inicial'),
    ('9847371', '143', 'perdido', 'Closed - lost'),
    ('9847371', '142', 'venda', 'Closed - won (acréscimo)'),
    -- Instagram [Elité Clinic]
    ('9879603', '75873667', 'novo', 'Incoming leads'),
    ('9879603', '75876115', 'novo', 'Consulta Agendada: depósito de cards movidos em massa, não é agendamento'),
    ('9879603', '143', 'perdido', 'Closed - lost'),
    ('9879603', '142', 'venda', 'Closed - won (acréscimo)'),
    -- Comercial 1 - Dra Lana Torres (110434831 é a "Em Qualificação" que aparece repetida neste funil)
    ('12452668', '96193916', 'novo', 'Incoming leads'),
    ('12452668', '96193920', 'em_atendimento', 'Em Qualificação'),
    ('12452668', '110434831', 'em_atendimento', 'Em Qualificação'),
    ('12452668', '111427063', 'em_atendimento', 'Negociação'),
    ('12452668', '97436320', 'reativacao', 'Follow UP (Automação)'),
    ('12452668', '142', 'venda', 'Venda ganha'),
    ('12452668', '143', 'perdido', 'Venda perdida'),
    -- Comercial 1 - Elité Clinic (96193920 é a "Em Qualificação" que aparece repetida neste funil)
    ('14299971', '110434827', 'novo', 'Incoming leads'),
    ('14299971', '110434831', 'em_atendimento', 'Em Qualificação'),
    ('14299971', '96193920', 'em_atendimento', 'Em Qualificação'),
    ('14299971', '111427067', 'em_atendimento', 'Negociação'),
    ('14299971', '110435119', 'reativacao', 'Follow UP (Automação)'),
    ('14299971', '142', 'venda', 'Venda ganha'),
    ('14299971', '143', 'perdido', 'Venda perdida'),
    -- Comercial 2
    ('13099923', '101010803', 'agendado', 'Consulta Agendada'),
    ('13099923', '101010807', 'reativacao', 'Resgate de Consulta'),
    ('13099923', '101011023', 'em_atendimento', 'Realizando exames'),
    ('13099923', '110391483', 'em_atendimento', 'Proposta/Negociação'),
    ('13099923', '101010811', 'compareceu', 'Consulta Realizada'),
    ('13099923', '142', 'venda', 'Venda Ganha'),
    ('13099923', '143', 'perdido', 'Venda perdida'),
    -- Atendimento Clínico: entrar aqui é a venda (a cópia do robô não conta em dobro)
    ('12521944', '96718636', 'venda', 'Incoming leads'),
    ('12521944', '96718640', 'venda', 'Aguardado Agendamento'),
    ('12521944', '96718644', 'venda', 'Procedimento Agendado'),
    ('12521944', '96718648', 'venda', 'Em Acompanhamento'),
    ('12521944', '99998955', 'venda', 'Follow-Up Comercial'),
    ('12521944', '96718752', 'posvenda', 'Nutrição ao Longo Prazo'),
    ('12521944', '96718748', 'posvenda', 'Protocolo Finalizado'),
    ('12521944', '142', 'venda', 'Venda ganha'),
    ('12521944', '143', 'perdido', 'Venda perdida'),
    -- Cadência
    ('12944487', '112594159', 'reativacao', 'Follow up D6'),
    ('12944487', '112594219', 'reativacao', 'Follow up D7'),
    ('12944487', '112594163', 'reativacao', 'Follow up D10'),
    ('12944487', '110392435', 'reativacao', 'Follow UP D15'),
    ('12944487', '110392439', 'reativacao', 'Follow UP D30'),
    ('12944487', '110392443', 'reativacao', 'Follow UP D45'),
    ('12944487', '110392447', 'reativacao', 'Follow UP D60'),
    ('12944487', '110392451', 'reativacao', 'Follow UP D90'),
    ('12944487', '143', 'perdido', 'Parado - Sem resposta'),
    ('12944487', '142', 'venda', '"-" (ganho; acréscimo)');

  -- Toda etapa precisa existir na conexão (nada de id digitado errado).
  select count(*) into v_esperadas from perfil_lana;
  select count(*) into v_achadas from perfil_lana p
    join public.crm_pipeline_statuses s on s.crm_connection_id = v_conn and s.pipeline_id = p.pipeline_id and s.status_id = p.status_id;
  if v_achadas <> v_esperadas then
    raise exception 'perfil da Dra. Lana: % de % etapas encontradas em crm_pipeline_statuses', v_achadas, v_esperadas;
  end if;

  insert into public.crm_perfil_etapa (crm_connection_id, pipeline_id, status_id, papel, nota, definido_por)
  select v_conn, p.pipeline_id, p.status_id, p.papel, p.nota, null from perfil_lana p
  union all
  -- Funis inteiros fora da conta: Elite Academy e Leads Excluídos.
  select v_conn, f.pipeline_id, '*', 'ignorar', f.nota, null
    from (values ('14542263', 'Elite Academy'), ('13365383', 'Leads Excluídos')) f(pipeline_id, nota)
  on conflict (crm_connection_id, pipeline_id, status_id)
  do update set papel = excluded.papel, nota = excluded.nota, atualizado_em = now();
end
$seed$;

commit;
