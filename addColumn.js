const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database/portfolio.db');

// Adicionar coluna cloudinary_url à tabela photos
db.run(`ALTER TABLE photos ADD COLUMN cloudinary_url TEXT`, function(err) {
  if (err) {
    console.error('Erro ao adicionar coluna:', err.message);
  } else {
    console.log('Coluna cloudinary_url adicionada com sucesso!');
  }
  db.close();
});
