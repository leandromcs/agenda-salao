# Agenda do Salão — Assistente de agenda via WhatsApp

**Data:** 2026-09-28
**Status:** implementado; em piloto.

## 1. Contexto e objetivo

A dona de um salão de beleza gerencia os atendimentos numa agenda de papel, por hábito. Isso causa dois problemas:

1. **Consulta:** ela precisa ver a agenda em momentos em que não está com ela.
2. **Esquecimento:** as clientes pedem horário pelo WhatsApp (tanto no número Business quanto no pessoal dela) e às vezes ela esquece de passar para a agenda.

Ela recusou o Google Agenda, sistemas prontos e links de autoagendamento: os horários dela variam muito, parte das clientes não saberia usar, e seria mais um lugar para gerenciar. As clientes devem continuar falando com ela diretamente.

**Objetivo:** um assistente de IA no WhatsApp, com quem **só ela** conversa em linguagem natural para marcar, remarcar, desmarcar e consultar horários, e que envia um resumo do dia seguinte toda noite.

**Critérios de sucesso:**
- Ela consegue consultar e registrar horários de qualquer lugar, pelo WhatsApp.
- Pedidos de clientes deixam de ser esquecidos, porque registrar leva segundos (texto, áudio ou encaminhamento).
- Ela não sente que ganhou trabalho. O atrito da mudança de hábito é baixo.
- Custo mensal baixo, na casa das dezenas de reais no máximo.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Quem usa o assistente | Só ela. As clientes nunca interagem com ele. |
| Fonte oficial da agenda | **O assistente.** O papel vira cópia opcional, alimentada pelo resumo noturno. |
| Canal | WhatsApp via **Meta Cloud API (oficial)**, com **chip/número dedicado** ao assistente. O número Business dela não é alterado. |
| Formas de entrada | Texto, áudio e mensagem encaminhada. |
| Duração | Informada por ela a cada marcação. Se faltar, o assistente pergunta. |
| Serviço | Opcional, mas o assistente pergunta se ela quer adicionar quando não for informado. |
| Edição | Nome, serviço, observação e duração podem ser corrigidos depois (ferramenta `atualizar`). |
| Sobreposição | Avisa e pergunta. Nunca bloqueia. |
| Fora do horário padrão | Permitido; o assistente avisa (pode ser erro de digitação). |
| Lembretes | Somente um **resumo do dia seguinte**, à noite (padrão 20h, configurável). |
| Linguagem e hospedagem | TypeScript no Cloudflare Workers + D1 + Queues. Começa no plano gratuito; passa ao pago (US$ 5/mês) se o piloto mostrar que o limite de CPU é excedido. |
| Manutenção | Feita por um administrador técnico. |

**Abordagens descartadas:**
- **WhatsApp não oficial (Evolution API/Baileys):** viola os termos de uso, tem risco de banimento e é instável.
- **Bot no Telegram:** exige outro app e dificulta encaminhar mensagens vindas do WhatsApp.

## 3. Fora de escopo (v1) e evoluções futuras

Não fazem parte da v1, mas o design não deve impedir:
- **Lembretes para as clientes** (reduzir faltas). Exigirá telefone da cliente, modelos de mensagem de marketing/utilidade e decisão sobre de qual número enviar.
- **Lista de serviços com duração padrão**, se ela quiser depois de usar.
- **Horário de trabalho cadastrado.** Por ora, bloqueios cobrem folgas e ausências.
- **Sugestão de texto de resposta** para ela enviar à cliente.
- Qualquer interface web ou app.

## 4. Arquitetura

```
Ela (WhatsApp) ──► Meta Cloud API ──► [Recebedor] ──(fila)──► [Normalizador] ──► [Assistente IA] ◄──► [Agenda (D1)]
                                                                               │
Ela (WhatsApp) ◄── Meta Cloud API ◄── [Enviador] ◄─────────────────────────────┘
                                          ▲
                                    [Resumo noturno (Cron Trigger)]
```

