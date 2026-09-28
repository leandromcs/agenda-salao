import { Historico } from "./conversa/historico";
import type { Env } from "./env";
import { extrairMensagens, mesmoNumero, verificarAssinatura } from "./whatsapp/webhook";

export type EnvRotas = Pick<Env, "DB" | "FILA" | "WEBHOOK_VERIFY_TOKEN" | "WHATSAPP_APP_SECRET" | "NUMERO_DELA">;

export async function tratarRequisicao(request: Request, env: EnvRotas, agora: Date = new Date()): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/webhook") return new Response("Não encontrado", { status: 404 });

  if (request.method === "GET") {
    const desafio = url.searchParams.get("hub.challenge");
    const valido =
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === env.WEBHOOK_VERIFY_TOKEN &&
      desafio !== null;
    return valido ? new Response(desafio, { status: 200 }) : new Response("Proibido", { status: 403 });
  }
  if (request.method !== "POST") return new Response("Método não permitido", { status: 405 });

  const corpo = await request.arrayBuffer();
  if (!(await verificarAssinatura(corpo, request.headers.get("X-Hub-Signature-256"), env.WHATSAPP_APP_SECRET))) {
    return new Response("Assinatura inválida", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(corpo));
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const historico = new Historico(env.DB);
  for (const msg of extrairMensagens(payload)) {
    if (!mesmoNumero(msg.de, env.NUMERO_DELA)) {
      // O número aparece no log (privado do administrador) para ajustar NUMERO_DELA se preciso.
      console.warn(JSON.stringify({ evento: "mensagem_ignorada", motivo: "número não autorizado", de: msg.de }));
      continue;
    }
    // Log sem conteúdo, para conferir no piloto se o campo de encaminhada chega (premissa P2).
    console.log(JSON.stringify({ evento: "mensagem_recebida", tipo: msg.tipo, encaminhada: msg.encaminhada, de: msg.de }));
    if (!(await historico.registrarRecebida(msg.id, agora))) continue;
    try {
      await env.FILA.send(msg);
    } catch (erro) {
      console.error("Falha ao enfileirar mensagem", erro);
      await historico.esquecerRecebida(msg.id);
      return new Response("Falha temporária", { status: 500 });
    }
  }
  return new Response("ok", { status: 200 });
}
