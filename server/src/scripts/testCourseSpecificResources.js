/**
 * Automated Verification Script for:
 * Analytics Avenue LMS - Course-Specific Resource Visibility & Access Control
 *
 * Verifies:
 * 1. Student with 1 course sees only that course's resources
 * 2. Student with multiple courses sees only those courses' resources
 * 3. Automatic Razorpay access unlocks resources dynamically
 * 4. Manual Admin authorization unlocks resources dynamically
 * 5. Unauthorized direct API access (/courses/:courseId/resources & /resources/:id) is rejected with 403
 * 6. Admin resource management (Add, Edit, Remove) persists correctly
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Resource = require('../models/Resource');
const Enrollment = require('../models/Enrollment');
const CourseAccess = require('../models/CourseAccess');
const DeviceActivation = require('../models/DeviceActivation');
const resourceController = require('../controllers/resourceController');
const adminController = require('../controllers/adminController');
const { grantCourseAccess, markPaymentSuccessful } = require('../services/enrolmentService');
const settingsService = require('../services/settingsService');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failCount++;
  }
}

function mockRes() {
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
  console.log('================================================================');
  console.log('  TESTING COURSE-SPECIFIC RESOURCE VISIBILITY & ACCESS CONTROL  ');
  console.log('================================================================\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lms-test';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.\n');

  const testStamp = Date.now();

  try {
    // -----------------------------------------------------------------
    // 1. SETUP COURSES & RESOURCES
    // -----------------------------------------------------------------
    const courseSQL = await Course.create({
      title: `SQL Mastery ${testStamp}`,
      slug: `sql-mastery-${testStamp}`,
      price: 1999,
      published: true,
    });

    const coursePython = await Course.create({
      title: `Python for Data Science ${testStamp}`,
      slug: `python-data-science-${testStamp}`,
      price: 2499,
      published: true,
    });

    const coursePowerBI = await Course.create({
      title: `Power BI Dashboarding ${testStamp}`,
      slug: `power-bi-dashboarding-${testStamp}`,
      price: 2999,
      published: true,
    });

    // Resources under SQL
    const resSQL1 = await Resource.create({
      courseId: courseSQL._id,
      title: 'SQL Interview Questions & Answers',
      description: 'Top 50 SQL queries asked in interviews',
      url: 'https://example.com/resources/sql-interview-questions.pdf',
      type: 'pdf',
    });

    const resSQL2 = await Resource.create({
      courseId: courseSQL._id,
      title: 'SQL Practice Dataset & Schema',
      description: 'Sample e-commerce database script',
      url: 'https://example.com/resources/sql-practice-schema.sql',
      type: 'doc',
    });

    // Resources under Python
    const resPython1 = await Resource.create({
      courseId: coursePython._id,
      title: 'Python Pandas & NumPy Cheatsheet',
      description: 'Comprehensive Python data structures guide',
      url: 'https://example.com/resources/python-pandas-cheatsheet.pdf',
      type: 'pdf',
    });

    // Resources under Power BI
    const resPowerBI1 = await Resource.create({
      courseId: coursePowerBI._id,
      title: 'Power BI DAX Functions Guide',
      description: 'Advanced measures and calculated columns',
      url: 'https://example.com/resources/powerbi-dax-guide.pdf',
      type: 'pdf',
    });

    console.log('--- 1. Courses and Resources Setup Ready ---');
    console.log(`  Course SQL: ${courseSQL.title} (${resSQL1.title}, ${resSQL2.title})`);
    console.log(`  Course Python: ${coursePython.title} (${resPython1.title})`);
    console.log(`  Course Power BI: ${coursePowerBI.title} (${resPowerBI1.title})\n`);

    // -----------------------------------------------------------------
    // 2. SETUP STUDENTS
    // -----------------------------------------------------------------
    // Student A: Access ONLY to SQL
    const studentA = await User.create({
      name: `Student A ${testStamp}`,
      email: `studentA_${testStamp}@example.com`,
      password: 'Password123!',
      role: 'student',
    });

    // Student B: Access to SQL AND Python
    const studentB = await User.create({
      name: `Student B ${testStamp}`,
      email: `studentB_${testStamp}@example.com`,
      password: 'Password123!',
      role: 'student',
    });

    // Student C: Starts with 0 courses, will test dynamic Razorpay & Admin grant
    const studentC = await User.create({
      name: `Student C ${testStamp}`,
      email: `studentC_${testStamp}@example.com`,
      password: 'Password123!',
      role: 'student',
    });

    // Admin user for management tests
    const adminUser = await User.create({
      name: `Admin Manager ${testStamp}`,
      email: `admin_res_${testStamp}@example.com`,
      password: 'AdminPassword123!',
      role: 'admin',
      adminRole: 'super_admin',
    });

    // Setup active device activations for students
    await DeviceActivation.create({
      studentId: studentA._id,
      email: studentA.email,
      status: 'activated',
      isActivated: true,
      paymentStatus: 'verified',
      authorizedCourses: [courseSQL._id],
    });
    await grantCourseAccess(studentA._id, courseSQL, { source: 'manual' });

    await DeviceActivation.create({
      studentId: studentB._id,
      email: studentB.email,
      status: 'activated',
      isActivated: true,
      paymentStatus: 'verified',
      authorizedCourses: [courseSQL._id, coursePython._id],
    });
    await grantCourseAccess(studentB._id, courseSQL, { source: 'manual' });
    await grantCourseAccess(studentB._id, coursePython, { source: 'manual' });

    await DeviceActivation.create({
      studentId: studentC._id,
      email: studentC.email,
      status: 'activated',
      isActivated: true,
      paymentStatus: 'verified',
      authorizedCourses: [],
    });

    // -----------------------------------------------------------------
    // TEST 1: STUDENT WITH ONE COURSE (STUDENT A)
    // -----------------------------------------------------------------
    console.log('--- 2. Testing Student With One Course (Student A -> SQL only) ---');
    {
      const req = { user: studentA };
      const res = mockRes();
      await resourceController.listMine(req, res, () => {});

      assert(res.statusCode === 200, 'listMine returned 200 OK');
      assert(Array.isArray(res.data), 'listMine returned array of course groups');
      assert(res.data.length === 1, 'Student A sees exactly 1 course group (SQL)');
      assert(res.data[0].course._id.toString() === courseSQL._id.toString(), 'Group belongs to SQL Mastery');
      assert(res.data[0].resources.length === 2, 'Student A sees both SQL resources');

      const resourceTitles = res.data[0].resources.map((r) => r.title);
      assert(resourceTitles.includes(resSQL1.title), 'SQL Interview Questions is visible');
      assert(resourceTitles.includes(resSQL2.title), 'SQL Practice Dataset is visible');

      // Verify unauthorized courses are completely absent
      const courseTitles = res.data.map((g) => g.course.title);
      assert(!courseTitles.includes(coursePython.title), 'Python resources are NOT visible to Student A');
      assert(!courseTitles.includes(coursePowerBI.title), 'Power BI resources are NOT visible to Student A');
    }

    // -----------------------------------------------------------------
    // TEST 2: STUDENT WITH MULTIPLE COURSES (STUDENT B)
    // -----------------------------------------------------------------
    console.log('\n--- 3. Testing Student With Multiple Courses (Student B -> SQL + Python) ---');
    {
      const req = { user: studentB };
      const res = mockRes();
      await resourceController.listMine(req, res, () => {});

      assert(res.statusCode === 200, 'listMine returned 200 OK');
      assert(res.data.length === 2, 'Student B sees exactly 2 course groups (SQL & Python)');

      const groupCourseIds = res.data.map((g) => g.course._id.toString());
      assert(groupCourseIds.includes(courseSQL._id.toString()), 'SQL group is visible to Student B');
      assert(groupCourseIds.includes(coursePython._id.toString()), 'Python group is visible to Student B');
      assert(!groupCourseIds.includes(coursePowerBI._id.toString()), 'Power BI group is NOT visible to Student B');

      const allResources = res.data.flatMap((g) => g.resources);
      const allTitles = allResources.map((r) => r.title);
      assert(allTitles.includes(resSQL1.title), 'SQL resource 1 is present');
      assert(allTitles.includes(resPython1.title), 'Python resource is present');
      assert(!allTitles.includes(resPowerBI1.title), 'Power BI DAX Guide is strictly absent');
    }

    // -----------------------------------------------------------------
    // TEST 3: AUTOMATIC RAZORPAY ACCESS UNLOCKS RESOURCES DYNAMICALLY
    // -----------------------------------------------------------------
    console.log('\n--- 4. Testing Automatic Razorpay Access Dynamic Resource Grant ---');
    {
      // Before purchase, Student C has 0 authorized courses
      const reqBefore = { user: studentC };
      const resBefore = mockRes();
      await resourceController.listMine(reqBefore, resBefore, () => {});
      assert(resBefore.data.length === 0, 'Student C initially has 0 visible course resources');

      // Student C purchases SQL course via Razorpay checkout
      const enrollment = new Enrollment({
        studentId: studentC._id,
        courseId: courseSQL._id,
        amount: 1999,
        currency: 'INR',
        gateway: 'razorpay',
        method: 'razorpay',
        status: 'pending',
        transactionId: `TXN_RZP_${testStamp}`,
      });
      await enrollment.save();

      // Backend marks payment successful
      await markPaymentSuccessful(enrollment, { reference: `PAY_RZP_${testStamp}` });

      // Re-query listMine for Student C
      const reqAfter = { user: studentC };
      const resAfter = mockRes();
      await resourceController.listMine(reqAfter, resAfter, () => {});

      assert(resAfter.data.length === 1, 'Student C now has exactly 1 course group after Razorpay verification');
      assert(resAfter.data[0].course._id.toString() === courseSQL._id.toString(), 'Purchased SQL resources dynamically visible');
      assert(resAfter.data[0].resources.length === 2, 'All SQL study materials accessible after purchase');

      // Non-purchased courses remain strictly locked
      const courseIds = resAfter.data.map((g) => g.course._id.toString());
      assert(!courseIds.includes(coursePython._id.toString()), 'Python remains inaccessible after SQL purchase');
      assert(!courseIds.includes(coursePowerBI._id.toString()), 'Power BI remains inaccessible');
    }

    // -----------------------------------------------------------------
    // TEST 4: MANUAL ADMIN AUTHORIZATION UNLOCKS RESOURCES DYNAMICALLY
    // -----------------------------------------------------------------
    console.log('\n--- 5. Testing Manual Admin Authorization Dynamic Resource Grant ---');
    {
      // Admin manually authorizes Python for Student C
      await grantCourseAccess(studentC._id, coursePython, { by: adminUser._id, source: 'manual' });

      // Update DeviceActivation.authorizedCourses to simulate admin sync
      await DeviceActivation.updateOne(
        { studentId: studentC._id },
        { $addToSet: { authorizedCourses: coursePython._id } }
      );

      const req = { user: studentC };
      const res = mockRes();
      await resourceController.listMine(req, res, () => {});

      assert(res.data.length === 2, 'Student C now has 2 course groups (SQL via Razorpay + Python via Admin)');
      const groupCourseIds = res.data.map((g) => g.course._id.toString());
      assert(groupCourseIds.includes(courseSQL._id.toString()), 'Razorpay SQL access preserved');
      assert(groupCourseIds.includes(coursePython._id.toString()), 'Manual Admin Python access dynamically active');
      assert(!groupCourseIds.includes(coursePowerBI._id.toString()), 'Power BI remains strictly inaccessible');
    }

    // -----------------------------------------------------------------
    // TEST 5: UNAUTHORIZED API ACCESS PREVENTION
    // -----------------------------------------------------------------
    console.log('\n--- 6. Testing Unauthorized Direct API Access Enforcement ---');
    {
      // 5A. Direct request to /courses/:courseId/resources for unauthorized course (Power BI by Student A)
      const reqUnauthCourse = {
        user: studentA,
        params: { courseId: coursePowerBI._id.toString() },
      };
      const resUnauthCourse = mockRes();
      await resourceController.listResourcesForCourse(reqUnauthCourse, resUnauthCourse, () => {});

      assert(resUnauthCourse.statusCode === 403, 'Direct access to unauthorized course resources rejected with 403 Forbidden');
      assert(
        resUnauthCourse.data?.code === 'COURSE_ACCESS_REQUIRED' || resUnauthCourse.data?.error?.includes('access'),
        'Error code explains course access is required'
      );

      // 5B. Direct request to /courses/:courseId/resources for authorized course (SQL by Student A)
      const reqAuthCourse = {
        user: studentA,
        params: { courseId: courseSQL._id.toString() },
      };
      const resAuthCourse = mockRes();
      await resourceController.listResourcesForCourse(reqAuthCourse, resAuthCourse, () => {});

      assert(resAuthCourse.statusCode === 200, 'Direct access to authorized course resources succeeded (200 OK)');
      assert(resAuthCourse.data.length === 2, 'Returned all resources for authorized course');

      // 5C. ID Manipulation on /resources/:id for unauthorized resource (Power BI DAX guide by Student A)
      const reqManipulateId = {
        user: studentA,
        params: { id: resPowerBI1._id.toString() },
      };
      const resManipulateId = mockRes();
      await resourceController.getResourceById(reqManipulateId, resManipulateId, () => {});

      assert(resManipulateId.statusCode === 403, 'Manipulating resource ID to access restricted resource rejected with 403 Forbidden');
      assert(resManipulateId.data?.code === 'COURSE_ACCESS_REQUIRED', 'Error code specifies COURSE_ACCESS_REQUIRED');

      // 5D. Direct request on /resources/:id for authorized resource (SQL resource by Student A)
      const reqAuthId = {
        user: studentA,
        params: { id: resSQL1._id.toString() },
      };
      const resAuthId = mockRes();
      await resourceController.getResourceById(reqAuthId, resAuthId, () => {});

      assert(resAuthId.statusCode === 200, 'Direct request for authorized resource succeeded (200 OK)');
      assert(resAuthId.data.title === resSQL1.title, 'Authorized resource title returned');
      assert(resAuthId.data.url === resSQL1.url, 'Authorized resource link returned');
    }

    // -----------------------------------------------------------------
    // TEST 6: ADMIN RESOURCE MANAGEMENT PERSISTENCE
    // -----------------------------------------------------------------
    console.log('\n--- 7. Testing Admin Resource Management ---');
    {
      // 6A. Admin adds a new resource to SQL
      const reqAdd = {
        user: adminUser,
        body: {
          courseId: courseSQL._id.toString(),
          title: 'SQL Performance Tuning Cheatsheet',
          description: 'Indexes and execution plans',
          url: 'https://example.com/resources/sql-tuning.pdf',
          type: 'pdf',
        },
      };
      const resAdd = mockRes();
      await adminController.addResource(reqAdd, resAdd, () => {});

      assert(resAdd.statusCode === 201, 'Admin added resource successfully (201 Created)');
      const newResourceId = resAdd.data.id || resAdd.data._id;
      assert(resAdd.data.title === 'SQL Performance Tuning Cheatsheet', 'Resource title matches');

      // Verify Student A sees the new resource immediately
      const reqCheck = { user: studentA };
      const resCheck = mockRes();
      await resourceController.listMine(reqCheck, resCheck, () => {});
      const sqlGroup = resCheck.data.find((g) => g.course._id.toString() === courseSQL._id.toString());
      assert(sqlGroup.resources.length === 3, 'Student A sees 3 SQL resources after admin addition');

      // 6B. Admin edits the resource
      const reqEdit = {
        user: adminUser,
        params: { id: newResourceId.toString() },
        body: {
          title: 'SQL Performance & Indexing Guide (Updated)',
          description: 'Updated comprehensive indexing guide',
          type: 'pdf',
        },
      };
      const resEdit = mockRes();
      await adminController.updateResource(reqEdit, resEdit, () => {});

      assert(resEdit.statusCode === 200, 'Admin updated resource successfully (200 OK)');
      assert(resEdit.data.title === 'SQL Performance & Indexing Guide (Updated)', 'Title updated in database');

      // 6C. Admin deletes the resource
      const reqDelete = {
        user: adminUser,
        params: { id: newResourceId.toString() },
      };
      const resDelete = mockRes();
      await adminController.deleteResource(reqDelete, resDelete, () => {});

      assert(resDelete.statusCode === 200, 'Admin deleted resource successfully (200 OK)');

      // Verify Student A's count is back to 2
      const reqAfterDelete = { user: studentA };
      const resAfterDelete = mockRes();
      await resourceController.listMine(reqAfterDelete, resAfterDelete, () => {});
      const sqlGroupAfter = resAfterDelete.data.find((g) => g.course._id.toString() === courseSQL._id.toString());
      assert(sqlGroupAfter.resources.length === 2, 'Student A sees 2 SQL resources after admin deletion');
    }

    // -----------------------------------------------------------------
    // CLEANUP
    // -----------------------------------------------------------------
    console.log('\n--- Cleaning up test records ---');
    await Promise.all([
      User.deleteMany({ _id: { $in: [studentA._id, studentB._id, studentC._id, adminUser._id] } }),
      Course.deleteMany({ _id: { $in: [courseSQL._id, coursePython._id, coursePowerBI._id] } }),
      Resource.deleteMany({ courseId: { $in: [courseSQL._id, coursePython._id, coursePowerBI._id] } }),
      Enrollment.deleteMany({ studentId: { $in: [studentA._id, studentB._id, studentC._id] } }),
      CourseAccess.deleteMany({ studentId: { $in: [studentA._id, studentB._id, studentC._id] } }),
      DeviceActivation.deleteMany({ studentId: { $in: [studentA._id, studentB._id, studentC._id] } }),
    ]);
    console.log('Test records cleaned up.\n');

  } catch (err) {
    console.error('Fatal test error:', err);
    failCount++;
  } finally {
    await mongoose.disconnect();
    console.log('================================================================');
    console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('================================================================');
    process.exit(failCount > 0 ? 1 : 0);
  }
}

runTests();
