# Feature Research

**Domain:** painel de decisão para clínicas médicas no Brasil (camada de confiança + home de decisão + lista de contato), sobre um painel que já existe
**Milestone:** v5.0 Nexo v5, Fase 0 + degrau v1 (somente os recursos NOVOS; os já validados no PROJECT.md não foram reabertos)
**Researched:** 2026-11-09
**Confidence:** MEDIUM. Os padrões de produto vêm de documentação e marketing das 50 plataformas (nenhuma tela real vista, rótulos [VISTO]/[DOCUMENTADO]/[INFERIDO] herdados das fichas) e de 6 buscas web que o seam classificou como LOW (provider `websearch`). Sobre CFM, LGPD e regras do WhatsApp, o que está aqui é orientação de produto, não parecer jurídico.

Convenções deste arquivo:
- **D1 a D12** = as 12 "decisões abertas do João" do PROJECT.md. A coluna "Decisão aberta" marca o que fica bloqueado ou ambíguo até o João responder. Este arquivo NUNCA escolhe resposta para elas. Onde preciso descrever o comportamento, descrevo as duas alternativas.
- **Lacuna G1 a G6** = lacunas que NÃO estão nas 12 mas que a pesquisa achou (seção "Lacunas fora das 12 decisões"). São recomendações minhas, o João pode vetar.
- Complexidade: LOW (menos de 1 dia de agente), MEDIUM (1 a 3 dias), HIGH (mais de 3 dias ou risco de produção).

---

## O que a pesquisa das 50 plataformas já resolveu (e o que ficou aberto)

Lido: `RESUMO-50-para-o-conselho.md` (seções de Databox, Klipfolio, Northbeam, Polar, Swydo, Supermetrics, Mixpanel/Amplitude/Metabase, AgencyAnalytics, Whatagraph, DashThis, Reportei, Dental Intelligence, Weave, Podium, NexHealth, Solutionreach, Practice by Numbers) e os dois documentos de decisão (BRIEF v5 e FASE0 Lana). As outras fichas foram só folheadas.

Três conclusões que moldam tudo abaixo:

1. **Ninguém na amostra reconcilia com a fonte e mostra os dois números.** Polar explica divergência culpando a outra ferramenta; Northbeam explica por que não bate com o Meta mas não reconcilia; Supermetrics manda o usuário comparar com a fonte na mão. O estado âmbar do `metricas_selo` ("a regra difere do CRM, com os dois números escritos") é, pelo que achei, o diferencial real do v5. [INFERIDO da ausência nas fichas, MEDIUM]
2. **Os concorrentes de clínica (Dental Intelligence, NexHealth, Solutionreach, Practice by Numbers) listam "quem chamar" a partir do sistema de gestão da clínica.** O Nexo parte de CRM + conversa, que é mais frágil (cartão removido, cópia de robô, etapa fora de ordem). Por isso as 4 condições de entrada são o produto, não um detalhe.
3. **O mercado erra no mesmo ponto em todo lugar:** dado velho sem aviso (NexHealth e Solutionreach mandam lembrete de consulta já cancelada; Databox e Practice by Numbers têm reclamação de sync). O selo e a faixa "cálculo de hoje 03:30" atacam isso.

---

## Feature Landscape

### Table Stakes (o usuário assume que existe; sem isso o recurso falha)

