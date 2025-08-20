const { Pool } = require('pg');

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // ✅ Configurações adicionais para produção no Render
  max: 20, // máximo de 20 conexões no pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// ✅ Event listeners para debug em produção
pool.on('connect', () => {
  console.log('✅ PostgreSQL: Nova conexão estabelecida');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err);
});

// Função para inicializar o banco PostgreSQL
const initPostgreSQL = async () => {
  try {
    console.log('🔄 Inicializando banco PostgreSQL...');
    console.log('🌍 DATABASE_URL:', process.env.DATABASE_URL ? 'CONFIGURADO' : 'NÃO CONFIGURADO');
    console.log('🔒 SSL Mode:', process.env.NODE_ENV === 'production' ? 'HABILITADO' : 'DESABILITADO');
    
    // Testar conexão primeiro
    const client = await pool.connect();
    const testResult = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ PostgreSQL conectado:', testResult.rows[0].current_time);
    console.log('📦 PostgreSQL versão:', testResult.rows[0].pg_version);
    client.release();
    
    // Criar tabela de usuários
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Criar tabela de categorias
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Criar tabela de fotos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        filename TEXT NOT NULL,
        original_name VARCHAR(255),
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        is_featured BOOLEAN DEFAULT FALSE,
        order_index INTEGER DEFAULT 0,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('✅ Tabelas criadas/verificadas');
    
    // Verificar se usuário admin existe
    const adminExists = await pool.query(
      'SELECT id, username FROM users WHERE username = $1',
      ['admin']
    );
    
    if (adminExists.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 12); // Aumentar salt rounds
     
      const insertResult = await pool.query(
        'INSERT INTO users (username, password, email) VALUES ($1, $2, $3) RETURNING id',
        ['admin', hashedPassword, 'admin@portfolio.com']
      );
     
      console.log('✅ Usuário admin criado (ID:', insertResult.rows[0].id, ')');
      console.log('🔑 username: admin, password: admin123');
      console.log('⚠️ ALTERE A SENHA EM PRODUÇÃO!');
    } else {
      console.log('✅ Usuário admin já existe (ID:', adminExists.rows[0].id, ')');
    }
    
    // Inserir categorias padrão (se não existirem)
    await pool.query(`
      INSERT INTO categories (name, slug, description)
      VALUES
        ('Retratos', 'retratos', 'Fotografias de retratos profissionais'),
        ('Paisagens', 'paisagens', 'Fotografias de paisagens naturais'),
        ('Eventos', 'eventos', 'Fotografias de eventos e celebrações')
      ON CONFLICT (slug) DO NOTHING;
    `);
    
    console.log('✅ Categorias padrão verificadas/criadas');
    console.log('✅ Banco PostgreSQL inicializado com sucesso!');
   
  } catch (err) {
    console.error('❌ Erro ao inicializar PostgreSQL:', err);
    console.error('❌ Stack completo:', err.stack);
    throw err;
  }
};

// ✅ CORREÇÃO PRINCIPAL: Retornar pool diretamente para .query()
const getDatabase = () => {
  if (!pool) {
    throw new Error('Pool PostgreSQL não inicializado');
  }
  return pool; // Retorna o pool diretamente, não o wrapper
};

// ✅ Função para testar conexão
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT 1 as test');
    client.release();
    console.log('✅ Teste de conexão bem-sucedido');
    return true;
  } catch (error) {
    console.error('❌ Falha no teste de conexão:', error);
    return false;
  }
};

// ✅ Função para fechar conexões graciosamente
const closeDatabase = async () => {
  if (pool) {
    console.log('🔄 Fechando conexões do banco...');
    await pool.end();
    console.log('✅ Conexões fechadas');
  }
};

// ✅ Wrapper de compatibilidade (caso seja necessário manter)
const dbWrapper = {
  // db.all() equivalente
  all: (query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
   
    pool.query(query, params)
      .then(result => {
        console.log(`📊 Query all: ${result.rows.length} rows`);
        callback(null, result.rows);
      })
      .catch(err => {
        console.error('❌ Erro na query all:', err);
        callback(err);
      });
  },
  
  // db.get() equivalente  
  get: (query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
   
    pool.query(query, params)
      .then(result => {
        console.log(`📊 Query get: ${result.rows.length > 0 ? 'Found' : 'Not found'}`);
        callback(null, result.rows[0]);
      })
      .catch(err => {
        console.error('❌ Erro na query get:', err);
        callback(err);
      });
  },
  
  // db.run() equivalente
  run: (query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
   
    pool.query(query, params)
      .then(result => {
        console.log(`📊 Query run: ${result.rowCount} affected rows`);
        // Simular comportamento do SQLite
        const context = {
          lastID: result.rows[0]?.id || null,
          changes: result.rowCount
        };
        callback.call(context, null);
      })
      .catch(err => {
        console.error('❌ Erro na query run:', err);
        callback(err);
      });
  },
  
  // Pool direto para queries async/await
  query: (query, params) => {
    console.log(`📊 Direct query: ${query.substring(0, 50)}...`);
    return pool.query(query, params);
  }
};

module.exports = {
  initPostgreSQL,
  getDatabase,
  getDatabaseWrapper: () => dbWrapper, // Wrapper opcional
  closeDatabase,
  testConnection,
  pool
};