/**
 * Centralized business statuses, roles, and presentation metadata for the LMS frontend.
 * Provides unified status definitions and consistent UI styling without hardcoded magic strings.
 */

export const COURSE_ACCESS_STATUS = Object.freeze({
  ACCESS_GRANTED: 'ACCESS_GRANTED',
  ACTIVATION_PENDING: 'ACTIVATION_PENDING',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  LOCKED: 'LOCKED',
  SUSPENDED: 'SUSPENDED',
});

export const ACTIVATION_STATUS = Object.freeze({
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_VERIFIED: 'payment_verified',
  COURSE_AUTHORIZED: 'course_authorized',
  PIN_GENERATED: 'pin_generated',
  NOT_ACTIVATED: 'not_activated',
  ACTIVATED: 'activated',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
});

export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  VERIFIED: 'verified',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled',
});

export const USER_ROLES = Object.freeze({
  STUDENT: 'student',
  ADMIN: 'admin',
});

export const ADMIN_ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  SUPPORT: 'support',
  REVIEWER: 'reviewer',
});

/**
 * Centralized UI presentation config for course access states
 */
export const COURSE_ACCESS_PRESENTATION = Object.freeze({
  [COURSE_ACCESS_STATUS.ACCESS_GRANTED]: {
    badgeTone: 'success',
    badgeText: 'Access Granted',
    description: 'Enrolled and activated on your registered device.',
    primaryActionLabel: 'Continue Learning',
    isAccessible: true,
  },
  [COURSE_ACCESS_STATUS.ACTIVATION_PENDING]: {
    badgeTone: 'warning',
    badgeText: 'Activation Pending',
    description: 'Payment verified. 4-digit PIN required to activate this device.',
    primaryActionLabel: 'Activate Access',
    primaryActionRoute: '/activate',
    isAccessible: false,
  },
  [COURSE_ACCESS_STATUS.PAYMENT_PENDING]: {
    badgeTone: 'warning',
    badgeText: 'Payment Verification Pending',
    description: 'Payment received. Awaiting admin manual verification before activation.',
    primaryActionLabel: 'View Status',
    isAccessible: false,
  },
  [COURSE_ACCESS_STATUS.LOCKED]: {
    badgeTone: 'overlay',
    badgeText: 'Locked',
    description: 'Curriculum preview available. Enrol to unlock full course lessons and materials.',
    primaryActionLabel: 'View Course',
    isAccessible: false,
  },
  [COURSE_ACCESS_STATUS.SUSPENDED]: {
    badgeTone: 'error',
    badgeText: 'Access Suspended',
    description: 'Access to this course is temporarily suspended.',
    primaryActionLabel: 'Access Suspended',
    isAccessible: false,
  },
});
