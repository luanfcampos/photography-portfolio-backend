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

// Middleware CORS
const allowedOrigins = [
  'http://localhost:5174',
  'http://localhost:3000',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Inicializar banco de dados
initDatabase();

// Configuração Multer (upload em memória)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Rota de upload de fotos para Cloudinary
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

    res.json({ url: result.secure_url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar imagem' });
  }
});

// Rotas existentes
app.use('/api/auth', authRoutes);

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ message: 'Backend funcionando!', timestamp: new Date().toISOString() });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Algo deu errado!' });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
