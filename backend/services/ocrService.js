/**
 * 学伴AI - OCR识别服务
 * 支持多种OCR服务：百度OCR、腾讯OCR、阿里OCR
 */
const fetch = require('node-fetch');
const FormData = require('form-data');
const logger = require('../utils/logger');

// OCR服务配置
const OCR_SERVICES = {
    baidu: {
        name: '百度OCR',
        url: 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic',
        // 需要在.env中配置 BAIDU_API_KEY 和 BAIDU_SECRET_KEY
    },
    tencent: {
        name: '腾讯OCR',
        url: 'https://ocr.tencentcloudapi.com/api/v1/products/aai_ocr',
        // 需要在.env中配置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY
    },
    ocr_space: {
        name: 'OCR.space (免费)',
        url: 'https://api.ocr.space/parse/image',
        // 免费额度：每小时500次
    }
};

// 默认使用OCR.space（无需配置）
let activeService = 'ocr_space';

/**
 * 设置OCR服务
 */
function setOCRService(service) {
    if (OCR_SERVICES[service]) {
        activeService = service;
        return true;
    }
    return false;
}

/**
 * 识别图片中的文字
 * @param {string} imageSource - 图片数据，可以是URL、base64或文件路径
 * @param {object} options - 选项
 * @returns {Promise<object>} 识别结果
 */
async function recognizeText(imageSource, options = {}) {
    try {
        switch (activeService) {
            case 'baidu':
                return await recognizeWithBaidu(imageSource, options);
            case 'tencent':
                return await recognizeWithTencent(imageSource, options);
            case 'ocr_space':
            default:
                return await recognizeWithOCRspace(imageSource, options);
        }
    } catch (error) {
        logger.error('OCR识别失败', { error: error.message, service: activeService });
        throw error;
    }
}

/**
 * 使用百度OCR识别
 */
