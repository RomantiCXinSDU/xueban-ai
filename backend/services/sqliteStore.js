const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { logger } = require('../utils/logger');

const DB_PATH = path.join(__dirname, '..', 'database', 'xuebanai.db');

class SQLiteStore {
  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error('SQLite连接失败', { error: err.message });
      } else {
        logger.info('SQLite数据库连接成功');
        this.initTables();
      }
    });
  }

  initTables() {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        password TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createWrongProblemsTable = `
      CREATE TABLE IF NOT EXISTS wrong_problems (
        id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        wrongAnswer TEXT,
        correctAnswer TEXT,
        analysis TEXT,
        category TEXT,
        userId TEXT DEFAULT 'default',
        reviewed INTEGER DEFAULT 0,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        reviewedAt TEXT
      )
    `;

    const createStudyPlansTable = `
      CREATE TABLE IF NOT EXISTS study_plans (
        id TEXT PRIMARY KEY,
        userId TEXT DEFAULT 'default',
        subject TEXT NOT NULL,
        goal TEXT NOT NULL,
        duration INTEGER NOT NULL,
        dailyHours INTEGER DEFAULT 2,
        planData TEXT,
        completedDays TEXT DEFAULT '[]',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createConversationsTable = `
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        userId TEXT DEFAULT 'default',
        messages TEXT DEFAULT '[]',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.run(createUsersTable);
    this.db.run(createWrongProblemsTable);
    this.db.run(createStudyPlansTable);
    this.db.run(createConversationsTable);
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    this.db.close();
  }

  async createUser(user) {
    const sql = `INSERT INTO users (id, username, email, password) VALUES (?, ?, ?, ?)`;
    return this.run(sql, [user.id, user.username, user.email, user.password]);
  }

  async getUserByUsername(username) {
    const sql = `SELECT * FROM users WHERE username = ?`;
    return this.get(sql, [username]);
  }

  async getUserById(id) {
    const sql = `SELECT * FROM users WHERE id = ?`;
    return this.get(sql, [id]);
  }

  async getAllUsers() {
    const sql = `SELECT id, username, email, createdAt FROM users`;
    return this.all(sql);
  }

  async createWrongProblem(problem) {
    const sql = `INSERT INTO wrong_problems (id, question, wrongAnswer, correctAnswer, analysis, category, userId) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    return this.run(sql, [problem.id, problem.question, problem.wrongAnswer, problem.correctAnswer, problem.analysis, problem.category, problem.userId || 'default']);
  }

  async getWrongProblems(userId = 'default', category = null, reviewed = null) {
    let sql = `SELECT * FROM wrong_problems WHERE userId = ?`;
    const params = [userId];
    
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    
    if (reviewed !== null) {
      sql += ` AND reviewed = ?`;
      params.push(reviewed ? 1 : 0);
    }
    
    sql += ` ORDER BY createdAt DESC`;
    return this.all(sql, params);
  }

  async updateWrongProblem(id, updates) {
    const fields = [];
    const params = [];
    
    if (updates.reviewed !== undefined) {
      fields.push('reviewed = ?');
      params.push(updates.reviewed ? 1 : 0);
    }
    if (updates.reviewedAt) {
      fields.push('reviewedAt = ?');
      params.push(updates.reviewedAt);
    }
    if (updates.wrongAnswer) {
      fields.push('wrongAnswer = ?');
      params.push(updates.wrongAnswer);
    }
    if (updates.correctAnswer) {
      fields.push('correctAnswer = ?');
      params.push(updates.correctAnswer);
    }
    if (updates.analysis) {
      fields.push('analysis = ?');
      params.push(updates.analysis);
    }
    
    params.push(id);
    
    const sql = `UPDATE wrong_problems SET ${fields.join(', ')} WHERE id = ?`;
    return this.run(sql, params);
  }

  async deleteWrongProblem(id) {
    const sql = `DELETE FROM wrong_problems WHERE id = ?`;
    return this.run(sql, [id]);
  }

  async createStudyPlan(plan) {
    const sql = `INSERT INTO study_plans (id, userId, subject, goal, duration, dailyHours, planData) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    return this.run(sql, [plan.id, plan.userId || 'default', plan.subject, plan.goal, plan.duration, plan.dailyHours || 2, JSON.stringify(plan.planData || {})]);
  }

  async getStudyPlans(userId = 'default') {
    const sql = `SELECT * FROM study_plans WHERE userId = ? ORDER BY createdAt DESC`;
    return this.all(sql, [userId]);
  }

  async getStudyPlanById(id) {
    const sql = `SELECT * FROM study_plans WHERE id = ?`;
    const plan = await this.get(sql, [id]);
    if (plan) {
      plan.planData = JSON.parse(plan.planData || '{}');
      plan.completedDays = JSON.parse(plan.completedDays || '[]');
    }
    return plan;
  }

  async updateStudyPlan(id, updates) {
    const fields = [];
    const params = [];
    
    if (updates.completedDays) {
      fields.push('completedDays = ?');
      params.push(JSON.stringify(updates.completedDays));
    }
    if (updates.updatedAt) {
      fields.push('updatedAt = ?');
      params.push(updates.updatedAt);
    }
    
    params.push(id);
    
    const sql = `UPDATE study_plans SET ${fields.join(', ')} WHERE id = ?`;
    return this.run(sql, params);
  }

  async deleteStudyPlan(id) {
    const sql = `DELETE FROM study_plans WHERE id = ?`;
    return this.run(sql, [id]);
  }

  async createConversation(conversation) {
    const sql = `INSERT INTO conversations (id, userId, messages) VALUES (?, ?, ?)`;
    return this.run(sql, [conversation.id, conversation.userId || 'default', JSON.stringify(conversation.messages || [])]);
  }

  async getConversation(id) {
    const sql = `SELECT * FROM conversations WHERE id = ?`;
    const conv = await this.get(sql, [id]);
    if (conv) {
      conv.messages = JSON.parse(conv.messages || '[]');
    }
    return conv;
  }

  async updateConversation(id, messages) {
    const sql = `UPDATE conversations SET messages = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`;
    return this.run(sql, [JSON.stringify(messages), id]);
  }
}

const db = new SQLiteStore();

module.exports = { SQLiteStore, db };
