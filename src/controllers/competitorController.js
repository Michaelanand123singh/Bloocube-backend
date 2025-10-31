// src/controllers/competitorController.js
const competitorDataCollector = require('../services/competitorDataCollector');
const competitorCache = require('../services/competitorCache');
const aiClient = require('../services/aiClient');
const AIResults = require('../models/AI_Results');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

// Helper function to calculate competitor diversity score
const calculateCompetitorDiversity = (competitorsData) => {
  if (!competitorsData || competitorsData.length === 0) return 0;
  
  const platforms = new Set(competitorsData.map(d => d.profile.platform));
  const followerRanges = competitorsData.map(d => {
    const followers = d.profile.followers || d.profile.subscribers || 0;
    if (followers < 1000) return 'micro';
    if (followers < 10000) return 'small';
    if (followers < 100000) return 'medium';
    if (followers < 1000000) return 'large';
    return 'mega';
  });
  
  const platformDiversity = platforms.size / 4; // Max 4 platforms
  const followerDiversity = new Set(followerRanges).size / 5; // Max 5 ranges
  
  return Math.round((platformDiversity + followerDiversity) * 50); // Score out of 100
};

// Helper function to determine market segment
const determineMarketSegment = (competitorsData) => {
  if (!competitorsData || competitorsData.length === 0) return 'unknown';
  
  const niches = competitorsData.map(d => d.profile.niche || d.profile.category || 'general');
  const nicheCounts = {};
  niches.forEach(niche => {
    nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
  });
  
  const dominantNiche = Object.keys(nicheCounts).reduce((a, b) => 
    nicheCounts[a] > nicheCounts[b] ? a : b
  );
  
  return dominantNiche;
};

// Helper functions to generate fallback insights based on collected data
const generateKeyInsights = (competitorsData) => {
  const insights = [];
  
  if (competitorsData.length > 0) {
    const avgEngagement = competitorsData.reduce((sum, d) => sum + parseFloat(d.engagement.engagementRate), 0) / competitorsData.length;
    const platforms = [...new Set(competitorsData.map(d => d.profile.platform))];
    
    insights.push(`Average engagement rate across competitors: ${avgEngagement.toFixed(2)}%`);
    insights.push(`Competitors analyzed across ${platforms.length} platforms: ${platforms.join(', ')}`);
    
    const topPerformer = competitorsData.reduce((best, current) => 
      parseFloat(current.engagement.engagementRate) > parseFloat(best.engagement.engagementRate) ? current : best
    );
    insights.push(`Top performing competitor: @${topPerformer.profile.username} with ${topPerformer.engagement.engagementRate}% engagement`);
    
    const totalPosts = competitorsData.reduce((sum, d) => sum + d.content.totalPosts, 0);
    insights.push(`Total posts analyzed: ${totalPosts} posts`);
  }
  
  return insights;
};

const generateTrendingHashtags = (competitorsData) => {
  const hashtagCounts = {};
  
  competitorsData.forEach(competitor => {
    if (competitor.content.topHashtags) {
      competitor.content.topHashtags.forEach(hashtag => {
        const tag = hashtag.tag || hashtag;
        hashtagCounts[tag] = (hashtagCounts[tag] || 0) + (hashtag.count || 1);
      });
    }
  });
  
  return Object.entries(hashtagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, usage_count: count }));
};

const generateContentStrategies = (competitorsData) => {
  const strategies = [];
  
  // Get platform-specific strategies
  const platforms = [...new Set(competitorsData.map(d => d.profile.platform))];
  
  platforms.forEach(platform => {
    const platformData = competitorsData.filter(d => d.profile.platform === platform);
    const contentTypes = {};
    
    platformData.forEach(competitor => {
      if (competitor.content.contentTypes) {
        Object.entries(competitor.content.contentTypes).forEach(([type, count]) => {
          contentTypes[type] = (contentTypes[type] || 0) + count;
        });
      }
    });
    
    const dominantType = Object.entries(contentTypes).sort(([,a], [,b]) => b - a)[0];
    
    // Platform-specific strategies
    switch (platform) {
      case 'youtube':
        strategies.push(`Focus on long-form video content (${dominantType?.[0] || 'video'} format)`);
        strategies.push('Create detailed tutorials and reviews for YouTube');
        strategies.push('Use YouTube Shorts for viral content and discovery');
        strategies.push('Optimize video titles and thumbnails for click-through rates');
        strategies.push('Create series content to increase watch time');
        break;
      case 'twitter':
        strategies.push(`Focus on real-time text content (${dominantType?.[0] || 'text'} format)`);
        strategies.push('Tweet frequently throughout the day for maximum reach');
        strategies.push('Use Twitter threads for in-depth discussions');
        strategies.push('Engage with trending topics and breaking news');
        strategies.push('Share quick insights and opinions');
        break;
      case 'instagram':
        strategies.push(`Focus on visual content (${dominantType?.[0] || 'image'} format)`);
        strategies.push('Use Instagram Reels for viral potential');
        strategies.push('Create Stories for behind-the-scenes content');
        strategies.push('Post high-quality images with engaging captions');
        strategies.push('Use Instagram Live for real-time engagement');
        break;
      case 'facebook':
        strategies.push(`Focus on community content (${dominantType?.[0] || 'image'} format)`);
        strategies.push('Create longer posts for detailed storytelling');
        strategies.push('Use Facebook Groups for community building');
        strategies.push('Share articles and links with commentary');
        strategies.push('Host Facebook Live sessions');
        break;
      case 'linkedin':
        strategies.push(`Focus on professional content (${dominantType?.[0] || 'text'} format)`);
        strategies.push('Share industry insights and thought leadership');
        strategies.push('Post professional articles and updates');
        strategies.push('Engage with B2B content and networking');
        strategies.push('Share career and business-related content');
        break;
      default:
        if (dominantType) {
          strategies.push(`Focus on ${dominantType[0]} content as it's the most popular format`);
        }
        strategies.push('Create educational content to increase engagement');
    }
  });
  
  // Add general strategies
  strategies.push('Use storytelling in captions to connect with audience');
  strategies.push('Post consistently to maintain audience engagement');
  strategies.push('Engage with trending topics in your niche');
  
  return strategies;
};

