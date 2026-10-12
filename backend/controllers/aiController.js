const axios = require('axios');
const aiService = require('../services/aiService');
const { analyzeQuestionType } = require('../utils/questionAnalyzer');
const { logger } = require('../utils/logger');

function getApiOptions(req) {
  const apiKey = req.headers['x-api-key'];
  const apiUrl = req.headers['x-api-url'];
  const model = req.headers['x-model'];
  
  if (apiKey && apiUrl) {
    return { apiKey, apiUrl, model };
  }
  return {};
}

exports.chat = async (req, res) => {
  try {
    const { message, conversationId, mode, profile, context = {} } = req.body;
    const apiOptions = getApiOptions(req);

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: '请输入有效的消息内容' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ error: '消息内容过长（最长2000字）' });
    }

    const questionType = analyzeQuestionType(message);
    const startTime = Date.now();

    const aiResult = await aiService.chat(message, {
      conversationId,
      mode,
      profile,
      context: { ...context, questionType: questionType.category, mode, profile },
      ...apiOptions
    });

    logger.info('AI Chat', {
      duration: Date.now() - startTime,
      questionType: questionType.category,
      messageLength: message.length
    });

    res.json({
      success: true,
      response: aiResult.content,
      questionType: questionType.category,
      model: aiResult.model,
      conversationId: aiResult.conversationId
    });
  } catch (error) {
    logger.error('AI Chat Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'AI服务暂时不可用，请稍后重试' });
  }
};

exports.summarize = async (req, res) => {
  try {
    const { content, subject, profile } = req.body;
    const apiOptions = getApiOptions(req);

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: '请提供需要总结的内容' });
    }

    if (content.length > 5000) {
      return res.status(400).json({ error: '内容过长（最长5000字）' });
    }

    const aiResult = await aiService.summarize(content, { subject, profile, ...apiOptions });

    res.json({
      success: true,
      summary: aiResult.content,
      model: aiResult.model
    });
  } catch (error) {
    logger.error('AI Summarize Error', { error: error.message });
    res.status(500).json({ error: '总结服务暂时不可用' });
  }
};

exports.analyzeQuestion = async (req, res) => {
  try {
    const { question } = req.body;
    const apiOptions = getApiOptions(req);

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: '请输入题目内容' });
    }

    const questionType = analyzeQuestionType(question);
    const aiResult = await aiService.analyzeQuestion(question, questionType, apiOptions);

    res.json({
      success: true,
      analysis: {
        ...aiResult.content,
        type: questionType.type,
        category: questionType.category
      }
    });
  } catch (error) {
    logger.error('Analyze Question Error', { error: error.message });
    res.status(500).json({ error: '分析服务暂时不可用' });
  }
};

exports.generateStudyPlan = async (req, res) => {
  try {
    const { subject, goal, duration, dailyHours, currentLevel } = req.body;
    const apiOptions = getApiOptions(req);

    if (!subject || !goal || !duration) {
      return res.status(400).json({ error: '请提供完整的学习计划参数' });
    }

    const days = parseInt(duration);
    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: '学习天数必须在1-365之间' });
    }

    const aiResult = await aiService.generateStudyPlan({
      subject,
      goal,
      duration: days,
      dailyHours: dailyHours || 2,
      currentLevel
    }, apiOptions);

    res.json({
      success: true,
      plan: aiResult.content
    });
  } catch (error) {
    logger.error('Generate Plan Error', { error: error.message });
    res.status(500).json({ error: '计划生成服务暂时不可用' });
  }
};

exports.generateQuiz = async (req, res) => {
  try {
    const apiOptions = getApiOptions(req);
    const aiResult = await aiService.generateQuiz(req.body, apiOptions);

    res.json({
      success: true,
      quiz: aiResult.content,
      model: aiResult.model
    });
  } catch (error) {
    logger.error('Generate Quiz Error', { error: error.message });
    res.status(500).json({ error: '测验生成服务暂时不可用' });
  }
};

exports.generateStrategy = async (req, res) => {
  try {
    const apiOptions = getApiOptions(req);
    const aiResult = await aiService.generateStrategy(req.body, apiOptions);

    res.json({
      success: true,
      strategy: aiResult.content,
      model: aiResult.model
    });
  } catch (error) {
    logger.error('Generate Strategy Error', { error: error.message });
    res.status(500).json({ error: '考试策略服务暂时不可用' });
  }
};
