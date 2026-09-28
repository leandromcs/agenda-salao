import type { MensagemRecebida } from "./whatsapp/tipos";

export interface Env {
  DB: D1Database;
  FILA: Queue<MensagemRecebida>;
  AI: Ai;

  // Segredos (wrangler secret put)
  WHATSAPP_TOKEN: string;
  WHATSAPP_APP_SECRET: string;
  WEBHOOK_VERIFY_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  NUMERO_DELA: string;
  NUMERO_ADMIN: string;

  // Variáveis (wrangler.jsonc)
  WHATSAPP_PHONE_NUMBER_ID: string;
  GRAPH_API_VERSAO: string;
  MODELO_CLAUDE: string;
  JANELA_INICIO: string;
  JANELA_FIM: string;
  HISTORICO_TURNOS: string;
  MODELO_RESUMO: string;
  MODELO_ALERTA: string;
}
