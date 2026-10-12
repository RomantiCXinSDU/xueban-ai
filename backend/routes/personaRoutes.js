const express = require('express');
const router = express.Router();
const personaController = require('../controllers/personaController');

router.get('/', personaController.getAll);
router.post('/active', personaController.setActive);
router.delete('/active', personaController.clearActive);
router.post('/', personaController.create);
router.put('/:personaId', personaController.update);
router.delete('/:personaId', personaController.delete);
router.post('/chat', personaController.chat);

module.exports = router;