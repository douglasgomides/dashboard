# Banco de Ideias de Anúncio · Pesquisa para o Gestor de Tráfego (Doctor Creator / SAP)

Data: 16/10/2026 · Escopo: só pesquisa. Nada foi criado nem alterado em sistemas externos e nenhuma verba foi gasta.

---

## 0. Status da Biblioteca de Anúncios da Meta (leia primeiro)

**Não consegui usar a Biblioteca de Anúncios.**

- `ToolSearch` foi rodado 4 vezes ("ads_library_search", "select:mcp__Meta__ads_library_search", "ads_library", "Meta ads_library_search"). O servidor MCP "Meta" publica instruções nesta sessão, mas a ferramenta `mcp__Meta__ads_library_search` não aparece entre as ferramentas carregáveis. Nenhuma outra ferramenta da Meta foi exposta.
- Tentativa direta: `facebook.com/ads/library` e `graph.facebook.com/ads_archive` são **bloqueados pelo proxy de saída desta sessão** (connect_rejected / 403). O WebFetch também não resolveu `sistemas.cfm.org.br` nem `benly.ai`.
- Usei então só o **WebSearch** (resumos de busca) para padrões de mercado, regras CFM e política da Meta.

**Consequência para a seção 2:** não registrei anúncios reais com anunciante e data de início. Isso seria inventar dados. No lugar, a seção 2 traz **24 arquétipos recorrentes** de anúncio médico no mercado brasileiro, preenchidos com tudo o que a tarefa pede (formato, gancho, estrutura, CTA, etapa, risco CFM). Traz também um **protocolo de 20 minutos com uma tabela pronta** para o Gestor preencher na Biblioteca com anunciantes e datas reais. Quando o MCP Meta voltar, essa tabela é a pauta da busca.

---

## 1. O que a pesquisa trouxe (com fontes)

