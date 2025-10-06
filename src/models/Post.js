const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: false,
    trim: true,
    maxlength: 200
  },
  content: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
    default: {}
  },
  platform: {
    type: String,
    required: true,
    enum: ['twitter', 'youtube', 'instagram', 'linkedin', 'facebook'],
    index: true
  },
  post_type: {
    type: String,
    required: true,
    enum: ['post', 'story', 'reel', 'video', 'live', 'carousel', 'poll', 'tweet', 'thread'],
    default: 'post'
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'published', 'failed'],
    default: 'draft',
    index: true
  },
  scheduledAt: {
    type: Date,
    required: false
  },
  publishedAt: {
    type: Date,
    required: false
  },
  platformContent: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
    default: {}
  },
  platform_post_id: {
    type: String,
    required: false
  },
  platform_url: {
    type: String,
    required: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  categories: [{
    type: String,
    trim: true
  }],
  media: [{
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'document'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    storage: {
      type: String,
      enum: ['local', 'gcs'],
      default: 'local'
    },
    storageKey: {
      type: String,
      required: false
    },
    filename: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    thumbnail: {
      type: String,
      required: false
    }
  }],
  analytics: {
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  publishing: {
    published_at: Date,
    platform_post_id: String,
    error: String,
    retry_count: { type: Number, default: 0 }
  },
  scheduling: {
    scheduled_for: Date,
    timezone: String,
    recurring: {
      enabled: { type: Boolean, default: false },
      frequency: { type: String, enum: ['daily', 'weekly', 'monthly'] },
      days: [String],
      time: String
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
PostSchema.index({ author: 1, status: 1 });
PostSchema.index({ platform: 1, status: 1 });
PostSchema.index({ scheduledAt: 1 });
PostSchema.index({ createdAt: -1 });

// Virtual for checking if post can be published
PostSchema.methods.canPublish = function() {
  return this.status === 'draft' || this.status === 'scheduled';
};

// Virtual for checking if post is scheduled
PostSchema.methods.isScheduled = function() {
  return this.status === 'scheduled' && this.scheduledAt && this.scheduledAt > new Date();
};

// Virtual for getting post age
PostSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Pre-save middleware
PostSchema.pre('save', function(next) {
  // Update publishedAt when status changes to published
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  // Update scheduledAt when status changes to scheduled
  if (this.isModified('status') && this.status === 'scheduled' && this.scheduling?.scheduled_for) {
    this.scheduledAt = this.scheduling.scheduled_for;
  }
  
  next();
});

// Static method to find posts by platform and status
PostSchema.statics.findByPlatformAndStatus = function(platform, status) {
  return this.find({ platform, status }).populate('author', 'username email');
};

// Static method to find scheduled posts ready for publishing
PostSchema.statics.findReadyForPublishing = function() {
  return this.find({
    status: 'scheduled',
    scheduledAt: { $lte: new Date() }
  }).populate('author', 'username email socialAccounts');
};

module.exports = mongoose.model('Post', PostSchema);