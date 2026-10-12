const express = require('express');
const router = express.Router();
const multer = require('multer');
const productController = require('../controllers/productController');
const MAX_UPLOAD_MB = 100;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 }
});

function uploadNotebookFile(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();

    const isTooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(isTooLarge ? 413 : 400).json({
      success: false,
      error: isTooLarge
        ? `文件过大：当前单文件上限为 ${MAX_UPLOAD_MB}MB，请压缩或拆分后再上传。`
        : `文件上传失败：${error.message || '请重新选择文件后再试。'}`
    });
  });
}

router.get('/workspace', productController.getWorkspace);
router.put('/profile', productController.saveProfile);
router.post('/knowledge', productController.addKnowledge);
router.post('/knowledge/search', productController.searchKnowledge);
router.post('/sessions', productController.saveSession);
router.post('/focus/check-in', productController.checkInFocus);
router.post('/web-search', productController.webSearch);
router.post('/notebooks', productController.createNotebook);
router.delete('/notebooks/:id', productController.deleteNotebook);
router.delete('/notebooks/:id/artifacts/:type', productController.clearNotebookArtifact);
router.post('/notebooks/:id/sources', productController.addNotebookSource);
router.post('/notebooks/:id/import-file', uploadNotebookFile, productController.importNotebookFile);
router.post('/notebooks/:id/import-url', productController.importNotebookUrl);
router.put('/notebooks/:id/sources/:sourceId', productController.updateNotebookSource);
router.delete('/notebooks/:id/sources/:sourceId', productController.deleteNotebookSource);
router.post('/notebooks/:id/search', productController.searchNotebookSources);
router.post('/notebooks/:id/answer', productController.answerNotebookSources);
router.post('/notebooks/:id/guide', productController.generateSourceGuide);
router.post('/notebooks/:id/audio-overview', productController.generateAudioOverview);
router.post('/notebooks/:id/video-overview', productController.generateVideoOverview);
router.post('/notebooks/:id/mind-map', productController.generateMindMap);
router.post('/notebooks/:id/analyze/:stage', productController.analyzeNotebook);
router.post('/notebooks/:id/artifacts', productController.generateStudioArtifacts);
router.post('/notebooks/:id/studio-job', productController.startStudioJob);
router.get('/jobs/:jobId', productController.getJob);
router.get('/notebooks/:id/export/:type', productController.exportNotebookArtifact);

module.exports = router;
