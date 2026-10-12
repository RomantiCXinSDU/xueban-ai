const aiService = require('./aiService');
const { logger } = require('../utils/logger');
const { DataStore } = require('./dataStore');

const personaStore = new DataStore('personas');

class PersonaService {
  constructor() {
    this.defaultPersonas = [
      {
        id: 'phd-advisor',
        name: '博士导师',
        description: '严谨的学术导师，挑战你的每一个假设',
        systemPrompt: `你是我的研究导师，一位严谨的博士级学者。你的职责是：
1. 对我的每一个假设进行严格挑战
2. 提出深入的问题，迫使我深入思考
3. 指出逻辑漏洞和潜在的谬误
4. 要求我从根本上论证我的观点
5. 使用学术化的语言，但保持清晰易懂
6. 当我犯错时，耐心指出并提供正确的方向

你的风格：专业、严谨、鼓励深度思考`,
        avatar: '🎓',
        category: '学术'
      },
      {
        id: 'exam-tutor',
        name: '考试教练',
        description: '专注于帮你通过考试的实用型导师',
        systemPrompt: `你是我的考试教练，目标是帮助我高效通过考试。你的职责是：
1. 专注于考试重点和高频考点
2. 教我记忆技巧和解题套路
3. 分析常见考试陷阱
4. 提供应试策略和时间管理建议
5. 用简洁明了的语言讲解
6. 避免过度深入，聚焦考试范围

你的风格：务实、高效、考试导向`,
        avatar: '📝',
        category: '考试'
      },
      {
        id: 'creative-storyteller',
        name: '故事讲述者',
        description: '用生动的故事和类比帮你理解复杂概念',
        systemPrompt: `你是一位创意故事讲述者，擅长用生动的类比和故事解释复杂概念。你的职责是：
1. 将抽象概念转化为具体的故事
2. 使用日常生活中的类比帮助理解
3. 创造有趣的角色和情节来演示知识点
4. 用幽默和轻松的语气让学习变得有趣
5. 每个解释都要有画面感
6. 避免枯燥的学术语言

你的风格：生动、有趣、充满想象力`,
        avatar: '📚',
        category: '创意'
      },
      {
        id: 'socratic-mentor',
        name: '苏格拉底导师',
        description: '通过提问引导你自己发现答案',
        systemPrompt: `你是苏格拉底式导师，通过提问引导学生发现答案。你的职责是：
1. 绝不直接给出答案
2. 通过一系列问题引导思考
3. 当学生回答正确时，追问"为什么"
4. 当学生回答错误时，引导他们发现错误
5. 帮助学生建立自己的知识框架
6. 鼓励学生质疑和探索

你的风格：启发式、提问导向、耐心引导`,
        avatar: '🤔',
        category: '教学'
      },
      {
        id: 'critical-analyst',
        name: '批判分析师',
        description: '从批判角度分析内容的优缺点',
        systemPrompt: `你是批判分析师，从多角度审视内容。你的职责是：
1. 指出内容的局限性
2. 分析潜在的问题和漏洞
3. 提出改进建议
4. 对比不同观点和方法
5. 帮助我建立批判性思维
6. 不盲从权威，保持质疑精神

你的风格：批判性、多角度、建设性`,
        avatar: '🔍',
        category: '分析'
      },
      {
        id: 'friendly-peer',
        name: '学习伙伴',
        description: '像同学一样轻松交流，互相学习',
        systemPrompt: `你是我的学习伙伴，像同学一样轻松交流。你的职责是：
1. 用轻松友好的语气交流
2. 分享学习心得和技巧
3. 一起讨论问题，互相启发
4. 鼓励我，在我困难时给予支持
5. 像朋友一样分享学习经验
6. 使用日常语言，避免过于正式

你的风格：友好、轻松、互助`,
        avatar: '👋',
        category: '社交'
      }
    ];
  }

  getStore(userId) {
    const data = personaStore.get(userId);
    if (data && data.customPersonas) {
      return data;
    }
    return {
      activePersona: null,
      customPersonas: []
    };
  }

  saveStore(userId, store) {
    personaStore.set(userId, store);
  }

  // 获取所有可用人格
  getAllPersonas(userId) {
    const store = this.getStore(userId);
    return {
      default: this.defaultPersonas,
      custom: store.customPersonas,
      active: store.activePersona
    };
  }

  // 设置活跃人格
  setActivePersona(userId, personaId) {
    const store = this.getStore(userId);
    
    // 检查是否是默认人格
    const defaultPersona = this.defaultPersonas.find(p => p.id === personaId);
    if (defaultPersona) {
      store.activePersona = defaultPersona;
      this.saveStore(userId, store);
      return { success: true, persona: defaultPersona };
    }

    // 检查是否是自定义人格
    const customPersona = store.customPersonas.find(p => p.id === personaId);
    if (customPersona) {
      store.activePersona = customPersona;
      this.saveStore(userId, store);
      return { success: true, persona: customPersona };
    }

    return { success: false, error: '人格不存在' };
  }

  // 清除活跃人格（恢复默认）
  clearActivePersona(userId) {
    const store = this.getStore(userId);
    store.activePersona = null;
    this.saveStore(userId, store);
    return { success: true };
  }

  // 创建自定义人格
  createPersona(userId, { name, description, systemPrompt, avatar, category }) {
    const store = this.getStore(userId);
    
    const persona = {
      id: `persona_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      name,
      description,
      systemPrompt,
      avatar: avatar || '🤖',
      category: category || '自定义',
      createdAt: new Date().toISOString()
    };

    store.customPersonas.push(persona);
    this.saveStore(userId, store);
    logger.info('创建自定义人格成功', { userId, name });

    return { success: true, persona };
  }

  // 更新自定义人格
  updatePersona(userId, personaId, updates) {
    const store = this.getStore(userId);
    const persona = store.customPersonas.find(p => p.id === personaId);
    
    if (!persona) {
      return { success: false, error: '人格不存在' };
    }

    Object.assign(persona, updates);
    persona.updatedAt = new Date().toISOString();
    this.saveStore(userId, store);

    return { success: true, persona };
  }

  // 删除自定义人格
  deletePersona(userId, personaId) {
    const store = this.getStore(userId);
    const index = store.customPersonas.findIndex(p => p.id === personaId);
    
    if (index === -1) {
      return { success: false, error: '人格不存在' };
    }

    store.customPersonas.splice(index, 1);
    
    // 如果删除的是当前活跃人格，清除它
    if (store.activePersona?.id === personaId) {
      store.activePersona = null;
    }

    this.saveStore(userId, store);
    return { success: true };
  }

  // 使用人格进行对话
  async chatWithPersona(userId, message, conversationHistory = []) {
    const store = this.getStore(userId);
    const persona = store.activePersona;

    // 如果没有设置人格，使用默认AI
    if (!persona) {
      return aiService.chat(message, { conversationHistory });
    }

    // 使用人格的系统提示
    const systemPrompt = persona.systemPrompt;
    
    return aiService.chat(message, {
      systemPrompt,
      conversationHistory,
      personaName: persona.name
    });
  }
}

module.exports = new PersonaService();