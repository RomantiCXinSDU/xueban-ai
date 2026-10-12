const audioOverviewService = require('../services/audioOverviewService');

function userIdFrom(req) {
  return req.user?.userId || req.body?.userId || req.query?.userId || 'default';
}

// 生成音频概述
exports.generate = async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { content, topic, format, duration } = req.body;

    if (!topic) {
      return res.status(400).json({ success: false, error: '请提供主题' });
    }

    const result = await audioOverviewService.generateOverview(userId, {
      content: content || '',
      topic,
      format: format || 'deep-dive',
      duration: duration || 'medium'
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 从笔记本生成
exports.generateFromNotebook = async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { notebookId, format } = req.body;

    if (!notebookId) {
      return res.status(400).json({ success: false, error: '请提供笔记本ID' });
    }

    const productService = require('../services/productService');
    const result = await audioOverviewService.generateFromNotebook(userId, notebookId, productService, format);

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 获取所有音频概述
exports.getAll = (req, res) => {
  const userId = userIdFrom(req);
  const overviews = audioOverviewService.getOverviews(userId);
  res.json({ success: true, overviews });
};

// 获取单个音频概述
exports.getOne = (req, res) => {
  const userId = userIdFrom(req);
  const { overviewId } = req.params;

  const overview = audioOverviewService.getOverview(userId, overviewId);
  if (!overview) {
    return res.status(404).json({ success: false, error: '音频概述不存在' });
  }

  res.json({ success: true, overview });
};

// 生成音频文件
exports.generateAudio = async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { overviewId } = req.params;

    const result = await audioOverviewService.generateAudio(userId, overviewId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 删除音频概述
exports.delete = (req, res) => {
  const userId = userIdFrom(req);
  const { overviewId } = req.params;

  const success = audioOverviewService.deleteOverview(userId, overviewId);
  if (!success) {
    return res.status(404).json({ success: false, error: '音频概述不存在' });
  }

  res.json({ success: true });
};