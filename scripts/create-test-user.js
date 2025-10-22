#!/usr/bin/env node

/**
 * Create Test User
 * 
 * This script creates a test user in the database for testing purposes
 */

const mongoose = require('mongoose');
const config = require('../src/config/env');

// User model (simplified for testing)
const userSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, default: 'user' },
  isActive: { type: Boolean, default: true },
  socialAccounts: {
    twitter: { type: Object, default: {} },
    instagram: { type: Object, default: {} },
    linkedin: { type: Object, default: {} },
    facebook: { type: Object, default: {} },
    youtube: { type: Object, default: {} }
  }
});

const User = mongoose.model('User', userSchema);

async function createTestUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if test user already exists
    const existingUser = await User.findOne({ email: 'test@bloocube.com' });
    if (existingUser) {
      console.log('✅ Test user already exists');
      console.log('User ID:', existingUser._id);
      console.log('Email:', existingUser.email);
      console.log('Name:', existingUser.name);
      console.log('Role:', existingUser.role);
      return existingUser._id;
    }

    // Create test user
    const testUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
    const testUser = new User({
      _id: testUserId,
      email: 'test@bloocube.com',
      password: 'hashedpassword123', // This would be hashed in real app
      name: 'Test User',
      role: 'user',
      isActive: true,
      socialAccounts: {
        twitter: {},
        instagram: {},
        linkedin: {},
        facebook: {},
        youtube: {}
      }
    });

    await testUser.save();
    console.log('✅ Test user created successfully');
    console.log('User ID:', testUser._id);
    console.log('Email:', testUser.email);
    console.log('Name:', testUser.name);
    console.log('Role:', testUser.role);

    return testUser._id;
  } catch (error) {
    console.error('❌ Error creating test user:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  createTestUser();
}

module.exports = { createTestUser };
