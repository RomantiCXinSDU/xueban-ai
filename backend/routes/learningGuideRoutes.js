const express = require('express');
const router = express.Router();
const learningGuideController = require('../controllers/learningGuideController');

router.post('/generate', learningGuideController.generate);
router.get('/', learningGuideController.getAll);
router.get('/:guideId', learningGuideController.getOne);
router.post('/qa', learningGuideController.socraticQA);
router.put('/:guideId/progress', learningGuideController.updateProgress);
router.delete('/:guideId', learningGuideController.delete);

module.exports = router;
