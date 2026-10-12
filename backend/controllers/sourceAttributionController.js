const sourceAttributionService = require('../services/sourceAttributionService');

function userIdFrom(req) {
  return req.user?.userId || req.body?.userId || req.query?.userId || 'default';
}

// 添加文档
exports.addDocument = (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { title, content, source, type } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: '请提供文档内容' });
    }

    const doc = sourceAttributionService.addDocument(userId, { title, content, source, type });
    res.status(201).json({ success: true, doc });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 获取所有文档
exports.getDocuments = (req, res) => {
  const userId = userIdFrom(req);
  const docs = sourceAttributionService.getAllDocuments(userId);
  res.json({ success: true, documents: docs, count: docs.length });
};

// 删除文档
exports.deleteDocument = (req, res) => {
  const userId = userIdFrom(req);
  const { docId } = req.params;

  const success = sourceAttributionService.deleteDocument(userId, docId);
  if (!success) {
    return res.status(404).json({ success: false, error: '文档不存在' });
  }

  res.json({ success: true });
};

// 清空文档
exports.clearDocuments = (req, res) => {
  const userId = userIdFrom(req);
  sourceAttributionService.clearAll(userId);
  res.json({ success: true });
};

// 带来源归因的问答
exports.answerWithAttribution = async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { question, topK, includeSources } = req.body;

    if (!question) {
      return res.status(400).json({ success: false, error: '请提供问题' });
    }

    const result = await sourceAttributionService.answerWithAttribution(userId, question, {
      topK: topK || 5,
      includeSources: includeSources !== false
    });

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 从笔记本导入文档
exports.importFromNotebook = (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { notebookId } = req.body;

    if (!notebookId) {
      return res.status(400).json({ success: false, error: '请提供笔记本ID' });
    }

    // 动态导入避免循环依赖
    const productService = require('../services/productService');
    const docs = sourceAttributionService.addFromNotebook(userId, notebookId, productService);

    res.json({ success: true, documents: docs, count: docs.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 搜索相关文档
exports.search = (req, res) => {
  const userId = userIdFrom(req);
  const { query, topK } = req.query;

  if (!query) {
    return res.status(400).json({ success: false, error: '请提供搜索查询' });
  }

  const results = sourceAttributionService.search(userId, query, parseInt(topK) || 5);
  res.json({ success: true, results });
};
