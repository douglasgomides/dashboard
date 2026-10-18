# Inteligência Criativa do Nexo

Primeira etapa funcional em homologação. O módulo lê as mídias de uma conta autorizada, registra evidências privadas, extrai estruturas e produz propostas vinculadas aos originais. A produção permanece bloqueada no worker.

## Arquitetura e reaproveitamento

A rota `/$clientId/inteligencia-criativa` reutiliza autenticação, permissões do Nexo, componentes visuais, `instagram_posts`, contas Instagram, métricas e filtros existentes. As solicitações passam por RPCs autenticadas do Supabase; nenhuma função HTTP adicional foi criada na Vercel. O adaptador de Brand Brain usa `lerBrain`, com itens aprovados do próprio cliente. `creative_to_pauta` escreve no planejador existente e preserva a proposta estruturada separadamente.

O processo Node independente reserva trabalhos no PostgreSQL, adquire mídia pela Meta Graph API, usa Storage privado, FFmpeg e modelos. O frontend apenas solicita trabalhos e consulta seus resultados. A coleta Windsor existente continua responsável pelas métricas históricas; seus dados não substituem os arquivos de mídia.

As migrations são aditivas. Chaves compostas impedem cruzamento entre cliente, conta, fonte, análise, estrutura, adaptação e publicação. RLS permite leitura aos membros do cliente; gravações passam por RPCs com permissão de edição ou pelo worker. Policies restritivas protegem o bucket mesmo diante de policies permissivas legadas. URLs assinadas duram cinco minutos e são renovadas pela interface.

## Processamento e limites

- Fila com reserva atômica, `SKIP LOCKED`, lease de cinco minutos, renovação a cada 30 segundos e até três tentativas. Workers antigos não podem concluir um trabalho após perderem a reserva.
- Dois trabalhos simultâneos por cliente, seis pendentes, 30 solicitações por dia, orçamento padrão de US$ 2 por trabalho e teto agregado diário de US$ 10. Reservas de chamadas também verificam o teto diário sob lock.
- Checkpoints por etapa e arquivos identificados por SHA-256. Cancelamentos interrompem requisições e subprocessos; reinícios reaproveitam etapas confirmadas. Reservas de custo sem confirmação permanecem registradas, sem presumir custo zero.
- Download por stream, origens de mídia permitidas, DNS validado e fixado, HTTPS, sem redirecionamentos. Até 20 MiB por imagem, 200 MiB por vídeo, 40 milhões de pixels, 30 itens por carrossel e dez minutos por vídeo. O limite global de um trabalho é de 20 minutos.
- Imagens são normalizadas para JPEG com até 1536 pixels por lado, sem recorte. A integridade e o tamanho do arquivo de origem ficam nos metadados. O vídeo é armazenado integralmente; áudio e frames são derivados privados.
- `gpt-4.1-mini` lê imagens reais. `whisper-1` transcreve o áudio completo com timestamps. O vídeo é decodificado integralmente, com frames a 1 fps e frames adicionais em mudanças de cena. Essa leitura visual é **parcial**, inclusive quando cobre intervalos de toda a duração.
- A geração preserva todas as unidades originais e seus vínculos. Intervalos do roteiro adaptado são atribuídos pelo sistema a partir da análise, impedindo encurtamento silencioso pelo modelo. A fala usa um teto editorial estimado de 2,7 palavras por segundo, com até duas revisões automáticas; a equipe confirma pausas e ritmo na gravação. O conteúdo continua exigindo revisão médica e regulatória.

Os rankings separam alcance, salvamentos, compartilhamentos, seguidores e conversões. A referência considera a própria conta, formato, proximidade de publicação e etapa editorial disponível. Audiência, impulsionamento e comparação na mesma idade não são presumidos. Ausência de atribuição comercial resulta em conversão indisponível.

## Executar em homologação

Na raiz do repositório:

```sh
npm ci
npm ci --prefix workers/creative
npm run check
npm run check --prefix workers/creative
npx tsx workers/creative/main.ts --env=.env.creative.local
```

Configure as variáveis do exemplo diretamente no ambiente protegido, sem incluir chaves no Git. A chave de serviço precisa pertencer ao mesmo projeto do Supabase. O hostname de produção do Nexo é recusado explicitamente; a liberação exige uma entrega separada autorizada. Os scripts `creative-pilot-setup`, `creative-pilot-enqueue` e `creative-pilot-report` também restringem a execução à branch de homologação autorizada. O setup cria um usuário descartável sem enviar e-mail e guarda a senha em arquivo ignorado com permissão 600.

