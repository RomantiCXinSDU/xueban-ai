const express = require('express');
const router = express.Router();
const reportGeneratorController = require('../controllers/reportGeneratorController');

router.post('/generate', reportGeneratorController.generate);
router.get('/', reportGeneratorController.getAll);
router.get('/:reportId', reportGeneratorController.getOne);
router.delete('/:reportId', reportGeneratorController.delete);

module.exports = router;