async function recognizeWithBaidu(imageSource, options = {}) {
    const apiKey = process.env.BAIDU_API_KEY;
    const secretKey = process.env.BAIDU_SECRET_KEY;
    
    if (!apiKey || !secretKey) {
        throw new Error('未配置百度OCR API Key');
    }
    
    // 获取access token
    const tokenUrl = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`;
    const tokenResponse = await fetch(tokenUrl);
    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
        throw new Error('获取百度OCR token失败');
    }
    
    // 准备图片数据
    const imageData = await prepareImageData(imageSource);
    
    // 调用百度OCR
    const formData = new FormData();
    formData.append('image', imageData);
    
    const response = await fetch(`${OCR_SERVICES.baidu.url}?access_token=${tokenData.access_token}`, {
        method: 'POST',
        body: formData
    });
    
    const result = await response.json();
    
    if (result.error_msg) {
        throw new Error(result.error_msg);
    }
    
    // 提取文字
    const texts = result.words_result ? result.words_result.map(item => item.words) : [];
    
    return {
        success: true,
        texts,
        fullText: texts.join('\n'),
        confidence: result.words_result_num > 0 
            ? result.words_result.reduce((sum, item) => sum + (item.probability?.average || 0), 0) / result.words_result_num
            : 0,
        service: 'baidu'
    };
}

/**
 * 使用腾讯OCR识别
 */
async function recognizeWithTencent(imageSource, options = {}) {
    const secretId = process.env.TENCENT_SECRET_ID;
    const secretKey = process.env.TENCENT_SECRET_KEY;
    
    if (!secretId || !secretKey) {
        throw new Error('未配置腾讯OCR Secret Key');
    }
    
    // 准备图片数据
    const imageData = await prepareImageData(imageSource);
    const base64Image = Buffer.from(imageData).toString('base64');
    
    // 腾讯OCR使用JSON格式
    const payload = {
        ImageBase64: base64Image
    };
    
    const response = await fetch(OCR_SERVICES.tencent.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-TC-Action': 'GeneralBasicOCR',
            'X-TC-Version': '2018-11-19',
            'X-TC-Region': 'ap-guangzhou',
            'X-TC-Key': secretId,
            'X-TC-Secret': secretKey
        },
        body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.Error) {
        throw new Error(result.Error.Message);
    }
    
    // 提取文字
    const texts = result.TextDetections ? result.TextDetections.map(item => item.DetectedText) : [];
    
    return {
        success: true,
        texts,
        fullText: texts.join('\n'),
        confidence: result.TextDetections 
            ? result.TextDetections.reduce((sum, item) => sum + item.Confidence, 0) / result.TextDetections.length
            : 0,
        service: 'tencent'
    };
}

/**
 * 使用OCR.space识别（免费，无需API Key）
 */
async function recognizeWithOCRspace(imageSource, options = {}) {
    // 准备图片数据
    let imageData;
    let isUrl = false;
    
    if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
        // 如果是URL，直接使用
        imageData = imageSource;
        isUrl = true;
    } else if (imageSource.startsWith('data:image')) {
        // 如果是base64，提取数据部分
        const matches = imageSource.match(/^data:image\/\w+;base64,(.+)$/);
        if (matches) {
            imageData = matches[1];
        } else {
            imageData = imageSource;
        }
    } else {
        // 如果是文件路径，读取文件
        const fs = require('fs').promises;
        const imageBuffer = await fs.readFile(imageSource);
        imageData = imageBuffer.toString('base64');
    }
    
    // 创建表单数据
    const formData = new FormData();
    if (isUrl) {
        formData.append('url', imageData);
    } else {
        formData.append('base64Image', imageData);
    }
    formData.append('language', 'chs'); // 中文
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', options.ocrEngine || '2'); // 引擎2效果更好
    
    // OCR.space API Key（可选，免费额度用完需要申请）
    const apiKey = process.env.OCR_SPACE_API_KEY;
    if (apiKey) {
        formData.append('apikey', apiKey);
    }
    
    const response = await fetch(OCR_SERVICES.ocr_space.url, {
        method: 'POST',
        body: formData
    });
    
    const result = await response.json();
    
    if (result.IsErroredOnProcessing) {
        throw new Error(result.ErrorMessage?.[0] || 'OCR识别失败');
    }
    
    // 提取文字
    const texts = result.ParsedResults ? result.ParsedResults.map(item => item.ParsedText) : [];
    
    return {
        success: true,
        texts,
        fullText: texts.join('\n'),
        confidence: result.ParsedResults 
            ? result.ParsedResults.reduce((sum, item) => sum + (item.Confidence || 0), 0) / result.ParsedResults.length
            : 0,
        service: 'ocr_space'
    };
}

/**
 * 准备图片数据
 */
async function prepareImageData(imageSource) {
    const fs = require('fs').promises;
    
    // 如果是URL，返回URL
    if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
        return imageSource;
    }
    
    // 如果是base64，返回base64字符串
    if (imageSource.startsWith('data:') || imageSource.includes(',')) {
        if (imageSource.includes(',')) {
            return imageSource.split(',')[1];
        }
        return imageSource;
    }
    
    // 如果是文件路径，读取文件并转为base64
    try {
        const buffer = await fs.readFile(imageSource);
        return buffer.toString('base64');
    } catch (error) {
        throw new Error('无法读取图片文件');
    }
}

/**
 * 识别数学公式
 */
async function recognizeMath(imageSource, options = {}) {
    // 目前使用OCR.space的基本识别
    // 未来可以集成专门的数学公式识别服务
    const result = await recognizeText(imageSource, options);
    
    // 清理识别结果中的数学符号
    result.fullText = result.fullText
        .replace(/\s+/g, ' ')
        .replace(/[|]/g, ' | ')
        .replace(/[(]/g, ' ( ')
        .replace(/[)]/g, ' ) ')
        .trim();
    
    return result;
}

/**
 * 获取支持的OCR服务列表
 */
function getAvailableServices() {
    return Object.entries(OCR_SERVICES).map(([key, value]) => ({
        id: key,
        name: value.name,
        configured: isServiceConfigured(key)
    }));
}

/**
 * 检查服务是否已配置
 */
function isServiceConfigured(service) {
    switch (service) {
        case 'baidu':
            return !!(process.env.BAIDU_API_KEY && process.env.BAIDU_SECRET_KEY);
        case 'tencent':
            return !!(process.env.TENCENT_SECRET_ID && process.env.TENCENT_SECRET_KEY);
        case 'ocr_space':
            return true; // OCR.space无需配置即可使用
        default:
            return false;
    }
}

module.exports = {
    recognizeText,
    recognizeMath,
    setOCRService,
    getAvailableServices,
    isServiceConfigured
};
