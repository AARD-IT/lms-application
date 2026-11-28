/**
 * Centralized business statuses, roles, and configuration enums for the LMS backend.
 * Eliminates scattered magic strings and hardcoded status values across models and controllers.
 */

const COURSE_ACCESS_STATUS = Object.freeze({
  ACCESS_GRANTED: 'ACCESS_GRANTED',
  ACTIVATION_PENDING: 'ACTIVATION_PENDING',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  LOCKED: 'LOCKED',
  SUSPENDED: 'SUSPENDED',
});

const ACTIVATION_STATUS = Object.freeze({
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_VERIFIED: 'payment_verified',
  COURSE_AUTHORIZED: 'course_authorized',
  PIN_GENERATED: 'pin_generated',
  NOT_ACTIVATED: 'not_activated',
  ACTIVATED: 'activated',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  VERIFIED: 'verified',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
});

const USER_ROLES = Object.freeze({
  STUDENT: 'student',
  ADMIN: 'admin',
});

const ADMIN_ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  SUPPORT: 'support',
  REVIEWER: 'reviewer',
});

const ENROLLMENT_GATEWAYS = Object.freeze({
  MANUAL: 'manual',
  RAZORPAY: 'razorpay',
  FREE: 'free',
});

module.exports = {
  COURSE_ACCESS_STATUS,
  ACTIVATION_STATUS,
  PAYMENT_STATUS,
  USER_ROLES,
  ADMIN_ROLES,
  ENROLLMENT_GATEWAYS,
};
