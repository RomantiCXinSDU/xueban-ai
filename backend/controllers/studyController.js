const { v4: uuidv4 } = require('uuid');
const { studyPlansStore } = require('../services/dataStore');

let studyPlans = [];
let studyProgress = [];
let studyMaterials = [];

exports.getUserPlans = (req, res) => {
  const userId = req.user?.userId || 'default';
  const userPlans = studyPlans.filter(plan => plan.userId === userId);
  
  res.json({
    success: true,
    plans: userPlans
  });
};

exports.createPlan = (req, res) => {
  try {
    const { subject, goal, duration, dailyHours } = req.body;
    const userId = req.user?.userId || 'default';

    if (!subject || !goal || !duration) {
      return res.status(400).json({ error: '请提供完整的学习计划信息' });
    }

    const plan = {
      id: uuidv4(),
      userId,
      subject,
      goal,
      duration: parseInt(duration),
      dailyHours: dailyHours || 2,
      createdAt: new Date(),
      status: 'active',
      schedule: generateSchedule(subject, parseInt(duration)),
      progress: []
    };

    studyPlans.push(plan);

    res.status(201).json({
      success: true,
      message: '学习计划创建成功',
      plan
    });
  } catch (error) {
    res.status(500).json({ error: '服务器内部错误' });
  }
};

function generateSchedule(subject, days) {
  const schedule = [];
  const topics = {
    math: ['基础概念', '公式定理', '例题解析', '练习题', '错题整理', '模拟测试'],
    programming: ['基础语法', '数据结构', '算法练习', '项目实践', '代码优化', '综合测试'],
    english: ['词汇积累', '语法巩固', '阅读理解', '写作练习', '听力训练', '模拟考试'],
    physics: ['概念理解', '公式推导', '例题分析', '实验理解', '习题练习', '综合复习'],
    chemistry: ['元素周期表', '化学反应', '方程式配平', '计算练习', '实验分析', '综合测试']
  };
  
  const subjectTopics = topics[subject.toLowerCase()] || topics.math;
  
  for (let i = 1; i <= days; i++) {
    const topicIndex = (i - 1) % subjectTopics.length;
    schedule.push({
      day: i,
      topic: subjectTopics[topicIndex],
      completed: false,
      notes: ''
    });
  }
  
  return schedule;
}

exports.getPlanById = (req, res) => {
  const { id } = req.params;
  const plan = studyPlans.find(p => p.id === id);

  if (!plan) {
    return res.status(404).json({ error: '学习计划不存在' });
  }

  res.json({
    success: true,
    plan
  });
};

exports.updatePlan = (req, res) => {
  const { id } = req.params;
  const planIndex = studyPlans.findIndex(p => p.id === id);

  if (planIndex === -1) {
    return res.status(404).json({ error: '学习计划不存在' });
  }

  const updates = req.body;
  studyPlans[planIndex] = { ...studyPlans[planIndex], ...updates, updatedAt: new Date() };

  res.json({
    success: true,
    message: '学习计划更新成功',
    plan: studyPlans[planIndex]
  });
};

exports.deletePlan = (req, res) => {
  const { id } = req.params;
  const planIndex = studyPlans.findIndex(p => p.id === id);

  if (planIndex === -1) {
    return res.status(404).json({ error: '学习计划不存在' });
  }

  studyPlans.splice(planIndex, 1);

  res.json({
    success: true,
    message: '学习计划删除成功'
  });
};

exports.getProgress = (req, res) => {
  const userId = req.user?.userId || 'default';
  const userProgress = studyProgress.filter(p => p.userId === userId);
  
  res.json({
    success: true,
    progress: userProgress
  });
};

exports.updateProgress = (req, res) => {
  try {
    const { planId, day, completed, notes } = req.body;
    const userId = req.user?.userId || 'default';

    const plan = studyPlans.find(p => p.id === planId);
    if (!plan) {
      return res.status(404).json({ error: '学习计划不存在' });
    }

    const dayIndex = plan.schedule.findIndex(s => s.day === day);
    if (dayIndex === -1) {
      return res.status(400).json({ error: '指定的天数不存在' });
    }

    plan.schedule[dayIndex].completed = completed;
    if (notes) {
      plan.schedule[dayIndex].notes = notes;
    }

    const completedDays = plan.schedule.filter(s => s.completed).length;
    const totalDays = plan.schedule.length;
    const overallProgress = Math.round((completedDays / totalDays) * 100);

    let userProgress = studyProgress.find(p => p.userId === userId && p.planId === planId);
    if (userProgress) {
      userProgress.completedDays = completedDays;
      userProgress.progress = overallProgress;
      userProgress.updatedAt = new Date();
    } else {
      studyProgress.push({
        userId,
        planId,
        completedDays,
        progress: overallProgress,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    res.json({
      success: true,
      message: '进度更新成功',
      progress: {
        planId,
        day,
        completed,
        overallProgress,
        totalDays,
        completedDays
      }
    });
  } catch (error) {
    res.status(500).json({ error: '服务器内部错误' });
  }
};

exports.getStudyMaterials = (req, res) => {
  const userId = req.user?.userId || 'default';
  const userMaterials = studyMaterials.filter(m => m.userId === userId);
  
  res.json({
    success: true,
    materials: userMaterials
  });
};

exports.addStudyMaterial = (req, res) => {
  try {
    const { title, type, url, notes } = req.body;
    const userId = req.user?.userId || 'default';

    if (!title) {
      return res.status(400).json({ error: '请提供学习资料标题' });
    }

    const material = {
      id: uuidv4(),
      userId,
      title,
      type: type || 'other',
      url,
      notes,
      createdAt: new Date()
    };

    studyMaterials.push(material);

    res.status(201).json({
      success: true,
      message: '学习资料添加成功',
      material
    });
  } catch (error) {
    res.status(500).json({ error: '服务器内部错误' });
  }
};

exports.savePlan = (req, res) => {
  try {
    const { plan, userId = 'default' } = req.body;
    
    if (!plan) {
      return res.status(400).json({ error: '请提供学习计划' });
    }

    const savedPlan = {
      id: uuidv4(),
      userId,
      plan,
      createdAt: new Date().toISOString(),
      completedDays: []
    };

    studyPlansStore.appendToList('plans', savedPlan);

    res.status(201).json({
      success: true,
      message: '学习计划保存成功',
      plan: savedPlan
    });
  } catch (error) {
    res.status(500).json({ error: '服务器内部错误' });
  }
};