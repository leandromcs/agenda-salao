# Agenda do Salão

Assistente de agenda para salão de beleza que funciona pelo **WhatsApp**. A dona do salão conversa com um número dedicado, por texto ou áudio, para marcar, remarcar, editar, desmarcar e consultar atendimentos, e recebe todo dia às 20h um resumo da agenda do dia seguinte.

As clientes continuam falando com o salão como sempre; só a dona conversa com o assistente.

## Funcionalidades

- **Linguagem natural:** "marca a Maria sexta às 14h, escova, 1 hora", "o que tenho amanhã?", "tenho algo livre sábado de manhã?".
- **Áudio:** mensagens de voz são transcritas e tratadas como texto.
- **Mensagem encaminhada:** um pedido de cliente encaminhado vira sugestão de horários livres, sem marcar nada até a dona escolher.
- **Conflitos:** avisa quando um horário sobrepõe outro e só marca se ela confirmar.
- **Edição e desfazer:** nome, serviço, observação e duração podem ser corrigidos; "desfaz" volta a última alteração.
- **Bloqueios:** folga, médico ou compromisso ("bloqueia segunda o dia todo").
- **Resumo noturno:** agenda do dia seguinte às 20h (horário de Brasília).
- **Confirmações confiáveis:** o assistente só confirma alterações que de fato foram gravadas no banco.

## Como funciona

```
WhatsApp ──► Meta Cloud API ──► Webhook ──(fila)──► Normalizador ──► Assistente ◄──► Agenda (D1)
                                                    (áudio → texto)   (Claude + ferramentas)
WhatsApp ◄── Meta Cloud API ◄── Enviador ◄──────────────────────────────┘
                                   ▲
                             Resumo noturno (cron)
```

- O **webhook** valida a assinatura da Meta, aceita só o número autorizado, descarta mensagens repetidas e coloca cada mensagem numa fila.
- O **consumidor da fila** transcreve áudios (Whisper no Workers AI) e chama o modelo com ferramentas de agenda (`consultar_agenda`, `horarios_livres`, `marcar`, `remarcar`, `atualizar`, `desmarcar`, `desfazer`).
- Toda a lógica de datas, conflitos e horários livres fica em funções puras e testadas; o modelo apenas decide quais ferramentas chamar.
- Cada alteração no banco é atômica, e uma nova tentativa da fila nunca repete uma alteração já feita.

Detalhes de projeto e decisões em [docs/especificacao.md](docs/especificacao.md).

## Tecnologias

- TypeScript em **Cloudflare Workers**, com **D1** (SQLite), **Queues**, **Workers AI** e **Cron Triggers**
- **WhatsApp Cloud API** (Meta Graph API)
- API da **Anthropic** (modelo `claude-haiku-4-5`) via `@anthropic-ai/sdk`
- **Vitest** com `@cloudflare/vitest-plugin` (testes rodam no runtime dos Workers)

## Estrutura

```
src/
  index.ts              handlers do Worker (fetch, queue, scheduled)
  rotas.ts              webhook e página de privacidade
  processar.ts          processamento de cada mensagem da fila
  tempo.ts              datas e horas de Brasília
  agenda/               regras, repositório (D1) e operações da agenda
  assistente/           ferramentas, prompt e loop do modelo
  conversa/             histórico, transcrição e normalização das mensagens
  resumo/               resumo noturno
  whatsapp/             webhook e cliente da Graph API
migrations/             esquema do banco (D1)
test/                   testes automatizados
evals/                  avaliação do assistente com conversas de exemplo (usa a API real)
docs/                   especificação, implantação e piloto
```

## Desenvolvimento

Requisitos: Node.js 22 ou superior.

```bash
npm install
npm test            # testes automatizados
npm run typecheck   # checagem de tipos
```

Para rodar localmente, copie `.dev.vars.example` para `.dev.vars`, preencha os valores e aplique as migrações no banco local:

```bash
npx wrangler d1 migrations apply agenda-salao --local
npm run dev
```

O binding de IA (transcrição) sempre acessa a Cloudflare, então o `wrangler dev` exige login na conta (`npx wrangler login`).

### Avaliação do assistente

`npm run eval` roda conversas de exemplo contra a API real da Anthropic e confere quais ferramentas foram chamadas e o estado final da agenda. Requer `ANTHROPIC_API_KEY` no ambiente e tem custo (centavos de dólar por rodada).

```bash
npm run eval
```

Variáveis opcionais: `EVAL_FILTRO` (roda só os casos cujo nome contém o texto), `EVAL_REPETICOES` (repete cada caso) e `MODELO_CLAUDE` (testa outro modelo).

## Configuração

Variáveis em `wrangler.jsonc`:

| Variável | Descrição |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número do assistente na Meta |
| `GRAPH_API_VERSAO` | Versão da Graph API (ex.: `v26.0`) |
| `MODELO_CLAUDE` | Modelo usado pelo assistente |
| `JANELA_INICIO` / `JANELA_FIM` | Horário padrão do salão (horários livres e "dia todo") |
| `HISTORICO_TURNOS` | Quantos turnos anteriores da conversa o assistente recebe |
| `MODELO_RESUMO` / `MODELO_ALERTA` | Nomes dos modelos de mensagem aprovados na Meta |

Segredos (`npx wrangler secret put NOME`): `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`, `ANTHROPIC_API_KEY`, `NUMERO_DELA` (único número autorizado) e `NUMERO_ADMIN` (recebe alertas de falha).

O horário do resumo é definido pelo cron em `wrangler.jsonc` (`0 23 * * *` = 20h em Brasília).

## Implantação

Passo a passo completo, incluindo a configuração na Meta e os problemas conhecidos, em [docs/implantacao.md](docs/implantacao.md). Checklist de validação antes do uso real em [docs/piloto.md](docs/piloto.md).

## Custos estimados

Com 10 a 30 interações por dia: cerca de R$ 15–40/mês no modelo, hospedagem no plano gratuito da Cloudflare e mensagens de WhatsApp gratuitas dentro da janela de 24h (modelos de mensagem custam centavos). Estimativas detalhadas na especificação.

## Privacidade

O Worker publica a política de privacidade em `/privacidade`, exigida pela Meta para publicar o app. O telefone das clientes não é armazenado.
