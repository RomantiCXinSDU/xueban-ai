const aiService = require('./aiService');
const { logger } = require('../utils/logger');
const { DataStore } = require('./dataStore');

const guideStore = new DataStore('learning_guides');

class LearningGuideService {
  getStore(userId) {
    const data = guideStore.get(userId);
    return Array.isArray(data) ? data : [];
  }

  saveStore(userId, guides) {
    guideStore.set(userId, guides);
  }

  async generateGuide(userId, { topic, content, type = 'comprehensive' }) {
    try {
      const prompt = this.buildGuidePrompt(topic, content, type);
      const response = await aiService.chat(prompt, {
        context: { type: 'learning-guide', topic }
      });

      const guide = {
        id: `guide_${Date.now()}`,
        userId,
        topic,
        type,
        sections: this.parseGuideContent(response.content),
        createdAt: new Date().toISOString(),
        progress: 0,
        currentStep: 0
      };

      const guides = this.getStore(userId);
      guides.push(guide);
      this.saveStore(userId, guides);
      logger.info('生成学习指南成功', { userId, topic });

      return { success: true, guide };
    } catch (error) {
      logger.error('生成学习指南失败', { error: error.message });
      throw error;
    }
  }

  buildGuidePrompt(topic, content, type) {
    const prompts = {
      comprehensive: `你是AI学习导师，负责帮助学生深入理解"${topic}"这个知识点。

请用苏格拉底式教学方法（提问→引导→揭示）设计一个完整的学习指南。

格式要求（严格遵循JSON）：
{
  "title": "学习指南标题",
  "intro": "开篇引导（50字左右，激发学习兴趣）",
  "prerequisites": ["前置知识1", "前置知识2"],
  "steps": [
    {
      "title": "第1步：基础概念",
      "type": "concept",
      "content": "核心概念讲解（100字）",
      "analogy": "类比说明",
      "questions": ["引导问题1", "引导问题2", "引导问题3"],
      "commonMistakes": ["常见错误理解1"],
      "keyPoints": ["关键要点1", "关键要点2"]
    }
  ],
  "exercises": [
    {
      "question": "练习题",
      "hint": "解题提示",
      "answer": "答案解析"
    }
  ],
  "summary": "总结语（50字）",
  "nextTopics": ["相关进阶主题1", "相关进阶主题2"]
}

要求：
1. 生成4-6个步骤，覆盖概念→理解→应用→拓展
2. 每个步骤都要有苏格拉底式提问
3. 包含常见错误警示
4. 练习题要贴合实际考试风格
5. 只返回JSON，不要其他内容`,

      quick: `你是AI学习导师，帮助学生快速掌握"${topic}"。

生成一个快速学习指南：
{
  "title": "快速掌握：${topic}",
  "coreDefinition": "一句话核心定义",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "memoryTrick": "记忆口诀或技巧",
  "quickQuiz": {
    "question": "快速测验题",
    "options": ["A", "B", "C", "D"],
    "answer": "答案"
  }
}

只返回JSON`,

      exam: `你是AI考试导师，帮助学生备考"${topic}"。

生成考试冲刺指南：
{
  "title": "${topic} 考试冲刺",
  "frequentlyTested": ["高频考点1", "高频考点2", "高频考点3"],
  "commonPatterns": ["常见题型规律"],
  "formulaSheet": ["核心公式1", "核心公式2"],
  "trickQuestions": [
    {
      "question": "陷阱题",
      "trap": "陷阱分析",
      "solution": "正确解法"
    }
  ],
  "lastMinuteTips": ["临场技巧1", "临场技巧2"]
}

只返回JSON`
    };

    return prompts[type] || prompts.comprehensive;
  }

  parseGuideContent(content) {
    try {
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      return JSON.parse(jsonStr.trim());
    } catch (error) {
      logger.error('解析学习指南JSON失败', { error: error.message });
      return { title: '学习指南', intro: content };
    }
  }

  getGuide(userId, guideId) {
    return this.getStore(userId).find(g => g.id === guideId);
  }

  getAllGuides(userId) {
    return this.getStore(userId).filter(g => !g.deleted);
  }

  // 模拟苏格拉底式问答
  async socraticQA(userId, guideId, question, stepIndex) {
    const guide = this.getGuide(userId, guideId);
    if (!guide) {
      throw new Error('学习指南不存在');
    }

    const step = guide.sections.steps[stepIndex];
    const prompt = `你是AI学习导师，正在进行苏格拉底式教学。

当前学习主题：${guide.topic}
当前步骤：${step?.title || '总结'}
学生问题：${question}

请用苏格拉底式方法回答：
1. 先肯定学生的思考
2. 通过提问引导学生进一步思考
3. 不要直接给出答案，而是引导
4. 必要时提供提示而不是完整答案

回答格式：JSON
{
  "response": "回复内容（苏格拉底式引导）",
  "type": "question|explanation|hint|confirmation",
  "followUp": "追问问题（如果没有追问则为空字符串）"
}

只返回JSON`;

    try {
      const response = await aiService.chat(prompt, {
        context: { type: 'socratic-qa', guideId, stepIndex }
      });

      return this.parseSocraticResponse(response.content);
    } catch (error) {
      logger.error('苏格拉底问答失败', { error: error.message });
      throw error;
    }
  }

  parseSocraticResponse(content) {
    try {
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      return JSON.parse(jsonStr.trim());
    } catch (error) {
      return {
        response: content,
        type: 'explanation',
        followUp: ''
      };
    }
  }

  // 更新学习进度
  updateProgress(userId, guideId, progress) {
    const guides = this.getStore(userId);
    const guide = guides.find(g => g.id === guideId);
    if (guide) {
      guide.progress = Math.min(100, Math.max(0, progress));
      guide.currentStep = Math.floor((progress / 100) * (guide.sections.steps?.length || 1));
      this.saveStore(userId, guides);
      return guide;
    }
    return null;
  }

  deleteGuide(userId, guideId) {
    const guides = this.getStore(userId);
    const guide = guides.find(g => g.id === guideId);
    if (guide) {
      guide.deleted = true;
      this.saveStore(userId, guides);
      return true;
    }
    return false;
  }
}

module.exports = new LearningGuideService();
