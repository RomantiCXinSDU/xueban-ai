/**
 * 学伴AI - 学习计划服务
 * 包含遗忘曲线复习计划生成
 */
const { v4: uuidv4 } = require('uuid');
const profileService = require('./profileService');

// 艾宾浩斯遗忘曲线复习间隔（天）
const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

// 生成学习计划
async function generateStudyPlan(userId = 'default', options = {}) {
    const profile = await profileService.getProfile(userId);
    const weakChapters = await profileService.getWeakChapterStats(userId);
    
    if (!profile.profileComplete) {
        throw new Error('请先完成学习画像采集');
    }
    
    const {
        examDate = profile.examInfo.examDate,
        dailyHours = profile.learningHabits.dailyHours,
        preferredMethod = profile.learningHabits.preferredMethod,
        targetDays = options.targetDays || 30
    } = options;
    
    // 计算剩余天数
    const daysLeft = calculateDaysLeft(examDate);
    if (daysLeft <= 0) {
        throw new Error('考试时间已过');
    }
    
    // 生成三阶段复习计划
    const plan = {
        id: uuidv4(),
        userId,
        examDate,
        daysLeft,
        totalHoursNeeded: daysLeft * dailyHours,
        phases: generatePhases(daysLeft, weakChapters, dailyHours, preferredMethod),
        dailyTasks: generateDailyTasks(daysLeft, weakChapters, preferredMethod),
        milestones: generateMilestones(daysLeft),
        createdAt: new Date().toISOString()
    };
    
    return plan;
}

// 生成三阶段复习计划
function generatePhases(daysLeft, weakChapters, dailyHours, method) {
    const phase1Days = Math.ceil(daysLeft * 0.4); // 基础阶段40%
    const phase2Days = Math.ceil(daysLeft * 0.4); // 强化阶段40%
    const phase3Days = daysLeft - phase1Days - phase2Days; // 冲刺阶段20%
    
    const phases = [];
    
    // 阶段1：基础巩固
    phases.push({
        name: '基础巩固',
        days: phase1Days,
        hoursPerDay: dailyHours,
        focus: '全面复习，打好基础',
        tasks: [
            '梳理教材整体框架',
            '理解基本概念和原理',
            '完成基础练习题',
            '整理知识点笔记'
        ],
        weakChapterRatio: 0.3,
        recommendedMethod: method === '刷题' ? '先看教材后刷题' : 
                          method === '看视频' ? '看视频+做笔记' : '教材+视频结合'
    });
    
    // 阶段2：重点强化
    phases.push({
        name: '重点强化',
        days: phase2Days,
        hoursPerDay: dailyHours,
        focus: '针对薄弱环节重点突破',
        tasks: [
            '针对薄弱章节专项练习',
            '高频考点强化训练',
            '错题本复习',
            '总结解题方法和技巧'
        ],
        weakChapterRatio: 0.6,
        recommendedMethod: '薄弱点+高频考点双线并进'
    });
    
    // 阶段3：考前冲刺
    phases.push({
        name: '考前冲刺',
        days: phase3Days,
        hoursPerDay: Math.min(dailyHours * 1.2, dailyHours + 1),
        focus: '真题演练，查漏补缺',
        tasks: [
            '限时做历年真题',
            '回顾错题本',
            '背诵重要公式和概念',
            '调整心态，保持状态'
        ],
        weakChapterRatio: 0.2,
        recommendedMethod: '真题模拟+错题回顾'
    });
    
    return phases;
}

// 生成每日任务
function generateDailyTasks(daysLeft, weakChapters, method) {
    const tasks = [];
    const today = new Date();
    
    for (let i = 0; i < Math.min(daysLeft, 30); i++) {
        const date = new Date(today);
        date.setDate(date.getDate() + i);
        
        const dayPhase = i < daysLeft * 0.4 ? 1 : 
                        i < daysLeft * 0.8 ? 2 : 3;
        
        const dayTasks = generateDayTask(dayPhase, weakChapters, method, i);
        
        tasks.push({
            date: date.toISOString().split('T')[0],
            dayNumber: i + 1,
            phase: dayPhase,
            tasks: dayTasks,
            estimatedHours: 2 + Math.random() * 2
        });
    }
    
    return tasks;
}