const generateGrowthStrategies = (competitorsData) => {
  const strategies = [];
  
  // Get platform-specific growth strategies
  const platforms = [...new Set(competitorsData.map(d => d.profile.platform))];
  
  platforms.forEach(platform => {
    switch (platform) {
      case 'youtube':
        strategies.push('Collaborate with other YouTube creators for cross-promotion');
        strategies.push('Use YouTube Shorts to reach new audiences');
        strategies.push('Create playlists to increase watch time and subscriber retention');
        strategies.push('Engage with comments to build community');
        strategies.push('Use YouTube Analytics to optimize content strategy');
        strategies.push('Create thumbnails that stand out in search results');
        break;
      case 'twitter':
        strategies.push('Engage with trending hashtags to increase visibility');
        strategies.push('Create viral Twitter threads for maximum reach');
        strategies.push('Participate in Twitter Spaces for community building');
        strategies.push('Retweet and engage with industry leaders');
        strategies.push('Use Twitter polls to increase engagement');
        strategies.push('Share breaking news and hot takes');
        break;
      case 'instagram':
        strategies.push('Use Instagram Reels for viral potential and discovery');
        strategies.push('Collaborate with Instagram influencers in your niche');
        strategies.push('Create Instagram Stories for daily engagement');
        strategies.push('Use Instagram Live for real-time interaction');
        strategies.push('Engage with Instagram Explore page content');
        strategies.push('Create user-generated content campaigns');
        break;
      case 'facebook':
        strategies.push('Create Facebook Groups for community building');
        strategies.push('Use Facebook Live for real-time engagement');
        strategies.push('Share articles and links with engaging commentary');
        strategies.push('Engage with Facebook Pages in your industry');
        strategies.push('Use Facebook Events for community gatherings');
        strategies.push('Create Facebook Stories for behind-the-scenes content');
        break;
      case 'linkedin':
        strategies.push('Share professional articles and industry insights');
        strategies.push('Engage with LinkedIn Groups in your field');
        strategies.push('Connect with industry professionals and thought leaders');
        strategies.push('Share career updates and professional achievements');
        strategies.push('Use LinkedIn Live for professional discussions');
        strategies.push('Create LinkedIn newsletters for thought leadership');
        break;
      default:
        strategies.push('Collaborate with micro-influencers in your niche');
        strategies.push('Cross-promote content across multiple platforms');
    }
  });
  
  // Add general growth strategies
  strategies.push('Engage with trending hashtags and topics');
  strategies.push('Create user-generated content campaigns');
  strategies.push('Partner with complementary brands');
  strategies.push('Host live sessions to increase engagement');
  strategies.push('Create series content to build anticipation');
  
  return strategies;
};

const generateMonetizationOpportunities = (competitorsData) => {
  const opportunities = [];
  
  const niches = competitorsData.map(d => d.profile.niche || 'general');
  const dominantNiche = niches.reduce((a, b, i, arr) => 
    arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
  );
  
  // Get platform-specific monetization opportunities
  const platforms = [...new Set(competitorsData.map(d => d.profile.platform))];
  
  platforms.forEach(platform => {
    switch (platform) {
      case 'youtube':
        opportunities.push(`YouTube Partner Program - monetize through ads`);
        opportunities.push(`Sponsored video content with ${dominantNiche} brands`);
        opportunities.push(`YouTube Shorts Fund for viral content`);
        opportunities.push(`Channel memberships and Super Chat`);
        opportunities.push(`Affiliate marketing for tech products`);
        opportunities.push(`Online courses and digital products`);
        opportunities.push(`Merchandise sales through YouTube Shopping`);
        break;
      case 'twitter':
        opportunities.push(`Twitter Blue subscription features`);
        opportunities.push(`Sponsored tweets with ${dominantNiche} brands`);
        opportunities.push(`Twitter Spaces monetization`);
        opportunities.push(`Newsletter subscriptions (Twitter integration)`);
        opportunities.push(`Consulting services for social media strategy`);
        opportunities.push(`Affiliate marketing through tweet links`);
        opportunities.push(`Twitter Ads revenue sharing`);
        break;
      case 'instagram':
        opportunities.push(`Instagram Shopping and product tags`);
        opportunities.push(`Sponsored posts with ${dominantNiche} brands`);
        opportunities.push(`Instagram Reels monetization`);
        opportunities.push(`Instagram Live badges and donations`);
        opportunities.push(`Affiliate marketing through Instagram Stories`);
        opportunities.push(`Brand partnerships and collaborations`);
        opportunities.push(`Instagram Creator Fund`);
        break;
      case 'facebook':
        opportunities.push(`Facebook Creator Bonus program`);
        opportunities.push(`Sponsored posts with ${dominantNiche} brands`);
        opportunities.push(`Facebook Live Stars and donations`);
        opportunities.push(`Facebook Shop integration`);
        opportunities.push(`Affiliate marketing through Facebook posts`);
        opportunities.push(`Facebook Groups monetization`);
        opportunities.push(`Facebook Marketplace for products`);
        break;
      case 'linkedin':
        opportunities.push(`LinkedIn Creator Accelerator Program`);
        opportunities.push(`Sponsored content with ${dominantNiche} brands`);
        opportunities.push(`LinkedIn Learning course creation`);
        opportunities.push(`Professional consulting services`);
        opportunities.push(`B2B affiliate marketing`);
        opportunities.push(`LinkedIn Newsletter subscriptions`);
        opportunities.push(`Speaking engagements and workshops`);
        break;
      default:
        opportunities.push(`Sponsored posts with ${dominantNiche} brands`);
        opportunities.push('Affiliate marketing for relevant products');
    }
  });
  
  // Add general monetization opportunities
  opportunities.push('Create and sell digital products');
  opportunities.push('Offer consulting services in your expertise');
  opportunities.push('Develop online courses');
  opportunities.push('Brand partnership opportunities');
  
  return opportunities;
};

const generateCaptionOptimization = (competitorsData) => {
  const tips = [];
  
  // Get platform-specific caption optimization tips
  const platforms = [...new Set(competitorsData.map(d => d.profile.platform))];
  
  platforms.forEach(platform => {
    switch (platform) {
      case 'youtube':
        tips.push('Write compelling video titles with keywords for SEO');
        tips.push('Use detailed descriptions with timestamps and links');
        tips.push('Create eye-catching thumbnails with text overlay');
        tips.push('Add closed captions for accessibility and SEO');
        tips.push('Use YouTube Shorts descriptions for discoverability');
        tips.push('Include call-to-actions in video descriptions');
        break;
      case 'twitter':
        tips.push('Keep tweets under 280 characters for maximum engagement');
        tips.push('Use Twitter threads for longer-form content');
        tips.push('Include relevant hashtags (1-2 per tweet)');
        tips.push('Ask questions to encourage replies and engagement');
        tips.push('Use Twitter polls for interactive content');
        tips.push('Retweet with commentary to add value');
        break;
      case 'instagram':
        tips.push('Write engaging captions that tell a story');
        tips.push('Use Instagram Stories text overlays effectively');
        tips.push('Include relevant hashtags (5-10 per post)');
        tips.push('Use Instagram Reels captions for context');
        tips.push('Add location tags for local discoverability');
        tips.push('Use emojis strategically to break up text');
        break;
      case 'facebook':
        tips.push('Write longer, detailed posts for Facebook audience');
        tips.push('Use Facebook Stories for quick updates');
        tips.push('Include links and articles with commentary');
        tips.push('Ask questions to encourage comments');
        tips.push('Use Facebook Live descriptions for context');
        tips.push('Share personal stories to build connection');
        break;
      case 'linkedin':
        tips.push('Write professional, industry-focused content');
        tips.push('Use LinkedIn articles for thought leadership');
        tips.push('Include professional hashtags (3-5 per post)');
        tips.push('Share career updates and professional insights');
        tips.push('Use LinkedIn Stories for behind-the-scenes content');
        tips.push('Engage with industry discussions and comments');
        break;
      default:
        tips.push('Use emotional triggers in your captions');
        tips.push('Include clear call-to-actions');
    }
  });
  
  // Add general caption optimization tips
  tips.push('Keep captions engaging and relevant to your audience');
  tips.push('Use emojis strategically to break up text');
  tips.push('Ask questions to encourage comments');
  tips.push('Tell personal stories to build connection');
  tips.push('Use trending hashtags relevant to your content');
  tips.push('Include location tags when relevant');
  
  return tips;
};