Cada componente tem uma única responsabilidade e pode ser testado isoladamente.

### 4.1 Recebedor (webhook)
- Responde à verificação do webhook da Meta (`GET` com `hub.challenge`).
- Valida a assinatura `X-Hub-Signature-256` de cada `POST`. Requisições inválidas são rejeitadas.
- **Allowlist:** só processa mensagens do número dela. Mensagens de outros números são ignoradas, sem resposta e sem acesso à agenda.
- **Idempotência:** registra o `id` de cada mensagem recebida. Uma mensagem repetida pela Meta é descartada.
- **Coloca a mensagem numa fila (Cloudflare Queues) e responde `200` imediatamente.** O processamento (normalizador → assistente → enviador) roda no consumidor da fila. Motivo: o `ctx.waitUntil` só estende a execução por 30 s após a resposta, e áudio + várias chamadas à IA podem passar disso. O consumidor da fila tem até 15 min de tempo total e faz novas tentativas automáticas em caso de falha.

### 4.2 Normalizador
Converte a mensagem recebida numa entrada textual para o assistente:
- **Texto:** passa direto.
- **Áudio:** baixa a mídia pela Graph API e transcreve com Whisper no Workers AI. Se a transcrição falhar ou vier vazia, responde pedindo para repetir.
- **Encaminhada:** texto marcado como `encaminhada: true` (campo `context.forwarded` do webhook). O WhatsApp **não informa o autor original**.
- **Outros tipos** (imagem, figurinha, localização): responde que só entende texto e áudio.

A transcrição fica atrás de uma interface (`Transcritor`), para poder trocar de provedor sem afetar o resto.

### 4.3 Assistente IA
- Modelo: **Claude Haiku 4.5** (`claude-haiku-4-5`) com uso de ferramentas (tool use). A bateria de avaliação (seção 8) decide se ele basta. Se não bastar, trocar pelo Sonnet 5.
- O prompt de sistema inclui: data e hora atuais em `America/Sao_Paulo` (com dia da semana), as regras de comportamento da seção 5 e a janela padrão de horários livres.
- Contexto: os últimos N turnos completos da conversa (`HISTORICO_TURNOS`, padrão 10).
- **Sem prompt caching:** o Haiku 4.5 só faz cache de prefixos a partir de 4.096 tokens, e o prompt de sistema com as ferramentas fica abaixo disso.
- O prompt inclui um calendário dos próximos 14 dias (data ↔ dia da semana), para o modelo resolver "sexta" copiando, sem calcular.
- O histórico guarda cada turno **completo**: a mensagem dela, as chamadas de ferramenta com seus resultados e a resposta final. No piloto, guardar só os textos finais fez o modelo imitar confirmações anteriores ("✅ Marquei…") sem chamar a ferramenta; com o turno completo o problema desapareceu na avaliação.
- **Trava contra confirmação falsa:** se a resposta final afirma uma alteração ("✅", "marquei", "cancelei"…) sem nenhuma ferramenta de alteração bem-sucedida no turno, o modelo recebe uma correção e tenta de novo; se insistir, ela recebe "não consegui registrar". A resposta falsa e a correção não entram no histórico.
- Ferramentas:

| Ferramenta | Entrada | Efeito |
|---|---|---|
| `consultar_agenda` | intervalo (início, fim), filtro opcional por nome | Lista agendamentos e bloqueios com situação `marcado` |
| `horarios_livres` | dia, duração, faixa opcional (ex.: "tarde") | Lista os intervalos livres dentro da janela padrão |
| `marcar` | cliente, início, duração, serviço, observação?, tipo (`atendimento` \| `bloqueio`), `confirmado_sobreposicao`? | Cria o registro. Sem o campo serviço (atendimento), **não cria** e manda perguntar; serviço vazio = ela não quer. Se houver sobreposição e `confirmado_sobreposicao` não for verdadeiro, **não cria** e devolve os conflitos. Fora da janela padrão, cria e devolve `aviso` |
| `remarcar` | id, novo início, nova duração? | Altera o horário (com a mesma regra de sobreposição e o mesmo aviso) |
| `atualizar` | id, cliente?, serviço?, observação?, duração? | Edita os campos informados (texto vazio remove serviço/observação); duração maior verifica sobreposição |
| `desmarcar` | id | Muda a situação para `cancelado` |
| `desfazer` | — | Reverte a última alteração ainda não desfeita (pilha) |

