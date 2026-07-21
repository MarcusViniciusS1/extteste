import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'admin',
  database: process.env.PGDATABASE || 'zorte_tickets',
  // Resiliência: mantém conexões vivas e recicla ociosas em vez de deixá-las
  // morrer silenciosamente (o que, sem o handler abaixo, derrubava o processo).
  max: 10,
  keepAlive: true,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// CRÍTICO: sem este handler, um erro numa conexão ociosa (Postgres reiniciou,
// rede oscilou, conexão expirou) emite um evento 'error' não tratado e o Node
// encerra o backend inteiro. Aqui só logamos; o pool abre novas conexões sob
// demanda na próxima query.
pool.on('error', (err) => {
  console.error('[pg] erro em conexão ociosa do pool (ignorado, sem derrubar o backend):', err.message);
});

// Verifica se o banco responde. Usado por /api/health.
export async function ping() {
  const { rows } = await pool.query('SELECT 1 AS ok');
  return rows[0]?.ok === 1;
}
