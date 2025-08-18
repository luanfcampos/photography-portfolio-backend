const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { getDatabase } = require('../database/init')
const { authenticateToken } = require('./auth')

const router = express.Router()

// Configurar multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)

    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos'))
    }
  }
})

// Rotas públicas (para o portfólio)

// Listar todas as fotos públicas
router.get('/', (req, res) => {
  const db = getDatabase()
  
  const query = `
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM photos p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.order_index ASC, p.upload_date DESC
  `
  
  db.all(query, [], (err, photos) => {
    if (err) {
      console.error('Erro ao buscar fotos:', err)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }

    // Adicionar URL completa para as imagens
    const photosWithUrls = photos.map(photo => ({
      ...photo,
      url: `${req.protocol}://${req.get('host')}/uploads/${photo.filename}`
    }))

    res.json(photosWithUrls)
  })
})

// Buscar foto por ID
router.get('/:id', (req, res) => {
  const db = getDatabase()
  const photoId = req.params.id
  
  const query = `
    SELECT p.*, c.name as category_name, c.slug as category_slug
    FROM photos p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `
  
  db.get(query, [photoId], (err, photo) => {
    if (err) {
      console.error('Erro ao buscar foto:', err)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }

    if (!photo) {
      return res.status(404).json({ error: 'Foto não encontrada' })
    }

    // Adicionar URL completa para a imagem
    photo.url = `${req.protocol}://${req.get('host')}/uploads/${photo.filename}`

    res.json(photo)
  })
})

// Listar categorias
router.get('/categories/all', (req, res) => {
  const db = getDatabase()
  
  db.all('SELECT * FROM categories ORDER BY name', [], (err, categories) => {
    if (err) {
      console.error('Erro ao buscar categorias:', err)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }

    res.json(categories)
  })
})

// Rotas administrativas (protegidas)

// Upload de nova foto
router.post('/upload', authenticateToken, upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' })
  }

  const { title, description, category_id, is_featured } = req.body
  const db = getDatabase()

  const query = `
    INSERT INTO photos (title, description, filename, original_name, category_id, is_featured)
    VALUES (?, ?, ?, ?, ?, ?)
  `

  db.run(query, [
    title || req.file.originalname,
    description || '',
    req.file.filename,
    req.file.originalname,
    category_id || null,
    is_featured ? 1 : 0
  ], function(err) {
    if (err) {
      console.error('Erro ao salvar foto:', err)
      return res.status(500).json({ error: 'Erro ao salvar foto no banco de dados' })
    }

    res.json({
      message: 'Foto enviada com sucesso',
      photo: {
        id: this.lastID,
        title: title || req.file.originalname,
        filename: req.file.filename,
        url: `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`
      }
    })
  })
})

// Atualizar foto
router.put('/:id', authenticateToken, (req, res) => {
  const photoId = req.params.id
  const { title, description, category_id, is_featured } = req.body
  const db = getDatabase()

  const query = `
    UPDATE photos 
    SET title = ?, description = ?, category_id = ?, is_featured = ?
    WHERE id = ?
  `

  db.run(query, [title, description, category_id, is_featured ? 1 : 0, photoId], function(err) {
    if (err) {
      console.error('Erro ao atualizar foto:', err)
      return res.status(500).json({ error: 'Erro ao atualizar foto' })
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' })
    }

    res.json({ message: 'Foto atualizada com sucesso' })
  })
})

// Deletar foto
router.delete('/:id', authenticateToken, (req, res) => {
  const photoId = req.params.id
  const db = getDatabase()

  // Primeiro, buscar o arquivo para deletar
  db.get('SELECT filename FROM photos WHERE id = ?', [photoId], (err, photo) => {
    if (err) {
      console.error('Erro ao buscar foto:', err)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }

    if (!photo) {
      return res.status(404).json({ error: 'Foto não encontrada' })
    }

    // Deletar arquivo físico
    const filePath = path.join(__dirname, '../uploads', photo.filename)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // Deletar do banco de dados
    db.run('DELETE FROM photos WHERE id = ?', [photoId], function(err) {
      if (err) {
        console.error('Erro ao deletar foto:', err)
        return res.status(500).json({ error: 'Erro ao deletar foto' })
      }

      res.json({ message: 'Foto deletada com sucesso' })
    })
  })
})

module.exports = router

