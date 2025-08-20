const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { router: authRoutes, authenticateToken } = require('./routes/auth');
// ✅ CORREÇÃO: Usar apenas PostgreSQL
const { initPostgreSQL, getDatabase } = require('./database/postgres');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 3001;

console.log('🚀 Iniciando servidor...');
console.log(`📦 NODE_ENV: ${process.env.NODE_ENV}`);

// ✅ Verificar variáveis de ambiente essenciais
if (!process.env.JWT_SECRET) {
  console.error('❌ ERRO: JWT_SECRET não configurado!');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ ERRO: DATABASE_URL não configurado!');
  process.exit(1);
}

console.log('✅ Variáveis de ambiente configuradas');

// Configuração Cloudinary
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('✅ Cloudinary configurado');
} else {
  console.log('⚠️ Cloudinary não configurado (algumas funcionalidades de upload podem falhar)');
}

// Middleware CORS para produção no Render
app.use(cors());

// Middleware essenciais
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Middleware de log para debug em produção
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ✅ Health check melhorado
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Backend funcionando!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    jwt_configured: !!process.env.JWT_SECRET,
    database_configured: !!process.env.DATABASE_URL,
    cors_origins: allowedOrigins,
    cloudinary_configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY)
  });
});

// ✅ CORREÇÃO: Inicializar PostgreSQL corretamente
const initializeDatabase = async () => {
  try {
    console.log('🔄 Inicializando banco de dados...');
    await initPostgreSQL();
    console.log('✅ Banco de dados inicializado');
  } catch (err) {
    console.error('❌ Falha ao inicializar banco:', err);
    throw err;
  }
};

// Configuração Multer
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos'), false);
    }
  }
});

// 🔓 PÚBLICO - GET /api/photos
app.get('/api/photos', async (req, res) => {
  try {
    console.log('📸 Buscando fotos...');
    const db = getDatabase();
    
    // ✅ CORREÇÃO: Query PostgreSQL correta
    const query = `
      SELECT 
        p.*,
        c.name as category_name,
        c.slug as category_slug
      FROM photos p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.upload_date DESC
    `;
    
    const result = await db.query(query);
    const photos = result.rows.map(photo => ({
      ...photo,
      url: photo.filename?.startsWith('http') ? photo.filename : photo.filename
    }));
    
    console.log(`✅ ${photos.length} fotos encontradas`);
    res.json(photos);
    
  } catch (err) {
    console.error('❌ Erro ao buscar fotos:', err);
    res.status(500).json({ error: 'Erro ao buscar fotos' });
  }
});

// 🔐 PROTEGIDO - POST /api/photos
app.post('/api/photos', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    console.log('📤 Upload de foto iniciado');
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
            { width: 1920, height: 1080, crop: 'limit' },
            { quality: 'auto' }
          ]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });

    console.log('✅ Upload para Cloudinary concluído');

    // ✅ CORREÇÃO: Salvar no PostgreSQL
    const db = getDatabase();
    const { title, description, category_id, is_featured } = req.body;
    
    const insertQuery = `
      INSERT INTO photos (
        title, 
        description, 
        filename, 
        original_name, 
        category_id, 
        is_featured,
        upload_date
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id
    `;
    
    const values = [
      title || 'Sem título',
      description || null,
      cloudinaryResult.secure_url,
      file.originalname,
      category_id || null,
      is_featured === 'true' || is_featured === true
    ];
    
    const result = await db.query(insertQuery, values);
    const newPhotoId = result.rows[0].id;
    
    console.log(`✅ Foto salva no banco com ID: ${newPhotoId}`);
    
    res.json({
      success: true,
      id: newPhotoId,
      url: cloudinaryResult.secure_url,
      title: title,
      message: 'Foto enviada e salva com sucesso!'
    });

  } catch (err) {
    console.error('❌ Erro no upload:', err);
    res.status(500).json({ error: 'Erro ao enviar imagem: ' + err.message });
  }
});

