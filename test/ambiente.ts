import type { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

export const testEnv = env as unknown as {
  DB: D1Database;
  TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1];
};

export async function limparBanco(): Promise<void> {
  await testEnv.DB.batch(
    ["alteracoes", "agendamentos", "mensagens", "recebidas"].map((tabela) =>
      testEnv.DB.prepare(`DELETE FROM ${tabela}`),
    ),
  );
}
