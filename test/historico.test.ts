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

  it("guarda turnos completos (com ferramentas) e carrega os últimos em ordem", async () => {
    const agora = new Date("2026-09-28T13:00:00Z");
    const turno = (n: number) => [
      { role: "user" as const, content: `u${n}` },
      { role: "assistant" as const, content: [{ type: "tool_use" as const, id: `t${n}`, name: "marcar", input: { n } }] },
      { role: "user" as const, content: [{ type: "tool_result" as const, tool_use_id: `t${n}`, content: '{"ok":true}' }] },
      { role: "assistant" as const, content: `a${n}` },
    ];
    await h.salvarTurno(turno(1), agora);
    await h.salvarTurno(turno(2), agora);
    await h.salvarTurno(turno(3), agora);
    // O limite é em turnos inteiros: nunca corta uma chamada de ferramenta do seu resultado.
    expect(await h.carregar(2)).toEqual([...turno(2), ...turno(3)]);
    expect(await h.carregar(10)).toHaveLength(12);
  });

  it("lembra se uma mensagem já alterou a agenda", async () => {
    await h.registrarRecebida("wamid.9", new Date("2026-09-28T13:00:00Z"));
    expect(await h.houveAlteracao("wamid.9")).toBe(false);
    await h.marcarAlteracao("wamid.9");
    expect(await h.houveAlteracao("wamid.9")).toBe(true);
    expect(await h.houveAlteracao("wamid.inexistente")).toBe(false);
  });
});
