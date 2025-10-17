// scripts/add-sample-notifications.js
const mongoose = require('mongoose');
const Notification = require('../src/models/Notification');
const User = require('../src/models/User');
const config = require('../src/config/env');

async function addSampleNotifications() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find brand users
    const brandUsers = await User.find({ role: 'brand' });
    console.log(`Found ${brandUsers.length} brand users`);

    if (brandUsers.length === 0) {
      console.log('No brand users found. Please create a brand user first.');
      return;
    }

    // Add sample notifications for each brand user
    for (const brandUser of brandUsers) {
      console.log(`Adding sample notifications for brand: ${brandUser.name} (${brandUser.email})`);

      // Sample notification 1: Welcome notification
      const welcomeNotification = new Notification({
        title: 'Welcome to Bloocube!',
        message: 'Thank you for joining Bloocube. Start by creating your first campaign to connect with amazing creators.',
        type: 'system_alert',
        recipient: brandUser._id,
        priority: 'medium',
        data: {
          welcomeType: 'brand_onboarding'
        },
        actions: [
          {
            label: 'Create Campaign',
            action: 'create_campaign',
            url: '/brand/campaigns/create',
            style: 'primary'
          }
        ]
      });

      // Sample notification 2: Campaign created
      const campaignNotification = new Notification({
        title: 'Campaign Created Successfully',
        message: 'Your campaign "Summer Fashion Collection" has been created and is now live!',
        type: 'campaign_created',
        recipient: brandUser._id,
        priority: 'medium',
        data: {
          campaignId: new mongoose.Types.ObjectId(),
          campaignTitle: 'Summer Fashion Collection',
          budget: 50000
        },
        actions: [
          {
            label: 'View Campaign',
            action: 'view_campaign',
            url: '/brand/campaigns',
            style: 'primary'
          }
        ]
      });

      // Sample notification 3: Bid received
      const bidNotification = new Notification({
        title: 'New Bid Received',
        message: 'A creator has submitted a bid for your campaign "Summer Fashion Collection".',
        type: 'bid_received',
        recipient: brandUser._id,
        priority: 'high',
        data: {
          bidId: new mongoose.Types.ObjectId(),
          campaignId: new mongoose.Types.ObjectId(),
          campaignTitle: 'Summer Fashion Collection',
          creatorId: new mongoose.Types.ObjectId(),
          bidAmount: 25000
        },
        actions: [
          {
            label: 'Review Bid',
            action: 'review_bid',
            url: '/brand/bids',
            style: 'primary'
          }
        ]
      });

      // Sample notification 4: System update
      const systemNotification = new Notification({
        title: 'Platform Update',
        message: 'We\'ve added new features to help you manage your campaigns better. Check out the new analytics dashboard!',
        type: 'system_alert',
        recipient: brandUser._id,
        priority: 'low',
        data: {
          updateType: 'feature_release',
          version: '2.1.0'
        },
        actions: [
          {
            label: 'Learn More',
            action: 'learn_more',
            url: '/brand/analytics',
            style: 'secondary'
          }
        ]
      });

      // Save all notifications
      await Promise.all([
        welcomeNotification.save(),
        campaignNotification.save(),
        bidNotification.save(),
        systemNotification.save()
      ]);

      console.log(`✅ Added 4 sample notifications for ${brandUser.name}`);
    }

    console.log('\n🎉 Sample notifications added successfully!');
    console.log('Brand users should now see notifications in their dashboard.');

  } catch (error) {
    console.error('Error adding sample notifications:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
addSampleNotifications();
