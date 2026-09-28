export interface Transcritor {
  transcrever(audio: ArrayBuffer): Promise<string>;
}

export function paraBase64(dados: ArrayBuffer): string {
  const bytes = new Uint8Array(dados);
  let binario = "";
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }
  return btoa(binario);
}

type ExecutorIa = { run(modelo: string, entrada: unknown): Promise<unknown> };

export class TranscritorWorkersAi implements Transcritor {
  constructor(private readonly ai: Ai) {}

  async transcrever(audio: ArrayBuffer): Promise<string> {
    // Os tipos gerados do Workers AI variam por versão; chamamos pela forma genérica.
    const resposta = (await (this.ai as unknown as ExecutorIa).run("@cf/openai/whisper-large-v3-turbo", {
      audio: paraBase64(audio),
      task: "transcribe",
      language: "pt",
      vad_filter: true,
    })) as { text?: string };
    return (resposta.text ?? "").trim();
  }
}