| Área | Feature | Por que é esperada | Complexity | Notas | Decisão aberta |
|------|---------|--------------------|------------|-------|----------------|
| Log por rota | Gravar cada abertura de tela: rota (padrão, não a URL com id), clínica, usuário, papel, horário, e **origem da abertura** (menu, Cmd+K, link direto, redirecionamento) | Sem origem da abertura o log não distingue "ninguém usa" de "ninguém acha". PostHog documenta que SPA não captura navegação por padrão: é preciso `history_change` ou `$pageview` manual por troca de rota | MEDIUM | Gancho no roteador (TanStack Router), não autocapture. Escrever em lote via `sendBeacon` pelo dispatcher `api/sync/manual.ts` (limite de 12 funções) | D3 (o que cortar usa este dado) |
| Log por rota | Gravar a rota como padrão (`/clientes/:id`), nunca a URL com id, nome ou telefone | LGPD: o log não pode virar uma segunda base de dado de paciente | LOW | Testar com rotas que levam id de card/paciente | |
| Log por rota | Separar abertura de médico, de equipe e de equipe "vendo como a clínica" | Com 1 médico-piloto e poucos usuários, misturar papéis esconde o uso real do médico | LOW | Papéis atuais: `owner`/`strategist`/`viewer`. Ver G3 | |
| Log por rota | Retenção definida (bruto 90 dias, depois agregado por rota × semana × papel) | O relógio de 90 dias do SAP e do "0 acessos em 90 dias vira candidata a tirar" (v3) depende de histórico contínuo | LOW | Job de agregação noturno pode reaproveitar o padrão do `resultados_diarios` | |
| Consultas de verificação | Contagem por fonte e por período **com a mesma definição de data** (data do evento na origem, não data de carga) e fuso `America/Sao_Paulo` | Reconciliação falha por comparar grão diferente: data do evento vs data de carga gera alarme falso mesmo com pipeline correto (Dataford, Fivetran) | MEDIUM | Já é parte da causa "período/fuso" listada na Fase 0 | |
| Consultas de verificação | Timestamp por fonte do **último dado gravado**, separado do timestamp da **última tentativa** | Supermetrics documenta o status que mente nos dois sentidos (tentativa falha com dado gravado e vice-versa) | LOW | Estende o `sync-freshness-badge` já existente | |
| Consultas de verificação | Cobertura de `post_id`/`ad_id` (percentual de conversas/cartões com referência) | Pré-requisito do "origem por post" da v2; sem o percentual não há como fixar o piso | LOW | A decisão do piso é do João | D8 |
| Consultas de verificação | Consulta rodada por job ou leitura, nunca por linha na hora da tela | Lição registrada: função por linha deixou o Nexo lento (revertido em 04/11); consulta do usuário corta em 30 s | MEDIUM | Gravar em tabela/`resultado_pronto`, a tela só lê | |
| `metricas_selo` | 4 estados (verde, neutro, âmbar, não medido) gravados, com texto curto e **data da conferência** | Tableau e Power BI usam selo de certificação manual com mensagem de contexto [DOCUMENTADO]. O Nexo precisa do mesmo e de data | MEDIUM | SQL é do João (D6) | D6 |
| `metricas_selo` | Selo identificado por clínica × métrica × **versão da definição** | Mudar a definição tem de invalidar o verde; senão o selo certifica uma conta que já não existe | MEDIUM | O "versão da definição" só tem valor quando D1 estiver decidida | D1 |
| `metricas_selo` | Verde expira (30 dias → neutro) | Tableau/Power BI não expiram sozinhos (certificação manual fica velha); vendors falam em revogação automática [marketing, Wiiisdom] | LOW | Já decidido no brief | |
| `metricas_selo` | Ícone + texto de 14px sempre; cor nunca é o único sinal | Acessibilidade e o requisito de 4,5:1 antes do tema escuro | LOW | Ver pitfall de cores sobrepostas em PITFALLS | D4 |
| `metricas_selo` | "O que este número conta" em uma frase, ao tocar | Klipfolio (catálogo de métricas com definição), Polar ("mostra a definição por trás de cada número"), Amplitude (regra de contagem visível) | LOW | É o texto que a Fase 0 produz | D1 |
| `metricas_selo` | "Não medido" nunca vira zero, vermelho ou queda | Já validado no Nexo (fonte que não mede); precisa ser regra do componente | LOW | Teste de componente | |
| Endpoint `hoje` | Resposta com **status por bloco** (ok, desatualizado, erro, não medido, vazio), hora do dado por bloco e selo por bloco | Cada bloco falha sozinho (brief); Supermetrics e Databox mostram o custo de dado velho sem aviso | MEDIUM | Reusa `resultado_pronto`; entra pelo dispatcher | |
| Endpoint `hoje` | Nunca recalcula conta pesada na requisição | Clínica grande leva ~10 s; teto 30 s | MEDIUM | Ler de cache/tabela pronta | |
| Tela Hoje | Frase-resumo de modelo fixo, no passado, sem adjetivo, que herda o pior selo | Padrão DashThis (blocos fixos) e Amplitude (citar fonte). A regra "passado e sem adjetivo" é do João e é mais estrita que a CFM | LOW | Texto vem de template, não de IA | D9 |
| Tela Hoje | Faixa de fontes com hora ("cálculo de hoje 03:30"), âmbar acima de 1 dia | NexHealth/Solutionreach: dado velho vira ação errada | LOW | Já há selo de atualização por fonte | |
| Tela Hoje | Estados carregando (esqueleto, após 3 s "Calculando, clínica grande leva até 30 s"), vazio (diz a condição que falta), erro dentro do bloco | Defeito clássico de dashboard: setup exigido antes do conteúdo (daily users abandonam) | MEDIUM | Já descritos no brief | D11 (px são aposta) |
| Tela Hoje | Meta só quando cadastrada, no formato "12 de 20, faltam 8 em 9 dias" (aritmética, sem projeção) | AgencyAnalytics, Klipfolio, Practice by Numbers: meta presa à métrica | LOW | Depende da tabela de metas | D1 (qual Agendaram?) |
| Tela Hoje | Funil horizontal 8px, destaque de queda só se monotônico e sem etapa "não medido"; senão "funil inconsistente nesta clínica" | Dado da Lana mostra etapas fora de ordem (Foram 14 > Agendaram 11) | MEDIUM | Teste de monotonia no endpoint, não na tela | D1 |
| Job de conferência | Janela semanal fechada (segunda a domingo, fuso BR), mesma definição de data dos dois lados | Mesmo ponto da reconciliação: definir o grão primeiro | MEDIUM | | D7 (autorizar) |
| Job de conferência | Gravar **os dois números** (regra do Nexo × CRM ao vivo), diferença, causa e id da execução | Trilha de auditoria (Fivetran: registrar cada discrepância e a correção) | MEDIUM | É o que alimenta o âmbar | |
| Job de conferência | Tolerância por faixa (aviso/erro), não um único limite; só diferença **não explicada** reprova | Alation (0,1% geral, 0,01% financeiro), DQOps (aviso 0%, erro 1%): tolerância depende do uso | MEDIUM | Contagem de pessoas tolera menos que contagem de mensagens | |
| Job de conferência | Falha do job nunca muda o selo para âmbar nem mantém verde velho: vira "não conferido" e o verde expira em 30 dias | Evita o status que mente (Supermetrics) | LOW | | |
| Quem chamar hoje | Cada linha tem **motivo explícito e mecânico** ("escreveu há 3 dias, sem resposta"; "em Consulta Agendada há 6 dias") | Dental Intelligence lista com motivo; Weave ordena por "sem resposta há X horas" | MEDIUM | Motivo derivado de evento, nunca de conteúdo da conversa (ver anti-features) | |
| Quem chamar hoje | Exclusões obrigatórias: cartão removido, cópia do robô, quem já voltou/agendou/cancelou | Reclamação recorrente de NexHealth e Solutionreach: recall para quem já foi atendido ou cancelou | MEDIUM | Condição 1 do brief; 39% dos cartões da Lana estão removidos | |
| Quem chamar hoje | Máximo 5 linhas, ordem fixa e visível, rótulo "a partir do CRM", tempo parado | Limite de blocos por tela (Klipfolio); Practice by Numbers "número vira tarefa" | LOW | | |
| Quem chamar hoje | **Máscara no servidor**, por perfil (médico: iniciais; secretária com acesso nominal: primeiro nome; agência: só contagem) | Princípio da necessidade da LGPD; pseudonimização ainda é dado pessoal [web, LOW] | HIGH | O servidor nunca envia o nome inteiro a quem não pode ver | D10 |
| Quem chamar hoje | Registro de quem abriu a lista (usuário, clínica, hora, nível de máscara, quantas linhas) | Acesso por curiosidade ou interesse comercial é infração grave (LGPD e ética médica) [web, LOW]; responsabilização é princípio da LGPD | LOW | Tabela de auditoria própria, sem gravar os nomes | D10 |
| Quem chamar hoje | Botão abre o WhatsApp com template aprovado, com confirmação, nunca envia sozinho | Padrão "aprovar" do Polar e da Whatagraph; restrição do projeto (API oficial) | MEDIUM | Depende da aprovação do template pela Meta (item 9) | D7, D9 |
| Quem chamar hoje | Entrada só passa nas 4 condições na clínica; senão o botão nem aparece | Brief | MEDIUM | Ver "Gate das 4 condições" abaixo | D8, D10 |
| Resumo em sombra | Gerado por template fixo a partir de um **payload estruturado** (os números e seus selos), e o texto é renderizado a partir dele | Sem o payload não dá para medir "2 envios sem diferença entre texto e origem" (condição da v2) | MEDIUM | Guardar payload + texto + hora | D9 |
| Resumo em sombra | Só equipe vê; nada sai para o médico | Whatagraph: aprovação humana antes do envio | LOW | | |
| Resumo em sombra | Quando o selo não é verde: "sem leitura nesta semana: [motivo]" | Brief; a IA se cala | LOW | | |
| Metas por SQL | Meta presa a métrica + período + **versão da definição** | Meta "Agendaram 20" é ambígua enquanto Agendaram tem duas leituras (7 e 11) | LOW | Tabela `clinica_metas` já existe, vazia | D1, D6 |
| Menu / Cmd+K | Paleta de comandos com busca por nome **e sinônimo**, filtrada por papel (médico nunca encontra rota da equipe) | Padrão universal; sem sinônimo o "esconder" vira "sumir" | MEDIUM | Cada abertura gravada com origem "cmdk" | D3 |
| Menu / Cmd+K | Rota escondida continua abrindo por link direto; a abertura também é gravada | Esconder custa uma flag (brief) | LOW | | |
| Menu / Cmd+K | Guarda de rota por papel (não só menu escondido): médico que cola a URL de tela sem selo não vê número sem selo | Brief: "não construir nenhuma tela que mostre número sem selo para o médico" | MEDIUM | Ver G3 sobre papéis | |
| Menu / Cmd+K | Aviso "sem selo" nas telas da equipe que ainda não leem `metricas_selo` | Brief | LOW | | |
| Fase 0 | Tabela "número × origem × diferença × causa × correção" com evidência (captura do CRM ao vivo, data, quem conferiu) | Supermetrics: suporte pede captura do dado correto na própria plataforma | MEDIUM | Trabalho manual, 3 CRMs | D1, D2 |
| Fase 0 | Catálogo fechado de causas (acumulado vs entrou; venda do perfil; sem valor; cartão removido; cópia do robô; fuso; fonte desligada; sem classificação) | Reaproveitado como coluna "causa" do job | LOW | Sai da primeira tabela da Lana | |

