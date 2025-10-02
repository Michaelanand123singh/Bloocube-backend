// src/controllers/competitorController.js
const competitorDataCollector = require('../services/competitorDataCollector');
const competitorCache = require('../services/competitorCache');
const aiClient = require('../services/aiClient');
const AIResults = require('../models/AI_Results');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');
const logger = require('../utils/logger');

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
        urlsToCollect: misses.length
      });
      
      freshDataResults = await competitorDataCollector.collectMultipleCompetitors(
        misses,
        {
          maxPosts: options.maxPosts || 50,
          timePeriodDays: options.timePeriodDays || 30,
          concurrency: 3
        }
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
          cachedCount: Object.keys(freshDataMap).length
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
        include_recommendations: options.includeRecommendations !== false
      },
      collected_at: new Date().toISOString()
    };

    // Step 3: Send structured data to AI Services for analysis
    logger.info('Sending data to AI Services for analysis');
    const aiResponse = await aiClient.competitorAnalysis(aiAnalysisPayload);

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
        )
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
  deleteAnalysis
};
