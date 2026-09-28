import { describe, expect, it } from "vitest";
import { conflitos, horariosLivres, sobrepoe } from "../src/agenda/regras";
import type { Agendamento } from "../src/agenda/tipos";

const D = "2026-10-02";
const iso = (hora: string) => `${D}T${hora}:00-03:00`;

function ag(id: number, inicio: string, fim: string, situacao: Agendamento["situacao"] = "marcado"): Agendamento {
  return {
    id,
    cliente: `Cliente ${id}`,
    inicio: iso(inicio),
    fim: iso(fim),
    servico: null,
    observacao: null,
    tipo: "atendimento",
    situacao,
    criado_em: "",
    atualizado_em: "",
  };
}

const base = { data: D, janelaInicio: "08:00", janelaFim: "20:00" };
const horas = (xs: { inicio: string; fim: string }[]) => xs.map((x) => `${x.inicio.slice(11, 16)}-${x.fim.slice(11, 16)}`);

describe("sobrepoe", () => {
  it("considera encostar como não sobreposto", () => {
    expect(sobrepoe({ inicio: iso("10:00"), fim: iso("11:00") }, { inicio: iso("11:00"), fim: iso("12:00") })).toBe(false);
    expect(sobrepoe({ inicio: iso("10:00"), fim: iso("11:00") }, { inicio: iso("10:30"), fim: iso("12:00") })).toBe(true);
  });
});

describe("conflitos", () => {
  it("ignora cancelados e o próprio agendamento", () => {
    const existentes = [ag(1, "14:00", "15:00"), ag(2, "14:30", "15:30", "cancelado"), ag(3, "14:15", "14:45")];
    const novo = { inicio: iso("14:00"), fim: iso("15:00") };
    expect(conflitos(novo, existentes, 3).map((a) => a.id)).toEqual([1]);
  });
});

describe("horariosLivres", () => {
  it("dia vazio devolve a janela inteira", () => {
    expect(horas(horariosLivres({ ...base, duracaoMin: 60 }, []))).toEqual(["08:00-20:00"]);
  });

  it("devolve os buracos entre agendamentos", () => {
    const ocupados = [ag(1, "14:00", "15:30"), ag(2, "10:00", "11:00")];
    expect(horas(horariosLivres({ ...base, duracaoMin: 60 }, ocupados))).toEqual([
      "08:00-10:00",
      "11:00-14:00",
      "15:30-20:00",
    ]);
  });

  it("descarta buracos menores que a duração", () => {
    const ocupados = [ag(1, "10:00", "11:00"), ag(2, "14:00", "15:30")];
    expect(horas(horariosLivres({ ...base, duracaoMin: 180 }, ocupados))).toEqual(["11:00-14:00", "15:30-20:00"]);
  });

  it("respeita a faixa pedida", () => {
    const ocupados = [ag(1, "10:00", "11:00"), ag(2, "14:00", "15:30")];
    expect(
      horas(horariosLivres({ ...base, duracaoMin: 60, faixaInicio: "12:00", faixaFim: "18:00" }, ocupados)),
    ).toEqual(["12:00-14:00", "15:30-18:00"]);
  });

  it("lida com agendamentos sobrepostos entre si", () => {
    const ocupados = [ag(1, "09:00", "11:00"), ag(2, "10:00", "12:00")];
    expect(horas(horariosLivres({ ...base, duracaoMin: 30 }, ocupados))).toEqual(["08:00-09:00", "12:00-20:00"]);
  });

  it("faixa fora da janela não devolve nada", () => {
    expect(horariosLivres({ ...base, duracaoMin: 30, faixaInicio: "21:00", faixaFim: "22:00" }, [])).toEqual([]);
  });

  it("não oferece horários antes do instante informado", () => {
    const ocupados = [ag(1, "11:00", "12:00")];
    expect(horas(horariosLivres({ ...base, duracaoMin: 30, aPartirDe: iso("10:20") }, ocupados))).toEqual([
      "10:20-11:00",
      "12:00-20:00",
    ]);
    expect(horariosLivres({ ...base, duracaoMin: 30, aPartirDe: iso("20:30") }, [])).toEqual([]);
  });
});