A lógica de agenda (datas, sobreposição, horários livres) fica **fora do modelo**, em funções puras testáveis. O modelo só decide quando chamar cada ferramenta.

### 4.4 Agenda (Cloudflare D1)
Ver seção 6.

### 4.5 Resumo noturno
- Cron Trigger diário. Cron é em UTC: 20h em Brasília = `0 23 * * *`. Brasília não tem horário de verão desde 2019.
- Monta o resumo do dia seguinte, com um item por linha, em ordem, no formato de página de agenda: `09:00–10:00 Maria — escova`. Bloqueios aparecem identificados.
- Dia vazio: envia "Amanhã você não tem atendimentos".
- Envio: se houver janela de 24h aberta (última mensagem dela há menos de 23h, com margem de segurança), envia texto livre. Senão, envia um **modelo de utilidade** aprovado pela Meta (`resumo_amanha`). Parâmetros de modelo não aceitam quebras de linha, então nesse caso o resumo vai numa linha só, com itens separados por " • ".
- Falha: até 3 tentativas com espera crescente. Se todas falharem, envia alerta para o número do administrador pelo modelo `alerta_sistema`.

### 4.6 Enviador
Envia texto pela Graph API e, fora da janela de 24h, usa o modelo de mensagem. Mensagens longas são divididas respeitando o limite de tamanho do WhatsApp.

## 5. Comportamento da conversa

**Marcar**
- Obrigatórios: **nome da cliente, dia/hora de início, duração.** O serviço é opcional.
- Se faltar algum obrigatório, pergunta só o que falta. Se ela não disse o serviço, pergunta se quer adicionar (junto com o que mais faltar); "sem serviço" marca sem.
- Com tudo presente, **marca direto** e confirma: `✅ Marquei Maria, sex 02/10, 14:00–15:00, escova.`
- Fora do horário padrão: marca e acrescenta `⚠️ Fora do horário padrão`, ou pergunta antes citando o horário.
- Datas relativas ("sexta", "amanhã") são resolvidas para a próxima ocorrência futura e sempre exibidas por extenso na confirmação.
- Sobreposição: não cria. Lista os conflitos e pergunta: "Isso sobrepõe Ana 14:30–15:30. Marco mesmo assim?". Se ela confirmar, chama `marcar` com `confirmado_sobreposicao: true`.

**Bloqueios**
- "Bloqueia segunda o dia todo", "médico quinta 10h às 12h": registrados com `tipo = bloqueio` e cliente = descrição.
- "O dia todo" = a janela padrão inteira.

**Remarcar e desmarcar**
- **Sempre pedem confirmação explícita** antes de executar, uma vez só: se a pergunta já descrevia a mudança exata e ela disse "sim", executa.
- Se a referência for ambígua (duas Marias no período), pergunta qual, mostrando data e hora de cada uma.

**Editar**
- Nome, serviço, observação e duração são corrigidos com `atualizar`, sem pedir "sim" (a edição pode ser desfeita). Nunca desmarca e marca de novo para editar.

**Desfazer**
- "Desfaz" reverte a última alteração ainda não desfeita (criação → cancela; remarcação/edição → volta todos os campos; cancelamento → reativa). Repetir "desfaz" continua voltando.

**Consultar**
- Perguntas livres: "o que tenho amanhã?", "quando a Ana vem?", "tenho algo livre sábado de manhã?".
- Horários livres: intervalos vazios dentro da janela padrão (8:00–20:00, configurável), descontando agendamentos e bloqueios.

