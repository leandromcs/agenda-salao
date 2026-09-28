import { describe, expect, it } from "vitest";
import * as modulo from "../src/index";

describe("módulo de entrada do Worker", () => {
  it("só exporta o handler padrão (o workerd recusa outras exportações que não sejam handlers)", () => {
    expect(Object.keys(modulo)).toEqual(["default"]);
    expect(Object.keys(modulo.default).sort()).toEqual(["fetch", "queue", "scheduled"]);
  });
});
