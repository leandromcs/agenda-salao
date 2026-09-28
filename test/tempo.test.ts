import { describe, expect, it } from "vitest";
import {
  agoraIso,
  dataCurta,
  dataDe,
  dataExtenso,
  dataValida,
  diaDaSemana,
  hojeEm,
  horaDe,
  horaValida,
  minutosEntre,
  paraIso,
  somarDias,
  somarMinutos,
} from "../src/tempo";

describe("tempo", () => {
  it("valida datas e horas", () => {
    expect(dataValida("2026-10-02")).toBe(true);
    expect(dataValida("2026-02-30")).toBe(false);
    expect(dataValida("02/10/2026")).toBe(false);
    expect(horaValida("09:05")).toBe(true);
    expect(horaValida("24:00")).toBe(false);
    expect(horaValida("9:05")).toBe(false);
  });

  it("monta ISO com offset de Brasília", () => {
    expect(paraIso("2026-10-02", "14:00")).toBe("2026-10-02T14:00:00-03:00");
    expect(() => paraIso("2026-10-02", "25:00")).toThrow();
  });

  it("soma minutos atravessando a meia-noite", () => {
    expect(somarMinutos("2026-10-03T23:30:00-03:00", 60)).toBe("2026-10-04T00:30:00-03:00");
    expect(minutosEntre("2026-10-02T14:00:00-03:00", "2026-10-02T15:30:00-03:00")).toBe(90);
  });

  it("extrai data e hora", () => {
    expect(dataDe("2026-10-02T14:00:00-03:00")).toBe("2026-10-02");
    expect(horaDe("2026-10-02T14:00:00-03:00")).toBe("14:00");
  });

  it("converte o relógio UTC para Brasília", () => {
    expect(agoraIso(new Date("2026-10-02T17:05:30Z"))).toBe("2026-10-02T14:05:00-03:00");
    // 02:00 UTC ainda é 23:00 do dia anterior em Brasília
    expect(hojeEm(new Date("2026-10-04T02:00:00Z"))).toBe("2026-10-03");
  });

  it("soma dias e sabe o dia da semana", () => {
    expect(somarDias("2026-09-30", 2)).toBe("2026-10-02");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(diaDaSemana("2026-09-28")).toBe(1);
    expect(diaDaSemana("2026-10-02")).toBe(5);
  });

  it("formata datas para exibição", () => {
    expect(dataCurta("2026-10-02")).toBe("sex 02/10");
    expect(dataCurta("2026-10-03")).toBe("sáb 03/10");
    expect(dataExtenso("2026-10-02")).toBe("sexta-feira, 02/10/2026");
  });
});
