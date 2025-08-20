const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { router: authRoutes } = require('./routes/auth');
const { initDatabase, getDatabase } = require('./database/init');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuração Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Middleware CORS
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174', 
  'http://localhost:3000',
  'https://luanferreira.onrender.com',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializar banco de dados
initDatabase();

// Configuração Multer (upload em memória)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ✅ CORRIGIDO - GET /api/photos (buscar fotos do banco)
app.get('/api/photos', (req, res) => {
  const db = getDatabase();
  
  const query = `
    SELECT 
      p.*,
      c.name as category_name,
      c.slug as category_slug
    FROM photos p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.upload_date DESC
  `;
  
  db.all(query, (err, rows) => {
    if (err) {
      console.error('Erro ao buscar fotos:', err);
      return res.status(500).json({ error: 'Erro ao buscar fotos' });
    }
    
    // Transformar filename em URL completa se necessário
    const photos = rows.map(photo => ({
      ...photo,
      url: photo.filename.startsWith('http') ? photo.filename : photo.filename // Se já for URL do Cloudinary, manter
    }));
    
    res.json(photos);
  });
});

// ✅ CORRIGIDO - POST /api/photos (salvar no Cloudinary E no banco)
app.post('/api/photos', upload.single('photo'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // ✅ 1. Upload para Cloudinary
    const cloudinaryResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { 
          folder: 'meu-portfolio',
          resource_type: 'auto'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });

    // ✅ 2. Salvar no banco de dados
    const db = getDatabase();
    const { title, description, category_id, is_featured } = req.body;
    
    const insertQuery = `
      INSERT INTO photos (
        title, 
        description, 
        filename, 
        original_name, 
        category_id, 
        is_featured
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      title || 'Sem título',
      description || null,
      cloudinaryResult.secure_url, // URL do Cloudinary
      file.originalname,
      category_id || null,
      is_featured === 'true' || is_featured === true ? 1 : 0
    ];
    
    db.run(insertQuery, values, function(err) {
      if (err) {
        console.error('Erro ao salvar no banco:', err);
        return res.status(500).json({ error: 'Erro ao salvar foto no banco' });
      }
      
      // ✅ Retornar dados da foto criada
      res.json({
        success: true,
        id: this.lastID,
        url: cloudinaryResult.secure_url,
        title: title,
        message: 'Foto enviada e salva com sucesso!'
      });
    });

  } catch (err) {
    console.error('Erro no upload:', err);
    res.status(500).json({ error: 'Erro ao enviar imagem' });
  }
});

// ✅ NOVO - PUT /api/photos/:id (editar foto)
app.put('/api/photos/:id', (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  const { title, description, category_id, is_featured } = req.body;
  
  const updateQuery = `
    UPDATE photos 
    SET title = ?, description = ?, category_id = ?, is_featured = ?
    WHERE id = ?
  `;
  
  const values = [
    title,
    description,
    category_id || null,
    is_featured ? 1 : 0,
    id
  ];
  
  db.run(updateQuery, values, function(err) {
    if (err) {
      console.error('Erro ao atualizar foto:', err);
      return res.status(500).json({ error: 'Erro ao atualizar foto' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }
    
    res.json({ success: true, message: 'Foto atualizada com sucesso' });
  });
});

// ✅ NOVO - DELETE /api/photos/:id (deletar foto)
app.delete('/api/photos/:id', (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  // Primeiro buscar a foto para pegar a URL do Cloudinary
  db.get('SELECT filename FROM photos WHERE id = ?', [id], async (err, photo) => {
    if (err) {
      console.error('Erro ao buscar foto:', err);
      return res.status(500).json({ error: 'Erro ao buscar foto' });
    }
    
    if (!photo) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }
    
    try {
      // Deletar do Cloudinary se for URL do Cloudinary
      if (photo.filename.includes('cloudinary.com')) {
        const publicId = photo.filename.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`meu-portfolio/${publicId}`);
      }
      
      // Deletar do banco
      db.run('DELETE FROM photos WHERE id = ?', [id], function(err) {
        if (err) {
          console.error('Erro ao deletar foto:', err);
          return res.status(500).json({ error: 'Erro ao deletar foto' });
        }
        
        res.json({ success: true, message: 'Foto deletada com sucesso' });
      });
      
    } catch (cloudinaryErr) {
      console.error('Erro ao deletar do Cloudinary:', cloudinaryErr);
      // Mesmo se falhar no Cloudinary, deletar do banco
      db.run('DELETE FROM photos WHERE id = ?', [id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erro ao deletar foto' });
        }
        res.json({ success: true, message: 'Foto deletada do banco (erro no Cloudinary)' });
      });
    }
  });
});

// ✅ NOVO - GET /api/categories (listar categorias)
app.get('/api/categories', (req, res) => {
  const db = getDatabase();
  
  db.all('SELECT * FROM categories ORDER BY name', (err, rows) => {
    if (err) {
      console.error('Erro ao buscar categorias:', err);
      return res.status(500).json({ error: 'Erro ao buscar categorias' });
    }
    res.json(rows);
  });
});

// Rotas existentes
app.use('/api/auth', authRoutes);

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({
    message: 'Backend funcionando!',
    timestamp: new Date().toISOString(),
    cors: allowedOrigins
  });
});

// Rota raiz para teste
app.get('/', (req, res) => {
  res.json({
    message: 'Photography API',
    status: 'online',
    endpoints: ['/api/health', '/api/photos', '/api/auth', '/api/categories']
  });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Algo deu errado!' });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`CORS permitido para:`, allowedOrigins);
});