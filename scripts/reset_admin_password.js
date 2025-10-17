// scripts/reset_admin_password.js
require('dotenv').config();
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

(async () => {
  try {
    await connectDB();
    console.log('🔌 Connected to database');

    const email = process.argv[2] || 'admin@bloocube.com';
    const newPassword = process.argv[3] || 'Admin@123456';

    const admin = await User.findOne({ email: email });
    if (!admin) {
      console.log('❌ Admin user not found');
      process.exit(1);
    }

    admin.password = newPassword;
    admin.isActive = true;
    admin.isVerified = true;
    admin.loginAttempts = 0;
    admin.lockUntil = null;
    await admin.save();

    console.log('✅ Admin password reset successfully');
    console.log('📧 Email:', admin.email);
    console.log('🔑 New Password:', newPassword);
    console.log('👤 Role:', admin.role);
    console.log('✅ Active:', admin.isActive);
    console.log('🔐 Verified:', admin.isVerified);

    // Test login
    console.log('\n🧪 Testing admin login...');
    const testUser = await User.findByEmail(email).select('+password');
    if (testUser) {
      const isPasswordValid = await testUser.comparePassword(newPassword);
      if (isPasswordValid) {
        console.log('✅ Password verification successful');
      } else {
        console.log('❌ Password verification failed');
      }
    }

  } catch (error) {
    console.error('❌ Error resetting admin password:', error.message);
  } finally {
    process.exit(0);
  }
})();
