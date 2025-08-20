const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../database/init');
const router = express.Router();

// ✅ Middleware de autenticação JWT real
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// ✅ Login com JWT real
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    const db = getDatabase();
    
    try {
      // Buscar usuário no banco - PostgreSQL usa $1, $2 para parâmetros
      const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
      const user = result.rows[0];

      if (!user) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Verificar senha
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Gerar JWT real
      const token = jwt.sign(
        { 
          id: user.id, 
          username: user.username,
          email: user.email 
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' } // Token expira em 7 dias
      );

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      });
    } catch (dbError) {
      console.error('Erro ao buscar usuário:', dbError);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ✅ Alterar senha (protegido por autenticação)
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }

    const db = getDatabase();
    const userId = req.user.id;

    try {
      // Buscar usuário atual
      const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = result.rows[0];

      if (!user) {
        return res.status(500).json({ error: 'Erro ao buscar usuário' });
      }

      // Verificar senha atual
      const validCurrentPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validCurrentPassword) {
        return res.status(400).json({ error: 'Senha atual incorreta' });
      }

      // Hash da nova senha
      const saltRounds = 12; // Mais seguro que 10
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Atualizar senha no banco
      await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedNewPassword, userId]);

      res.json({ 
        success: true, 
        message: 'Senha alterada com sucesso' 
      });
    } catch (dbError) {
      console.error('Erro ao atualizar senha:', dbError);
      return res.status(500).json({ error: 'Erro ao atualizar senha' });
    }
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ✅ Alterar dados do perfil
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { username, email } = req.body;
    const userId = req.user.id;

    if (!username || !email) {
      return res.status(400).json({ error: 'Nome de usuário e email são obrigatórios' });
    }

    const db = getDatabase();
    
    try {
      // Verificar se username já existe (para outro usuário)
      const existingResult = await db.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, userId]);
      const existingUser = existingResult.rows[0];

      if (existingUser) {
        return res.status(400).json({ error: 'Nome de usuário já está em uso' });
      }

      // Atualizar dados
      await db.query('UPDATE users SET username = $1, email = $2 WHERE id = $3', [username, email, userId]);

      res.json({ 
        success: true, 
        message: 'Perfil atualizado com sucesso',
        user: { username, email }
      });
    } catch (dbError) {
      console.error('Erro ao atualizar perfil:', dbError);
      return res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ✅ Verificar se token é válido
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ 
    success: true, 
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email
    }
  });
});

// ✅ Logout (invalidar token no frontend)
router.post('/logout', (req, res) => {
  // JWT é stateless, então logout é feito no frontend removendo o token
  res.json({ success: true, message: 'Logout realizado com sucesso' });
});

module.exports = { router, authenticateToken };