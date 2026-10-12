const aiService = require('./aiService');
const { logger } = require('../utils/logger');
const { DataStore } = require('./dataStore');

const flashcardStore = new DataStore('flashcards');

class FlashcardService {
  getStore(userId) {
    const data = flashcardStore.get(userId);
    return Array.isArray(data) ? data : [];
  }

  saveStore(userId, decks) {
    flashcardStore.set(userId, decks);
  }

  async generateFromText(userId, { text, count = 10, type = 'flashcard', subject = '', difficulty = 'medium', deckName = '' }) {
    try {
      const prompt = this.buildGenerationPrompt(text, count, type, subject, difficulty);
      const response = await aiService.chat(prompt, { context: { type: 'flashcard-generation' } });

      let cards = this.parseGeneratedCards(response.content, type);

      // AI 不可用或返回无法解析的内容时，使用本地 fallback 从文本直接提取
      if (!cards.length) {
        logger.warn('AI 未返回有效闪卡，使用本地提取', { model: response.model });
        cards = this.extractCardsFromText(text, count, type);
      }

      // 确定卡组类型标签
      const typeLabel = type === 'quiz' ? '测验' : '闪卡';
      const baseTitle = deckName || `${subject || '学习资料'} ${typeLabel}`;

      // 同类型不重名：检查已有卡组
      const existingDecks = this.getDecks(userId);
      let finalTitle = baseTitle;
      let suffix = 1;
      while (existingDecks.some(d => d.title === finalTitle && d.cardType === type)) {
        suffix++;
        finalTitle = `${baseTitle} ${suffix}`;
      }

      const deck = {
        id: `deck_${Date.now()}`,
        userId,
        title: finalTitle,
        cardType: type,
        cards,
        createdAt: new Date().toISOString(),
        stats: {
          total: cards.length,
          mastered: 0,
          learning: 0,
          new: cards.length
        }
      };

      const decks = this.getStore(userId);
      decks.push(deck);
      this.saveStore(userId, decks);
      logger.info('生成闪卡成功', { userId, count: cards.length });

      return { success: true, deck };
    } catch (error) {
      logger.error('生成闪卡失败', { error: error.message });
      throw error;
    }
  }

  // 本地 fallback：从文本中提取单词-释义对生成闪卡
  extractCardsFromText(text, count, type) {
    if (!text) return [];
    const cards = [];
    const existingWords = new Set();
    const wordPairs = []; // 收集所有 word-meaning 对，用于生成测验干扰项

    // 归一化：tab 转换行（处理两列 PDF 表格）
    const normalized = text.replace(/\t/g, '\n');
    const lines = normalized.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

    // 模式1：词汇表格式 "数字 单词" 后跟音标和释义
    const wordLineRegex = /^(\d+)\s+([a-zA-Z][a-zA-Z\-]*)\s*$/;

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(wordLineRegex);
      if (!m) continue;

      const word = m[2].toLowerCase();
      if (existingWords.has(word)) continue;

      let phonetic = '';
      let meaning = '';
      let j = i + 1;

      // 下一行可能是音标，也可能音标+释义在同一行
      if (j < lines.length) {
        const phMatch = lines[j].match(/^(\/[^\/]+\/)\s*(.*)$/);
        if (phMatch) {
          phonetic = phMatch[1];
          meaning = phMatch[2];
          j++;
        }
      }

      // 收集剩余释义行，直到遇到下一个词条
      const meaningLines = meaning ? [meaning] : [];
      for (; j < lines.length; j++) {
        if (wordLineRegex.test(lines[j])) break;      // 下一个词条
        if (/^\d+$/.test(lines[j])) break;             // 另一列的序号
        if (/^Page-\d+/.test(lines[j])) break;         // 页码标记
        if (/^--\s*\d+\s*of/i.test(lines[j])) break;   // 页码标记
        if (/^No\.\s*Word/i.test(lines[j])) break;     // 表头
        if (/^Date\s*[:：]?$/i.test(lines[j])) break;  // 日期标记
        meaningLines.push(lines[j]);
      }

      meaning = meaningLines.join(' ').trim();
      if (!meaning || meaning.length < 1) continue;

      existingWords.add(word);
      wordPairs.push({ word, phonetic, meaning });
    }

