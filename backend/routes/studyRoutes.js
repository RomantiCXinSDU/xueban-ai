const express = require('express');
const router = express.Router();
const studyController = require('../controllers/studyController');

router.get('/plans', studyController.getUserPlans);
router.post('/plans', studyController.createPlan);
router.get('/plans/:id', studyController.getPlanById);
router.put('/plans/:id', studyController.updatePlan);
router.delete('/plans/:id', studyController.deletePlan);
router.post('/plans/save', studyController.savePlan);

router.get('/progress', studyController.getProgress);
router.post('/progress', studyController.updateProgress);

router.get('/materials', studyController.getStudyMaterials);
router.post('/materials', studyController.addStudyMaterial);

module.exports = router;