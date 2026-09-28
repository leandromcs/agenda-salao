/** Página exigida pela Meta para publicar o app (URL da Política de Privacidade). */
export const PAGINA_PRIVACIDADE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Política de Privacidade — Agenda do Salão</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #222; }
  h1 { font-size: 1.6rem; }
  h2 { font-size: 1.15rem; margin-top: 1.8rem; }
</style>
</head>
<body>
<h1>Política de Privacidade — Agenda do Salão</h1>

<p>A Agenda do Salão é um assistente de agenda de uso interno de um salão de beleza. Ele conversa pelo WhatsApp somente com a dona do salão, para registrar e consultar os atendimentos. As clientes do salão não conversam com o assistente.</p>

<h2>Quais dados são tratados</h2>
<ul>
  <li>As mensagens (texto e áudio) que a dona do salão envia ao número do assistente.</li>
  <li>Os dados dos atendimentos que ela informa: nome da cliente, data, horário, duração, serviço e observações.</li>
  <li>O número de WhatsApp da dona do salão e do administrador técnico, para envio das respostas e dos resumos.</li>
</ul>
<p>O telefone das clientes não é coletado nem armazenado.</p>

<h2>Para que os dados são usados</h2>
<p>Exclusivamente para manter a agenda do salão: marcar, remarcar, desmarcar e consultar atendimentos, e enviar à dona do salão um resumo dos atendimentos do dia seguinte.</p>

<h2>Com quem os dados são compartilhados</h2>
<p>Os dados não são vendidos nem compartilhados para outros fins. Para funcionar, o assistente usa os seguintes serviços, que tratam os dados apenas para prestar o serviço:</p>
<ul>
  <li>Meta (WhatsApp Business Platform): envio e recebimento das mensagens.</li>
  <li>Cloudflare: hospedagem, banco de dados e transcrição dos áudios.</li>
  <li>Anthropic (Claude): interpretação das mensagens para executar os pedidos de agenda.</li>
</ul>

<h2>Armazenamento e exclusão</h2>
<p>Os dados ficam armazenados na infraestrutura da Cloudflare enquanto o salão usar o assistente. A dona do salão pode pedir a qualquer momento a exclusão dos seus dados e dos dados da agenda ao administrador técnico do assistente.</p>

<h2>Contato</h2>
<p>Dúvidas sobre esta política ou pedidos de exclusão de dados podem ser feitos diretamente ao salão.</p>
</body>
</html>
`;
