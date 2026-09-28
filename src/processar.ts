import type { OperacoesAgenda } from "./agenda/servico";
import { ErroAssistente, responder, type ClienteClaude, type Resposta } from "./assistente/assistente";
import { montarSistema } from "./assistente/prompt";
import type { Historico } from "./conversa/historico";
import { normalizar } from "./conversa/normalizador";
import type { Transcritor } from "./conversa/transcritor";
import type { WhatsAppCliente } from "./whatsapp/cliente";
import type { MensagemRecebida } from "./whatsapp/tipos";

export interface DepsProcessamento {
  historico: Pick<Historico, "carregar" | "salvarTurno" | "marcarAlteracao" | "houveAlteracao">;
  agenda: OperacoesAgenda;
  whatsapp: Pick<WhatsAppCliente, "enviarTexto" | "baixarMidia">;
  transcritor: Transcritor;
  claude: ClienteClaude;
  modelo: string;
  relogio: () => Date;
  janelaInicio: string;
  janelaFim: string;
  /** Quantos turnos completos anteriores o assistente recebe. */
  limiteHistorico: number;
}

export const RESPOSTA_ERRO =
  'Tive um problema aqui e não consegui terminar. Pode repetir? Se você tinha pedido para marcar ou mudar algo, confira antes com "o que tenho no dia?".';

export const RESPOSTA_ERRO_APOS_ALTERACAO =
  'Tive um problema no meio do caminho, mas a agenda já foi alterada. Não repita o pedido: confira antes com "o que tenho no dia?".';

export type ResultadoProcessamento = "respondida" | "tentar-de-novo";

/** Envio que nunca lança: usado quando uma nova tentativa da fila seria pior que perder o aviso. */
async function avisar(deps: DepsProcessamento, para: string, texto: string): Promise<void> {
  try {
    await deps.whatsapp.enviarTexto(para, texto);
  } catch (erro) {
    console.error("Falha ao enviar aviso", erro);
  }
}

export async function processarMensagem(
  msg: MensagemRecebida,
  deps: DepsProcessamento,
  tentativa: number,
  maxTentativas: number,
): Promise<ResultadoProcessamento> {
  // Uma tentativa anterior já mexeu na agenda: repetir o pedido poderia marcar em dobro.
  if (tentativa > 1 && (await deps.historico.houveAlteracao(msg.id))) {
    await avisar(deps, msg.de, RESPOSTA_ERRO_APOS_ALTERACAO);
    return "respondida";
  }

  const normalizada = await normalizar(msg, {
    baixarMidia: (id) => deps.whatsapp.baixarMidia(id),
    transcritor: deps.transcritor,
  });
  if (!normalizada.ok) {
    await deps.whatsapp.enviarTexto(msg.de, normalizada.resposta);
    return "respondida";
  }

  let resposta: Resposta;
  try {
    const historico = await deps.historico.carregar(deps.limiteHistorico);
    const sistema = montarSistema({ agora: deps.relogio(), janelaInicio: deps.janelaInicio, janelaFim: deps.janelaFim });
    resposta = await responder({
      cliente: deps.claude,
      modelo: deps.modelo,
      sistema,
      historico,
      entrada: normalizada.texto,
      agenda: deps.agenda,
      aoAlterar: () => deps.historico.marcarAlteracao(msg.id),
    });
  } catch (erro) {
    console.error("Falha ao gerar resposta", erro);
    const alterou = erro instanceof ErroAssistente && erro.houveAlteracao;
    if (!alterou && tentativa < maxTentativas) return "tentar-de-novo";
    await avisar(deps, msg.de, alterou ? RESPOSTA_ERRO_APOS_ALTERACAO : RESPOSTA_ERRO);
    return "respondida";
  }

  try {
    await deps.whatsapp.enviarTexto(msg.de, resposta.texto);
  } catch (erro) {
    console.error("Falha ao enviar resposta", erro);
    if (!resposta.houveAlteracao && tentativa < maxTentativas) return "tentar-de-novo";
  }
  try {
    await deps.historico.salvarTurno(resposta.registro, deps.relogio());
  } catch (erro) {
    // Perder um turno do histórico é melhor que repetir a mensagem inteira.
    console.error("Falha ao salvar o turno", erro);
  }
  return "respondida";
}