// 生成单日任务
function generateDayTask(phase, weakChapters, method, dayNumber) {
    const tasks = [];
    
    switch (phase) {
        case 1: // 基础阶段
            tasks.push({
                type: 'review',
                content: '复习昨日学习内容',
                duration: 0.5,
                priority: 'normal'
            });
            tasks.push({
                type: 'learn',
                content: '学习新章节内容',
                duration: 1.5,
                priority: 'high'
            });
            tasks.push({
                type: 'practice',
                content: '完成基础练习题',
                duration: 1,
                priority: 'high'
            });
            tasks.push({
                type: 'note',
                content: '整理今日知识点',
                duration: 0.5,
                priority: 'normal'
            });
            break;
            
        case 2: // 强化阶段
            tasks.push({
                type: 'weak-review',
                content: '复习薄弱章节',
                duration: 1,
                priority: 'high'
            });
            tasks.push({
                type: 'practice',
                content: '专项练习',
                duration: 1.5,
                priority: 'high'
            });
            tasks.push({
                type: 'wrong-review',
                content: '回顾错题本',
                duration: 0.5,
                priority: 'high'
            });
            tasks.push({
                type: 'summary',
                content: '总结解题方法',
                duration: 0.5,
                priority: 'normal'
            });
            break;
            
        case 3: // 冲刺阶段
            tasks.push({
                type: 'mock-test',
                content: '做一套模拟题',
                duration: 2,
                priority: 'high'
            });
            tasks.push({
                type: 'wrong-review',
                content: '回顾错题',
                duration: 0.5,
                priority: 'high'
            });
            tasks.push({
                type: 'formula',
                content: '背诵重要公式',
                duration: 0.5,
                priority: 'normal'
            });
            break;
    }
    
    return tasks;
}

// 生成里程碑
function generateMilestones(daysLeft) {
    const milestones = [];
    
    // 30%进度
    milestones.push({
        day: Math.ceil(daysLeft * 0.7),
        name: '基础阶段完成',
        description: '完成教材第一轮复习，建立整体框架'
    });
    
    // 50%进度
    milestones.push({
        day: Math.ceil(daysLeft * 0.5),
        name: '薄弱点突破',
        description: '针对薄弱环节完成专项训练'
    });
    
    // 70%进度
    milestones.push({
        day: Math.ceil(daysLeft * 0.3),
        name: '真题演练',
        description: '完成至少3套历年真题'
    });
    
    // 考试前3天
    if (daysLeft > 3) {
        milestones.push({
            day: 3,
            name: '最后冲刺',
            description: '回顾重点，回顾错题，调整状态'
        });
    }
    
    return milestones;
}

// 获取待复习任务（基于遗忘曲线）
async function getReviewTasks(userId = 'default') {
    const questions = await profileService.getQuestionsForReview(userId);
    const now = new Date();
    
    // 按紧迫程度分组
    const overdue = [];
    const today = [];
    const upcoming = [];
    
    questions.forEach(q => {
        if (!q.nextReviewDate) {
            today.push(q);
        } else {
            const reviewDate = new Date(q.nextReviewDate);
            if (reviewDate <= now) {
                overdue.push(q);
            } else {
                upcoming.push(q);
            }
        }
    });
    
    return {
        overdue: overdue.length,
        today: today.length,
        upcoming: upcoming.length,
        questions: {
            overdue,
            today,
            upcoming: upcoming.slice(0, 10) // 只显示未来10个
        }
    };
}

