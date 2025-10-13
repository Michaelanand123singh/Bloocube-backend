// src/models/AI_Results.js
const mongoose = require('mongoose');

const aiResultsSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  campaign_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    default: null
  },
  result_type: {
    type: String,
    required: [true, 'Result type is required'],
    enum: ['suggestion', 'analysis', 'matchmaking', 'competitor_analysis', 'content_optimization', 'trend_analysis']
  },
  input_data: {
    content: String,
    platform: String,
    target_audience: String,
    campaign_goals: [String],
    budget_range: {
      min: Number,
      max: Number
    },
    timeline: String
  },
  content: {
    score: {
      type: String,
      enum: ['low', 'medium', 'high', 'excellent'],
      default: 'medium'
    },
    numerical_score: {
      type: Number,
      min: 0,
      max: 100,
      default: 50
    },
    recommendations: [{
      category: {
        type: String,
        enum: ['hashtags', 'timing', 'content', 'engagement', 'audience', 'trends']
      },
      title: String,
      description: String,
      priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
      },
      impact: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
      }
    }],
    hashtag_suggestions: [{
      hashtag: String,
      popularity_score: Number,
      relevance_score: Number,
      competition_level: {
        type: String,
        enum: ['low', 'medium', 'high']
      }
    }],
    caption_suggestions: [{
      caption: String,
      tone: {
        type: String,
        enum: ['professional', 'casual', 'humorous', 'inspirational', 'educational']
      },
      length: Number,
      engagement_potential: Number
    }],
    posting_schedule: [{
      platform: String,
      optimal_times: [String],
      frequency: String,
      best_days: [String]
    }],
    content_ideas: [{
      title: String,
      description: String,
      format: {
        type: String,
        enum: ['post', 'story', 'reel', 'video', 'carousel', 'live']
      },
      estimated_engagement: Number,
      difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard']
      }
    }]
  },
  competitor_analysis: {
    competitors: [{
      name: String,
      platform: String,
      followers: Number,
      engagement_rate: Number,
      content_themes: [String],
      posting_frequency: String,
      strengths: [String],
      weaknesses: [String]
    }],
    market_insights: {
      trending_topics: [String],
      popular_hashtags: [String],
      audience_preferences: [String],
      content_gaps: [String]
    },
    benchmark_metrics: {
      avg_engagement_rate: Number,
      avg_reach: Number,
      avg_posting_frequency: Number,
      top_performing_content_types: [String]
    }
  },
  matchmaking_analysis: {
    compatibility_score: {
      type: Number,
      min: 0,
      max: 100
    },
    brand_creator_fit: {
      audience_alignment: Number,
      content_style_match: Number,
      values_alignment: Number,
      engagement_potential: Number
    },
    recommendations: [{
      type: {
        type: String,
        enum: ['collaboration', 'partnership', 'sponsorship', 'influencer_campaign']
      },
      confidence: Number,
      reasoning: String,
      expected_outcomes: [String]
    }],
    risk_assessment: {
      overall_risk: {
        type: String,
        enum: ['low', 'medium', 'high']
      },
      risk_factors: [{
        factor: String,
        severity: {
          type: String,
          enum: ['low', 'medium', 'high']
        },
        mitigation: String
      }]
    }
  },
  performance_predictions: {
    expected_reach: {
      min: Number,
      max: Number,
      confidence: Number
    },
    expected_engagement: {
      min: Number,
      max: Number,
      confidence: Number
    },
    viral_potential: {
      type: Number,
      min: 0,
      max: 100
    },
    success_probability: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  ai_metadata: {
    model_version: String,
    processing_time: Number,
    confidence_score: Number,
    data_sources: [String],
    last_trained: Date,
    accuracy_score: Number
  },
  feedback: {
    user_rating: {
      type: Number,
      min: 1,
      max: 5
    },
    user_comments: String,
    was_helpful: Boolean,
    suggestions_implemented: [String],
    results_achieved: {
      reach_improvement: Number,
      engagement_improvement: Number,
      conversion_improvement: Number
    }
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed', 'expired'],
    default: 'processing'
  },
  expires_at: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    }
  },
  generated_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
aiResultsSchema.index({ user_id: 1, result_type: 1 });
aiResultsSchema.index({ campaign_id: 1 });
aiResultsSchema.index({ status: 1 });
aiResultsSchema.index({ generated_at: -1 });
aiResultsSchema.index({ expires_at: 1 });
aiResultsSchema.index({ 'content.numerical_score': -1 });

// Virtual for days until expiration
aiResultsSchema.virtual('daysUntilExpiration').get(function() {
  const now = new Date();
  const expires = new Date(this.expires_at);
  const diffTime = expires - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for is expired
aiResultsSchema.virtual('isExpired').get(function() {
  return new Date() > new Date(this.expires_at);
});

// Virtual for high priority recommendations
aiResultsSchema.virtual('highPriorityRecommendations').get(function() {
  if (!this.content || !this.content.recommendations || !Array.isArray(this.content.recommendations)) {
    return [];
  }
  return this.content.recommendations.filter(rec => rec.priority === 'high' || rec.priority === 'critical');
});

// Pre-save middleware
aiResultsSchema.pre('save', function(next) {
  this.updated_at = new Date();
  
  // Auto-expire old results
  if (this.isExpired && this.status !== 'expired') {
    this.status = 'expired';
  }
  
  next();
});

// Static method to find by user and type
aiResultsSchema.statics.findByUserAndType = function(userId, resultType) {
  return this.find({ 
    user_id: userId, 
    result_type: resultType,
    status: 'completed',
    expires_at: { $gt: new Date() }
  }).sort({ generated_at: -1 });
};

// Static method to find by campaign
aiResultsSchema.statics.findByCampaign = function(campaignId) {
  return this.find({ 
    campaign_id: campaignId,
    status: 'completed',
    expires_at: { $gt: new Date() }
  }).sort({ generated_at: -1 });
};

// Static method to find high scoring results
aiResultsSchema.statics.findHighScoring = function(minScore = 80) {
  return this.find({ 
    'content.numerical_score': { $gte: minScore },
    status: 'completed',
    expires_at: { $gt: new Date() }
  }).sort({ 'content.numerical_score': -1 });
};

// Static method to cleanup expired results
aiResultsSchema.statics.cleanupExpired = function() {
  return this.updateMany(
    { 
      expires_at: { $lt: new Date() },
      status: { $ne: 'expired' }
    },
    { status: 'expired' }
  );
};

// Instance method to mark as helpful
aiResultsSchema.methods.markAsHelpful = function() {
  if (!this.feedback) {
    this.feedback = {};
  }
  this.feedback.was_helpful = true;
  this.feedback.user_rating = Math.max(this.feedback.user_rating || 0, 4);
  return this.save();
};

// Instance method to add feedback
aiResultsSchema.methods.addFeedback = function(rating, comments) {
  if (!this.feedback) {
    this.feedback = {};
  }
  this.feedback.user_rating = rating;
  this.feedback.user_comments = comments;
  this.feedback.was_helpful = rating >= 4;
  return this.save();
};

// Instance method to track implementation
aiResultsSchema.methods.trackImplementation = function(suggestions) {
  if (!this.feedback) {
    this.feedback = {};
  }
  this.feedback.suggestions_implemented = suggestions;
  return this.save();
};

module.exports = mongoose.model('AI_Results', aiResultsSchema);
