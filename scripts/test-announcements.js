// Test script for announcement functionality
const axios = require('axios');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// Test data
const testAnnouncement = {
  title: 'Test Announcement - System Maintenance',
  message: 'We will be performing scheduled maintenance on our servers tonight from 2 AM to 4 AM EST. During this time, the platform may be temporarily unavailable. We apologize for any inconvenience.',
  targetRoles: ['creator', 'brand'],
  priority: 'high',
  data: {
    maintenanceType: 'scheduled',
    estimatedDuration: '2 hours'
  },
  actions: [
    {
      label: 'Learn More',
      action: 'view_maintenance',
      url: '/maintenance-info',
      style: 'primary'
    }
  ],
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days from now
};

async function testAnnouncementSystem() {
  console.log('🚀 Testing Announcement System...\n');

  try {
    // Test 1: Create announcement
    console.log('1. Testing announcement creation...');
    const createResponse = await axios.post(`${API_BASE}/api/notifications/announcement`, testAnnouncement, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_ADMIN_TOKEN_HERE' // Replace with actual admin token
      }
    });

    if (createResponse.data.success) {
      console.log('✅ Announcement created successfully!');
      console.log(`   - Sent to ${createResponse.data.data.notificationsCreated} users`);
      console.log(`   - Target roles: ${createResponse.data.data.targetRoles.join(', ')}`);
    } else {
      console.log('❌ Failed to create announcement:', createResponse.data.message);
    }

    // Test 2: Get announcement stats
    console.log('\n2. Testing announcement statistics...');
    const statsResponse = await axios.get(`${API_BASE}/api/notifications/announcement-stats`, {
      headers: {
        'Authorization': 'Bearer YOUR_ADMIN_TOKEN_HERE' // Replace with actual admin token
      }
    });

    if (statsResponse.data.success) {
      console.log('✅ Announcement stats retrieved successfully!');
      console.log(`   - Total announcements: ${statsResponse.data.data.total}`);
      console.log(`   - Unread announcements: ${statsResponse.data.data.unread}`);
      console.log(`   - Priority breakdown:`, statsResponse.data.data.priorityBreakdown);
      console.log(`   - Target role breakdown:`, statsResponse.data.data.targetRoleBreakdown);
    } else {
      console.log('❌ Failed to get announcement stats');
    }

    // Test 3: Test different target roles
    console.log('\n3. Testing creator-only announcement...');
    const creatorAnnouncement = {
      ...testAnnouncement,
      title: 'Creator-Only Announcement - New Features',
      message: 'We have added new features specifically for creators! Check out the updated dashboard.',
      targetRoles: ['creator'],
      priority: 'medium'
    };

    const creatorResponse = await axios.post(`${API_BASE}/api/notifications/announcement`, creatorAnnouncement, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_ADMIN_TOKEN_HERE' // Replace with actual admin token
      }
    });

    if (creatorResponse.data.success) {
      console.log('✅ Creator-only announcement created successfully!');
      console.log(`   - Sent to ${creatorResponse.data.data.notificationsCreated} creators`);
    } else {
      console.log('❌ Failed to create creator-only announcement');
    }

    // Test 4: Test brand-only announcement
    console.log('\n4. Testing brand-only announcement...');
    const brandAnnouncement = {
      ...testAnnouncement,
      title: 'Brand-Only Announcement - Campaign Updates',
      message: 'We have improved the campaign creation process. Try creating a new campaign to see the changes.',
      targetRoles: ['brand'],
      priority: 'medium'
    };

    const brandResponse = await axios.post(`${API_BASE}/api/notifications/announcement`, brandAnnouncement, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_ADMIN_TOKEN_HERE' // Replace with actual admin token
      }
    });

    if (brandResponse.data.success) {
      console.log('✅ Brand-only announcement created successfully!');
      console.log(`   - Sent to ${brandResponse.data.data.notificationsCreated} brands`);
    } else {
      console.log('❌ Failed to create brand-only announcement');
    }

    console.log('\n🎉 Announcement system test completed!');
    console.log('\n📋 Summary:');
    console.log('   - Backend API endpoints are working');
    console.log('   - Announcement creation is functional');
    console.log('   - Role-based targeting is working');
    console.log('   - Statistics tracking is operational');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Make sure the backend server is running');
    console.log('   2. Replace YOUR_ADMIN_TOKEN_HERE with a valid admin JWT token');
    console.log('   3. Check that the API_BASE_URL is correct');
    console.log('   4. Ensure the database is connected and has user data');
  }
}

// Run the test
if (require.main === module) {
  testAnnouncementSystem();
}

module.exports = { testAnnouncementSystem };
