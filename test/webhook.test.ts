import { describe, expect, it } from "vitest";
import { extrairMensagens, mesmoNumero, verificarAssinatura } from "../src/whatsapp/webhook";

async function assinar(corpo: string, segredo: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo));
  return "sha256=" + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("verificarAssinatura", () => {
  it("aceita assinatura correta e recusa as demais", async () => {
    const corpo = '{"a":1}';
    const cab = await assinar(corpo, "segredo");
    expect(await verificarAssinatura(buf(corpo), cab, "segredo")).toBe(true);
    expect(await verificarAssinatura(buf(corpo), cab, "outro")).toBe(false);
    expect(await verificarAssinatura(buf('{"a":2}'), cab, "segredo")).toBe(false);
    expect(await verificarAssinatura(buf(corpo), null, "segredo")).toBe(false);
    expect(await verificarAssinatura(buf(corpo), "sha1=abc", "segredo")).toBe(false);
  });
});

describe("extrairMensagens", () => {
  const envelope = (messages: unknown[]) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages } }] }],
  });

  it("extrai texto, áudio, encaminhada e outros tipos", () => {
    const r = extrairMensagens(
      envelope([
        { from: "5511988887777", id: "w1", type: "text", text: { body: "oi" } },
        { from: "5511988887777", id: "w2", type: "audio", audio: { id: "midia1", mime_type: "audio/ogg; codecs=opus" } },
        { from: "5511988887777", id: "w3", type: "text", text: { body: "tem horário?" }, context: { forwarded: true } },
        { from: "5511988887777", id: "w4", type: "sticker", sticker: { id: "s" } },
      ]),
    );
    expect(r).toEqual([
      { id: "w1", de: "5511988887777", tipo: "texto", texto: "oi", encaminhada: false },
      { id: "w2", de: "5511988887777", tipo: "audio", audioId: "midia1", encaminhada: false },
      { id: "w3", de: "5511988887777", tipo: "texto", texto: "tem horário?", encaminhada: true },
      { id: "w4", de: "5511988887777", tipo: "outro", encaminhada: false },
    ]);
  });

  it("ignora reações e mensagens de sistema (um 👍 não merece resposta)", () => {
    expect(
      extrairMensagens(
        envelope([
          { from: "5511988887777", id: "r1", type: "reaction", reaction: { message_id: "w1", emoji: "👍" } },
          { from: "5511988887777", id: "s1", type: "system", system: { body: "trocou de número" } },
        ]),
      ),
    ).toEqual([]);
  });

  it("ignora payloads de status e lixo", () => {
    expect(extrairMensagens({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] })).toEqual([]);
    expect(extrairMensagens(null)).toEqual([]);
    expect(extrairMensagens({ entry: "x" })).toEqual([]);
    expect(extrairMensagens(envelope([{ type: "text" }]))).toEqual([]);
  });
});

describe("mesmoNumero", () => {
  it("compara ignorando formatação e o nono dígito brasileiro", () => {
    expect(mesmoNumero("5511988887777", "5511988887777")).toBe(true);
    expect(mesmoNumero("551188887777", "5511988887777")).toBe(true);
    expect(mesmoNumero("+55 (11) 98888-7777", "5511988887777")).toBe(true);
    expect(mesmoNumero("5511988887776", "5511988887777")).toBe(false);
    expect(mesmoNumero("14155550123", "14155550123")).toBe(true);
    expect(mesmoNumero("", "")).toBe(false);
  });
});
