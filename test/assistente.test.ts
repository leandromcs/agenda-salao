import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { ErroAssistente, responder, RESPOSTA_SEM_TEXTO, type ClienteClaude } from "../src/assistente/assistente";
import type { OperacoesAgenda } from "../src/agenda/servico";

function msg(stop_reason: string, content: unknown[]): Anthropic.Message {
  return {
    id: "msg_teste",
    type: "message",
    role: "assistant",
    model: "teste",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as Anthropic.Message;
}
const texto = (t: string) => msg("end_turn", [{ type: "text", text: t }]);
const usar = (id: string, name: string, input: unknown) => msg("tool_use", [{ type: "tool_use", id, name, input }]);

function claudeFalso(respostas: (Anthropic.Message | Error)[]) {
  const create = vi.fn(async (_p: Anthropic.MessageCreateParamsNonStreaming) => {
    const r = respostas.shift();
    if (!r) throw new Error("sem resposta");
    if (r instanceof Error) throw r;
    return r;
  });
  return { cliente: { messages: { create } } as ClienteClaude, create };
}

function agendaFalsa(): OperacoesAgenda {
  return {
    consultar: vi.fn(async () => ({ ok: true as const, agendamentos: [] })),
    livres: vi.fn(async () => ({ ok: true as const, livres: [] })),
    marcar: vi.fn(async () => ({
      ok: true as const,
      agendamento: { id: 1, cliente: "Ana", data: "2026-10-02", dia: "sex 02/10", inicio: "14:00", fim: "15:00", servico: null, tipo: "atendimento" as const },
    })),
    remarcar: vi.fn(async () => ({ ok: false as const, erro: "x" })),
    desmarcar: vi.fn(async () => ({ ok: false as const, erro: "x" })),
    desfazer: vi.fn(async () => ({ ok: false as const, erro: "nada" })),
  };
}

const base = { modelo: "claude-haiku-4-5", sistema: "SISTEMA", historico: [], entrada: "marca a Ana" };

describe("responder", () => {
  it("devolve texto direto quando não há ferramenta", async () => {
    const { cliente, create } = claudeFalso([texto("Oi!")]);
    const r = await responder({ ...base, cliente, agenda: agendaFalsa() });
    expect(r).toEqual({
      texto: "Oi!",
      houveAlteracao: false,
      chamadas: [],
      registro: [
        { role: "user", content: "marca a Ana" },
        { role: "assistant", content: "Oi!" },
      ],
    });
    const p = create.mock.calls[0]![0];
    expect(p.model).toBe("claude-haiku-4-5");
    expect(p.system).toBe("SISTEMA");
    expect(p.messages).toEqual([{ role: "user", content: "marca a Ana" }]);
    expect(p.tools?.length).toBe(6);
  });

  it("inclui o histórico completo (com as chamadas de ferramenta) antes da entrada", async () => {
    const { cliente, create } = claudeFalso([texto("ok")]);
    const historico: Anthropic.MessageParam[] = [
      { role: "user", content: "marca a Joana amanhã 10h, 1h" },
      { role: "assistant", content: [{ type: "tool_use", id: "h1", name: "marcar", input: { cliente: "Joana" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "h1", content: '{"ok":true}' }] },
      { role: "assistant", content: "✅ Marquei Joana" },
    ];
    await responder({ ...base, historico, cliente, agenda: agendaFalsa() });
    expect(create.mock.calls[0]![0].messages).toEqual([...historico, { role: "user", content: "marca a Ana" }]);
  });

  it("devolve o registro do turno com as chamadas e resultados das ferramentas", async () => {
    const { cliente } = claudeFalso([usar("t1", "marcar", { cliente: "Ana" }), texto("✅ Marquei Ana")]);
    const r = await responder({ ...base, cliente, agenda: agendaFalsa() });
    expect(r.registro).toEqual([
      { role: "user", content: "marca a Ana" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "marcar", input: { cliente: "Ana" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: expect.stringContaining('"ok":true') }] },
      { role: "assistant", content: "✅ Marquei Ana" },
    ]);
  });

  it("executa ferramentas, devolve os resultados e marca alteração", async () => {
    const agenda = agendaFalsa();
    const { cliente, create } = claudeFalso([usar("t1", "marcar", { cliente: "Ana" }), texto("✅ Marquei Ana")]);
    const r = await responder({ ...base, cliente, agenda });
    expect(r.texto).toBe("✅ Marquei Ana");
    expect(r.houveAlteracao).toBe(true);
    expect(r.chamadas).toEqual([{ nome: "marcar", entrada: { cliente: "Ana" } }]);
    const segunda = create.mock.calls[1]![0].messages;
    const resultado = segunda[segunda.length - 1]!;
    expect(resultado.role).toBe("user");
    expect(resultado.content).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: expect.stringContaining('"ok":true') },
    ]);
  });

  it("consulta não conta como alteração, e alteração que falhou também não", async () => {
    const agenda = agendaFalsa();
    const { cliente } = claudeFalso([usar("t1", "consultar_agenda", {}), usar("t2", "desfazer", {}), texto("nada")]);
    const r = await responder({ ...base, cliente, agenda });
    expect(r.houveAlteracao).toBe(false);
  });

  it("devolve erro da ferramenta como tool_result com is_error", async () => {
    const agenda = agendaFalsa();
    vi.mocked(agenda.consultar).mockRejectedValueOnce(new Error("D1 fora"));
    const { cliente, create } = claudeFalso([usar("t1", "consultar_agenda", {}), texto("desculpe")]);
    await responder({ ...base, cliente, agenda });
    const msgs = create.mock.calls[1]![0].messages;
    expect(msgs[msgs.length - 1]!.content).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: "Erro interno ao executar consultar_agenda.", is_error: true },
    ]);
  });

  it("para depois do máximo de iterações", async () => {
    const { cliente } = claudeFalso([usar("t1", "consultar_agenda", {}), usar("t2", "consultar_agenda", {})]);
    const r = await responder({ ...base, cliente, agenda: agendaFalsa(), maxIteracoes: 2 });
    expect(r.texto).toBe(RESPOSTA_SEM_TEXTO);
  });

  it("falha da API vira ErroAssistente informando se já houve alteração", async () => {
    const { cliente } = claudeFalso([usar("t1", "marcar", { cliente: "Ana" }), new Error("529 overloaded")]);
    const erro = await responder({ ...base, cliente, agenda: agendaFalsa() }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroAssistente);
    expect((erro as ErroAssistente).houveAlteracao).toBe(true);
  });

  it("avisa cada alteração bem-sucedida assim que acontece", async () => {
    const aoAlterar = vi.fn(async () => undefined);
    const { cliente } = claudeFalso([
      usar("t1", "consultar_agenda", {}),
      usar("t2", "marcar", { cliente: "Ana" }),
      texto("ok"),
    ]);
    await responder({ ...base, cliente, agenda: agendaFalsa(), aoAlterar });
    expect(aoAlterar).toHaveBeenCalledOnce();
  });
});
