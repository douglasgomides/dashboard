# Inteligência Criativa do Nexo

Primeira etapa funcional em homologação. O módulo lê as mídias de uma conta autorizada, registra evidências privadas, extrai estruturas e produz propostas vinculadas aos originais. A produção permanece bloqueada no worker.

## Arquitetura e reaproveitamento

A rota `/$clientId/inteligencia-criativa` reutiliza autenticação, permissões do Nexo, componentes visuais, `instagram_posts`, contas Instagram, métricas e filtros existentes. As solicitações passam por RPCs autenticadas do Supabase; nenhuma função HTTP adicional foi criada na Vercel. O adaptador de Brand Brain usa `lerBrain`, com itens aprovados do próprio cliente. `creative_to_pauta` escreve no planejador existente e preserva a proposta estruturada separadamente.

O processo Node independente reserva trabalhos no PostgreSQL, adquire mídia pela Meta Graph API, usa Storage privado, FFmpeg e modelos. O frontend apenas solicita trabalhos e consulta seus resultados. A coleta Windsor existente continua responsável pelas métricas históricas; seus dados não substituem os arquivos de mídia.

As duas migrations são aditivas. Chaves compostas impedem cruzamento entre cliente, conta, fonte, análise, estrutura, adaptação e publicação. RLS permite leitura aos membros do cliente; gravações passam por RPCs com permissão de edição ou pelo worker. Policies restritivas protegem o bucket mesmo diante de policies permissivas legadas. URLs assinadas duram cinco minutos e são renovadas pela interface.

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
| Verificações locais    | 83 scripts de teste, 166 testes de navegador com fixtures, typecheck, lint, build, 19 verificações de interface e auditorias npm sem vulnerabilidades reportadas                                |

Os testes de banco exercitam as migrations completas com roles e RLS reais em PostgreSQL embarcado, incluindo acesso anônimo, viewer, outro cliente, duplicação de solicitações, leases, cancelamento, orçamento e bucket protegido contra policy legada permissiva. Os testes de evidência rejeitam cobertura falsa e roteiros que descartem ou reordenem blocos.

O relatório local de homologação contém IDs, hashes, textos extraídos, propostas e custos. Ele não é enviado ao Git nem expõe credenciais. As versões intermediárias foram preservadas para rastreabilidade; não representam as propostas finais recomendadas.

## Pendências para concluir a missão

1. Integrar e homologar a compreensão nativa do vídeo, com observação temporal adequada e custo medido. A Meta fornece o arquivo, mas o modelo de imagem atual não resolve movimento contínuo e transições entre amostras. Mesmo modelos com vídeo exigem configuração e verificação da amostragem: o padrão do Gemini também é 1 fps.
2. Habilitar e testar a coleta externa. Os adaptadores Apify estão desabilitados sem credencial e flag; Instagram usa hashtags e TikTok usa busca pública. Não há alegação de acesso irrestrito ao Explorar ou Para Você. Ainda faltam importação de descoberta para análise, modalidades de pesquisa por perfil, observações repetidas para aceleração e comparação estrutural entre conta e mercado. País e idioma solicitados não são tratados como confirmados.
3. Validar aprendizado com publicações reais. Há vínculo explícito e jobs D1, D3, D7 e D28, mas ainda não existe adaptação realmente publicada no piloto. A medição usa métricas sincronizadas disponíveis e marca dados atrasados ou fora da janela; não reconstrói histórico. Promoção de estruturas por testes repetidos ainda não está implementada.
4. Provisionar e testar operação permanente, retenção de mídias, reconciliação de custos incertos, cancelamento de execuções externas no fornecedor e carga com múltiplos clientes. Estes pontos precedem qualquer liberação em produção.

O teste A de carrossel passou. O teste B passou em aquisição, áudio, leitura de frames e adaptação, mas **não passou como compreensão visual integral**. A capacidade de pesquisa e comparação com o mercado ainda não foi homologada. O módulo completo não deve ser anunciado como pronto para produção.

A branch Supabase de homologação tem histórico próprio de catálogo. As migrations `creative_intelligence` e `creative_integrity` foram registradas pelo MCP como `20261018154341` e `20261018160640`; os arquivos do repositório usam `20261023090000` e `20261023091000` para ordenar após a base existente. Não executar `db push` cegamente contra esse histórico. Conciliar o plano de migrations e as diferenças do catálogo antes de uma liberação, sem reaplicar a criação das tabelas existentes nem transferir o baseline exclusivo de Preview à produção.

## Referências dos fornecedores

- [OpenAI GPT 4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [OpenAI transcrição](https://developers.openai.com/api/docs/guides/speech-to-text)
- [Google compreensão de vídeo e amostragem](https://ai.google.dev/gemini-api/docs/video-understanding)
- [Apify Instagram Scraper](https://apify.com/apify/instagram-scraper/input-schema)
- [Apify TikTok Scraper](https://apify.com/clockworks/tiktok-scraper/input-schema)
