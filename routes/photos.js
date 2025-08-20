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

    const result = await db.query(query);
    const photos = result.rows;

    // Adicionar URL completa (Cloudinary)
    const photosWithUrls = photos.map(photo => ({
      ...photo,
      url: photo.cloudinary_url // agora usamos o campo cloudinary_url
    }));

    res.json(photosWithUrls);
  } catch (err) {
    console.error('Erro ao buscar fotos:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar foto por ID
router.get('/:id', async (req, res) => {
  try {
    const db = getDatabase();
    const photoId = req.params.id;

    const query = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM photos p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = $1
    `;

    const result = await db.query(query, [photoId]);
    const photo = result.rows[0];

    if (!photo) return res.status(404).json({ error: 'Foto não encontrada' });

    photo.url = photo.cloudinary_url;
    res.json(photo);
  } catch (err) {
    console.error('Erro ao buscar foto:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar categorias
router.get('/categories/all', async (req, res) => {
  try {
    const db = getDatabase();
    const result = await db.query('SELECT * FROM categories ORDER BY name');
    const categories = result.rows;
    
    res.json(categories);
  } catch (err) {
    console.error('Erro ao buscar categorias:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
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
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;
    
    const insertResult = await db.query(
      query,
      [
        title || req.file.originalname,
        description || '',
        result.public_id, // filename agora é public_id do Cloudinary
        req.file.originalname,
        category_id || null,
        is_featured ? true : false, // PostgreSQL usa boolean em vez de 0/1
        result.secure_url
      ]
    );

    const insertedId = insertResult.rows[0].id;

    res.json({
      message: 'Foto enviada com sucesso',
      photo: {
        id: insertedId,
        title: title || req.file.originalname,
        url: result.secure_url
      }
    });
  } catch (err) {
    console.error('Erro ao enviar foto:', err);
    res.status(500).json({ error: 'Erro ao enviar foto' });
  }
});

// Atualizar foto
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const photoId = req.params.id;
    const { title, description, category_id, is_featured } = req.body;
    const db = getDatabase();

    const query = `
      UPDATE photos 
      SET title = $1, description = $2, category_id = $3, is_featured = $4
      WHERE id = $5
    `;

    const result = await db.query(query, [
      title, 
      description, 
      category_id, 
      is_featured ? true : false, // PostgreSQL usa boolean
      photoId
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }

    res.json({ message: 'Foto atualizada com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar foto:', err);
    res.status(500).json({ error: 'Erro ao atualizar foto' });
  }
});

// Deletar foto
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const photoId = req.params.id;
    const db = getDatabase();

    // Buscar a foto primeiro
    const selectResult = await db.query('SELECT filename FROM photos WHERE id = $1', [photoId]);
    const photo = selectResult.rows[0];

    if (!photo) return res.status(404).json({ error: 'Foto não encontrada' });

    // Deletar do Cloudinary
    await cloudinary.uploader.destroy(photo.filename);

    // Deletar do banco de dados
    const deleteResult = await db.query('DELETE FROM photos WHERE id = $1', [photoId]);

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }

    res.json({ message: 'Foto deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar foto:', err);
    res.status(500).json({ error: 'Erro ao deletar foto' });
  }
});

module.exports = router;