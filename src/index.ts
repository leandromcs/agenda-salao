// O workerd só aceita handlers como exportações do módulo de entrada; o resto fica privado.
import Anthropic from "@anthropic-ai/sdk";
import { AgendaRepositorio } from "./agenda/repositorio";
import { AgendaServico } from "./agenda/servico";
import { Historico } from "./conversa/historico";
import { TranscritorWorkersAi } from "./conversa/transcritor";
import type { Env } from "./env";
import { processarMensagem, type DepsProcessamento } from "./processar";
import { enviarResumoNoturno } from "./resumo/resumo";
import { tratarRequisicao } from "./rotas";
import { WhatsAppCliente } from "./whatsapp/cliente";
import type { MensagemRecebida } from "./whatsapp/tipos";

const MAX_TENTATIVAS = 3; // = 1 + max_retries (2) do wrangler.jsonc
const ESPERA_NOVA_TENTATIVA_S = 10;

function criarWhatsApp(env: Env): WhatsAppCliente {
  return new WhatsAppCliente({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, versao: env.GRAPH_API_VERSAO });
}

function montarDeps(env: Env): DepsProcessamento {
  const relogio = () => new Date();
  const config = { janelaInicio: env.JANELA_INICIO, janelaFim: env.JANELA_FIM };
  // Limites curtos para a chamada não ultrapassar o tempo da fila (os padrões do SDK chegam a 10 min × 3).
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 1 });
  return {
    historico: new Historico(env.DB),
    agenda: new AgendaServico(new AgendaRepositorio(env.DB), config, relogio),
    whatsapp: criarWhatsApp(env),
    transcritor: new TranscritorWorkersAi(env.AI),
    claude: { messages: { create: (params) => anthropic.messages.create(params) } },
    modelo: env.MODELO_CLAUDE,
    relogio,
    janelaInicio: config.janelaInicio,
    janelaFim: config.janelaFim,
    limiteHistorico: Number(env.HISTORICO_TURNOS) || 10,
  };
}

export default {
  async fetch(request, env): Promise<Response> {
    return await tratarRequisicao(request, env);
  },

  async queue(lote, env): Promise<void> {
    const deps = montarDeps(env);
    for (const mensagem of lote.messages) {
      try {
        const resultado = await processarMensagem(mensagem.body, deps, mensagem.attempts, MAX_TENTATIVAS);
        if (resultado === "tentar-de-novo") mensagem.retry({ delaySeconds: ESPERA_NOVA_TENTATIVA_S });
        else mensagem.ack();
      } catch (erro) {
        console.error("Erro inesperado ao processar mensagem", erro);
        if (mensagem.attempts < MAX_TENTATIVAS) mensagem.retry({ delaySeconds: ESPERA_NOVA_TENTATIVA_S });
        else mensagem.ack();
      }
    }
  },

  async scheduled(_controller, env, ctx): Promise<void> {
    ctx.waitUntil(
      enviarResumoNoturno({
        repo: new AgendaRepositorio(env.DB),
        whatsapp: criarWhatsApp(env),
        historico: new Historico(env.DB),
        numeroDela: env.NUMERO_DELA,
        numeroAdmin: env.NUMERO_ADMIN,
        modeloResumo: env.MODELO_RESUMO,
        modeloAlerta: env.MODELO_ALERTA,
        relogio: () => new Date(),
        esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      }).then(() => undefined),
    );
  },
} satisfies ExportedHandler<Env, MensagemRecebida>;
