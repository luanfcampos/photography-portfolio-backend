const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// ✅ CORREÇÃO: Usar postgres.js ao invés de init.js
const { getDatabase } = require('../database/postgres');
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
      console.error('❌ Erro JWT verify:', err); // DEBUG adicional
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// ✅ Login com JWT real + DEBUG melhorado
router.post('/login', async (req, res) => {
  console.log('🔄 Rota /login chamada'); // DEBUG
  console.log('📨 Dados recebidos:', req.body); // DEBUG
  console.log('🌍 Headers:', req.headers); // DEBUG adicional
  
  try {
    const { username, password } = req.body;

    // Validação básica
    if (!username || !password) {
      console.log('❌ Dados faltando:', { username: !!username, password: !!password }); // DEBUG
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }

    console.log('🔐 JWT_SECRET definido:', !!process.env.JWT_SECRET); // DEBUG
    console.log('🗄️ DATABASE_URL definido:', !!process.env.DATABASE_URL); // DEBUG

    // Verificar conexão com banco
    let db;
    try {
      db = getDatabase();
      console.log('✅ Conexão com banco obtida'); // DEBUG
    } catch (dbConnectionError) {
      console.error('❌ Erro ao conectar com banco:', dbConnectionError); // DEBUG
      return res.status(500).json({ error: 'Erro de conexão com banco de dados' });
    }

    try {
      console.log('🔍 Buscando usuário:', username); // DEBUG
      
      // ✅ CORREÇÃO: Usar query async/await do PostgreSQL
      const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
      console.log('📊 Resultado da consulta:', { rowCount: result.rows.length }); // DEBUG
      
      const user = result.rows[0];

      if (!user) {
        console.log('❌ Usuário não encontrado'); // DEBUG
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      console.log('✅ Usuário encontrado, verificando senha...'); // DEBUG
      console.log('🔑 Hash no banco:', user.password ? 'EXISTS' : 'NULL'); // DEBUG
      
      // Verificar senha
      const validPassword = await bcrypt.compare(password, user.password);
      console.log('🔓 Senha válida:', validPassword); // DEBUG
      
      if (!validPassword) {
        console.log('❌ Senha inválida'); // DEBUG
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      console.log('🎫 Gerando token JWT...'); // DEBUG
      
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

      console.log('✅ Token gerado com sucesso'); // DEBUG
      console.log('📤 Enviando resposta de sucesso'); // DEBUG

      const response = {
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      };

      console.log('📋 Resposta final:', { ...response, token: 'TOKEN_HIDDEN' }); // DEBUG
      
      return res.json(response);
      
    } catch (dbError) {
      console.error('❌ Erro na consulta do banco:', dbError); // DEBUG
      console.error('❌ Stack do erro:', dbError.stack); // DEBUG adicional
      return res.status(500).json({ error: 'Erro interno do servidor - banco' });
    }
    
  } catch (error) {
    console.error('❌ Erro geral no login:', error); // DEBUG
    console.error('❌ Stack do erro:', error.stack); // DEBUG adicional
    return res.status(500).json({ error: 'Erro interno do servidor' });
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