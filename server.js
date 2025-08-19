const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { router: authRoutes } = require('./routes/auth');
const { initDatabase } = require('./database/init');
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

// Middleware CORS - CORRIGIDO
const allowedOrigins = [
  'http://localhost:5173',     // Vite dev
  'http://localhost:5174',
  'http://localhost:3000',
  'https://luanferreira.onrender.com',  // Seu frontend em produção
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

// NOVA ROTA - GET /api/photos (para listar fotos)
app.get('/api/photos', (req, res) => {
  // Por enquanto retorna array vazio - você pode conectar com seu banco depois
  res.json([]);
});

// Rota de upload de fotos para Cloudinary - SINTAXE CORRIGIDA
app.post('/api/photos', upload.single('photo'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'meu-portfolio' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });

    res.json({ 
      success: true,
      url: result.secure_url,
      message: 'Upload realizado com sucesso!'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar imagem' });
  }
});

// Rotas existentes
app.use('/api/auth', authRoutes);

// Rota de teste - SINTAXE CORRIGIDA
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
    endpoints: ['/api/health', '/api/photos', '/api/auth']
  });
});

// Middleware de tratamento de erros - SINTAXE CORRIGIDA
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Algo deu errado!' });
});

// Iniciar servidor - SINTAXE CORRIGIDA
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`CORS permitido para:`, allowedOrigins);
});
