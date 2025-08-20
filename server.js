const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { router: authRoutes, authenticateToken } = require('./routes/auth');
const { initDatabase, getDatabase } = require('./database/init');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Verificar se JWT_SECRET existe
if (!process.env.JWT_SECRET) {
  console.error('❌ ERRO: JWT_SECRET não configurado no .env!');
  process.exit(1);
}

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

// Configuração Multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas imagens
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos'), false);
    }
  }
});

// 🔓 PÚBLICO - GET /api/photos (para o portfólio público)
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
    
    const photos = rows.map(photo => ({
      ...photo,
      url: photo.filename.startsWith('http') ? photo.filename : photo.filename
    }));
    
    res.json(photos);
  });
});

// 🔐 PROTEGIDO - POST /api/photos (apenas admin pode fazer upload)
app.post('/api/photos', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    // Upload para Cloudinary
    const cloudinaryResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { 
          folder: 'meu-portfolio',
          resource_type: 'auto',
          transformation: [
            { width: 1920, height: 1080, crop: 'limit' }, // Redimensionar se muito grande
            { quality: 'auto' } // Otimizar qualidade
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });

    // Salvar no banco
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
      cloudinaryResult.secure_url,
      file.originalname,
      category_id || null,
      is_featured === 'true' || is_featured === true ? 1 : 0
    ];
    
    db.run(insertQuery, values, function(err) {
      if (err) {
        console.error('Erro ao salvar no banco:', err);
        return res.status(500).json({ error: 'Erro ao salvar foto no banco' });
      }
      
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

// 🔐 PROTEGIDO - PUT /api/photos/:id
app.put('/api/photos/:id', authenticateToken, (req, res) => {
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

// 🔐 PROTEGIDO - DELETE /api/photos/:id
app.delete('/api/photos/:id', authenticateToken, (req, res) => {
  const db = getDatabase();
  const { id } = req.params;
  
  db.get('SELECT filename FROM photos WHERE id = ?', [id], async (err, photo) => {
    if (err) {
      console.error('Erro ao buscar foto:', err);
      return res.status(500).json({ error: 'Erro ao buscar foto' });
    }
    
    if (!photo) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }
    
    try {
      // Deletar do Cloudinary
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
      // Deletar do banco mesmo se falhar no Cloudinary
      db.run('DELETE FROM photos WHERE id = ?', [id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erro ao deletar foto' });
        }
        res.json({ success: true, message: 'Foto deletada do banco' });
      });
    }
  });
});

// 🔓 PÚBLICO - GET /api/categories
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

// Rotas de autenticação
app.use('/api/auth', authRoutes);

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({
    message: 'Backend funcionando!',
    timestamp: new Date().toISOString(),
    jwt_configured: !!process.env.JWT_SECRET,
    cors: allowedOrigins
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'Photography API',
    status: 'online',
    endpoints: ['/api/health', '/api/photos', '/api/auth', '/api/categories']
  });
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande (máximo 10MB)' });
    }
  }
  
  console.error(error.stack);
  res.status(500).json({ error: 'Algo deu errado!' });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`JWT Secret configurado:`, !!process.env.JWT_SECRET);
  console.log(`CORS permitido para:`, allowedOrigins);
});