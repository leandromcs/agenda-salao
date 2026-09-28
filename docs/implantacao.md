# Implantação

## 1. Cloudflare
1. Crie uma conta em cloudflare.com (plano gratuito).
2. `npx wrangler login`
3. `npx wrangler d1 create agenda-salao` → copie o `database_id` para o `wrangler.jsonc`.
4. `npx wrangler queues create agenda-mensagens`
5. `npx wrangler d1 migrations apply agenda-salao --remote`

## 2. Anthropic
1. Em platform.claude.com, crie uma chave de API e defina um limite de gasto mensal (ex.: US$ 15).

## 3. Meta / WhatsApp
1. Compre o chip pré-pago e ative o número num celular comum (só para receber o SMS de verificação).
2. Em developers.facebook.com, crie um app do tipo "Business" e adicione o produto "WhatsApp".
3. Em WhatsApp → API Setup, adicione o número do chip e verifique por SMS.
4. Anote o **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID` no `wrangler.jsonc`.
5. Confira a versão da Graph API mostrada nos exemplos da página (ex.: `v23.0`) → `GRAPH_API_VERSAO`.
6. Em Business Settings → System Users, crie um usuário de sistema com a permissão `whatsapp_business_messaging` e gere um **token permanente** → segredo `WHATSAPP_TOKEN`.
7. Em App Settings → Basic, copie o **App Secret** → segredo `WHATSAPP_APP_SECRET`.
8. No WhatsApp Manager → Message Templates, crie dois modelos da categoria **Utility**, idioma **Portuguese (BR)**:
   - `resumo_amanha` — corpo: `Resumo de amanhã ({{1}}): {{2}}` (exemplos: `ter 29/09`, `09:00–10:00 Maria — escova`)
   - `alerta_sistema` — corpo: `Alerta da agenda: {{1}}` (exemplo: `Falha ao enviar o resumo de ter 29/09`)
   Aguarde a aprovação dos dois.

## 4. Segredos
Invente um texto aleatório para `WEBHOOK_VERIFY_TOKEN`. Durante o piloto, `NUMERO_DELA` é o **seu** número (o administrador).

```
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put WEBHOOK_VERIFY_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put NUMERO_DELA
npx wrangler secret put NUMERO_ADMIN
```

Números no formato internacional só com dígitos, ex.: `5511988887777`.

## 5. Publicar e ligar o webhook
1. `npm test && npm run typecheck && npx wrangler deploy` → anote a URL (`https://agenda-salao.<conta>.workers.dev`).
2. No app da Meta → WhatsApp → Configuration → Webhook: Callback URL `https://agenda-salao.<conta>.workers.dev/webhook`, Verify token = `WEBHOOK_VERIFY_TOKEN`. Clique em "Verify and save".
3. Em "Webhook fields", assine `messages`.
4. Salve o número do assistente no celular como "Agenda" e mande "oi".
5. `npx wrangler tail` para ver os logs. Se aparecer `"evento":"mensagem_ignorada"` quando **você** escreveu, copie o valor do campo `de` desse log e grave-o em `NUMERO_DELA` (`npx wrangler secret put NUMERO_DELA`).
