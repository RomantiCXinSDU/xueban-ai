const aiService = require('./aiService');
const { logger } = require('../utils/logger');
const { DataStore } = require('./dataStore');

const audioStore = new DataStore('audio_overviews');

class AudioOverviewService {
  getStore(userId) {
    const data = audioStore.get(userId);
    return Array.isArray(data) ? data : [];
  }

  saveStore(userId, overviews) {
    audioStore.set(userId, overviews);
  }

  async generateOverview(userId, { content, topic, format = 'deep-dive', duration = 'medium' }) {
    try {
      const prompt = this.buildAudioPrompt(topic, content, format, duration);
      const response = await aiService.chat(prompt, {
        context: { type: 'audio-overview', format }
      });

      const overview = {
        id: `audio_${Date.now()}`,
        userId,
        topic,
        format,
        duration,
        script: this.parseScript(response.content),
        createdAt: new Date().toISOString(),
        status: 'generated'
      };

      const overviews = this.getStore(userId);
      overviews.push(overview);
      this.saveStore(userId, overviews);
      logger.info('生成音频概述成功', { userId, topic, format });

      return { success: true, overview };
    } catch (error) {
      logger.error('生成音频概述失败', { error: error.message });
      throw error;
    }
  }

  buildAudioPrompt(topic, content, format, duration) {
    const formatDescriptions = {
      'deep-dive': '深度探讨 - 两位主持人深入分析内容，适合详细学习',
      'brief': '简报 - 快速3分钟概述，适合快速了解要点',
      'critique': '评论 - 从批判角度分析内容的优缺点',
      'debate': '辩论 - 两位主持人持不同观点进行辩论',
      'story': '故事化 - 将内容转化为引人入胜的故事叙述'
    };

    const durationGuide = {
      'short': '约2-3分钟对话',
      'medium': '约5-7分钟对话',
      'long': '约10-15分钟对话'
    };

    return `你是一位专业的音频内容创作者，需要将以下学习资料转化为双人对话式的音频脚本。

主题：${topic}
学习资料：
${content}

格式要求：${formatDescriptions[format] || formatDescriptions['deep-dive']}
时长要求：${durationGuide[duration] || durationGuide['medium']}

请生成一个双人对话脚本，使用以下JSON格式：

{
  "title": "音频概述标题",
  "hosts": {
    "host1": {
      "name": "主持人A名字",
      "role": "讲解者/引导者",
      "tone": "专业/亲切"
    },
    "host2": {
      "name": "主持人B名字",
      "role": "提问者/补充者",
      "tone": "好奇/深入"
    }
  },
  "intro": "开场白（30秒）",
  "dialogue": [
    {
      "speaker": "host1",
      "text": "对话内容",
      "emphasis": "重点强调的词",
      "pause": false
    }
  ],
  "sections": [
    {
      "title": "第一部分：核心概念",
      "summary": "这部分讲了什么"
    }
  ],
  "outro": "结束语（30秒）",
  "keyTakeaways": ["核心收获1", "核心收获2"],
  "estimatedDuration": "预计时长（分钟）"
}

对话要求：
1. 两位主持人要有明确的角色分工
2. 对话要自然流畅，像真实的广播节目
3. 适当加入提问、感叹、过渡
4. 重要概念要强调
5. ${format === 'debate' ? '两位主持人要持不同观点，进行有理有据的辩论' : ''}
6. ${format === 'critique' ? '要从批判角度分析，指出内容的局限性和改进建议' : ''}
7. ${format === 'story' ? '将抽象概念转化为生动的故事和类比' : ''}

只返回JSON格式的内容`;
  }

  parseScript(content) {
    try {
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      return JSON.parse(jsonStr.trim());
    } catch (error) {
      logger.error('解析音频脚本JSON失败', { error: error.message });
      return {
        title: '音频概述',
        dialogue: [{ speaker: 'host1', text: content }],
        intro: '',
        outro: ''
      };
    }
  }

  // 生成音频文件（如果配置了TTS）
  async generateAudio(userId, overviewId) {
    const overview = this.getOverview(userId, overviewId);
    if (!overview) {
      throw new Error('音频概述不存在');
    }

    // 这里可以集成TTS API
    // 目前返回脚本文本，用户可以自行使用其他TTS工具
    overview.status = 'ready';
    return {
      success: true,
      message: '音频脚本已生成，可使用TTS工具转换为音频',
      script: overview.script
    };
  }

  getOverviews(userId) {
    return this.getStore(userId).filter(o => !o.deleted);
  }

  getOverview(userId, overviewId) {
    return this.getStore(userId).find(o => o.id === overviewId);
  }

  deleteOverview(userId, overviewId) {
    const overviews = this.getStore(userId);
    const overview = overviews.find(o => o.id === overviewId);
    if (overview) {
      overview.deleted = true;
      this.saveStore(userId, overviews);
      return true;
    }
    return false;
  }

  // 从笔记本生成
  async generateFromNotebook(userId, notebookId, productService, format = 'deep-dive') {
    const workspace = productService.getWorkspace(userId);
    const notebook = workspace.notebooks?.find(n => n.id === notebookId);
    
    if (!notebook) {
      throw new Error('笔记本不存在');
    }

    let content = '';
    if (notebook.sources) {
      content = notebook.sources.map(s => s.content || s.text || '').join('\n\n');
    }

    return this.generateOverview(userId, {
      content,
      topic: notebook.title || '笔记本内容',
      format
    });
  }
}

module.exports = new AudioOverviewService();