### Differentiators (vantagem competitiva; alinhadas ao Core Value "confiar no número")

| Área | Feature | Proposta de valor | Complexity | Notas | Decisão aberta |
|------|---------|-------------------|------------|-------|----------------|
| `metricas_selo` | **Estado âmbar com os dois números escritos** ("regra do Nexo 11, CRM 7 entraram na etapa") | Nenhuma das 50 reconcilia e mostra os dois. Responde direto à queixa "está tudo errado" | MEDIUM | Texto curto vem da tabela, não é montado na tela | D1 (qual regra é "do Nexo") |
| `metricas_selo` | Selo gravado e **auditável** (quem/qual job conferiu, quando, contra qual versão) | Concorrentes certificam à mão e sem rastro | MEDIUM | Alimenta o revisor do resumo ("confere contra `metricas_selo`, não contra a prosa") | D6 |
| Tela Hoje | **Par lado a lado** "7 entraram na etapa · 11 chegaram a ela ou além"; "13 vendas, 3 com valor" | Elimina a ambiguidade em vez de escolher um lado | LOW | O par é a proposta do conselho; **se o par vai ser o padrão é a D1(d)**, e o texto de cada lado depende de D1(a), (b), (c) | D1 |
| Tela Hoje | "Funil inconsistente nesta clínica" como resposta honesta | Nenhum concorrente admite dado fora de ordem | LOW | | |
| Tela Hoje | Uma frase, duas métricas grandes, resto em linhas de 40 a 48 px | 2 a 3 números no topo e o resto por clique é o padrão dos dashboards que funcionam (fontes de UX, LOW) | LOW | Os px são APOSTA até o protótipo | D11 |
| Tela Hoje | Cada bloco falha sozinho (borda âmbar, último valor em cinza com hora, "Tentar de novo" 1x a cada 20 min) | Dashboard de concorrente cai inteiro ou mostra dado velho calado | MEDIUM | | |
| Job de conferência | Calcular **sempre as duas contagens** (entrou na etapa; chegou ao menos até ela) e as duas de "foram" e "venda com/sem valor", independente de qual vira "a regra" | Deixa o job pronto antes de o João decidir, e vira a fonte do par | MEDIUM | Resolve o impasse "construção não espera, liberação espera". O selo só se liga a uma versão quando D1 sair | D1 |
| Job de conferência | Detectar mudança do perfil de etapas da clínica e rebaixar o selo para neutro | Evita verde sobre mapeamento que mudou (a causa nº 1 da Fase 0) | MEDIUM | Hash do perfil gravado junto com o selo | |
| Job de conferência | Conferir por agregado e id, sem puxar nome | Minimização (LGPD) | LOW | | |
| Quem chamar hoje | Modo de validação para a secretária: marcar cada uma das 20 linhas como certa/errada **com motivo** (gravado) | A condição de liberação "acerta >=18 de 20" precisa de instrumento; o motivo do erro vira a lista de regra a corrigir | MEDIUM | Ver G2 | D10 (se a validação for nominal) |
| Quem chamar hoje | "Já chamei" / adiar 12 h, que some a linha para a clínica toda | Dental Intelligence tem "snooze" de 12 h; evita a lista repetir | MEDIUM | Exige escrita e estado; **candidato a v1.5**, não v1 | |
| Quem chamar hoje | Prazo da janela de 24 h do WhatsApp visível por linha | Weave/Podium apenas citam o tempo de espera; a janela da API oficial é prazo real | MEDIUM | Quem escreveu há mais de 24 h exige template | D7, D9 |
| Resumo em sombra | Verificação automática "número do texto = número do payload = `metricas_selo`" antes de qualquer revisão humana | Reduz o revisor a um check; mede a condição da v2 | MEDIUM | | |
| Resumo em sombra | Linter dos textos: proíbe futuro, condicional, adjetivo e verbo fora da lista fechada | Operacionaliza "no passado, sem adjetivo, sem promessa" e a regra CFM, de forma testável | MEDIUM | A lista é do João | D9 |
| Log por rota | Matriz "telas abertas na mesma sessão" | É a condição que o brief impõe para executar fusões na v2 | MEDIUM | Calcula-se do log; não precisa de UI na v1 | |
| Log por rota | Termos de Cmd+K sem resultado | Mostra o que a equipe procura e não existe | LOW | Gravar a busca (texto sem dado de paciente) | |
| Metas por SQL | Configuração guiada por perguntas (padrão Behance) | Reduz a tela "Configurar este cliente" | HIGH | **Fora da v1** (metas entram por SQL); anotado para v2 | |
| Menu / Cmd+K | Rótulo "sem selo" ao lado da rota na paleta, para a equipe | Mostra o que ainda não leu `metricas_selo` | LOW | | |

