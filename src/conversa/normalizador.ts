import type { MensagemRecebida } from "../whatsapp/tipos";
import type { Transcritor } from "./transcritor";

export const PREFIXO_ENCAMINHADA = "[Mensagem encaminhada de uma cliente]";
export const PREFIXO_AUDIO = "[Áudio transcrito]";
export const RESPOSTA_TIPO_NAO_SUPORTADO = "Por enquanto eu só entendo texto e áudio. 🙂";
export const RESPOSTA_AUDIO_FALHOU = "Não consegui entender o áudio. Pode mandar de novo ou escrever?";

export type Normalizada = { ok: true; texto: string } | { ok: false; resposta: string };

export interface DepsNormalizador {
  baixarMidia(id: string): Promise<ArrayBuffer>;
  transcritor: Transcritor;
}

export async function normalizar(msg: MensagemRecebida, deps: DepsNormalizador): Promise<Normalizada> {
  let texto: string;
  if (msg.tipo === "texto") {
    texto = (msg.texto ?? "").trim();
    if (!texto) return { ok: false, resposta: RESPOSTA_TIPO_NAO_SUPORTADO };
  } else if (msg.tipo === "audio" && msg.audioId) {
    let transcrito: string;
    try {
      transcrito = await deps.transcritor.transcrever(await deps.baixarMidia(msg.audioId));
    } catch (erro) {
      console.error("Falha ao transcrever áudio", erro);
      return { ok: false, resposta: RESPOSTA_AUDIO_FALHOU };
    }
    if (!transcrito.trim()) return { ok: false, resposta: RESPOSTA_AUDIO_FALHOU };
    texto = `${PREFIXO_AUDIO} ${transcrito.trim()}`;
  } else {
    return { ok: false, resposta: RESPOSTA_TIPO_NAO_SUPORTADO };
  }
  return { ok: true, texto: msg.encaminhada ? `${PREFIXO_ENCAMINHADA}\n${texto}` : texto };
}
