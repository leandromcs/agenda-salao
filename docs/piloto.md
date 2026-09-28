# Piloto (só o administrador usa, antes dela)

Duração sugerida: 1 semana, pelo menos 20 conversas reais.

## Checklist
- [ ] Marcar, consultar, remarcar (com "sim"), desmarcar (com "sim") e desfazer funcionam por texto.
- [ ] **P2 — encaminhada:** encaminhe uma mensagem de outra conversa para o assistente. No `npx wrangler tail`, o log `mensagem_recebida` deve mostrar `"encaminhada":true`. Se vier `false`, o assistente tratará o texto como ordem sua: registre isso e decida com a dona se ela vai escrever "cliente pediu:" antes de encaminhar.
- [ ] **P4 — áudio:** mande 5 áudios reais (com barulho de secador, se possível). Anote quantos foram entendidos. Menos de 4 de 5 → trocar o `Transcritor`.
- [ ] **P3 — CPU:** no painel da Cloudflare → Workers → agenda-salao → Metrics, veja o "CPU time" do consumidor da fila. Se houver erros de limite de CPU (plano gratuito = 10 ms), assine o Workers Paid (US$ 5/mês); não precisa mudar código.
- [ ] **Resumo noturno:** confira que chegou às 20h. Teste também um dia sem falar com o assistente (deve chegar pelo modelo `resumo_amanha`).
- [ ] **Custo da IA:** em platform.claude.com → Usage, divida o gasto da semana por 7 e multiplique por 30. Compare com a estimativa da especificação (R$ 15–40/mês).
- [ ] **Troca para ela:** `npx wrangler secret put NUMERO_DELA` com o número dela; salve o contato "Agenda" no celular dela; primeira conversa juntos.
