const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

function writeLog(level, message, meta) {
  if (LOG_LEVELS[level] < currentLevel) return;

  const logLine = formatLog(level, message, meta) + '\n';

  console.log(logLine.trim());

  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (err) {
    console.error('日志写入失败:', err.message);
  }
}

const logger = {
  debug: (message, meta) => writeLog('DEBUG', message, meta),
  info: (message, meta) => writeLog('INFO', message, meta),
  warn: (message, meta) => writeLog('WARN', message, meta),
  error: (message, meta) => writeLog('ERROR', message, meta)
};

module.exports = { 
  logger,
  LOG_LEVELS,
  formatLog,
  writeLog
};
