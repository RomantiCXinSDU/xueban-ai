const aiService = require('./aiService');
const { logger } = require('../utils/logger');
const { DataStore } = require('./dataStore');

const sourceStore = new DataStore('source_documents');

class SourceAttributionService {
  getStore(userId) {
    const data = sourceStore.get(userId);
    return Array.isArray(data) ? data : [];
  }

  saveStore(userId, docs) {
    sourceStore.set(userId, docs);
  }

  // 添加文档片段
  addDocument(userId, { title, content, source, type = 'text' }) {
    const doc = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      title,
      content,
      source: source || '用户输入',
      type,
      chunks: this.chunkContent(content),
      addedAt: new Date().toISOString()
    };

    const docs = this.getStore(userId);
    docs.push(doc);
    this.saveStore(userId, docs);
    logger.info('添加文档成功', { userId, title, chunks: doc.chunks.length });
    return doc;
  }

  // 文本分块（简单按段落分块）
  chunkContent(content, chunkSize = 500, overlap = 50) {
    const chunks = [];
    const paragraphs = content.split(/\n+/);
    let currentChunk = '';

    for (const para of paragraphs) {
      if (currentChunk.length + para.length > chunkSize && currentChunk.length > 0) {
        chunks.push({
          id: `chunk_${chunks.length}`,
          text: currentChunk.trim(),
          length: currentChunk.length
        });
        
        // 保留最后overlap个字符作为下一块的开始
        currentChunk = currentChunk.slice(-overlap) + para;
      } else {
        currentChunk += '\n' + para;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        id: `chunk_${chunks.length}`,
        text: currentChunk.trim(),
        length: currentChunk.length
      });
    }

    return chunks;
  }

  // 语义搜索（简化版关键词匹配）
  search(userId, query, topK = 5) {
    const docs = this.getStore(userId);
    const queryWords = query.toLowerCase().split(/\s+/);
    
    const scoredChunks = [];

    for (const doc of docs) {
      for (const chunk of doc.chunks) {
        const chunkLower = chunk.text.toLowerCase();
        let score = 0;
        
        // 计算关键词匹配分数
        for (const word of queryWords) {
          if (chunkLower.includes(word)) {
            score += 1;
            // 多次匹配加分
            const count = (chunkLower.match(new RegExp(word, 'g')) || []).length;
            score += Math.min(count - 1, 3);
          }
        }

        // 查询长度惩罚（太长的chunk相关性降低）
        if (chunk.length > 800) {
          score *= 0.8;
        }

        if (score > 0) {
          scoredChunks.push({
            ...chunk,
            docId: doc.id,
            docTitle: doc.title,
            docSource: doc.source,
            score
          });
        }
      }
    }

    // 按分数排序，取前topK个
    scoredChunks.sort((a, b) => b.score - a.score);
    return scoredChunks.slice(0, topK);
  }

  // 带来源归因的问答
  async answerWithAttribution(userId, question, options = {}) {
    const {
      topK = 5,
      includeSources = true,
      citationStyle = 'inline' // inline, footnote, numbered
    } = options;

    try {
      // 1. 搜索相关文档片段
      const relevantChunks = this.search(userId, question, topK);
      
      if (relevantChunks.length === 0) {
        // 没有相关文档，使用通用回答
        const response = await aiService.chat(question, {
          context: { type: 'general-qa' }
        });
        return {
          answer: response.content,
          sources: [],
          model: response.model
        };
      }

      // 2. 构建带上下文的提示
      const contextText = relevantChunks.map((chunk, idx) => 
        `[来源${idx + 1}: ${chunk.docTitle}]\n${chunk.text}`
      ).join('\n\n---\n\n');

      const prompt = `你是一个基于提供文档进行回答的AI助手。

## 用户问题
${question}

## 参考文档
${contextText}

## 回答要求
1. 必须仅基于上述参考文档内容回答，不要编造信息
2. 在回答中使用以下格式标注来源：
   - 内联引用：在相关句子末尾标注 [来源X]
   - 例如："机器学习是... [来源1]"
3. 如果参考文档中没有相关信息，明确说明"根据提供的文档，无法找到..."
4. 回答要清晰、有条理，适当使用列表

请开始回答：`;

      const response = await aiService.chat(prompt, {
        context: { type: 'rag-qa', sources: relevantChunks.map(c => c.docTitle) }
      });

      // 3. 解析回答中的引用
      const answerWithCitations = this.parseCitations(response.content, relevantChunks, citationStyle);

      logger.info('来源归因问答完成', { 
        userId, 
        questionLength: question.length,
        sourcesUsed: relevantChunks.length,
        model: response.model
      });

      return {
        answer: answerWithCitations,
        sources: includeSources ? relevantChunks.map((c, idx) => ({
          id: c.id,
          text: c.text.substring(0, 200) + '...',
          docTitle: c.docTitle,
          docSource: c.docSource,
          relevance: Math.round(c.score * 20)
        })) : [],
        model: response.model
      };
    } catch (error) {
      logger.error('来源归因问答失败', { error: error.message });
      throw error;
    }
  }

  // 解析回答中的引用标记
  parseCitations(answer, chunks, style) {
    // 简单处理：将 [来源X] 转换为带样式的HTML
    return answer.replace(/\[来源(\d+)\]/g, (match, num) => {
      const idx = parseInt(num) - 1;
      if (idx >= 0 && idx < chunks.length) {
        return `<span class="citation" data-source="${num}" title="${chunks[idx].docTitle}">[${num}]</span>`;
      }
      return match;
    });
  }

  // 从笔记本添加文档
  addFromNotebook(userId, notebookId, productService) {
    const workspace = productService.getWorkspace(userId);
    const notebook = workspace.notebooks?.find(n => n.id === notebookId);
    
    if (!notebook || !notebook.sources) {
      return [];
    }

    const addedDocs = [];
    for (const source of notebook.sources) {
      const doc = this.addDocument(userId, {
        title: source.title || '未命名',
        content: source.content || source.text || '',
        source: source.origin || '笔记本',
        type: source.type || 'notebook'
      });
      addedDocs.push(doc);
    }

    return addedDocs;
  }

  // 获取用户所有文档
  getAllDocuments(userId) {
    return this.getStore(userId).filter(d => !d.deleted);
  }

  // 删除文档
  deleteDocument(userId, docId) {
    const docs = this.getStore(userId);
    const doc = docs.find(d => d.id === docId);
    if (doc) {
      doc.deleted = true;
      this.saveStore(userId, docs);
      return true;
    }
    return false;
  }

  // 清空用户文档
  clearAll(userId) {
    this.saveStore(userId, []);
    return true;
  }
}

module.exports = new SourceAttributionService();
