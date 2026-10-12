const personaService = require('../services/personaService');

function userIdFrom(req) {
  return req.user?.userId || req.body?.userId || req.query?.userId || 'default';
}

// 获取所有人格
exports.getAll = (req, res) => {
  const userId = userIdFrom(req);
  const personas = personaService.getAllPersonas(userId);
  res.json({ success: true, ...personas });
};

// 设置活跃人格
exports.setActive = (req, res) => {
  const userId = userIdFrom(req);
  const { personaId } = req.body;

  const result = personaService.setActivePersona(userId, personaId);
  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
};

// 清除活跃人格
exports.clearActive = (req, res) => {
  const userId = userIdFrom(req);
  personaService.clearActivePersona(userId);
  res.json({ success: true });
};

// 创建自定义人格
exports.create = (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { name, description, systemPrompt, avatar, category } = req.body;

    if (!name || !systemPrompt) {
      return res.status(400).json({ success: false, error: '请提供人格名称和系统提示' });
    }

    const result = personaService.createPersona(userId, { name, description, systemPrompt, avatar, category });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 更新自定义人格
exports.update = (req, res) => {
  const userId = userIdFrom(req);
  const { personaId } = req.params;
  const updates = req.body;

  const result = personaService.updatePersona(userId, personaId, updates);
  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
};

// 删除自定义人格
exports.delete = (req, res) => {
  const userId = userIdFrom(req);
  const { personaId } = req.params;

  const result = personaService.deletePersona(userId, personaId);
  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
};

// 使用人格对话
exports.chat = async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { message, conversationHistory } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, error: '请提供消息' });
    }

    const result = await personaService.chatWithPersona(userId, message, conversationHistory || []);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};