**Mensagem encaminhada**
- É tratada como pedido de uma cliente, não como ordem dela.
- O assistente interpreta o pedido, consulta os horários livres compatíveis e os apresenta. Pergunta o nome da cliente se ele não estiver no texto, e a duração, se necessário.
- Só marca depois que ela escolher um horário.

**Incerteza**
- Nunca inventa dados nem marca no chute. Na dúvida, pergunta.
- Tom: breve, informal, em português do Brasil.

## 6. Dados

**`agendamentos`**
| Campo | Tipo | Observação |
|---|---|---|
| `id` | INTEGER PK | |
| `cliente` | TEXT | Nome da cliente ou descrição do bloqueio |
| `inicio` | TEXT | ISO 8601 com offset `-03:00` |
| `fim` | TEXT | Calculado a partir da duração |
| `servico` | TEXT NULL | |
| `observacao` | TEXT NULL | |
| `tipo` | TEXT | `atendimento` \| `bloqueio` |
| `situacao` | TEXT | `marcado` \| `cancelado` (nunca há exclusão física) |
| `criado_em` / `atualizado_em` | TEXT | |

**`alteracoes`**: histórico para o `desfazer` (id, agendamento_id, ação, estado anterior em JSON, data).

**`turnos`**: histórico da conversa, um turno completo por linha (JSON com a mensagem dela, chamadas e resultados de ferramentas e a resposta).

**`recebidas`**: id de cada mensagem do WhatsApp recebida dela (chave única), a data e se ela já alterou a agenda (`alterou`). Serve à idempotência, à janela de 24h e a impedir que uma nova tentativa da fila repita uma alteração.

**`agendamentos.cliente_busca`**: o nome sem acentos e em minúsculas, para "leticia" achar "Letícia".

**Configuração** (variáveis e segredos do Worker): número autorizado dela, número do administrador, horário do resumo, janela padrão, N de turnos de contexto, tokens da Meta e da Anthropic, segredo do app para validar a assinatura.

O telefone da cliente **não** é guardado na v1.

## 7. Erros e confiabilidade

| Situação | Comportamento |
|---|---|
| Falha na IA ou na transcrição | A fila tenta de novo automaticamente, **mas só se nada foi alterado na agenda nessa tentativa** (repetir após uma marcação criaria duplicata). Esgotadas as tentativas, ou se já houve alteração, responde "Tive um problema..." e sugere conferir a agenda. Nunca fica em silêncio. Cada alteração no banco é atômica. |
| Mensagem duplicada da Meta | Descartada pela chave única do id da mensagem. |
| Falha no resumo noturno | 3 tentativas. Depois, alerta ao administrador. |
| Assinatura inválida ou número não autorizado | Ignora e registra em log. |
| Perda de dados | Restauração para um ponto no passado do D1 (Time Travel): 7 dias no plano gratuito, 30 no pago. |

## 8. Testes

1. **Unitários (lógica de agenda):** cálculo de fim, detecção de sobreposição, horários livres, resolução de datas relativas, fuso `America/Sao_Paulo` e formatação do resumo.
2. **Integração (Worker):** webhook com assinatura válida e inválida, allowlist, idempotência, fluxo de áudio com transcritor simulado, e escolha entre texto livre e modelo no resumo.
3. **Avaliação do assistente:** um conjunto de conversas de exemplo rodadas só com texto, sem WhatsApp, verificando a ferramenta chamada, os argumentos e se ele pergunta o que falta. Casos mínimos:
   - marcar completo;
   - marcar sem duração;
   - "sexta" resolvida corretamente;
   - sobreposição;
   - desmarcar com nome ambíguo;
   - remarcar;
   - desfazer;
   - encaminhada sem nome;
   - bloqueio "dia todo";
   - consulta de livres;
   - pedido fora de escopo.