### Anti-Features (parecem boas, causam problema)

| Feature | Por que é pedida | Por que é problemática | Alternativa |
|---------|------------------|------------------------|-------------|
| Analytics de terceiros (PostHog, Mixpanel, Hotjar, replay de sessão) para o log por rota | Rápido de ligar, tem funil e coorte | Envia dado de uso (e, com replay, tela com paciente) a um terceiro; clínica = dado de saúde; mais uma dependência no limite da Vercel Hobby; e o objetivo é só "essa rota foi aberta?" | Tabela própria no Supabase, escrita pelo dispatcher, só rota-padrão |
| Autocapture de cliques e heatmap | "Vamos descobrir o que usam" | Captura texto de tela; cresce sem controle; não responde à decisão de cortar tela | Só abertura de rota + origem + busca do Cmd+K |
| Concluir "rota com 0 acessos" logo depois de esconder | Parece dado limpo | **Viés de seleção:** esconder a rota reduz o acesso por construção. Com 1 médico e poucos usuários o poder estatístico também é baixo | Guardar a origem da abertura; tratar "0 acessos" como candidata, nunca como prova; ter janela de linha de base antes de esconder (ver G1) |
| Nota/score de saúde do dado ("Qualidade 87%") | Resume tudo num número | Score sem fórmula é proibido pelo brief; esconde qual métrica está errada | Selo por métrica com texto |
| Selo calculado na tela | Evita tabela | Quebra "gravado, nunca calculado"; some a trilha | `metricas_selo` escrito só pelo job/SQL do João |
| Selo verde por padrão ou verde "otimista" | Menos âmbar na tela | Destrói o objetivo; é o erro de "100% de acurácia" (Polar, autodeclarado) | Neutro é o padrão; verde só com conferência ao vivo |
| Explicar divergência culpando o CRM ("o Kommo conta errado") | Tira a culpa do Nexo | Polar faz isso e a equipe quer saber **qual número vale**, não quem erra | Escrever os dois números e a regra de cada um |
| Três modelos de atribuição, ou qualquer escolha de janela/modo para o médico | Flexibilidade (Northbeam) | Médico não é analista; já listado em Out of Scope | Uma regra por métrica, o resto escondido |
| Projeção de meta ("ritmo atual leva a 15", forecast do Databox) | Responde "vou bater?" | Proibido (brief + CFM: sem previsão/promessa) | "12 de 20, faltam 8 em 9 dias" |
| R$ solto no cartão Fecharam | Dinheiro chama atenção | 10 de 13 vendas sem valor; o total engana | "13 vendas, 3 com valor" |
| Chip de variação (verde/vermelho "vs período anterior") em número sem selo verde | Padrão Databox/Behance | Compara dois números não conferidos; variação vira "queda" falsa quando o dado é "não medido" | Variação só em verde, com a regra atual (base mínima 30, teto 300%) |
| Resumo com texto livre de IA | Soa inteligente | Risco CFM; a IA só descreve número verde (D12 ainda aberta) | Template fixo + payload; IA só na v3 |
| Resumo ou lista com conteúdo da conversa, "tipo de cliente", sentimento, "o que foi bem/melhorar" | Padrão do painel lateral do Behance | Dado de saúde derivado de conversa (LGPD art. 5 II e 11); diagnóstico de paciente; fora da v1 por decisão do conselho | Motivo mecânico (tempo parado, etapa, origem) |
| "Motivo" que cita procedimento de interesse ("perguntou sobre toxina") | Ajuda a secretária | Revela dado referente à saúde na lista mascarada | Motivo só por evento: escreveu, etapa, dias |
| Exportar a lista Quem chamar (CSV/PDF), mostrar telefone | Praticidade | Escapa da máscara e do log; vira cópia de dado sensível | Somente o botão do WhatsApp, linha a linha |
| Disparo automático de mensagem ao paciente | Concorrentes (Weave, Solutionreach, NexHealth) fazem recall automático | Brief: nunca envia sozinho; risco CFM/LGPD e de enviar a quem já voltou | Botão com confirmação |
| Pedir avaliação no Google pelo botão pós-consulta | Podium/Birdeye | Publicidade médica (CFM) | Não construir |
| Rastrear quem não escreveu à clínica (prospecção fria) | Taplio | Fora da condição 2; sem expectativa legítima do titular | Só quem já escreveu |
| Pizza, rosca, gauge, eixo duplo, projeção, funil em cone | Padrão de dashboards | Proibidos pelo sistema visual | Barra horizontal 8px e barra de meta |
| Menu de 13 itens, construtor de dashboard, 400 KPIs | Flexibilidade (Practice by Numbers, Metabase, Klipfolio) | É o labirinto que o v5 quer sair | 2 itens para o médico, 3 para a equipe, Cmd+K |
| Fundir telas antes de haver log | Limpar o menu rápido | Brief: fusão só na v2 e só se o log mostrar as telas abertas na mesma sessão | Esconder (flag) |
| Apagar telas sem dado de uso | Menos código | Out of Scope; apagar é decisão do João | Esconder; marcar candidatas |
| Corrigir sozinho o dado do Nexo com o do CRM | "Fecha a diferença" | Mascara a causa; o João pediu tabela com causa e correção por decisão | Job só mede e grava; correção passa por PR e pela tabela da Fase 0 |