const generateOptimalPostingTimes = (competitorsData) => {
  const timeCounts = {};
  
  competitorsData.forEach(competitor => {
    if (competitor.engagement.peakEngagementTimes) {
      competitor.engagement.peakEngagementTimes.forEach(time => {
        const hour = time.hour;
        timeCounts[hour] = (timeCounts[hour] || 0) + 1;
      });
    }
  });
  
  const topTimes = Object.entries(timeCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([hour]) => `${hour}:00`);
  
  return topTimes.length > 0 ? topTimes : ['8:00 AM', '7:00 PM', '12:00 PM'];
};

const generateCompetitiveBenchmarks = (competitorsData) => {
  if (competitorsData.length === 0) return {};
  
  const avgEngagement = competitorsData.reduce((sum, d) => sum + parseFloat(d.engagement.engagementRate), 0) / competitorsData.length;
  const avgFollowers = competitorsData.reduce((sum, d) => sum + (d.profile.followers || d.profile.subscribers || 0), 0) / competitorsData.length;
  const avgPosts = competitorsData.reduce((sum, d) => sum + d.content.totalPosts, 0) / competitorsData.length;
  
  return {
    average_engagement_rate: `${avgEngagement.toFixed(2)}%`,
    average_followers: Math.round(avgFollowers).toLocaleString(),
    average_posts: Math.round(avgPosts),
    total_competitors: competitorsData.length
  };
};

const generateActionableRecommendations = (competitorsData) => {
  const recommendations = [];
  
  // Get platform-specific actionable recommendations
  const platforms = [...new Set(competitorsData.map(d => d.profile.platform))];
  
  platforms.forEach(platform => {
    switch (platform) {
      case 'youtube':
        recommendations.push('Analyze your top-performing videos and replicate their format');
        recommendations.push('Engage with comments within the first hour of posting');
        recommendations.push('Create playlists to increase watch time and subscriber retention');
        recommendations.push('Use YouTube Shorts for viral content and discovery');
        recommendations.push('Optimize video titles and thumbnails for click-through rates');
        recommendations.push('Collaborate with other YouTube creators for cross-promotion');
        recommendations.push('Use YouTube Analytics to track performance metrics');
        recommendations.push('Create series content to build anticipation');
        break;
      case 'twitter':
        recommendations.push('Tweet frequently throughout the day for maximum reach');
        recommendations.push('Engage with trending hashtags to increase visibility');
        recommendations.push('Create viral Twitter threads for maximum engagement');
        recommendations.push('Participate in Twitter Spaces for community building');
        recommendations.push('Retweet and engage with industry leaders');
        recommendations.push('Use Twitter polls to increase interaction');
        recommendations.push('Share breaking news and hot takes');
        recommendations.push('Respond to mentions and DMs promptly');
        break;
      case 'instagram':
        recommendations.push('Post consistently at optimal times for your audience');
        recommendations.push('Use Instagram Reels for viral potential and discovery');
        recommendations.push('Create Instagram Stories for daily engagement');
        recommendations.push('Use Instagram Live for real-time interaction');
        recommendations.push('Engage with Instagram Explore page content');
        recommendations.push('Create user-generated content campaigns');
        recommendations.push('Use Instagram Shopping for product promotion');
        recommendations.push('Collaborate with Instagram influencers in your niche');
        break;
      case 'facebook':
        recommendations.push('Create Facebook Groups for community building');
        recommendations.push('Use Facebook Live for real-time engagement');
        recommendations.push('Share articles and links with engaging commentary');
        recommendations.push('Engage with Facebook Pages in your industry');
        recommendations.push('Use Facebook Events for community gatherings');
        recommendations.push('Create Facebook Stories for behind-the-scenes content');
        recommendations.push('Use Facebook Shop for product sales');
        recommendations.push('Share personal stories to build connection');
        break;
      case 'linkedin':
        recommendations.push('Share professional articles and industry insights');
        recommendations.push('Engage with LinkedIn Groups in your field');
        recommendations.push('Connect with industry professionals and thought leaders');
        recommendations.push('Share career updates and professional achievements');
        recommendations.push('Use LinkedIn Live for professional discussions');
        recommendations.push('Create LinkedIn newsletters for thought leadership');
        recommendations.push('Engage with industry discussions and comments');
        recommendations.push('Share B2B content and professional updates');
        break;
      default:
        recommendations.push('Analyze your top-performing posts and replicate their format');
        recommendations.push('Engage with your audience within the first hour of posting');
    }
  });
  
  // Add general actionable recommendations
  recommendations.push('Use a mix of content types to keep your feed interesting');
  recommendations.push('Post consistently at optimal times for your audience');
  recommendations.push('Collaborate with other creators in your niche');
  recommendations.push('Use analytics to track what content performs best');
  recommendations.push('Respond to comments to increase engagement');
  recommendations.push('Create content that encourages user interaction');
  
  return recommendations;
};

const generatePlatformInsights = (competitorsData) => {
  const platformInsights = {};
  
  const platforms = [...new Set(competitorsData.map(d => d.profile.platform))];
  
  platforms.forEach(platform => {
    const platformData = competitorsData.filter(d => d.profile.platform === platform);
    const avgEngagement = platformData.reduce((sum, d) => sum + parseFloat(d.engagement.engagementRate), 0) / platformData.length;
    
    platformInsights[platform] = [
      `Average engagement rate: ${avgEngagement.toFixed(2)}%`,
      `Best content type: ${Object.keys(platformData[0]?.content.contentTypes || {}).sort((a,b) => (platformData[0].content.contentTypes[b] || 0) - (platformData[0].content.contentTypes[a] || 0))[0] || 'Mixed'}`,
      `Posting frequency: ${platformData[0]?.content.averagePostsPerWeek || 0} posts per week`
    ];
  });
  
  return platformInsights;
};

