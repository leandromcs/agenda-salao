import { applyD1Migrations } from "cloudflare:test";
import { testEnv } from "./ambiente";

await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
