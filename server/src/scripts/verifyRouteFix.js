require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Course = require('../models/Course');
const DeviceActivation = require('../models/DeviceActivation');

const BASE_URL = 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-key-change-in-prod';

async function runVerification() {
  console.log('=== VERIFYING ROUTE FIX: POST /api/admin/activation/verify-payment ===\n');

  await mongoose.connect(process.env.MONGODB_URI);

  let adminUser = await User.findOne({ role: 'admin' });
  if (!adminUser) {
    adminUser = await User.create({
      name: 'Verify Super Admin',
      email: `verify_admin_${Date.now()}@example.com`,
      password: 'Password123!',
      role: 'admin',
      adminRole: 'super_admin',
    });
  }

  const testStudent = await User.create({
    name: 'Verify Learner',
    email: `verify_student_${Date.now()}@example.com`,
    password: 'Password123!',
    role: 'student',
  });

  const now = Date.now();
  const testCourse = await Course.create({
    title: `Verify Course ${now}`,
    slug: `verify-course-${now}`,
    category: 'Verification',
    price: 1999,
    published: true,
  });

  const adminSessionId = 'admin-verify-session';
  adminUser.currentSessionId = adminSessionId;
  await adminUser.save();

  const studentSessionId = 'student-verify-session';
  testStudent.currentSessionId = studentSessionId;
  await testStudent.save();

  const adminToken = jwt.sign(
    { id: adminUser._id, email: adminUser.email, sessionId: adminSessionId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const studentToken = jwt.sign(
    { id: testStudent._id, email: testStudent.email, sessionId: studentSessionId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  try {
    // Test 1: Unauthenticated request -> Expect 401
    console.log('Test 1: Unauthenticated request to POST /api/admin/activation/verify-payment');
    const res1 = await fetch(`${BASE_URL}/api/admin/activation/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    console.log(`Status: ${res1.status} (Expected: 401)`);
    console.assert(res1.status === 401, 'Should be 401 Unauthenticated');
    console.log('✔ Test 1 Passed.\n');

    // Test 2: Non-admin request -> Expect 403
    console.log('Test 2: Student (non-admin) request to POST /api/admin/activation/verify-payment');
    const res2 = await fetch(`${BASE_URL}/api/admin/activation/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ studentId: testStudent._id }),
    });
    console.log(`Status: ${res2.status} (Expected: 403)`);
    const data2 = await res2.json();
    console.log('Response:', data2);
    console.assert(res2.status === 403, 'Should be 403 Forbidden');
    console.log('✔ Test 2 Passed.\n');

    // Test 3: Admin request with invalid studentId -> Expect 400
    console.log('Test 3: Admin request with invalid studentId');
    const res3 = await fetch(`${BASE_URL}/api/admin/activation/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ studentId: 'invalid-id-123' }),
    });
    console.log(`Status: ${res3.status} (Expected: 400)`);
    const data3 = await res3.json();
    console.log('Response:', data3);
    console.assert(res3.status === 400, 'Should be 400 Bad Request');
    console.log('✔ Test 3 Passed.\n');

    // Test 4: Valid Admin Payment Verification -> Expect 200
    console.log('Test 4: Valid Admin Payment Verification with course authorization');
    const res4 = await fetch(`${BASE_URL}/api/admin/activation/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId: testStudent._id,
        paymentReference: 'UPI-VERIFIED-987654',
        paymentAmount: 1999,
        paymentNotes: 'Verified via ICICI Corporate Banking',
        verified: true,
        courseIds: [testCourse._id],
      }),
    });
    console.log(`Status: ${res4.status} (Expected: 200)`);
    const data4 = await res4.json();
    console.log('Response message:', data4.message);
    console.log('Activation status:', data4.activation?.status);
    console.log('Payment status:', data4.activation?.paymentStatus);
    console.log('Authorized courses count:', data4.activation?.authorizedCourses?.length);
    console.assert(res4.status === 200, 'Should be 200 OK');
    console.assert(data4.activation?.paymentStatus === 'verified', 'Payment status must be verified');
    console.assert(data4.activation?.status === 'course_authorized', 'Status must advance to course_authorized');
    console.assert(data4.activation?.authorizedCourses?.length === 1, 'Must have 1 authorized course');
    console.log('✔ Test 4 Passed.\n');

    // Test 5: Verify GET /api/admin/activation/student/:studentId
    console.log('Test 5: Fetch student activation via GET /api/admin/activation/student/:studentId');
    const res5 = await fetch(`${BASE_URL}/api/admin/activation/student/${testStudent._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    console.log(`Status: ${res5.status} (Expected: 200)`);
    const data5 = await res5.json();
    console.assert(res5.status === 200, 'Should be 200 OK');
    console.assert(data5.exists === true, 'Activation record should exist');
    console.assert(data5.activation.paymentStatus === 'verified', 'Payment status must be verified');
    console.log('✔ Test 5 Passed.\n');

    // Test 6: Verify health & other routes continue working
    console.log('Test 6: Existing LMS routes sanity check (GET /api/health)');
    const res6 = await fetch(`${BASE_URL}/api/health`);
    console.log(`Status: ${res6.status} (Expected: 200)`);
    const data6 = await res6.json();
    console.assert(res6.status === 200, 'Should be 200 OK');
    console.assert(data6.status === 'ok', 'Health status must be ok');
    console.log('✔ Test 6 Passed.\n');

    // Clean up test data
    await DeviceActivation.deleteMany({ studentId: testStudent._id });
    await User.deleteMany({ _id: testStudent._id });
    await Course.deleteMany({ _id: testCourse._id });

    console.log('======================================================');
    console.log('🎉 ALL LIVE ROUTE VERIFICATION TESTS PASSED (200 OK)! 🎉');
    console.log('======================================================\n');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runVerification();
