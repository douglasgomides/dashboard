# Hub na VPS Hostinger

O servidor `server/vps.ts` preserva os doze handlers HTTP existentes, as três
reescritas explícitas de `vercel.json`, os cabeçalhos de segurança e o fallback
da SPA. A assinatura do webhook Meta continua sendo verificada sobre o corpo
original. Nenhuma migração de banco é necessária para trocar a hospedagem.

## Preparação

1. Usar a mesma revisão de produção como base; registrar revisão anterior para reversão.
2. Recuperar a configuração original do ambiente Production. Não substituir por Preview.
3. Guardar os valores em arquivo root-only fora da imagem, do repositório e do diretório servido.
4. As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são públicas
   e precisam apontar ao mesmo projeto das credenciais de servidor.
5. Preservar `NEXO_CHANNELS_ENCRYPTION_KEY`: gerar outra chave não recupera tokens já cifrados.
6. A Graph e os comentários usam os tokens de `instagram_account_secrets` por conta;
   `META_ACCESS_TOKEN` é apenas uma reserva opcional. O preenchimento de miniaturas
   também separa as chamadas por conta, sem copiar um token de uma clínica para outra.
7. Credenciais globais legadas só podem ser recuperadas de uma fonte comprovadamente
   vinculada à mesma conta. Validar essa associação antes de configurar o fallback.

## Imagem e execução

Construir com Dockerfile Node 22, passando apenas as configurações públicas
como build arguments. Os segredos são fornecidos em runtime. A imagem roda como
usuário `node`, sem acesso ao socket Docker, e o processo usa até 1 GiB de heap.

```sh
docker build --build-arg VITE_SUPABASE_URL --build-arg VITE_SUPABASE_PUBLISHABLE_KEY --build-arg VITE_LINK_BASE_URL -t doctor-creator-hub:REVISAO .
```

Na KVM 2 existente, começar com 1 CPU e limite de 1536 MiB de memória. Não publicar
a porta do backend na internet: usar a rede interna do proxy HTTPS já instalado.
O endpoint `/healthz` verifica o processo; `/readyz` recusa prontidão enquanto as
configurações essenciais de servidor estiverem ausentes.

## Verificação e troca

- Executar `npm run test:vps`, compilar e testar o runtime Node 22 antes da troca.
- Conferir login, sessão, permissões, rotas profundas, arquivos e recusa a APIs sem autenticação.
- Conferir os webhooks e as sincronizações com as credenciais corretas, sem disparar envios de teste reais.
- Conferir os agendamentos no n8n e GitHub: substituir URLs `*.vercel.app` quando existirem;
  URLs dos domínios preservados continuam apontando ao mesmo endereço público após a troca de DNS.
- Apontar `nexo`, `dash` e `sap` ao proxy da VPS somente depois da validação e do HTTPS.
- Evitar duas instâncias processando a mesma fila; manter uma única origem ativa para cada agendamento.
- Conferir CPU, RAM, erros e sincronizações após a troca. Guardar configuração e imagem anteriores.

## Liberação da Vercel

Migrar o projeto não elimina consumo histórico nem remove automaticamente o bloqueio
da equipe. Após retirar o tráfego e os agendamentos da Vercel, verificar o estado
da conta. A suspensão por franquia exige recuperação da janela de uso, resolução
pela Vercel ou mudança de plano autorizada pelo responsável. Não criar outra conta
para contornar a suspensão.
