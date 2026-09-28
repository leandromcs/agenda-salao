import { describe, expect, it, vi } from "vitest";
import type { Agendamento } from "../src/agenda/tipos";
import { enviarResumoNoturno, linhaItem, montarResumo, type DepsResumo } from "../src/resumo/resumo";

function ag(cliente: string, inicio: string, fim: string, extra: Partial<Agendamento> = {}): Agendamento {
  return {
    id: 1,
    cliente,
    inicio: `2026-09-29T${inicio}:00-03:00`,
    fim: `2026-09-29T${fim}:00-03:00`,
    servico: null,
    observacao: null,
    tipo: "atendimento",
    situacao: "marcado",
    criado_em: "",
    atualizado_em: "",
    ...extra,
  };
}

describe("montarResumo", () => {
  it("formata cada item", () => {
    expect(linhaItem(ag("Maria", "09:00", "10:00", { servico: "escova" }))).toBe("09:00–10:00 Maria — escova");
    expect(linhaItem(ag("Ana", "11:00", "12:00"))).toBe("11:00–12:00 Ana");
    expect(linhaItem(ag("Médico", "14:00", "16:00", { tipo: "bloqueio" }))).toBe("14:00–16:00 Médico (bloqueio)");
  });

  it("monta texto com uma linha por item e parâmetros de linha única", () => {
    const r = montarResumo("2026-09-29", [ag("Maria", "09:00", "10:00", { servico: "escova" }), ag("Ana", "11:00", "12:00")]);
    expect(r.texto).toBe("📒 Amanhã, ter 29/09\n\n09:00–10:00 Maria — escova\n11:00–12:00 Ana");
    expect(r.parametros).toEqual(["ter 29/09", "09:00–10:00 Maria — escova • 11:00–12:00 Ana"]);
  });

  it("dia vazio", () => {
    const r = montarResumo("2026-09-29", []);
    expect(r.texto).toBe("📒 Amanhã, ter 29/09: você não tem atendimentos.");
    expect(r.parametros).toEqual(["ter 29/09", "nenhum atendimento"]);
  });

  it("parâmetros nunca têm quebra de linha nem passam de 900 caracteres", () => {
    const muitos = Array.from({ length: 40 }, (_, i) => ag(`Cliente\ncom nome comprido número ${i}`, "09:00", "10:00", { servico: "escova    progressiva" }));
    const [, linha] = montarResumo("2026-09-29", muitos).parametros;
    expect(linha).not.toMatch(/[\n\t]/);
    expect(linha).not.toMatch(/ {4,}/);
    expect(linha.length).toBeLessThanOrEqual(900);
    expect(linha).toMatch(/… e mais \d+$/);
  });
});

function deps(ultima: Date | null, falhasEnvio = 0): DepsResumo & { esperas: number[] } {
  const esperas: number[] = [];
  let falhas = falhasEnvio;
  const enviar = vi.fn(async () => {
    if (falhas-- > 0) throw new Error("WhatsApp 500");
  });
  return {
    repo: { listarEntre: vi.fn(async () => [ag("Maria", "09:00", "10:00")]) },
    whatsapp: { enviarTexto: enviar, enviarModelo: vi.fn(async (para: string) => { if (para === "DELA") await enviar(); }) },
    historico: { ultimaDelaEm: vi.fn(async () => ultima) },
    numeroDela: "DELA",
    numeroAdmin: "ADMIN",
    modeloResumo: "resumo_amanha",
    modeloAlerta: "alerta_sistema",
    relogio: () => new Date("2026-09-28T23:00:00Z"), // 20:00 em Brasília
    esperar: async (ms) => { esperas.push(ms); },
    esperas,
  };
}

describe("enviarResumoNoturno", () => {
  it("consulta o dia seguinte inteiro", async () => {
    const d = deps(null);
    await enviarResumoNoturno(d);
    expect(d.repo.listarEntre).toHaveBeenCalledWith("2026-09-29T00:00:00-03:00", "2026-09-30T00:00:00-03:00");
  });

  it("usa texto livre se ela escreveu nas últimas 23h", async () => {
    const d = deps(new Date("2026-09-28T12:00:00Z"));
    expect(await enviarResumoNoturno(d)).toBe("enviado");
    expect(d.whatsapp.enviarTexto).toHaveBeenCalledWith("DELA", expect.stringContaining("09:00–10:00 Maria"));
    expect(d.whatsapp.enviarModelo).not.toHaveBeenCalled();
  });

  it("usa o modelo se a janela está fechada ou ela nunca escreveu", async () => {
    for (const ultima of [new Date("2026-09-27T20:00:00Z"), null]) {
      const d = deps(ultima);
      await enviarResumoNoturno(d);
      expect(d.whatsapp.enviarModelo).toHaveBeenCalledWith("DELA", "resumo_amanha", ["ter 29/09", "09:00–10:00 Maria"]);
    }
  });

  it("tenta de novo com espera crescente", async () => {
    const d = deps(new Date("2026-09-28T12:00:00Z"), 2);
    expect(await enviarResumoNoturno(d)).toBe("enviado");
    expect(d.esperas).toEqual([5_000, 30_000]);
  });

  it("depois de 3 falhas alerta o administrador", async () => {
    const d = deps(new Date("2026-09-28T12:00:00Z"), 3);
    expect(await enviarResumoNoturno(d)).toBe("falhou");
    expect(d.whatsapp.enviarModelo).toHaveBeenCalledWith("ADMIN", "alerta_sistema", [
      expect.stringMatching(/^Falha ao enviar o resumo de ter 29\/09: .*WhatsApp 500/),
    ]);
  });
});
