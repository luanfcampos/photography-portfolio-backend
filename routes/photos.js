const express = require('express');
const multer = require('multer');
const cloudinary = require('../cloudinary');
const { getDatabase } = require('../database/init');
const { authenticateToken } = require('./auth');

const router = express.Router();

// Multer para receber arquivos no memory storage
const upload = multer({ storage: multer.memoryStorage() });

// ------------------ ROTAS PÚBLICAS ------------------

// Listar todas as fotos públicas
router.get('/', async (req, res) => {
  try {
    const db = getDatabase();

    const query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM photos p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.order_index ASC, p.upload_date DESC
    `;

    db.all(query, [], (err, photos) => {
      if (err) {
        console.error('Erro ao buscar fotos:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }

      // Adicionar URL completa (Cloudinary)
      const photosWithUrls = photos.map(photo => ({
        ...photo,
        url: photo.cloudinary_url // agora usamos o campo cloudinary_url
      }));

      res.json(photosWithUrls);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar fotos' });
  }
});

// Buscar foto por ID
router.get('/:id', (req, res) => {
  const db = getDatabase();
  const photoId = req.params.id;

  const query = `
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM photos p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `;

  db.get(query, [photoId], (err, photo) => {
    if (err) {
      console.error('Erro ao buscar foto:', err);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }

    if (!photo) return res.status(404).json({ error: 'Foto não encontrada' });

    photo.url = photo.cloudinary_url;
    res.json(photo);
  });
});

// Listar categorias
router.get('/categories/all', (req, res) => {
  const db = getDatabase();
  db.all('SELECT * FROM categories ORDER BY name', [], (err, categories) => {
    if (err) {
      console.error('Erro ao buscar categorias:', err);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
    res.json(categories);
  });
});

// ------------------ ROTAS ADMINISTRATIVAS ------------------

// Upload de nova foto
router.post('/upload', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const { title, description, category_id, is_featured } = req.body;

    // Upload para o Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'portfolio/' },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    // Salvar no banco de dados
    const db = getDatabase();
    const query = `
      INSERT INTO photos (title, description, filename, original_name, category_id, is_featured, cloudinary_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(
      query,
      [
        title || req.file.originalname,
        description || '',
        result.public_id, // filename agora é public_id do Cloudinary
        req.file.originalname,
        category_id || null,
        is_featured ? 1 : 0,
        result.secure_url
      ],
      function (err) {
        if (err) {
          console.error('Erro ao salvar foto:', err);
          return res.status(500).json({ error: 'Erro ao salvar foto no banco de dados' });
        }

        res.json({
          message: 'Foto enviada com sucesso',
          photo: {
            id: this.lastID,
            title: title || req.file.originalname,
            url: result.secure_url
          }
        });
      }
    );
  } catch (err) {
    console.error('Erro ao enviar foto:', err);
    res.status(500).json({ error: 'Erro ao enviar foto' });
  }
});

// Atualizar foto
router.put('/:id', authenticateToken, (req, res) => {
  const photoId = req.params.id;
  const { title, description, category_id, is_featured } = req.body;
  const db = getDatabase();

  const query = `
    UPDATE photos 
    SET title = ?, description = ?, category_id = ?, is_featured = ?
    WHERE id = ?
  `;

  db.run(query, [title, description, category_id, is_featured ? 1 : 0, photoId], function (err) {
    if (err) {
      console.error('Erro ao atualizar foto:', err);
      return res.status(500).json({ error: 'Erro ao atualizar foto' });
    }

    if (this.changes === 0) return res.status(404).json({ error: 'Foto não encontrada' });

    res.json({ message: 'Foto atualizada com sucesso' });
  });
});

// Deletar foto
router.delete('/:id', authenticateToken, async (req, res) => {
  const photoId = req.params.id;
  const db = getDatabase();

  db.get('SELECT filename FROM photos WHERE id = ?', [photoId], async (err, photo) => {
    if (err) {
      console.error('Erro ao buscar foto:', err);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
    if (!photo) return res.status(404).json({ error: 'Foto não encontrada' });

    try {
      // Deletar do Cloudinary
      await cloudinary.uploader.destroy(photo.filename);

      // Deletar do banco de dados
      db.run('DELETE FROM photos WHERE id = ?', [photoId], function (err) {
        if (err) {
          console.error('Erro ao deletar foto:', err);
          return res.status(500).json({ error: 'Erro ao deletar foto' });
        }
        res.json({ message: 'Foto deletada com sucesso' });
      });
    } catch (err) {
      console.error('Erro ao deletar do Cloudinary:', err);
      res.status(500).json({ error: 'Erro ao deletar foto' });
    }
  });
});

module.exports = router;
