## Integração Nuvemshop — Receber e salvar o token da loja

A URL de redirecionamento já está correta (`https://douramor-semijoias.lovable.app/api/public/nuvemshop/callback`). Agora preciso criar o endpoint que recebe o `code` da Nuvemshop, troca pelo `access_token` definitivo e salva no banco.

### O que será feito

**1. Banco de dados — nova tabela `nuvemshop_connections`**
- `store_id` (ID da loja na Nuvemshop, único)
- `access_token` (chave permanente para chamar a API da loja)
- `scope` (permissões concedidas)
- `nome_loja`, `dominio_loja` (informações úteis para exibir)
- RLS: somente staff/admin podem ler

**2. Secrets necessários**
- `NUVEMSHOP_CLIENT_ID` — App ID que aparece no painel de parceiros
- `NUVEMSHOP_CLIENT_SECRET` — Client Secret do app

**3. Rota pública `/api/public/nuvemshop/callback`**
- Recebe `?code=XXX` da Nuvemshop
- Faz POST para `https://www.tiendanube.com/apps/authorize/token` enviando client_id, client_secret e code
- Salva `store_id` + `access_token` na tabela
- Mostra uma página HTML simples: "✅ Loja conectada com sucesso!"
- Em caso de erro, mostra mensagem clara

**4. Tela de status no painel admin**
- Nova página `/integracoes/nuvemshop` mostrando:
  - Loja conectada (store_id, nome) ou "Nenhuma loja conectada"
  - Botão "Conectar loja" que abre a URL de instalação da Nuvemshop
  - Botão para desconectar

### Próximos passos depois desse plano

Depois que a loja ficar conectada, podemos:
- Sincronizar produtos da Nuvemshop com a tabela `produtos`
- Receber webhooks de novos pedidos
- Criar/atualizar produtos no Shopify direto pelo painel

Mas isso fica para depois — primeiro garantimos que a conexão funciona.

### Fluxo de teste após implementar

1. Você me passa os 2 secrets (`NUVEMSHOP_CLIENT_ID` e `NUVEMSHOP_CLIENT_SECRET`)
2. Desinstala o app na loja Douramor (Admin → Aplicativos → Desinstalar)
3. Reinstala pelo painel de parceiros
4. A Nuvemshop redireciona para nosso callback → troca o code pelo token → salva no banco
5. Você vê a tela de sucesso e a loja aparece conectada no painel admin
