/*
# Campos extras no catálogo de tags — versão pt-br, banco local

## O que faz
1. Adiciona `cor` (hex, com default), `descricao` (opcional) e `padrao`
   (marca as tags de exemplo pré-cadastradas) em `etiquetas`.
2. Marca como `padrao=true` as 7 tags semeadas em
   20260722000000_add_etiquetas_pt_br_local.sql, com uma cor cada.

Pré-requisitos: rodar depois de 20260722000000_add_etiquetas_pt_br_local.sql.
*/

ALTER TABLE etiquetas ADD COLUMN IF NOT EXISTS cor text NOT NULL DEFAULT '#2f7ff0';
ALTER TABLE etiquetas ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE etiquetas ADD COLUMN IF NOT EXISTS padrao boolean NOT NULL DEFAULT false;

UPDATE etiquetas SET padrao = true, cor = CASE nome
  WHEN 'Suporte' THEN '#2f7ff0'
  WHEN 'Financeiro' THEN '#16b89a'
  WHEN 'Cliente VIP' THEN '#f59e0b'
  WHEN 'Dúvida' THEN '#5b9cf5'
  WHEN 'Bug' THEN '#ef4444'
  WHEN 'Sugestão' THEN '#a855f7'
  WHEN 'Cancelamento' THEN '#5a6a8a'
  ELSE cor
END
WHERE nome IN ('Suporte', 'Financeiro', 'Cliente VIP', 'Dúvida', 'Bug', 'Sugestão', 'Cancelamento');