---

## Feature Dependencies

```
Fase 0 (conferência à mão + tabela + catálogo de causas)
    └──informa──> definições (D1, D2)  [decisão do João, não do GSD]
    └──semeia──> catálogo de causas do job

Log por rota (item 1)
    └──destrava──> decisões de cortar/fundir (D3), SAP 90 dias (D5)
    └──fornece──> origem "cmdk" para o menu enxuto

Consultas de verificação (item 2)
    └──requires──> mesma definição de data/fuso nos dois lados
    └──alimenta──> job de conferência (item 6) e condição 4 do Quem chamar

metricas_selo (item 3)  [SQL do João: D6]
    └──requires──> versão da definição  ──depende de──> D1
    └──requer escritor──> job de conferência (item 6) para sair do neutro
    └──alimenta──> endpoint hoje (4) ──> tela Hoje (5)
    └──alimenta──> resumo em sombra (8): o revisor confere contra o selo
    └──alimenta──> guarda de rota "sem selo" no menu

Job de conferência Kommo (item 6)  [autorizar: D7]
    └──requires──> consultas de verificação (2) e tabela selo (3)
    └──torna possível──> "Agendaram e Fecharam em verde na Lana" (condição da v1.5)
    └──depois──> FlwChat e Digisac (v2)

Endpoint hoje (4) ──requires──> selo (3), metas (10, opcional), cache resultado_pronto
    └──> tela Hoje (5), que também requer papéis/guardas do menu

Quem chamar (item 7)
    └──requires──> consultas de verificação (condição 4), exclusões de cartão removido/robô (1)
    └──requires──> máscara por perfil + log de abertura  ──depende de──> D10, G3
    └──requires──> template aprovado (item 9)  ──depende de──> D7, D9
    └──requires──> instrumento de validação das 20 linhas (G2)

Metas por SQL (item 10) ──requires──> versão da definição (D1) e SQL (D6)

Resumo em sombra (item 8) ──requires──> payload estruturado + selo + opt-in (D6) + templates/verbos (D9)
    └──v1.5 envio ao médico requires──> template Meta (item 9), condição "verde na véspera"

Cmd+K / menu enxuto ──enhances──> log por rota (origem da abertura)
    └──conflicts──> fusões de telas na v1 (adiadas para v2 por decisão)
```

### Dependency Notes