Para uma execução unitária, use `--once`; para um trabalho específico, acrescente `--job=<uuid>`. Sem `--once`, o processo acompanha a fila enquanto estiver em execução. O Dockerfile usa o contexto da raiz e FFmpeg do sistema. O comando padrão do container executa um trabalho; um serviço permanente pode remover `--once`. Docker não estava disponível no computador de homologação, portanto a imagem ainda precisa ser construída e validada no provedor escolhido.

O worker foi exercitado localmente. Ainda falta provisionar seu serviço permanente, com gestão de segredos, monitoramento, armazenamento temporário e política de retenção. Um ponto de partida para homologação é 2 vCPU, 2 GiB de memória e 2 GiB temporários por processo, sujeito a teste de carga; não representa capacidade contratada ou medição de produção. `.dockerignore` e `.vercelignore` excluem segredos locais, mídias de teste e o worker do deploy do frontend.

## Resultados reais de homologação

Em 18 de outubro de 2026, uma única conta autorizada foi usada na branch de teste. Foram reaproveitados 321 posts e 25 itens aprovados do Brand Brain dessa mesma clínica, sem copiar conversas ou dados de pacientes.

| Verificação            | Resultado                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Carrossel autorizado   | Dez slides obtidos, texto extraído e design individual analisado; cobertura completa                                                 |
| Adaptação do carrossel | Dez unidades, vínculos preservados e comparação no navegador com imagem privada carregada                                            |
| Planejador             | Pauta criada; `published_post_id` permaneceu nulo                                                                                    |
| Reel autorizado        | Arquivo de 25.706.159 bytes e duração de 146,632 s; 26 trechos transcritos                                                           |
| Leitura visual do Reel | Dezenove blocos com evidências de frames, textos na tela e edição; cobertura parcial                                                 |
| Adaptação do Reel      | Dezenove blocos, referências de 1 a 19 e duração preservada em 146,632 s                                                             |
| Busca semântica        | Embeddings reais e resultados restritos às duas estruturas da própria conta                                                          |
| Custos do piloto       | US$ 0,18918572 registrados, incluindo gerações intermediárias; transcrição estimada pela duração; infraestrutura e Storage excluídos |
| Verificações locais    | 86 scripts de teste na base integrada, 166 testes de navegador com fixtures antes da integração e 11 após a integração, typecheck, lint, build, 19 verificações de interface e auditorias npm sem vulnerabilidades reportadas                                |

A branch foi atualizada com a referência `157aa785010338fc7030e5d4799e576d893d242f`, preservando as novas funções de prova de resultado e conversões offline.

Os testes de banco exercitam as migrations completas com roles e RLS reais em PostgreSQL embarcado, incluindo acesso anônimo, viewer, outro cliente, duplicação de solicitações, leases, cancelamento, orçamento e bucket protegido contra policy legada permissiva. Os testes de evidência rejeitam cobertura falsa e roteiros que descartem ou reordenem blocos.

O relatório local de homologação contém IDs, hashes, textos extraídos, propostas e custos. Ele não é enviado ao Git nem expõe credenciais. As versões intermediárias foram preservadas para rastreabilidade; não representam as propostas finais recomendadas.

## Pendências para concluir a missão

1. Integrar e homologar a compreensão nativa do vídeo, com observação temporal adequada e custo medido. A Meta fornece o arquivo, mas o modelo de imagem atual não resolve movimento contínuo e transições entre amostras. Mesmo modelos com vídeo exigem configuração e verificação da amostragem: o padrão do Gemini também é 1 fps.
2. Habilitar e testar a coleta externa. Os adaptadores Apify estão desabilitados sem credencial e flag; Instagram usa hashtags e TikTok usa busca pública. Não há alegação de acesso irrestrito ao Explorar ou Para Você. Ainda faltam importação de descoberta para análise, modalidades de pesquisa por perfil, observações repetidas para aceleração e comparação estrutural entre conta e mercado. País e idioma solicitados não são tratados como confirmados.
3. Validar aprendizado com publicações reais. Há vínculo explícito e jobs D1, D3, D7 e D28, mas ainda não existe adaptação realmente publicada no piloto. A medição usa métricas sincronizadas disponíveis e marca dados atrasados ou fora da janela; não reconstrói histórico. Promoção de estruturas por testes repetidos ainda não está implementada.
4. Provisionar e testar operação permanente, retenção de mídias, reconciliação de custos incertos, cancelamento de execuções externas no fornecedor e carga com múltiplos clientes. Estes pontos precedem qualquer liberação em produção.

