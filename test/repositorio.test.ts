import { beforeEach, describe, expect, it } from "vitest";
import { AgendaRepositorio, normalizarBusca, type NovoAgendamento } from "../src/agenda/repositorio";
import { limparBanco, testEnv } from "./ambiente";

const AGORA = "2026-09-28T13:00:00.000Z";
const iso = (data: string, hora: string) => `${data}T${hora}:00-03:00`;

function novo(cliente: string, data: string, inicio: string, fim: string): NovoAgendamento {
  return { cliente, inicio: iso(data, inicio), fim: iso(data, fim), servico: "escova", observacao: null, tipo: "atendimento" };
}

describe("AgendaRepositorio", () => {
  let repo: AgendaRepositorio;

  beforeEach(async () => {
    await limparBanco();
    repo = new AgendaRepositorio(testEnv.DB);
  });

  it("normaliza nomes para busca", () => {
    expect(normalizarBusca("  Letícia  ")).toBe("leticia");
  });

  it("marca e registra a alteração", async () => {
    const a = await repo.marcar(novo("Maria", "2026-10-02", "14:00", "15:00"), AGORA);
    expect(a.id).toBeGreaterThan(0);
    expect(a.situacao).toBe("marcado");
    expect(a).not.toHaveProperty("cliente_busca");
    const alt = await repo.ultimaAlteracaoPendente();
    expect(alt).toMatchObject({ agendamento_id: a.id, acao: "marcar", antes: null, desfeita: 0 });
  });

  it("lista só marcados que sobrepõem o intervalo, em ordem", async () => {
    const b = await repo.marcar(novo("Bia", "2026-10-02", "16:00", "17:00"), AGORA);
    const a = await repo.marcar(novo("Ana", "2026-10-02", "09:00", "10:00"), AGORA);
    const c = await repo.marcar(novo("Carla", "2026-10-03", "09:00", "10:00"), AGORA);
    await repo.desmarcar(c.id, c, AGORA);
    await repo.marcar(novo("Dora", "2026-10-03", "11:00", "12:00"), AGORA);
    const lista = await repo.listarEntre(iso("2026-10-02", "00:00"), iso("2026-10-03", "00:00"));
    expect(lista.map((x) => x.id)).toEqual([a.id, b.id]);
  });

  it("busca por nome sem se importar com acento e caixa", async () => {
    await repo.marcar(novo("Letícia Souza", "2026-10-02", "14:00", "15:00"), AGORA);
    await repo.marcar(novo("Maria", "2026-10-02", "15:00", "16:00"), AGORA);
    const lista = await repo.listarEntre(iso("2026-10-01", "00:00"), iso("2026-10-10", "00:00"), "leticia");
    expect(lista.map((x) => x.cliente)).toEqual(["Letícia Souza"]);
  });

  it("remarca guardando o estado anterior", async () => {
    const a = await repo.marcar(novo("Maria", "2026-10-02", "14:00", "15:00"), AGORA);
    const r = await repo.remarcar(a.id, iso("2026-10-02", "16:00"), iso("2026-10-02", "17:00"), a, AGORA);
    expect(r.inicio).toBe(iso("2026-10-02", "16:00"));
    const alt = await repo.ultimaAlteracaoPendente();
    expect(alt?.acao).toBe("remarcar");
    expect(JSON.parse(alt!.antes!).inicio).toBe(iso("2026-10-02", "14:00"));
  });

  it("desfaz em pilha: remarcação, depois marcação", async () => {
    const a = await repo.marcar(novo("Maria", "2026-10-02", "14:00", "15:00"), AGORA);
    await repo.remarcar(a.id, iso("2026-10-02", "16:00"), iso("2026-10-02", "17:00"), a, AGORA);

    const volta = await repo.desfazer((await repo.ultimaAlteracaoPendente())!, AGORA);
    expect(volta.inicio).toBe(iso("2026-10-02", "14:00"));

    const cancelada = await repo.desfazer((await repo.ultimaAlteracaoPendente())!, AGORA);
    expect(cancelada.situacao).toBe("cancelado");
    expect(await repo.ultimaAlteracaoPendente()).toBeNull();
  });

  it("desfazer um desmarcar reativa o agendamento", async () => {
    const a = await repo.marcar(novo("Maria", "2026-10-02", "14:00", "15:00"), AGORA);
    await repo.desmarcar(a.id, a, AGORA);
    expect((await repo.buscar(a.id))?.situacao).toBe("cancelado");
    const reativada = await repo.desfazer((await repo.ultimaAlteracaoPendente())!, AGORA);
    expect(reativada.situacao).toBe("marcado");
  });

  it("atualiza campos guardando o estado anterior, e desfazer restaura tudo", async () => {
    const a = await repo.marcar({ ...novo("Maria", "2026-09-29", "22:00", "23:00"), servico: null }, AGORA);
    const r = await repo.atualizar(
      a.id,
      { cliente: "Maria Souza", servico: "unha", observacao: "cliente nova", fim: iso("2026-09-29", "23:30") },
      a,
      AGORA,
    );
    expect(r).toMatchObject({ cliente: "Maria Souza", servico: "unha", observacao: "cliente nova", fim: iso("2026-09-29", "23:30") });
    expect((await repo.ultimaAlteracaoPendente())?.acao).toBe("atualizar");
    // a busca sem acento/caixa acompanha o nome novo
    const achados = await repo.listarEntre(iso("2026-09-29", "00:00"), iso("2026-09-30", "00:00"), "souza");
    expect(achados.map((x) => x.id)).toEqual([a.id]);

    const volta = await repo.desfazer((await repo.ultimaAlteracaoPendente())!, AGORA);
    expect(volta).toMatchObject({ cliente: "Maria", servico: null, observacao: null, fim: iso("2026-09-29", "23:00") });
    expect(await repo.listarEntre(iso("2026-09-29", "00:00"), iso("2026-09-30", "00:00"), "souza")).toEqual([]);
  });
});
