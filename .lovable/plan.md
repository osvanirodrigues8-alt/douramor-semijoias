Continuar a integração Nuvemshop (plano já aprovado anteriormente, banco já criado):

1. Pedir os 2 secrets: `NUVEMSHOP_CLIENT_ID` e `NUVEMSHOP_CLIENT_SECRET`
2. Criar rota pública `/api/public/nuvemshop/callback` que troca o `code` pelo token e salva em `nuvemshop_connections`
3. Criar página admin `/integracoes/nuvemshop` com status da conexão e botão de conectar/desconectar