const generateContentThemes = (competitorsData) => {
  const themeCounts = {};
  
  competitorsData.forEach(competitor => {
    if (competitor.content.contentThemes) {
      competitor.content.contentThemes.forEach(theme => {
        const themeName = theme.theme || theme;
        themeCounts[themeName] = (themeCounts[themeName] || 0) + (theme.count || 1);
      });
    }
  });
  
  return Object.entries(themeCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([theme, count]) => ({ theme, count }));
};

const generateEngagementPatterns = (competitorsData) => {
  return {
    peak_hours: generateOptimalPostingTimes(competitorsData),
    best_content_types: Object.keys(competitorsData[0]?.content.contentTypes || {}),
    engagement_trends: competitorsData.map(d => d.engagement.engagementTrend)
  };
};

const generateAudienceInsights = (competitorsData) => {
  return {
    average_followers: Math.round(competitorsData.reduce((sum, d) => sum + (d.profile.followers || d.profile.subscribers || 0), 0) / competitorsData.length),
    engagement_consistency: competitorsData.map(d => d.engagement.engagementConsistency),
    growth_potential: 'High - based on competitor analysis'
  };
};

/**
 * Create a basic analysis response when AI services are unavailable
 */
const createBasicAnalysisResponse = (competitorsData, analysisType) => {
  const competitors = competitorsData.map(data => ({
    platform: data.profile.platform,
    username: data.profile.username,
    profile_url: data.profile.profileUrl,
    verified: data.profile.verified || false,
    key_metrics: {
      followers: data.profile.followers || 0,
      engagement_rate: data.engagement.engagementRate || 0,
      posts_analyzed: data.content.totalPosts || 0,
      average_likes: data.engagement.averageLikes || 0,
      average_comments: data.engagement.averageComments || 0,
      average_shares: data.engagement.averageShares || 0,
      growth_rate: data.engagement.growthRate || 0
    },
    content_analysis: {
      total_posts: data.content.totalPosts || 0,
      posts_per_week: data.content.averagePostsPerWeek || 0,
      content_types: data.content.contentTypes || {},
      top_hashtags: data.content.topHashtags || [],
      posting_schedule: data.content.postingSchedule || {}
    },
    engagement_metrics: {
      engagement_rate: data.engagement.engagementRate || 0,
      average_likes: data.engagement.averageLikes || 0,
      average_comments: data.engagement.averageComments || 0,
      average_shares: data.engagement.averageShares || 0,
      growth_rate: data.engagement.growthRate || 0
    },
    audience_insights: data.audience || {},
    data_quality: data.dataQuality || { level: 'medium', score: 50 }
  }));

  return {
    results: {
      competitors: competitors,
      market_insights: {
        total_competitors: competitors.length,
        platforms_analyzed: [...new Set(competitors.map(c => c.platform))],
        average_engagement: competitors.reduce((sum, c) => sum + c.key_metrics.engagement_rate, 0) / competitors.length,
        analysis_note: 'Basic analysis performed - AI services unavailable'
      },
      benchmark_metrics: {
        engagement_benchmark: competitors.reduce((sum, c) => sum + c.key_metrics.engagement_rate, 0) / competitors.length,
        follower_benchmark: competitors.reduce((sum, c) => sum + c.key_metrics.followers, 0) / competitors.length
      },
      competitive_landscape: {
        top_performers: competitors.sort((a, b) => b.key_metrics.engagement_rate - a.key_metrics.engagement_rate).slice(0, 3),
        analysis_type: analysisType
      },
      recommendations: [
        'AI-powered insights temporarily unavailable',
        'Basic competitor data collected successfully',
        'Try again later for enhanced AI analysis'
      ],
      ai_insights: {
        status: 'offline_mode',
        message: 'AI services are currently unavailable. Basic analysis provided.',
        fallback_used: true
      }
    },
    model_version: 'basic-fallback-v1.0',
    processing_time_ms: 100,
    confidence_score: 0.7,
    status: 'completed',
    fallback_mode: true
  };
};

/**
 * Analyze competitors - Recommended Flow Implementation
 * 1. Frontend sends competitor profile URLs
 * 2. Backend collects profile data from social media platforms
 * 3. Backend sends structured data to AI Services for analysis
 * 4. AI Services returns analysis results
 * 5. Backend stores and returns results to frontend
 */
