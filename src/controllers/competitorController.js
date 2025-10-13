// src/controllers/competitorController.js
const competitorDataCollector = require('../services/competitorDataCollector');
const competitorCache = require('../services/competitorCache');
const aiClient = require('../services/aiClient');
const AIResults = require('../models/AI_Results');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

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

    // Step 2: Prepare structured data for AI analysis
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
          verified: data.profile.verified || data.profile.isVerified || false
        },
        content_analysis: {
          total_posts: data.content.totalPosts,
          average_posts_per_week: data.content.averagePostsPerWeek,
          content_types: data.content.contentTypes,
          top_hashtags: data.content.topHashtags,
          posting_schedule: data.content.postingSchedule
        },
        engagement_metrics: {
          average_likes: data.engagement.averageLikes,
          average_comments: data.engagement.averageComments,
          average_shares: data.engagement.averageShares,
          total_engagement: data.engagement.totalEngagement,
          engagement_trend: data.engagement.engagementTrend
        },
        recent_posts: data.content.posts.slice(0, 10).map(post => ({
          content: post.text || post.caption || post.title || '',
          engagement: {
            likes: post.like_count || post.favorite_count || 0,
            comments: post.comment_count || post.reply_count || 0,
            shares: post.retweet_count || post.share_count || 0
          },
          created_at: post.created_time || post.created_at || post.publishedAt,
          content_type: competitorDataCollector.determineContentType(post, data.profile.platform)
        })),
        data_quality: data.dataQuality
      })),
      analysis_options: {
        include_content_analysis: options.includeContentAnalysis !== false,
        include_engagement_analysis: options.includeEngagementAnalysis !== false,
        include_audience_analysis: options.includeAudienceAnalysis !== false,
        include_competitive_insights: options.includeCompetitiveInsights !== false,
        include_recommendations: options.includeRecommendations !== false,
        include_realtime_data: options.fetchRealTimeData === true,
        max_posts: options.maxPosts || 30,
        time_period_days: options.timePeriodDays || 30,
        platform_specific: options.platformSpecific === true
      },
      metadata: {
        total_competitors: successfulData.length,
        platforms_analyzed: [...new Set(successfulData.map(d => d.profile.platform))],
        data_collection_timestamp: new Date().toISOString(),
        analysis_request_id: `comp_${Date.now()}_${userId}`
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
          
          // Raw Data Summary
          competitors_data: successfulData.map(data => ({
            platform: data.profile.platform,
            username: data.profile.username,
            profile_url: data.profile.profileUrl,
            key_metrics: {
              followers: data.profile.followers || data.profile.subscribers || 0,
              engagement_rate: data.engagement.engagementRate,
              posts_analyzed: data.content.totalPosts,
              data_quality: data.dataQuality.level
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
        max_posts: 5,
        time_period_days: 7,
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

    // Fetch recent content (limited for preview)
    // For YouTube, we need to use the channel ID from the profile data
    const contentUsername = targetPlatform === 'youtube' && profileData.id ? profileData.id : username;
    const contentData = await competitorDataCollector.collectContentData(
      service, 
      targetPlatform, 
      contentUsername, 
      { maxPosts: 10, timePeriodDays: 7 }
    );

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

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      analyses,
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
