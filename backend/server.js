require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { logger } = require('./utils/logger');
const aiService = require('./services/aiService');

const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

app.use(helmet({
  contentSecurityPolicy: false
}));

const corsWhitelist = (process.env.CORS_WHITELIST || '').split(',').filter(Boolean);
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (corsWhitelist.length === 0 || corsWhitelist.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS策略不允许该来源'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`
    });
  });
  next();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    aiEnabled: aiService.isApiKeyValid(),
    version: '1.1.0'
  });
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('/', (req, res) => {
  res.json({
    name: '学伴AI Backend',
    version: '1.4.0',
    description: '大学生智能学习助手后端服务',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      ai: '/api/ai',
      study: '/api/study',
      problem: '/api/problem',
      product: '/api/product',
      flashcard: '/api/flashcard',
      guide: '/api/guide',
      source: '/api/source',
      report: '/api/report',
      audio: '/api/audio',
      persona: '/api/persona'
    }
  });
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));
app.use('/api/study', require('./routes/studyRoutes'));
app.use('/api/problem', require('./routes/problemRoutes'));
app.use('/api/product', require('./routes/productRoutes'));
app.use('/api/flashcard', require('./routes/flashcardRoutes'));
app.use('/api/guide', require('./routes/learningGuideRoutes'));
app.use('/api/source', require('./routes/sourceAttributionRoutes'));
app.use('/api/report', require('./routes/reportGeneratorRoutes'));
app.use('/api/audio', require('./routes/audioOverviewRoutes'));
app.use('/api/persona', require('./routes/personaRoutes'));

app.use((req, res) => {
  res.status(404).json({ error: '接口不存在', path: req.path });
});

app.use((err, req, res, next) => {
  logger.error('Server Error', { 
    error: err.message, 
    stack: err.stack,
    path: req.path 
  });
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`学伴AI后端服务已启动`, {
    url: `http://0.0.0.0:${PORT}`,
    env: process.env.NODE_ENV || 'development',
    aiEnabled: aiService.isApiKeyValid()
  });
  console.log(`🎓 学伴AI后端服务已启动，运行在 http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/health`);
  console.log(`🤖 AI能力: ${aiService.isApiKeyValid() ? '✅ 已启用' : '⚠️ 未配置API Key (使用Fallback)'}`);
});

function gracefulShutdown(signal) {
  logger.info(`收到 ${signal} 信号，开始优雅关闭`);
  server.close(() => {
    logger.info('HTTP服务已关闭');
    process.exit(0);
  });
  
  setTimeout(() => {
    logger.error('强制关闭');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: reason?.message || reason });
});

module.exports = app;