- **Selo depende do João antes de poder ser verde:** a infraestrutura (tabela, job, endpoint, tela) pode ser construída antes; o que não pode é marcar Agendaram, Foram ou Fecharam como verde, porque "verde" significa "a regra do Nexo bate com o CRM ao vivo" e a regra é D1. Até lá, o par com âmbar/neutro é o estado real.
- **Tela Hoje vem antes do verde:** pela ordem do brief (4, 5, depois 6), a Hoje sai com selos neutro e "não medido". Isso é aceitável porque o rótulo da clínica-piloto é "em conferência". O verde chega com o job.
- **O log por rota precisa começar cedo e sem lacuna:** o relógio de 90 dias do SAP (D5) e a condição "log por rota ligado" da v1.5 contam a partir de quando o log está gravando. Atraso no PR 1 atrasa duas decisões.
- **Quem chamar depende de coisas de três tipos:** dado (condições 1, 2 e 4), pessoas (secretária: 20 linhas) e jurídico/Meta (D10, template). O botão só nasce quando os três passam.
- **Conflito log × esconder:** esconder as 73 rotas muda o comportamento que o log mede. Ver G1.

---

## Gate das 4 condições do "Quem chamar hoje" (o que o recurso precisa para ser testável)

| Condição | O que o recurso precisa ter | Risco |
|----------|-----------------------------|-------|
| 1. Excluir cartão removido e cópia do robô | Filtro server-side, testado com a Lana (39% removidos; 1 cópia de robô na semana conferida) | Cópia de robô só foi vista no Kommo. Em FlwChat/Digisac a causa é outra |
| 2. Só quem já escreveu, com motivo explícito | Relação conversa → cartão. Em Kommo o cartão nasce da conversa, mas a ligação precisa ser verificada | O "limite de casamento conversa→card" é D8; confirmar se a condição 2 já depende dele na v1 |
| 3. Secretária valida 20 linhas (>=18 certas) | Tela/planilha de validação que grava veredito + motivo (G2); acesso nominal ou casamento por iniciais+etapa no CRM | Se o acesso nominal não tiver base contratual (D10), a validação tem de ser feita só com iniciais |
| 4. Consulta de timestamp verificada | "Tempo parado" calculado de evento de etapa/mensagem com data conferida | Movimento de etapa só existe desde 14/10/2025 (36% dos cartões). Cobertura baixa derruba a lista (e o "Esta semana" desliga com cobertura <50%) |

---

## Regras CFM e LGPD aplicáveis aos recursos novos

Nota: o painel é interno (médico e equipe), então a Resolução CFM 2.336/2023 (em vigor desde 11/03/2024) não regula a tela em si. As regras do João (passado, sem adjetivo, sem previsão, sem promessa) são mais estritas e são o que vale. A CFM entra nos pontos em que o texto sai do painel: **template de WhatsApp ao paciente**, **resumo ao médico (v1.5)** e qualquer PDF/relatório que o médico republique. A CFM proíbe garantir, prometer ou insinuar resultado e exige conteúdo educativo, sem sensacionalismo ou autopromoção [web, LOW: portal.cfm.org.br, migalhas, mattosfilho].

| Recurso | CFM | LGPD |
|---------|-----|------|
| Frase da Hoje, resumo em sombra | Template fixo, passado, sem adjetivo ("13 vendas, 3 com valor", não "ótima semana"); linter dos textos (D9 define a lista) | Só agregados, sem paciente |
| Template WhatsApp ao paciente | Sem promoção, sem promessa, sem "antes e depois". Texto neutro de retorno ("recebemos sua mensagem...") | Não pôr dado de saúde nas variáveis do template. Mensagem misturando conteúdo promocional vira categoria **marketing** na Meta (mais cara, exige opt-in) [web, LOW] |
| Quem chamar hoje | n/a | Lista de pacientes de uma clínica já é dado referente à saúde (sensível, art. 5 II e 11). Mínimo necessário (iniciais, origem, etapa, tempo). Máscara no servidor. Log de acesso. Base legal do acesso nominal da equipe é **D10** (não decidir) |
| Log por rota | n/a | Identifica usuário (médico, equipe). Informar nos termos, definir retenção, não gravar parâmetros de URL com id de paciente |
| Job de conferência | n/a | Comparar agregados e ids; não copiar nome para a tabela de conferência |
| Opt-in do resumo | Médico deve aceitar receber | O opt-in é um registro (D6 inclui o SQL) |
| WhatsApp | Conversa 1:1 só API oficial; grupo só Evolution | Template é o único tipo de mensagem fora da janela de 24 h [web, LOW]. Se "escreveu uma vez à clínica" basta como opt-in para template iniciado pela empresa **não foi confirmado**; checar na documentação da Meta antes do pedido do template |

Lacuna de pesquisa: não achei fonte oficial (ANPD) sobre mascaramento de lista de contatos em clínica nem sobre base legal para agência acessar lista nominal. Fica para o parecer jurídico da D10.

---

## Lacunas fora das 12 decisões (achadas pela pesquisa; recomendação minha)

| # | Lacuna | Por que importa | Recomendação |
|---|--------|-----------------|--------------|
| G1 | **Viés do log**: esconder as 73 rotas reduz o acesso a elas | "0 acessos em 90 dias" (v3) e a decisão de cortar (D3) podem sair enviesadas | Gravar `origem` (menu, cmdk, link, redirect). Ligar o log **antes** do menu enxuto, para ter uma janela de linha de base, mesmo curta. Não usar "0 acessos" como prova |
| G2 | **Instrumento de validação das 20 linhas** não existe | A condição ">=18 de 20" não é medível sem registro | Tabela mínima `quem_chamar_validacao` (linha, veredito, motivo, quem, quando). Pode ser formulário simples. Não gravar nome |
| G3 | **Papéis**: o banco tem `owner`/`strategist`/`viewer`, mas o brief fala em médico, secretária com acesso nominal e agência | Máscara por perfil e guarda de rota por papel precisam de um atributo de permissão que hoje não existe | Mapear antes de implementar (nominal = atributo à parte do papel). Quais pessoas recebem o acesso nominal é jurídico (D10); o mecanismo é técnico |
| G4 | "**Log por rota ligado**" (condição de liberação da v1.5) não tem definição mensurável | Condição sem teste não libera nada | Propor critério (por exemplo, linhas gravadas por dia por papel durante N dias). O número é do João |
| G5 | **Cmd+K não existe no celular** | O médico no celular tem só 2 itens, mas a equipe pode usar celular; sem alternativa as 73 telas "somem" | Botão visível de busca no cabeçalho, além do atalho de teclado |
| G6 | **Quem escreve o selo?** | Se for à mão, volta o problema de certificação sem rastro | Somente job e SQL do João escrevem verde/âmbar. Nada de botão "marcar como conferido" na tela |

