import { beforeEach, describe, expect, it } from "vitest";
import { AgendaRepositorio } from "../src/agenda/repositorio";
import { AgendaServico } from "../src/agenda/servico";
import { limparBanco, testEnv } from "./ambiente";

const relogio = () => new Date("2026-09-28T13:00:00Z");

describe("AgendaServico", () => {
  let s: AgendaServico;

  beforeEach(async () => {
    await limparBanco();
    s = new AgendaServico(new AgendaRepositorio(testEnv.DB), { janelaInicio: "08:00", janelaFim: "20:00" }, relogio);
  });

  it("marca com dados completos e devolve o resumo", async () => {
    const r = await s.marcar({ cliente: " Maria ", data: "2026-10-02", hora: "14:00", duracao_min: 60, servico: "escova" });
    expect(r).toEqual({
      ok: true,
      agendamento: {
        id: expect.any(Number),
        cliente: "Maria",
        data: "2026-10-02",
        dia: "sex 02/10",
        inicio: "14:00",
        fim: "15:00",
        servico: "escova",
        tipo: "atendimento",
      },
    });
  });

  it("recusa entradas inválidas com mensagem para o modelo", async () => {
    expect(await s.marcar({ cliente: "", data: "2026-10-02", hora: "14:00", duracao_min: 60 })).toMatchObject({ ok: false });
    expect(await s.marcar({ cliente: "Ana", data: "02/10", hora: "14:00", duracao_min: 60 })).toMatchObject({ ok: false });
    expect(await s.marcar({ cliente: "Ana", data: "2026-10-02", hora: "14h", duracao_min: 60 })).toMatchObject({ ok: false });
    expect(await s.marcar({ cliente: "Ana", data: "2026-10-02", hora: "14:00", duracao_min: 0 })).toMatchObject({ ok: false });
  });

  it("não marca em sobreposição sem confirmação, marca com confirmação", async () => {
    await s.marcar({ cliente: "Ana", data: "2026-10-02", hora: "14:30", duracao_min: 60 });
    const sem = await s.marcar({ cliente: "Bia", data: "2026-10-02", hora: "14:00", duracao_min: 60 });
    expect(sem).toMatchObject({ ok: false, conflitos: [{ cliente: "Ana", inicio: "14:30", fim: "15:30" }] });
    const com = await s.marcar({ cliente: "Bia", data: "2026-10-02", hora: "14:00", duracao_min: 60, confirmado_sobreposicao: true });
    expect(com.ok).toBe(true);
  });

  it("marca bloqueio", async () => {
    const r = await s.marcar({ cliente: "Médico", data: "2026-10-05", hora: "08:00", duracao_min: 720, tipo: "bloqueio" });
    expect(r).toMatchObject({ ok: true, agendamento: { tipo: "bloqueio", inicio: "08:00", fim: "20:00" } });
  });

  it("remarca mantendo a duração e ignorando o próprio horário", async () => {
    const m = await s.marcar({ cliente: "Ana", data: "2026-10-02", hora: "14:00", duracao_min: 90 });
    if (!m.ok) throw new Error("setup");
    const r = await s.remarcar({ id: m.agendamento.id, data: "2026-10-02", hora: "14:30" });
    expect(r).toMatchObject({ ok: true, agendamento: { inicio: "14:30", fim: "16:00" }, antes: { inicio: "14:00" } });
  });

  it("remarcar id inexistente falha", async () => {
    expect(await s.remarcar({ id: 999, data: "2026-10-02", hora: "14:00" })).toMatchObject({ ok: false });
  });

  it("desmarca e desfaz", async () => {
    const m = await s.marcar({ cliente: "Ana", data: "2026-10-02", hora: "14:00", duracao_min: 60 });
    if (!m.ok) throw new Error("setup");
    expect(await s.desmarcar({ id: m.agendamento.id })).toMatchObject({ ok: true });
    expect(await s.desmarcar({ id: m.agendamento.id })).toMatchObject({ ok: false });
    const d = await s.desfazer();
    expect(d).toEqual({ ok: true, descricao: "Ana voltou a estar marcada (sex 02/10 14:00–15:00)." });
  });

  it("desfazer sem alterações falha", async () => {
    expect(await s.desfazer()).toMatchObject({ ok: false });
  });

  it("consulta por período e por nome", async () => {
    await s.marcar({ cliente: "Letícia", data: "2026-10-02", hora: "14:00", duracao_min: 60 });
    await s.marcar({ cliente: "Ana", data: "2026-10-03", hora: "09:00", duracao_min: 60 });
    const todas = await s.consultar({ data_inicio: "2026-10-02", data_fim: "2026-10-03" });
    expect(todas.ok && todas.agendamentos.map((a) => a.cliente)).toEqual(["Letícia", "Ana"]);
    const so = await s.consultar({ data_inicio: "2026-10-01", data_fim: "2026-10-31", nome: "leticia" });
    expect(so.ok && so.agendamentos.map((a) => a.cliente)).toEqual(["Letícia"]);
    expect(await s.consultar({ data_inicio: "2026-10-03", data_fim: "2026-10-02" })).toMatchObject({ ok: false });
  });

  it("lista horários livres do dia", async () => {
    await s.marcar({ cliente: "Ana", data: "2026-10-02", hora: "10:00", duracao_min: 60 });
    const r = await s.livres({ data: "2026-10-02", duracao_min: 60, faixa_inicio: "08:00", faixa_fim: "12:00" });
    expect(r).toEqual({ ok: true, livres: [{ inicio: "08:00", fim: "10:00" }, { inicio: "11:00", fim: "12:00" }] });
  });

  it("horários livres de hoje começam agora, e dias passados não têm horário livre", async () => {
    // relógio: 2026-09-28 10:00 em Brasília
    const hoje = await s.livres({ data: "2026-09-28", duracao_min: 60 });
    expect(hoje).toEqual({ ok: true, livres: [{ inicio: "10:00", fim: "20:00" }] });
    expect(await s.livres({ data: "2026-09-27", duracao_min: 60 })).toEqual({ ok: true, livres: [] });
  });
});
