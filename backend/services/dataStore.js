const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '..', 'database');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class DataStore {
  constructor(filename) {
    this.filePath = path.join(DATA_DIR, `${filename}.json`);
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      logger.error('DataStore load error', { error: error.message });
    }
    return {};
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
      return true;
    } catch (error) {
      logger.error('DataStore save error', { error: error.message });
      return false;
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    return this.save();
  }

  delete(key) {
    delete this.data[key];
    return this.save();
  }

  getAll() {
    return { ...this.data };
  }

  appendToList(key, item) {
    if (!this.data[key]) {
      this.data[key] = [];
    }
    this.data[key].push(item);
    return this.save();
  }

  updateInList(key, id, updates) {
    if (!this.data[key]) return null;
    const index = this.data[key].findIndex(item => item.id === id);
    if (index === -1) return null;
    this.data[key][index] = { ...this.data[key][index], ...updates };
    this.save();
    return this.data[key][index];
  }

  deleteFromList(key, id) {
    if (!this.data[key]) return false;
    const initialLength = this.data[key].length;
    this.data[key] = this.data[key].filter(item => item.id !== id);
    if (this.data[key].length !== initialLength) {
      this.save();
      return true;
    }
    return false;
  }

  getFromList(key, id) {
    if (!this.data[key]) return null;
    return this.data[key].find(item => item.id === id);
  }
}

const usersStore = new DataStore('users');
const conversationsStore = new DataStore('conversations');
const wrongProblemsStore = new DataStore('wrong_problems');
const studyPlansStore = new DataStore('study_plans');

module.exports = {
  DataStore,
  usersStore,
  conversationsStore,
  wrongProblemsStore,
  studyPlansStore
};
