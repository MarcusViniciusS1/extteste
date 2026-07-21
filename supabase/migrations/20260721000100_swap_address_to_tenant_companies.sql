/*
# Troca address → tenant em `companies` (schema em inglês / Supabase)

## Contexto
Equivalente em inglês da migração 20260721000000_swap_endereco_to_tenant_pt_br_local.sql.
O cadastro de empresa deixou de usar o campo de endereço e passou a usar o
Tenant. O vínculo com tenant já existe em `companies.tenant_id`
(criado em 20260720190906_add_tenants.sql), então esta migração apenas remove
a coluna `address`, que não é mais usada pelo app nem pelo backend.

Pré-requisitos: rodar depois de
  20260720181059_create_ticket_system_schema.sql
  20260720190906_add_tenants.sql

## Atenção
Isto é destrutivo: descarta os dados da coluna `address`. Faça backup se
precisar preservar esses valores antes de rodar.
*/

ALTER TABLE companies DROP COLUMN IF EXISTS address;
