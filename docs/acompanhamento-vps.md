# Publicação do acompanhamento sobre a imagem atual

A versão em uso recebeu correções posteriores à cópia de código da VPS. Para preservá-las, a imagem complementar parte exatamente da imagem ativa e mantém `/app/build/vps.mjs` e `/app/dist` intactos. O acompanhamento tem arquivos próprios sob `/acompanhamento-app/`, entrada em `/admin/acompanhamento` e seu único endpoint autenticado. As outras APIs continuam no servidor original. Um link é acrescentado ao menu administrativo da interface original, sem conceder acesso adicional.

O segredo `hub.env` é carregado pelo Node no servidor, sem cópia para o código ou para a imagem. O complemento reutiliza o segredo do serviço. As configurações públicas do frontend são conferidas contra a conta já atendida antes da construção.

`scripts/vps/publicar-acompanhamento.py --mode prepare --commit COMMIT --expected-image IMAGEM` constrói em diretório separado e testa em serviço sem porta pública. Confere o servidor de dados, a página, o menu, os arquivos e a recusa de API sem autenticação. O serviço de teste é removido no fim. `--mode publish` exige o teste confirmado e a mesma imagem ativa. Troca somente a imagem do Nexo. Falha nas verificações públicas provoca reversão. A imagem anterior não é apagada e nenhum outro serviço é reiniciado.

Na publicação inicial, conferir no navegador autenticado os cinco clientes, a edição das fichas, os controles do relatório e o download do PDF.
