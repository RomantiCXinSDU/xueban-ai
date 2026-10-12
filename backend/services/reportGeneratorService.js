const aiService = require('./aiService');
const { logger } = require('../utils/logger');
const { DataStore } = require('./dataStore');

const reportStore = new DataStore('reports');

class ReportGeneratorService {
  getStore(userId) {
    const data = reportStore.get(userId);
    return Array.isArray(data) ? data : [];
  }

  saveStore(userId, reports) {
    reportStore.set(userId, reports);
  }

  async generateReport(userId, { content, topic, type = 'learning-guide', format = 'detailed' }) {
    try {
      const prompt = this.buildReportPrompt(topic, content, type, format);
      const response = await aiService.chat(prompt, {
        context: { type: 'report-generation', reportType: type }
      });

      const report = {
        id: `report_${Date.now()}`,
        userId,
        topic,
        type,
        format,
        content: this.parseReportContent(response.content, type),
        rawContent: response.content,
        createdAt: new Date().toISOString()
      };

      const reports = this.getStore(userId);
      reports.push(report);
      this.saveStore(userId, reports);
      logger.info('生成报告成功', { userId, topic, type });

      return { success: true, report };
    } catch (error) {
      logger.error('生成报告失败', { error: error.message });
      throw error;
    }
  }

  buildReportPrompt(topic, content, type, format) {
    const prompts = {
      'learning-guide': `你是一个专业的学习顾问，为学生生成详细的学习指南。

主题：${topic}
相关学习资料：
${content}

请生成一份完整的${format === 'brief' ? '简明' : '详细'}学习指南，使用以下JSON格式：

{
  "title": "学习指南标题",
  "overview": "学习目标概述（100字）",
  "keyConcepts": [
    {
      "concept": "核心概念名称",
      "definition": "定义解释",
      "importance": "重要性说明"
    }
  ],
  "learningPath": [
    {
      "stage": "阶段1：基础",
      "objectives": ["学习目标1", "学习目标2"],
      "resources": ["推荐资源"],
      "estimatedTime": "预计时间"
    }
  ],
  "practiceExercises": [
    {
      "type": "练习类型",
      "question": "练习题",
      "solution": "解题思路"
    }
  ],
  "commonPitfalls": ["常见误区1", "常见误区2"],
  "successCriteria": ["达成标准1", "达成标准2"],
  "additionalResources": ["拓展资源1", "拓展资源2"]
}

${format === 'brief' ? '生成简化版本，每个部分减少到2-3项' : ''}
只返回JSON`,

      'glossary': `你是一个专业的术语专家，为学习资料生成术语表。

主题：${topic}
学习资料：
${content}

请生成一份专业的术语表，使用以下JSON格式：

{
  "title": "${topic} 术语表",
  "introduction": "术语表简介（50字）",
  "terms": [
    {
      "term": "术语名称",
      "pinyin": "拼音（如适用）",
      "definition": "标准定义",
      "example": "使用示例",
      "relatedTerms": ["相关术语1", "相关术语2"],
      "difficulty": "基础|进阶|高级"
    }
  ],
  "categories": {
    "basic": ["基础术语列表"],
    "advanced": ["进阶术语列表"],
    "specialized": ["专业术语列表"]
  },
  "studyTips": ["记忆技巧1", "记忆技巧2"]
}

${format === 'brief' ? '生成简化版本，包含最重要的8-10个术语' : ''}
只返回JSON`,

      'summary': `你是一个学术写作助手，为学习资料生成摘要报告。

主题：${topic}
学习资料：
${content}

请生成一份结构化摘要，使用以下JSON格式：

{
  "title": "摘要标题",
  "executiveSummary": "执行摘要（100字）",
  "mainPoints": [
    {
      "point": "要点标题",
      "description": "要点描述",
      "keyInsight": "关键洞察"
    }
  ],
  "keyTakeaways": ["核心收获1", "核心收获2", "核心收获3"],
  "implications": "实际应用意义",
  "questionsForReflection": ["反思问题1", "反思问题2"]
}

${format === 'brief' ? '生成极简版本' : ''}
只返回JSON`,

      'cheatsheet': `你是一个考试专家，为备考生成速查表。

主题：${topic}
学习资料：
${content}

请生成一份考试速查表，使用以下JSON格式：

{
  "title": "${topic} 速查表",
  "mustKnow": [
    {
      "formula": "核心公式/定律",
      "explanation": "简要说明",
      "application": "应用场景"
    }
  ],
  "quickReference": {
    "definitions": ["快速定义1", "快速定义2"],
    "procedures": ["操作步骤1", "操作步骤2"],
    "commonPatterns": ["常见模式1", "常见模式2"]
  },
  "memoryAids": ["助记技巧1", "助记技巧2"],
  "lastMinuteChecklist": ["考前检查1", "考前检查2"]
}

${format === 'brief' ? '只生成mustKnow和lastMinuteChecklist两部分' : ''}
只返回JSON`
    };

    return prompts[type] || prompts['learning-guide'];
  }

  parseReportContent(content, type) {
    try {
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      return JSON.parse(jsonStr.trim());
    } catch (error) {
      logger.error('解析报告JSON失败', { error: error.message });
      return { title: '报告', content: content };
    }
  }

  getReports(userId) {
    return this.getStore(userId).filter(r => !r.deleted);
  }

  getReport(userId, reportId) {
    return this.getStore(userId).find(r => r.id === reportId);
  }

  deleteReport(userId, reportId) {
    const reports = this.getStore(userId);
    const report = reports.find(r => r.id === reportId);
    if (report) {
      report.deleted = true;
      this.saveStore(userId, reports);
      return true;
    }
    return false;
  }
}

module.exports = new ReportGeneratorService();
