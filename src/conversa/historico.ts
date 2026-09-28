export interface Turno {
  papel: "user" | "assistant";
  conteudo: string;
}

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

  async ultimaDelaEm(): Promise<Date | null> {
    const linha = await this.db.prepare("SELECT MAX(criado_em) AS m FROM recebidas").first<{ m: string | null }>();
    return linha?.m ? new Date(linha.m) : null;
  }

  async carregar(limite: number): Promise<Turno[]> {
    const { results } = await this.db
      .prepare("SELECT papel, conteudo FROM mensagens ORDER BY id DESC LIMIT ?1")
      .bind(limite)
      .all<Turno>();
    const turnos = results.reverse();
    // A API do Claude exige que a conversa comece com uma mensagem "user".
    while (turnos.length > 0 && turnos[0]!.papel !== "user") turnos.shift();
    return turnos;
  }

  async salvarTurno(entrada: string, resposta: string, agora: Date): Promise<void> {
    const quando = agora.toISOString();
    await this.db.batch([
      this.db.prepare("INSERT INTO mensagens (papel, conteudo, criado_em) VALUES ('user', ?1, ?2)").bind(entrada, quando),
      this.db.prepare("INSERT INTO mensagens (papel, conteudo, criado_em) VALUES ('assistant', ?1, ?2)").bind(resposta, quando),
    ]);
  }
}
