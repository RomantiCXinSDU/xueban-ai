const express = require('express');
const router = express.Router();
const sourceAttributionController = require('../controllers/sourceAttributionController');

router.post('/documents', sourceAttributionController.addDocument);
router.get('/documents', sourceAttributionController.getDocuments);
router.delete('/documents/:docId', sourceAttributionController.deleteDocument);
router.delete('/documents', sourceAttributionController.clearDocuments);
router.post('/answer', sourceAttributionController.answerWithAttribution);
router.post('/import-notebook', sourceAttributionController.importFromNotebook);
router.get('/search', sourceAttributionController.search);

module.exports = router;
