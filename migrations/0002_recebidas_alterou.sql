-- Marca as mensagens que já alteraram a agenda, para uma nova tentativa da fila não repetir a alteração.
ALTER TABLE recebidas ADD COLUMN alterou INTEGER NOT NULL DEFAULT 0;
