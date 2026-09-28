import { describe, expect, it, vi } from "vitest";
import {
  normalizar,
  PREFIXO_AUDIO,
  PREFIXO_ENCAMINHADA,
  RESPOSTA_AUDIO_FALHOU,
  RESPOSTA_TIPO_NAO_SUPORTADO,
} from "../src/conversa/normalizador";
import { paraBase64, TranscritorWorkersAi } from "../src/conversa/transcritor";
import type { MensagemRecebida } from "../src/whatsapp/tipos";

const msg = (m: Partial<MensagemRecebida>): MensagemRecebida => ({ id: "w", de: "55", tipo: "texto", encaminhada: false, ...m });

function deps(transcricao: string | Error = "marca a Ana sexta às 14h") {
  return {
    baixarMidia: vi.fn(async () => new Uint8Array([1, 2]).buffer as ArrayBuffer),
    transcritor: {
      transcrever: vi.fn(async () => {
        if (transcricao instanceof Error) throw transcricao;
        return transcricao;
      }),
    },
  };
}

describe("normalizar", () => {
  it("passa texto direto, sem espaços nas pontas", async () => {
    expect(await normalizar(msg({ texto: "  oi  " }), deps())).toEqual({ ok: true, texto: "oi" });
  });

  it("marca mensagens encaminhadas", async () => {
    expect(await normalizar(msg({ texto: "tem horário sexta?", encaminhada: true }), deps())).toEqual({
      ok: true,
      texto: `${PREFIXO_ENCAMINHADA}\ntem horário sexta?`,
    });
  });

  it("transcreve áudio", async () => {
    const d = deps();
    expect(await normalizar(msg({ tipo: "audio", audioId: "m1" }), d)).toEqual({
      ok: true,
      texto: `${PREFIXO_AUDIO} marca a Ana sexta às 14h`,
    });
    expect(d.baixarMidia).toHaveBeenCalledWith("m1");
  });

  it("áudio encaminhado leva os dois prefixos", async () => {
    const r = await normalizar(msg({ tipo: "audio", audioId: "m1", encaminhada: true }), deps("oi"));
    expect(r).toEqual({ ok: true, texto: `${PREFIXO_ENCAMINHADA}\n${PREFIXO_AUDIO} oi` });
  });

  it("responde quando a transcrição falha ou vem vazia", async () => {
    expect(await normalizar(msg({ tipo: "audio", audioId: "m1" }), deps(new Error("x")))).toEqual({ ok: false, resposta: RESPOSTA_AUDIO_FALHOU });
    expect(await normalizar(msg({ tipo: "audio", audioId: "m1" }), deps("   "))).toEqual({ ok: false, resposta: RESPOSTA_AUDIO_FALHOU });
  });

  it("recusa outros tipos e texto vazio", async () => {
    expect(await normalizar(msg({ tipo: "outro" }), deps())).toEqual({ ok: false, resposta: RESPOSTA_TIPO_NAO_SUPORTADO });
    expect(await normalizar(msg({ texto: "   " }), deps())).toEqual({ ok: false, resposta: RESPOSTA_TIPO_NAO_SUPORTADO });
  });
});

describe("transcritor", () => {
  it("converte bytes para base64", () => {
    expect(paraBase64(new Uint8Array([0, 1, 2, 250]).buffer as ArrayBuffer)).toBe(btoa(String.fromCharCode(0, 1, 2, 250)));
  });

  it("chama o Whisper em português e limpa o texto", async () => {
    const run = vi.fn(async () => ({ text: "  olá  " }));
    const t = new TranscritorWorkersAi({ run } as unknown as Ai);
    expect(await t.transcrever(new Uint8Array([1]).buffer as ArrayBuffer)).toBe("olá");
    expect(run).toHaveBeenCalledWith(
      "@cf/openai/whisper-large-v3-turbo",
      expect.objectContaining({ language: "pt", task: "transcribe", audio: expect.any(String) }),
    );
  });
});
