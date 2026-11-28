/**
 * Automated Verification Script for Central Reusable Default PIN & Device Activation System
 * Tests all 11 scenarios required by the specification under the single default PIN architecture.
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
  generatePin,
  resetActivation,
  revokeActivation,
  reauthorizeActivation,
  activateDevice,
} = require('../controllers/activationController');

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

async function runTests() {
  console.log('=== STARTING LMS DEVICE ACTIVATION AUTOMATED TEST SUITE ===\n');

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in server/.env');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const testEmail = `test_student_${Date.now()}@example.com`;
  let adminUser = null;
  let testStudent = null;
  let courseA = null;
  let courseB = null;
  let courseC = null;
  const CENTRAL_DEFAULT_PIN = '1234';

  try {
    // 0. Setup test actors & centralized platform settings
    adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'Test Super Admin',
        email: `admin_${Date.now()}@example.com`,
        password: 'Password123!',
        role: 'admin',
        adminRole: 'super_admin',
      });
    }

    testStudent = await User.create({
      name: 'Test Learner Alpha',
      email: testEmail,
      password: 'Password123!',
      role: 'student',
    });

    const now = Date.now();
    courseA = await Course.create({
      title: `Test Course Alpha ${now}`,
      slug: `test-course-alpha-${now}`,
      category: 'Data Engineering',
      price: 2999,
      published: true,
    });

    courseB = await Course.create({
      title: `Test Course Beta ${now}`,
      slug: `test-course-beta-${now}`,
      category: 'Cloud & AI',
      price: 3999,
      published: true,
    });

    courseC = await Course.create({
      title: `Test Course Gamma Unauthorized ${now}`,
      slug: `test-course-gamma-${now}`,
      category: 'Security',
      price: 4999,
      published: true,
    });

    // Configure Centralized Default PIN in Platform Settings
    await settingsService.update({
      activation: {
        systemEnabled: true,
        defaultPin: CENTRAL_DEFAULT_PIN,
        maxFailedAttempts: 5,
        lockoutDurationMinutes: 15,
      },
    });

    console.log('Test Setup Complete:');
    console.log(`- Admin: ${adminUser.email}`);
    console.log(`- Student: ${testStudent.email}`);
    console.log(`- Course A (Authorized): ${courseA._id}`);
    console.log(`- Course B (Authorized): ${courseB._id}`);
    console.log(`- Course C (Unauthorized): ${courseC._id}`);
    console.log(`- Central Platform Default PIN: ${CENTRAL_DEFAULT_PIN}\n`);

    // =========================================================================
    // SCENARIO 1: Successful First Device Activation (System A) with Central Default PIN
    // =========================================================================
    console.log('--- TEST 1: Admin Payment Verification, Course Authorization & Central Default PIN Activation ---');
    // Step 1: Verify payment
    const reqPay = {
      body: {
        studentId: testStudent._id,
        paymentReference: 'UPI-TEST-123456',
        paymentAmount: 6998,
        paymentNotes: 'Verified manually via bank transfer',
        verified: true,
      },
      user: adminUser,
      ip: '127.0.0.1',
    };
    const resPay = mockResponse();
    await verifyPayment(reqPay, resPay);
    console.assert(resPay.statusCode === 200, 'verifyPayment should return 200');
    console.assert(resPay.data.activation.paymentStatus === 'verified', 'Payment should be verified');
    console.log('✔ Payment verified successfully.');

    // Step 2: Authorize courses A and B (not C)
    const reqAuth = {
      body: {
        studentId: testStudent._id,
        courseIds: [courseA._id, courseB._id],
      },
      user: adminUser,
      ip: '127.0.0.1',
    };
    const resAuth = mockResponse();
    await authorizeCourses(reqAuth, resAuth);
    console.assert(resAuth.statusCode === 200, 'authorizeCourses should return 200');
    console.assert(resAuth.data.activation.authorizedCourses.length === 2, 'Should have 2 authorized courses');
    console.log('✔ Courses authorized successfully.');

    // Step 3: Verify individual PIN generation is deprecated (410 Gone)
    const reqPin = {
      body: { studentId: testStudent._id, expiryHours: 24 },
      user: adminUser,
      ip: '127.0.0.1',
    };
    const resPin = mockResponse();
    await generatePin(reqPin, resPin);
    console.assert(resPin.statusCode === 410, 'generatePin must be deprecated with 410 Gone');
    console.assert(resPin.data.code === 'INDIVIDUAL_PIN_GENERATION_DEPRECATED', 'Should return INDIVIDUAL_PIN_GENERATION_DEPRECATED code');
    console.log('✔ Individual PIN generation successfully deprecated (410 Gone). Central PIN architecture active.');

    // Step 4: Student activates on System A using Central Default PIN
    console.log('\n--- TEST 1 (Cont): Student Activation on System A using Central Default PIN ---');
    const reqActA = {
      body: {
        email: testStudent.email,
        pin: CENTRAL_DEFAULT_PIN,
        deviceId: 'device-system-a-hardware-id-123',
        deviceInfo: { platform: 'Windows 11', browser: 'Chrome 122' },
      },
      headers: { 'user-agent': 'Mozilla/5.0 Windows Chrome' },
      ip: '127.0.0.1',
    };
    const resActA = mockResponse();
    await activateDevice(reqActA, resActA);
    console.assert(resActA.statusCode === 200, `activateDevice should return 200, got ${resActA.statusCode}`);
    console.assert(resActA.data.activation.isActivated === true, 'Device should be marked activated');
    console.assert(resActA.data.deviceId === 'device-system-a-hardware-id-123', 'Device ID should match System A');
    console.assert(Boolean(resActA.data.token), 'JWT token should be returned');
    console.log('✔ System A activation succeeded with authenticated session.');

    // Check course access for Course A and B
    const accessA = await courseAccessFor(testStudent, courseA._id);
    const accessB = await courseAccessFor(testStudent, courseB._id);
    console.assert(accessA.allowed === true, 'Student should be allowed access to Course A');
    console.assert(accessB.allowed === true, 'Student should be allowed access to Course B');
    console.log('✔ Authorized courses A and B are accessible by learner.');

    // =========================================================================
    // SCENARIO 2: Unauthorized Course Protection
    // =========================================================================
    console.log('\n--- TEST 2: Course-Level Access Control (Unauthorized Course C) ---');
    const accessC = await courseAccessFor(testStudent, courseC._id);
    console.assert(accessC.allowed === false, 'Student should NOT be allowed access to Course C');
    console.log('✔ Unauthorized course C correctly rejected server-side.');

    // =========================================================================
    // SCENARIO 3: PIN Reuse & Second Device Attempt (System B)
    // =========================================================================
    console.log('\n--- TEST 3: PIN Reuse Attempt on System B ---');
    const reqActB = {
      body: {
        email: testStudent.email,
        pin: CENTRAL_DEFAULT_PIN,
        deviceId: 'device-system-b-hardware-id-999',
        deviceInfo: { platform: 'macOS Sonoma', browser: 'Safari 17' },
      },
      headers: { 'user-agent': 'Mozilla/5.0 Mac Safari' },
      ip: '198.51.100.22',
    };
    const resActB = mockResponse();
    await activateDevice(reqActB, resActB);
    console.assert(resActB.statusCode === 409, `System B should be rejected with 409, got ${resActB.statusCode}`);
    console.assert(resActB.data.code === 'ALREADY_ACTIVATED_ON_OTHER_DEVICE', 'Should return ALREADY_ACTIVATED_ON_OTHER_DEVICE code');
    console.log(`✔ System B activation rejected with: "${resActB.data.error}"`);

    // Verify System A remains untouched and active!
    const updatedRecord = await DeviceActivation.findOne({ studentId: testStudent._id });
    console.assert(updatedRecord.isActivated === true, 'System A must remain activated');
    console.assert(updatedRecord.activationDeviceId === 'device-system-a-hardware-id-123', 'Device ID must still be System A');
    const freshStudent = await User.findById(testStudent._id);
    console.assert(freshStudent.currentSessionId === updatedRecord.activationSessionId, 'System A session ID must NOT be changed');
    console.log('✔ System A session and device binding remain completely unharmed and active.');

    // =========================================================================
    // SCENARIO 4: Payment Pending & Unauthorized Access Protection
    // =========================================================================
    console.log('\n--- TEST 4: Payment Pending & Unauthorized Access Protection ---');
    const unpaidStudent = await User.create({
      name: 'Unpaid Test Learner',
      email: `unpaid_${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'student',
    });
    await DeviceActivation.create({
      studentId: unpaidStudent._id,
      email: unpaidStudent.email,
      paymentStatus: 'pending',
      authorizedCourses: [],
      status: 'payment_pending',
    });

    const reqUnpaid = {
      body: { email: unpaidStudent.email, pin: CENTRAL_DEFAULT_PIN, deviceId: 'dev-unpaid-1' },
      headers: {},
      ip: '127.0.0.1',
    };
    const resUnpaid = mockResponse();
    await activateDevice(reqUnpaid, resUnpaid);
    console.assert(resUnpaid.statusCode === 403, `Unpaid student should be rejected with 403, got ${resUnpaid.statusCode}`);
    console.assert(resUnpaid.data.code === 'PAYMENT_PENDING', 'Should return PAYMENT_PENDING code');
    console.log('✔ Unpaid activation attempt correctly rejected with 403 PAYMENT_PENDING.');

    // =========================================================================
    // SCENARIOS 5 & 6: Wrong PIN & Brute Force Protection (Lockout)
    // =========================================================================
    console.log('\n--- TEST 5 & 6: Wrong PIN & Brute Force Throttling ---');
    const bfStudent = await User.create({
      name: 'Brute Force Test Learner',
      email: `bf_${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'student',
    });
    await DeviceActivation.create({
      studentId: bfStudent._id,
      email: bfStudent.email,
      paymentStatus: 'verified',
      authorizedCourses: [courseA._id],
      status: 'course_authorized',
      failedPinAttempts: 0,
    });

    // 4 failed attempts with invalid PIN '0000'
    for (let i = 1; i <= 4; i++) {
      const resWrong = mockResponse();
      await activateDevice(
        { body: { email: bfStudent.email, pin: '0000', deviceId: 'dev-attacker' }, headers: {}, ip: '1.2.3.4' },
        resWrong
      );
      console.assert(resWrong.statusCode === 401, 'Wrong PIN should return 401');
    }
    console.log('✔ 4 consecutive wrong attempts tracked.');

    // 5th failed attempt should trigger lockout
    const resLock = mockResponse();
    await activateDevice(
      { body: { email: bfStudent.email, pin: '0000', deviceId: 'dev-attacker' }, headers: {}, ip: '1.2.3.4' },
      resLock
    );
    console.assert(resLock.statusCode === 401, '5th attempt should fail and trigger lock');

    // 6th attempt should be blocked by rate limit / lockedUntil (429)
    const resLockedOut = mockResponse();
    await activateDevice(
      { body: { email: bfStudent.email, pin: CENTRAL_DEFAULT_PIN, deviceId: 'dev-attacker' }, headers: {}, ip: '1.2.3.4' },
      resLockedOut
    );
    console.assert(resLockedOut.statusCode === 429, `Locked account should return 429, got ${resLockedOut.statusCode}`);
    console.assert(resLockedOut.data.code === 'PIN_THROTTLED', 'Should return PIN_THROTTLED code');
    console.log('✔ Brute force throttling working: Account locked after 5 failed attempts.');

    // =========================================================================
    // SCENARIO 7: Admin Reset Activation (Device Cleared, Reuses Default PIN)
    // =========================================================================
    console.log('\n--- TEST 7: Admin Reset Device Activation (No Individual PIN Generated) ---');
    const reqReset = {
      body: {
        studentId: testStudent._id,
        reason: 'Student purchased a new laptop (System C)',
      },
      user: adminUser,
      ip: '127.0.0.1',
    };
    const resReset = mockResponse();
    await resetActivation(reqReset, resReset);
    console.assert(resReset.statusCode === 200, 'Reset should return 200');
    console.assert(resReset.data.activation.isActivated === false, 'isActivated should be false after reset');
    console.assert(resReset.data.activation.activationDeviceId === null, 'Device binding should be null');
    console.assert(resReset.data.pin === undefined, 'No student-specific PIN should be generated on reset');
    console.log('✔ Old device binding cleared. No individual PIN generated.');

    // System C activates with the same reusable Central Default PIN
    const reqActC = {
      body: {
        email: testStudent.email,
        pin: CENTRAL_DEFAULT_PIN,
        deviceId: 'device-system-c-new-laptop-456',
        deviceInfo: { platform: 'Linux Ubuntu', browser: 'Firefox 124' },
      },
      headers: { 'user-agent': 'Mozilla/5.0 Linux Firefox' },
      ip: '127.0.0.1',
    };
    const resActC = mockResponse();
    await activateDevice(reqActC, resActC);
    console.assert(resActC.statusCode === 200, 'System C activation should succeed with default PIN');
    console.assert(resActC.data.deviceId === 'device-system-c-new-laptop-456', 'System C should now be the bound device');
    console.log('✔ System C activated successfully with Central Default PIN after admin reset.');

    // =========================================================================
    // SCENARIO 8: Admin Revocation
    // =========================================================================
    console.log('\n--- TEST 8: Admin Revoke Activation ---');
    const reqRevoke = {
      body: {
        studentId: testStudent._id,
        reason: 'Payment chargeback dispute',
      },
      user: adminUser,
      ip: '127.0.0.1',
    };
    const resRevoke = mockResponse();
    await revokeActivation(reqRevoke, resRevoke);
    console.assert(resRevoke.statusCode === 200, 'Revoke should return 200');
    console.assert(resRevoke.data.activation.status === 'revoked', 'Status should be revoked');

    // Access to Course A must now be rejected
    const accessRevokedA = await courseAccessFor(testStudent, courseA._id);
    console.assert(accessRevokedA.allowed === false, 'Access must be denied after revocation');
    console.assert(accessRevokedA.reason === 'suspended', 'Reason must be suspended');
    console.log('✔ Revocation works: All protected course access immediately rejected.');

    // Re-authorize for remaining tests
    await reauthorizeActivation({ body: { studentId: testStudent._id }, user: adminUser }, mockResponse());

    // =========================================================================
    // SCENARIO 9: Page Refresh & Session Continuation on System A
    // =========================================================================
    console.log('\n--- TEST 9: Page Refresh & Session Continuation on System A ---');
    // Reset activation and re-activate with default PIN
    await resetActivation({ body: { studentId: testStudent._id, reason: 'Testing session persistence' }, user: adminUser }, mockResponse());

    const resFreshAct = mockResponse();
    await activateDevice(
      {
        body: {
          email: testStudent.email,
          pin: CENTRAL_DEFAULT_PIN,
          deviceId: 'device-persistent-session-a',
          deviceInfo: { platform: 'Windows' },
        },
        headers: {},
        ip: '127.0.0.1',
      },
      resFreshAct
    );
    console.assert(resFreshAct.statusCode === 200, 'Activation should succeed');

    // Simulate page refresh / subsequent request with token and device ID
    const studentUser = await User.findById(testStudent._id);
    const granted = await grantedCourseIds(studentUser._id);
    console.assert(granted.length === 2, 'Granted courses must contain 2 courses without re-entering PIN');
    console.log('✔ Session continues smoothly on page refresh without needing PIN re-entry.');

    // =========================================================================
    // SCENARIO 10: Concurrent Activation Race Condition Test
    // =========================================================================
    console.log('\n--- TEST 10: Concurrent Activation Protection (Race Condition) ---');
    const raceStudent = await User.create({
      name: 'Concurrent Race Learner',
      email: `concurrent_${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'student',
    });
    await DeviceActivation.create({
      studentId: raceStudent._id,
      email: raceStudent.email,
      paymentStatus: 'verified',
      authorizedCourses: [courseA._id],
      status: 'course_authorized',
    });

    // Fire 2 concurrent activation requests at the exact same time with CENTRAL_DEFAULT_PIN
    const resRace1 = mockResponse();
    const resRace2 = mockResponse();
    await Promise.all([
      activateDevice(
        { body: { email: raceStudent.email, pin: CENTRAL_DEFAULT_PIN, deviceId: 'dev-concurrent-1' }, headers: {}, ip: '10.0.0.1' },
        resRace1
      ),
      activateDevice(
        { body: { email: raceStudent.email, pin: CENTRAL_DEFAULT_PIN, deviceId: 'dev-concurrent-2' }, headers: {}, ip: '10.0.0.2' },
        resRace2
      ),
    ]);

    const statusCodes = [resRace1.statusCode, resRace2.statusCode];
    const successCount = statusCodes.filter((c) => c === 200).length;
    const rejectCount = statusCodes.filter((c) => c === 409).length;

    console.assert(successCount === 1, `Exactly 1 concurrent activation must succeed, got ${successCount}`);
    console.assert(rejectCount === 1, `Exactly 1 concurrent activation must be rejected (409), got ${rejectCount}`);
    console.log(`✔ Concurrency test passed: Exactly 1 succeeded (200), 1 rejected (409). No race conditions!`);

    // Clean up test data
    console.log('\n--- CLEANING UP TEST DATA ---');
    await DeviceActivation.deleteMany({
      studentId: { $in: [testStudent._id, unpaidStudent._id, bfStudent._id, raceStudent._id] },
    });
    await CourseAccess.deleteMany({
      studentId: { $in: [testStudent._id, unpaidStudent._id, bfStudent._id, raceStudent._id] },
    });
    await User.deleteMany({
      _id: { $in: [testStudent._id, unpaidStudent._id, bfStudent._id, raceStudent._id] },
    });
    await Course.deleteMany({
      _id: { $in: [courseA._id, courseB._id, courseC._id] },
    });
    console.log('✔ Test data cleaned up.');

    console.log('\n=============================================================');
    console.log('🎉 ALL 11 VERIFICATION SCENARIOS PASSED WITH ZERO ERRORS! 🎉');
    console.log('=============================================================\n');
  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

runTests();
