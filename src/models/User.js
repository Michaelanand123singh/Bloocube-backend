// src/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['creator', 'brand', 'admin'],
    default: 'creator',
    required: true
  },
  profile: {
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters'],
      default: ''
    },
    avatar_url: {
      type: String,
      default: ''
    },
    social_links: {
      youtube: String,
      instagram: String,
      twitter: String,
      linkedin: String,
      facebook: String,
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: null
  },
  refreshTokens: [{
    token: String,
    createdAt: {
      type: Date,
      default: Date.now,
      expires: '30d'
    }
  }],
  socialAccounts: {
    youtube: {
      id: String,
      title: String,
      description: String,
      customUrl: String,
      thumbnails: Object,
      subscriberCount: String,
      videoCount: String,
      viewCount: String,
      accessToken: String,
      refreshToken: String,
      expiresAt: Date,
      connectedAt: Date
    },
    
    // ✅ START: UPDATED TWITTER SCHEMA
    twitter: {
      // Profile Info
      id: String,
      username: String,
      name: String,
      profileImageUrl: String,
      connectedAt: Date,

      // Permanent OAuth 1.0a Credentials (for posting and media uploads)
      oauth_accessToken: String,
      oauth_accessSecret: String,

      // Temporary tokens (used only during the login flow)
      oauth_token: String,
      oauth_token_secret: String,

      // ℹ️ Note: These OAuth 2.0 fields are no longer used by the new login flow
      accessToken: String,
      refreshToken: String,
      expiresAt: Date,
    },
    // ✅ END: UPDATED TWITTER SCHEMA

    instagram: {
      id: String,
      username: String,
      name: String,
      accessToken: String,
      refreshToken: String,
      expiresAt: Date,
      connectedAt: Date
    },
    facebook: {
      id: String,
      username: String,
      name: String,
      accessToken: String,
      refreshToken: String,
      expiresAt: Date,
      connectedAt: Date
    },
    linkedin: {
      id: String,
      username: String,
      name: String,
      accessToken: String,
      refreshToken: String,
      expiresAt: Date,
      connectedAt: Date
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
// userSchema.index({ email: 1 });
// userSchema.index({ role: 1 });
// userSchema.index({ isActive: 1 });

// Virtual for full profile URL
userSchema.virtual('profileUrl').get(function() {
  return `/api/users/${this._id}/profile`;
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to generate JWT
userSchema.methods.generateAuthToken = function() {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { 
      id: this._id, 
      email: this.email, 
      role: this.role 
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Instance method to generate refresh token
userSchema.methods.generateRefreshToken = function() {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id: this._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' }
  );
};

// Static method to find by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to find active users
userSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

module.exports = mongoose.model('User', userSchema);
