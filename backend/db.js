import pkg from 'pg';
import dotenv from 'dotenv';

// Força o carregamento do arquivo .env antes de qualquer outra coisa
dotenv.config();

const { Pool } = pkg;

// Configuração da conexão com fallbacks diretos (plano B caso o .env falhe)
export const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'admin',
  database: process.env.PGDATABASE || 'zorte_tickets',
});

// Avisa no terminal toda vez que uma nova conexão com o banco é aberta
pool.on('connect', () => {
  console.log('🔌 [Banco de Dados] Nova conexão estabelecida.');
});

// Intercepta e loga no terminal todas as consultas/criações
const originalQuery = pool.query;
pool.query = function (...args) {
  const sqlText = typeof args[0] === 'string' ? args[0] : args[0].text;
  console.log('🔎 [Consulta/Criação SQL]:', sqlText.trim());
  return originalQuery.apply(pool, args);
};

// Exporta a função ping exigida pelo index.js
export const ping = async () => {
  try {
    const res = await pool.query('SELECT NOW() as time');
    console.log('✅ [Ping] Conexão ativa, hora do banco:', res.rows[0].time);
    return res.rows[0];
  } catch (error) {
    console.error('❌ [Erro Ping] Banco de dados inacessível:', error);
    throw error;
  }
};

// Cria a tabela correta (empresas) no startup baseada nos logs do sistema
const initDb = async () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS empresas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome VARCHAR(255) NOT NULL,
        documento VARCHAR(50),
        email VARCHAR(255),
        telefone VARCHAR(50),
        endereco TEXT,
        observacoes TEXT,
        inquilino_id UUID,
        criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(sql);
    console.log("✅ [Startup] Tabela 'empresas' verificada/criada com sucesso.");
  } catch (error) {
    console.error("❌ [Erro Startup] Falha ao criar/verificar tabela:", error);
  }
};

// Executa a inicialização
initDb();