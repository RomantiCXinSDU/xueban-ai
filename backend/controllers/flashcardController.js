const flashcardService = require('../services/flashcardService');

function userIdFrom(req) {
  return req.user?.userId || req.body?.userId || req.query?.userId || 'default';
}

// 生成闪卡/测验
exports.generate = async (req, res) => {
  try {
    const userId = userIdFrom(req);
    const { sourceType, sourceId, text, count, type, subject, difficulty, deckName } = req.body;

    let result;
    if (sourceType === 'notebook' && sourceId) {
      result = await flashcardService.generateFromNotebook(userId, sourceId, { count, type, subject, deckName });
    } else {
      result = await flashcardService.generateFromText(userId, { text, count, type, subject, difficulty, deckName });
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// 获取所有卡组
exports.getDecks = (req, res) => {
  const userId = userIdFrom(req);
  const decks = flashcardService.getDecks(userId);
  const stats = flashcardService.getStats(userId);
  
  res.json({ success: true, decks, stats });
};

// 获取单个卡组
exports.getDeck = (req, res) => {
  const userId = userIdFrom(req);
  const { deckId } = req.params;
  
  const deck = flashcardService.getDeck(userId, deckId);
  if (!deck) {
    return res.status(404).json({ success: false, error: '卡组不存在' });
  }
  
  res.json({ success: true, deck });
};

// 获取待复习的卡片
exports.getReviewCards = (req, res) => {
  const userId = userIdFrom(req);
  const { deckId } = req.params;
  
  const cards = flashcardService.getCardsForReview(userId, deckId);
  res.json({ success: true, cards, count: cards.length });
};

// 更新卡片掌握度
exports.updateMastery = (req, res) => {
  const userId = userIdFrom(req);
  const { deckId, cardId } = req.params;
  const { mastery } = req.body;
  
  const card = flashcardService.updateCardMastery(userId, deckId, cardId, mastery);
  if (!card) {
    return res.status(404).json({ success: false, error: '卡片不存在' });
  }
  
  res.json({ success: true, card });
};

// 删除卡组
exports.deleteDeck = (req, res) => {
  const userId = userIdFrom(req);
  const { deckId } = req.params;
  
  const success = flashcardService.deleteDeck(userId, deckId);
  if (!success) {
    return res.status(404).json({ success: false, error: '卡组不存在' });
  }
  
  res.json({ success: true });
};

// 删除卡片
exports.deleteCard = (req, res) => {
  const userId = userIdFrom(req);
  const { deckId, cardId } = req.params;
  
  const success = flashcardService.deleteCard(userId, deckId, cardId);
  if (!success) {
    return res.status(404).json({ success: false, error: '卡片不存在' });
  }
  
  res.json({ success: true });
};

// 获取学习统计
exports.getStats = (req, res) => {
  const userId = userIdFrom(req);
  const stats = flashcardService.getStats(userId);
  res.json({ success: true, stats });
};
