const mongoose = require('mongoose');
const { ACTIVATION_STATUS, PAYMENT_STATUS } = require('../constants');

const STATUSES = Object.values(ACTIVATION_STATUS);
const PAYMENT_STATUSES = [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.VERIFIED];

const resetRecordSchema = new mongoose.Schema(
  {
    resetAt: { type: Date, default: Date.now },
    resetBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, default: '' },
    previousDeviceId: { type: String, default: null },
    previousActivatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedAt: { type: Date, default: Date.now },
    details: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const deviceActivationSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    // Payment verification
    paymentStatus: {
      type: String,
      enum: ['pending', 'verified'],
      default: 'pending',
      index: true,
    },
    paymentVerifiedAt: { type: Date },
    paymentVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paymentReference: { type: String, default: '', trim: true },
    paymentAmount: { type: Number, default: 0 },
    paymentNotes: { type: String, default: '', trim: true },

    // Course Package association
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Package',
      index: true,
    },
    packageIdentifier: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    packageName: {
      type: String,
      default: '',
      trim: true,
    },
    onboardingDetailsSubmittedAt: { type: Date },

    // Course authorization
    authorizedCourses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
      },
    ],

    // PIN & Activation Lifecycle
    status: {
      type: String,
      enum: STATUSES,
      default: 'payment_pending',
      index: true,
    },
    pinHash: { type: String, default: null },
    pinSalt: { type: String, default: null },
    pinCreatedAt: { type: Date },
    pinExpiresAt: { type: Date },
    pinGeneratedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    pinConsumedAt: { type: Date },

    // Security & brute-force throttling
    failedPinAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },

    // Device binding
    isActivated: { type: Boolean, default: false, index: true },
    activatedAt: { type: Date },
    activationDeviceId: { type: String, default: null, index: true },
    activationSessionId: { type: String, default: null, index: true },
    deviceInfo: {
      userAgent: { type: String, default: '' },
      ip: { type: String, default: '' },
      browser: { type: String, default: '' },
      os: { type: String, default: '' },
      platform: { type: String, default: '' },
      activatedAt: { type: Date },
      lastSeenAt: { type: Date },
    },

    // Email delivery metadata
    emailDelivery: {
      status: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'not_configured'],
        default: 'pending',
      },
      sentAt: { type: Date },
      error: { type: String, default: '' },
      provider: { type: String, default: '' },
    },

    // Revocation & reset tracking
    revokedAt: { type: Date },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    revocationReason: { type: String, default: '', trim: true },
    resetHistory: { type: [resetRecordSchema], default: [] },
    auditLog: { type: [auditLogSchema], default: [] },
  },
  { timestamps: true }
);

// Indexes for fast lookup and atomic updates
deviceActivationSchema.index({ studentId: 1, status: 1 });
deviceActivationSchema.index({ email: 1, status: 1 });

deviceActivationSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id;
    delete ret.pinHash;
    delete ret.pinSalt;
    delete ret.__v;
    return ret;
  },
});

deviceActivationSchema.statics.STATUSES = STATUSES;

const DeviceActivation = mongoose.model('DeviceActivation', deviceActivationSchema);

module.exports = DeviceActivation;
