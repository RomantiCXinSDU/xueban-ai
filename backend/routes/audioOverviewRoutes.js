const express = require('express');
const router = express.Router();
const audioOverviewController = require('../controllers/audioOverviewController');

router.post('/generate', audioOverviewController.generate);
router.post('/generate-from-notebook', audioOverviewController.generateFromNotebook);
router.get('/', audioOverviewController.getAll);
router.get('/:overviewId', audioOverviewController.getOne);
router.post('/:overviewId/audio', audioOverviewController.generateAudio);
router.delete('/:overviewId', audioOverviewController.delete);

module.exports = router;