4. **Piloto:** período em que só o administrador usa o assistente pelo WhatsApp real, antes de ela começar. O piloto deve confirmar:
   - que mensagens encaminhadas chegam marcadas (P2);
   - a qualidade da transcrição de áudios reais em pt-BR (P4);
   - o consumo de CPU por mensagem, para decidir entre plano gratuito e pago (P3);
   - o custo real da IA por dia.

## 9. Custos estimados

- **Único:** chip pré-pago (~R$ 15).
- **Mensal (preços conferidos em 2026-09-28):**

| Item | Preço de referência | Estimativa mensal |
|---|---|---|
| Claude Haiku 4.5 | US$ 1 / MTok entrada, US$ 5 / MTok saída (sem cache: prompt < 4.096 tokens) | ~R$ 15–40 para 10–30 interações/dia (~3,5 mil tokens de entrada por chamada, ~2 chamadas por interação) |
| Whisper no Workers AI | US$ 0,0005/min; 10.000 neurons/dia grátis (~200 min de áudio) | R$ 0 |
| Meta: mensagens de serviço e utilidade dentro da janela de 24h | Grátis | R$ 0 |
| Meta: modelo de utilidade fora da janela (resumo noturno) | ~R$ 0,035–0,05 cada | ≤ R$ 1,50 |
| Cloudflare Workers + D1 + Queues | Plano gratuito, ou US$ 5/mês no pago | R$ 0, ou ~R$ 28 |
| **Total** | | **~R$ 15–40 no gratuito; ~R$ 45–70 se precisar do pago** |

A estimativa da IA depende do volume real e deve ser medida no piloto.

## 10. Premissas verificadas

| # | Premissa | Resultado | Consequência |
|---|---|---|---|
| P1 | Respostas dentro da janela de 24h são gratuitas; utilidade fora dela custa centavos no Brasil | ✅ Confirmado. Fora da janela, ~R$ 0,035–0,05 (fontes de terceiros; a Meta passou a faturar em BRL em 2026). | Nenhuma |
| P2 | O webhook marca encaminhadas (`context.forwarded`) sem revelar o autor | ⚠️ Campos `forwarded` e `frequently_forwarded` confirmados por fontes secundárias. | **Validar no piloto** com um webhook real |
| P3 | O plano gratuito do Workers comporta o processamento | ⚠️ Parcial. `waitUntil` limitado a 30 s e **10 ms de CPU por requisição** no gratuito. Cron Triggers: 5 no gratuito. | Processamento movido para **Queues** (15 min de tempo total, disponível no gratuito). Se o piloto exceder o limite de CPU (ex.: ao converter áudio para base64), migrar para o plano pago. Não exige mudança de código. |
| P4 | Whisper no Workers AI dentro da cota gratuita | ✅ Custo confirmado. Qualidade em pt-BR não verificada. | **Validar no piloto** com áudios reais. Se ruim, trocar o `Transcritor` |
| P5 | Preço do Claude Haiku 4.5 | ✅ US$ 1 / US$ 5 por MTok. Cache mínimo de 4.096 tokens torna o cache inútil aqui. | Estimativa ajustada (seção 9); cache removido |
| P6 | Time Travel do D1 no gratuito | ✅ 7 dias no gratuito, 30 no pago | Suficiente para a v1 |

Fontes: [limites do Workers](https://developers.cloudflare.com/workers/platform/limits/), [limites do Queues](https://developers.cloudflare.com/queues/platform/limits/), [preços do Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Time Travel do D1](https://developers.cloudflare.com/d1/reference/time-travel/), [preços da Meta](https://developers.facebook.com/docs/whatsapp/pricing), [preços do Claude](https://platform.claude.com/docs/en/about-claude/pricing), [preço de utilidade no Brasil](https://www.messagecentral.com/blog/whatsapp-business-api-pricing-brazil), [campos de encaminhada](https://github.com/chatwoot/chatwoot/issues/15172).
