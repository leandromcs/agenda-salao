import type { Agendamento, Alteracao, TipoAgendamento } from "./tipos";

const COLUNAS = "id, cliente, inicio, fim, servico, observacao, tipo, situacao, criado_em, atualizado_em";

export function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export interface NovoAgendamento {
  cliente: string;
  inicio: string;
  fim: string;
  servico: string | null;
  observacao: string | null;
  tipo: TipoAgendamento;
}

/** Valores finais (já combinados com os atuais) dos campos que "atualizar" pode mudar. */
export interface CamposEditaveis {
  cliente: string;
  servico: string | null;
  observacao: string | null;
  fim: string;
}

export interface RepositorioAgenda {
  listarEntre(de: string, ate: string, nome?: string): Promise<Agendamento[]>;
  buscar(id: number): Promise<Agendamento | null>;
  marcar(novo: NovoAgendamento, agora: string): Promise<Agendamento>;
  remarcar(id: number, inicio: string, fim: string, antes: Agendamento, agora: string): Promise<Agendamento>;
  atualizar(id: number, campos: CamposEditaveis, antes: Agendamento, agora: string): Promise<Agendamento>;
  desmarcar(id: number, antes: Agendamento, agora: string): Promise<Agendamento>;
  ultimaAlteracaoPendente(): Promise<Alteracao | null>;
  desfazer(alteracao: Alteracao, agora: string): Promise<Agendamento>;
}

function primeiro(resultado: D1Result<Agendamento> | undefined): Agendamento {
  const linha = resultado?.results[0];
  if (!linha) throw new Error("O banco não devolveu o agendamento alterado.");
  return linha;
}

export class AgendaRepositorio implements RepositorioAgenda {
  constructor(private readonly db: D1Database) {}

  async listarEntre(de: string, ate: string, nome?: string): Promise<Agendamento[]> {
    let sql = `SELECT ${COLUNAS} FROM agendamentos WHERE situacao = 'marcado' AND inicio < ?1 AND fim > ?2`;
    const parametros: unknown[] = [ate, de];
    if (nome) {
      sql += " AND cliente_busca LIKE ?3";
      parametros.push(`%${normalizarBusca(nome)}%`);
    }
    sql += " ORDER BY inicio";
    const { results } = await this.db.prepare(sql).bind(...parametros).all<Agendamento>();
    return results;
  }

  async buscar(id: number): Promise<Agendamento | null> {
    return await this.db.prepare(`SELECT ${COLUNAS} FROM agendamentos WHERE id = ?1`).bind(id).first<Agendamento>();
  }

  async marcar(novo: NovoAgendamento, agora: string): Promise<Agendamento> {
    const [inserido] = await this.db.batch<Agendamento>([
      this.db
        .prepare(
          `INSERT INTO agendamentos (cliente, cliente_busca, inicio, fim, servico, observacao, tipo, situacao, criado_em, atualizado_em)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'marcado', ?8, ?8) RETURNING ${COLUNAS}`,
        )
        .bind(novo.cliente, normalizarBusca(novo.cliente), novo.inicio, novo.fim, novo.servico, novo.observacao, novo.tipo, agora),
      this.db
        .prepare("INSERT INTO alteracoes (agendamento_id, acao, antes, criado_em) VALUES (last_insert_rowid(), 'marcar', NULL, ?1)")
        .bind(agora),
    ]);
    return primeiro(inserido);
  }

  async remarcar(id: number, inicio: string, fim: string, antes: Agendamento, agora: string): Promise<Agendamento> {
    const [atualizado] = await this.db.batch<Agendamento>([
      this.db
        .prepare(`UPDATE agendamentos SET inicio = ?1, fim = ?2, atualizado_em = ?3 WHERE id = ?4 RETURNING ${COLUNAS}`)
        .bind(inicio, fim, agora, id),
      this.db
        .prepare("INSERT INTO alteracoes (agendamento_id, acao, antes, criado_em) VALUES (?1, 'remarcar', ?2, ?3)")
        .bind(id, JSON.stringify(antes), agora),
    ]);
    return primeiro(atualizado);
  }

  async desmarcar(id: number, antes: Agendamento, agora: string): Promise<Agendamento> {
    const [atualizado] = await this.db.batch<Agendamento>([
      this.db
        .prepare(`UPDATE agendamentos SET situacao = 'cancelado', atualizado_em = ?1 WHERE id = ?2 RETURNING ${COLUNAS}`)
        .bind(agora, id),
      this.db
        .prepare("INSERT INTO alteracoes (agendamento_id, acao, antes, criado_em) VALUES (?1, 'desmarcar', ?2, ?3)")
        .bind(id, JSON.stringify(antes), agora),
    ]);
    return primeiro(atualizado);
  }

  async atualizar(id: number, campos: CamposEditaveis, antes: Agendamento, agora: string): Promise<Agendamento> {
    const [atualizado] = await this.db.batch<Agendamento>([
      this.db
        .prepare(
          `UPDATE agendamentos SET cliente = ?1, cliente_busca = ?2, servico = ?3, observacao = ?4, fim = ?5, atualizado_em = ?6
           WHERE id = ?7 RETURNING ${COLUNAS}`,
        )
        .bind(campos.cliente, normalizarBusca(campos.cliente), campos.servico, campos.observacao, campos.fim, agora, id),
      this.db
        .prepare("INSERT INTO alteracoes (agendamento_id, acao, antes, criado_em) VALUES (?1, 'atualizar', ?2, ?3)")
        .bind(id, JSON.stringify(antes), agora),
    ]);
    return primeiro(atualizado);
  }

  async ultimaAlteracaoPendente(): Promise<Alteracao | null> {
    return await this.db
      .prepare("SELECT * FROM alteracoes WHERE desfeita = 0 ORDER BY id DESC LIMIT 1")
      .first<Alteracao>();
  }

  async desfazer(alteracao: Alteracao, agora: string): Promise<Agendamento> {
    let reverter: D1PreparedStatement;
    if (alteracao.acao === "marcar") {
      reverter = this.db
        .prepare(`UPDATE agendamentos SET situacao = 'cancelado', atualizado_em = ?1 WHERE id = ?2 RETURNING ${COLUNAS}`)
        .bind(agora, alteracao.agendamento_id);
    } else if (alteracao.acao === "remarcar" || alteracao.acao === "atualizar") {
      // Restaura tudo o que essas ações podem mudar, a partir da foto de antes.
      const antes = JSON.parse(alteracao.antes ?? "{}") as Agendamento;
      reverter = this.db
        .prepare(
          `UPDATE agendamentos SET cliente = ?1, cliente_busca = ?2, servico = ?3, observacao = ?4, inicio = ?5, fim = ?6,
           atualizado_em = ?7 WHERE id = ?8 RETURNING ${COLUNAS}`,
        )
        .bind(
          antes.cliente,
          normalizarBusca(antes.cliente),
          antes.servico,
          antes.observacao,
          antes.inicio,
          antes.fim,
          agora,
          alteracao.agendamento_id,
        );
    } else {
      reverter = this.db
        .prepare(`UPDATE agendamentos SET situacao = 'marcado', atualizado_em = ?1 WHERE id = ?2 RETURNING ${COLUNAS}`)
        .bind(agora, alteracao.agendamento_id);
    }
    const [revertido] = await this.db.batch<Agendamento>([
      reverter,
      this.db.prepare("UPDATE alteracoes SET desfeita = 1 WHERE id = ?1").bind(alteracao.id),
    ]);
    return primeiro(revertido);
  }
}
