-- Nome real de cada etapa (status_id) de cada pipeline da Kommo — o webhook
-- só manda o número, não o nome. Buscado uma vez via API (GET
-- /api/v4/leads/pipelines) com um token de longa duração gerado no painel
-- da Kommo. status_id 142/143 são universais em toda a conta: sempre
-- "venda ganha"/"venda perdida", qualquer que seja o pipeline.
create table public.crm_pipeline_statuses (
  id uuid primary key default gen_random_uuid(),
  crm_connection_id uuid not null references public.crm_connections(id) on delete cascade,
  pipeline_id text not null,
  pipeline_name text not null,
  status_id text not null,
  status_name text not null,
  fetched_at timestamptz not null default now(),
  unique (crm_connection_id, pipeline_id, status_id)
);

create index idx_crm_pipeline_statuses_connection on public.crm_pipeline_statuses(crm_connection_id);

alter table public.crm_pipeline_statuses enable row level security;

create policy "read own or admin reads all pipeline statuses" on public.crm_pipeline_statuses
  for select to authenticated
  using (
    public.is_app_admin()
    or exists (
      select 1 from public.crm_connections cc
      where cc.id = crm_pipeline_statuses.crm_connection_id
      and public.is_client_member(cc.client_id)
    )
  );

insert into public.crm_pipeline_statuses (crm_connection_id, pipeline_id, pipeline_name, status_id, status_name) values
('26c4f791-dcb7-403e-b8f3-a471c822761b','12452668','Comercial 1 - Dra Lana Torres','96193916','Incoming leads'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12452668','Comercial 1 - Dra Lana Torres','96193920','Em Qualificação'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12452668','Comercial 1 - Dra Lana Torres','97436320','Follow UP (Automação)'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12452668','Comercial 1 - Dra Lana Torres','96193924','Consulta Agendada'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12452668','Comercial 1 - Dra Lana Torres','142','Venda ganha'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12452668','Comercial 1 - Dra Lana Torres','143','Venda perdida'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','14299971','Comercial 1 - Elité Clinic','110434827','Incoming leads'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','14299971','Comercial 1 - Elité Clinic','110434831','Em Qualificação'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','14299971','Comercial 1 - Elité Clinic','110435119','Follow UP (Automação)'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','14299971','Comercial 1 - Elité Clinic','110435123','Consulta Agendada'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','14299971','Comercial 1 - Elité Clinic','142','Venda ganha'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','14299971','Comercial 1 - Elité Clinic','143','Venda perdida'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13099923','Comercial 2','101010799','Incoming leads'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13099923','Comercial 2','101010803','Consulta Agendada'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13099923','Comercial 2','101010807','Resgate de Consulta'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13099923','Comercial 2','101010811','Consulta Realizada'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13099923','Comercial 2','101011023','Realizando exames'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13099923','Comercial 2','110391483','Proposta/Negociação'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13099923','Comercial 2','142','Venda Ganha'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13099923','Comercial 2','143','Venda perdida'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12944487','Cadência','99810899','Incoming leads'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12944487','Cadência','110392435','Follow UP D15'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12944487','Cadência','110392439','Follow UP D30'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12944487','Cadência','110392443','Follow UP D45'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12944487','Cadência','110392447','Follow UP D60'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12944487','Cadência','110392451','Follow UP D90'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12944487','Cadência','142','Venda ganha'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12944487','Cadência','143','Parado - Sem resposta'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12521944','Atendimento Clínico','96718636','Incoming leads'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12521944','Atendimento Clínico','96718640','Aguardado Agendamento'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12521944','Atendimento Clínico','96718644','Procedimento Agendado'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12521944','Atendimento Clínico','96718648','Em Acompanhamento'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12521944','Atendimento Clínico','99998955','Follow-Up Comercial'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12521944','Atendimento Clínico','96718748','Protocolo Finalizado'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12521944','Atendimento Clínico','96718752','Nutrição ao Longo Prazo'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12521944','Atendimento Clínico','142','Venda ganha'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','12521944','Atendimento Clínico','143','Venda perdida'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9847371','Instagram [Dra. Lana]','75647475','Incoming leads'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9847371','Instagram [Dra. Lana]','75647787','Contato Inicial'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9847371','Instagram [Dra. Lana]','75662571','Agendar Consulta'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9847371','Instagram [Dra. Lana]','94740236','Reabordagem 2º e 3º'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9847371','Instagram [Dra. Lana]','75872303','Follow Up'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9847371','Instagram [Dra. Lana]','76329359','Consulta Agendada (Automação)'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9847371','Instagram [Dra. Lana]','142','Closed - won'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9847371','Instagram [Dra. Lana]','143','Closed - lost'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9879603','Instagram [Elité Clinic]','75873667','Incoming leads'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9879603','Instagram [Elité Clinic]','75876115','Consulta Agendada'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9879603','Instagram [Elité Clinic]','76166023','Consulta Realizada (Automação)'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9879603','Instagram [Elité Clinic]','75876119','Follow Up Ativo'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9879603','Instagram [Elité Clinic]','77711923','Comercial (pendências)'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9879603','Instagram [Elité Clinic]','86975587','Fidelização'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9879603','Instagram [Elité Clinic]','142','Closed - won'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','9879603','Instagram [Elité Clinic]','143','Closed - lost'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13365383','Leads Excluídos','103086451','Incoming leads'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13365383','Leads Excluídos','103086455','Leads à Excluir'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13365383','Leads Excluídos','142','Venda ganha'),
('26c4f791-dcb7-403e-b8f3-a471c822761b','13365383','Leads Excluídos','143','Venda perdida');
