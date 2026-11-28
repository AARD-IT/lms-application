/**
 * One-off migration: npm run set:admin
 *
 * Creates (or updates) the account matching ADMIN_EMAIL with a known
 * password and admin role. Use this to rotate the admin login instead of
 * hand-editing the database.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/User');

const ADMIN_EMAIL = process.argv[2] || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.argv[3] || process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.argv[4] || process.env.ADMIN_NAME || 'Administrator';

async function setAdminAccount() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('[set:admin] Please provide credentials: node setAdminAccount.js <email> <password> [name] or set ADMIN_EMAIL & ADMIN_PASSWORD env vars.');
    process.exit(1);
  }
  await connectDB();

  let user = await User.findOne({ email: ADMIN_EMAIL });
  if (!user) {
    user = new User({ name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin' });
    await user.save();
    console.log(`[set:admin] created admin account for ${ADMIN_EMAIL}.`);
  } else {
    user.password = ADMIN_PASSWORD;
    user.role = 'admin';
    await user.save();
    console.log(`[set:admin] updated password and role for ${ADMIN_EMAIL}.`);
  }

  await mongoose.disconnect();
}

setAdminAccount().catch(async (err) => {
  console.error('[set:admin] failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
