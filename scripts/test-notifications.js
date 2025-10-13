// scripts/test-notifications.js
const mongoose = require('mongoose');
const NotificationService = require('../src/services/notificationService');
const User = require('../src/models/User');
const config = require('../src/config/env');

async function testNotifications() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find an admin user
    const adminUser = await User.findOne({ role: 'admin' });
    if (!adminUser) {
      console.log('No admin user found. Please create an admin user first.');
      return;
    }

    console.log(`Testing notifications for admin: ${adminUser.name} (${adminUser.email})`);

    // Test 1: Create a simple notification
    console.log('\n1. Testing simple notification creation...');
    const simpleNotification = await NotificationService.createNotification({
      title: 'Test Notification',
      message: 'This is a test notification to verify the system is working.',
      type: 'system_alert',
      recipientId: adminUser._id,
      priority: 'medium'
    });
    console.log('✅ Simple notification created:', simpleNotification._id);

    // Test 2: Test admin notification
    console.log('\n2. Testing admin notification...');
    const adminNotifications = await NotificationService.notifyAdmins({
      title: 'System Test',
      message: 'Testing admin notification system.',
      type: 'system_alert',
      priority: 'low'
    });
    console.log(`✅ Admin notifications created: ${adminNotifications.length}`);

    // Test 3: Test user registration notification
    console.log('\n3. Testing user registration notification...');
    const testUser = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Test User',
      email: 'test@example.com',
      role: 'creator'
    };
    const regNotifications = await NotificationService.notifyUserRegistration(testUser);
    console.log(`✅ User registration notifications created: ${regNotifications.length}`);

    // Test 4: Test system alert
    console.log('\n4. Testing system alert...');
    const alertNotification = await NotificationService.notifySystemAlert({
      message: 'Test system alert - everything is working correctly.',
      priority: 'medium',
      data: { test: true, timestamp: new Date() }
    });
    console.log(`✅ System alert notifications created: ${alertNotification.length}`);

    console.log('\n🎉 All notification tests passed!');
    console.log('\nYou can now check the admin panel to see the notifications.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testNotifications();
}

module.exports = testNotifications;
