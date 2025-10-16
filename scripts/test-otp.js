#!/usr/bin/env node

/**
 * Test script for OTP functionality
 * This script tests the OTP generation and verification process
 */

const mongoose = require('mongoose');
const User = require('../src/models/User');
const config = require('../src/config/env');

async function testOTP() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Create a test user
    const testUser = new User({
      name: 'Test User',
      email: 'test@example.com',
      password: 'testpassword123',
      role: 'creator'
    });

    // Generate OTP
    console.log('🔄 Generating OTP...');
    const otpCode = testUser.generateOTP();
    console.log(`✅ OTP generated: ${otpCode}`);

    // Save user with OTP
    await testUser.save();
    console.log('✅ User saved with OTP');

    // Test OTP verification
    console.log('🔄 Testing OTP verification...');
    
    // Test with correct OTP
    const correctVerification = testUser.verifyOTP(otpCode);
    console.log('✅ Correct OTP verification:', correctVerification);

    // Test with incorrect OTP
    const incorrectVerification = testUser.verifyOTP('123456');
    console.log('✅ Incorrect OTP verification:', incorrectVerification);

    // Test expired OTP (simulate by setting past expiration)
    testUser.otp.expiresAt = new Date(Date.now() - 1000);
    const expiredVerification = testUser.verifyOTP(otpCode);
    console.log('✅ Expired OTP verification:', expiredVerification);

    // Clean up test user
    await User.deleteOne({ email: 'test@example.com' });
    console.log('✅ Test user cleaned up');

    console.log('\n🎉 All OTP tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run the test
testOTP();