O teste A de carrossel passou. O teste B passou em aquisição, áudio, leitura de frames e adaptação, mas **não passou como compreensão visual integral**. A capacidade de pesquisa e comparação com o mercado ainda não foi homologada. O módulo completo não deve ser anunciado como pronto para produção.

A branch Supabase de homologação tem histórico próprio de catálogo. As migrations `creative_intelligence` e `creative_integrity` foram registradas pelo MCP como `20261018154341` e `20261018160640`; os arquivos do repositório usam `20261023090000` e `20261023091000` para ordenar após a base existente. Não executar `db push` cegamente contra esse histórico. Conciliar o plano de migrations e as diferenças do catálogo antes de uma liberação, sem reaplicar a criação das tabelas existentes nem transferir o baseline exclusivo de Preview à produção.

## Estúdio de produção de carrosséis e vídeos

O novo subpainel **Estúdio de produção** reutiliza adaptações, Brand Brain aprovado, contas, permissões, fila e orçamentos do motor criativo. Não cria um segundo planejador nem modifica o SAP. Projetos em branco também são permitidos. Cada projeto guarda revisões imutáveis, com controle de concorrência e recuperação; uma exportação sempre identifica a revisão usada. Propostas da IA só entram na edição quando a equipe as aplica.

**Carrossel:** copy, cores, assinatura, logo, alinhamento, fontes, enquadramento e imagens permanecem editáveis. Todas as unidades da adaptação são preservadas. Os dois layouts próprios usam SVG com valores escapados e Resvg para gerar PNGs 1080×1350 e ZIP com a legenda. O editor bloqueia exportação quando o texto não cabe, permitindo ajustar a fonte sem apagar informação. A clínica pode reutilizar imagens de suas próprias fontes autorizadas, enviar material ou solicitar uma imagem de apoio à OpenAI. A imagem gerada não contém a copy nem o logo; estes continuam em camadas separadas. As cores explicitamente aprovadas no Brand Brain são reaproveitadas quando disponíveis. Não há promessa de reprodução exata da diagramação ou tipografia de uma referência; novos layouts precisam ser implementados e revisados. Referências de terceiros não são importadas para replicação visual.

**Vídeo:** MP4/MOV próprios até três minutos e 200 MiB entram no bucket privado. O worker verifica assinatura do arquivo, duração, hash e tamanho, transcreve todo o áudio e propõe cortes usando segmentos reais, em ordem. No máximo 12 frames distribuídos orientam a proposta: a cobertura visual é parcial. A interface permite revisar cortes, legendas e formato. FFmpeg produz MP4 H.264/AAC em 720p, com áudio normalizado, legendas opcionais e SRT separado. As legendas queimadas usam ASS com resolução explícita para preservar a escala da fonte nos três formatos; marcação HTML/ASS fornecida como texto é removida. Não produz nova fala, não faz clonagem de voz, não remove legendas já gravadas na imagem nem oferece efeitos de edição complexos. Alegações médicas e contexto dos cortes exigem revisão humana; o resultado é uma prévia editorial, sem validação clínica ou publicação automática.

**Segurança e operação:** as migrations `20261023100000_creative_production.sql`, `20261023101000_creative_production_limits.sql`, `20261023102000_creative_production_upload_integrity.sql` e `20261023103000_creative_production_storage_quota.sql` acrescentam quatro tabelas com RLS, FKs de cliente/conta/projeto, upload registrado e buckets privados `nexo-production-private` e `nexo-production-input-images`. Uploads ficam limitados a 20 MiB por imagem, 200 MiB por vídeo, 40 por projeto/dia e 512 MiB por clínica/dia (reservas incluídas). Até a verificação do worker, cada upload reserva o teto efetivo do seu bucket (20 MiB/imagem ou 200 MiB/vídeo); depois usa bytes e hash confirmados. Isto impede contornar a cota declarando um tamanho falso, inclusive em versões do Storage que só aplicam RLS no início do upload. Arquivos inválidos mantêm sua reserva até o próximo dia. MIME declarado não basta: o worker verifica o conteúdo. FFmpeg só aceita protocolos locais file/pipe. Renderização e geração ficam fora das funções da Vercel. Workers anteriores continuam atendendo somente os contratos antigos; `creative_claim_supported` protege a compatibilidade da fila. Não executar workers novos e antigos com contratos incompatíveis sem essa migration.

