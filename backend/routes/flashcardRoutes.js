const express = require('express');
const router = express.Router();
const flashcardController = require('../controllers/flashcardController');

router.post('/generate', flashcardController.generate);
router.get('/decks', flashcardController.getDecks);
router.get('/decks/:deckId', flashcardController.getDeck);
router.get('/decks/:deckId/review', flashcardController.getReviewCards);
router.put('/decks/:deckId/cards/:cardId/mastery', flashcardController.updateMastery);
router.delete('/decks/:deckId', flashcardController.deleteDeck);
router.delete('/decks/:deckId/cards/:cardId', flashcardController.deleteCard);
router.get('/stats', flashcardController.getStats);

module.exports = router;
