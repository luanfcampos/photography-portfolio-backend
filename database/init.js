const sqlite3 = require('sqlite3').verbose()
const bcrypt = require('bcryptjs')
const path = require('path')

const dbPath = path.join(__dirname, 'portfolio.db')
const db = new sqlite3.Database(dbPath)

function initDatabase() {
  console.log('Inicializando banco de dados...')
  
  // Criar tabela de usuários
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Criar tabela de categorias
    db.run(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Criar tabela de fotos
    db.run(`
      CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        filename TEXT NOT NULL,
        original_name TEXT,
        category_id INTEGER,
        is_featured BOOLEAN DEFAULT 0,
        order_index INTEGER DEFAULT 0,
        upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories (id)
      )
    `)

    // Inserir usuário admin padrão se não existir
    const adminPassword = bcrypt.hashSync('admin123', 10)
    db.run(`
      INSERT OR IGNORE INTO users (username, password, email) 
      VALUES (?, ?, ?)
    `, ['admin', adminPassword, 'admin@portfolio.com'])

    // Inserir categorias padrão
    db.run(`INSERT OR IGNORE INTO categories (name, slug, description) VALUES (?, ?, ?)`, 
      ['Retratos', 'retratos', 'Fotografias de retratos profissionais'])
    
    db.run(`INSERT OR IGNORE INTO categories (name, slug, description) VALUES (?, ?, ?)`, 
      ['Paisagens', 'paisagens', 'Fotografias de paisagens naturais'])
    
    db.run(`INSERT OR IGNORE INTO categories (name, slug, description) VALUES (?, ?, ?)`, 
      ['Eventos', 'eventos', 'Fotografias de eventos e celebrações'])

    console.log('Banco de dados inicializado com sucesso!')
  })
}

function getDatabase() {
  return db
}

module.exports = {
  initDatabase,
  getDatabase
}

