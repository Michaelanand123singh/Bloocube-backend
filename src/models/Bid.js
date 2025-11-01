// src/models/Bid.js
const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  campaign_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: [true, 'Campaign ID is required']
  },
  creator_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator ID is required'],
    validate: {
      validator: async function(creatorId) {
        const User = mongoose.model('User');
        const creator = await User.findById(creatorId);
        return creator && creator.role === 'creator';
      },
      message: 'Creator ID must reference a valid creator user'
    }
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'withdrawn', 'completed'],
    default: 'pending'
  },
  proposal_text: {
    type: String,
    required: [true, 'Proposal text is required'],
    trim: true,
    maxlength: [2000, 'Proposal cannot exceed 2000 characters']
  },
  bid_amount: {
    type: Number,
    required: [true, 'Bid amount is required'],
    min: [0, 'Bid amount cannot be negative']
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD', 'EUR']
  },
  deliverables: {
    posts: {
      type: Number,
      default: 1,
      min: 0
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
    },
    timeline: {
      type: String,
      trim: true,
      maxlength: [500, 'Timeline cannot exceed 500 characters']
    }
  },
  portfolio_links: [{
    platform: {
      type: String,
      enum: ['instagram', 'youtube', 'twitter', 'linkedin', 'facebook']
    },
    url: {
      type: String,
      required: true
    },
    description: String
  }],
  previous_work: [{
    title: String,
    description: String,
    url: String,
    metrics: {
      views: Number,
      likes: Number,
      comments: Number,
      shares: Number
    }
  }],
  terms: {
    revision_rounds: {
      type: Number,
      default: 2,
      min: 0,
      max: 5
    },
    payment_schedule: {
      type: String,
      enum: ['upfront', 'milestone', 'completion'],
      default: 'completion'
    },
    additional_requirements: String
  },
  communication: {
    preferred_method: {
      type: String,
      enum: ['email', 'phone', 'whatsapp', 'telegram'],
      default: 'email'
    },
    contact_info: String,
    availability: String
  },
  creator_platform_data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ai_analysis: {
    compatibility_score: {
      type: Number,
      min: 0,
      max: 100
    },
    recommendations: [String],
    risk_factors: [String],
    strengths: [String],
    weaknesses: [String]
  },
  brand_feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comments: String,
    feedback_date: Date
  },
  creator_feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comments: String,
    feedback_date: Date
  },
  timeline: {
    submitted_at: {
      type: Date,
      default: Date.now
    },
    reviewed_at: Date,
    accepted_at: Date,
    completed_at: Date,
    deadline: Date
  },
  is_featured: {
    type: Boolean,
    default: false
  },
  priority: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
bidSchema.index({ campaign_id: 1, creator_id: 1 }, { unique: true });
bidSchema.index({ creator_id: 1 });
bidSchema.index({ status: 1 });
bidSchema.index({ bid_amount: 1 });
bidSchema.index({ 'timeline.submitted_at': -1 });
bidSchema.index({ is_featured: 1, priority: -1 });

// Virtual for days since submission
bidSchema.virtual('daysSinceSubmission').get(function() {
  const now = new Date();
  const submitted = new Date(this.timeline.submitted_at);
  const diffTime = now - submitted;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for is overdue
bidSchema.virtual('isOverdue').get(function() {
  if (!this.timeline.deadline) return false;
  const now = new Date();
  return this.status === 'accepted' && new Date(this.timeline.deadline) < now;
});

// Pre-save middleware
bidSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'accepted') {
      this.timeline.accepted_at = new Date();
    } else if (this.status === 'completed') {
      this.timeline.completed_at = new Date();
    }
  }
  next();
});

// Static method to find bids by creator
bidSchema.statics.findByCreator = function(creatorId) {
  return this.find({ creator_id: creatorId }).populate('campaign_id');
};

// Static method to find bids by campaign
bidSchema.statics.findByCampaign = function(campaignId) {
  return this.find({ campaign_id: campaignId }).populate('creator_id');
};

// Static method to find pending bids
bidSchema.statics.findPending = function() {
  return this.find({ status: 'pending' });
};

// Static method to find accepted bids
bidSchema.statics.findAccepted = function() {
  return this.find({ status: 'accepted' });
};

// Instance method to accept bid
bidSchema.methods.accept = function() {
  this.status = 'accepted';
  this.timeline.accepted_at = new Date();
  return this.save();
};

// Instance method to reject bid
bidSchema.methods.reject = function() {
  this.status = 'rejected';
  this.timeline.reviewed_at = new Date();
  return this.save();
};

// Instance method to withdraw bid
bidSchema.methods.withdraw = function() {
  this.status = 'withdrawn';
  return this.save();
};

module.exports = mongoose.model('Bid', bidSchema);
