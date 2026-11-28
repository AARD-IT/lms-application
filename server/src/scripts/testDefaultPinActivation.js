/**
 * Comprehensive Automated Verification Suite for
 * Platform Settings Default PIN & Legacy Activation Removal Audit
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const CourseAccess = require('../models/CourseAccess');
const DeviceActivation = require('../models/DeviceActivation');
const settingsService = require('../services/settingsService');
const { courseAccessFor, grantedCourseIds } = require('../services/enrolmentService');
const {
  verifyPayment,
  authorizeCourses,
  resetActivation,
  revokeActivation,
  reauthorizeActivation,
  activateDevice,
} = require('../controllers/activationController');
const { login } = require('../controllers/authController');
const { resetUserPassword } = require('../controllers/learnerController');

function mockResponse() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return res;
}

async function runAuditTests() {
  console.log('=== STARTING DEEP AUDIT & DEFAULT PIN ACTIVATION VERIFICATION ===\n');

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in server/.env');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, extraInfo = '') {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName} - ${extraInfo}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  let adminUser = null;
  let studentA = null;
  let studentB = null;
  let testCourse = null;
  let otherCourse = null;

  try {
    // 0. Setup actors
    adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'Admin Verifier',
        email: `admin_${timestamp}@example.com`,
        password: 'AdminPassword123!',
        role: 'admin',
        adminRole: 'super_admin',
      });
    }

    studentA = await User.create({
      name: 'Student Alpha',
      email: `student_alpha_${timestamp}@example.com`,
      password: 'StudentPassword123!',
      role: 'student',
    });

    studentB = await User.create({
      name: 'Student Beta Unactivated',
      email: `student_beta_${timestamp}@example.com`,
      password: 'StudentPassword123!',
      role: 'student',
    });

    testCourse = await Course.create({
      title: `Authorized Course ${timestamp}`,
      slug: `auth-course-${timestamp}`,
      price: 1999,
      published: true,
    });

    otherCourse = await Course.create({
      title: `Unauthorized Course ${timestamp}`,
      slug: `unauth-course-${timestamp}`,
      price: 4999,
      published: true,
    });

    // -------------------------------------------------------------------------
    // TEST 1: Centralized Platform Settings Default PIN Configuration
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Centralized Platform Settings Default PIN Configuration ---');
    const customDefaultPin = '4321';
    await settingsService.update(
      {
        activation: {
          systemEnabled: true,
          defaultPin: customDefaultPin,
          maxFailedAttempts: 5,
          lockoutDurationMinutes: 15,
        },
      },
      adminUser._id
    );

    const platformSettings = await settingsService.get();
    assert(
      platformSettings.activation.systemEnabled === true,
      'Platform settings activation system is enabled'
    );
    assert(
      Boolean(platformSettings.activation.defaultPinHash) && Boolean(platformSettings.activation.defaultPinSalt),
      'Default PIN is hashed with salt at rest'
    );
    assert(
      platformSettings.activation.defaultPin === undefined,
      'Plaintext default PIN is never persisted on settings document'
    );

    const verifyCheck = await settingsService.verifyDefaultPin(customDefaultPin);
    assert(verifyCheck.valid === true, 'Default PIN verification succeeds for correct PIN');

    const wrongCheck = await settingsService.verifyDefaultPin('9999');
    assert(wrongCheck.valid === false && wrongCheck.code === 'INVALID_PIN', 'Default PIN verification rejects invalid PIN');

    // -------------------------------------------------------------------------
    // TEST 2: Disabling Activation System in Platform Settings
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Activation System Disabled State in Platform Settings ---');
    await settingsService.update({ activation: { systemEnabled: false } }, adminUser._id);

    const disabledCheck = await settingsService.verifyDefaultPin(customDefaultPin);
    assert(
      disabledCheck.valid === false && disabledCheck.code === 'SYSTEM_DISABLED',
      'verifyDefaultPin blocks when systemEnabled is false'
    );

    // Re-enable for subsequent tests
    await settingsService.update({ activation: { systemEnabled: true, defaultPin: customDefaultPin } }, adminUser._id);
    const reEnabledCheck = await settingsService.verifyDefaultPin(customDefaultPin);
    assert(reEnabledCheck.valid === true, 'System successfully re-enabled');

    // -------------------------------------------------------------------------
    // TEST 3: Legacy Password-Based Activation Removal (resetUserPassword)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Legacy Temporary Password Activation Rejection ---');
    const resetReq = {
      params: { id: studentA._id.toString() },
      body: { mode: 'temporary' },
      user: adminUser,
    };
    const resetRes = mockResponse();
    await resetUserPassword(resetReq, resetRes, (err) => { throw err; });
    assert(
      resetRes.statusCode === 400 && resetRes.data?.code === 'LEGACY_ACTIVATION_DISABLED',
      'resetUserPassword with temporary mode rejected for student',
      `Got status ${resetRes.statusCode}, code ${resetRes.data?.code}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Student Password Login Blocked Without Device Activation
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Testing Unactivated Student Login Blocked at /api/auth/login ---');
    const loginReq = {
      body: { email: studentB.email, password: 'StudentPassword123!', deviceId: 'device-b-test' },
      headers: {},
      ip: '127.0.0.1',
    };
    const loginRes = mockResponse();
    await login(loginReq, loginRes, (err) => { throw err; });
    assert(
      loginRes.statusCode === 403 && loginRes.data?.code === 'ACTIVATION_REQUIRED',
      'Unactivated student rejected from logging in with password',
      `Got status ${loginRes.statusCode}, code ${loginRes.data?.code}`
    );

    // -------------------------------------------------------------------------
    // TEST 5: Backend Authorization Source of Truth (No Legacy Fallback Bypass)
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Testing Course Access Blocked for Unactivated Student ---');
    // Attempt grant via CourseAccess without DeviceActivation
    await CourseAccess.create({
      studentId: studentB._id,
      courseId: testCourse._id,
      active: true,
      source: 'manual',
    });

    const accessWithoutActivation = await courseAccessFor(studentB, testCourse._id);
    assert(
      accessWithoutActivation.allowed === false,
      'courseAccessFor denies access without verified device activation',
      `Allowed: ${accessWithoutActivation.allowed}`
    );

    const grantedList = await grantedCourseIds(studentB._id);
    assert(
      grantedList.length === 0,
      'grantedCourseIds returns empty array without verified device activation',
      `Length: ${grantedList.length}`
    );

    // -------------------------------------------------------------------------
    // TEST 6: Student Activation Rejects When Unpaid or Unauthorized
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Testing Activation Rejections (Unpaid, No Courses, Wrong PIN) ---');
    // Ensure activation record exists
    let activationA = await DeviceActivation.create({
      studentId: studentA._id,
      email: studentA.email,
      paymentStatus: 'pending',
      status: 'payment_pending',
      isActivated: false,
      authorizedCourses: [],
    });

    // 6a. Attempt with wrong PIN
    const wrongPinReq = {
      body: { email: studentA.email, pin: '0000', deviceId: 'system-a-hw-id' },
      headers: {},
      ip: '127.0.0.1',
    };
    const wrongPinRes = mockResponse();
    await activateDevice(wrongPinReq, wrongPinRes, (err) => { throw err; });
    assert(
      wrongPinRes.statusCode === 401 && wrongPinRes.data?.code === 'INVALID_PIN',
      'Activation rejected with wrong PIN',
      `Got status ${wrongPinRes.statusCode}`
    );

    // 6b. Attempt with correct PIN but unpaid
    const unpaidReq = {
      body: { email: studentA.email, pin: customDefaultPin, deviceId: 'system-a-hw-id' },
      headers: {},
      ip: '127.0.0.1',
    };
    const unpaidRes = mockResponse();
    await activateDevice(unpaidReq, unpaidRes, (err) => { throw err; });
    assert(
      unpaidRes.statusCode === 403 && unpaidRes.data?.code === 'PAYMENT_PENDING',
      'Activation rejected when payment is pending',
      `Got status ${unpaidRes.statusCode}`
    );

    // 6c. Verify payment, but no authorized courses
    const verifyPayReq = {
      body: { studentId: studentA._id.toString(), paymentAmount: 1999, paymentReference: 'UPI-REF-001', verified: true },
      user: adminUser,
      ip: '127.0.0.1',
    };
    const verifyPayRes = mockResponse();
    await verifyPayment(verifyPayReq, verifyPayRes, (err) => { throw err; });
    assert(verifyPayRes.statusCode === 200, 'Payment verified by Admin');

    const noCoursesReq = {
      body: { email: studentA.email, pin: customDefaultPin, deviceId: 'system-a-hw-id' },
      headers: {},
      ip: '127.0.0.1',
    };
    const noCoursesRes = mockResponse();
    await activateDevice(noCoursesReq, noCoursesRes, (err) => { throw err; });
    assert(
      noCoursesRes.statusCode === 400 && noCoursesRes.data?.code === 'NO_COURSES',
      'Activation rejected when no courses are authorized',
      `Got status ${noCoursesRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // TEST 7: Successful Activation with Configured Default PIN (System A)
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Testing Successful Activation with Default PIN on System A ---');
    // Authorize testCourse
    const authCourseReq = {
      body: { studentId: studentA._id.toString(), courseIds: [testCourse._id.toString()] },
      user: adminUser,
      ip: '127.0.0.1',
    };
    const authCourseRes = mockResponse();
    await authorizeCourses(authCourseReq, authCourseRes, (err) => { throw err; });
    assert(authCourseRes.statusCode === 200, 'Admin authorized course for student');

    const activateAReq = {
      body: {
        email: studentA.email,
        pin: customDefaultPin,
        deviceId: 'system-a-device-id-999',
        deviceInfo: { browser: 'Chrome', os: 'Windows' },
      },
      headers: {},
      ip: '127.0.0.1',
    };
    const activateARes = mockResponse();
    await activateDevice(activateAReq, activateARes, (err) => { throw err; });
    assert(
      activateARes.statusCode === 200 && activateARes.data?.activation?.isActivated === true,
      'System A activation succeeded using configured default PIN',
      `Got status ${activateARes.statusCode}`
    );
    assert(Boolean(activateARes.data?.token), 'Auth session token returned for System A');

    // -------------------------------------------------------------------------
    // TEST 8: System B Activation Attempt Rejected (409) Without Disrupting System A
    // -------------------------------------------------------------------------
    console.log('\n--- 8. Testing System B Rejection and System A Integrity ---');
    const activateBReq = {
      body: {
        email: studentA.email,
        pin: customDefaultPin,
        deviceId: 'system-b-unauthorized-laptop',
        deviceInfo: { browser: 'Firefox', os: 'MacOS' },
      },
      headers: {},
      ip: '192.168.1.100',
    };
    const activateBRes = mockResponse();
    await activateDevice(activateBReq, activateBRes, (err) => { throw err; });
    assert(
      activateBRes.statusCode === 409 && activateBRes.data?.code === 'ALREADY_ACTIVATED_ON_OTHER_DEVICE',
      'System B activation rejected with 409 Conflict',
      `Got status ${activateBRes.statusCode}`
    );

    // Verify System A remains active
    const postBActivation = await DeviceActivation.findOne({ studentId: studentA._id });
    assert(
      postBActivation.isActivated === true && postBActivation.activationDeviceId === 'system-a-device-id-999',
      'System A binding remains active and undisrupted after System B attempt'
    );

    // -------------------------------------------------------------------------
    // TEST 9: Course Access Verification After Activation
    // -------------------------------------------------------------------------
    console.log('\n--- 9. Testing Backend Authorization for Authorized vs Unauthorized Courses ---');
    const authorizedAccess = await courseAccessFor(studentA, testCourse._id);
    assert(authorizedAccess.allowed === true, 'Access granted to authorized course');

    const unauthorizedAccess = await courseAccessFor(studentA, otherCourse._id);
    assert(unauthorizedAccess.allowed === false, 'Access denied to unauthorized course');

    // -------------------------------------------------------------------------
    // TEST 10: Admin Revocation & Reauthorization
    // -------------------------------------------------------------------------
    console.log('\n--- 10. Testing Admin Revocation and Immediate Content Cutoff ---');
    const revokeReq = {
      body: { studentId: studentA._id.toString(), reason: 'Compliance Audit' },
      user: adminUser,
      ip: '127.0.0.1',
    };
    const revokeRes = mockResponse();
    await revokeActivation(revokeReq, revokeRes, (err) => { throw err; });
    assert(revokeRes.statusCode === 200, 'Admin revoked activation');

    const postRevokeAccess = await courseAccessFor(studentA, testCourse._id);
    assert(
      postRevokeAccess.allowed === false && postRevokeAccess.reason === 'suspended',
      'Immediate access suspension upon activation revocation'
    );

    // Reauthorize
    const reauthReq = {
      body: { studentId: studentA._id.toString() },
      user: adminUser,
      ip: '127.0.0.1',
    };
    const reauthRes = mockResponse();
    await reauthorizeActivation(reauthReq, reauthRes, (err) => { throw err; });
    assert(reauthRes.statusCode === 200, 'Admin reauthorized activation');

    // -------------------------------------------------------------------------
    // TEST 11: Admin Device Reset (Clearing Hardware Binding for Device Migration)
    // -------------------------------------------------------------------------
    console.log('\n--- 11. Testing Admin Reset Device Activation ---');
    const resetDevReq = {
      body: { studentId: studentA._id.toString(), reason: 'Learner bought new computer' },
      user: adminUser,
      ip: '127.0.0.1',
    };
    const resetDevRes = mockResponse();
    await resetActivation(resetDevReq, resetDevRes, (err) => { throw err; });
    assert(resetDevRes.statusCode === 200, 'Admin reset device activation binding');

    const postResetRecord = await DeviceActivation.findOne({ studentId: studentA._id });
    assert(
      postResetRecord.isActivated === false && postResetRecord.activationDeviceId === null,
      'Old device binding cleared in database'
    );

    // Learner can now activate on the new device with default PIN
    const newDeviceReq = {
      body: {
        email: studentA.email,
        pin: customDefaultPin,
        deviceId: 'new-replacement-device-456',
      },
      headers: {},
      ip: '127.0.0.1',
    };
    const newDeviceRes = mockResponse();
    await activateDevice(newDeviceReq, newDeviceRes, (err) => { throw err; });
    assert(
      newDeviceRes.statusCode === 200 && newDeviceRes.data?.activation?.isActivated === true,
      'Learner successfully activated on new device after admin reset'
    );

    console.log(`\n=== AUDIT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
  } finally {
    // Cleanup test records
    if (studentA) {
      await User.deleteOne({ _id: studentA._id });
      await DeviceActivation.deleteMany({ studentId: studentA._id });
      await CourseAccess.deleteMany({ studentId: studentA._id });
    }
    if (studentB) {
      await User.deleteOne({ _id: studentB._id });
      await DeviceActivation.deleteMany({ studentId: studentB._id });
      await CourseAccess.deleteMany({ studentId: studentB._id });
    }
    if (testCourse) await Course.deleteOne({ _id: testCourse._id });
    if (otherCourse) await Course.deleteOne({ _id: otherCourse._id });
    await mongoose.disconnect();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runAuditTests().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
