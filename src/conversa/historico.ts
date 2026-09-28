import type Anthropic from "@anthropic-ai/sdk";

export class Historico {
  constructor(private readonly db: D1Database) {}

  /** Registra o id da mensagem do WhatsApp. Devolve false se ela já tinha chegado antes. */
  async registrarRecebida(whatsappId: string, agora: Date): Promise<boolean> {
    const r = await this.db
      .prepare("INSERT OR IGNORE INTO recebidas (whatsapp_id, criado_em) VALUES (?1, ?2)")
      .bind(whatsappId, agora.toISOString())
      .run();
    return r.meta.changes > 0;
  }

  async esquecerRecebida(whatsappId: string): Promise<void> {
    await this.db.prepare("DELETE FROM recebidas WHERE whatsapp_id = ?1").bind(whatsappId).run();
  }

  /** Marca, na hora, que esta mensagem já alterou a agenda. */
  async marcarAlteracao(whatsappId: string): Promise<void> {
    await this.db.prepare("UPDATE recebidas SET alterou = 1 WHERE whatsapp_id = ?1").bind(whatsappId).run();
  }

  async houveAlteracao(whatsappId: string): Promise<boolean> {
    const linha = await this.db
      .prepare("SELECT alterou FROM recebidas WHERE whatsapp_id = ?1")
      .bind(whatsappId)
      .first<{ alterou: number }>();
    return linha?.alterou === 1;
  }

  async ultimaDelaEm(): Promise<Date | null> {
    const linha = await this.db.prepare("SELECT MAX(criado_em) AS m FROM recebidas").first<{ m: string | null }>();
    return linha?.m ? new Date(linha.m) : null;
  }

  /** Últimos turnos completos, em ordem. Cada turno começa pela mensagem dela, então o resultado começa por "user". */
  async carregar(limiteTurnos: number): Promise<Anthropic.MessageParam[]> {
    const { results } = await this.db
      .prepare("SELECT mensagens FROM turnos ORDER BY id DESC LIMIT ?1")
      .bind(limiteTurnos)
      .all<{ mensagens: string }>();
    return results.reverse().flatMap((t) => JSON.parse(t.mensagens) as Anthropic.MessageParam[]);
  }

  async salvarTurno(mensagens: Anthropic.MessageParam[], agora: Date): Promise<void> {
    await this.db
      .prepare("INSERT INTO turnos (mensagens, criado_em) VALUES (?1, ?2)")
      .bind(JSON.stringify(mensagens), agora.toISOString())
      .run();
  }
}