### 1.1 Regras CFM, Resolução 2.336/2023 (em vigor desde 11/03/2024)
- **Antes e depois** passou a ser aceito com condições: caráter educativo, ligado à especialidade registrada, paciente não identificável (ou com autorização) e sem sensacionalismo nem autopromoção. A manipulação de imagem é proibida. Também é preciso informar os fatores que influenciam o resultado e as complicações possíveis. Fontes: [Correio Braziliense](https://www.correiobraziliense.com.br/brasil/2023/09/5124671-medicos-poderao-apresentar-antes-e-depois-de-pacientes.html), [Machado Meyer](https://www.machadomeyer.com.br/en/recent-publications/publications/life-sciences-and-healthcare/cfm-updates-medical-advertising-rules), [Migalhas](https://www.migalhas.com.br/quentes/393424/cfm-muda-regra-e-permite-antes-e-depois-de-pacientes-na-internet).
- **Depoimentos** devem ser sóbrios: sem adjetivo de superioridade e sem promessa de resultado. Elogios de terceiros repetidos ou sistemáticos podem ser investigados pelas CODAMEs. Fonte: [Machado Meyer](https://www.machadomeyer.com.br/en/recent-publications/publications/life-sciences-and-healthcare/cfm-updates-medical-advertising-rules).
- **Dados obrigatórios no anúncio:** nome do médico, especialidade (quando registrada), CRM e RQE (quando houver). É vedado anunciar método não reconhecido pelo CFM. Fontes: [CREMERO, Manual CODAME 2024](https://cremero.org.br/wp-content/uploads/2024/07/CODAME___MANUAL_2024.pdf), [texto da Resolução (CRM-ES)](https://crmes.org.br/wp-content/uploads/2023/09/Resolucao-2336-2023-publicidade-e-propaganda-medica.pdf).
- **Atenção, divergência:** segundo análises jurídicas, a 2.336 **permite** divulgar o valor da consulta e fazer campanhas promocionais, desde que sem venda casada e sem sorteio ([Campos Thomaz](https://camposthomaz.com/_2022/wp-content/uploads/2023/09/Alerta_CFM-updates-medical-advertising-rules.pdf), [Bip](https://www.usebip.com/blogs/bip-insights/marketing-medico-2026-regras-cfm), [Medway](https://www.medway.com.br/conteudos/cfm-atualiza-a-resolucao-sobre-a-publicidade-medica/)). **A regra da Doctor Creator (sem preço e sem desconto) é mais restritiva que a norma, e isso é bom**: protege a conta e o posicionamento. Vale registrar no app que é uma política da casa, para o médico não ouvir do concorrente que "o CFM deixa" e achar que a agência errou.
- **Contexto de risco:** um TCC da UFS encontrou pelo menos uma infração ética em 87,5% dos perfis de dermatologistas e cirurgiões plásticos analisados ([UFS](https://ri.ufs.br/handle/riufs/20361)). A SBD publicou um Guia de Boas Práticas nas Redes Sociais ([portal CFM](https://portal.cfm.org.br/noticias/sociedade-de-dermatologia-alerta-escolha-do-medico-especialista-nao-deve-ser-feita-pelas-midias-sociais/)). Copiar "o que o mercado faz" não é seguro por padrão.

### 1.2 Política da Meta (afeta diretamente o gancho)
- A Meta reprova copy que **afirma ou insinua conhecer a condição de saúde de quem vê** (atributos pessoais). Exemplos citados de copy barrada: "Você sofre de...?" e "Você luta contra...?". Também reprova anúncio que gere **autopercepção negativa** para vender procedimento. Fontes: [Accelerated Digital Media 2026](https://www.accelerateddigitalmedia.com/insights/guide-to-social-media-health-ad-restrictions-2026/), [OuterBox](https://www.outerboxdesign.com/?p=29034), [Giraffe Social](https://www.giraffesocialmedia.co.uk/running-ethical-and-compliant-meta-ads-in-healthcare).
  - **Regra prática para o banco:** o gancho "pergunta-dor" deve ser escrito em **3ª pessoa ou na voz da médica** ("Muitas mulheres de 45 anos acordam encharcadas de suor e acham que é normal"), não em 2ª pessoa diagnóstica ("Você tem calorões?").
- Desde 2025, a Meta limita os eventos de conversão de fundo de funil (ex.: agendamento) para anunciantes de saúde e desativa públicos personalizados e conversões com nomes sensíveis. A página de destino também é revisada. Fontes: [wetracked](https://www.wetracked.io/post/meta-ads-new-sensitive-categories-restrictions), [Accelerated Digital Media](https://www.accelerateddigitalmedia.com/insights/guide-to-social-media-health-ad-restrictions-2025/), [Cardinal Digital](https://www.cardinaldigitalmarketing.com/healthcare-resources/blog/10-ways-to-succeed-on-meta-in-2025/).
  - **Para o C3:** dar nomes neutros aos públicos e eventos ("Engajou IG 90d", nunca "Menopausa interessadas") e preferir públicos de engajamento do perfil e de vídeo a listas sensíveis.

### 1.3 Criativos em saúde: o que os dados indicam
- Criativo pesa mais que segmentação na Meta, e o gancho precisa entregar a mensagem sem clique: segundo a fonte, 97% dos usuários não clicam ([Cardinal Digital](https://www.cardinaldigitalmarketing.com/healthcare-resources/blog/10-ways-to-succeed-on-meta-in-2025/)).
- Benchmark de cerca de 17 mil criativos de saúde e bem-estar (1º trim. 2026): vídeo é 47,9% dos criativos e o estilo UGC/orgânico predomina. Vida mediana do UGC: 22 dias, com 34% passando de 30 dias. Lifestyle/editorial chega a 37% ([Benly](https://benly.ai/benchmarks/health-wellness); fonte de fornecedor, use como direção).
- Em suplementos, a **imagem única** teve a maior duração média, com 268 dias ([Digital Agency Network](https://digitalagencynetwork.com/the-supplement-ad-report-2025-what-actually-works-in-meta-advertising-now/)). **Conclusão para o banco:** manter imagem estática sem rosto como formato de primeira classe, e não só vídeo.
- **Longevidade é sinal, não prova.** A MIT Technology Review mostrou anúncios de saúde enganosos rodando meses sem contestação ([MIT TR](https://www.technologyreview.com/2022/06/27/1054784/facebook-meta-cancer-treatment-ads-misinformation/)). No Reino Unido, a ASA analisou mais de 4 mil anúncios de cirurgia estética na Meta e achou como problemas mais comuns pacotes que exploram insegurança corporal e ofertas por tempo limitado ([ASA](https://www.asa.org.uk/resource/enforcement-report-cosmetic-surgery-abroad.html)). Usar "roda há muito tempo" só como **filtro inicial**, nunca como selo de "pode copiar".
- No Brasil, a estética concentra cerca de 70% dos anúncios digitais da medicina, e 89% dos anúncios analisados estão nas plataformas Meta ([Mundo do Marketing](https://mundodomarketing.com.br/estetica-concentra-70-dos-anuncios-digitais-da-medicina-no-brasil)). Em ginecologia e reposição hormonal há **menos concorrência criativa**, o que abre espaço.
- Funil: topo com público frio, meio com conteúdo de valor e fundo com remarketing para conversa no WhatsApp, usando o CTA nativo "Enviar mensagem" ([WhatsApp Business](https://whatsappbusiness.com/pt-br/blog/getting-value-from-whatsapp-messaging-marketing-edition/), [Trafius](https://trafius.com.br/blog/funil-vendas-trafego-pago)).
- Dor real de menopausa e reposição para os ganchos: fogachos, humor, libido, peso, ansiedade. Só 52% aderem a algum tratamento e só 19,5% usam ou já usaram terapia hormonal, com **os mitos como barreira principal** ([Metrópoles/Einstein](https://www.metropoles.com/saude/menopausa-preciso-reposicao-hormonal), [Jovem Pan](https://jovempan.com.br/?p=23573)). Há contraindicações absolutas ([O Popular](https://opopular.com.br/noticias/magazine/menopausa-sem-vergonha-1.2355415)), então todo anúncio de reposição precisa de "avaliação individual".

---

## 2. Arquétipos de anúncio observados no mercado (24) + protocolo para registrar anúncios reais

> **Não são anúncios verificados na Biblioteca.** São padrões recorrentes em anúncios de médicos e clínicas no Brasil, descritos para servir de pauta de busca e de base para os modelos da seção 3. As colunas "Anunciante" e "Desde" ficam para o Gestor preencher (protocolo 2.2).

Legenda CFM: 🟢 dentro, 🟡 depende da execução (pede ciente), 🔴 fora.

### 2.1 Tabela de arquétipos

| # | Especialidade típica | Formato | Gancho / 1ª frase (padrão) | Estrutura | CTA | Etapa | CFM / Meta |
|---|---|---|---|---|---|---|---|
| A1 | Ginecologia | Reels, médica para a câmera | "Calorão aos 45 não é 'coisa da idade' que você tem que aguentar." | Mito-verdade | Seguir | C1 | 🟢. Evitar "você tem..." diagnóstico |
| A2 | Reposição hormonal | Reels | "3 sinais de que os hormônios mudaram antes da menstruação parar" | Lista educativa | Seguir / salvar | C1 | 🟢 |
| A3 | Dermatologia | Reels, POV | "O erro que eu mais vejo no consultório com protetor solar" | Erro comum | Seguir | C1 | 🟢 |
| A4 | Oftalmologia | Reels, demonstração | "O que acontece com seu olho depois de 8h de tela" | Explicação visual | Seguir | C1 | 🟢 |
| A5 | Cirurgia plástica | Reels | "Pergunta que toda paciente faz e quase nenhum cirurgião responde" | Pergunta frequente | Seguir | C1/C2 | 🟢 |
| A6 | Ginecologia | Carrossel tipográfico | "Menopausa: 5 mitos que fazem mulheres sofrerem calado" | Mito-verdade em slides | Salvar / seguir | C1 | 🟢 |
| A7 | Clínica (multi) | Imagem estática sem rosto | Frase-tese grande: "Cansaço não é personalidade." | Afirmação + subtítulo | Saiba mais | C1 | 🟢 |
| A8 | Reposição hormonal | Reels, médica fala | "Por que eu não começo nenhuma reposição sem esses exames" | Método / critério | Enviar mensagem | C2 | 🟢. Sem nome de hormônio comercial |
| A9 | Ginecologia | Vídeo bastidor | "Como é uma primeira consulta comigo, do início ao fim" | Bastidor / jornada | Agendar | C2/C3 | 🟢 |
| A10 | Dermatologia | Carrossel | "O que muda entre o tratamento da farmácia e a avaliação dermatológica" | Comparação de abordagem | Enviar mensagem | C2 | 🟡 sem desmerecer colegas ou produtos |
| A11 | Laser íntimo | Reels, explicação com equipamento | "O que é o laser íntimo, para quem é e para quem não é" | Indicação e contraindicação | Enviar mensagem | C2 | 🟡 sem promessa de "rejuvenescer"; citar avaliação |
| A12 | Cirurgia plástica | Reels | "Quanto tempo realmente leva a recuperação" | Expectativa realista | Enviar mensagem | C2 | 🟢 se citar variação individual |
| A13 | Soroterapia | Imagem / Reels | "Soro na veia não é para todo mundo. Veja quando faz sentido" | Desmistificação | Enviar mensagem | C2 | 🟡 alto risco de promessa e de método não reconhecido; checar indicação |
| A14 | Clínica (multi) | Vídeo da recepção | "Você manda mensagem, quem responde sou eu, a Ana, da recepção" | Humanização do atendimento | WhatsApp | C3 | 🟢 |
| A15 | Ginecologia | Depoimento em vídeo | "Eu demorei 3 anos para procurar ajuda" (paciente) | Depoimento de jornada, sem resultado | Agendar | C3 | 🟡 termo de imagem; sem "ela me curou" ou "a melhor" |
| A16 | Dermatologia / plástica | Antes e depois | Imagem lado a lado | Resultado | Agendar | C3 | 🟡/🔴: só educativo, não identificável, com fatores e complicações; sem "transformação incrível" |
| A17 | Clínica (multi) | Imagem estática | "Agenda de novembro aberta para primeira consulta" | Escassez de agenda | WhatsApp | C3 | 🟡 sem urgência falsa nem "últimas vagas" fabricadas |
| A18 | Clínica (multi) | Imagem / Reels | "Preço da consulta / avaliação gratuita / 20% off" | Oferta | WhatsApp | C3 | 🔴 pela regra da casa (a norma permite com condições) |
| A19 | Reposição hormonal | Reels | "Reposição engorda? Dá câncer? Respondendo sem rodeio" | Objeção-resposta | Enviar mensagem | C2/C3 | 🟢 se trouxer nuance e contraindicação |
| A20 | Oftalmologia | Imagem | "Quando foi a última vez que você fez exame de vista?" | Pergunta-lembrete | Agendar | C3 | 🟢 (pergunta de hábito, não de doença) |
| A21 | Clínica (multi) | Carrossel tour | "Por dentro da clínica: onde você vai ser atendida" | Tour / estrutura | Agendar | C3 | 🟢 (pode mostrar equipamento) |
| A22 | Ginecologia | Reels, médica para a câmera | "Se você assistiu meus vídeos e ainda tem dúvida, me chama" | Convite direto ao remarketing | WhatsApp | C3 | 🟢 |
| A23 | Cirurgia plástica | Reels | "Não faça cirurgia antes de perguntar isso ao seu cirurgião" | Checklist de segurança | Seguir / mensagem | C1/C2 | 🟢 (valoriza RQE, não ataca colegas) |
| A24 | Reposição hormonal | Vídeo, "médica responde comentário" | Print do comentário + resposta | Resposta a comentário | Seguir | C1/C2 | 🟢 sem expor seguidor identificável |

**Padrões de alta longevidade a priorizar na busca real** (o que costuma rodar por meses em contas de saúde): médica para a câmera com fala educativa (A1, A8, A19), imagem estática tipográfica (A7, A20), bastidor de primeira consulta (A9) e convite direto do remarketing (A22). Ofertas (A18) e antes-e-depois (A16) giram rápido e são os que mais caem em reprovação ou denúncia.

### 2.2 Protocolo para preencher com anúncios reais (Biblioteca da Meta, 20 min)
1. Acessar facebook.com/ads/library e configurar: **País: Brasil**, **Categoria: Todos os anúncios**, **Status: Ativos**.
2. Buscar um termo por vez: `ginecologista`, `reposição hormonal`, `menopausa`, `climatério`, `laser íntimo`, `dermatologista`, `cirurgião plástico`, `oftalmologista`, `clínica médica`, `agende sua consulta`, `soroterapia`, `saúde da mulher`.
3. **Ordenar e filtrar por data:** usar o filtro de data de veiculação para mostrar só os que começaram **há 60 dias ou mais** e seguem ativos. Anotar os com 90 dias ou mais como "longevo".
4. Ler a página do anunciante: se tem várias versões do mesmo criativo ("X anúncios usam este criativo"), é sinal de investimento.
5. Registrar na tabela abaixo. Classificar no arquétipo A1–A24 ou criar um novo.
6. Meta: 25 linhas, no mínimo 5 de ginecologia/reposição.

| Anunciante (página) | Especialidade | Desde | Dias ativo | Formato | Gancho literal | Arquétipo | CTA | Etapa | CFM (🟢🟡🔴) e motivo | Link |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |

---

## 3. Modelos de anúncio reutilizáveis (15)

> Numerados **BA-01 a BA-15** para não colidir com os M1–M18 do documento 05.04 (Biblioteca de Anúncios por Categoria). Ao subir para o app, mapear cada BA para o M correspondente ou acrescentá-lo como M19+.

### BA-01 · Mito-verdade relâmpago
- **Etapa:** C1 · **Formato:** Reels 15–30 s, médica para a câmera (ou texto na tela sobre B-roll, se for sem rosto)
- **Roteiro:** (1) Mito na tela + "Mito." (2) Por que as pessoas acreditam (1 frase). (3) O que a ciência mostra (2 frases). (4) "Siga para mais verdades sobre saúde da mulher."
- **Gancho gineco/RH:** "'Reposição hormonal dá câncer.' Essa frase fez muita mulher sofrer à toa."
- **Por que funciona:** o mito é a principal barreira de adesão (só 19,5% já usaram TH), e o formato curto gera retenção e compartilhamento.
- **CFM:** não dizer que "não tem risco". Citar que depende da avaliação. Sem nome de medicamento.

### BA-02 · "3 sinais" (lista de reconhecimento)
- **Etapa:** C1 · **Formato:** Reels ou carrossel de 5 slides
- **Roteiro:** (1) Promessa de lista. (2–4) Um sinal por bloco, com exemplo cotidiano. (5) "Se identificou? Salve e mostre para uma amiga."
- **Gancho:** "3 sinais de que o seu corpo entrou na perimenopausa, e quase ninguém liga um ao outro."
- **Por que funciona:** gera identificação sem acusar quem assiste, e o salvamento e o envio alimentam o alcance orgânico.
- **CFM/Meta:** escrever em 3ª pessoa ("muitas mulheres..."), sem "você tem". Não é diagnóstico: fechar com "só a avaliação confirma".

### BA-03 · Frase-tese estática (sem rosto)
- **Etapa:** C1 (e reaproveitável em C3) · **Formato:** imagem única 1080×1350, tipografia grande
- **Roteiro:** (1) Frase curta e contraintuitiva (até 7 palavras). (2) Subtítulo explicando em 1 linha. (3) Nome, especialidade, CRM e RQE no rodapé.
- **Gancho:** "Calorão não é frescura. É hormônio."
- **Por que funciona:** imagem única tem a maior longevidade média nos dados, é barata de produzir e garante a campanha no ar (05.05).
- **CFM:** dados obrigatórios no rodapé. Sem foto de paciente.

### BA-04 · A pergunta que toda paciente faz
- **Etapa:** C1/C2 · **Formato:** Reels, médica para a câmera
- **Roteiro:** (1) "A pergunta que eu mais ouço no consultório é..." (2) Resposta direta em 1 frase. (3) A nuance ("depende de..."). (4) "Comenta a sua dúvida que eu respondo no próximo vídeo."
- **Gancho:** "A pergunta que eu mais ouço de mulheres de 50 anos: 'Ainda dá tempo de começar a reposição?'"
- **Por que funciona:** linguagem real de paciente, autoridade sem arrogância, e os comentários viram pauta (BA-12).
- **CFM:** não prometer resultado e não definir conduta para todas.

### BA-05 · Erro comum
- **Etapa:** C1 · **Formato:** Reels ou carrossel
- **Roteiro:** (1) "O erro que eu mais vejo..." (2) O erro, descrito sem julgar. (3) Por que prejudica. (4) O que fazer no lugar, de forma geral.
- **Gancho:** "O erro mais comum de quem entra na menopausa: achar que é só aguentar."
- **Por que funciona:** aversão à perda e ensino prático.
- **CFM:** não ridicularizar paciente nem colega, e não recomendar automedicação.

### BA-06 · Critério da médica ("por que eu não faço X sem Y")
- **Etapa:** C2 · **Formato:** Reels, médica para a câmera, 30–45 s
- **Roteiro:** (1) "Eu não começo nenhuma reposição sem..." (2) Os 2–3 critérios ou exames, em linguagem simples. (3) "É isso que separa um tratamento seguro de um palpite." (4) "Quer entender se faz sentido para você? Me chama."
- **Gancho:** "Eu não prescrevo hormônio para nenhuma paciente sem olhar estas 3 coisas."
- **Por que funciona:** mostra método e segurança, o diferencial sobre "chip da beleza" e afins. Filtra o paciente certo.
- **CFM:** não nomear medicamento nem implante comercial, e não atacar outros profissionais.

### BA-07 · Bastidor da primeira consulta
- **Etapa:** C2/C3 · **Formato:** vídeo bastidor 30–60 s (pode ser sem rosto: mãos, sala, recepção)
- **Roteiro:** (1) "Como é a primeira consulta comigo." (2) Chegada e acolhimento. (3) Conversa longa e exame. (4) Plano explicado. (5) "Agende pela mensagem."
- **Gancho:** "Minha primeira consulta dura mais de uma hora. Te mostro por quê."
- **Por que funciona:** reduz a ansiedade da 1ª vez, que é a objeção oculta mais comum em ginecologia.
- **CFM:** pode mostrar estrutura e equipamento. Não mostrar paciente sem termo (05.12).

### BA-08 · Objeção-resposta ("sem rodeio")
- **Etapa:** C2/C3 · **Formato:** Reels com perguntas na tela
- **Roteiro:** (1) 3 objeções na tela ("engorda?", "dá câncer?", "é para sempre?"). (2) Resposta curta e honesta para cada uma. (3) "A resposta certa para o seu caso só sai na consulta. Me chama."
- **Gancho:** "Reposição engorda? Dá câncer? É para sempre? Respondendo sem rodeio."
- **Por que funciona:** ataca de frente o que trava o agendamento e converte bem em remarketing.
- **CFM:** respostas com nuance e contraindicações. Nada de "100% seguro".

### BA-09 · Indicação e contraindicação ("para quem é e para quem não é")
- **Etapa:** C2 · **Formato:** carrossel ou Reels com o equipamento
- **Roteiro:** (1) "Laser íntimo: para quem é e para quem NÃO é." (2) 3 indicações. (3) 3 situações em que não se indica. (4) "Na avaliação a gente vê em qual grupo você está."
- **Gancho:** "Laser íntimo não é para todas. Eu explico quando eu indico e quando eu digo não."
- **Por que funciona:** o "não" gera confiança, filtra lead e diferencia de quem só vende procedimento.
- **CFM:** sem "rejuvenescimento garantido" e sem antes-e-depois. A técnica precisa ser reconhecida.

### BA-10 · Expectativa realista (tempo, processo, recuperação)
- **Etapa:** C2 · **Formato:** Reels
- **Roteiro:** (1) "Quanto tempo leva para sentir diferença?" (2) Linha do tempo geral (semanas e meses). (3) "Varia de pessoa para pessoa porque..." (4) CTA de mensagem.
- **Gancho:** "Quanto tempo a reposição leva para fazer efeito? A resposta honesta."
- **Por que funciona:** honestidade gera confiança e reduz abandono do tratamento depois.
- **CFM:** sempre dizer que varia. Prazo nunca vira promessa.

### BA-11 · Jornada de paciente (depoimento sem resultado)
- **Etapa:** C3 · **Formato:** vídeo depoimento 30–60 s (paciente real com termo, ou voz em off + B-roll sem rosto)
- **Roteiro:** (1) "Eu demorei X anos para procurar ajuda." (2) O que a travava. (3) Como foi ser ouvida na consulta. (4) Sem números de melhora. A legenda convida para a conversa.
- **Gancho:** "Eu achava que sentir aquilo era normal para a minha idade." (paciente)
- **Por que funciona:** prova social de processo, não de resultado, e o público de remarketing já está em dúvida.
- **CFM:** 🟡 termo 05.12, sem adjetivo de superioridade ("a melhor médica"), sem "me curou" e sem repetir o formato de forma sistemática (atenção da CODAME). Pede ciente do médico.

### BA-12 · Médica responde comentário
- **Etapa:** C1/C2 · **Formato:** Reels com print do comentário (anonimizado)
- **Roteiro:** (1) Print: "Doutora, com 52 ainda dá tempo?" (2) Resposta em 20 s. (3) "Manda a sua pergunta aqui."
- **Gancho:** "Recebi esse comentário e preciso responder em público."
- **Por que funciona:** formato nativo, reaproveita a pauta da audiência e incentiva comentários (sinal de alcance).
- **CFM:** apagar nome e foto de quem comentou.

### BA-13 · Checklist de segurança ("antes de começar, pergunte isso")
- **Etapa:** C1/C2 · **Formato:** carrossel ou Reels
- **Roteiro:** (1) "Antes de começar qualquer reposição, pergunte isso ao seu médico." (2) 4–5 perguntas. (3) "Médico bom responde todas." (4) Seguir ou mensagem.
- **Gancho:** "5 perguntas que você deve fazer antes de começar qualquer tratamento hormonal."
- **Por que funciona:** empodera a paciente e coloca a médica como referência de segurança. Alto salvamento.
- **CFM:** sem atacar colegas nem citar "chip" ou marca.

### BA-14 · Humanização do atendimento (quem responde no WhatsApp)
- **Etapa:** C3 · **Formato:** vídeo curto da recepcionista ou secretária (com termo)
- **Roteiro:** (1) "Oi, eu sou a [nome], quem responde a sua mensagem." (2) O que acontece quando a pessoa chama. (3) "Sem robô e sem pressão: é só tirar a dúvida." (4) Botão do WhatsApp.
- **Gancho:** "Quando você manda mensagem para a clínica, quem responde sou eu."
- **Por que funciona:** remove o medo do "vão me empurrar algo" e aumenta a taxa de conversa no clique.
- **CFM:** não citar preço nem condição especial na peça. Termo 05.12 da colaboradora.

### BA-15 · Convite direto do remarketing
- **Etapa:** C3 · **Formato:** Reels médica para a câmera 15 s ou imagem estática com foto da médica
- **Roteiro:** (1) "Se você tem visto meus vídeos sobre menopausa..." (2) "...e ainda está em dúvida se é o seu caso..." (3) "...me manda uma mensagem e a gente conversa." (4) Nome, CRM e RQE.
- **Gancho:** "Se você chegou até aqui pelos meus vídeos, esse recado é para você."
- **Por que funciona:** fala com quem já consumiu conteúdo (público de engajamento) e tem um único passo claro. É o fecho natural do C1→C2.
- **CFM/Meta:** não presumir a condição ("já que você está na menopausa..."). Falar do conteúdo visto, não da saúde da pessoa. Público com nome neutro.

**Combinações por campanha (sugestão para o bloco 4 da Sessão 3):** C1 = BA-01 + BA-03 + BA-02 · C2 = BA-06 + BA-09 + BA-08 · C3 = BA-15 + BA-14 + BA-07 (BA-11 quando houver depoimento com termo).

---

## 4. Como organizar o banco no app

### 4.1 Duas entidades
1. **Modelo** (o padrão, global da agência): BA-01... ou M1... da 05.04.
2. **Ideia / Peça** (instância por clínica): o modelo personalizado para um serviço de uma clínica, com ganchos, arquivos e números.

### 4.2 Campos do Modelo
| Campo | Tipo | Observação |
|---|---|---|
| código | texto | BA-01 / M7 |
| nome | texto | |
| etapa | enum C1, C2, C3 (multi) | |
| formato | enum: imagem, carrossel, reels, vídeo bastidor, depoimento, stories | |
| precisa_rosto | bool | true = gravação dirigida (05.07); false = banco sem rosto (05.05) |
| estrutura | texto (3–5 linhas) | |
| especialidades | multi | gineco, RH, laser íntimo, soro, dermato, plástica, oftalmo |
| ganchos_exemplo | lista | |
| semaforo_padrao | enum verde/amarelo/vermelho | amarelo exige ciente na S3 |
| cuidados_cfm | texto | |
| cuidados_meta | texto | ex.: "sem 2ª pessoa diagnóstica" |
| fonte | texto/link | link da Biblioteca da Meta do anúncio de referência + "desde" |

### 4.3 Campos da Ideia/Peça (por clínica)
| Campo | Observação |
|---|---|
| clinica_id, servico (o serviço prioritário da S2), modelo_codigo | |
| ganchos (3) | regra da gravação dirigida: 3 ganchos por vídeo |
| copy_texto, titulo, cta | CTA: Seguir / Enviar mensagem (WhatsApp) / Agendar |
| fonte_criativo | enum: gravação dirigida, banco sem rosto, post impulsionado |
| post_organico_ref | link + seguidores ganhos no orgânico (critério C1: impulsiona o post que mais trouxe seguidor) |
| semaforo, ciente_medico_data | espelha a coluna "Ciente do médico" do 05.10 |
| status | ideia → em produção → aprovado (pasta) → no ar → pausado → arquivado |
| arquivo_url | pasta de aprovados (Drive) |
| ad_id / campaign_id Meta | para puxar números automáticos |
| teste_aprovacao | link para a linha do 05.16 (Registro de Testes de Aprovação): aprovado ou reprovado pela Meta e o motivo |

### 4.4 Marcar "o que deu certo" com números reais
- **Puxar por ad_id** (o app já lê a Meta: `src/lib/anuncios-objetivo.ts`, `src/lib/sap-midia.ts`): gasto, impressões, CPM, CTR, retenção de 3 s e ThruPlay, **seguidores ganhos** (C1), **custo por seguidor** (C1/C2), **conversas iniciadas e custo por conversa** (C3), **dias no ar**.
- **Juntar com o funil SAP** (a régua é a consulta realizada): leads → pontuação A/B/C (05.08) → agendou → compareceu → consulta realizada, atribuídos à peça via UTM ou ID do anúncio.
- **Selo automático por etapa** (padrão; ajustar por clínica):
  - C1 "Vencedor": custo por seguidor no menor quartil da conta e no mínimo 7 dias no ar.
  - C2 "Vencedor": ainda traz seguidor com custo ≤ 1,5× o do C1 **ou** retenção de vídeo acima da mediana.
  - C3 "Vencedor": custo por consulta realizada ≤ custo-meta da S3 com no mínimo 3 consultas.
  - "Cansou": dispara a regra de fadiga V3 que já existe (CTR caindo e custo +30%, ou frequência > 3). Vira sugestão de trocar por outro do mesmo modelo.
- **Placar do Modelo** (agregado entre clínicas): nº de clínicas que usaram, % de "Vencedor", custo mediano por etapa e especialidade, nº de reprovações da Meta. Na S3 isso permite dizer: "esse modelo venceu em 4 de 6 clínicas de ginecologia".
- **Memória do que a conta aceita:** reprovação da Meta grava no 05.16 e no campo `teste_aprovacao`, por clínica. Isso alimenta a frase da S3 "a gente sobe uma por vez... e anota o que a sua conta aceita".

### 4.5 Ligação com o cronograma e as sessões
- **Sessão 3 (item 13, D16–D18):**
  - Bloco 3 "Criativos": o app lista, para o serviço da clínica, os modelos com `precisa_rosto=false` (vão para o banco sem rosto 05.05) e `precisa_rosto=true` (vão para a pauta da gravação 05.07). Também mostra os posts orgânicos ordenados por seguidores ganhos para decidir o impulsionamento.
  - Bloco 4 "Modelos e destino": o Gestor escolhe 2–3 modelos por campanha (C1/C2/C3), filtrados por especialidade e ordenados pelo Placar. A escolha cria as Ideias com status "ideia" e grava em `modelos_destino`.
  - Bloco 5 "Semáforo": cada Ideia mostra o selo. Amarelo pede o `ciente_medico_data`. Vermelho fica bloqueado para status "aprovado".
- **Item 15 · Gravação dirigida (D19–D22):** a pauta é gerada das Ideias com `precisa_rosto=true`, com 3 ganchos cada.
- **Item 16 · Banco de criativos sem rosto e vídeos editados (D18–D26):** vira um checklist alimentado pelas Ideias. Critério de pronto: **≥ 6 Ideias sem rosto em "aprovado" até D24** e **vídeos editados em "aprovado" até D26**, com contador no card do item ("4/6 sem rosto, 2/3 vídeos").
- **Item 21 · Peças aprovadas (D25–D27):** só fica concluído quando todas as Ideias da campanha têm semáforo verde, ou amarelo com ciente.
- **Rotina semanal (05.11) e alertas V3:** quando o app gera "subir 2 a 3 criativos novos", ele sugere as próximas Ideias aprovadas do mesmo modelo vencedor e da mesma etapa.
- **D60/D90:** o Placar por modelo entra no relatório. Os vencedores da clínica viram a "receita" na renovação.

---

## Fontes
- [Resolução CFM 2.336/2023 (CRM-ES, PDF)](https://crmes.org.br/wp-content/uploads/2023/09/Resolucao-2336-2023-publicidade-e-propaganda-medica.pdf) · [CFM, sistemas](https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2023/2336_2023.pdf)
- [Manual CODAME 2024, CREMERO](https://cremero.org.br/wp-content/uploads/2024/07/CODAME___MANUAL_2024.pdf)
- [Machado Meyer: CFM updates medical advertising rules](https://www.machadomeyer.com.br/en/recent-publications/publications/life-sciences-and-healthcare/cfm-updates-medical-advertising-rules)
- [Campos Thomaz: alerta CFM](https://camposthomaz.com/_2022/wp-content/uploads/2023/09/Alerta_CFM-updates-medical-advertising-rules.pdf)
- [Correio Braziliense: antes e depois](https://www.correiobraziliense.com.br/brasil/2023/09/5124671-medicos-poderao-apresentar-antes-e-depois-de-pacientes.html) · [Migalhas](https://www.migalhas.com.br/quentes/393424/cfm-muda-regra-e-permite-antes-e-depois-de-pacientes-na-internet) · [CREMERS](https://cremers.org.br/novas-regras-da-publicidade-medica-entram-em-vigor)
- [Bip: marketing médico 2026](https://www.usebip.com/blogs/bip-insights/marketing-medico-2026-regras-cfm) · [Medway](https://www.medway.com.br/conteudos/cfm-atualiza-a-resolucao-sobre-a-publicidade-medica/) · [Agilize](https://agilize.com.br/artigos/?p=4458)
- [TCC UFS: infrações éticas no Instagram](https://ri.ufs.br/handle/riufs/20361) · [SBD/CFM: guia de boas práticas](https://portal.cfm.org.br/noticias/sociedade-de-dermatologia-alerta-escolha-do-medico-especialista-nao-deve-ser-feita-pelas-midias-sociais/)
- [Accelerated Digital Media: health ad policies 2026](https://www.accelerateddigitalmedia.com/insights/guide-to-social-media-health-ad-restrictions-2026/) · [2025](https://www.accelerateddigitalmedia.com/insights/guide-to-social-media-health-ad-restrictions-2025/) · [OuterBox](https://www.outerboxdesign.com/?p=29034) · [wetracked](https://www.wetracked.io/post/meta-ads-new-sensitive-categories-restrictions) · [Giraffe Social](https://www.giraffesocialmedia.co.uk/running-ethical-and-compliant-meta-ads-in-healthcare)
- [Cardinal Digital: 10 ways to succeed on Meta 2025](https://www.cardinaldigitalmarketing.com/healthcare-resources/blog/10-ways-to-succeed-on-meta-in-2025/)
- [Benly: Health & Wellness Creative Benchmarks Q1 2026](https://benly.ai/benchmarks/health-wellness) · [Digital Agency Network: Supplement Ad Report 2025](https://digitalagencynetwork.com/the-supplement-ad-report-2025-what-actually-works-in-meta-advertising-now/)
- [ASA: cosmetic surgery abroad enforcement report](https://www.asa.org.uk/resource/enforcement-report-cosmetic-surgery-abroad.html) · [MIT Technology Review](https://www.technologyreview.com/2022/06/27/1054784/facebook-meta-cancer-treatment-ads-misinformation/) · [Apify: long-running ads finder](https://apify.com/davidbenittah/long-running-facebook-ads-finder.md)
- [Mundo do Marketing: estética concentra 70% dos anúncios](https://mundodomarketing.com.br/estetica-concentra-70-dos-anuncios-digitais-da-medicina-no-brasil)
- [WhatsApp Business: mensagens de marketing](https://whatsappbusiness.com/pt-br/blog/getting-value-from-whatsapp-messaging-marketing-edition/) · [Trafius: funil de tráfego pago](https://trafius.com.br/blog/funil-vendas-trafego-pago)
- [Metrópoles/Einstein: menopausa](https://www.metropoles.com/saude/menopausa-preciso-reposicao-hormonal) · [Jovem Pan](https://jovempan.com.br/?p=23573) · [O Popular](https://opopular.com.br/noticias/magazine/menopausa-sem-vergonha-1.2355415)
