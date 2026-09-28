CREATE TABLE agendamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente TEXT NOT NULL,
  cliente_busca TEXT NOT NULL,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  servico TEXT,
  observacao TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('atendimento', 'bloqueio')),
  situacao TEXT NOT NULL DEFAULT 'marcado' CHECK (situacao IN ('marcado', 'cancelado')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX idx_agendamentos_inicio ON agendamentos (inicio);

CREATE TABLE alteracoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agendamento_id INTEGER NOT NULL REFERENCES agendamentos (id),
  acao TEXT NOT NULL CHECK (acao IN ('marcar', 'remarcar', 'desmarcar')),
  antes TEXT,
  desfeita INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);

CREATE TABLE mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  papel TEXT NOT NULL CHECK (papel IN ('user', 'assistant')),
  conteudo TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE TABLE recebidas (
  whatsapp_id TEXT PRIMARY KEY,
  criado_em TEXT NOT NULL
);
