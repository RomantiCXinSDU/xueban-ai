const learningGuideService = require('../services/learningGuideService');

function userIdFrom(req) {
  return req.user?.userId || req.body?.userId || req.query?.userId || 'default';
}

// 生成学习指南
exports.generate = async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { topic, content, type } = req.body;

    if (!topic) {
      return res.status(400).json({ success: false, error: '请提供学习主题' });
    }

    const result = await learningGuideService.generateGuide(userId, { topic, content, type });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 获取所有学习指南
exports.getAll = (req, res) => {
  const userId = userIdFrom(req);
  const guides = learningGuideService.getAllGuides(userId);
  res.json({ success: true, guides });
};

// 获取单个学习指南
exports.getOne = (req, res) => {
  const userId = userIdFrom(req);
  const { guideId } = req.params;
  
  const guide = learningGuideService.getGuide(userId, guideId);
  if (!guide) {
    return res.status(404).json({ success: false, error: '学习指南不存在' });
  }
  
  res.json({ success: true, guide });
};

// 苏格拉底式问答
exports.socraticQA = async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { guideId, question, stepIndex } = req.body;

    if (!guideId || !question) {
      return res.status(400).json({ success: false, error: '缺少参数' });
    }

    const result = await learningGuideService.socraticQA(userId, guideId, question, stepIndex || 0);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 更新学习进度
exports.updateProgress = (req, res) => {
  const userId = userIdFrom(req);
  const { guideId } = req.params;
  const { progress } = req.body;

  const guide = learningGuideService.updateProgress(userId, guideId, progress);
  if (!guide) {
    return res.status(404).json({ success: false, error: '学习指南不存在' });
  }

  res.json({ success: true, guide });
};

// 删除学习指南
exports.delete = (req, res) => {
  const userId = userIdFrom(req);
  const { guideId } = req.params;

  const success = learningGuideService.deleteGuide(userId, guideId);
  if (!success) {
    return res.status(404).json({ success: false, error: '学习指南不存在' });
  }

  res.json({ success: true });
};
