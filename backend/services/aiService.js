const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { analyzeQuestionType } = require('../utils/questionAnalyzer');
const { DataStore } = require('./dataStore');

const DEFAULT_API_KEY = process.env.AI_API_KEY;
const DEFAULT_API_URL = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = process.env.AI_MODEL || 'gpt-3.5-turbo';
const TIMEOUT = 30000;
const conversationStore = new DataStore('ai_conversations');

const MODE_LABELS = {
  tutor: '深度答疑',
  socratic: '苏格拉底引导',
  sprint: '考试冲刺',
  diagnose: '错题诊断',
  polish: '笔记润色'
};

function getApiConfig(options = {}) {
  const apiKey = options.apiKey || DEFAULT_API_KEY;
  return {
    apiKey,
    apiUrl: options.apiUrl || DEFAULT_API_URL,
    model: options.model || DEFAULT_MODEL,
    isValid: Boolean(apiKey && apiKey !== 'your_api_key_here' && apiKey.length > 10)
  };
}

function isApiKeyValid(options = {}) {
  return getApiConfig(options).isValid;
}

function getConversationHistory(conversationId) {
  if (!conversationId) return [];
  return conversationStore.get(conversationId) || [];
}

function saveConversation(conversationId, messages) {
  if (!conversationId) return;
  conversationStore.set(conversationId, messages.slice(-20));
}

function profileText(profile = {}) {
  const weakPoints = Array.isArray(profile.weakPoints)
    ? profile.weakPoints.join('、')
    : profile.weakPoints || '未填写';

  return [
    `专业/方向：${profile.major || '未填写'}`,
    `目标考试：${profile.exam || '未填写'}`,
    `考试日期：${profile.deadline || '未填写'}`,
    `每日可学：${profile.dailyHours || '未填写'} 小时`,
    `薄弱点：${weakPoints}`,
    `偏好模式：${profile.preferredMode || '未填写'}`
  ].join('\n');
}

function buildSystemPrompt(mode = 'tutor', profile = {}) {
  const label = MODE_LABELS[mode] || MODE_LABELS.tutor;
  const modeRules = {
    tutor: '直接解释核心概念、步骤和例子，最后给一个可执行练习。',
    socratic: '不要直接给最终答案，先用 2-4 个引导问题推动学生思考，再给必要提示。',
    sprint: '优先给考试高频考点、提分路径、时间分配和临场注意事项。',
    diagnose: '先定位错误类型，再给纠错步骤、同类题识别方法和复盘安排。',
    polish: '把输入整理成清晰笔记，保留关键信息，补充结构和复习提示。'
  };

  return `你是“学伴AI”，一个面向大学生的高级学习教练。你的风格接近 ChatGPT/Claude：清晰、克制、专业、可执行。

当前模式：${label}
模式规则：${modeRules[mode] || modeRules.tutor}

学习画像：
${profileText(profile)}

回答要求：
1. 先给结论或判断，不要铺垫太长。
2. 用小标题和列表组织内容，避免空泛鸡汤。
3. 如果是题目，必须包含“思路拆解”“关键知识点”“易错点”“下一步练习”。
4. 如果信息不足，最多问 1 个关键问题，同时给出基于当前信息的临时建议。
5. 数学公式使用 LaTeX，例如 $\\int_0^1 x^2 dx$。
6. 不要虚构教材页码、真题年份、政策或学校要求。`;
}

async function callRealAI(messages, options = {}) {
  const config = getApiConfig(options);
  if (!config.isValid) {
    throw new Error('AI API Key 未配置');
  }

  const response = await axios.post(
    config.apiUrl,
    {
      model: config.model,
      messages,
      temperature: options.temperature ?? 0.55,
      max_tokens: options.maxTokens || 1800,
      stream: false
    },
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: TIMEOUT
    }
  );

  return response.data.choices?.[0]?.message?.content || '';
}

