import { describe, expect, it } from "vitest";
import { dividirTexto, WhatsAppCliente, type Buscar } from "../src/whatsapp/cliente";

interface Chamada {
  url: string;
  init?: RequestInit;
}

function fakeFetch(respostas: Response[]): { buscar: Buscar; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const buscar: Buscar = async (url, init) => {
    chamadas.push({ url, init });
    const r = respostas.shift();
    if (!r) throw new Error("resposta inesperada");
    return r;
  };
  return { buscar, chamadas };
}

const cfg = { token: "TOKEN", phoneNumberId: "PNID", versao: "v23.0" };
const ok = () => new Response("{}", { status: 200 });

describe("dividirTexto", () => {
  it("não divide textos curtos", () => {
    expect(dividirTexto("oi")).toEqual(["oi"]);
  });
  it("divide em quebras de linha respeitando o limite", () => {
    const partes = dividirTexto("aaaa\nbbbb\ncccc", 9);
    expect(partes).toEqual(["aaaa\nbbbb", "cccc"]);
    expect(partes.every((p) => p.length <= 9)).toBe(true);
  });
  it("corta no limite quando não há quebra de linha", () => {
    expect(dividirTexto("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });
});

describe("WhatsAppCliente", () => {
  it("envia texto com token e corpo corretos", async () => {
    const { buscar, chamadas } = fakeFetch([ok()]);
    await new WhatsAppCliente(cfg, buscar).enviarTexto("5511988887777", "Olá");
    expect(chamadas[0]!.url).toBe("https://graph.facebook.com/v23.0/PNID/messages");
    expect(new Headers(chamadas[0]!.init?.headers).get("Authorization")).toBe("Bearer TOKEN");
    expect(JSON.parse(String(chamadas[0]!.init?.body))).toEqual({
      messaging_product: "whatsapp",
      to: "5511988887777",
      type: "text",
      text: { body: "Olá" },
    });
  });

  it("envia modelo com parâmetros do corpo", async () => {
    const { buscar, chamadas } = fakeFetch([ok()]);
    await new WhatsAppCliente(cfg, buscar).enviarModelo("55", "resumo_amanha", ["sex 02/10", "09:00–10:00 Ana"]);
    expect(JSON.parse(String(chamadas[0]!.init?.body))).toEqual({
      messaging_product: "whatsapp",
      to: "55",
      type: "template",
      template: {
        name: "resumo_amanha",
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "sex 02/10" },
              { type: "text", text: "09:00–10:00 Ana" },
            ],
          },
        ],
      },
    });
  });

  it("lança erro quando a Graph API recusa", async () => {
    const { buscar } = fakeFetch([new Response('{"error":{}}', { status: 400 })]);
    await expect(new WhatsAppCliente(cfg, buscar).enviarTexto("55", "x")).rejects.toThrow(/400/);
  });

  it("baixa mídia em dois passos", async () => {
    const { buscar, chamadas } = fakeFetch([
      new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/arquivo" }), { status: 200 }),
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    ]);
    const dados = await new WhatsAppCliente(cfg, buscar).baixarMidia("midia1");
    expect(chamadas.map((c) => c.url)).toEqual(["https://graph.facebook.com/v23.0/midia1", "https://lookaside.fbsbx.com/arquivo"]);
    expect([...new Uint8Array(dados)]).toEqual([1, 2, 3]);
  });
});