const analyzeCompetitors = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const {
    competitorUrls,
    campaignId,
    analysisType = 'comprehensive',
    platforms = [],
    options = {}
  } = req.body;

  // Validation
  if (!competitorUrls || !Array.isArray(competitorUrls) || competitorUrls.length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'At least one competitor profile URL is required'
    });
  }

  if (competitorUrls.length > 10) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Maximum 10 competitors can be analyzed at once'
    });
  }

  // Validate platforms if provided
  const supportedPlatforms = ['instagram', 'twitter', 'youtube', 'linkedin', 'facebook'];
  if (platforms.length > 0) {
    const invalidPlatforms = platforms.filter(p => !supportedPlatforms.includes(p));
    if (invalidPlatforms.length > 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Unsupported platforms: ${invalidPlatforms.join(', ')}`
      });
    }
  }

  try {
    logger.info('Starting competitor analysis', {
      userId,
      campaignId,
      competitorCount: competitorUrls.length,
      analysisType
    });

    // Step 1: Check cache for existing competitor data
    logger.info('Checking cache for competitor data');
    const cacheOptions = {
      maxPosts: options.maxPosts || 50,
      timePeriodDays: options.timePeriodDays || 30
    };
    
    const cacheResults = await competitorCache.getMultiple(competitorUrls, cacheOptions);
    const { results: cachedData, hits, misses } = cacheResults;
    
    logger.info('Cache lookup results', {
      totalUrls: competitorUrls.length,
      cacheHits: hits.length,
      cacheMisses: misses.length,
      hitRate: ((hits.length / competitorUrls.length) * 100).toFixed(1) + '%'
    });

    // Step 2: Collect data for cache misses
    let freshDataResults = [];
    if (misses.length > 0) {
      logger.info('Collecting fresh competitor data from social media platforms', {
        urlsToCollect: misses.length,
        platforms: platforms.length > 0 ? platforms : 'auto-detect',
        useEnvironmentCredentials: options.useEnvironmentCredentials || true
      });
      
      // Enhanced collection options with environment credentials
      const collectionOptions = {
        maxPosts: options.maxPosts || 50,
        timePeriodDays: options.timePeriodDays || 30,
        concurrency: 3,
        useEnvironmentCredentials: options.useEnvironmentCredentials || true,
        platformSpecific: options.platformSpecific || true,
        fetchRealTimeData: options.fetchRealTimeData || true,
        platforms: platforms.length > 0 ? platforms : undefined,
                apiCredentials: {
                  // Pass environment credentials for real-time data fetching
                  instagram: {
                    clientId: process.env.INSTAGRAM_CLIENT_ID,
                    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET
                  },
                  twitter: {
                    clientId: process.env.TWITTER_CLIENT_ID,
                    clientSecret: process.env.TWITTER_CLIENT_SECRET,
                    bearerToken: process.env.TWITTER_BEARER_TOKEN
                  },
                  youtube: {
                    clientId: process.env.YOUTUBE_CLIENT_ID,
                    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
                    apiKey: process.env.YOUTUBE_API_KEY
                  },
                  linkedin: {
                    clientId: process.env.LINKEDIN_CLIENT_ID,
                    clientSecret: process.env.LINKEDIN_CLIENT_SECRET
                  },
                  facebook: {
                    clientId: process.env.FACEBOOK_APP_ID,
                    clientSecret: process.env.FACEBOOK_APP_SECRET
                  }
                }
      };
      
      freshDataResults = await competitorDataCollector.collectMultipleCompetitors(
        misses,
        collectionOptions
      );

      // Cache the fresh data
      const freshDataMap = {};
      for (const result of freshDataResults) {
        if (!result.error) {
          freshDataMap[result.profile.profileUrl] = result;
        }
      }
      
      if (Object.keys(freshDataMap).length > 0) {
        await competitorCache.setMultiple(freshDataMap, cacheOptions);
        logger.info('Fresh competitor data cached', {
          cachedCount: Object.keys(freshDataMap).length,
          platformsUsed: platforms.length > 0 ? platforms : 'auto-detected'
        });
      }
    }

    // Step 3: Combine cached and fresh data
    const competitorDataResults = [
      ...Object.values(cachedData),
      ...freshDataResults
    ];

    // Filter successful data collection results
    const successfulData = competitorDataResults.filter(result => !result.error);
    const failedData = competitorDataResults.filter(result => result.error);

    if (successfulData.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Failed to collect data from any competitor profiles',
        errors: failedData
      });
    }

    logger.info('Competitor data collection completed', {
      successful: successfulData.length,
      failed: failedData.length
    });

    // Step 2: Prepare enhanced structured data for AI analysis
    const aiAnalysisPayload = {
      user_id: userId,
      campaign_id: campaignId,
      analysis_type: analysisType,
      competitors_data: successfulData.map(data => ({
        platform: data.profile.platform,
        username: data.profile.username,
        profile_url: data.profile.profileUrl,
        profile_metrics: {
          followers: data.profile.followers || data.profile.subscribers || 0,
          following: data.profile.following || 0,
          posts_count: data.profile.posts || data.profile.videos || 0,
          engagement_rate: parseFloat(data.engagement.engagementRate) || 0,
          verified: data.profile.verified || data.profile.isVerified || false,
          // Additional profile insights
          bio: data.profile.bio || data.profile.description || '',
          website: data.profile.website || data.profile.externalUrl || '',
          location: data.profile.location || '',
          join_date: data.profile.joinDate || data.profile.createdAt || ''
        },
        content_analysis: {
          total_posts: data.content.totalPosts,
          average_posts_per_week: data.content.averagePostsPerWeek,
          content_types: data.content.contentTypes,
          top_hashtags: data.content.topHashtags,
          posting_schedule: data.content.postingSchedule,
          // Enhanced content analysis
          content_themes: data.content.contentThemes || [],
          caption_length_avg: data.content.averageCaptionLength || 0,
          video_duration_avg: data.content.averageVideoDuration || 0,
          best_performing_content: data.content.bestPerformingContent || [],
          content_frequency: data.content.contentFrequency || {}
        },
        engagement_metrics: {
          average_likes: data.engagement.averageLikes,
          average_comments: data.engagement.averageComments,
          average_shares: data.engagement.averageShares,
          total_engagement: data.engagement.totalEngagement,
          engagement_trend: data.engagement.engagementTrend,
          // Enhanced engagement insights
          peak_engagement_times: data.engagement.peakEngagementTimes || [],
          engagement_by_content_type: data.engagement.engagementByContentType || {},
          audience_growth_rate: data.engagement.audienceGrowthRate || 0,
          engagement_consistency: data.engagement.engagementConsistency || 'unknown'
        },
        recent_posts: data.content.posts.slice(0, 15).map(post => ({
          content: post.text || post.caption || post.title || '',
          engagement: {
            likes: post.like_count || post.favorite_count || 0,
            comments: post.comment_count || post.reply_count || 0,
            shares: post.retweet_count || post.share_count || 0,
            views: post.view_count || post.play_count || 0
          },
          created_at: post.created_time || post.created_at || post.publishedAt,
          content_type: competitorDataCollector.determineContentType(post, data.profile.platform),
          hashtags: post.hashtags || [],
          mentions: post.mentions || [],
          media_urls: post.mediaUrls || [],
          // Additional post insights
          caption_sentiment: post.sentiment || 'neutral',
          content_length: (post.text || post.caption || post.title || '').length,
          engagement_rate: post.engagement_rate || 0
        })),
        data_quality: data.dataQuality,
        // Additional competitor insights
        competitor_insights: {
          niche: data.profile.niche || data.profile.category || 'general',
          content_strategy: data.content.contentStrategy || 'mixed',
          brand_collaborations: data.profile.brandCollaborations || [],
          monetization_methods: data.profile.monetizationMethods || [],
          audience_demographics: data.profile.audienceDemographics || {}
        }
      })),
      analysis_options: {
        include_content_analysis: true,
        include_engagement_analysis: true,
        include_audience_analysis: true,
        include_competitive_insights: true,
        include_recommendations: true,
        include_realtime_data: options.fetchRealTimeData === true,
        platform_specific: true,
        // Enhanced analysis options
        include_hashtag_analysis: true,
        include_caption_analysis: true,
        include_posting_strategy: true,
        include_content_themes: true,
        include_engagement_patterns: true,
        include_growth_strategies: true,
        include_monetization_insights: true,
        include_audience_insights: true,
        include_competitive_benchmarking: true,
        include_actionable_recommendations: true,
        analysis_depth: true,
        include_trending_insights: true,
        include_content_optimization: true
      },
      metadata: {
        total_competitors: successfulData.length,
        platforms_analyzed: [...new Set(successfulData.map(d => d.profile.platform))],
        data_collection_timestamp: new Date().toISOString(),
        analysis_request_id: `comp_${Date.now()}_${userId}`,
        // Enhanced metadata
        analysis_version: '2.0',
        data_freshness: 'real_time',
        competitor_diversity_score: calculateCompetitorDiversity(successfulData),
        market_segment: determineMarketSegment(successfulData)
      },
      collected_at: new Date().toISOString()
    };

    // Step 3: Send structured data to AI Services for analysis
    logger.info('Sending data to AI Services for analysis', {
      userId,
      competitorsCount: successfulData.length,
      analysisType: analysisType
    });
    
    // Use enhanced AI analysis if real-time data is requested
    const useEnhancedAnalysis = options.fetchRealTimeData === true;
    let aiResponse;
    
    try {
      aiResponse = useEnhancedAnalysis 
        ? await aiClient.competitorAnalysisWithRealtime(aiAnalysisPayload)
        : await aiClient.competitorAnalysis(aiAnalysisPayload);
    } catch (aiError) {
      logger.error('AI Services request failed', {
        userId,
        error: aiError.message,
        status: aiError.response?.status,
        endpoint: aiError.config?.url,
        useEnhanced: useEnhancedAnalysis
      });
      
      // If enhanced analysis fails, try standard analysis as fallback
      if (useEnhancedAnalysis) {
        logger.info('Falling back to standard AI analysis');
        try {
          aiResponse = await aiClient.competitorAnalysis(aiAnalysisPayload);
        } catch (fallbackError) {
          logger.error('Both enhanced and standard AI analysis failed', {
            userId,
            enhancedError: aiError.message,
            standardError: fallbackError.message
          });
          throw fallbackError;
        }
      } else {
        // If AI services are completely down, create a basic analysis response
        if (aiError.response?.status === 500 || aiError.message.includes('timeout')) {
          logger.warn('AI Services appear to be down, creating basic analysis response', {
            userId,
            error: aiError.message
          });
          
          aiResponse = createBasicAnalysisResponse(successfulData, analysisType);
        } else {
          throw aiError;
        }
      }
    }

    // Step 4: Store results in database
    const aiResultRecord = await AIResults.create({
      user_id: userId,
      campaign_id: campaignId || null,
      result_type: 'competitor_analysis',
      input_data: {
        competitor_urls: competitorUrls,
        analysis_type: analysisType,
        options: options
      },
      competitor_analysis: {
        competitors: aiResponse.results?.competitors || [],
        market_insights: aiResponse.results?.market_insights || {},
        benchmark_metrics: aiResponse.results?.benchmark_metrics || {},
        competitive_landscape: aiResponse.results?.competitive_landscape || {},
        recommendations: aiResponse.results?.recommendations || [],
        ai_insights: aiResponse.results?.ai_insights || {}
      },
      ai_metadata: {
        model_version: aiResponse.model_version || 'unknown',
        processing_time: aiResponse.processing_time_ms || 0,
        confidence_score: aiResponse.confidence_score || 0,
        data_sources: successfulData.map(d => d.profile.platform),
        competitors_analyzed: successfulData.length,
        data_quality_score: Math.round(
          successfulData.reduce((sum, d) => sum + d.dataQuality.score, 0) / successfulData.length
        ),
        fallback_mode: aiResponse.fallback_mode || false,
        ai_service_status: aiResponse.fallback_mode ? 'unavailable' : 'active'
      },
      status: 'completed'
    });

    // Step 5: Return comprehensive results
    const response = {
      success: true,
      message: SUCCESS_MESSAGES.ANALYSIS_COMPLETED,
      data: {
        analysis_id: aiResultRecord._id,
        competitors_analyzed: successfulData.length,
        competitors_failed: failedData.length,
        analysis_type: analysisType,
        results: {
          // AI Analysis Results
          ai_insights: aiResponse.results?.ai_insights || {},
          competitive_landscape: aiResponse.results?.competitive_landscape || {},
          market_insights: aiResponse.results?.market_insights || {},
          benchmark_metrics: aiResponse.results?.benchmark_metrics || {},
          recommendations: aiResponse.results?.recommendations || [],
          
          // Enhanced Analysis Results (with fallbacks)
          key_insights: aiResponse.results?.key_insights || generateKeyInsights(successfulData),
          trending_hashtags: aiResponse.results?.trending_hashtags || generateTrendingHashtags(successfulData),
          content_strategies: aiResponse.results?.content_strategies || generateContentStrategies(successfulData),
          growth_strategies: aiResponse.results?.growth_strategies || generateGrowthStrategies(successfulData),
          monetization_opportunities: aiResponse.results?.monetization_opportunities || generateMonetizationOpportunities(successfulData),
          caption_optimization: aiResponse.results?.caption_optimization || generateCaptionOptimization(successfulData),
          optimal_posting_times: aiResponse.results?.optimal_posting_times || generateOptimalPostingTimes(successfulData),
          competitive_benchmarks: aiResponse.results?.competitive_benchmarks || generateCompetitiveBenchmarks(successfulData),
          actionable_recommendations: aiResponse.results?.actionable_recommendations || generateActionableRecommendations(successfulData),
          platform_insights: aiResponse.results?.platform_insights || generatePlatformInsights(successfulData),
          content_themes: aiResponse.results?.content_themes || generateContentThemes(successfulData),
          engagement_patterns: aiResponse.results?.engagement_patterns || generateEngagementPatterns(successfulData),
          audience_insights: aiResponse.results?.audience_insights || generateAudienceInsights(successfulData),
          
          // Enhanced Competitor Data
          competitors_data: successfulData.map(data => ({
            platform: data.profile.platform,
            username: data.profile.username,
            profile_url: data.profile.profileUrl,
            verified: data.profile.verified || data.profile.isVerified || false,
            profile_metrics: {
              followers: data.profile.followers || data.profile.subscribers || 0,
              following: data.profile.following || 0,
              posts_count: data.profile.posts || data.profile.videos || 0,
              engagement_rate: parseFloat(data.engagement.engagementRate) || 0,
              verified: data.profile.verified || data.profile.isVerified || false,
              bio: data.profile.bio || data.profile.description || '',
              website: data.profile.website || data.profile.externalUrl || '',
              location: data.profile.location || '',
              join_date: data.profile.joinDate || data.profile.createdAt || '',
              niche: data.profile.niche || data.profile.category || 'general'
            },
            engagement_metrics: {
              average_likes: data.engagement.averageLikes,
              average_comments: data.engagement.averageComments,
              average_shares: data.engagement.averageShares,
              total_engagement: data.engagement.totalEngagement,
              engagement_trend: data.engagement.engagementTrend,
              peak_engagement_times: data.engagement.peakEngagementTimes || [],
              engagement_by_content_type: data.engagement.engagementByContentType || {},
              audience_growth_rate: data.engagement.audienceGrowthRate || 0,
              engagement_consistency: data.engagement.engagementConsistency || 'unknown'
            },
            content_analysis: {
              total_posts: data.content.totalPosts,
              average_posts_per_week: data.content.averagePostsPerWeek,
              content_types: data.content.contentTypes,
              top_hashtags: data.content.topHashtags,
              posting_schedule: data.content.postingSchedule,
              content_themes: data.content.contentThemes || [],
              caption_length_avg: data.content.averageCaptionLength || 0,
              video_duration_avg: data.content.averageVideoDuration || 0,
              best_performing_content: data.content.bestPerformingContent || [],
              content_frequency: data.content.contentFrequency || {},
              content_strategy: data.content.contentStrategy || 'mixed'
            },
            recent_posts: data.content.posts.slice(0, 15).map(post => ({
              content: post.text || post.caption || post.title || '',
              engagement: {
                likes: post.like_count || post.favorite_count || 0,
                comments: post.comment_count || post.reply_count || 0,
                shares: post.retweet_count || post.share_count || 0,
                views: post.view_count || post.play_count || 0
              },
              created_at: post.created_time || post.created_at || post.publishedAt,
              content_type: competitorDataCollector.determineContentType(post, data.profile.platform),
              hashtags: post.hashtags || [],
              mentions: post.mentions || [],
              media_urls: post.mediaUrls || [],
              caption_sentiment: post.sentiment || 'neutral',
              content_length: (post.text || post.caption || post.title || '').length,
              engagement_rate: post.engagement_rate || 0
            })),
            data_quality: data.dataQuality,
            competitor_insights: {
              niche: data.profile.niche || data.profile.category || 'general',
              content_strategy: data.content.contentStrategy || 'mixed',
              brand_collaborations: data.profile.brandCollaborations || [],
              monetization_methods: data.profile.monetizationMethods || [],
              audience_demographics: data.profile.audienceDemographics || {}
            }
          })),
          
          // Analysis Metadata
          metadata: {
            generated_at: new Date().toISOString(),
            processing_time_ms: aiResponse.processing_time_ms || 0,
            data_quality_score: Math.round(
              successfulData.reduce((sum, d) => sum + d.dataQuality.score, 0) / successfulData.length
            ),
            platforms_analyzed: [...new Set(successfulData.map(d => d.profile.platform))],
            total_posts_analyzed: successfulData.reduce((sum, d) => sum + d.content.totalPosts, 0)
          }
        },
        
        // Errors (if any)
        ...(failedData.length > 0 && {
          warnings: {
            failed_competitors: failedData.map(f => ({
              url: f.profileUrl,
              error: f.error
            }))
          }
        })
      }
    };

    logger.info('Competitor analysis completed successfully', {
      userId,
      analysisId: aiResultRecord._id,
      competitorsAnalyzed: successfulData.length,
      processingTime: aiResponse.processing_time_ms
    });

    res.status(HTTP_STATUS.CREATED).json(response);

  } catch (error) {
    logger.error('Competitor analysis failed:', {
      userId,
      campaignId,
      error: error.message,
      stack: error.stack
    });

    // Store failed analysis record
    try {
      await AIResults.create({
        user_id: userId,
        campaign_id: campaignId || null,
        result_type: 'competitor_analysis',
        input_data: {
          competitor_urls: competitorUrls,
          analysis_type: analysisType,
          options: options
        },
        status: 'failed',
        error_details: {
          message: error.message,
          timestamp: new Date()
        }
      });
    } catch (dbError) {
      logger.error('Failed to store error record:', dbError);
    }

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Competitor analysis failed',
      error: error.message
    });
  }
});

/**
 * Get competitor analysis results
 */
const getAnalysisResults = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { analysisId } = req.params;

  const analysis = await AIResults.findOne({
    _id: analysisId,
    user_id: userId,
    result_type: 'competitor_analysis'
  });

  if (!analysis) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Analysis not found'
    });
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: analysis
  });
});

/**
 * Test AI Services connection
 */
const testAIServices = asyncHandler(async (req, res) => {
  const userId = req.userId;

  try {
    logger.info('Testing AI Services connection', { userId });

    // Test basic health check
    const healthResponse = await aiClient.healthCheck();
    
    // Test competitor analysis endpoint with minimal data
    const testPayload = {
      user_id: userId,
      analysis_type: 'test',
      competitors_data: [{
        platform: 'instagram',
        username: 'test_user',
        profile_url: 'https://instagram.com/test_user',
        verified: false,
        profile_metrics: {
          followers: 1000,
          following: 500,
          posts_count: 50,
          engagement_rate: 5.0,
          verified: false
        },
        content_analysis: {
          total_posts: 50,
          average_posts_per_week: 3,
          content_types: { image: 40, video: 10 },
          top_hashtags: ['test', 'example'],
          posting_schedule: {}
        },
        engagement_metrics: {
          average_likes: 50,
          average_comments: 5,
          average_shares: 2,
          total_engagement: 57,
          engagement_trend: 'stable'
        },
        recent_posts: [],
        data_quality: { level: 'high', score: 90 }
      }],
      analysis_options: {
        include_content_analysis: true,
        include_engagement_analysis: true,
        include_audience_analysis: false,
        include_competitive_insights: false,
        include_recommendations: false,
        include_realtime_data: false,
        platform_specific: true
      },
      metadata: {
        total_competitors: 1,
        platforms_analyzed: ['instagram'],
        data_collection_timestamp: new Date().toISOString(),
        analysis_request_id: `test_${Date.now()}_${userId}`
      },
      collected_at: new Date().toISOString()
    };

    const testResponse = await aiClient.competitorAnalysis(testPayload);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'AI Services connection successful',
      data: {
        health_check: healthResponse,
        test_analysis: {
          status: 'success',
          processing_time: testResponse.processing_time_ms,
          confidence_score: testResponse.confidence_score,
          model_version: testResponse.model_version
        },
        ai_service_url: process.env.AI_SERVICE_URL || 'https://api-ai-services.bloocube.com',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('AI Services test failed', {
      userId,
      error: error.message,
      status: error.response?.status
    });

    res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
      success: false,
      message: 'AI Services connection failed',
      error: error.message,
      details: {
        ai_service_url: process.env.AI_SERVICE_URL || 'https://api-ai-services.bloocube.com',
        timestamp: new Date().toISOString()
      }
    });
  }
});

/**
 * Fetch competitor data without AI analysis (preview step)
 */
const fetchCompetitorData = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const {
    competitorUrl,
    platform
  } = req.body;

  // Validation
  if (!competitorUrl) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Competitor URL is required'
    });
  }

  try {
    logger.info('Fetching competitor data for preview', {
      userId,
      competitorUrl,
      platform
    });

    // Parse the URL to extract platform and username
    const { platform: detectedPlatform, username, type } = competitorDataCollector.parseProfileUrl(competitorUrl);
    const targetPlatform = platform || detectedPlatform;

    if (!targetPlatform) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Unable to detect platform from URL'
      });
    }

    // Get the appropriate service
    const service = competitorDataCollector.services[targetPlatform];
    if (!service) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Platform ${targetPlatform} is not supported`
      });
    }

    // Initialize service with environment credentials
    console.log('Environment variables check:', {
      TWITTER_CLIENT_ID: process.env.TWITTER_CLIENT_ID ? `${process.env.TWITTER_CLIENT_ID.substring(0, 10)}...` : 'undefined',
      TWITTER_CLIENT_SECRET: process.env.TWITTER_CLIENT_SECRET ? `${process.env.TWITTER_CLIENT_SECRET.substring(0, 10)}...` : 'undefined',
      TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN ? `${process.env.TWITTER_BEARER_TOKEN.substring(0, 10)}...` : 'undefined'
    });

    const apiCredentials = {
      instagram: {
        clientId: process.env.INSTAGRAM_CLIENT_ID,
        clientSecret: process.env.INSTAGRAM_CLIENT_SECRET
      },
      twitter: {
        clientId: process.env.TWITTER_CLIENT_ID,
        clientSecret: process.env.TWITTER_CLIENT_SECRET,
        bearerToken: process.env.TWITTER_BEARER_TOKEN
      },
      youtube: {
        clientId: process.env.YOUTUBE_CLIENT_ID,
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
        apiKey: process.env.YOUTUBE_API_KEY
      },
      linkedin: {
        clientId: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET
      },
      facebook: {
        clientId: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET
      }
    };

    if (apiCredentials[targetPlatform]) {
      console.log(`Passing credentials for ${targetPlatform}:`, {
        platform: targetPlatform,
        hasClientId: !!apiCredentials[targetPlatform].clientId,
        hasClientSecret: !!apiCredentials[targetPlatform].clientSecret,
        hasApiKey: !!apiCredentials[targetPlatform].apiKey,
        hasBearerToken: !!apiCredentials[targetPlatform].bearerToken,
        clientIdPreview: apiCredentials[targetPlatform].clientId ? `${apiCredentials[targetPlatform].clientId.substring(0, 10)}...` : 'none',
        clientSecretPreview: apiCredentials[targetPlatform].clientSecret ? `${apiCredentials[targetPlatform].clientSecret.substring(0, 10)}...` : 'none'
      });
      
      await competitorDataCollector.initializeServiceWithCredentials(
        service, 
        targetPlatform, 
        apiCredentials[targetPlatform]
      );
    }

    // Fetch profile data
    const profileData = await competitorDataCollector.collectProfileData(
      service, 
      targetPlatform, 
      username, 
      type, 
      { useEnvironmentCredentials: true }
    );

    // Guard: profile fetch failed or not implemented
    if (profileData && profileData.error) {
      const errText = String(profileData.error).toLowerCase();
      if (errText.includes('not implemented') || errText.includes('missing')) {
        return res.status(HTTP_STATUS.NOT_IMPLEMENTED).json({
          success: false,
          message: `Platform integration not available for ${targetPlatform}.`
        });
      }
      if (errText.includes('no profile') || errText.includes('not found')) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: `No user found on ${targetPlatform}.`
        });
      }
      return res.status(HTTP_STATUS.BAD_GATEWAY).json({
        success: false,
        message: `Failed to fetch ${targetPlatform} profile: ${profileData.error}`
      });
    }

    // Fetch recent content (limited for preview)
    // For YouTube, we need to use the channel ID from the profile data
    const contentUsername = targetPlatform === 'youtube' && profileData.id ? profileData.id : username;
    const contentData = await competitorDataCollector.collectContentData(
      service, 
      targetPlatform, 
      contentUsername, 
      { maxPosts: 10, timePeriodDays: 7 }
    );

    // Guard: content fetch failed (e.g., method missing or API error)
    if (contentData && contentData.error) {
      return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        success: false,
        message: `Unable to fetch ${targetPlatform} posts: ${contentData.error}`
      });
    }

    // Calculate basic engagement metrics
    const engagementData = competitorDataCollector.calculateEngagementMetrics(contentData);

    // Structure the preview data
    const previewData = {
      profile: {
        platform: targetPlatform,
        username,
        profileUrl: competitorUrl,
        ...profileData
      },
      content: {
        recentPosts: contentData.posts || [],
        totalPosts: contentData.totalPosts || 0,
        averagePostsPerWeek: contentData.averagePostsPerWeek || 0,
        contentTypes: contentData.contentTypes || {},
        topHashtags: contentData.topHashtags || []
      },
      engagement: {
        ...engagementData,
        engagementRate: competitorDataCollector.calculateEngagementRate(profileData, engagementData)
      },
      dataQuality: competitorDataCollector.assessDataQuality(profileData, contentData, engagementData),
      fetchedAt: new Date()
    };

    logger.info('Competitor data fetched successfully', {
      userId,
      platform: targetPlatform,
      username,
      dataQuality: previewData.dataQuality.level
    });

    // If profile lacks key fields AND no posts were fetched, return not found/insufficient data
    const noProfileCore = !profileData || (!profileData.id && !profileData.username && !profileData.followers && !profileData.subscribers);
    if (noProfileCore && (previewData.content.totalPosts || 0) === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: `No data available for ${targetPlatform}. The user may be private or does not exist.`
      });
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: previewData
    });

  } catch (error) {
    logger.error('Failed to fetch competitor data:', {
      userId,
      competitorUrl,
      error: error.message,
      stack: error.stack
    });

    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch competitor data',
      error: error.message
    });
  }
});