---

## MVP Definition

### Launch With (v1: clínica-piloto Lana, ordem do brief, um PR por item)

- [ ] Log por rota com origem da abertura, rota-padrão, retenção e papel, ligado **antes** do menu enxuto (G1) — destrava D3 e D5
- [ ] Consultas de verificação com timestamp por fonte, cobertura de `post_id`/`ad_id` e grão de data único — insumo do job e da condição 4
- [ ] `metricas_selo` com 4 estados, texto curto, versão da definição, expiração em 30 dias — **depende de D6**
- [ ] Endpoint `hoje` com status, hora e selo por bloco — pelo dispatcher
- [ ] Tela Hoje: frase fixa, faixa de fontes, Agendaram (par), Fecharam ("N vendas, M com valor"), Chamaram, Foram, funil, meta — com selos neutro/"não medido" até o job rodar. **Responde D1, D2 (quando liberada) e D4 do conselho; D3 e D5 ficam para a v2**, porque origem por post e "Esta semana" estão na v2 do brief (a descrição da Hoje no brief menciona "Esta semana", mas o PROJECT.md ativo não a inclui na v1; confirmar)
- [ ] Job de conferência semanal do Kommo gravando as duas contagens, a diferença e a causa — **depende de D7**
- [ ] "Quem chamar hoje" atrás das 4 condições, com máscara no servidor e log de abertura — **depende de D10, D8 (possivelmente), D9, template (item 9)**
- [ ] Resumo semanal em sombra, só equipe, por template e payload — **depende de D9 e D6 (opt-in)**
- [ ] Pedido do template do WhatsApp à Meta (texto neutro) — **depende de D7 e D9**; a aprovação tem prazo externo, vale submeter cedo
- [ ] Metas por SQL com versão da definição — **depende de D1 e D6**
- [ ] Menu enxuto: médico 2 itens, equipe 3, Cmd+K com log e botão de busca visível, guarda de rota, aviso "sem selo", SAP escondido

### Add After Validation (v1.5 e v1.x)

- [ ] Resumo ao médico pelo WhatsApp oficial — gatilho: D1 fechada, Agendaram e Fecharam verdes, 18 de 20 acertos, log ligado
- [ ] "Já chamei" / adiar 12 h na lista — gatilho: secretária pedir; exige escrita
- [ ] Rebaixamento automático de selo por mudança do perfil de etapas — pode ser v1 se o custo for baixo

### Future Consideration (v2+)

- [ ] FlwChat e Digisac por clínica, com job próprio — v2
- [ ] "Esta semana" (verbos fechados, cobertura exibida) e origem por post com `post_id`/`ad_id` — v2
- [ ] Fusões em abas, só se a matriz de sessão pedir — v2
- [ ] Metas com configuração guiada por perguntas — v2
- [ ] Painel lateral "o que foi bem/melhorar" e "tipo de cliente" — só por regra e sem diagnóstico (CFM/LGPD)
- [ ] "Pergunte ao Nexo" — v3, depende de D12

---

## Feature Prioritization Matrix

| Feature | Valor | Custo | Prioridade | Bloqueio por decisão aberta |
|---------|-------|-------|------------|----------------------------|
| Log por rota | HIGH (destrava cortes e SAP) | MEDIUM | P1 | nenhum (D3/D5 usam o resultado) |
| Consultas de verificação | HIGH | MEDIUM | P1 | D8 só no piso de cobertura |
| `metricas_selo` | HIGH (Core Value) | MEDIUM | P1 | D6; D1 para o verde |
| Endpoint `hoje` | HIGH | MEDIUM | P1 | nenhum |
| Tela Hoje | HIGH | MEDIUM | P1 | D1 (rótulos), D9 (texto), D4 e D11 (visual) |
| Job de conferência Kommo | HIGH (único caminho para verde) | MEDIUM | P1 | D7 |
| Menu enxuto + Cmd+K | MEDIUM | MEDIUM | P1 | D3, D5, D11 (card sorting) |
| Quem chamar hoje | HIGH | HIGH | P1 (atrás do gate) | D10, D8, D9, D7 |
| Metas por SQL | MEDIUM | LOW | P2 | D1, D6 |
| Resumo em sombra | MEDIUM | MEDIUM | P2 | D9, D6 |
| Pedido do template Meta | MEDIUM (prazo externo) | LOW | P1 (iniciar cedo) | D7, D9 |
| Instrumento das 20 linhas (G2) | HIGH (libera a v1.5) | LOW | P1 | D10 |
| "Já chamei"/adiar | MEDIUM | MEDIUM | P3 | nenhum |

**Prioridade:** P1 = necessário para a condição de liberação da v1.5; P2 = esperado na v1 mas não bloqueia a condição; P3 = depois.

---

## Competitor / Pattern Analysis

