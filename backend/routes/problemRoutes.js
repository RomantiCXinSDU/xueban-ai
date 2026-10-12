/**
 * 学伴AI - 题目处理路由
 */
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const ocrService = require('../services/ocrService');
const aiService = require('../services/aiService');
const profileService = require('../services/profileService');
const logger = require('../utils/logger');

function splitQuestionBlocks(text) {
    const source = String(text || '').replace(/\r/g, '\n').trim();
    if (!source) return [];
    const normalized = source
        .replace(/([。；;?？])\s*(?=(\d{1,2}|[一二三四五六七八九十])[\.\、\)）])/g, '$1\n')
        .replace(/\n{3,}/g, '\n\n');
    const lines = normalized.split('\n').map(line => line.trim()).filter(Boolean);
    const blocks = [];
    let current = [];
    const starter = /^((第?\s*\d{1,2}\s*[题\.、\)）])|(\d{1,2}\s*[\.\、\)）])|([一二三四五六七八九十]\s*[\.、\)）]))/;
    lines.forEach(line => {
        if (starter.test(line) && current.length) {
            blocks.push(current.join('\n'));
            current = [line];
        } else {
            current.push(line);
        }
    });
    if (current.length) blocks.push(current.join('\n'));
    if (blocks.length <= 1) {
        const sentenceSplit = normalized.split(/(?<=[?？。])\s+(?=\S{8,})/).map(item => item.trim()).filter(Boolean);
        return sentenceSplit.length > 1 ? sentenceSplit : [source];
    }
    return blocks;
}

function classifyPhotoQuestion(text, requestedMode = 'auto') {
    const questions = splitQuestionBlocks(text);
    const detectedMode = requestedMode === 'single' ? 'single'
        : requestedMode === 'multi' ? 'multi'
        : questions.length > 1 ? 'multi' : 'single';
    return {
        mode: detectedMode,
        questions: detectedMode === 'single' ? [questions.join('\n')] : questions
    };
}

