const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/', requireAuth, ticketController.createTicket);
router.get('/my-tickets', requireAuth, ticketController.getMyTickets);
router.get('/:ticketId', requireAuth, ticketController.getTicketById);
router.post('/:ticketId/reply', requireAuth, ticketController.studentReply);

module.exports = router;
