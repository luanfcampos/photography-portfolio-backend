const express = require('express')
const cors = require('cors')
const path = require('path')
require('dotenv').config()

const { router: authRoutes } = require('./routes/auth')
const photoRoutes = require('./routes/photos')
const { initDatabase } = require('./database/init')

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: ['http://localhost:5174', 'http://localhost:3000'],
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Servir arquivos estáticos (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Inicializar banco de dados
initDatabase()

// Rotas
app.use('/api/auth', authRoutes)
app.use('/api/photos', photoRoutes)
app.use('/api/admin/photos', photoRoutes)

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ message: 'Backend funcionando!', timestamp: new Date().toISOString() })
})

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Algo deu errado!' })
})

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`)
  console.log(`Acesse: http://localhost:${PORT}`)
})

