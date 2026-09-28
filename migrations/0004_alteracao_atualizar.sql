-- Permite registrar a ação "atualizar" (edição de nome, serviço, observação ou duração).
-- O SQLite não altera CHECK de uma coluna: a tabela é recriada com os mesmos dados.
CREATE TABLE alteracoes_nova (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos (id),
  acao TEXT NOT NULL CHECK (acao IN ('marcar', 'remarcar', 'desmarcar', 'atualizar')),
  antes TEXT,
  desfeita INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);
INSERT INTO alteracoes_nova (id, agendamento_id, acao, antes, desfeita, criado_em)
  SELECT id, agendamento_id, acao, antes, desfeita, criado_em FROM alteracoes;
DROP TABLE alteracoes;
ALTER TABLE alteracoes_nova RENAME TO alteracoes;
