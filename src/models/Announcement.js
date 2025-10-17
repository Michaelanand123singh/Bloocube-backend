// src/models/Announcement.js
const mongoose = require('mongoose');

const AnnouncementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000 // Increased for announcements
  },
  targetRoles: [{
    type: String,
    enum: ['creator', 'brand', 'admin'],
    required: true
  }],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sent', 'cancelled'],
    default: 'sent'
  },
  // Email settings
  emailSettings: {
    sendEmail: {
      type: Boolean,
      default: true
    },
    emailSent: {
      type: Number,
      default: 0
    },
    emailFailed: {
      type: Number,
      default: 0
    },
    emailPending: {
      type: Number,
      default: 0
    }
  },
  // Notification settings
  notificationSettings: {
    notificationsCreated: {
      type: Number,
      default: 0
    },
    notificationsRead: {
      type: Number,
      default: 0
    }
  },
  // Optional scheduling
  scheduledAt: {
    type: Date,
    default: null
  },
  // Expiration settings
  expiresAt: {
    type: Date,
    default: null,
    index: { expireAfterSeconds: 0 }
  },
  // Auto-cleanup settings
  autoCleanup: {
    enabled: {
      type: Boolean,
      default: true
    },
    cleanupAfter: {
      type: Number,
      default: 30, // days
      min: 1,
      max: 365
    },
    cleanupAt: {
      type: Date,
      default: function() {
        if (this.autoCleanup.enabled) {
          return new Date(Date.now() + (this.autoCleanup.cleanupAfter * 24 * 60 * 60 * 1000));
        }
        return null;
      }
    }
  },
  // Action buttons
  actions: [{
    label: {
      type: String,
      required: true,
      maxlength: 50
    },
    action: {
      type: String,
      required: true,
      maxlength: 100
    },
    url: {
      type: String,
      maxlength: 500
    },
    style: {
      type: String,
      enum: ['primary', 'secondary', 'success', 'warning', 'danger'],
      default: 'primary'
    }
  }],
  // Additional data
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Created by admin
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Statistics
  stats: {
    totalRecipients: {
      type: Number,
      default: 0
    },
    emailSuccessRate: {
      type: Number,
      default: 0
    },
    notificationReadRate: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
AnnouncementSchema.index({ createdBy: 1, createdAt: -1 });
AnnouncementSchema.index({ status: 1, createdAt: -1 });
AnnouncementSchema.index({ targetRoles: 1, createdAt: -1 });
AnnouncementSchema.index({ priority: 1, createdAt: -1 });
// Note: expiresAt already has TTL index defined in schema
AnnouncementSchema.index({ 'autoCleanup.cleanupAt': 1 });

// Virtual for time ago
AnnouncementSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  
  return this.createdAt.toLocaleDateString();
});

// Virtual for read rate
AnnouncementSchema.virtual('readRate').get(function() {
  if (this.notificationSettings.notificationsCreated === 0) return 0;
  return ((this.notificationSettings.notificationsRead / this.notificationSettings.notificationsCreated) * 100).toFixed(1);
});

// Static method to get announcements for admin
AnnouncementSchema.statics.getAnnouncements = function(options = {}) {
  const {
    page = 1,
    limit = 20,
    status = null,
    priority = null,
    targetRole = null,
    createdBy = null,
    search = null
  } = options;

  const query = {};
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (targetRole) query.targetRoles = targetRole;
  if (createdBy) query.createdBy = createdBy;
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;

  return this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('createdBy', 'name email')
    .then(async (announcements) => {
      const total = await this.countDocuments(query);
      return {
        announcements,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    });
};

// Static method to get announcement statistics
AnnouncementSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        byStatus: {
          $push: {
            status: '$status',
            createdAt: '$createdAt'
          }
        },
        byPriority: {
          $push: {
            priority: '$priority',
            createdAt: '$createdAt'
          }
        },
        totalEmailsSent: { $sum: '$emailSettings.emailSent' },
        totalEmailsFailed: { $sum: '$emailSettings.emailFailed' },
        totalNotificationsCreated: { $sum: '$notificationSettings.notificationsCreated' },
        totalNotificationsRead: { $sum: '$notificationSettings.notificationsRead' }
      }
    }
  ]);
};

// Static method to cleanup old announcements
AnnouncementSchema.statics.cleanupOldAnnouncements = function() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30); // Default 30 days

  return this.deleteMany({
    'autoCleanup.enabled': true,
    'autoCleanup.cleanupAt': { $lt: cutoffDate }
  });
};

// Pre-save middleware to set cleanup date
AnnouncementSchema.pre('save', function(next) {
  if (this.autoCleanup.enabled && !this.autoCleanup.cleanupAt) {
    this.autoCleanup.cleanupAt = new Date(
      Date.now() + (this.autoCleanup.cleanupAfter * 24 * 60 * 60 * 1000)
    );
  }
  next();
});

module.exports = mongoose.model('Announcement', AnnouncementSchema);
