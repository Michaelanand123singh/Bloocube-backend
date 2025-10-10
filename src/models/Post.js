const mongoose = require('mongoose');

// Helper object for custom validation
const validPostTypes = {
  twitter: ['tweet', 'thread', 'poll'],
  youtube: ['video', 'live', 'post'],
  instagram: ['post', 'story', 'reel', 'carousel'],
  linkedin: ['post', 'video', 'poll'],
  facebook: ['post', 'story', 'reel', 'video', 'live', 'carousel']
};

const PostSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
    maxlength: 200
  },
  content: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  platform: {
    type: String,
    required: true,
    enum: Object.keys(validPostTypes)
  },
  post_type: {
    type: String,
    required: true,
    // ✅ IMPROVEMENT: Add a custom validator to check for valid platform/post_type combinations
    validate: {
      validator: function(value) {
        // 'this' refers to the document being validated
        return validPostTypes[this.platform]?.includes(value);
      },
      message: props => `${props.value} is not a valid post_type for the platform ${props.path}`
    }
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
  // ❌ REMOVED: Redundant fields are removed. Data now lives in the 'publishing' and 'scheduling' objects.
  // scheduledAt: Date,
  // publishedAt: Date,
  // platform_post_id: String,
  // platform_url: String,

  platformContent: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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
    storageKey: String,
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
    thumbnail: String
  }],
  analytics: {
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    lastUpdated: Date
  },
  // ✅ IMPROVEMENT: Centralized publishing information
  publishing: {
    published_at: Date,
    platform_post_id: String,
    platform_url: String, // Added URL here for completeness
    error: String,
    retry_count: { type: Number, default: 0 }
  },
  // ✅ IMPROVEMENT: Centralized scheduling information
  scheduling: {
    scheduled_at: Date, // Renamed for consistency
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
PostSchema.index({ 'scheduling.scheduled_at': 1, status: 1 }); // Updated index
PostSchema.index({ createdAt: -1 });


// Pre-save middleware
PostSchema.pre('save', function(next) {
  // ✅ IMPROVEMENT: Logic updated to use the consolidated fields
  if (this.isModified('status') && this.status === 'published' && !this.publishing.published_at) {
    this.publishing.published_at = new Date();
  }
  next();
});

// Static method to find posts ready for publishing
PostSchema.statics.findReadyForPublishing = function() {
  // ✅ IMPROVEMENT: Query updated to use the consolidated field
  return this.find({
    status: 'scheduled',
    'scheduling.scheduled_at': { $lte: new Date() }
  }).populate('author', 'username email socialAccounts');
};


module.exports = mongoose.model('Post', PostSchema);