import type { Env } from "./env";

export default {
  async fetch(): Promise<Response> {
    return new Response("ok");
  },
} satisfies ExportedHandler<Env>;
