import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { OperacoesAgenda } from "../src/agenda/servico";
import { RESPOSTA_TIPO_NAO_SUPORTADO } from "../src/conversa/normalizador";
import { processarMensagem, RESPOSTA_ERRO, RESPOSTA_ERRO_APOS_ALTERACAO, type DepsProcessamento } from "../src/processar";
import type { MensagemRecebida } from "../src/whatsapp/tipos";

function msg(stop_reason: string, content: unknown[]): Anthropic.Message {
  return {
    id: "m",
    type: "message",
    role: "assistant",
    model: "t",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as Anthropic.Message;
}

function montar(respostasClaude: (Anthropic.Message | Error)[]) {
  const create = vi.fn(async () => {
    const r = respostasClaude.shift();
    if (!r) throw new Error("sem resposta");
    if (r instanceof Error) throw r;
    return r;
  });
  const agenda: OperacoesAgenda = {
    consultar: vi.fn(async () => ({ ok: true as const, agendamentos: [] })),
    livres: vi.fn(async () => ({ ok: true as const, livres: [] })),
    marcar: vi.fn(async () => ({
      ok: true as const,
      agendamento: { id: 1, cliente: "Ana", data: "2026-10-02", dia: "sex 02/10", inicio: "14:00", fim: "15:00", servico: null, tipo: "atendimento" as const },
    })),
    remarcar: vi.fn(async () => ({ ok: false as const, erro: "x" })),
    desmarcar: vi.fn(async () => ({ ok: false as const, erro: "x" })),
    desfazer: vi.fn(async () => ({ ok: false as const, erro: "x" })),
    atualizar: vi.fn(async () => ({ ok: false as const, erro: "x" })),
  };
  const deps: DepsProcessamento = {
    historico: {
      carregar: vi.fn(async () => []),
      salvarTurno: vi.fn(async () => undefined),
      marcarAlteracao: vi.fn(async () => undefined),
      houveAlteracao: vi.fn(async () => false),
    },
    agenda,
    whatsapp: { enviarTexto: vi.fn(async () => undefined), baixarMidia: vi.fn(async () => new ArrayBuffer(1)) },
    transcritor: { transcrever: vi.fn(async () => "oi") },
    claude: { messages: { create } },
    modelo: "claude-haiku-4-5",
    relogio: () => new Date("2026-09-28T13:00:00Z"),
    janelaInicio: "08:00",
    janelaFim: "20:00",
    limiteHistorico: 20,
  };
  return { deps, create, agenda };
}

const texto: MensagemRecebida = { id: "w1", de: "5511988887777", tipo: "texto", texto: "oi", encaminhada: false };

describe("processarMensagem", () => {
  it("responde e salva o turno", async () => {
    const { deps } = montar([msg("end_turn", [{ type: "text", text: "Oi! Em que posso ajudar?" }])]);
    expect(await processarMensagem(texto, deps, 1, 3)).toBe("respondida");
    expect(deps.whatsapp.enviarTexto).toHaveBeenCalledWith("5511988887777", "Oi! Em que posso ajudar?");
    expect(deps.historico.salvarTurno).toHaveBeenCalledWith(
      [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Oi! Em que posso ajudar?" },
      ],
      expect.any(Date),
    );
  });

  it("responde direto quando o tipo não é suportado, sem chamar o Claude", async () => {
    const { deps, create } = montar([]);
    await processarMensagem({ ...texto, tipo: "outro", texto: undefined }, deps, 1, 3);
    expect(deps.whatsapp.enviarTexto).toHaveBeenCalledWith("5511988887777", RESPOSTA_TIPO_NAO_SUPORTADO);
    expect(create).not.toHaveBeenCalled();
  });

  it("pede nova tentativa se a IA falhou sem alterar nada", async () => {
    const { deps } = montar([new Error("overloaded")]);
    expect(await processarMensagem(texto, deps, 1, 3)).toBe("tentar-de-novo");
    expect(deps.whatsapp.enviarTexto).not.toHaveBeenCalled();
    expect(deps.historico.salvarTurno).not.toHaveBeenCalled();
  });

  it("na última tentativa avisa o erro", async () => {
    const { deps } = montar([new Error("overloaded")]);
    expect(await processarMensagem(texto, deps, 3, 3)).toBe("respondida");
    expect(deps.whatsapp.enviarTexto).toHaveBeenCalledWith("5511988887777", RESPOSTA_ERRO);
  });

  it("não tenta de novo se já marcou algo antes da falha (evita marcação em dobro)", async () => {
    const { deps, agenda } = montar([
      msg("tool_use", [{ type: "tool_use", id: "t1", name: "marcar", input: { cliente: "Ana" } }]),
      new Error("overloaded"),
    ]);
    expect(await processarMensagem(texto, deps, 1, 3)).toBe("respondida");
    expect(agenda.marcar).toHaveBeenCalledOnce();
    expect(deps.whatsapp.enviarTexto).toHaveBeenCalledWith("5511988887777", RESPOSTA_ERRO_APOS_ALTERACAO);
  });

  it("se o envio falhar sem alteração, tenta de novo sem salvar o turno", async () => {
    const { deps } = montar([msg("end_turn", [{ type: "text", text: "Oi" }])]);
    vi.mocked(deps.whatsapp.enviarTexto).mockRejectedValueOnce(new Error("WhatsApp 500"));
    expect(await processarMensagem(texto, deps, 1, 3)).toBe("tentar-de-novo");
    expect(deps.historico.salvarTurno).not.toHaveBeenCalled();
  });

  it("se o envio falhar depois de uma alteração, salva o turno e não repete", async () => {
    const { deps } = montar([
      msg("tool_use", [{ type: "tool_use", id: "t1", name: "marcar", input: { cliente: "Ana" } }]),
      msg("end_turn", [{ type: "text", text: "✅ Marquei Ana" }]),
    ]);
    vi.mocked(deps.whatsapp.enviarTexto).mockRejectedValueOnce(new Error("WhatsApp 500"));
    expect(await processarMensagem(texto, deps, 1, 3)).toBe("respondida");
    expect(deps.historico.salvarTurno).toHaveBeenCalledOnce();
  });

  it("registra no banco, na hora, que a mensagem alterou a agenda", async () => {
    const { deps } = montar([
      msg("tool_use", [{ type: "tool_use", id: "t1", name: "marcar", input: { cliente: "Ana" } }]),
      msg("end_turn", [{ type: "text", text: "✅ Marquei Ana" }]),
    ]);
    await processarMensagem(texto, deps, 1, 3);
    expect(deps.historico.marcarAlteracao).toHaveBeenCalledWith("w1");
  });

  it("nova tentativa de mensagem que já alterou a agenda não chama o Claude de novo", async () => {
    const { deps, create } = montar([msg("end_turn", [{ type: "text", text: "não deveria" }])]);
    vi.mocked(deps.historico.houveAlteracao).mockResolvedValueOnce(true);
    expect(await processarMensagem(texto, deps, 2, 3)).toBe("respondida");
    expect(create).not.toHaveBeenCalled();
    expect(deps.whatsapp.enviarTexto).toHaveBeenCalledWith("5511988887777", RESPOSTA_ERRO_APOS_ALTERACAO);
  });

  it("se salvar o turno falhar depois de uma alteração, não pede nova tentativa", async () => {
    const { deps } = montar([
      msg("tool_use", [{ type: "tool_use", id: "t1", name: "marcar", input: { cliente: "Ana" } }]),
      msg("end_turn", [{ type: "text", text: "✅ Marquei Ana" }]),
    ]);
    vi.mocked(deps.historico.salvarTurno).mockRejectedValueOnce(new Error("D1 fora"));
    expect(await processarMensagem(texto, deps, 1, 3)).toBe("respondida");
  });

  it("se o aviso de erro falhar depois de uma alteração, não lança (a fila não repete)", async () => {
    const { deps } = montar([
      msg("tool_use", [{ type: "tool_use", id: "t1", name: "marcar", input: { cliente: "Ana" } }]),
      new Error("overloaded"),
    ]);
    vi.mocked(deps.whatsapp.enviarTexto).mockRejectedValueOnce(new Error("WhatsApp 500"));
    expect(await processarMensagem(texto, deps, 1, 3)).toBe("respondida");
  });
});
