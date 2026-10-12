/**
 * 学伴AI - 用户学习画像和薄弱点追踪服务
 */
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '..', 'database', 'profiles');

// 确保数据目录存在
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        logger.error('创建数据目录失败', { error: error.message });
    }
}

// 获取用户画像文件路径
function getProfilePath(userId = 'default') {
    return path.join(DATA_DIR, `profile_${userId}.json`);
}

// 获取错题本文件路径
function getWrongBookPath(userId = 'default') {
    return path.join(DATA_DIR, `wrongbook_${userId}.json`);
}

// 获取学习记录文件路径
function getStudyRecordPath(userId = 'default') {
    return path.join(DATA_DIR, `study_${userId}.json`);
}

// 初始化用户画像
async function initProfile(userId = 'default') {
    const profilePath = getProfilePath(userId);
    try {
        const data = await fs.readFile(profilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // 如果文件不存在，创建默认画像
        const defaultProfile = {
            userId,
            basicInfo: {
                name: '',
                university: '',
                grade: '',
                major: '',
                targetCourse: ''
            },
            examInfo: {
                examDate: '',
                examDifficulty: '',
                hasPastPapers: false,
                targetType: '' // 期末考试/考研/考证/竞赛
            },
            learningStatus: {
                textbook: '',
                currentChapter: '',
                weakChapters: [],
                strongChapters: []
            },
            learningHabits: {
                dailyHours: 0,
                preferredMethod: '', // 看视频/刷题/看教材/混合
                bestTimeSlot: '' // 早上/下午/晚上/深夜
            },
            profileComplete: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await saveProfile(userId, defaultProfile);
        return defaultProfile;
    }
}

// 保存用户画像
async function saveProfile(userId = 'default', profile) {
    const profilePath = getProfilePath(userId);
    profile.updatedAt = new Date().toISOString();
    try {
        await fs.writeFile(profilePath, JSON.stringify(profile, null, 2), 'utf8');
        return true;
    } catch (error) {
        logger.error('保存用户画像失败', { error: error.message });
        return false;
    }
}

// 更新用户画像字段
async function updateProfileField(userId = 'default', field, value) {
    const profile = await initProfile(userId);
    
    // 处理嵌套字段更新
    const fields = field.split('.');
    let current = profile;
    for (let i = 0; i < fields.length - 1; i++) {
        current = current[fields[i]];
    }
    current[fields[fields.length - 1]] = value;
    
    await saveProfile(userId, profile);
    return profile;
}

// 获取错题本
async function getWrongBook(userId = 'default') {
    const wrongBookPath = getWrongBookPath(userId);
    try {
        const data = await fs.readFile(wrongBookPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // 如果文件不存在，创建空错题本
        const emptyWrongBook = {
            userId,
            questions: [],
            statistics: {
                total: 0,
                bySubject: {},
                byChapter: {}
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await saveWrongBook(userId, emptyWrongBook);
        return emptyWrongBook;
    }
}

// 保存错题本
async function saveWrongBook(userId = 'default', wrongBook) {
    const wrongBookPath = getWrongBookPath(userId);
    wrongBook.updatedAt = new Date().toISOString();
    try {
        await fs.writeFile(wrongBookPath, JSON.stringify(wrongBook, null, 2), 'utf8');
        return true;
    } catch (error) {
        logger.error('保存错题本失败', { error: error.message });
        return false;
    }
}

// 添加错题
async function addWrongQuestion(userId = 'default', question) {
    const wrongBook = await getWrongBook(userId);
    
    const newQuestion = {
        id: uuidv4(),
        subject: question.subject || '',
        chapter: question.chapter || '',
        question: question.question,
        answer: question.answer || '',
        errorReason: question.errorReason || '', // 粗心/概念不清/完全不会
        knowledgePoints: question.knowledgePoints || [],
        difficulty: question.difficulty || 'medium',
        timesReviewed: 0,
        lastReviewDate: null,
        nextReviewDate: null,
        mastered: false,
        createdAt: new Date().toISOString()
    };
    
    wrongBook.questions.push(newQuestion);
    wrongBook.statistics.total = wrongBook.questions.length;
    
    // 更新统计
    if (wrongBook.statistics.bySubject[question.subject]) {
        wrongBook.statistics.bySubject[question.subject]++;
    } else {
        wrongBook.statistics.bySubject[question.subject] = 1;
    }
    
    if (wrongBook.statistics.byChapter[question.chapter]) {
        wrongBook.statistics.byChapter[question.chapter]++;
    } else {
        wrongBook.statistics.byChapter[question.chapter] = 1;
    }
    
    await saveWrongBook(userId, wrongBook);
    return newQuestion;
}

// 删除错题
async function removeWrongQuestion(userId = 'default', questionId) {
    const wrongBook = await getWrongBook(userId);
    const questionIndex = wrongBook.questions.findIndex(q => q.id === questionId);
    
    if (questionIndex !== -1) {
        const removed = wrongBook.questions.splice(questionIndex, 1)[0];
        wrongBook.statistics.total = wrongBook.questions.length;
        
        // 更新统计
        if (wrongBook.statistics.bySubject[removed.subject]) {
            wrongBook.statistics.bySubject[removed.subject]--;
        }
        if (wrongBook.statistics.byChapter[removed.chapter]) {
            wrongBook.statistics.byChapter[removed.chapter]--;
        }
        
        await saveWrongBook(userId, wrongBook);
        return true;
    }
    return false;
}

// 获取待复习的错题（基于遗忘曲线）
async function getQuestionsForReview(userId = 'default') {
    const wrongBook = await getWrongBook(userId);
    const now = new Date();
    
    return wrongBook.questions.filter(q => {
        if (q.mastered) return false;
        if (!q.nextReviewDate) return true;
        return new Date(q.nextReviewDate) <= now;
    }).sort((a, b) => {
        // 按复习紧迫程度排序
        if (!a.nextReviewDate) return -1;
        if (!b.nextReviewDate) return 1;
        return new Date(a.nextReviewDate) - new Date(b.nextReviewDate);
    });
}

// 更新错题复习状态（艾宾浩斯遗忘曲线）
async function updateQuestionReview(userId = 'default', questionId, mastered = false) {
    const wrongBook = await getWrongBook(userId);
    const question = wrongBook.questions.find(q => q.id === questionId);
    
    if (question) {
        question.timesReviewed++;
        question.lastReviewDate = new Date().toISOString();
        question.mastered = mastered;
        
        if (mastered) {
            question.nextReviewDate = null;
        } else {
            // 艾宾浩斯遗忘曲线：1天后、3天后、7天后、14天后、30天后
            const intervals = [1, 3, 7, 14, 30];
            const interval = intervals[Math.min(question.timesReviewed - 1, intervals.length - 1)];
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + interval);
            question.nextReviewDate = nextDate.toISOString();
        }
        
        await saveWrongBook(userId, wrongBook);
        return question;
    }
    return null;
}

// 获取薄弱章节统计
async function getWeakChapterStats(userId = 'default') {
    const wrongBook = await getWrongBook(userId);
    
    const chapterStats = {};
    wrongBook.questions.forEach(q => {
        if (!chapterStats[q.chapter]) {
            chapterStats[q.chapter] = {
                chapter: q.chapter,
                total: 0,
                wrongCount: 0,
                masteredCount: 0,
                masteryRate: 0
            };
        }
        chapterStats[q.chapter].total++;
        if (!q.mastered) {
            chapterStats[q.chapter].wrongCount++;
        } else {
            chapterStats[q.chapter].masteredCount++;
        }
        chapterStats[q.chapter].masteryRate = 
            chapterStats[q.chapter].total > 0 
                ? (chapterStats[q.chapter].masteredCount / chapterStats[q.chapter].total * 100).toFixed(1)
                : 0;
    });
    
    return Object.values(chapterStats).sort((a, b) => b.wrongCount - a.wrongCount);
}

// 获取学习记录
async function getStudyRecord(userId = 'default') {
    const studyRecordPath = getStudyRecordPath(userId);
    try {
        const data = await fs.readFile(studyRecordPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        const emptyRecord = {
            userId,
            records: [],
            statistics: {
                totalStudyDays: 0,
                totalStudyHours: 0,
                questionsAsked: 0,
                wrongQuestions: 0
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await saveStudyRecord(userId, emptyRecord);
        return emptyRecord;
    }
}

// 保存学习记录
async function saveStudyRecord(userId = 'default', record) {
    const studyRecordPath = getStudyRecordPath(userId);
    record.updatedAt = new Date().toISOString();
    try {
        await fs.writeFile(studyRecordPath, JSON.stringify(record, null, 2), 'utf8');
        return true;
    } catch (error) {
        logger.error('保存学习记录失败', { error: error.message });
        return false;
    }
}

// 添加学习记录
async function addStudyRecord(userId = 'default', record) {
    const studyRecord = await getStudyRecord(userId);
    
    const newRecord = {
        id: uuidv4(),
        date: new Date().toISOString(),
        type: record.type, // chat/question/plan/review
        content: record.content,
        duration: record.duration || 0, // 分钟
        questionsCount: record.questionsCount || 0,
        chapter: record.chapter || ''
    };
    
    studyRecord.records.push(newRecord);
    
    // 更新统计
    if (record.type === 'chat' || record.type === 'question') {
        studyRecord.statistics.questionsAsked++;
    }
    if (record.type === 'review') {
        studyRecord.statistics.totalStudyDays++;
        studyRecord.statistics.totalStudyHours += (record.duration || 0) / 60;
    }
    
    await saveStudyRecord(userId, studyRecord);
    return newRecord;
}

// 获取学习统计
async function getStudyStatistics(userId = 'default') {
    const profile = await initProfile(userId);
    const wrongBook = await getWrongBook(userId);
    const studyRecord = await getStudyRecord(userId);
    
    const masteredCount = wrongBook.questions.filter(q => q.mastered).length;
    const totalWeakPoints = wrongBook.questions.filter(q => !q.mastered).length;
    
    return {
        profileComplete: profile.profileComplete,
        examDaysLeft: calculateDaysLeft(profile.examInfo.examDate),
        totalQuestions: wrongBook.statistics.total,
        masteredQuestions: masteredCount,
        weakPoints: totalWeakPoints,
        totalStudyDays: studyRecord.statistics.totalStudyDays,
        totalStudyHours: studyRecord.statistics.totalStudyHours,
        questionsAsked: studyRecord.statistics.questionsAsked,
        masteryRate: wrongBook.statistics.total > 0 
            ? (masteredCount / wrongBook.statistics.total * 100).toFixed(1)
            : 0
    };
}

// 计算距离考试的天数
function calculateDaysLeft(examDate) {
    if (!examDate) return null;
    const exam = new Date(examDate);
    const now = new Date();
    const diff = exam.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// 导出用户数据
async function exportUserData(userId = 'default') {
    const profile = await initProfile(userId);
    const wrongBook = await getWrongBook(userId);
    const studyRecord = await getStudyRecord(userId);
    const weakChapterStats = await getWeakChapterStats(userId);
    const statistics = await getStudyStatistics(userId);
    
    return {
        exportTime: new Date().toISOString(),
        profile,
        wrongBook,
        studyRecord,
        weakChapterStats,
        statistics
    };
}

module.exports = {
    initProfile,
    saveProfile,
    updateProfileField,
    getProfile: initProfile,
    getWrongBook,
    saveWrongBook,
    addWrongQuestion,
    removeWrongQuestion,
    getQuestionsForReview,
    updateQuestionReview,
    getWeakChapterStats,
    getStudyRecord,
    addStudyRecord,
    getStudyStatistics,
    exportUserData
};