// 生成薄弱章节复习计划
async function generateWeakChapterPlan(userId = 'default', chapter) {
    const wrongBook = await profileService.getWrongBook(userId);
    const chapterQuestions = wrongBook.questions.filter(q => q.chapter === chapter);
    
    if (chapterQuestions.length === 0) {
        return {
            chapter,
            message: '该章节没有错题记录',
            mastered: true
        };
    }
    
    const mastered = chapterQuestions.filter(q => q.mastered).length;
    const total = chapterQuestions.length;
    const masteryRate = (mastered / total * 100).toFixed(1);
    
    // 生成复习计划
    const plan = {
        chapter,
        totalQuestions: total,
        masteredQuestions: mastered,
        masteryRate,
        reviewPlan: [],
        estimatedTime: Math.ceil(total * 0.3) // 预计每题3分钟
    };
    
    // 未掌握的题目安排复习
    const unmastered = chapterQuestions.filter(q => !q.mastered);
    unmastered.forEach((q, index) => {
        const interval = REVIEW_INTERVALS[Math.min(q.timesReviewed, REVIEW_INTERVALS.length - 1)];
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + interval);
        
        plan.reviewPlan.push({
            questionId: q.id,
            question: q.question.substring(0, 50) + '...',
            reason: q.errorReason,
            scheduledDate: nextDate.toISOString().split('T')[0],
            priority: index < 3 ? 'high' : 'normal'
        });
    });
    
    return plan;
}

// 计算距离考试的天数
function calculateDaysLeft(examDate) {
    if (!examDate) return 30; // 默认30天
    const exam = new Date(examDate);
    const now = new Date();
    const diff = exam.getTime() - now.getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// 生成学习统计报告
async function generateStudyReport(userId = 'default') {
    const profile = await profileService.getProfile(userId);
    const wrongBook = await profileService.getWrongBook(userId);
    const studyRecord = await profileService.getStudyRecord(userId);
    const weakChapters = await profileService.getWeakChapterStats(userId);
    const statistics = await profileService.getStudyStatistics(userId);
    
    const report = {
        student: {
            name: profile.basicInfo.name,
            university: profile.basicInfo.university,
            grade: profile.basicInfo.grade,
            major: profile.basicInfo.major,
            targetCourse: profile.basicInfo.targetCourse
        },
        exam: {
            date: profile.examInfo.examDate,
            daysLeft: calculateDaysLeft(profile.examInfo.examDate),
            difficulty: profile.examInfo.examDifficulty
        },
        progress: {
            masteryRate: statistics.masteryRate,
            totalQuestions: statistics.totalQuestions,
            masteredQuestions: statistics.masteredQuestions,
            weakPoints: statistics.weakPoints,
            studyHours: statistics.totalStudyHours,
            questionsAsked: statistics.questionsAsked
        },
        weakChapters: weakChapters.slice(0, 5), // 前5个薄弱章节
        recentActivity: studyRecord.records.slice(-7), // 最近7条记录
        recommendations: generateRecommendations(profile, weakChapters, statistics)
    };
    
    return report;
}

// 生成学习建议
function generateRecommendations(profile, weakChapters, statistics) {
    const recommendations = [];
    
    // 基于薄弱章节的建议
    if (weakChapters.length > 0) {
        recommendations.push({
            type: 'weak-chapter',
            priority: 'high',
            content: `建议优先攻克薄弱章节：${weakChapters[0].chapter}，该章节错题率达${weakChapters[0].masteryRate}%`
        });
    }
    
    // 基于掌握率的建议
    if (parseFloat(statistics.masteryRate) < 50) {
        recommendations.push({
            type: 'mastery',
            priority: 'high',
            content: '整体掌握率偏低，建议加强基础概念的理解和练习'
        });
    } else if (parseFloat(statistics.masteryRate) >= 80) {
        recommendations.push({
            type: 'mastery',
            priority: 'medium',
            content: '整体掌握较好，可以开始做真题演练'
        });
    }
    
    // 基于学习时间的建议
    if (statistics.totalStudyHours < 10) {
        recommendations.push({
            type: 'study-time',
            priority: 'high',
            content: '学习时间较少，建议每天保证2-3小时的学习时间'
        });
    }
    
    // 基于提问频率的建议
    if (statistics.questionsAsked > 50) {
        recommendations.push({
            type: 'question',
            priority: 'low',
            content: '提问较多，可以尝试自己思考后再提问，加深理解'
        });
    }
    
    return recommendations;
}

module.exports = {
    generateStudyPlan,
    getReviewTasks,
    generateWeakChapterPlan,
    generateStudyReport,
    calculateDaysLeft
};