| Padrão | Quem faz | Como faz | O que o Nexo adota |
|--------|----------|----------|--------------------|
| Selo de confiança | Tableau (selo verde manual com mensagem), Power BI (certified/promoted), Northbeam ("contado" vs "modelado") | Certificação manual do ativo, sem versão da definição e sem expirar [web, LOW] | Selo por métrica × versão, gravado, com expiração, e o âmbar com os dois números |
| Definição ao lado do número | Klipfolio (catálogo, métricas "certificadas"), Polar (AI Operator mostra a definição), Amplitude (regra de contagem) | Texto curto por métrica | "O que este número conta" ao tocar, vindo da Fase 0 |
| Saúde da conexão | Swydo (painel central de status), Supermetrics (dicionário de erro, status pode mentir) | Status por fonte, mensagem de erro | Hora do dado gravado, não da tentativa; texto em português claro |
| Meta com ritmo | Databox (aviso aos 70%), AgencyAnalytics, Klipfolio, Practice by Numbers | Barra e aviso; Databox projeta | Barra e "faltam N em M dias", **sem projeção** |
| Lista de contato do dia | Dental Intelligence (Suggested Patients, snooze 12 h), NexHealth (recall com regra nomeada), Weave (sem resposta há X h), Podium (fila com cronômetro) | Lista vinda do sistema da clínica, regra nomeada, exclusões fracas (reclamações de lembrete para cancelado) | Lista do CRM com 4 condições, máscara e log. Não envia sozinha |
| Resumo semanal | Reportei (WhatsApp, 3 números + 1 ação), DashThis (4 blocos fixos), Whatagraph (aprovação antes de enviar), Databox (feed, até 5 métricas) | Texto curto e link | Sombra, template fixo + payload, revisor contra `metricas_selo` |
| Reconciliação | Fivetran, Alation, DQOps, Synq, Soda [web, LOW] | Contagem por linha/agregado, tolerância por faixa, explicar diferenças esperadas, trilha de auditoria | Job semanal com duas contagens, causa catalogada, tolerância por faixa |
| Log de uso | PostHog (history_change em SPA) | Eventos de navegação | Tabela própria, só rota-padrão e origem; sem terceiros |
| Home de decisão | Padrão de UX "uma tela, uma pergunta"; 2 a 3 números e o resto por clique [web, LOW] | Inverted pyramid, progressive disclosure | Hoje em coluna única |

---

## Sources

Internos (alta relevância, são as decisões do projeto):
- `/Users/joao/dev/dashboard-gsd/.planning/PROJECT.md`
- `/Users/joao/Downloads/Nexo-Modelo/BRIEF-GSD-Nexo-v5.md`
- `/Users/joao/Downloads/Nexo-Modelo/FASE0-Lana-27out-02nov.md`
- `/Users/joao/Downloads/Nexo-Modelo/REFERENCIA-Behance-NEXO-UI.md`
- `/Users/joao/Downloads/Nexo-Modelo/pesquisa-50/RESUMO-50-para-o-conselho.md` (fichas de Databox, Klipfolio, Northbeam, Polar, Swydo, Supermetrics, Dental Intelligence, Weave, Podium, NexHealth, Solutionreach, Practice by Numbers, AgencyAnalytics, Whatagraph, DashThis, Reportei, Amplitude, Metabase; evidência de segunda mão e marketing, conforme os rótulos das próprias fichas)

Web (provider `websearch`, confiança LOW pelo seam; checar na fonte antes de decidir):
- CFM 2.336/2023, publicidade médica: https://portal.cfm.org.br/noticias/cfm-atualiza-resolucao-da-publicidade-medica ; https://www.mattosfilho.com.br/unico/regras-publicidade-medica/ ; https://www.migalhas.com.br/quentes/393424
- LGPD e dado de saúde (art. 5 II, art. 11, necessidade, pseudonimização): https://confidata.com.br/blog/lgpd-saude-prontuarios-pesquisa-dados-sensiveis ; https://www.migalhas.com.br/depeso/449916/tratamento-de-dados-em-saude-bases-legais-limites-e-boas-praticas
- WhatsApp Business Platform, categorias de template, janela de 24 h, preço: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing (a cobrança de utility dentro da janela a partir de 01/10/2026 aparece só em fontes secundárias e conflita; verificar)
- Certificação de fonte de dados: https://help.tableau.com/current/online/en-us/datasource_certified.htm ; https://community.fabric.microsoft.com/t5/Power-BI-Updates-Blog/Announcing-new-certification-capabilities-for-dataflows/ba-p/5175866
- Navegação em SPA no PostHog: https://posthog.com/tutorials/spa ; https://posthog.com/docs/libraries/js/config
- Reconciliação de dados: https://www.fivetran.com/learn/data-reconciliation ; https://docs.alation.com/en/latest/steward/AlationDataQuality/ManageChecks/ReconciliationChecks.html ; https://dqops.com/docs/categories-of-data-quality-checks/how-to-reconcile-data-and-detect-differences/ ; https://docs.synq.io/reconciliation/comparison-modes.md
- UX de home de decisão: https://www.uxpin.com/studio/blog/dashboard-design-principles/ ; https://raw.studio/blog/dashboard-design-disasters-6-ux-mistakes-you-cant-afford-to-make/

Limites da pesquisa: nenhuma tela das 50 plataformas foi vista; não achei orientação da ANPD sobre mascaramento de lista; a regra de opt-in da Meta para mensagem iniciada pela empresa após mensagem espontânea do paciente não foi confirmada; a busca sobre "viés de seleção em log de uso quando a tela é escondida" é raciocínio meu, não fonte.

---
*Feature research for: Nexo v5.0, Fase 0 + degrau v1*
*Researched: 2026-11-09*
