-- Histórico por turno completo (entrada, chamadas de ferramenta com resultados, resposta final).
-- Guardar só os textos finais fazia o modelo imitar confirmações sem chamar ferramentas.
CREATE TABLE turnos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mensagens TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
DROP TABLE mensagens;
