# Implantação

> **Windows:** se o PowerShell recusar `npm`/`npx` ("execução de scripts foi desabilitada") use `npm.cmd` / `npx.cmd`. Se disser que o comando não existe logo depois de instalar o Node, atualize o PATH da aba:
> `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`
>
> **Segredos:** nunca cole tokens ou chaves em chats ou arquivos. Para usar um segredo num comando, leia de forma oculta:
> `$s = Read-Host "Segredo" -AsSecureString` e depois
> `$valor = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))`.
> Para colar no terminal do app, use Ctrl+Shift+V ou o botão direito (Ctrl+V cola um caractere só).

## 1. Cloudflare
1. Crie uma conta em cloudflare.com (plano gratuito).
2. `npx wrangler login`
3. `npx wrangler d1 create agenda-salao` → copie o `database_id` para o `wrangler.jsonc`.
4. `npx wrangler queues create agenda-mensagens`
5. `npx wrangler d1 migrations apply agenda-salao --remote`

## 2. Anthropic
1. Em platform.claude.com, compre créditos (Billing), defina um limite de gasto mensal (ex.: US$ 15, em Limits) e crie uma chave de API no **espaço de trabalho padrão**.
2. Antes do piloto, rode a avaliação: `npm run eval` com `ANTHROPIC_API_KEY` definido na aba do terminal. Esperado: 12/12.

## 3. Meta / WhatsApp
1. **Número brasileiro obrigatório.** O número de teste que a Meta oferece é americano (+1 555) e a Meta bloqueia envio de números estrangeiros para usuários no Brasil (erro 130497). Use um chip ou eSIM brasileiro (ou um fixo, com verificação por ligação), ativo para receber SMS, **sem WhatsApp registrado nele**. Linhas pré-pagas precisam de recarga periódica para não serem canceladas.
2. Em developers.facebook.com, crie um app com o caso de uso **"Conectar-se a clientes pelo WhatsApp"** (tipo Empresa), ligado a um portfólio empresarial. Use sua conta pessoal do Facebook (contas duplicadas violam as regras e podem ser desativadas).
3. No passo a passo do app: a etapa de mensagem de teste pode ser pulada; na **Configuração da produção**, adicione o número brasileiro (nome de exibição ligado ao salão), verifique por SMS e clique em **Registrar** (crie e guarde o PIN de 6 dígitos). A verificação da empresa é opcional para este volume.
4. Anote o **ID do número de telefone** → `WHATSAPP_PHONE_NUMBER_ID` no `wrangler.jsonc`, e o **ID da conta do WhatsApp Business** (usado no passo 5.4).
5. Use a versão mais recente da Graph API (ver developers.facebook.com/docs/graph-api/changelog) → `GRAPH_API_VERSAO` (em 2026-09: `v26.0`).
6. Em business.facebook.com/settings → Usuários do sistema, crie um usuário **Administrador**, atribua o app e a conta do WhatsApp com **Controle total**, e gere um token com validade **Nunca** e permissões `whatsapp_business_messaging` e `whatsapp_business_management` → segredo `WHATSAPP_TOKEN`.
7. Em Configurações do app → Básico, copie a **Chave secreta do app** → segredo `WHATSAPP_APP_SECRET`.
8. No WhatsApp Manager → Modelos de mensagem, crie dois modelos da categoria **Utility**, idioma **Portuguese (BR)**:
   - `resumo_amanha` — corpo: `Resumo de amanhã ({{1}}): {{2}}. Boa noite!` (exemplos: `ter 29/09`, `09:00–10:00 Maria — escova`)
   - `alerta_sistema` — corpo: `Alerta da agenda: {{1}}. Veja os logs.` (exemplo: `Falha ao enviar o resumo de ter 29/09`)
   A Meta recusa corpos que começam ou terminam com uma variável; por isso o texto fixo no fim. Aguarde a aprovação dos dois.
9. Em Business Settings → Contas do WhatsApp → Configurações de pagamento, cadastre uma forma de pagamento. Mensagens de modelo são cobradas (centavos); sem pagamento cadastrado, o resumo fora da janela de 24h **e** o alerta de falha deixam de ser enviados.

## 4. Segredos
Gere um código aleatório para `WEBHOOK_VERIFY_TOKEN` (`[guid]::NewGuid().ToString("N")`). Durante o piloto, `NUMERO_DELA` é o **seu** número (o administrador).

```
npx wrangler secret put WHATSAPP_TOKEN
npx wrangler secret put WHATSAPP_APP_SECRET
npx wrangler secret put WEBHOOK_VERIFY_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put NUMERO_DELA
npx wrangler secret put NUMERO_ADMIN
```

Números no formato internacional só com dígitos. **Use o formato que a Meta mostra no log** (`wa_id`): muitos números brasileiros aparecem **sem o nono dígito** (ex.: `556184099901` em vez de `5561984099901`). Mensagens da Meta para o número com o 9 podem dar "enviada" e nunca chegar.

## 5. Publicar e ligar o webhook
1. `npm test && npm run typecheck && npx wrangler deploy` → anote a URL (`https://agenda-salao.<conta>.workers.dev`).
2. No app da Meta → WhatsApp → Configuração → Webhook: URL de retorno `https://agenda-salao.<conta>.workers.dev/webhook`, token de verificação = `WEBHOOK_VERIFY_TOKEN`. Clique em "Verificar e salvar". Em "Campos do webhook", assine `messages`.
3. **Publique o app** (modo Desenvolvimento → Publicado). Em modo Desenvolvimento a Meta não entrega webhooks de números reais. A exigência é a URL da Política de Privacidade em Configurações do app → Básico: use `https://agenda-salao.<conta>.workers.dev/privacidade` (servida pelo próprio Worker), e escolha uma categoria.
4. **Inscreva a conta do WhatsApp no app** (o fluxo de produção nem sempre faz isso). Com o token lido de forma oculta em `$tok`:
   `Invoke-RestMethod -Method Post -Uri "https://graph.facebook.com/v26.0/<ID_DA_CONTA_WHATSAPP>/subscribed_apps" -Headers @{ Authorization = "Bearer $tok" }` → `success: True`.
5. Diagnóstico: o botão **Testar** ao lado de `messages` envia um exemplo ao Worker. Com `npx wrangler tail` aberto, ele deve aparecer como `mensagem_ignorada` (número fictício) — prova que URL e App Secret estão certos.
6. Salve o número do assistente no celular como "Agenda" e mande "oi". Se aparecer `"evento":"mensagem_ignorada"` quando **você** escreveu, copie o valor do campo `de` desse log e grave-o em `NUMERO_DELA`.
