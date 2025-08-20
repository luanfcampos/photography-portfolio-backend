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
    
    // Buscar usuário no banco
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        console.error('Erro ao buscar usuário:', err);
        return res.status(500).json({ error: 'Erro interno do servidor' });
      }

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
    });
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

    // Buscar usuário atual
    db.get('SELECT * FROM users WHERE id = ?', [userId], async (err, user) => {
      if (err || !user) {
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
      db.run('UPDATE users SET password = ? WHERE id = ?', [hashedNewPassword, userId], (err) => {
        if (err) {
          console.error('Erro ao atualizar senha:', err);
          return res.status(500).json({ error: 'Erro ao atualizar senha' });
        }

        res.json({ 
          success: true, 
          message: 'Senha alterada com sucesso' 
        });
      });
    });
  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ✅ Alterar dados do perfil
router.put('/profile', authenticateToken, (req, res) => {
  try {
    const { username, email } = req.body;
    const userId = req.user.id;

    if (!username || !email) {
      return res.status(400).json({ error: 'Nome de usuário e email são obrigatórios' });
    }

    const db = getDatabase();
    
    // Verificar se username já existe (para outro usuário)
    db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId], (err, existingUser) => {
      if (err) {
        return res.status(500).json({ error: 'Erro ao verificar usuário' });
      }

      if (existingUser) {
        return res.status(400).json({ error: 'Nome de usuário já está em uso' });
      }

      // Atualizar dados
      db.run('UPDATE users SET username = ?, email = ? WHERE id = ?', [username, email, userId], (err) => {
        if (err) {
          console.error('Erro ao atualizar perfil:', err);
          return res.status(500).json({ error: 'Erro ao atualizar perfil' });
        }

        res.json({ 
          success: true, 
          message: 'Perfil atualizado com sucesso',
          user: { username, email }
        });
      });
    });
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