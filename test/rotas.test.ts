import { beforeEach, describe, expect, it, vi } from "vitest";
import { tratarRequisicao, type EnvRotas } from "../src/rotas";
import type { MensagemRecebida } from "../src/whatsapp/tipos";
import { limparBanco, testEnv } from "./ambiente";

const SEGREDO = "app-secret";

async function assinar(corpo: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(SEGREDO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo));
  return "sha256=" + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function corpo(mensagens: object[]): string {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", messages: mensagens } }] }],
  });
}

const texto = (id: string, de = "551188887777") => ({ from: de, id, type: "text", text: { body: "oi" } });

async function post(env: EnvRotas, json: string, assinatura?: string): Promise<Response> {
  return tratarRequisicao(
    new Request("https://agenda.example/webhook", {
      method: "POST",
      headers: { "X-Hub-Signature-256": assinatura ?? (await assinar(json)) },
      body: json,
    }),
    env,
  );
}

describe("tratarRequisicao", () => {
  let enviadas: MensagemRecebida[];
  let env: EnvRotas;

  beforeEach(async () => {
    await limparBanco();
    enviadas = [];
    env = {
      DB: testEnv.DB,
      FILA: { send: vi.fn(async (m: MensagemRecebida) => { enviadas.push(m); }) } as unknown as EnvRotas["FILA"],
      WEBHOOK_VERIFY_TOKEN: "verifica",
      WHATSAPP_APP_SECRET: SEGREDO,
      NUMERO_DELA: "5511988887777",
    };
  });

  it("responde à verificação da Meta", async () => {
    const ok = await tratarRequisicao(
      new Request("https://agenda.example/webhook?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=123"),
      env,
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("123");
    const nao = await tratarRequisicao(
      new Request("https://agenda.example/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123"),
      env,
    );
    expect(nao.status).toBe(403);
  });

  it("404 fora de /webhook", async () => {
    expect((await tratarRequisicao(new Request("https://agenda.example/"), env)).status).toBe(404);
  });

  it("serve a política de privacidade exigida pela Meta para publicar o app", async () => {
    const r = await tratarRequisicao(new Request("https://agenda.example/privacidade"), env);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toContain("text/html");
    const html = await r.text();
    expect(html).toContain("Política de Privacidade");
    expect(html).toContain("Anthropic");
  });

  it("recusa assinatura inválida", async () => {
    expect((await post(env, corpo([texto("w1")]), "sha256=00")).status).toBe(401);
    expect(enviadas).toEqual([]);
  });

  it("enfileira mensagem dela (mesmo sem o nono dígito) uma única vez", async () => {
    expect((await post(env, corpo([texto("w1")]))).status).toBe(200);
    expect((await post(env, corpo([texto("w1")]))).status).toBe(200);
    expect(enviadas.map((m) => m.id)).toEqual(["w1"]);
  });

  it("ignora outros números", async () => {
    expect((await post(env, corpo([texto("w2", "5521977776666")]))).status).toBe(200);
    expect(enviadas).toEqual([]);
  });

  it("se falhar ao enfileirar, devolve 500 e aceita a reentrega da Meta", async () => {
    vi.mocked(env.FILA.send).mockRejectedValueOnce(new Error("fila fora"));
    expect((await post(env, corpo([texto("w3")]))).status).toBe(500);
    expect((await post(env, corpo([texto("w3")]))).status).toBe(200);
    expect(enviadas.map((m) => m.id)).toEqual(["w3"]);
  });

  it("aceita notificações de status sem enfileirar", async () => {
    const status = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "read" }] } }] }] });
    expect((await post(env, status)).status).toBe(200);
    expect(enviadas).toEqual([]);
  });
});