function fallbackChat(message, questionType, mode = 'tutor', profile = {}) {
  const modeName = MODE_LABELS[mode] || MODE_LABELS.tutor;
  const weak = Array.isArray(profile.weakPoints) && profile.weakPoints.length
    ? profile.weakPoints.join('、')
    : '暂未填写';

  return `## ${modeName}建议

我已经收到你的问题：${message}

### 快速判断
这更像是一个${questionType.category || '综合学习'}问题。当前处于离线模式，我会先给你一个可靠的学习框架。

### 处理步骤
1. 明确题目或任务要求，圈出关键词。
2. 对照你的薄弱点：${weak}。
3. 把问题拆成“概念理解 -> 公式/方法 -> 例题迁移 -> 错因复盘”四步。
4. 如果是考试冲刺，优先处理高频题型和最容易拿分的步骤。

### 下一步
把题目原文、你卡住的步骤、或已有答案发给我，我可以继续帮你做针对性拆解。`;
}

async function chat(message, options = {}) {
  const conversationId = options.conversationId || uuidv4();
  const mode = options.mode || options.context?.mode || 'tutor';
  const profile = options.profile || options.context?.profile || {};
  const knowledge = Array.isArray(options.context?.knowledge) ? options.context.knowledge : [];
  const knowledgeText = knowledge.length
    ? `\n\n参考资料（优先基于这些资料回答，并在合适位置说明引用依据）：\n${knowledge.map((item, index) => `${index + 1}. ${item.title || '资料'}：${item.summary || item.content || item.text || ''}`).join('\n')}\n\n用户问题：\n${message}`
    : message;
  const questionType = analyzeQuestionType(message);
  const history = getConversationHistory(conversationId);
  const systemContent = options.systemPrompt || buildSystemPrompt(mode, profile);
  const messages = [
    { role: 'system', content: systemContent },
    ...history,
    { role: 'user', content: knowledgeText }
  ];
  const apiConfig = getApiConfig(options);

  try {
    if (isApiKeyValid(options)) {
      const content = await callRealAI(messages, options);
      saveConversation(conversationId, [
        ...history,
        { role: 'user', content: message },
        { role: 'assistant', content }
      ]);
      return { content, model: apiConfig.model, conversationId };
    }
  } catch (error) {
    logger.warn('AI chat failed, using fallback', { error: error.message, model: apiConfig.model });
  }

  const content = fallbackChat(message, questionType, mode, profile);
  saveConversation(conversationId, [
    ...history,
    { role: 'user', content: message },
    { role: 'assistant', content }
  ]);
  return { content, model: 'fallback-template', conversationId };
}

function fallbackSummary(content, subject = '学习内容') {
  return `## ${subject}总结

### 核心内容
${content.slice(0, 240)}${content.length > 240 ? '...' : ''}

### 复习卡片
- 先用自己的话复述主要概念。
- 标出 3 个最容易混淆的点。
- 写 1 道自测题，第二天复做。

### 行动建议
今天用 25 分钟整理一页笔记，再用 15 分钟做同类题验证。`;
}

async function summarize(content, options = {}) {
  const subject = options.subject || '学习内容';
  const prompt = `请把以下${subject}整理成高质量复习笔记，包含：核心概念、知识结构、易错点、3条自测题、明日复习任务。\n\n${content}`;
  const apiConfig = getApiConfig(options);

  try {
    if (isApiKeyValid(options)) {
      const aiContent = await callRealAI([
        { role: 'system', content: buildSystemPrompt('polish', options.profile || {}) },
        { role: 'user', content: prompt }
      ], options);
      return { content: aiContent, model: apiConfig.model };
    }
  } catch (error) {
    logger.warn('AI summarize failed, using fallback', { error: error.message });
  }

  return { content: fallbackSummary(content, subject), model: 'fallback-template' };
}

