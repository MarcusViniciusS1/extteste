# Conectar o DBeaver ao banco local do sistema de tickets

## 1. Subir o banco

Pré-requisito: [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e aberto.

No terminal, dentro da pasta do projeto:

```
docker compose up -d
```

Isso cria um Postgres 16 já com todas as tabelas do sistema de tickets (`companies`, `contacts`, `attendants`, `tickets`, `ticket_notes`, `system_logs`, `api_connections`).

## 2. Instalar o DBeaver

[dbeaver.io/download](https://dbeaver.io/download/) → versão Community (gratuita).

## 3. Criar a conexão

Nova Conexão → **PostgreSQL** → preencher:

| Campo | Valor |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `zorte_tickets` |
| Username | `postgres` |
| Password | `admin` |

Testar conexão → Finalizar.

## Observações

- Esse banco é local/isolado, separado do Supabase que o sistema em produção usa.
- Para parar o banco: `docker compose down` (os dados ficam salvos no volume). Para apagar tudo: `docker compose down -v`.