// OCR识别接口
router.post('/ocr', async (req, res) => {
    try {
        const { image, type = 'text' } = req.body;
        
        if (!image) {
            return res.status(400).json({
                success: false,
                error: '请提供图片数据'
            });
        }
        
        logger.info('开始OCR识别', { type });
        
        let result;
        if (type === 'math') {
            result = await ocrService.recognizeMath(image);
        } else {
            result = await ocrService.recognizeText(image);
        }
        
        logger.info('OCR识别成功', { 
            textLength: result.fullText.length,
            service: result.service 
        });
        
        res.json({
            success: true,
            text: result.fullText,
            confidence: result.confidence,
            service: result.service
        });
        
    } catch (error) {
        logger.error('OCR识别失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 获取OCR服务状态
router.get('/ocr/status', (req, res) => {
    const services = ocrService.getAvailableServices();
    res.json({
        success: true,
        services
    });
});

// 题目解题接口
router.post('/solve', async (req, res) => {
    try {
        const { question, image, context } = req.body;
        
        if (!question && !image) {
            return res.status(400).json({
                success: false,
                error: '请提供题目或图片'
            });
        }
        
        let questionText = question;
        
        // 如果有图片，先进行OCR识别
        if (image) {
            try {
                const ocrResult = await ocrService.recognizeText(image);
                questionText = ocrResult.fullText;
                logger.info('图片OCR识别成功', { textLength: questionText.length });
            } catch (ocrError) {
                logger.warn('OCR识别失败，使用原始题目', { error: ocrError.message });
                if (!questionText) {
                    questionText = '（图片识别失败，请手动输入题目）';
                }
            }
        }
        
        // 调用AI解题
        const result = await aiService.chat(questionText, {
            context: {
                ...context,
                questionType: '解题'
            }
        });
        
        logger.info('题目解答完成', { 
            questionLength: questionText.length,
            model: result.model 
        });
        
        res.json({
            success: true,
            question: questionText,
            solution: result.content,
            model: result.model
        });
        
    } catch (error) {
        logger.error('题目解答失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/photo-analyze', async (req, res) => {
    try {
        const { image, question, mode = 'auto', context } = req.body;

        if (!image && !question) {
            return res.status(400).json({
                success: false,
                error: '请提供图片或题目文本'
            });
        }

        let ocrText = question || '';
        let ocr = null;
        if (image) {
            try {
                ocr = await ocrService.recognizeMath(image);
                ocrText = ocr.fullText || ocrText;
            } catch (error) {
                logger.warn('拍照答疑 OCR 失败，使用手动文本', { error: error.message });
                if (!ocrText) ocrText = '图片识别失败，请手动补充题目文本。';
            }
        }

        const classification = classifyPhotoQuestion(ocrText, mode);
        const solved = [];
        for (const [index, item] of classification.questions.entries()) {
            const prompt = `请解答第 ${index + 1} 题。要求包含：题意判断、思路拆解、关键知识点、完整步骤、易错点、同类训练建议。\n\n题目：\n${item}`;
            const result = await aiService.chat(prompt, {
                context: {
                    ...context,
                    questionType: '拍照答疑',
                    photoMode: classification.mode
                }
            });
            solved.push({
                index: index + 1,
                question: item,
                solution: result.content,
                model: result.model
            });
        }

        res.json({
            success: true,
            mode: classification.mode,
            count: solved.length,
            ocrText,
            confidence: ocr?.confidence || 0,
            service: ocr?.service || 'manual',
            questions: solved
        });
    } catch (error) {
        logger.error('拍照答疑失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 题型分析接口
router.post('/analyze', async (req, res) => {
    try {
        const { question, context } = req.body;
        
        if (!question) {
            return res.status(400).json({
                success: false,
                error: '请提供题目'
            });
        }
        
        const result = await aiService.analyzeQuestion(question, context);
        
        res.json({
            success: true,
            ...result
        });
        
    } catch (error) {
        logger.error('题型分析失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 历年真题分析接口
router.post('/analyze-papers', async (req, res) => {
    try {
        const { images, context } = req.body;
        
        if (!images || images.length === 0) {
            return res.status(400).json({
                success: false,
                error: '请提供真题图片'
            });
        }
        
        // 识别所有真题图片
        const texts = [];
        for (const image of images) {
            try {
                const result = await ocrService.recognizeText(image);
                texts.push(result.fullText);
            } catch (error) {
                logger.warn('某张图片识别失败', { error: error.message });
            }
        }
        
        const combinedText = texts.join('\n\n---\n\n');
        
        // 调用AI分析真题
        const prompt = `请分析以下历年真题，总结：
1. 题型分布（选择/填空/解答等）
2. 难度分布（简单/中等/困难）
3. 高频考点（哪些知识点出现次数最多）
4. 考试重点章节
5. 复习建议

真题内容：
${combinedText}`;

        const result = await aiService.chat(prompt, {
            context: {
                ...context,
                questionType: '真题分析'
            }
        });
        
        logger.info('历年真题分析完成', { 
            imagesCount: images.length,
            textLength: combinedText.length 
        });
        
        res.json({
            success: true,
            rawTexts: texts,
            analysis: result.content,
            summary: {
                papersCount: images.length,
                totalQuestions: texts.join('').split(/[?。]/).length
            }
        });
        
    } catch (error) {
        logger.error('历年真题分析失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 错题本相关接口
router.get('/wrong', async (req, res) => {
    try {
        const userId = req.query.userId || 'default';
        const wrongBook = await profileService.getWrongBook(userId);
        
        res.json({
            success: true,
            ...wrongBook
        });
        
    } catch (error) {
        logger.error('获取错题本失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/wrong', async (req, res) => {
    try {
        const userId = req.body.userId || 'default';
        const question = req.body;
        
        const newQuestion = await profileService.addWrongQuestion(userId, question);
        
        logger.info('添加错题成功', { questionId: newQuestion.id });
        
        res.json({
            success: true,
            question: newQuestion
        });
        
    } catch (error) {
        logger.error('添加错题失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.delete('/wrong/:id', async (req, res) => {
    try {
        const userId = req.query.userId || 'default';
        const questionId = req.params.id;
        
        const success = await profileService.removeWrongQuestion(userId, questionId);
        
        if (success) {
            logger.info('删除错题成功', { questionId });
            res.json({ success: true });
        } else {
            res.status(404).json({
                success: false,
                error: '错题不存在'
            });
        }
        
    } catch (error) {
        logger.error('删除错题失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 获取待复习的错题
router.get('/wrong/review', async (req, res) => {
    try {
        const userId = req.query.userId || 'default';
        const questions = await profileService.getQuestionsForReview(userId);
        
        res.json({
            success: true,
            count: questions.length,
            questions
        });
        
    } catch (error) {
        logger.error('获取复习任务失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 更新错题复习状态
router.put('/wrong/:id/review', async (req, res) => {
    try {
        const userId = req.body.userId || 'default';
        const questionId = req.params.id;
        const { mastered } = req.body;
        
        const question = await profileService.updateQuestionReview(
            userId, 
            questionId, 
            mastered
        );
        
        if (question) {
            logger.info('更新错题复习状态', { questionId, mastered });
            res.json({ success: true, question });
        } else {
            res.status(404).json({
                success: false,
                error: '错题不存在'
            });
        }
        
    } catch (error) {
        logger.error('更新复习状态失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.put('/wrong/:id', async (req, res) => {
    try {
        const questionId = req.params.id;
        const { mastered } = req.body;
        
        const question = await profileService.updateQuestionReview(
            'default', 
            questionId, 
            mastered
        );
        
        if (question) {
            logger.info('更新错题状态', { questionId, mastered });
            res.json({ success: true, question });
        } else {
            res.status(404).json({
                success: false,
                error: '错题不存在'
            });
        }
        
    } catch (error) {
        logger.error('更新错题状态失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 获取薄弱章节统计
router.get('/weak-chapters', async (req, res) => {
    try {
        const userId = req.query.userId || 'default';
        const stats = await profileService.getWeakChapterStats(userId);
        
        res.json({
            success: true,
            chapters: stats
        });
        
    } catch (error) {
        logger.error('获取薄弱章节失败', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
