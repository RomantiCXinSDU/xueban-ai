const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const users = [];

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
};

exports.authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '访问被拒绝，需要登录' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '无效的token' });
    }
    req.user = user;
    next();
  });
};

exports.register = async (req, res) => {
  try {
    const { username, email, password, major } = req.body;

    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({ error: '该邮箱已被注册' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      username,
      email,
      password: hashedPassword,
      major,
      createdAt: new Date()
    };

    users.push(user);
    const token = generateToken(user.id);

    res.status(201).json({
      message: '注册成功',
      token,
      user: { id: user.id, username: user.username, email: user.email, major: user.major }
    });
  } catch (error) {
    res.status(500).json({ error: '服务器内部错误' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(400).json({ error: '邮箱或密码错误' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: '邮箱或密码错误' });
    }

    const token = generateToken(user.id);

    res.json({
      message: '登录成功',
      token,
      user: { id: user.id, username: user.username, email: user.email, major: user.major }
    });
  } catch (error) {
    res.status(500).json({ error: '服务器内部错误' });
  }
};

exports.getProfile = (req, res) => {
  const user = users.find(u => u.id === req.user.userId);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    major: user.major,
    createdAt: user.createdAt
  });
};

exports.updateProfile = (req, res) => {
  const user = users.find(u => u.id === req.user.userId);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const { username, major } = req.body;
  if (username) user.username = username;
  if (major) user.major = major;

  res.json({
    message: '更新成功',
    user: { id: user.id, username: user.username, email: user.email, major: user.major }
  });
};