Para geração de imagem, configure os quatro campos `CREATIVE_*IMAGE*` do exemplo somente no worker. O piloto usou `gpt-image-2.5-sunburst`, entrada conservadora de US$ 8/milhão de tokens e saída de US$ 30/milhão, conforme documentação consultada. Revise preços antes de habilitar em outro ambiente. O teto existente de US$ 2/trabalho e US$ 10/clínica/dia continua valendo; chamadas incertas preservam a reserva para reconciliação. CPU, Storage e tráfego são custos adicionais.

Homologação real em 18/10/2026: carrossel de dez slides, imagem gerada e aplicada pela interface, dez PNGs e ZIP exportados; vídeo próprio de 146,632 s, 26 trechos transcritos, proposta de sete cortes e MP4/SRT final de 51,4 s (soma dos cortes: 51,16 s; arredondamento por frames). Os cinco trabalhos, incluindo uma renderização intermediária, concluíram e registraram US$ 0,0320252 estimados em modelos, excluindo infraestrutura. A entrada de vídeo deste teste já era um Reel editado, portanto não homologa remoção de vícios de gravação bruta. O upload foi executado pela API autenticada da aplicação porque a extensão do Chrome estava sem permissão para arquivos locais; edição, aplicação de proposta e renderização foram verificadas na interface real.

Regressão: 91 scripts, 175 testes de navegador, 19 verificações de interface, typecheck do worker, build e auditoria de dependências sem vulnerabilidades reportadas. Os novos testes incluem exportação real offline com Resvg/FFmpeg, isolamento entre clínicas, viewer/anônimo, bucket sob policies legadas permissivas, concorrência, fila, quota e idempotência. Fixtures de navegador não substituem os testes reais descritos acima. Serviço permanente, carga, retenção, vídeo temporal nativo, aprovação por WhatsApp e publicação continuam pendentes. Nenhum deploy ou migration foi aplicado em produção.

A saúde do worker é consultada a cada 30 segundos sem recarregar os projetos; reconexão e preservação da edição foram exercitadas no navegador. O teste real de upload confirmou multipart aceito, imagem acima de 20 MiB rejeitada com 413 e arquivo com tamanho declarado falso rejeitado pelo worker antes de usar IA.

Na branch Supabase de teste, as duas primeiras migrations foram registradas como `20261018180841` (`creative_production`) e `20261018182309` (`creative_production_limits`); As verificações de upload e quota usam os registros `20261018184255` e `20261018184620`. Os nomes de arquivos do repositório ordenam a entrega após o baseline. Conciliar o histórico antes de qualquer promoção, sem reaplicação cega.

### Referências da produção de mídia

