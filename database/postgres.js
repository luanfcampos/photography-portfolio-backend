const { Pool } = require('pg');

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Função para inicializar o banco PostgreSQL
const initPostgreSQL = async () => {
  try {
    console.log('🔄 Inicializando banco PostgreSQL...');

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
    }

    // Inserir categorias padrão (exatamente como no SQLite)
    await pool.query(`
      INSERT INTO categories (name, slug, description) 
      VALUES 
        ('Retratos', 'retratos', 'Fotografias de retratos profissionais'),
        ('Paisagens', 'paisagens', 'Fotografias de paisagens naturais'),
        ('Eventos', 'eventos', 'Fotografias de eventos e celebrações')
      ON CONFLICT (slug) DO NOTHING;
    `);

    console.log('✅ Banco PostgreSQL inicializado com sucesso!');
    
  } catch (err) {
    console.error('❌ Erro ao inicializar PostgreSQL:', err);
    throw err;
  }
};

// Wrapper para queries com callback (compatibilidade com código SQLite)
const dbWrapper = {
  // db.all() equivalente
  all: (query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    pool.query(query, params)
      .then(result => callback(null, result.rows))
      .catch(err => callback(err));
  },

  // db.get() equivalente  
  get: (query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    pool.query(query, params)
      .then(result => callback(null, result.rows[0]))
      .catch(err => callback(err));
  },

  // db.run() equivalente
  run: (query, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    pool.query(query, params)
      .then(result => {
        // Simular comportamento do SQLite
        const context = {
          lastID: result.rows[0]?.id || null,
          changes: result.rowCount
        };
        callback.call(context, null);
      })
      .catch(err => callback(err));
  },

  // Pool direto para queries async/await
  query: (query, params) => pool.query(query, params)
};

module.exports = {
  initPostgreSQL,
  getDatabase: () => dbWrapper,
  pool
};