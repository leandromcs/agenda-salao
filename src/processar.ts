import type { OperacoesAgenda } from "./agenda/servico";
import { ErroAssistente, responder, type ClienteClaude, type Resposta } from "./assistente/assistente";
import { montarSistema } from "./assistente/prompt";
import type { Historico } from "./conversa/historico";
import { normalizar } from "./conversa/normalizador";
import type { Transcritor } from "./conversa/transcritor";
import type { WhatsAppCliente } from "./whatsapp/cliente";
import type { MensagemRecebida } from "./whatsapp/tipos";

export interface DepsProcessamento {
  historico: Pick<Historico, "carregar" | "salvarTurno">;
  agenda: OperacoesAgenda;
  whatsapp: Pick<WhatsAppCliente, "enviarTexto" | "baixarMidia">;
  transcritor: Transcritor;
  claude: ClienteClaude;
  modelo: string;
  relogio: () => Date;
  janelaInicio: string;
  janelaFim: string;
  limiteHistorico: number;
}

export const RESPOSTA_ERRO =
  'Tive um problema aqui e não consegui terminar. Pode repetir? Se você tinha pedido para marcar ou mudar algo, confira antes com "o que tenho no dia?".';

export type ResultadoProcessamento = "respondida" | "tentar-de-novo";

export async function processarMensagem(
  msg: MensagemRecebida,
  deps: DepsProcessamento,
  tentativa: number,
  maxTentativas: number,
): Promise<ResultadoProcessamento> {
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
    });
  } catch (erro) {
    console.error("Falha ao gerar resposta", erro);
    const alterou = erro instanceof ErroAssistente && erro.houveAlteracao;
    if (!alterou && tentativa < maxTentativas) return "tentar-de-novo";
    await deps.whatsapp.enviarTexto(msg.de, RESPOSTA_ERRO);
    return "respondida";
  }

  try {
    await deps.whatsapp.enviarTexto(msg.de, resposta.texto);
  } catch (erro) {
    console.error("Falha ao enviar resposta", erro);
    if (!resposta.houveAlteracao && tentativa < maxTentativas) return "tentar-de-novo";
  }
  await deps.historico.salvarTurno(normalizada.texto, resposta.texto, deps.relogio());
  return "respondida";
}