- [OpenAI geração e edição de imagens](https://developers.openai.com/api/docs/guides/image-generation)
- [OpenAI Sunburst: capacidades e preços](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)
- [Supabase Storage e controle de acesso](https://supabase.com/docs/guides/storage/security/access-control)

### Referências da análise criativa

- [OpenAI GPT 4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [OpenAI transcrição](https://developers.openai.com/api/docs/guides/speech-to-text)
- [Google compreensão de vídeo e amostragem](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Apify Instagram Scraper](https://apify.com/apify/instagram-scraper/input-schema)
- [Apify TikTok Scraper](https://apify.com/clockworks/tiktok-scraper/input-schema)

## Adaptação pela arte completa

Projetos derivados de referências próprias abrem em **Manter modelo da referência**. O worker envia o slide original inteiro e a nova copy ao modelo de edição de imagem, em 4:5 e qualidade alta. A arte retorna com o texto dentro da imagem. A exportação apenas dimensiona essa arte para 1080 × 1350, sem recompor tipografia, cores, rodapé ou fotografia no template genérico. O modo de composição editável anterior continua disponível como opção avançada.

A primeira página precisa ser conferida e aplicada antes do lote. Cada página mantém seu próprio modelo original, associado pela posição da unidade adaptada. OCR e comparação visual auxiliares conferem texto, legibilidade e identidade. Divergência de copy dispara uma segunda leitura independente, sem revelar o texto esperado ao leitor; divergências persistentes bloqueiam a aplicação. Acentos não são descartados na comparação. A equipe continua responsável pela revisão visual, médica e editorial. Não há garantia de reprodução pixel a pixel ou reconhecimento exato de fonte. Alterar a copy invalida a arte aplicada e bloqueia a exportação até uma nova geração.

Lotes têm checkpoints por página e o mesmo teto de US$ 2 por trabalho. Se houver interrupção após páginas conferidas, essas páginas são entregues como lote parcial, com aviso explícito. A equipe pode aplicá-las e solicitar as restantes; nenhum novo trabalho pago é solicitado automaticamente. Fontes sem confirmação de consumo continuam reservadas para reconciliação.

## Composição visual com Remotion — avaliação isolada

Novos projetos usam legendas de 48 px na resolução de referência 720p, com frases de até cinco palavras/30 caracteres (palavras individuais maiores são preservadas), texto branco e fundo escuro sólido. No Remotion, o destaque precisa alcançar contraste mínimo de 4,5:1; cores insuficientes recebem uma alternativa legível, e a entrada mantém opacidade total. O tamanho escolhido no estúdio chega ao manifesto do renderizador. A prévia de tamanho escala com a largura disponível.

O campo opcional `sourceHasCaptions` preserva revisões antigas e permite indicar que o arquivo já possui texto nos pixels. A preparação também procura esse texto nos frames disponíveis; a detecção é amostral e a equipe deve conferi-la no vídeo. Quando indicado, ambos os renderizadores preservam a imagem original sem adicionar outra legenda. O controle não remove nem redimensiona texto já gravado. No caminho FFmpeg, frases longas são subdivididas com tempos estimados dentro de cada segmento; no Remotion, os tempos vêm da transcrição por palavra. O SRT completo continua disponível separadamente.

As skills oficiais de `remotion-dev/skills` orientaram a integração. O renderizador fica em `workers/creative/motion`, com dependências próprias fixadas em Remotion 4.0.536 e Zod 4.5.4. Isso preserva o Zod 3 e os SDKs do worker criativo e do frontend. Nenhum código JavaScript produzido pelo modelo é executado: a IA retorna um plano validado; uma composição React local confiável executa esse plano.

O plano reaproveita a análise do Reel da própria conta, suas evidências de desempenho e a gravação autorizada. A comparação observacional e a ausência de confirmação de impulsionamento ficam explícitas. Não se atribui o resultado comercial ou a viralização aos efeitos de edição. A montagem preserva os trechos reais na ordem aprovada. Whisper fornece tempos por palavra; Remotion compõe legendas curtas, destaque da palavra atual e variações suaves de enquadramento quando autorizadas pelo plano. Texto já gravado nos pixels desativa novas legendas e zooms para evitar duplicidade e recortes. Música, b-roll, efeitos sonoros e recriação de transições de referência ainda não estão implementados.

```sh
npm ci --prefix workers/creative/motion
npm run check --prefix workers/creative/motion
# No ambiente protegido do worker:
# CREATIVE_ENABLE_REMOTION=true
# REMOTION_BROWSER_EXECUTABLE=/caminho/para/chrome-ou-chromium
npx tsx workers/creative/main.ts --env=.env.creative.local
```

O processo de composição não recebe chaves de Supabase/OpenAI. Lê somente o manifesto e o MP4 derivados no diretório privado do trabalho, serve esse MP4 em loopback com rota aleatória e fecha o servidor ao concluir. O processo tem limite de dez minutos, cancelamento e encerramento do grupo de subprocessos. O worker valida novamente clínica, conta, projeto, análise e fonte antes de renderizar; o plano não pode ser aplicado a outra gravação. Não há função de publicação externa.

`Dockerfile.motion` é uma imagem opcional com Chromium; o Dockerfile anterior continua válido. Ainda é necessário homologar a construção da imagem, dimensionar CPU/memória, estabelecer retenção, monitoramento e serviço permanente. A licença do Remotion permite avaliação não comercial; a elegibilidade/licença para operação comercial precisa ser confirmada antes da liberação, sem contratação automática. Referências: [skills oficiais](https://www.remotion.dev/docs/ai/skills), [SSR](https://www.remotion.dev/docs/ssr-node) e [licença](https://www.remotion.dev/license).

O teste independente `scripts/verify-motion-render.ts` gera mídia sintética e verifica MP4 real, duração, dimensões e decodificação integral. Isso prova o renderizador, não o padrão editorial em gravações reais. O piloto com a conta autorizada usa um Reel previamente editado e deve ser identificado dessa forma; a validação de qualidade com uma gravação bruta continua pendente. A leitura visual permanece amostral. Não foram criadas migrations adicionais nesta revisão e não houve deploy em produção.