function fallbackAnalysis(questionType) {
  return {
    difficulty: 3,
    knowledgePoints: ['核心概念识别', '方法选择', '步骤校验'],
    solutionStrategy: `按“审题 -> 建模 -> 计算/推理 -> 检查”的顺序处理这道${questionType.category || '综合题'}。`,
    similarExamples: ['换一组数字重做同类题', '只改变条件再推导一次', '整理成错题卡复盘'],
    commonMistakes: ['审题关键词遗漏', '公式套用前提不满足', '最后答案缺少检验']
  };
}

async function analyzeQuestion(question, questionTypeOrOptions = {}, maybeOptions = {}) {
  const questionType = questionTypeOrOptions.type
    ? questionTypeOrOptions
    : analyzeQuestionType(question);
  const options = questionTypeOrOptions.type ? maybeOptions : questionTypeOrOptions;
  const prompt = `请分析这道题，返回 JSON：difficulty(1-5)、knowledgePoints、solutionStrategy、similarExamples、commonMistakes。\n\n题目：${question}`;
  const apiConfig = getApiConfig(options);

  try {
    if (isApiKeyValid(options)) {
      const aiContent = await callRealAI([
        { role: 'system', content: buildSystemPrompt('diagnose', options.profile || {}) },
        { role: 'user', content: prompt }
      ], { ...options, temperature: 0.25 });
      try {
        return { content: JSON.parse(aiContent), model: apiConfig.model };
      } catch {
        return { content: { raw: aiContent }, model: apiConfig.model };
      }
    }
  } catch (error) {
    logger.warn('AI analysis failed, using fallback', { error: error.message });
  }

  return { content: fallbackAnalysis(questionType), model: 'fallback-template' };
}

function normalizeSubject(subject = '') {
  const map = {
    math: '数学',
    programming: '编程',
    english: '英语',
    physics: '物理',
    chemistry: '化学',
    other: '综合科目'
  };
  return map[String(subject).toLowerCase()] || subject || '综合科目';
}

function generateFallbackPlan(params = {}) {
  const subject = normalizeSubject(params.subject);
  const goal = params.goal || '完成阶段学习目标';
  const duration = Number(params.duration) || 7;
  const dailyHours = Number(params.dailyHours) || 2;
  const phaseSize = Math.max(1, Math.ceil(duration / 3));
  const topics = ['概念梳理', '例题精讲', '专项训练', '错题复盘', '模拟检测', '查漏补缺'];

  return {
    summary: `${subject} ${duration} 天学习计划：围绕“${goal}”，每天约 ${dailyHours} 小时，采用输入、训练、复盘三段式推进。`,
    phases: [
      { name: '诊断与搭框架', days: `1-${Math.min(phaseSize, duration)}`, focus: '建立知识目录，标记高频与薄弱点。' },
      { name: '专项突破', days: `${Math.min(phaseSize + 1, duration)}-${Math.min(phaseSize * 2, duration)}`, focus: '围绕高频题型做集中训练。' },
      { name: '冲刺复盘', days: `${Math.min(phaseSize * 2 + 1, duration)}-${duration}`, focus: '模拟测试、错题复做、压缩答题流程。' }
    ],
    dailySchedule: Array.from({ length: duration }, (_, index) => ({
      day: index + 1,
      topic: `${subject}：${topics[index % topics.length]}`,
      objectives: [
        '完成 25 分钟核心概念复盘',
        '完成 3-5 道同类题或 1 个小任务',
        '记录 1 个薄弱点和下一步动作'
      ],
      estimatedHours: dailyHours
    })),
    milestones: [
      { day: Math.min(phaseSize, duration), milestone: '完成知识框架', assessment: '能说清本阶段核心概念和题型。' },
      { day: Math.min(phaseSize * 2, duration), milestone: '完成专项突破', assessment: '同类题正确率稳定提升。' },
      { day: duration, milestone: '完成冲刺闭环', assessment: '完成一次限时模拟和错题复盘。' }
    ],
    tips: [
      '每天先复盘昨天错题，再开始新内容。',
      '把不会的题按“概念不清、方法不会、计算粗心、时间不足”分类。',
      '考前 20% 的时间留给模拟和复盘，不继续盲目刷新题。'
    ]
  };
}

