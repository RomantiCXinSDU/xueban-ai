const { v4: uuidv4 } = require('uuid');
const { analyzeQuestionType, getRelatedTopics } = require('../utils/questionAnalyzer');
const aiService = require('../services/aiService');
const { wrongProblemsStore, studyPlansStore } = require('../services/dataStore');
const { logger } = require('../utils/logger');

const problemHistory = [];
const MAX_HISTORY = 100;

function getApiOptions(req) {
  const apiKey = req.headers['x-api-key'];
  const apiUrl = req.headers['x-api-url'];
  const model = req.headers['x-model'];
  
  if (apiKey && apiUrl) {
    return { apiKey, apiUrl, model };
  }
  return {};
}

exports.solveProblem = async (req, res) => {
  try {
    const { question, imageData, ocrText } = req.body;
    const apiOptions = getApiOptions(req);

    if (!question && !imageData && !ocrText) {
      return res.status(400).json({ error: '请提供题目内容或图片' });
    }

    const questionText = question || ocrText || '图片识别的题目';
    const questionType = analyzeQuestionType(questionText);

    const aiResult = await aiService.analyzeQuestion(questionText, questionType, apiOptions);

    const historyItem = {
      id: uuidv4(),
      question: questionText,
      questionType: questionType.category,
      solution: aiResult.content,
      solvedAt: new Date().toISOString()
    };

    problemHistory.push(historyItem);
    if (problemHistory.length > MAX_HISTORY) {
      problemHistory.splice(0, problemHistory.length - MAX_HISTORY);
    }

    logger.info('Problem Solved', { 
      questionType: questionType.category,
      hasImage: !!imageData
    });

    res.json({
      success: true,
      questionType: questionType.category,
      solution: aiResult.content,
      model: aiResult.model
    });
  } catch (error) {
    logger.error('Solve Problem Error', { error: error.message });
    res.status(500).json({ error: '解题服务暂时不可用' });
  }
};

exports.analyzeProblemType = async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: '请输入题目内容' });
    }

    const questionType = analyzeQuestionType(question);
    const aiResult = await aiService.analyzeQuestion(question, questionType);

    res.json({
      success: true,
      analysis: {
        ...(typeof aiResult.content === 'object' ? aiResult.content : { analysis: aiResult.content }),
        type: questionType.type,
        category: questionType.category,
        relatedTopics: getRelatedTopics(questionType.type)
      }
    });
  } catch (error) {
    logger.error('Analyze Problem Type Error', { error: error.message });
    res.status(500).json({ error: '分析服务暂时不可用' });
  }
};

exports.ocrImage = async (req, res) => {
  try {
    const { imageData } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: '请提供图片数据' });
    }

    logger.info('OCR Request', { imageSize: imageData.length });

    res.json({
      success: true,
      text: '【演示模式】OCR功能需要接入真实OCR服务（如百度OCR、腾讯OCR、阿里云OCR等）',
      confidence: 0.95,
      message: '请在 .env 中配置 OCR_API_KEY 启用真实OCR能力'
    });
  } catch (error) {
    logger.error('OCR Error', { error: error.message });
    res.status(500).json({ error: 'OCR服务暂时不可用' });
  }
};

exports.getProblemHistory = (req, res) => {
  res.json({
    success: true,
    history: problemHistory.slice(-20)
  });
};

exports.addWrongProblem = (req, res) => {
  try {
    const { question, wrongAnswer, correctAnswer, analysis, category } = req.body;

    if (!question) {
      return res.status(400).json({ error: '请提供错题内容' });
    }

    const wrongProblem = {
      id: uuidv4(),
      question,
      wrongAnswer,
      correctAnswer,
      analysis,
      category: category || analyzeQuestionType(question).category,
      createdAt: new Date().toISOString(),
      reviewed: false
    };

    wrongProblemsStore.appendToList('problems', wrongProblem);

    res.status(201).json({
      success: true,
      message: '错题添加成功',
      wrongProblem
    });
  } catch (error) {
    logger.error('Add Wrong Problem Error', { error: error.message });
    res.status(500).json({ error: '服务器内部错误' });
  }
};

exports.getWrongProblems = (req, res) => {
  const { category, reviewed } = req.query;
  
  const allProblems = wrongProblemsStore.get('problems') || [];
  let filtered = allProblems;
  
  if (category) {
    filtered = filtered.filter(p => p.category === category);
  }
  
  if (reviewed !== undefined) {
    const isReviewed = reviewed === 'true';
    filtered = filtered.filter(p => p.reviewed === isReviewed);
  }

  res.json({
    success: true,
    wrongProblems: filtered
  });
};

exports.markWrongProblemReviewed = (req, res) => {
  const { id } = req.params;
  const allProblems = wrongProblemsStore.get('problems') || [];
  const problem = allProblems.find(p => p.id === id);

  if (!problem) {
    return res.status(404).json({ error: '错题不存在' });
  }

  const updated = wrongProblemsStore.updateInList('problems', id, {
    reviewed: true,
    reviewedAt: new Date().toISOString()
  });

  res.json({
    success: true,
    message: '已标记为已复习',
    wrongProblem: updated
  });
};

exports.deleteWrongProblem = (req, res) => {
  const { id } = req.params;

  const success = wrongProblemsStore.deleteFromList('problems', id);

  if (!success) {
    return res.status(404).json({ error: '错题不存在' });
  }

  res.json({
    success: true,
    message: '错题删除成功'
  });
};

exports.saveStudyPlan = (req, res) => {
  try {
    const { plan, userId = 'default' } = req.body;
    
    if (!plan) {
      return res.status(400).json({ error: '请提供学习计划' });
    }

    const savedPlan = {
      id: uuidv4(),
      userId,
      plan,
      createdAt: new Date().toISOString(),
      completedDays: []
    };

    studyPlansStore.appendToList('plans', savedPlan);

    res.status(201).json({
      success: true,
      message: '学习计划保存成功',
      plan: savedPlan
    });
  } catch (error) {
    logger.error('Save Study Plan Error', { error: error.message });
    res.status(500).json({ error: '服务器内部错误' });
  }
};

exports.getStudyPlans = (req, res) => {
  const { userId = 'default' } = req.query;
  const allPlans = studyPlansStore.get('plans') || [];
  const userPlans = allPlans.filter(p => p.userId === userId);

  res.json({
    success: true,
    plans: userPlans
  });
};

exports.updateStudyPlan = (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const updated = studyPlansStore.updateInList('plans', id, updates);

  if (!updated) {
    return res.status(404).json({ error: '学习计划不存在' });
  }

  res.json({
    success: true,
    message: '学习计划更新成功',
    plan: updated
  });
};

exports.deleteStudyPlan = (req, res) => {
  const { id } = req.params;

  const success = studyPlansStore.deleteFromList('plans', id);

  if (!success) {
    return res.status(404).json({ error: '学习计划不存在' });
  }

  res.json({
    success: true,
    message: '学习计划删除成功'
  });
};
