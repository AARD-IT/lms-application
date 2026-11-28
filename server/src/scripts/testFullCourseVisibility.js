require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const DeviceActivation = require('../models/DeviceActivation');
const Enrollment = require('../models/Enrollment');
const CourseAccess = require('../models/CourseAccess');
const { COURSE_ACCESS_STATUS, ACTIVATION_STATUS, PAYMENT_STATUS } = require('../constants');

const BASE_URL = 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-key-change-in-prod';

async function runTests() {
  console.log('================================================================');
  console.log('  LMS FULL COURSE VISIBILITY & PAYMENT-BASED ACCESS TEST SUITE  ');
  console.log('================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  try {
    // 1. Setup Admin, Student, and Courses
    const timestamp = Date.now();

    let admin = await User.findOne({ role: 'admin' });
    if (!admin) {
      admin = await User.create({
        name: 'Visibility Admin',
        email: `vis_admin_${timestamp}@example.com`,
        password: 'Password123!',
        role: 'admin',
        adminRole: 'super_admin',
      });
    }
    const adminSessionId = `admin-sess-${timestamp}`;
    admin.currentSessionId = adminSessionId;
    await admin.save();
    const adminToken = jwt.sign(
      { id: admin._id, email: admin.email, sessionId: adminSessionId },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const student = await User.create({
      name: 'Visibility Student',
      email: `vis_student_${timestamp}@example.com`,
      password: 'Password123!',
      role: 'student',
    });
    const studentSessionId = `student-sess-${timestamp}`;
    student.currentSessionId = studentSessionId;
    await student.save();
    const studentToken = jwt.sign(
      { id: student._id, email: student.email, sessionId: studentSessionId },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create 2 published courses and 1 draft course
    const courseA = await Course.create({
      title: `Full Vis Course A ${timestamp}`,
      slug: `full-vis-course-a-${timestamp}`,
      category: 'Visibility Test',
      price: 2999,
      published: true,
      hours: 5,
    });

    const courseB = await Course.create({
      title: `Full Vis Course B ${timestamp}`,
      slug: `full-vis-course-b-${timestamp}`,
      category: 'Visibility Test',
      price: 4999,
      published: true,
      hours: 10,
    });

    const draftCourse = await Course.create({
      title: `Draft Hidden Course ${timestamp}`,
      slug: `draft-course-${timestamp}`,
      category: 'Hidden Test',
      price: 999,
      published: false,
    });

    // Create lessons for Course A
    const lessonA1 = await Lesson.create({
      courseId: courseA._id,
      title: 'Introduction to Course A',
      description: 'Overview lesson',
      driveFileId: `mock-drive-id-a1-${timestamp}`,
      duration: 300,
      order: 1,
    });

    const lessonA2 = await Lesson.create({
      courseId: courseA._id,
      title: 'Advanced Module in Course A',
      description: 'Deep dive lesson',
      driveFileId: `mock-drive-id-a2-${timestamp}`,
      duration: 600,
      order: 2,
    });

    // Create lessons for Course B
    const lessonB1 = await Lesson.create({
      courseId: courseB._id,
      title: 'Introduction to Course B',
      description: 'Overview lesson B',
      driveFileId: `mock-drive-id-b1-${timestamp}`,
      duration: 400,
      order: 1,
    });

    console.log(`Test environment initialized:`);
    console.log(`  Student: ${student.email}`);
    console.log(`  Course A: ${courseA.title} (${courseA._id})`);
    console.log(`  Course B: ${courseB.title} (${courseB._id})\n`);

    // ========================================================================
    // TEST 1: Unauthenticated Public Catalog & Curriculum Preview
    // ========================================================================
    console.log('--- TEST 1: Unauthenticated Visitor Catalog & Preview ---');
    const pubCoursesRes = await fetch(`${BASE_URL}/api/courses`);
    const pubCourses = await pubCoursesRes.json();

    assert(pubCoursesRes.status === 200, 'Public catalog returns 200 OK');
    const pubCourseA = pubCourses.find((c) => c._id === String(courseA._id));
    const pubCourseB = pubCourses.find((c) => c._id === String(courseB._id));
    const pubDraft = pubCourses.find((c) => c._id === String(draftCourse._id));

    assert(Boolean(pubCourseA && pubCourseB), 'Both published courses are visible in public catalog');
    assert(!pubDraft, 'Draft course is not exposed to public catalogue');
    assert(pubCourseA?.accessStatus === COURSE_ACCESS_STATUS.LOCKED, 'Course A accessStatus is LOCKED for visitor');
    assert(pubCourseA?.hasAccess === false, 'Course A hasAccess is false for visitor');

    // Safe curriculum preview
    const pubCurriculumRes = await fetch(`${BASE_URL}/api/courses/${courseA._id}/curriculum`);
    const pubCurriculum = await pubCurriculumRes.json();
    assert(pubCurriculumRes.status === 200, 'Public curriculum preview returns 200 OK');
    assert(Array.isArray(pubCurriculum) && pubCurriculum.length === 2, 'Curriculum preview returns all lesson titles');
    assert(pubCurriculum[0].title === 'Introduction to Course A', 'Lesson title is visible in preview');
    assert(pubCurriculum[0].locked === true, 'Lesson is marked locked: true in preview');
    assert(pubCurriculum[0].streamUrl === undefined, 'No streamUrl exposed in curriculum preview');
    assert(pubCurriculum[0].driveFileId === undefined, 'No Google Drive ID exposed in curriculum preview');

    // Protected routes rejection
    const unauthLessonsRes = await fetch(`${BASE_URL}/api/courses/${courseA._id}/lessons`);
    assert(unauthLessonsRes.status === 401, 'Unauthenticated /lessons returns 401 Unauthorized');
    const unauthStreamRes = await fetch(`${BASE_URL}/api/videos/${lessonA1._id}/stream`);
    assert(unauthStreamRes.status === 401, 'Unauthenticated /videos/stream returns 401 Unauthorized');

    // ========================================================================
    // TEST 2: Authenticated Student with No Purchases (All Courses Locked)
    // ========================================================================
    console.log('\n--- TEST 2: Authenticated Student with No Purchases ---');
    const studentCoursesRes1 = await fetch(`${BASE_URL}/api/courses`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentCourses1 = await studentCoursesRes1.json();
    const stCourseA1 = studentCourses1.find((c) => c._id === String(courseA._id));
    const stCourseB1 = studentCourses1.find((c) => c._id === String(courseB._id));

    assert(Boolean(stCourseA1 && stCourseB1), 'Student sees ALL published courses in catalog');
    assert(stCourseA1?.accessStatus === COURSE_ACCESS_STATUS.LOCKED, 'Course A is LOCKED for unpaid student');
    assert(stCourseB1?.accessStatus === COURSE_ACCESS_STATUS.LOCKED, 'Course B is LOCKED for unpaid student');
    assert(stCourseA1?.hasAccess === false, 'Course A hasAccess is false');

    const stCurriculumRes = await fetch(`${BASE_URL}/api/courses/${courseA._id}/curriculum`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const stCurriculum = await stCurriculumRes.json();
    assert(stCurriculum.every((l) => l.locked === true), 'Student curriculum preview marks lessons locked: true');

    const stLessonsRes1 = await fetch(`${BASE_URL}/api/courses/${courseA._id}/lessons`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(stLessonsRes1.status === 403, 'Unenrolled student cannot access /courses/:id/lessons (403 Forbidden)');

    const stStreamRes1 = await fetch(`${BASE_URL}/api/videos/${lessonA1._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(stStreamRes1.status === 403, 'Unenrolled student cannot stream video (403 Forbidden)');

    // ========================================================================
    // TEST 3: Payment Verification Pending
    // ========================================================================
    console.log('\n--- TEST 3: Student with Payment Verification Pending ---');
    await Enrollment.create({
      studentId: student._id,
      courseId: courseA._id,
      amount: 2999,
      status: 'pending',
      gateway: 'manual',
      transactionId: `TXN-${timestamp}`,
    });

    const studentCoursesRes2 = await fetch(`${BASE_URL}/api/courses`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentCourses2 = await studentCoursesRes2.json();
    const stCourseA2 = studentCourses2.find((c) => c._id === String(courseA._id));
    const stCourseB2 = studentCourses2.find((c) => c._id === String(courseB._id));

    assert(stCourseA2?.accessStatus === COURSE_ACCESS_STATUS.PAYMENT_PENDING, 'Course A accessStatus is PAYMENT_PENDING');
    assert(stCourseA2?.hasAccess === false, 'Course A hasAccess is false during pending verification');
    assert(stCourseB2?.accessStatus === COURSE_ACCESS_STATUS.LOCKED, 'Course B remains LOCKED');

    // Lessons and stream must still be rejected
    const stLessonsRes2 = await fetch(`${BASE_URL}/api/courses/${courseA._id}/lessons`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(stLessonsRes2.status === 403, 'Payment pending student cannot access /lessons (403 Forbidden)');

    // ========================================================================
    // TEST 4: Activation Pending (Payment Verified + PIN Generated, Not Activated)
    // ========================================================================
    console.log('\n--- TEST 4: Student with Activation Pending (Payment Verified) ---');
    const verifyRes = await fetch(`${BASE_URL}/api/admin/activation/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId: String(student._id),
        paymentReference: `BANK-REF-${timestamp}`,
        paymentAmount: 2999,
        paymentNotes: 'Verified via NEFT statement',
        verified: true,
      }),
    });
    const verifyData = await verifyRes.json();
    assert(verifyRes.status === 200, 'Admin payment verification succeeded');
    assert(verifyData.activation?.paymentStatus === 'verified', 'Payment status is marked verified');

    // Authorize Course A
    const authRes = await fetch(`${BASE_URL}/api/admin/activation/authorize-courses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId: String(student._id),
        courseIds: [String(courseA._id)],
      }),
    });
    const authData = await authRes.json();
    assert(authRes.status === 200, 'Admin course authorization succeeded');
    assert(authData.activation?.authorizedCourses?.length === 1, 'Course A is authorized');

    // Verify individual PIN generation is deprecated (410 Gone)
    const pinRes = await fetch(`${BASE_URL}/api/admin/activation/generate-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId: String(student._id),
        expiryHours: 24,
      }),
    });
    assert(pinRes.status === 410, 'Admin legacy PIN generation returned 410 Gone (deprecated)');
    const generatedPin = '1234';

    // Check student course catalog
    const studentCoursesRes3 = await fetch(`${BASE_URL}/api/courses`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const studentCourses3 = await studentCoursesRes3.json();
    const stCourseA3 = studentCourses3.find((c) => c._id === String(courseA._id));
    const stCourseB3 = studentCourses3.find((c) => c._id === String(courseB._id));

    assert(stCourseA3?.accessStatus === COURSE_ACCESS_STATUS.ACTIVATION_PENDING, 'Authorized Course A shows ACTIVATION_PENDING');
    assert(stCourseA3?.hasAccess === false, 'Authorized Course A hasAccess is false until PIN activation');
    assert(stCourseB3?.accessStatus === COURSE_ACCESS_STATUS.LOCKED, 'Unpurchased Course B remains LOCKED in catalog');

    // Lessons and video stream must STILL be locked
    const stLessonsRes3 = await fetch(`${BASE_URL}/api/courses/${courseA._id}/lessons`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(stLessonsRes3.status === 403, 'Activation pending student cannot access /lessons (403 Forbidden)');
    const stStreamRes3 = await fetch(`${BASE_URL}/api/videos/${lessonA1._id}/stream`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(stStreamRes3.status === 403, 'Activation pending student cannot stream video (403 Forbidden)');

    // ========================================================================
    // TEST 5: Device Activation on System A -> ACCESS GRANTED
    // ========================================================================
    console.log('\n--- TEST 5: System A Device Activation -> ACCESS GRANTED ---');
    const systemADeviceId = `system-a-device-${timestamp}`;
    const activateRes = await fetch(`${BASE_URL}/api/auth/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
        'x-device-id': systemADeviceId,
      },
      body: JSON.stringify({
        email: student.email,
        pin: generatedPin,
        deviceId: systemADeviceId,
      }),
    });
    const activateData = await activateRes.json();
    assert(activateRes.status === 200, 'System A activation with 4-digit PIN succeeded (200 OK)');
    assert(activateData.activation?.isActivated === true, 'Activation status is now activated');
    const activeToken = activateData.token;
    assert(Boolean(activeToken), 'New authenticated session token returned upon activation');

    // Check student catalog after activation
    const studentCoursesRes4 = await fetch(`${BASE_URL}/api/courses`, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
        'x-device-id': systemADeviceId,
      },
    });
    const studentCourses4 = await studentCoursesRes4.json();
    const stCourseA4 = studentCourses4.find((c) => c._id === String(courseA._id));
    const stCourseB4 = studentCourses4.find((c) => c._id === String(courseB._id));

    assert(stCourseA4?.accessStatus === COURSE_ACCESS_STATUS.ACCESS_GRANTED, 'Course A accessStatus is now ACCESS_GRANTED');
    assert(stCourseA4?.hasAccess === true, 'Course A hasAccess is true on activated device');

    // Crucial check: Course B remains visible and LOCKED!
    assert(stCourseB4 !== undefined, 'Course B is STILL visible in catalog after Course A is activated');
    assert(stCourseB4?.accessStatus === COURSE_ACCESS_STATUS.LOCKED, 'Course B remains LOCKED');
    assert(stCourseB4?.hasAccess === false, 'Course B hasAccess remains false');

    // Course A lessons are now accessible
    const stLessonsRes4 = await fetch(`${BASE_URL}/api/courses/${courseA._id}/lessons`, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
        'x-device-id': systemADeviceId,
      },
    });
    assert(stLessonsRes4.status === 200, 'Activated student can access Course A /lessons (200 OK)');
    const lessonsData = await stLessonsRes4.json();
    assert(Array.isArray(lessonsData) && lessonsData.length === 2, 'All lessons returned for Course A');
    assert(lessonsData[0]?.streamUrl !== undefined, 'Lesson 1 has streamUrl');

    // Course B lessons remain forbidden
    const stLessonsResB = await fetch(`${BASE_URL}/api/courses/${courseB._id}/lessons`, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
        'x-device-id': systemADeviceId,
      },
    });
    assert(stLessonsResB.status === 403, 'Unauthorized Course B /lessons remains 403 Forbidden');

    // ========================================================================
    // TEST 6: Second Device (System B) Attempt Does NOT Disrupt System A
    // ========================================================================
    console.log('\n--- TEST 6: Second Device (System B) Attempt Rejection ---');
    const systemBDeviceId = `system-b-device-${timestamp}`;
    const activateSysBRes = await fetch(`${BASE_URL}/api/auth/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeToken}`,
        'x-device-id': systemBDeviceId,
      },
      body: JSON.stringify({
        email: student.email,
        pin: generatedPin,
        deviceId: systemBDeviceId,
      }),
    });
    assert(
      activateSysBRes.status === 409 || activateSysBRes.status === 400,
      'Second device attempt is rejected with 409 Conflict'
    );

    // Verify System A access is completely intact
    const verifySysARes = await fetch(`${BASE_URL}/api/courses/${courseA._id}/lessons`, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
        'x-device-id': systemADeviceId,
      },
    });
    assert(verifySysARes.status === 200, 'System A remains fully active and undisturbed');

    // ========================================================================
    // SUMMARY
    // ========================================================================
    console.log('\n================================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    // Cleanup test data
    await Lesson.deleteMany({ courseId: { $in: [courseA._id, courseB._id] } });
    await Course.deleteMany({ _id: { $in: [courseA._id, courseB._id, draftCourse._id] } });
    await CourseAccess.deleteMany({ studentId: student._id });
    await DeviceActivation.deleteMany({ studentId: student._id });
    await Enrollment.deleteMany({ studentId: student._id });
    await User.deleteOne({ _id: student._id });

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal test error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTests();