    // 模式2：分隔符格式 "word - 释义" / "word: 释义" 等
    if (wordPairs.length === 0) {
      const sepRegex = /^([^\s\-:：=—→|].+?)\s*[-:：=—→|]\s*(.+)$/;
      for (const line of lines) {
        const cleaned = line.replace(/^\d+[\.\)、]\s*/, '');
        const m = cleaned.match(sepRegex);
        if (!m) continue;
        const front = m[1].trim().toLowerCase();
        const back = m[2].trim();
        if (!front || !back || front.length > 200 || existingWords.has(front)) continue;
        existingWords.add(front);
        wordPairs.push({ word: front, phonetic: '', meaning: back });
      }
    }

    // 限制数量
    const selected = wordPairs.slice(0, count);

    // 生成卡片
    if (type === 'quiz') {
      // 测验模式：生成句子填空、选词等题型
      return this._generateQuizCards(selected, wordPairs);
    } else {
      // 闪卡模式
      return selected.map((pair, idx) => ({
        id: `card_${Date.now()}_${idx}`,
        front: pair.word,
        back: `${pair.phonetic ? pair.phonetic + ' ' : ''}${pair.meaning}`,
        tags: [],
        hint: pair.phonetic || '',
        mastery: 0,
        reviewCount: 0,
        nextReview: null,
        createdAt: new Date()
      }));
    }
  }

  // 生成测验卡片（句子填空、选词等）
  _generateQuizCards(selected, allPairs) {
    const cards = [];
    const questionTypes = ['cloze_en', 'cloze_cn', 'meaning_choice'];

    selected.forEach((pair, idx) => {
      const qType = questionTypes[idx % questionTypes.length];
      // 从全部单词中选3个干扰项
      const distractors = allPairs
        .filter(p => p.word !== pair.word)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);

      if (distractors.length < 3) {
        // 干扰项不足，跳过复杂题型，用简单题
        cards.push(this._makeSimpleQuiz(pair, idx));
        return;
      }

      if (qType === 'cloze_en') {
        // 英文句子填空：给出含空格的英文句子，选正确的单词填入
        const sentence = this._makeClozeSentence(pair);
        const options = this._shuffleOptions([
          pair.word, ...distractors.map(d => d.word)
        ]);
        const correctIdx = options.indexOf(pair.word);
        cards.push({
          id: `quiz_${Date.now()}_${idx}`,
          question: `填入合适的单词：\n"${sentence}"`,
          type: 'cloze',
          options: options.map(o => o),
          correctAnswer: String.fromCharCode(65 + correctIdx),
          explanation: `${pair.word} ${pair.phonetic} ${pair.meaning}`,
          tags: [],
          difficulty: 'medium',
          createdAt: new Date()
        });
      } else if (qType === 'cloze_cn') {
        // 中文释义选词：给出中文释义，选正确的英文单词
        const options = this._shuffleOptions([
          pair.word, ...distractors.map(d => d.word)
        ]);
        const correctIdx = options.indexOf(pair.word);
        cards.push({
          id: `quiz_${Date.now()}_${idx}`,
          question: `下列哪个单词表示"${this._cleanMeaning(pair.meaning)}"？`,
          type: 'meaning_choice',
          options: options.map(o => o),
          correctAnswer: String.fromCharCode(65 + correctIdx),
          explanation: `${pair.word} ${pair.phonetic} ${pair.meaning}`,
          tags: [],
          difficulty: 'easy',
          createdAt: new Date()
        });
      } else {
        // 英文选中文：给出英文单词，选正确的中文释义
        const options = this._shuffleOptions([
          pair.meaning, ...distractors.map(d => d.meaning)
        ]);
        const correctIdx = options.indexOf(pair.meaning);
        cards.push({
          id: `quiz_${Date.now()}_${idx}`,
          question: `"${pair.word}" ${pair.phonetic} 的中文释义是？`,
          type: 'meaning_choice',
          options: options.map(o => this._cleanMeaning(o)),
          correctAnswer: String.fromCharCode(65 + correctIdx),
          explanation: `${pair.word} ${pair.phonetic} ${pair.meaning}`,
          tags: [],
          difficulty: 'easy',
          createdAt: new Date()
        });
      }
    });

    return cards;
  }

  // 生成填空句子
  _makeClozeSentence(pair) {
    const word = pair.word;
    const meaning = pair.meaning.toLowerCase();

    // 根据词性选择句子模板
    if (/n\.|n\/|名词/.test(meaning)) {
      // 名词模板
      const templates = [
        `The teacher explained the concept of ______ clearly.`,
        `She showed great ______ in dealing with the problem.`,
        `His ______ was obvious to everyone in the room.`,
        `The book discusses the ______ of modern society.`,
        `We need to understand the ______ behind this theory.`
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    } else if (/v\.|vt\.|vi\.|v\/|动词/.test(meaning)) {
      // 动词模板
      const templates = [
        `He decided to ______ the challenge head-on.`,
        `They will ______ the issue at the next meeting.`,
        `She managed to ______ her goal despite difficulties.`,
        `The students need to ______ this concept carefully.`,
        `It is important to ______ the rules before starting.`
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    } else if (/adj\.|adj\/|形容词/.test(meaning)) {
      // 形容词模板
      const templates = [
        `The ______ result surprised everyone in the room.`,
        `She gave a ______ performance in the competition.`,
        `His ______ attitude impressed the interviewers.`,
        `The weather was ______ for an outdoor activity.`,
        `The ______ solution worked perfectly for the problem.`
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    } else if (/adv\.|adv\/|副词/.test(meaning)) {
      // 副词模板
      const templates = [
        `She spoke ______ to the audience during the speech.`,
        `He completed the task ______ and efficiently.`,
        `The project progressed ______ under her leadership.`,
        `They worked ______ to meet the deadline.`,
        `The student answered the question ______.`
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    } else {
      // 通用模板
      const templates = [
        `The word "______" is commonly used in academic writing.`,
        `Can you use "______" in a sentence?`,
        `The teacher asked the students to explain "______".`,
        `In this context, "______" plays an important role.`,
        `Understanding "______" is essential for this course.`
      ];
      return templates[Math.floor(Math.random() * templates.length)];
    }
  }

  _shuffleOptions(options) {
    return [...options].sort(() => Math.random() - 0.5);
  }

  _cleanMeaning(meaning) {
    // 清理释义，去除多余部分
    return meaning.replace(/^(n|v|vt|vi|adj|adv|prep|conj|pron|num|art|aux)\.\s*/g, '').trim();
  }

  _makeSimpleQuiz(pair, idx) {
    return {
      id: `quiz_${Date.now()}_${idx}`,
      question: `"${pair.word}" ${pair.phonetic} 的中文释义是？`,
      type: 'meaning_choice',
      options: [this._cleanMeaning(pair.meaning), '（无干扰项）', '（无干扰项）', '（无干扰项）'],
      correctAnswer: 'A',
      explanation: `${pair.word} ${pair.phonetic} ${pair.meaning}`,
      tags: [],
      difficulty: 'easy',
      createdAt: new Date()
    };
  }

  async generateFromNotebook(userId, notebookId, { count = 10, type = 'flashcard', subject = '', deckName = '' }) {
    // 从笔记本内容生成
    const productService = require('./productService');
    const workspace = productService.getWorkspace(userId);
    const notebook = workspace.notebooks?.find(n => n.id === notebookId);

    if (!notebook) {
      throw new Error('笔记本不存在');
    }

    // 合并笔记本所有来源的内容
    let content = '';
    if (notebook.sources) {
      content = notebook.sources.map(s => s.content || s.text || '').join('\n\n');
    }

    return this.generateFromText(userId, { text: content, count, type, subject: subject || notebook.title, deckName });
  }

  buildGenerationPrompt(text, count, type, subject, difficulty) {
    const difficultyText = {
      easy: '生成简单的概念性问题',
      medium: '生成中等难度的理解性问题',
      hard: '生成综合性应用问题'
    };

    if (type === 'flashcard') {
      return `你是AI学习助手，负责从以下学习资料生成高质量的闪卡。

学习资料：
${text}

请生成${count}张高质量闪卡，使用以下JSON格式：
[
  {
    "front": "问题/概念（正面）",
    "back": "答案/解释（背面）",
    "tags": ["标签1", "标签2"],
    "hint": "可选提示"
  }
]

要求：
1. ${difficultyText[difficulty] || difficultyText.medium}
2. 正面要简洁明了，便于快速回忆
3. 背面要有清晰的答案和简要解释
4. 涵盖概念的多个方面
5. 只返回JSON数组，不要其他内容`;
    }

    if (type === 'quiz') {
      return `你是AI学习助手，负责从以下学习资料生成高质量的测验题目。

学习资料：
${text}

请生成${count}道高质量测验题目，使用以下JSON格式：
[
  {
    "question": "题目内容",
    "type": "multiple_choice", // 或 "true_false", "fill_blank"
    "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
    "correctAnswer": "A", // 或 "true", "答案"
    "explanation": "详细解析",
    "tags": ["标签1"],
    "difficulty": "medium" // easy, medium, hard
  }
]

要求：
1. ${difficultyText[difficulty] || difficultyText.medium}
2. 选项要合理，干扰项要有一定迷惑性
3. 每道题都要有详细解析
4. 涵盖不同知识点
5. 只返回JSON数组，不要其他内容`;
    }

    return '';
  }

  parseGeneratedCards(content, type) {
    try {
      // 尝试提取JSON
      let jsonStr = content;
      
      // 移除markdown代码块
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // 尝试直接解析
      let parsed = JSON.parse(jsonStr.trim());
      
      // 标准化格式
      if (type === 'flashcard') {
        return parsed.map((card, idx) => ({
          id: `card_${Date.now()}_${idx}`,
          front: card.front,
          back: card.back,
          tags: card.tags || [],
          hint: card.hint || '',
          mastery: 0, // 0-5 掌握度
          reviewCount: 0,
          nextReview: null,
          createdAt: new Date()
        }));
      }

      if (type === 'quiz') {
        return parsed.map((q, idx) => ({
          id: `quiz_${Date.now()}_${idx}`,
          question: q.question,
          type: q.type || 'multiple_choice',
          options: q.options || [],
          correctAnswer: q.correctAnswer,
          explanation: q.explanation || '',
          tags: q.tags || [],
          difficulty: q.difficulty || 'medium',
          createdAt: new Date()
        }));
      }

      return parsed;
    } catch (error) {
      logger.error('解析闪卡JSON失败', { error: error.message });
      return [];
    }
  }

  getDecks(userId) {
    return this.getStore(userId).filter(d => !d.deleted);
  }

  getDeck(userId, deckId) {
    const deck = this.getStore(userId).find(d => d.id === deckId);
    if (!deck) return null;
    
    return {
      ...deck,
      cards: deck.cards.filter(c => !c.deleted)
    };
  }

  updateCardMastery(userId, deckId, cardId, mastery) {
    const decks = this.getStore(userId);
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return null;

    const card = deck.cards.find(c => c.id === cardId);
    if (!card) return null;

    card.mastery = Math.min(5, Math.max(0, mastery));
    card.reviewCount = (card.reviewCount || 0) + 1;
    card.lastReviewedAt = new Date().toISOString();
    
    // 计算下次复习时间 (艾宾浩斯遗忘曲线)
    card.nextReview = this.calculateNextReview(card.mastery, card.reviewCount);

    // 更新deck统计
    deck.stats = {
      total: deck.cards.length,
      mastered: deck.cards.filter(c => c.mastery >= 4).length,
      learning: deck.cards.filter(c => c.mastery > 0 && c.mastery < 4).length,
      new: deck.cards.filter(c => c.mastery === 0).length
    };

    this.saveStore(userId, decks);
    return card;
  }

  calculateNextReview(mastery, reviewCount) {
    // 简化版艾宾浩斯遗忘曲线
    const intervals = {
      0: 1,    // 刚学习，1分钟后复习
      1: 10,   // 有点印象，10分钟
      2: 60,   // 1小时
      3: 1440, // 1天
      4: 4320, // 3天
      5: 10080 // 7天
    };

    const minutes = intervals[mastery] || 1440;
    return new Date(Date.now() + minutes * 60 * 1000);
  }

  getCardsForReview(userId, deckId) {
    const deck = this.getDeck(userId, deckId);
    if (!deck) return [];

    const now = new Date();
    return deck.cards.filter(card => {
      if (!card.nextReview) return true;
      return new Date(card.nextReview) <= now;
    });
  }

  deleteDeck(userId, deckId) {
    const decks = this.getStore(userId);
    const deck = decks.find(d => d.id === deckId);
    if (deck) {
      deck.deleted = true;
      this.saveStore(userId, decks);
      return true;
    }
    return false;
  }

  deleteCard(userId, deckId, cardId) {
    const decks = this.getStore(userId);
    const deck = decks.find(d => d.id === deckId);
    if (deck) {
      const card = deck.cards.find(c => c.id === cardId);
      if (card) {
        card.deleted = true;
        this.saveStore(userId, decks);
        return true;
      }
    }
    return false;
  }

  // 获取学习统计
  getStats(userId) {
    const decks = this.getDecks(userId);
    const allCards = decks.flatMap(d => d.cards);
    
    return {
      totalDecks: decks.length,
      totalCards: allCards.length,
      masteredCards: allCards.filter(c => c.mastery >= 4).length,
      learningCards: allCards.filter(c => c.mastery > 0 && c.mastery < 4).length,
      newCards: allCards.filter(c => c.mastery === 0).length,
      dueForReview: allCards.filter(c => {
        if (!c.nextReview) return true;
        return new Date(c.nextReview) <= new Date();
      }).length
    };
  }
}

module.exports = new FlashcardService();