async function generateStudyPlan(params = {}, options = {}) {
  const prompt = `请生成一个大学生学习计划，返回 JSON，字段为 summary、phases、dailySchedule、milestones、tips。
科目：${params.subject}
目标：${params.goal}
天数：${params.duration}
每日小时：${params.dailyHours}
当前水平：${params.currentLevel || '中等'}`;
  const apiConfig = getApiConfig(options);

  try {
    if (isApiKeyValid(options)) {
      const aiContent = await callRealAI([
        { role: 'system', content: buildSystemPrompt('sprint', options.profile || {}) },
        { role: 'user', content: prompt }
      ], { ...options, temperature: 0.35 });
      try {
        return { content: JSON.parse(aiContent), model: apiConfig.model };
      } catch {
        return { content: { raw: aiContent }, model: apiConfig.model };
      }
    }
  } catch (error) {
    logger.warn('AI plan failed, using fallback', { error: error.message });
  }

  return { content: generateFallbackPlan(params), model: 'fallback-template' };
}

function fallbackQuiz(topic = '当前内容', count = 5) {
  return `## ${topic}自测题

${Array.from({ length: Number(count) || 5 }, (_, index) => `${index + 1}. 请解释 ${topic} 中一个核心概念，并写出它适用的条件。`).join('\n')}

### 使用方法
先闭卷作答，再把不会的题加入错题本，并标记错误原因。`;
}

async function generateQuiz(params = {}, options = {}) {
  const topic = params.topic || params.content || '当前内容';
  const count = Math.min(Math.max(Number(params.count) || 5, 3), 12);
  const prompt = `请围绕以下主题生成 ${count} 道大学生自测题，包含题目、答案、解析、对应知识点。主题/材料：${topic}`;
  const apiConfig = getApiConfig(options);

  try {
    if (isApiKeyValid(options)) {
      const content = await callRealAI([
        { role: 'system', content: buildSystemPrompt('diagnose', options.profile || {}) },
        { role: 'user', content: prompt }
      ], options);
      return { content, model: apiConfig.model };
    }
  } catch (error) {
    logger.warn('AI quiz failed, using fallback', { error: error.message });
  }

  return { content: fallbackQuiz(topic, count), model: 'fallback-template' };
}

function fallbackStrategy(params = {}) {
  const exam = params.exam || '目标考试';
  const days = params.days || '若干';
  return `## ${exam}冲刺策略

### 时间分配
- 剩余 ${days} 天时，建议 60% 时间做高频题型，25% 复盘错题，15% 做限时模拟。

### 提分动作
1. 列出最近 10 道错题的错误原因。
2. 每天固定一次 30 分钟限时训练。
3. 把“会但慢”的题单独训练答题流程。

### 风险提醒
不要在最后阶段大量开新坑。优先处理最常考、最容易拿分、最影响心态的部分。`;
}

async function generateStrategy(params = {}, options = {}) {
  const prompt = `请根据以下信息生成考试冲刺策略：${JSON.stringify(params, null, 2)}。要求包含时间分配、提分动作、风险提醒、每日节奏。`;
  const apiConfig = getApiConfig(options);

  try {
    if (isApiKeyValid(options)) {
      const content = await callRealAI([
        { role: 'system', content: buildSystemPrompt('sprint', options.profile || {}) },
        { role: 'user', content: prompt }
      ], options);
      return { content, model: apiConfig.model };
    }
  } catch (error) {
    logger.warn('AI strategy failed, using fallback', { error: error.message });
  }

  return { content: fallbackStrategy(params), model: 'fallback-template' };
}

module.exports = {
  chat,
  summarize,
  analyzeQuestion,
  generateStudyPlan,
  generateQuiz,
  generateStrategy,
  isApiKeyValid
};
