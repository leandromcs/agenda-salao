import { beforeEach, describe, expect, it } from "vitest";
import { Historico } from "../src/conversa/historico";
import { limparBanco, testEnv } from "./ambiente";

describe("Historico", () => {
  let h: Historico;

  beforeEach(async () => {
    await limparBanco();
    h = new Historico(testEnv.DB);
  });

  it("detecta mensagem repetida e permite esquecer", async () => {
    const agora = new Date("2026-09-28T13:00:00Z");
    expect(await h.registrarRecebida("wamid.1", agora)).toBe(true);
    expect(await h.registrarRecebida("wamid.1", agora)).toBe(false);
    await h.esquecerRecebida("wamid.1");
    expect(await h.registrarRecebida("wamid.1", agora)).toBe(true);
  });

  it("sabe quando ela escreveu por último", async () => {
    expect(await h.ultimaDelaEm()).toBeNull();
    await h.registrarRecebida("wamid.1", new Date("2026-09-28T10:00:00Z"));
    await h.registrarRecebida("wamid.2", new Date("2026-09-28T12:00:00Z"));
    expect((await h.ultimaDelaEm())?.toISOString()).toBe("2026-09-28T12:00:00.000Z");
  });

  it("carrega os últimos turnos em ordem, começando por user", async () => {
    const agora = new Date("2026-09-28T13:00:00Z");
    await h.salvarTurno("u1", "a1", agora);
    await h.salvarTurno("u2", "a2", agora);
    await h.salvarTurno("u3", "a3", agora);
    expect(await h.carregar(4)).toEqual([
      { papel: "user", conteudo: "u2" },
      { papel: "assistant", conteudo: "a2" },
      { papel: "user", conteudo: "u3" },
      { papel: "assistant", conteudo: "a3" },
    ]);
    // Limite ímpar cortaria no meio: o primeiro turno "assistant" é descartado
    expect((await h.carregar(3))[0]).toEqual({ papel: "user", conteudo: "u3" });
  });
});
