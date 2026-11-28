/**
 * Comprehensive Automated Verification Script for
 * Dual Course Access Architecture: Automatic Razorpay & Manual Admin Authorization
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const CourseAccess = require('../models/CourseAccess');
const Enrollment = require('../models/Enrollment');
const DeviceActivation = require('../models/DeviceActivation');
const settingsService = require('../services/settingsService');
const { courseAccessFor, grantedCourseIds, grantCourseAccess, revokeCourseAccess, markPaymentSuccessful } = require('../services/enrolmentService');
const { authorizeCourses, activateDevice, verifyPayment } = require('../controllers/activationController');

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

async function runDualAccessTests() {
  console.log('================================================================');
  console.log('  TESTING DUAL COURSE ACCESS: RAZORPAY + MANUAL ADMIN ACCESS   ');
  console.log('================================================================\n');

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in server/.env');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = '') {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message} - ${details}`);
      failed++;
    }
  }

  const timestamp = Date.now();
  const DEFAULT_PIN = '1234';

  let adminUser = null;
  let studentRazorpay = null;
  let studentManual = null;
  let studentDual = null;
  let courseAlpha = null;
  let courseBeta = null;
  let courseGamma = null;

  try {
    // 0. Setup actors & settings
    adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      adminUser = await User.create({
        name: 'Admin Controller',
        email: `admin_${timestamp}@example.com`,
        password: 'AdminPassword123!',
        role: 'admin',
        adminRole: 'super_admin',
      });
    }

    studentRazorpay = await User.create({
      name: 'Razorpay Student',
      email: `rzp_student_${timestamp}@example.com`,
      password: 'Password123!',
      role: 'student',
    });

    studentManual = await User.create({
      name: 'Manual Admin Student',
      email: `manual_student_${timestamp}@example.com`,
      password: 'Password123!',
      role: 'student',
    });

    studentDual = await User.create({
      name: 'Dual Access Student',
      email: `dual_student_${timestamp}@example.com`,
      password: 'Password123!',
      role: 'student',
    });

    courseAlpha = await Course.create({
      title: `Course Alpha ${timestamp}`,
      slug: `course-alpha-${timestamp}`,
      price: 2499,
      published: true,
    });

    courseBeta = await Course.create({
      title: `Course Beta ${timestamp}`,
      slug: `course-beta-${timestamp}`,
      price: 3499,
      published: true,
    });

    courseGamma = await Course.create({
      title: `Course Gamma (Unauthorized) ${timestamp}`,
      slug: `course-gamma-${timestamp}`,
      price: 4999,
      published: true,
    });

    // Ensure platform activation PIN is configured
    await settingsService.update({
      activation: {
        systemEnabled: true,
        defaultPin: DEFAULT_PIN,
      },
    });

    console.log('Test Environment Ready.');

    // =========================================================================
    // 1. METHOD 1: Automatic Course Access Through Razorpay
    // =========================================================================
    console.log('\n--- 1. Testing Automatic Access Through Razorpay Payment ---');
    // Student initiates checkout
    const rzpEnrollment = new Enrollment({
      studentId: studentRazorpay._id,
      courseId: courseAlpha._id,
      transactionId: Enrollment.generateTransactionId(),
      amount: courseAlpha.price,
      currency: 'INR',
      method: 'razorpay',
      gateway: 'razorpay',
      gatewayOrderId: `order_${timestamp}`,
      status: 'pending',
    });
    await rzpEnrollment.save();

    // Backend verifies payment automatically (simulating verifyRazorpayPayment / webhook)
    const rzpPaymentResult = await markPaymentSuccessful(rzpEnrollment, {
      reference: `pay_${timestamp}_rzp1`,
      note: 'Verified Razorpay Payment',
    });

    assert(rzpPaymentResult.enrollment.status === 'completed', 'Razorpay enrollment status updated to completed');
    assert(rzpPaymentResult.enrollment.gateway === 'razorpay', 'Gateway recorded as razorpay');

    // Verify CourseAccess record created with source 'razorpay'
    const rzpGrant = await CourseAccess.findOne({ studentId: studentRazorpay._id, courseId: courseAlpha._id });
    assert(Boolean(rzpGrant && rzpGrant.active), 'CourseAccess record created automatically for purchased course');
    assert(rzpGrant?.source === 'razorpay', 'CourseAccess source dynamically recorded as razorpay');

    // Verify DeviceActivation record synchronized automatically
    const rzpActivation = await DeviceActivation.findOne({ studentId: studentRazorpay._id });
    assert(Boolean(rzpActivation), 'DeviceActivation record created automatically without manual admin entry');
    assert(rzpActivation?.paymentStatus === 'verified', 'Payment status automatically set to verified');
    assert(
      (rzpActivation?.authorizedCourses || []).some((cId) => String(cId) === String(courseAlpha._id)),
      'Purchased course automatically added to authorizedCourses'
    );

    // Student activates on System A using central default PIN (no manual approval needed!)
    const rzpActRes = mockResponse();
    await activateDevice(
      {
        body: {
          email: studentRazorpay.email,
          pin: DEFAULT_PIN,
          deviceId: `device-rzp-sys-a-${timestamp}`,
        },
        headers: {},
        ip: '127.0.0.1',
      },
      rzpActRes
    );
    assert(rzpActRes.statusCode === 200, 'Student activated successfully on System A');

    // Check course access for purchased course vs unauthorized course
    const rzpAccessAlpha = await courseAccessFor(studentRazorpay, courseAlpha._id);
    const rzpAccessGamma = await courseAccessFor(studentRazorpay, courseGamma._id);
    assert(rzpAccessAlpha.allowed === true, 'Purchased course Alpha is accessible without manual admin authorization');
    assert(rzpAccessGamma.allowed === false, 'Unauthorized course Gamma remains strictly locked');

    // =========================================================================
    // 2. METHOD 2: Manual Admin Course Authorization (Complimentary / Offline)
    // =========================================================================
    console.log('\n--- 2. Testing Manual Admin Course Authorization ---');
    // Admin manually authorizes Course Beta for studentManual (no Razorpay payment)
    const manualAuthReq = {
      body: {
        studentId: studentManual._id,
        courseIds: [courseBeta._id],
      },
      user: adminUser,
      ip: '127.0.0.1',
    };
    const manualAuthRes = mockResponse();

    // Verify payment manually first (e.g. offline bank transfer)
    await verifyPayment(
      {
        body: {
          studentId: studentManual._id,
          paymentReference: 'NEFT-OFFLINE-987654',
          paymentAmount: 3499,
          paymentNotes: 'Offline corporate sponsorship',
          verified: true,
          courseIds: [courseBeta._id],
        },
        user: adminUser,
        ip: '127.0.0.1',
      },
      mockResponse()
    );

    await authorizeCourses(manualAuthReq, manualAuthRes);
    assert(manualAuthRes.statusCode === 200, 'Admin manual course authorization returned 200 OK');

    // Verify CourseAccess created with source 'manual'
    const manualGrant = await CourseAccess.findOne({ studentId: studentManual._id, courseId: courseBeta._id });
    assert(Boolean(manualGrant && manualGrant.active), 'CourseAccess record created via manual authorization');
    assert(manualGrant?.source === 'manual', 'CourseAccess source recorded as manual');

    // Verify Enrollment record created with gateway 'manual'
    const manualEnrollment = await Enrollment.findOne({ studentId: studentManual._id, courseId: courseBeta._id });
    assert(Boolean(manualEnrollment && manualEnrollment.status === 'completed'), 'Database-backed Enrollment created for manual authorization');
    assert(manualEnrollment?.gateway === 'manual', 'Enrollment gateway recorded as manual');

    // Student activates on System A using central default PIN
    const manualActRes = mockResponse();
    await activateDevice(
      {
        body: {
          email: studentManual.email,
          pin: DEFAULT_PIN,
          deviceId: `device-manual-sys-a-${timestamp}`,
        },
        headers: {},
        ip: '127.0.0.1',
      },
      manualActRes
    );
    assert(manualActRes.statusCode === 200, 'Manual student activated successfully');

    // Check course access
    const manualAccessBeta = await courseAccessFor(studentManual, courseBeta._id);
    const manualAccessAlpha = await courseAccessFor(studentManual, courseAlpha._id);
    assert(manualAccessBeta.allowed === true, 'Manually authorized Course Beta is accessible');
    assert(manualAccessAlpha.allowed === false, 'Non-authorized Course Alpha remains locked');

    // =========================================================================
    // 3. COMBINED & CROSS-METHOD ACCESS (NO CONFLICTS, NO OVERWRITES)
    // =========================================================================
    console.log('\n--- 3. Testing Combined Workflows: Coexistence & Conflict Prevention ---');
    // Step 3A: Student first receives manual access to Course Alpha
    await grantCourseAccess(studentDual._id, courseAlpha, { by: adminUser._id, source: 'manual' });
    const dualActRec = await DeviceActivation.findOne({ studentId: studentDual._id });
    assert(Boolean(dualActRec), 'DeviceActivation created for dual student');

    // Activate System A
    await activateDevice(
      {
        body: { email: studentDual.email, pin: DEFAULT_PIN, deviceId: `dual-dev-sys-a-${timestamp}` },
        headers: {},
        ip: '127.0.0.1',
      },
      mockResponse()
    );

    // Step 3B: Dual student now purchases Course Beta via Razorpay
    const dualRzpEnrollment = new Enrollment({
      studentId: studentDual._id,
      courseId: courseBeta._id,
      transactionId: Enrollment.generateTransactionId(),
      amount: courseBeta.price,
      currency: 'INR',
      method: 'razorpay',
      gateway: 'razorpay',
      gatewayOrderId: `dual_order_${timestamp}`,
      status: 'pending',
    });
    await dualRzpEnrollment.save();

    await markPaymentSuccessful(dualRzpEnrollment, { reference: `pay_dual_rzp_${timestamp}` });

    // Verify student now has access to BOTH Course Alpha (manual) and Course Beta (Razorpay)!
    const accessDualAlpha = await courseAccessFor(studentDual, courseAlpha._id);
    const accessDualBeta = await courseAccessFor(studentDual, courseBeta._id);
    assert(accessDualAlpha.allowed === true, 'Original manual Course Alpha access remains fully intact');
    assert(accessDualBeta.allowed === true, 'New Razorpay Course Beta access is automatically granted');

    // Verify access sources are tracked accurately
    const grantA = await CourseAccess.findOne({ studentId: studentDual._id, courseId: courseAlpha._id });
    const grantB = await CourseAccess.findOne({ studentId: studentDual._id, courseId: courseBeta._id });
    assert(grantA?.source === 'manual', 'Course Alpha source tracked as manual', `grantA is: ${JSON.stringify(grantA)}`);
    assert(grantB?.source === 'razorpay', 'Course Beta source tracked as razorpay', `grantB is: ${JSON.stringify(grantB)}`);

    // Step 3C: Admin revokes manual Course Alpha. Razorpay Course Beta MUST NOT be affected!
    console.log('\n--- 3C. Revocation Isolation: Revoking Manual Course Keeps Razorpay Course Intact ---');
    await revokeCourseAccess(studentDual._id, courseAlpha);

    const postRevokeAlpha = await courseAccessFor(studentDual, courseAlpha._id);
    const postRevokeBeta = await courseAccessFor(studentDual, courseBeta._id);
    assert(postRevokeAlpha.allowed === false, 'Revoked manual Course Alpha is now denied');
    assert(postRevokeBeta.allowed === true, 'Legitimate paid Razorpay Course Beta remains 100% active and untouched');

    // Step 3D: Admin updates course authorization for a student with Razorpay course
    console.log('\n--- 3D. Authorization Update Isolation: Admin Updating Courses Preserves Paid Courses ---');
    // Admin authorizes Course Gamma for studentDual. Paid Course Beta MUST be preserved in authorizedCourses!
    await authorizeCourses(
      {
        body: {
          studentId: studentDual._id,
          courseIds: [courseGamma._id],
        },
        user: adminUser,
        ip: '127.0.0.1',
      },
      mockResponse()
    );

    const dualActivationAfter = await DeviceActivation.findOne({ studentId: studentDual._id });
    const hasBetaInAuth = (dualActivationAfter.authorizedCourses || []).some((c) => String(c) === String(courseBeta._id));
    const hasGammaInAuth = (dualActivationAfter.authorizedCourses || []).some((c) => String(c) === String(courseGamma._id));
    assert(hasBetaInAuth, 'Paid Razorpay Course Beta preserved in authorizedCourses during admin update');
    assert(hasGammaInAuth, 'Newly authorized Course Gamma added to authorizedCourses');

    // Step 3E: Duplicate enrollment check
    console.log('\n--- 3E. Duplicate Prevention: No Duplicate Enrollments ---');
    const enrollmentsCount = await Enrollment.countDocuments({ studentId: studentDual._id, courseId: courseBeta._id });
    assert(enrollmentsCount === 1, 'Exactly one Enrollment record exists for Course Beta (no duplicates)');

    const grantsCount = await CourseAccess.countDocuments({ studentId: studentDual._id, courseId: courseBeta._id });
    assert(grantsCount === 1, 'Exactly one CourseAccess record exists for Course Beta (no duplicates)');

    // Clean up test actors
    console.log('\n--- Cleaning up test records ---');
    await DeviceActivation.deleteMany({ studentId: { $in: [studentRazorpay._id, studentManual._id, studentDual._id] } });
    await CourseAccess.deleteMany({ studentId: { $in: [studentRazorpay._id, studentManual._id, studentDual._id] } });
    await Enrollment.deleteMany({ studentId: { $in: [studentRazorpay._id, studentManual._id, studentDual._id] } });
    await User.deleteMany({ _id: { $in: [studentRazorpay._id, studentManual._id, studentDual._id] } });
    await Course.deleteMany({ _id: { $in: [courseAlpha._id, courseBeta._id, courseGamma._id] } });
    console.log('Test records cleaned up.');

    console.log('\n================================================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ TEST FAILED WITH EXCEPTION:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

runDualAccessTests();
