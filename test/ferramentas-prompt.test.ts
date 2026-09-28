import { describe, expect, it, vi } from "vitest";
import { executarFerramenta, FERRAMENTAS, FERRAMENTAS_QUE_ALTERAM } from "../src/assistente/ferramentas";
import { montarSistema } from "../src/assistente/prompt";
import type { OperacoesAgenda } from "../src/agenda/servico";

function agendaFalsa(): OperacoesAgenda {
  return {
    consultar: vi.fn(async () => ({ ok: true as const, agendamentos: [] })),
    livres: vi.fn(async () => ({ ok: true as const, livres: [] })),
    marcar: vi.fn(async () => ({ ok: false as const, erro: "x" })),
    remarcar: vi.fn(async () => ({ ok: false as const, erro: "x" })),
    desmarcar: vi.fn(async () => ({ ok: false as const, erro: "x" })),
    desfazer: vi.fn(async () => ({ ok: true as const, descricao: "feito" })),
    atualizar: vi.fn(async () => ({ ok: false as const, erro: "x" })),
  };
}

describe("ferramentas", () => {
  it("declara as sete ferramentas com schema de objeto", () => {
    expect(FERRAMENTAS.map((f) => f.name).sort()).toEqual(
      ["atualizar", "consultar_agenda", "desfazer", "desmarcar", "horarios_livres", "marcar", "remarcar"],
    );
    for (const f of FERRAMENTAS) expect(f.input_schema.type).toBe("object");
    expect([...FERRAMENTAS_QUE_ALTERAM].sort()).toEqual(["atualizar", "desfazer", "desmarcar", "marcar", "remarcar"]);
  });

  it("encaminha cada ferramenta para a operação certa", async () => {
    const a = agendaFalsa();
    await executarFerramenta(a, "consultar_agenda", { data_inicio: "2026-10-02", data_fim: "2026-10-02" });
    await executarFerramenta(a, "horarios_livres", { data: "2026-10-02", duracao_min: 60 });
    await executarFerramenta(a, "marcar", { cliente: "Ana", servico: "escova" });
    await executarFerramenta(a, "remarcar", { id: 1 });
    await executarFerramenta(a, "desmarcar", { id: 1 });
    await executarFerramenta(a, "atualizar", { id: 1, servico: "unha" });
    expect(a.atualizar).toHaveBeenCalledWith({ id: 1, servico: "unha" });
    expect(await executarFerramenta(a, "desfazer", {})).toEqual({ ok: true, descricao: "feito" });
    expect(a.consultar).toHaveBeenCalledWith({ data_inicio: "2026-10-02", data_fim: "2026-10-02" });
    expect(a.livres).toHaveBeenCalledOnce();
    expect(a.marcar).toHaveBeenCalledWith({ cliente: "Ana", servico: "escova" });
    expect(a.remarcar).toHaveBeenCalledOnce();
    expect(a.desmarcar).toHaveBeenCalledOnce();
  });

  it("marcar sem o campo serviço não marca: manda perguntar (como a duração)", async () => {
    const a = agendaFalsa();
    const r = await executarFerramenta(a, "marcar", { cliente: "Joana", data: "2026-09-29", hora: "10:00", duracao_min: 60 });
    expect(r).toMatchObject({ ok: false, erro: expect.stringContaining("Quer adicionar o serviço?") });
    expect(a.marcar).not.toHaveBeenCalled();
  });

  it("marcar com serviço vazio (ela não quer) ou bloqueio sem serviço segue normalmente", async () => {
    const a = agendaFalsa();
    await executarFerramenta(a, "marcar", { cliente: "Joana", data: "2026-09-29", hora: "10:00", duracao_min: 60, servico: "" });
    await executarFerramenta(a, "marcar", { cliente: "Médico", data: "2026-09-29", hora: "08:00", duracao_min: 720, tipo: "bloqueio" });
    expect(a.marcar).toHaveBeenCalledTimes(2);
  });

  it("responde erro para ferramenta desconhecida ou entrada nula", async () => {
    expect(await executarFerramenta(agendaFalsa(), "apagar_tudo", {})).toEqual({ ok: false, erro: "Ferramenta desconhecida: apagar_tudo" });
    const a = agendaFalsa();
    await executarFerramenta(a, "consultar_agenda", null);
    expect(a.consultar).toHaveBeenCalledWith({});
  });
});

describe("montarSistema", () => {
  const sistema = montarSistema({ agora: new Date("2026-09-28T13:00:00Z"), janelaInicio: "08:00", janelaFim: "20:00" });

  it("informa agora e o calendário dos próximos dias", () => {
    expect(sistema).toContain("Agora: segunda-feira, 28/09/2026, 10:00");
    expect(sistema).toContain("- segunda-feira, 28/09/2026 = 2026-09-28 (hoje)");
    expect(sistema).toContain("- terça-feira, 29/09/2026 = 2026-09-29 (amanhã)");
    expect(sistema).toContain("- sexta-feira, 02/10/2026 = 2026-10-02");
    expect(sistema).toContain("- domingo, 11/10/2026 = 2026-10-11");
    expect(sistema).not.toContain("2026-10-12");
  });

  it("inclui a janela e as regras principais", () => {
    expect(sistema).toContain("08:00 às 20:00");
    expect(sistema).toContain("confirmado_sobreposicao");
    expect(sistema).toContain("[Mensagem encaminhada de uma cliente]");
    expect(sistema).toContain("[Áudio transcrito]");
  });

  it("pede a próxima ocorrência futura e confirma horário de hoje que já passou", () => {
    const sistema = montarSistema({ agora: new Date("2026-09-28T13:00:00Z"), janelaInicio: "08:00", janelaFim: "20:00" });
    expect(sistema).toContain("próxima ocorrência futura");
    expect(sistema).toContain("já passou");
  });
});

describe("regras novas do prompt", () => {
  const sistema = montarSistema({ agora: new Date("2026-09-28T13:00:00Z"), janelaInicio: "08:00", janelaFim: "20:00" });

  it("pergunta se quer adicionar o serviço quando ela não informar", () => {
    expect(sistema).toContain("Quer adicionar o serviço?");
  });

  it("edita com atualizar em vez de desmarcar e marcar de novo", () => {
    expect(sistema).toContain('"atualizar"');
    expect(sistema).toContain("Nunca desmarque e marque de novo para editar");
  });

  it("permite marcar fora do horário padrão, repassando o aviso", () => {
    expect(sistema).toContain("qualquer horário");
    expect(sistema).toContain('"aviso"');
  });
});
