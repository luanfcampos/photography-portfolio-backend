const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { getDatabase } = require('../database/init')

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || 'seu-jwt-secret-super-seguro'

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' })
  }

  const db = getDatabase()
  
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      console.error('Erro no banco de dados:', err)
      return res.status(500).json({ error: 'Erro interno do servidor' })
    }

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado' })
    }

    // Verificar senha
    const isValidPassword = bcrypt.compareSync(password, user.password)
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Senha incorreta' })
    }

    // Gerar token JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username 
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({
      message: 'Login realizado com sucesso',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    })
  })
})

// Verificar token
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    res.json({ valid: true, user: decoded })
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' })
  }
})

// Middleware para verificar autenticação
function authenticateToken(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido' })
  }
}

module.exports = { router, authenticateToken }