// 🔐 PROTEGIDO - PUT /api/photos/:id
app.put('/api/photos/:id', authenticateToken, async (req, res) => {
  try {
    console.log(`📝 Atualizando foto ID: ${req.params.id}`);
    const db = getDatabase();
    const { id } = req.params;
    const { title, description, category_id, is_featured } = req.body;
    
    const updateQuery = `
      UPDATE photos 
      SET title = $1, description = $2, category_id = $3, is_featured = $4
      WHERE id = $5
    `;
    
    const values = [
      title,
      description,
      category_id || null,
      is_featured ? true : false,
      id
    ];
    
    const result = await db.query(updateQuery, values);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }
    
    console.log('✅ Foto atualizada');
    res.json({ success: true, message: 'Foto atualizada com sucesso' });
    
  } catch (err) {
    console.error('❌ Erro ao atualizar foto:', err);
    res.status(500).json({ error: 'Erro ao atualizar foto' });
  }
});

// 🔐 PROTEGIDO - DELETE /api/photos/:id
app.delete('/api/photos/:id', authenticateToken, async (req, res) => {
  try {
    console.log(`🗑️ Deletando foto ID: ${req.params.id}`);
    const db = getDatabase();
    const { id } = req.params;
    
    // Buscar foto antes de deletar
    const selectResult = await db.query('SELECT filename FROM photos WHERE id = $1', [id]);
    const photo = selectResult.rows[0];
    
    if (!photo) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }
    
    try {
      // Deletar do Cloudinary se for URL do Cloudinary
      if (photo.filename && photo.filename.includes('cloudinary.com')) {
        const publicId = photo.filename.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`meu-portfolio/${publicId}`);
        console.log('✅ Foto deletada do Cloudinary');
      }
    } catch (cloudinaryErr) {
      console.error('⚠️ Erro ao deletar do Cloudinary:', cloudinaryErr);
      // Continuar mesmo se falhar no Cloudinary
    }
    
    // Deletar do banco
    const deleteResult = await db.query('DELETE FROM photos WHERE id = $1', [id]);
    
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Foto não encontrada' });
    }
    
    console.log('✅ Foto deletada do banco');
    res.json({ success: true, message: 'Foto deletada com sucesso' });
    
  } catch (err) {
    console.error('❌ Erro ao deletar foto:', err);
    res.status(500).json({ error: 'Erro ao deletar foto' });
  }
});

// 🔓 PÚBLICO - GET /api/categories
app.get('/api/categories', async (req, res) => {
  try {
    console.log('📂 Buscando categorias...');
    const db = getDatabase();
    
    const result = await db.query('SELECT * FROM categories ORDER BY name');
    console.log(`✅ ${result.rows.length} categorias encontradas`);
    res.json(result.rows);
    
  } catch (err) {
    console.error('❌ Erro ao buscar categorias:', err);
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

// ✅ Rotas de autenticação
app.use('/api/auth', authRoutes);

// ✅ Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'Photography API',
    status: 'online',
    database: 'PostgreSQL',
    environment: process.env.NODE_ENV,
    endpoints: ['/api/health', '/api/photos', '/api/auth', '/api/categories']
  });
});

// ✅ Middleware de tratamento de erros
app.use((error, req, res, next) => {
  console.error('❌ Erro não tratado:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo muito grande (máximo 10MB)' });
    }
  }
  
  // Não expor detalhes do erro em produção
  const message = process.env.NODE_ENV === 'production' 
    ? 'Erro interno do servidor' 
    : error.message;
  
  res.status(500).json({ error: message });
});

// ✅ CORREÇÃO: Inicializar banco antes de iniciar servidor
const startServer = async () => {
  try {
    await initializeDatabase();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`🔑 JWT Secret: ${process.env.JWT_SECRET ? '✅ Configurado' : '❌ Não configurado'}`);
      console.log(`🗄️ Database: ${process.env.DATABASE_URL ? '✅ Configurado' : '❌ Não configurado'}`);
      console.log(`🌍 CORS permitido para: ${allowedOrigins.join(', ')}`);
      console.log(`☁️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? '✅ Configurado' : '❌ Não configurado'}`);
    });
    
  } catch (err) {
    console.error('❌ Erro ao iniciar servidor:', err);
    process.exit(1);
  }
};

// ✅ Tratamento de sinais para graceful shutdown no Render
process.on('SIGTERM', () => {
  console.log('📴 SIGTERM recebido, desligando servidor graciosamente...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 SIGINT recebido, desligando servidor...');
  process.exit(0);
});

// ✅ Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
  // Em produção, pode ser necessário encerrar o processo
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

startServer();