/**
 * Get user's competitor analysis history
 */
const getAnalysisHistory = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { page = 1, limit = 10 } = req.query;

  const analyses = await AIResults.find({
    user_id: userId,
    result_type: 'competitor_analysis'
  })
  .sort({ createdAt: -1 })
  .limit(limit * 1)
  .skip((page - 1) * limit)
  .select('_id input_data ai_metadata status createdAt');

  const total = await AIResults.countDocuments({
    user_id: userId,
    result_type: 'competitor_analysis'
  });

  // Transform the data to match frontend expectations
  const transformedAnalyses = analyses.map(analysis => {
    const inputData = analysis.input_data || {};
    const competitorUrls = inputData.competitorUrls || inputData.competitor_urls || [];
    
    return {
      id: analysis._id.toString(),
      competitorUrls: competitorUrls,
      analysisType: inputData.analysisType || inputData.analysis_type || 'comprehensive',
      competitorsAnalyzed: competitorUrls.length,
      createdAt: analysis.createdAt.toISOString(),
      status: analysis.status || 'completed'
    };
  });

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      analyses: transformedAnalyses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

/**
 * Delete competitor analysis
 */
const deleteAnalysis = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const { analysisId } = req.params;

  const analysis = await AIResults.findOneAndDelete({
    _id: analysisId,
    user_id: userId,
    result_type: 'competitor_analysis'
  });

  if (!analysis) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Analysis not found'
    });
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'Analysis deleted successfully'
  });
});

module.exports = {
  analyzeCompetitors,
  getAnalysisResults,
  getAnalysisHistory,
  deleteAnalysis,
  fetchCompetitorData,
  testAIServices
};
