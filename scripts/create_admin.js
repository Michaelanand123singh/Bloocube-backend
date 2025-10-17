// scripts/create_admin.js
require('dotenv').config();
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

(async () => {
  try {
    await connectDB();
    console.log('🔌 Connected to database');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@bloocube.com' });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists');
      console.log('📧 Email:', existingAdmin.email);
      console.log('👤 Role:', existingAdmin.role);
      console.log('✅ Active:', existingAdmin.isActive);
      console.log('🔐 Verified:', existingAdmin.isVerified);
      console.log('🆔 ID:', existingAdmin._id);
      
      // Update admin to ensure all fields are correct
      existingAdmin.isActive = true;
      existingAdmin.isVerified = true;
      existingAdmin.role = 'admin';
      existingAdmin.name = 'Bloocube Admin';
      await existingAdmin.save();
      
      console.log('✅ Admin user updated successfully');
    } else {
      // Create new admin user
      const admin = await User.create({
        name: 'Bloocube Admin',
        email: 'admin@bloocube.com',
        password: 'Admin@123456',
        role: 'admin',
        isActive: true,
        isVerified: true,
        profilePicture: null,
        bio: 'System Administrator',
        location: 'Global',
        website: 'https://bloocube.com',
        socialLinks: {
          twitter: null,
          instagram: null,
          linkedin: null,
          youtube: null,
          facebook: null
        },
        preferences: {
          emailNotifications: true,
          pushNotifications: true,
          marketingEmails: false
        },
        lastLogin: null,
        loginAttempts: 0,
        lockUntil: null
      });

      console.log('✅ Admin user created successfully');
      console.log('📧 Email:', admin.email);
      console.log('🔑 Password: Admin@123456');
      console.log('👤 Role:', admin.role);
      console.log('🆔 ID:', admin._id);
    }

    // Test login
    console.log('\n🧪 Testing admin login...');
    const testUser = await User.findByEmail('admin@bloocube.com').select('+password');
    if (testUser) {
      const isPasswordValid = await testUser.comparePassword('Admin@123456');
      if (isPasswordValid) {
        console.log('✅ Password verification successful');
      } else {
        console.log('❌ Password verification failed');
      }
    } else {
      console.log('❌ Admin user not found');
    }

    console.log('\n🎉 Admin setup complete!');
    console.log('📋 Login credentials:');
    console.log('   Email: admin@bloocube.com');
    console.log('   Password: Admin@123456');
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  } finally {
    process.exit(0);
  }
})();
