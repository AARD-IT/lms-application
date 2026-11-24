const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

const staff = [requireAuth, requireAdmin];

// Static routes MUST be declared before dynamic parameter routes
router.get('/stats', ...staff, ticketController.getAdminTicketStats);
router.get('/', ...staff, ticketController.listAdminTickets);

// Dynamic routes: supports both /:ticketId and /:id
router.get('/:ticketId', ...staff, ticketController.getTicketById);
router.patch('/:ticketId/status', ...staff, ticketController.updateTicketStatus);
router.post('/:ticketId/reply', ...staff, ticketController.adminReply);

module.exports = router;
