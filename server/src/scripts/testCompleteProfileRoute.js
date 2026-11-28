require('dotenv').config();
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const DeviceActivation = require('../models/DeviceActivation');
const routes = require('../routes');
const { notFoundHandler, errorHandler } = require('../middleware/errorHandler');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-dev-secret-key-change-in-prod';

function assert(condition, message) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  [PASS] ${message}`);
}

function makeRequest(server, options, bodyData) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData));
    }
    req.end();
  });
}

async function run() {
  console.log('\n================================================================');
  console.log('   TESTING COMPLETE-PROFILE ROUTE & HTTP CONTROLLER INTEGRATION');
  console.log('================================================================\n');

  await connectDB();

  // Create an Express app with exact route mounting as index.js
  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const serverPort = server.address().port;
  console.log(`Test Express server running on ephemeral port ${serverPort}\n`);

  try {
    // Clean up any test users
    await User.deleteMany({ email: /^test-profile-route.*@analyticsavenue\.test$/ });
    await DeviceActivation.deleteMany({ email: /^test-profile-route.*@analyticsavenue\.test$/ });

    // Seed test learners
    const student1 = await User.create({
      name: 'Test Learner One',
      email: 'test-profile-route-1@analyticsavenue.test',
      password: 'Password123!',
      role: 'student',
      profileCompleted: false,
    });
    const token1 = jwt.sign({ id: student1._id, email: student1.email }, JWT_SECRET, { expiresIn: '1d' });

    const student2 = await User.create({
      name: 'Test Learner Two',
      email: 'test-profile-route-2@analyticsavenue.test',
      password: 'Password123!',
      role: 'student',
      profileCompleted: false,
    });
    const token2 = jwt.sign({ id: student2._id, email: student2.email }, JWT_SECRET, { expiresIn: '1d' });

    // 1. Unauthenticated request rejected
    console.log('--- 1. Testing Unauthenticated & Unauthorized Requests ---');
    const noTokenRes = await makeRequest(server, {
      path: '/api/auth/complete-profile',
      method: 'PUT',
    }, { phone: '+91 9999999991', city: 'Mumbai', education: 'B.Tech' });
    assert(noTokenRes.status === 401, 'PUT /api/auth/complete-profile without token returns 401');

    const badTokenRes = await makeRequest(server, {
      path: '/api/auth/complete-profile',
      method: 'PUT',
      headers: { Authorization: 'Bearer invalid.token.value' },
    }, { phone: '+91 9999999991', city: 'Mumbai', education: 'B.Tech' });
    assert(badTokenRes.status === 401, 'PUT /api/auth/complete-profile with invalid token returns 401');

    // 2. Validation errors (missing phone, city, education)
    console.log('\n--- 2. Testing Payload Validation ---');
    const missingPhoneRes = await makeRequest(server, {
      path: '/api/auth/complete-profile',
      method: 'PUT',
      headers: { Authorization: `Bearer ${token1}` },
    }, { city: 'Mumbai', education: 'B.Tech' });
    assert(missingPhoneRes.status === 400, 'Missing phone returns 400 Bad Request');
    assert(missingPhoneRes.body.error.includes('Phone'), 'Error message mentions phone is required');

    const missingCityRes = await makeRequest(server, {
      path: '/api/auth/complete-profile',
      method: 'PUT',
      headers: { Authorization: `Bearer ${token1}` },
    }, { phone: '+91 9999999991', education: 'B.Tech' });
    assert(missingCityRes.status === 400, 'Missing city returns 400 Bad Request');

    const missingEduRes = await makeRequest(server, {
      path: '/api/auth/complete-profile',
      method: 'PUT',
      headers: { Authorization: `Bearer ${token1}` },
    }, { phone: '+91 9999999991', city: 'Mumbai' });
    assert(missingEduRes.status === 400, 'Missing education returns 400 Bad Request');

    // 3. Valid PUT request to /api/auth/complete-profile
    console.log('\n--- 3. Testing Valid PUT /api/auth/complete-profile ---');
    const validPutRes = await makeRequest(server, {
      path: '/api/auth/complete-profile',
      method: 'PUT',
      headers: { Authorization: `Bearer ${token1}` },
    }, {
      name: 'Test Learner One Updated',
      phone: '+91 9876543210',
      city: 'Bengaluru',
      education: 'Bachelor of Technology (Computer Science)',
      headline: 'Aspiring Data Analyst',
      bio: 'Enthusiastic about SQL, Python and Analytics.',
      role: 'admin', // Malicious attempt to elevate role
    });
    assert(validPutRes.status === 200, 'Valid PUT /api/auth/complete-profile returns 200 OK');
    assert(validPutRes.body.student.profileCompleted === true, 'Response student has profileCompleted: true');
    assert(validPutRes.body.student.role === 'student', 'Role elevation attempt ignored, student role preserved');

    // Verify persistence in DB
    const dbStudent1 = await User.findById(student1._id);
    assert(dbStudent1.profileCompleted === true, 'profileCompleted persisted as true in MongoDB');
    assert(dbStudent1.phone === '+91 9876543210', 'Phone persisted in MongoDB');
    assert(dbStudent1.city === 'Bengaluru', 'City persisted in MongoDB');
    assert(dbStudent1.education === 'Bachelor of Technology (Computer Science)', 'Education persisted in MongoDB');
    assert(dbStudent1.role === 'student', 'Student role in DB remains student');

    // 4. Valid POST request to /api/auth/complete-profile
    console.log('\n--- 4. Testing POST /api/auth/complete-profile Support ---');
    const validPostRes = await makeRequest(server, {
      path: '/api/auth/complete-profile',
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
    }, {
      phone: '+91 9123456780',
      city: 'Hyderabad',
      education: 'Master of Science (Data Science)',
    });
    assert(validPostRes.status === 200, 'POST /api/auth/complete-profile returns 200 OK');
    assert(validPostRes.body.student.profileCompleted === true, 'POST request updates profileCompleted');

    // 5. Testing Alias Route /api/complete-profile
    console.log('\n--- 5. Testing Route Alias /api/complete-profile ---');
    const aliasRes = await makeRequest(server, {
      path: '/api/complete-profile',
      method: 'PUT',
      headers: { Authorization: `Bearer ${token1}` },
    }, {
      phone: '+91 9876543210',
      city: 'Bengaluru Updated',
      education: 'B.Tech CS',
    });
    assert(aliasRes.status === 200, 'PUT /api/complete-profile alias returns 200 OK');

    // 6. Testing Fallback Endpoint PUT /api/me with education and profileCompleted
    console.log('\n--- 6. Testing Fallback Route PUT /api/me ---');
    const meRes = await makeRequest(server, {
      path: '/api/me',
      method: 'PUT',
      headers: { Authorization: `Bearer ${token2}` },
    }, {
      city: 'Pune',
      education: 'MBA Business Analytics',
      profileCompleted: true,
    });
    assert(meRes.status === 200, 'PUT /api/me returns 200 OK');
    const dbStudent2 = await User.findById(student2._id);
    assert(dbStudent2.education === 'MBA Business Analytics', 'PUT /api/me persisted education in MongoDB');
    assert(dbStudent2.city === 'Pune', 'PUT /api/me persisted city in MongoDB');

    // 7. Testing Activation Status API (GET /api/auth/activation-status)
    console.log('\n--- 7. Testing Activation Status API (GET /api/auth/activation-status) ---');
    const noTokenActRes = await makeRequest(server, {
      path: '/api/auth/activation-status',
      method: 'GET',
    });
    assert(noTokenActRes.status === 401, 'GET /api/auth/activation-status without token returns 401');

    const actStatus1 = await makeRequest(server, {
      path: '/api/auth/activation-status',
      method: 'GET',
      headers: { Authorization: `Bearer ${token1}` },
    });
    assert(actStatus1.status === 200, 'GET /api/auth/activation-status returns 200 OK');
    assert(actStatus1.body.profileCompleted === true, 'Activation status reports profileCompleted: true');
    assert(actStatus1.body.status === 'payment_pending', 'Dynamic status reports payment_pending for completed profile');
    assert(actStatus1.body.pinHash === undefined, 'PIN hash is strictly hidden and not exposed');

    // 8. Testing Activation Status Aliases
    console.log('\n--- 8. Testing Activation Status Route Aliases ---');
    const aliasAct1 = await makeRequest(server, {
      path: '/api/activation-status',
      method: 'GET',
      headers: { Authorization: `Bearer ${token1}` },
    });
    assert(aliasAct1.status === 200, 'GET /api/activation-status alias returns 200 OK');

    const aliasAct2 = await makeRequest(server, {
      path: '/api/activation/status',
      method: 'GET',
      headers: { Authorization: `Bearer ${token1}` },
    });
    assert(aliasAct2.status === 200, 'GET /api/activation/status alias returns 200 OK');

    // Cleanup
    await User.deleteMany({ email: /^test-profile-route.*@analyticsavenue\.test$/ });
    await DeviceActivation.deleteMany({ email: /^test-profile-route.*@analyticsavenue\.test$/ });

    console.log('\n================================================================');
    console.log('   ALL ROUTE AND CONTROLLER CHECKS PASSED SUCCESSFULLY (24/24)');
    console.log('================================================================\n');
  } finally {
    server.close();
    await mongoose.connection.close();
  }
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
