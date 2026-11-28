/**
 * Automated Verification Script for:
 * 1. Admin Learner Account Deletion & Safe Data Retention
 * 2. Course Video Management (Add, Edit, Replace Video, Remove, Reorder, Resequence)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Progress = require('../models/Progress');
const CourseAccess = require('../models/CourseAccess');
const DeviceActivation = require('../models/DeviceActivation');
const Enrollment = require('../models/Enrollment');
const Certificate = require('../models/Certificate');
const ResourceAccess = require('../models/ResourceAccess');
const Notification = require('../models/Notification');
const driveService = require('../services/googleDriveService');

// Mock driveService.getVideoMetadata to return realistic metadata for tests
const originalGetVideoMetadata = driveService.getVideoMetadata;
driveService.getVideoMetadata = async (fileId) => {
  if (fileId === 'drive_test_file_1') {
    return {
      id: 'drive_test_file_1',
      name: 'Lesson 1 Video.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 600,
      webViewLink: 'https://drive.google.com/file/d/drive_test_file_1/view',
      folderId: 'folder_mod_1',
      folderName: 'Module 1: Introduction',
      canDownload: true,
    };
  }
  if (fileId === 'drive_test_file_2') {
    return {
      id: 'drive_test_file_2',
      name: 'Lesson 2 Video.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 1200,
      webViewLink: 'https://drive.google.com/file/d/drive_test_file_2/view',
      folderId: 'folder_mod_1',
      folderName: 'Module 1: Introduction',
      canDownload: true,
    };
  }
  if (fileId === 'drive_test_file_3') {
    return {
      id: 'drive_test_file_3',
      name: 'Lesson 3 Video.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 900,
      webViewLink: 'https://drive.google.com/file/d/drive_test_file_3/view',
      folderId: 'folder_mod_2',
      folderName: 'Module 2: Advanced Topics',
      canDownload: true,
    };
  }
  if (fileId === 'drive_replaced_file') {
    return {
      id: 'drive_replaced_file',
      name: 'Lesson 2 Replaced High Quality.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 1500,
      webViewLink: 'https://drive.google.com/file/d/drive_replaced_file/view',
      folderId: 'folder_mod_1',
      folderName: 'Module 1: Introduction',
      canDownload: true,
    };
  }
  return {
    id: fileId,
    name: 'Generic Video.mp4',
    mimeType: 'video/mp4',
    durationSeconds: 300,
    webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
    canDownload: true,
  };
};

const learnerController = require('../controllers/learnerController');
const adminController = require('../controllers/adminController');

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
  console.log('  TESTING LEARNER DELETION & COURSE VIDEO MANAGEMENT');
  console.log('================================================================\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/lms-test';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.\n');

  const testStamp = Date.now();

  try {
    // -----------------------------------------------------------------
    // SETUP TEST ACTORS
    // -----------------------------------------------------------------
    const adminUser = await User.create({
      name: `Test SuperAdmin ${testStamp}`,
      email: `admin_${testStamp}@example.com`,
      password: 'AdminPassword123!',
      role: 'admin',
      adminRole: 'super_admin',
    });

    const otherAdmin = await User.create({
      name: `Other Admin ${testStamp}`,
      email: `other_admin_${testStamp}@example.com`,
      password: 'AdminPassword123!',
      role: 'admin',
    });

    const unpaidStudent = await User.create({
      name: `Unpaid Student ${testStamp}`,
      email: `unpaid_${testStamp}@example.com`,
      password: 'Password123!',
      role: 'student',
      status: 'active',
    });

    const paidStudent = await User.create({
      name: `Paid Student ${testStamp}`,
      email: `paid_${testStamp}@example.com`,
      password: 'Password123!',
      role: 'student',
      status: 'active',
    });

    const testCourse = await Course.create({
      title: `Test Video Mgmt Course ${testStamp}`,
      slug: `video-mgmt-course-${testStamp}`,
      price: 2499,
      published: true,
    });

    // -----------------------------------------------------------------
    // PART 1: LEARNER DELETION TESTS
    // -----------------------------------------------------------------
    console.log('--- 1. Testing Learner Account Deletion Safeguards ---');

    // 1A. Self-deletion prevention
    {
      const req = { user: adminUser, params: { id: adminUser._id.toString() } };
      const res = mockRes();
      await learnerController.deleteLearner(req, res, () => {});
      assert(res.statusCode === 400, 'Self-deletion rejected with 400 Bad Request');
      assert(res.data?.error?.includes('own admin account'), 'Error explains self-deletion is forbidden');
    }

    // 1B. Admin deletion prevention through learner interface
    {
      const req = { user: adminUser, params: { id: otherAdmin._id.toString() } };
      const res = mockRes();
      await learnerController.deleteLearner(req, res, () => {});
      assert(res.statusCode === 403, 'Admin deletion rejected with 403 Forbidden');
      assert(res.data?.error?.includes('Admin accounts cannot be deleted'), 'Error explains admins cannot be deleted via learner interface');
    }

    // 1C. Non-existent learner
    {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const req = { user: adminUser, params: { id: fakeId } };
      const res = mockRes();
      await learnerController.deleteLearner(req, res, () => {});
      assert(res.statusCode === 404, 'Non-existent learner deletion returns 404 Not Found');
    }

    // 1D. Unpaid Student Deletion (Zero financial history)
    console.log('\n--- 2. Testing Unpaid Student Deletion (Clean Removal) ---');
    {
      // Attach related non-financial records
      await CourseAccess.create({ studentId: unpaidStudent._id, courseId: testCourse._id, active: true });
      await DeviceActivation.create({
        studentId: unpaidStudent._id,
        email: unpaidStudent.email,
        status: 'course_authorized',
        isActivated: false,
        paymentStatus: 'pending',
      });
      await Notification.create({
        userId: unpaidStudent._id,
        type: 'announcement',
        title: 'Welcome',
        message: 'Welcome to LMS',
      });

      const req = { user: adminUser, params: { id: unpaidStudent._id.toString() } };
      const res = mockRes();
      await learnerController.deleteLearner(req, res, () => {});

      assert(res.statusCode === 200, 'Unpaid learner deleted successfully (200 OK)');
      assert(res.data?.preservedFinancialRecords === false, 'Zero financial records to preserve (clean removal)');

      // Verify User document is deleted
      const userCheck = await User.findById(unpaidStudent._id);
      assert(!userCheck, 'Unpaid User document removed from database');

      // Verify related records cleaned up
      const accessCheck = await CourseAccess.findOne({ studentId: unpaidStudent._id });
      assert(!accessCheck, 'CourseAccess records deleted');

      const activationCheck = await DeviceActivation.findOne({ studentId: unpaidStudent._id });
      assert(!activationCheck, 'DeviceActivation records deleted');

      const notifCheck = await Notification.findOne({ userId: unpaidStudent._id });
      assert(!notifCheck, 'Notification records deleted');
    }

    // 1E. Paid Student Deletion (Financial & Audit Records Preserved + User Anonymized)
    console.log('\n--- 3. Testing Paid Student Deletion (Financial Retention & Anonymization) ---');
    {
      // Create paid enrollment, certificate, and device activation
      const paidEnrollment = await Enrollment.create({
        studentId: paidStudent._id,
        courseId: testCourse._id,
        amount: 2499,
        currency: 'INR',
        status: 'completed',
        gateway: 'razorpay',
        transactionId: `TXN_TEST_${testStamp}`,
      });

      const certificate = await Certificate.create({
        userId: paidStudent._id,
        courseId: testCourse._id,
        serial: `CERT_${testStamp}`,
        recipientName: paidStudent.name,
        courseTitle: testCourse.title,
      });

      await CourseAccess.create({ studentId: paidStudent._id, courseId: testCourse._id, active: true });
      await DeviceActivation.create({
        studentId: paidStudent._id,
        email: paidStudent.email,
        status: 'activated',
        isActivated: true,
        paymentStatus: 'verified',
        authorizedCourses: [testCourse._id],
      });

      const req = { user: adminUser, params: { id: paidStudent._id.toString() } };
      const res = mockRes();
      await learnerController.deleteLearner(req, res, () => {});

      assert(res.statusCode === 200, 'Paid learner deletion returned 200 OK');
      assert(res.data?.preservedFinancialRecords === true, 'Flag indicates financial records were preserved for audit compliance');

      // Verify Enrollment remains intact for financial reporting
      const enrollCheck = await Enrollment.findById(paidEnrollment._id);
      assert(Boolean(enrollCheck), 'Paid Enrollment record is preserved');
      assert(enrollCheck.amount === 2499, 'Payment amount intact for revenue reports');
      assert(enrollCheck.transactionId === `TXN_TEST_${testStamp}`, 'Razorpay transaction reference preserved');
      assert(
        enrollCheck.history.some((h) => h.note.includes('Learner account deleted')),
        'Enrollment history records account deletion audit trail'
      );

      // Verify Certificate is preserved
      const certCheck = await Certificate.findById(certificate._id);
      assert(Boolean(certCheck), 'Certificate record is preserved');

      // Verify active access is revoked
      const accessCheck = await CourseAccess.findOne({ studentId: paidStudent._id });
      assert(!accessCheck, 'CourseAccess records cleared');

      const activationCheck = await DeviceActivation.findOne({ studentId: paidStudent._id });
      assert(!activationCheck, 'DeviceActivation records cleared');

      // Verify User document is anonymized and deactivated
      const userCheck = await User.findById(paidStudent._id);
      assert(Boolean(userCheck), 'User document exists for foreign-key audit references');
      assert(userCheck.status === 'deleted', 'User status set to "deleted"');
      assert(userCheck.name === 'Deleted Learner', 'Personal name anonymized to "Deleted Learner"');
      assert(userCheck.email.includes('deleted_'), 'Original email released and anonymized');
      assert(userCheck.currentSessionId === null, 'Session ID invalidated');
      assert(Boolean(userCheck.deletedAt), 'deletedAt timestamp recorded');

      // Verify deleted learner is excluded from listLearners
      const listReq = { query: {} };
      const listRes = mockRes();
      await learnerController.listLearners(listReq, listRes, () => {});
      const inList = (listRes.data || []).some((l) => (l.id || l._id)?.toString() === paidStudent._id.toString());
      assert(!inList, 'Deleted learner does NOT appear in listLearners');
    }

    // -----------------------------------------------------------------
    // PART 2: COURSE VIDEO MANAGEMENT TESTS
    // -----------------------------------------------------------------
    console.log('\n--- 4. Testing Course Video Management ---');

    // 4A. getCourseLessons on empty course
    {
      const req = { params: { courseId: testCourse._id.toString() } };
      const res = mockRes();
      await adminController.getCourseLessons(req, res, () => {});
      assert(res.statusCode === 200, 'getCourseLessons returned 200 OK');
      assert(Array.isArray(res.data) && res.data.length === 0, 'Initial lessons list is empty');
    }

    // 4B. addLesson with module/folder
    let lesson1, lesson2, lesson3;
    {
      // Add Lesson 1
      const req1 = {
        body: {
          courseId: testCourse._id.toString(),
          title: 'Lesson 1: Intro to Analytics',
          description: 'Getting started overview',
          date: '2026-11-01',
          driveLink: 'https://drive.google.com/file/d/drive_test_file_1/view',
          folderName: 'Module 1: Introduction',
        },
      };
      const res1 = mockRes();
      await adminController.addLesson(req1, res1, () => {});
      assert(res1.statusCode === 201, 'Lesson 1 added successfully (201 Created)');
      lesson1 = res1.data;
      assert(lesson1.order === 1, 'Lesson 1 assigned order: 1');
      assert(lesson1.folderName === 'Module 1: Introduction', 'Lesson 1 assigned to Module 1');
      assert(lesson1.duration === 600, 'Lesson 1 duration fetched from Drive metadata (600s)');

      // Add Lesson 2
      const req2 = {
        body: {
          courseId: testCourse._id.toString(),
          title: 'Lesson 2: Data Foundations',
          description: 'Understanding datasets',
          date: '2026-11-02',
          driveLink: 'https://drive.google.com/file/d/drive_test_file_2/view',
          folderName: 'Module 1: Introduction',
        },
      };
      const res2 = mockRes();
      await adminController.addLesson(req2, res2, () => {});
      assert(res2.statusCode === 201, 'Lesson 2 added successfully (201 Created)');
      lesson2 = res2.data;
      assert(lesson2.order === 2, 'Lesson 2 assigned order: 2');
      assert(lesson2.duration === 1200, 'Lesson 2 duration fetched from Drive (1200s)');

      // Add Lesson 3 (Module 2)
      const req3 = {
        body: {
          courseId: testCourse._id.toString(),
          title: 'Lesson 3: Advanced Pipeline',
          description: 'Deep dive into modeling',
          date: '2026-11-03',
          driveLink: 'https://drive.google.com/file/d/drive_test_file_3/view',
          folderName: 'Module 2: Advanced Topics',
        },
      };
      const res3 = mockRes();
      await adminController.addLesson(req3, res3, () => {});
      assert(res3.statusCode === 201, 'Lesson 3 added successfully (201 Created)');
      lesson3 = res3.data;
      assert(lesson3.order === 3, 'Lesson 3 assigned order: 3');
      assert(lesson3.folderName === 'Module 2: Advanced Topics', 'Lesson 3 assigned to Module 2');
    }

    // 4C. Verify getCourseLessons returns all 3 lessons with complete video metadata
    {
      const req = { params: { courseId: testCourse._id.toString() } };
      const res = mockRes();
      await adminController.getCourseLessons(req, res, () => {});
      assert(res.data.length === 3, 'getCourseLessons returns all 3 lessons');
      assert(res.data[0].streamUrl.includes(lesson1._id.toString()), 'Lessons include valid streaming endpoints');
    }

    // 4D. updateLesson: Edit details (Title, Description, Module)
    console.log('\n--- 5. Testing Edit Lesson Details ---');
    {
      const req = {
        params: { id: lesson1._id.toString() },
        body: {
          title: 'Lesson 1: Intro to Analytics & Systems (Updated)',
          description: 'Updated comprehensive description',
          folderName: 'Module 1: Foundations',
          order: 1,
        },
      };
      const res = mockRes();
      await adminController.updateLesson(req, res, () => {});
      assert(res.statusCode === 200, 'Lesson 1 updated successfully (200 OK)');
      assert(res.data.title === 'Lesson 1: Intro to Analytics & Systems (Updated)', 'Title updated in database');
      assert(res.data.folderName === 'Module 1: Foundations', 'Module name updated in database');
    }

    // 4E. updateLesson: Replace Video Source
    console.log('\n--- 6. Testing Replace Video Source ---');
    {
      // First test clash: trying to replace Lesson 1's video with Lesson 2's drive file ID
      const clashReq = {
        params: { id: lesson1._id.toString() },
        body: {
          driveLink: 'https://drive.google.com/file/d/drive_test_file_2/view',
        },
      };
      const clashRes = mockRes();
      await adminController.updateLesson(clashReq, clashRes, () => {});
      assert(clashRes.statusCode === 400, 'Duplicate video clash correctly rejected (400 Bad Request)');

      // Now replace with a new valid file
      const replaceReq = {
        params: { id: lesson2._id.toString() },
        body: {
          driveLink: 'https://drive.google.com/file/d/drive_replaced_file/view',
        },
      };
      const replaceRes = mockRes();
      await adminController.updateLesson(replaceReq, replaceRes, () => {});
      assert(replaceRes.statusCode === 200, 'Video replacement succeeded (200 OK)');
      assert(replaceRes.data.driveFileName === 'Lesson 2 Replaced High Quality.mp4', 'Drive file name updated');
      assert(replaceRes.data.duration === 1500, 'Duration updated to new video duration (1500s)');
    }

    // 4F. reorderLessons: Reorder lessons
    console.log('\n--- 7. Testing Reorder Lessons ---');
    {
      // Reorder to: Lesson 3, Lesson 1, Lesson 2
      const req = {
        params: { courseId: testCourse._id.toString() },
        body: {
          lessonIds: [lesson3._id.toString(), lesson1._id.toString(), lesson2._id.toString()],
        },
      };
      const res = mockRes();
      await adminController.reorderLessons(req, res, () => {});
      assert(res.statusCode === 200, 'reorderLessons returned 200 OK');

      const reorderedDbLessons = await Lesson.find({ courseId: testCourse._id }).sort({ order: 1 });
      assert(reorderedDbLessons[0]._id.toString() === lesson3._id.toString(), 'First lesson is now Lesson 3');
      assert(reorderedDbLessons[0].order === 1, 'Lesson 3 has order: 1');
      assert(reorderedDbLessons[1]._id.toString() === lesson1._id.toString(), 'Second lesson is now Lesson 1');
      assert(reorderedDbLessons[1].order === 2, 'Lesson 1 has order: 2');
      assert(reorderedDbLessons[2]._id.toString() === lesson2._id.toString(), 'Third lesson is now Lesson 2');
      assert(reorderedDbLessons[2].order === 3, 'Lesson 2 has order: 3');
    }

    // 4G. deleteLesson: Delete lesson and verify automatic re-sequencing & Progress cleanup
    console.log('\n--- 8. Testing Delete Lesson & Resequencing ---');
    {
      // Create a progress row for Lesson 1 to verify cleanup
      await Progress.create({
        studentId: 'temp_student_123',
        lessonId: lesson1._id,
        courseId: testCourse._id,
        completed: true,
      });

      const req = { params: { id: lesson1._id.toString() } };
      const res = mockRes();
      await adminController.deleteLesson(req, res, () => {});
      assert(res.statusCode === 200, 'deleteLesson returned 200 OK');

      // Verify lesson document is deleted
      const checkLesson = await Lesson.findById(lesson1._id);
      assert(!checkLesson, 'Lesson 1 document removed from database');

      // Verify Progress row for Lesson 1 was cleaned up
      const checkProgress = await Progress.findOne({ lessonId: lesson1._id });
      assert(!checkProgress, 'Associated Progress row cleaned up');

      // Verify remaining lessons are sequentially ordered (1, 2)
      const remainingLessons = await Lesson.find({ courseId: testCourse._id }).sort({ order: 1 });
      assert(remainingLessons.length === 2, 'Exactly 2 lessons remain in the course');
      assert(remainingLessons[0].order === 1, 'First remaining lesson re-sequenced to order: 1');
      assert(remainingLessons[1].order === 2, 'Second remaining lesson re-sequenced to order: 2');

      // Verify Course.lessons array was updated
      const updatedCourse = await Course.findById(testCourse._id);
      assert(!updatedCourse.lessons.some((lId) => lId.toString() === lesson1._id.toString()), 'Lesson 1 removed from course.lessons array');
    }

    // -----------------------------------------------------------------
    // CLEANUP
    // -----------------------------------------------------------------
    console.log('\n--- Cleaning up test records ---');
    await Promise.all([
      User.deleteMany({ _id: { $in: [adminUser._id, otherAdmin._id, unpaidStudent._id, paidStudent._id] } }),
      Course.findByIdAndDelete(testCourse._id),
      Lesson.deleteMany({ courseId: testCourse._id }),
      Progress.deleteMany({ courseId: testCourse._id }),
      Enrollment.deleteMany({ courseId: testCourse._id }),
      Certificate.deleteMany({ courseId: testCourse._id }),
    ]);
    console.log('Test records cleaned up.\n');

  } catch (err) {
    console.error('Fatal test error:', err);
    failCount++;
  } finally {
    // Restore driveService.getVideoMetadata
    driveService.getVideoMetadata = originalGetVideoMetadata;
    await mongoose.disconnect();
    console.log('================================================================');
    console.log(`SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('================================================================');
    process.exit(failCount > 0 ? 1 : 0);
  }
}

runTests();
