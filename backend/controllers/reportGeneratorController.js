const reportGeneratorService = require('../services/reportGeneratorService');

function userIdFrom(req) {
  return req.user?.userId || req.body?.userId || req.query?.userId || 'default';
}

// 生成报告
exports.generate = async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { content, topic, type, format } = req.body;

    if (!topic) {
      return res.status(400).json({ success: false, error: '请提供报告主题' });
    }

    const result = await reportGeneratorService.generateReport(userId, {
      content: content || '',
      topic,
      type: type || 'learning-guide',
      format: format || 'detailed'
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 获取所有报告
exports.getAll = (req, res) => {
  const userId = userIdFrom(req);
  const reports = reportGeneratorService.getReports(userId);
  res.json({ success: true, reports });
};

// 获取单个报告
exports.getOne = (req, res) => {
  const userId = userIdFrom(req);
  const { reportId } = req.params;

  const report = reportGeneratorService.getReport(userId, reportId);
  if (!report) {
    return res.status(404).json({ success: false, error: '报告不存在' });
  }

  res.json({ success: true, report });
};

// 删除报告
exports.delete = (req, res) => {
  const userId = userIdFrom(req);
  const { reportId } = req.params;

  const success = reportGeneratorService.deleteReport(userId, reportId);
  if (!success) {
    return res.status(404).json({ success: false, error: '报告不存在' });
  }

  res.json({ success: true });
};
