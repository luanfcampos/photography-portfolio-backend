const { Pool } = require('pg');

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Função para inicializar o banco PostgreSQL
const initPostgreSQL = async () => {  // ✅ CORREÇÃO: Removido * inválido
  try {
    console.log('🔄 Inicializando banco PostgreSQL...');
    
    // Testar conexão primeiro
    const client = await pool.connect();
    const testResult = await client.query('SELECT NOW() as current_time');
    console.log('✅ PostgreSQL conectado:', testResult.rows[0].current_time);
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
    
    // Criar usuário admin padrão (se não existir)
    const adminExists = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      ['admin']
    );
    
    if (adminExists.rows.length === 0) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
     
      await pool.query(
        'INSERT INTO users (username, password, email) VALUES ($1, $2, $3)',
        ['admin', hashedPassword, 'admin@portfolio.com']
      );
     
      console.log('✅ Usuário admin criado (username: admin, password: admin123)');
      console.log('⚠️  ALTERE A SENHA EM PRODUÇÃO!');
    } else {
      console.log('✅ Usuário admin já existe');
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
    throw err;
  }
};

// Wrapper para queries com callback (compatibilidade com código SQLite)
const dbWrapper = {
  // db.all() equivalente
  all: (query, params, callback) => {  // ✅ CORREÇÃO: Removido * inválido
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
  get: (query, params, callback) => {  // ✅ CORREÇÃO: Removido * inválido
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
  run: (query, params, callback) => {  // ✅ CORREÇÃO: Removido * inválido
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
  query: (query, params) => {  // ✅ CORREÇÃO: Removido * inválido
    console.log(`📊 Direct query: ${query.substring(0, 50)}...`);
    return pool.query(query, params);
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

module.exports = {
  initPostgreSQL,
  getDatabase: () => dbWrapper,  // ✅ CORREÇÃO: Removido * inválido
  closeDatabase,
  pool
};