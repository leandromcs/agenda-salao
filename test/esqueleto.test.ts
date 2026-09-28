import { describe, expect, it } from "vitest";
import { testEnv } from "./ambiente";

describe("esqueleto", () => {
  it("aplica as migrações no D1 de teste", async () => {
    const linha = await testEnv.DB.prepare("SELECT COUNT(*) AS n FROM agendamentos").first<{ n: number }>();
    expect(linha?.n).toBe(0);
  });
});
