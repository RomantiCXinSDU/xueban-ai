const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

router.post('/chat', aiController.chat);
router.post('/summarize', aiController.summarize);
router.post('/analyze-question', aiController.analyzeQuestion);
router.post('/generate-plan', aiController.generateStudyPlan);
router.post('/quiz', aiController.generateQuiz);
router.post('/strategy', aiController.generateStrategy);

module.exports = router;
