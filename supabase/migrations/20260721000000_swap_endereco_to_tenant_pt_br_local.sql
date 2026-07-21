/*
# Troca endereço → tenant em `empresas` (banco local pt-br)

## Contexto
O cadastro de empresa deixou de usar o campo de endereço e passou a usar o
Tenant (inquilino). O vínculo com tenant já existe em `empresas.inquilino_id`
(criado em 20260720195654_add_inquilinos_pt_br_local.sql), então esta migração
apenas remove a coluna `endereco`, que não é mais usada pelo app nem pelo
backend.

Pré-requisitos: rodar depois de
  20260720194725_schema_pt_br_local.sql
  20260720195654_add_inquilinos_pt_br_local.sql

## Atenção
Isto é destrutivo: descarta os dados da coluna `endereco`. Faça backup se
precisar preservar esses valores antes de rodar.
*/

ALTER TABLE empresas DROP COLUMN IF EXISTS endereco;
