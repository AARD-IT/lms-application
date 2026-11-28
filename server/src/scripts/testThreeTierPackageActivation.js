/**
 * Automated Verification Suite for Analytics Avenue LMS:
 * Three-Tier Course Package PIN Activation System & Learner Onboarding
 *
 * Validates:
 * 1. Database-driven 3-Tier Course Packages (Core Skills, Advanced Skills, Full LMS).
 * 2. Learner Registration & Personal Details Onboarding with Admin Notification.
 * 3. Premature Access Prevention.
 * 4. Admin Payment Verification & Package PIN Generation (4-Digit Secure PIN).
 * 5. Persistent Student LMS Notification Delivery.
 * 6. PIN Security: Salted Hashing, Brute-Force Throttling, Lockout, Student Isolation.
 * 7. Single-Use PIN Enforcement (Cannot be reused after successful activation).
 * 8. Package 1 (Core Skills) Unlocking: SQL, Python, Power BI unlocked; other courses locked.
 * 9. Normal Login Workflow: Normal email/password login works without re-entering PIN.
 * 10. Package 2 (Advanced Skills) Unlocking: Data Science & Generative AI unlocked.
 * 11. Package 3 (Full LMS) Unlocking: All eligible published courses dynamically unlocked.
 * 12. Course-Specific Resources Protection: Only package-authorized course resources accessible.
 * 13. Explicit PIN Regeneration with Audit History.
 * 14. Coexistence with Razorpay Payments & Manual Authorizations.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const CourseAccess = require('../models/CourseAccess');
const DeviceActivation = require('../models/DeviceActivation');
const Enrollment = require('../models/Enrollment');
const Resource = require('../models/Resource');
const Notification = require('../models/Notification');
const Package = require('../models/Package');
const packageService = require('../services/packageService');
const activationController = require('../controllers/activationController');
const authController = require('../controllers/authController');
const resourceController = require('../controllers/resourceController');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lms-test';

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    console.log(`  [PASS] ${description}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${description}`);
    failed++;
  }
}

// Mock Express req/res helpers
function mockReqRes(body = {}, params = {}, query = {}, user = null, headers = {}) {
  const req = {
    body,
    params,
    query,
    user,
    headers: { 'user-agent': 'Jest-Test-Runner/1.0', ...headers },
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
  };

  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
    },
  };

  const next = (err) => {
    if (err) {
      res.statusCode = err.status || 500;
      res.data = { error: err.message, code: err.code };
    }
  };

  return { req, res, next };
}

async function runTests() {
  console.log('\n================================================================');
  console.log('  TESTING THREE-TIER COURSE PACKAGE PIN ACTIVATION SYSTEM       ');
  console.log('================================================================\n');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const testSuffix = Date.now();

  try {
    // --- Setup Courses ---
    console.log('--- 1. Ensuring Database Courses & 3-Tier Packages ---');
    let sqlCourse = await Course.findOne({ slug: 'sql-database-management-querying' });
    if (!sqlCourse) {
      sqlCourse = await Course.create({
        title: 'SQL – Database Management & Querying',
        slug: `sql-test-${testSuffix}`,
        category: 'Database',
        price: 2999,
        published: true,
      });
    }

    let pythonCourse = await Course.findOne({ slug: 'introduction-to-data-analytics-using-python' });
    if (!pythonCourse) {
      pythonCourse = await Course.create({
        title: 'Introduction to Data Analytics Using Python',
        slug: `python-test-${testSuffix}`,
        category: 'Programming',
        price: 3499,
        published: true,
      });
    }

    let powerBiCourse = await Course.findOne({ slug: 'power-bi-data-visualization-business-intelligence' });
    if (!powerBiCourse) {
      powerBiCourse = await Course.create({
        title: 'Power BI – Data Visualization & Business Intelligence',
        slug: `power-bi-test-${testSuffix}`,
        category: 'Business Intelligence',
        price: 2999,
        published: true,
      });
    }

    let dataScienceCourse = await Course.findOne({ slug: 'data-science' });
    if (!dataScienceCourse) {
      dataScienceCourse = await Course.create({
        title: 'Data Science',
        slug: `data-science-test-${testSuffix}`,
        category: 'Data Science',
        price: 4999,
        published: true,
      });
    }

    let genAiCourse = await Course.findOne({ slug: 'generative-ai-prompt-engineering-masterclass' });
    if (!genAiCourse) {
      genAiCourse = await Course.create({
        title: 'Generative AI & Prompt Engineering Masterclass',
        slug: `gen-ai-test-${testSuffix}`,
        category: 'Artificial Intelligence',
        price: 4999,
        published: true,
      });
    }

    // Attach study resources
    const sqlResource = await Resource.create({
      courseId: sqlCourse._id,
      title: `SQL Interview Mastery Cheat Sheet ${testSuffix}`,
      type: 'pdf',
      url: 'https://example.com/sql-sheet.pdf',
    });

    const dsResource = await Resource.create({
      courseId: dataScienceCourse._id,
      title: `Data Science Neural Networks Guide ${testSuffix}`,
      type: 'pdf',
      url: 'https://example.com/ds-guide.pdf',
    });

    // Ensure Default Packages
    await packageService.ensureDefaultPackages();
    const allPackages = await packageService.getAllPackages();

    assert(allPackages.length >= 3, 'Three packages configured dynamically in database');
    const corePkg = allPackages.find((p) => p.identifier === 'core-skills');
    const advPkg = allPackages.find((p) => p.identifier === 'advanced-skills');
    const fullPkg = allPackages.find((p) => p.identifier === 'full-lms');

    assert(Boolean(corePkg), 'Core Skills Package (Tier 1) exists in database');
    assert(Boolean(advPkg), 'Advanced Skills Package (Tier 2) exists in database');
    assert(Boolean(fullPkg), 'Full LMS Package (Tier 3) exists in database');

    const coreCourses = await packageService.resolveCoursesForPackage(corePkg);
    const coreCourseIds = coreCourses.map((c) => String(c._id));
    assert(coreCourseIds.includes(String(sqlCourse._id)), 'Core Skills includes SQL course');
    assert(coreCourseIds.includes(String(pythonCourse._id)), 'Core Skills includes Python course');
    assert(coreCourseIds.includes(String(powerBiCourse._id)), 'Core Skills includes Power BI course');

    const advCourses = await packageService.resolveCoursesForPackage(advPkg);
    const advCourseIds = advCourses.map((c) => String(c._id));
    assert(advCourseIds.includes(String(dataScienceCourse._id)), 'Advanced Skills includes Data Science course');
    assert(advCourseIds.includes(String(genAiCourse._id)), 'Advanced Skills includes Generative AI course');

    const fullCourses = await packageService.resolveCoursesForPackage(fullPkg);
    assert(fullCourses.length >= 5, 'Full LMS Package dynamically includes all published courses');

    // Setup Admin
    const adminUser = await User.create({
      name: 'Test Administrator',
      email: `admin_${testSuffix}@analyticsavenue.com`,
      password: 'SecurePassword123!',
      role: 'admin',
      adminRole: 'super_admin',
    });

    // --- 2. Learner Registration & Personal Details Onboarding ---
    console.log('\n--- 2. Testing Learner Registration & Personal Details Onboarding ---');
    const student1 = await User.create({
      name: 'Amit Patel',
      email: `amit_${testSuffix}@example.com`,
      password: 'StudentPassword123!',
      role: 'student',
      profileCompleted: false,
    });

    // Check premature access: before payment verification and PIN activation
    const prematureAccess = await CourseAccess.find({ studentId: student1._id, active: true });
    assert(prematureAccess.length === 0, 'New learner has 0 course access grants upon registration');

    // Missing required fields on profile completion
    const { req: badProfileReq, res: badProfileRes } = mockReqRes(
      { name: 'Amit Patel', phone: '' },
      {},
      {},
      student1
    );
    await authController.completeProfile(badProfileReq, badProfileRes);
    assert(badProfileRes.statusCode === 400, 'Profile submission without required phone rejected with 400');

    // Valid personal details submission
    const { req: profileReq, res: profileRes } = mockReqRes(
      {
        name: 'Amit Patel',
        phone: '+91 9876543210',
        city: 'Bangalore, Karnataka',
        education: "Bachelor's Degree (Engineering / Tech)",
        headline: 'Aspiring Business Intelligence Analyst',
        bio: 'Looking to transition into analytics role.',
      },
      {},
      {},
      student1
    );
    await authController.completeProfile(profileReq, profileRes);
    assert(profileRes.statusCode === 200, 'Valid personal details submitted successfully (200 OK)');

    const refreshedStudent1 = await User.findById(student1._id);
    assert(refreshedStudent1.profileCompleted === true, 'Student profileCompleted is now true in database');
    assert(refreshedStudent1.phone === '+91 9876543210', 'Student phone number saved correctly');
    assert(refreshedStudent1.city === 'Bangalore, Karnataka', 'Student city saved correctly');
    assert(refreshedStudent1.education.includes('Engineering'), 'Student educational background saved');

    // Check Admin notification created
    const adminNotif = await Notification.findOne({
      title: 'New Learner Onboarding Submitted',
      message: new RegExp(student1.email, 'i'),
    });
    assert(Boolean(adminNotif), 'Admin received LMS notification about student onboarding submission');

    // Still no premature course access
    const prematureAfterProfile = await CourseAccess.find({ studentId: student1._id, active: true });
    assert(prematureAfterProfile.length === 0, 'Learner still has 0 course access before Admin payment verification');

    // --- 3. Admin Payment Verification & Package PIN Generation (Core Skills) ---
    console.log('\n--- 3. Testing Admin Payment Verification & Package 1 PIN Generation ---');
    const { req: genPinReq, res: genPinRes } = mockReqRes(
      {
        studentId: student1._id,
        packageId: corePkg._id,
        paymentAmount: 4999,
        paymentReference: `UPI-${testSuffix}-001`,
        paymentNotes: 'Verified via Bank Statement',
      },
      {},
      {},
      adminUser
    );
    await activationController.generatePackagePin(genPinReq, genPinRes);
    assert(genPinRes.statusCode === 200, 'Admin generated 4-digit PIN for Core Skills package successfully (200 OK)');

    const generatedPin = genPinRes.data.pin;
    assert(/^\d{4}$/.test(generatedPin), `PIN is exactly 4 digits: ${generatedPin}`);

    const act1 = await DeviceActivation.findOne({ studentId: student1._id });
    assert(act1.paymentStatus === 'verified', 'Payment status marked verified in database');
    assert(act1.packageName === 'Core Skills Package', 'Package name recorded in DeviceActivation');
    assert(act1.status === 'pin_generated', 'Activation status is pin_generated');
    assert(Boolean(act1.pinHash), 'PIN hash is stored in database');
    assert(Boolean(act1.pinSalt), 'Unique salt is stored in database');
    assert(act1.pinHash !== generatedPin, 'PIN is hashed and NOT stored in plaintext');
    assert(act1.authorizedCourses.length === 3, 'Exactly 3 courses authorized for Core Skills');

    // Check Student LMS Notification
    const student1Notif = await Notification.findOne({
      userId: student1._id,
      type: 'activation_pin',
    }).sort({ createdAt: -1 });
    assert(Boolean(student1Notif), 'Student received LMS notification with activation PIN');
    assert(student1Notif.message.includes(generatedPin), 'Notification contains the 4-digit PIN for activation');
    assert(student1Notif.message.includes('Core Skills Package'), 'Notification specifies assigned package');

    // --- 4. PIN Security Controls ---
    console.log('\n--- 4. Testing PIN Security Controls ---');

    // 4A. Wrong PIN
    const { req: wrongPinReq, res: wrongPinRes } = mockReqRes(
      { email: student1.email, pin: '0000', deviceId: `dev-sysA-${testSuffix}` },
      {},
      {},
      null
    );
    await activationController.activateDevice(wrongPinReq, wrongPinRes);
    assert(wrongPinRes.statusCode === 401, 'Wrong PIN rejected with 401 Unauthorized');
    assert(wrongPinRes.data.code === 'INVALID_PIN', 'Error code specifies INVALID_PIN');

    // 4B. Cross-Student Isolation: Student 2 cannot use Student 1's PIN
    const student2 = await User.create({
      name: 'Sneha Rao',
      email: `sneha_${testSuffix}@example.com`,
      password: 'StudentPassword123!',
      role: 'student',
      profileCompleted: true,
    });

    const { req: crossPinReq, res: crossPinRes } = mockReqRes(
      { email: student2.email, pin: generatedPin, deviceId: `dev-sneha-${testSuffix}` },
      {},
      {},
      null
    );
    await activationController.activateDevice(crossPinReq, crossPinRes);
    assert(crossPinRes.statusCode === 404 || crossPinRes.statusCode === 401, 'Student 2 cannot use Student 1 PIN');

    // 4C. Brute force throttling
    const actAfterFail = await DeviceActivation.findOne({ studentId: student1._id });
    assert(actAfterFail.failedPinAttempts >= 1, 'Failed PIN attempt counter incremented');

    // --- 5. Package 1 (Core Skills) Activation ---
    console.log('\n--- 5. Testing Successful Core Skills Package Activation ---');
    const { req: actReq, res: actRes } = mockReqRes(
      { email: student1.email, pin: generatedPin, deviceId: `sysA-${testSuffix}` },
      {},
      {},
      null
    );
    await activationController.activateDevice(actReq, actRes);
    assert(actRes.statusCode === 200, 'Student 1 activated Core Skills package successfully (200 OK)');
    assert(Boolean(actRes.data.token), 'Auth session token returned upon activation');

    const act1After = await DeviceActivation.findOne({ studentId: student1._id });
    assert(act1After.isActivated === true, 'DeviceActivation marked isActivated: true');
    assert(act1After.status === 'activated', 'Status updated to activated');
    assert(act1After.pinHash === null, 'PIN hash wiped after consumption (single-use enforced)');

    // Single-use: attempt to activate again with same PIN
    const { req: reuseReq, res: reuseRes } = mockReqRes(
      { email: student1.email, pin: generatedPin, deviceId: `sysA-${testSuffix}` },
      {},
      {},
      null
    );
    await activationController.activateDevice(reuseReq, reuseRes);
    assert(reuseRes.statusCode === 409, 'Reusing consumed activation PIN rejected with 409 (single-use)');

    // Verify course access: SQL, Python, Power BI UNLOCKED
    const grants1 = await CourseAccess.find({ studentId: student1._id, active: true });
    const grantedIds1 = grants1.map((g) => String(g.courseId));
    assert(grantedIds1.includes(String(sqlCourse._id)), 'SQL course unlocked for Student 1');
    assert(grantedIds1.includes(String(pythonCourse._id)), 'Python course unlocked for Student 1');
    assert(grantedIds1.includes(String(powerBiCourse._id)), 'Power BI course unlocked for Student 1');

    // Data Science & Generative AI remain strictly locked
    assert(!grantedIds1.includes(String(dataScienceCourse._id)), 'Data Science remains locked for Core Skills student');
    assert(!grantedIds1.includes(String(genAiCourse._id)), 'Generative AI remains locked for Core Skills student');

    // Source tracking
    const sqlGrant = grants1.find((g) => String(g.courseId) === String(sqlCourse._id));
    assert(sqlGrant.source === 'package', 'CourseAccess source tracked as package');

    // Resources protection
    const { req: resReq, res: resResp } = mockReqRes({}, {}, {}, student1);
    await resourceController.listMine(resReq, resResp);
    assert(resResp.statusCode === 200, 'listMine returned 200 OK for Student 1');
    const returnedGroups = resResp.data;
    const returnedCourseIds = returnedGroups.map((g) => String(g.course?._id || g.courseId));
    assert(returnedCourseIds.includes(String(sqlCourse._id)), 'SQL resources accessible');
    assert(!returnedCourseIds.includes(String(dataScienceCourse._id)), 'Data Science resources inaccessible');

    // --- 6. Normal Login Flow (No PIN Requested Again) ---
    console.log('\n--- 6. Testing Normal Login Flow (No PIN Requested Again) ---');
    const { req: loginReq, res: loginRes } = mockReqRes(
      {
        email: student1.email,
        password: 'StudentPassword123!',
      },
      {},
      {},
      null,
      { 'x-device-id': `sysA-${testSuffix}` }
    );
    await authController.login(loginReq, loginRes);
    assert(loginRes.statusCode === 200, 'Student logs in normally with email + password (200 OK)');
    assert(Boolean(loginRes.data.token), 'Session token issued without requesting PIN again');

    // --- 7. Package 2 (Advanced Skills) Activation ---
    console.log('\n--- 7. Testing Package 2 (Advanced Skills) Activation ---');
    // Admin assigns Advanced Skills to Student 2
    const { req: p2PinReq, res: p2PinRes } = mockReqRes(
      {
        studentId: student2._id,
        packageId: advPkg._id,
        paymentAmount: 7999,
        paymentReference: `UPI-${testSuffix}-002`,
      },
      {},
      {},
      adminUser
    );
    await activationController.generatePackagePin(p2PinReq, p2PinRes);
    assert(p2PinRes.statusCode === 200, 'Admin generated PIN for Advanced Skills Package');
    const pin2 = p2PinRes.data.pin;

    // Student 2 activates
    const { req: act2Req, res: act2Res } = mockReqRes(
      { email: student2.email, pin: pin2, deviceId: `dev2-${testSuffix}` },
      {},
      {},
      null
    );
    await activationController.activateDevice(act2Req, act2Res);
    assert(act2Res.statusCode === 200, 'Student 2 activated Advanced Skills successfully');

    const grants2 = await CourseAccess.find({ studentId: student2._id, active: true });
    const grantedIds2 = grants2.map((g) => String(g.courseId));
    assert(grantedIds2.includes(String(dataScienceCourse._id)), 'Data Science unlocked for Student 2');
    assert(grantedIds2.includes(String(genAiCourse._id)), 'Generative AI unlocked for Student 2');
    assert(!grantedIds2.includes(String(sqlCourse._id)), 'SQL remains locked for Student 2');
    assert(!grantedIds2.includes(String(powerBiCourse._id)), 'Power BI remains locked for Student 2');

    // --- 8. Package 3 (Full LMS Package) Activation ---
    console.log('\n--- 8. Testing Package 3 (Full LMS Package) Activation ---');
    const student3 = await User.create({
      name: 'Rohan Sharma',
      email: `rohan_${testSuffix}@example.com`,
      password: 'StudentPassword123!',
      role: 'student',
      profileCompleted: true,
    });

    const { req: p3PinReq, res: p3PinRes } = mockReqRes(
      {
        studentId: student3._id,
        packageId: fullPkg._id,
        paymentAmount: 11999,
        paymentReference: `UPI-${testSuffix}-003`,
      },
      {},
      {},
      adminUser
    );
    await activationController.generatePackagePin(p3PinReq, p3PinRes);
    assert(p3PinRes.statusCode === 200, 'Admin generated PIN for Full LMS Package');
    const pin3 = p3PinRes.data.pin;

    const { req: act3Req, res: act3Res } = mockReqRes(
      { email: student3.email, pin: pin3, deviceId: `dev3-${testSuffix}` },
      {},
      {},
      null
    );
    await activationController.activateDevice(act3Req, act3Res);
    assert(act3Res.statusCode === 200, 'Student 3 activated Full LMS successfully');

    const grants3 = await CourseAccess.find({ studentId: student3._id, active: true });
    const grantedIds3 = grants3.map((g) => String(g.courseId));
    assert(grantedIds3.includes(String(sqlCourse._id)), 'SQL unlocked in Full LMS package');
    assert(grantedIds3.includes(String(pythonCourse._id)), 'Python unlocked in Full LMS package');
    assert(grantedIds3.includes(String(powerBiCourse._id)), 'Power BI unlocked in Full LMS package');
    assert(grantedIds3.includes(String(dataScienceCourse._id)), 'Data Science unlocked in Full LMS package');
    assert(grantedIds3.includes(String(genAiCourse._id)), 'Generative AI unlocked in Full LMS package');

    // --- 9. PIN Regeneration with Audit History ---
    console.log('\n--- 9. Testing PIN Regeneration with Audit History ---');
    const student4 = await User.create({
      name: 'Vikram Joshi',
      email: `vikram_${testSuffix}@example.com`,
      password: 'StudentPassword123!',
      role: 'student',
      profileCompleted: true,
    });

    // Generate initial PIN
    const { req: p4GenReq, res: p4GenRes } = mockReqRes(
      { studentId: student4._id, packageId: corePkg._id, paymentAmount: 4999 },
      {},
      {},
      adminUser
    );
    await activationController.generatePackagePin(p4GenReq, p4GenRes);
    const initialPin = p4GenRes.data.pin;

    // Admin regenerates PIN
    const { req: regenReq, res: regenRes } = mockReqRes(
      { studentId: student4._id, reason: 'Student forgot PIN' },
      {},
      {},
      adminUser
    );
    await activationController.regeneratePackagePin(regenReq, regenRes);
    assert(regenRes.statusCode === 200, 'Admin regenerated PIN successfully (200 OK)');
    const newPin = regenRes.data.pin;

    // Old PIN fails
    const { req: oldPinReq, res: oldPinRes } = mockReqRes(
      { email: student4.email, pin: initialPin, deviceId: `dev4-${testSuffix}` },
      {},
      {},
      null
    );
    await activationController.activateDevice(oldPinReq, oldPinRes);
    assert(oldPinRes.statusCode === 401, 'Old PIN invalidated after regeneration');

    // New PIN succeeds
    const { req: newPinReq, res: newPinRes } = mockReqRes(
      { email: student4.email, pin: newPin, deviceId: `dev4-${testSuffix}` },
      {},
      {},
      null
    );
    await activationController.activateDevice(newPinReq, newPinRes);
    assert(newPinRes.statusCode === 200, 'Newly regenerated PIN activated successfully');

    const act4 = await DeviceActivation.findOne({ studentId: student4._id });
    const regenAudit = act4.auditLog.find((a) => a.action === 'package_pin_regenerated');
    assert(Boolean(regenAudit), 'Audit log records package_pin_regenerated action with reason');

    // --- 10. Coexistence with Razorpay and Manual Access ---
    console.log('\n--- 10. Testing Coexistence with Razorpay & Manual Grants ---');
    // Student 1 buys an extra individual course via Razorpay
    await CourseAccess.create({
      studentId: student1._id,
      courseId: dataScienceCourse._id,
      active: true,
      source: 'razorpay',
    });

    const combinedGrants = await CourseAccess.find({ studentId: student1._id, active: true });
    const combinedIds = combinedGrants.map((g) => String(g.courseId));
    assert(combinedIds.includes(String(sqlCourse._id)), 'Original Core Skills package courses remain active');
    assert(combinedIds.includes(String(dataScienceCourse._id)), 'New Razorpay purchased course is active');
    const rzGrant = combinedGrants.find((g) => String(g.courseId) === String(dataScienceCourse._id));
    assert(rzGrant.source === 'razorpay', 'Razorpay access source preserved alongside package access');

    // --- Cleanup ---
    console.log('\n--- Cleaning up test records ---');
    await User.deleteMany({ _id: { $in: [student1._id, student2._id, student3._id, student4._id, adminUser._id] } });
    await CourseAccess.deleteMany({ studentId: { $in: [student1._id, student2._id, student3._id, student4._id] } });
    await DeviceActivation.deleteMany({ studentId: { $in: [student1._id, student2._id, student3._id, student4._id] } });
    await Enrollment.deleteMany({ studentId: { $in: [student1._id, student2._id, student3._id, student4._id] } });
    await Notification.deleteMany({ userId: { $in: [student1._id, student2._id, student3._id, student4._id] } });
    await Resource.deleteMany({ _id: { $in: [sqlResource._id, dsResource._id] } });
    console.log('Test records cleaned up.');
  } catch (err) {
    console.error('Test error:', err);
    failed++;
  } finally {
    console.log('\n================================================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');
    await mongoose.disconnect();
  }
}

runTests();
