
const express = require('express');
const router = express.Router();

const ticketController = require('../controllers/ticketController');
const { requireAuth } = require('../middleware/authMiddleware');

// Create a new ticket
router.post('/', requireAuth, ticketController.createTicket);

// Get all tickets created by the logged-in student
router.get('/my-tickets', requireAuth, ticketController.getMyTickets);

// Get ticket details
router.get('/:ticketId', requireAuth, ticketController.getTicketById);

// Student replies to a ticket
router.post('/:ticketId/reply', requireAuth, ticketController.studentReply);

module.exports = router;
