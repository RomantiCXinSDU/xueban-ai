const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/profile', authController.authenticateToken, authController.getProfile);
router.put('/profile', authController.authenticateToken, authController.updateProfile);

module.exports = router;