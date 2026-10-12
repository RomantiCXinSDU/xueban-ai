const QUESTION_KEYWORDS = {
  math: {
    keywords: ['方程', '函数', '积分', '导数', '概率', '矩阵', '向量', '极限', '证明', '求解', '计算', '求值'],
    category: '数学题'
  },
  programming: {
    keywords: ['编程', '代码', '算法', '数据结构', 'Java', 'Python', 'C++', '实现', '程序', '开发', '代码实现'],
    category: '编程题'
  },
  english: {
    keywords: ['翻译', '语法', '词汇', '阅读', '写作', '填空', '英语', '英文', '完形'],
    category: '英语题'
  },
  physics: {
    keywords: ['力学', '电磁', '光学', '热力学', '量子', '运动', '物理', '能量', '力'],
    category: '物理题'
  },
  chemistry: {
    keywords: ['反应', '元素', '化合物', '化学方程式', '配平', '化学', '摩尔', 'pH'],
    category: '化学题'
  },
  economics: {
    keywords: ['需求', '供给', '价格', '市场', '成本', '经济', 'GDP', '通胀'],
    category: '经济题'
  },
  biology: {
    keywords: ['细胞', '基因', '遗传', '生态', '生物', '进化', '蛋白质', 'DNA'],
    category: '生物题'
  },
  history: {
    keywords: ['历史', '朝代', '战争', '革命', '古代', '近代', '现代'],
    category: '历史题'
  }
};

function analyzeQuestionType(question) {
  if (!question || typeof question !== 'string') {
    return { type: 'general', category: '综合题' };
  }

  for (const [type, config] of Object.entries(QUESTION_KEYWORDS)) {
    if (config.keywords.some(keyword => question.includes(keyword))) {
      return { type, category: config.category };
    }
  }

  return { type: 'general', category: '综合题' };
}

function getRelatedTopics(type) {
  const topics = {
    math: ['高等数学', '线性代数', '概率统计', '离散数学', '数论'],
    programming: ['数据结构', '算法设计', '编程语言', '软件工程', '计算机网络'],
    english: ['词汇语法', '阅读理解', '写作技巧', '翻译', '听力口语'],
    physics: ['力学', '电磁学', '热学', '光学', '量子物理'],
    chemistry: ['有机化学', '无机化学', '分析化学', '物理化学', '生物化学'],
    economics: ['微观经济学', '宏观经济学', '计量经济学', '产业经济学', '金融学'],
    biology: ['细胞生物学', '遗传学', '生态学', '生理学', '微生物学'],
    history: ['中国古代史', '中国近代史', '世界古代史', '世界近代史', '史学理论'],
    general: ['综合知识', '逻辑推理', '问题分析', '批判性思维', '学习方法']
  };
  return topics[type] || topics.general;
}

module.exports = {
  analyzeQuestionType,
  getRelatedTopics
};
