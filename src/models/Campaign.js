// src/models/Campaign.js
const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  brand_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Brand ID is required'],
    validate: {
      validator: async function(brandId) {
        const User = mongoose.model('User');
        const brand = await User.findById(brandId);
        return brand && brand.role === 'brand';
      },
      message: 'Brand ID must reference a valid brand user'
    }
  },
  title: {
    type: String,
    required: [true, 'Campaign title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Campaign description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  budget: {
    type: Number,
    required: [true, 'Budget is required'],
    min: [1000, 'Budget must be at least 1000'],
    max: [10000000, 'Budget cannot exceed 10,000,000']
  },
  deadline: {
    type: Date,
    required: [true, 'Deadline is required'],
    validate: {
      validator: function(deadline) {
        // Allow past deadlines for campaigns that are already selected or completed
        if (this.status === 'completed' || this.status === 'closed' || 
            (this.selectedCreators && this.selectedCreators.length > 0)) {
          return true;
        }
        // For new campaigns or active campaigns, deadline must be in the future
        return deadline > new Date();
      },
      message: 'Deadline must be in the future for new campaigns'
    }
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'closed', 'completed', 'cancelled'],
    default: 'draft'
  },
  requirements: {
    platforms: [{
      type: String,
      enum: ['instagram', 'youtube', 'twitter', 'linkedin', 'facebook'],
      required: true
    }],
    minFollowers: {
      type: Number,
      default: 0,
      min: 0
    },
    maxFollowers: {
      type: Number,
      default: 10000000,
      min: 0
    },
    contentTypes: [{
      type: String,
      enum: ['post', 'story', 'reel', 'video', 'live', 'carousel']
    }],
    hashtags: [String],
    mentions: [String]
  },
  deliverables: {
    posts: {
      type: Number,
      default: 1,
      min: 1
    },
    stories: {
      type: Number,
      default: 0,
      min: 0
    },
    reels: {
      type: Number,
      default: 0,
      min: 0
    },
    videos: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  payment: {
    type: {
      type: String,
      enum: ['fixed', 'performance'],
      default: 'fixed'
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR', 'USD', 'EUR']
    }
  },
  tags: [String],
  isPublic: {
    type: Boolean,
    default: true
  },
  maxApplications: {
    type: Number,
    default: 50,
    min: 1,
    max: 1000
  },
  applicationDeadline: {
    type: Date,
    validate: {
      validator: function(applicationDeadline) {
        return !applicationDeadline || applicationDeadline < this.deadline;
      },
      message: 'Application deadline must be before campaign deadline'
    }
  },
  selectedCreators: [{
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    selected_at: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['selected', 'accepted', 'rejected', 'completed'],
      default: 'selected'
    }
  }],
  analytics: {
    totalApplications: {
      type: Number,
      default: 0
    },
    totalViews: {
      type: Number,
      default: 0
    },
    totalEngagement: {
      type: Number,
      default: 0
    },
    totalReach: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
campaignSchema.index({ brand_id: 1 });
campaignSchema.index({ status: 1 });
campaignSchema.index({ deadline: 1 });
campaignSchema.index({ 'requirements.platforms': 1 });
campaignSchema.index({ budget: 1 });
campaignSchema.index({ isPublic: 1, status: 1 });

// Virtual for remaining days
campaignSchema.virtual('remainingDays').get(function() {
  const now = new Date();
  const deadline = new Date(this.deadline);
  const diffTime = deadline - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
});

// Virtual for application status
campaignSchema.virtual('canApply').get(function() {
  const now = new Date();
  const deadline = this.applicationDeadline || this.deadline;
  return this.status === 'active' && 
         this.isPublic && 
         new Date(deadline) > now &&
         this.analytics.totalApplications < this.maxApplications;
});

// Pre-save middleware
campaignSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'active') {
    this.isPublic = true;
  }
  next();
});

// Static method to find active campaigns
campaignSchema.statics.findActive = function() {
  return this.find({ 
    status: 'active', 
    isPublic: true,
    deadline: { $gt: new Date() }
  });
};

// Static method to find campaigns by brand
campaignSchema.statics.findByBrand = function(brandId) {
  return this.find({ brand_id: brandId });
};

// Static method to find campaigns by platform
campaignSchema.statics.findByPlatform = function(platform) {
  return this.find({ 
    'requirements.platforms': platform,
    status: 'active',
    isPublic: true
  });
};

module.exports = mongoose.model('Campaign', campaignSchema);
