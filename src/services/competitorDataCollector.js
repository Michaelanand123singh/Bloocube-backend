const twitterService = require('./social/twitter');
const youtubeService = require('./social/youtube');
const instagramService = require('./social/instagram');
const linkedinService = require('./social/linkedin');
const facebookService = require('./social/facebook');
const logger = require('../utils/logger');

class CompetitorDataCollector {
  constructor() {
    this.services = {
      twitter: twitterService,
      youtube: youtubeService,
      instagram: instagramService,
      linkedin: linkedinService,
      facebook: facebookService
    };
  }

  /**
   * Extract platform and username from social media URL
   * @param {string} profileUrl - Social media profile URL
   * @returns {Object} - {platform, username}
   */
  parseProfileUrl(profileUrl) {
    try {
      const url = new URL(profileUrl);
      const hostname = url.hostname.toLowerCase();
      const pathname = url.pathname;

      // Twitter/X
      if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
        const username = pathname.split('/')[1];
        return { platform: 'twitter', username: username?.replace('@', '') };
      }

      // Instagram
      if (hostname.includes('instagram.com')) {
        const username = pathname.split('/')[1];
        return { platform: 'instagram', username: username?.replace('@', '') };
      }

      // YouTube
      if (hostname.includes('youtube.com')) {
        if (pathname.includes('/channel/')) {
          const channelId = pathname.split('/channel/')[1]?.split('?')[0];
          return { platform: 'youtube', username: channelId, type: 'channel' };
        } else if (pathname.includes('/c/')) {
          const username = pathname.split('/c/')[1]?.split('?')[0];
          return { platform: 'youtube', username, type: 'custom' };
        } else if (pathname.includes('/user/')) {
          const username = pathname.split('/user/')[1]?.split('?')[0];
          return { platform: 'youtube', username, type: 'user' };
        } else if (pathname.includes('/@')) {
          const username = pathname.split('/@')[1]?.split('?')[0];
          return { platform: 'youtube', username, type: 'handle' };
        }
      }

      // LinkedIn
      if (hostname.includes('linkedin.com')) {
        if (pathname.includes('/in/')) {
          const username = pathname.split('/in/')[1]?.split('/')[0];
          return { platform: 'linkedin', username, type: 'personal' };
        } else if (pathname.includes('/company/')) {
          const username = pathname.split('/company/')[1]?.split('/')[0];
          return { platform: 'linkedin', username, type: 'company' };
        }
      }

      // Facebook
      if (hostname.includes('facebook.com')) {
        const username = pathname.split('/')[1];
        return { platform: 'facebook', username };
      }

      throw new Error('Unsupported platform or invalid URL format');
    } catch (error) {
      logger.error('Error parsing profile URL:', { profileUrl, error: error.message });
      throw new Error(`Invalid profile URL: ${error.message}`);
    }
  }

  /**
   * Collect comprehensive competitor profile data
   * @param {string} profileUrl - Social media profile URL
   * @param {Object} options - Collection options
   * @returns {Object} - Structured competitor data
   */
  async collectCompetitorData(profileUrl, options = {}) {
    try {
      const { platform, username, type } = this.parseProfileUrl(profileUrl);
      const service = this.services[platform];

      if (!service) {
        throw new Error(`Service not available for platform: ${platform}`);
      }

      logger.info('Collecting competitor data', {
        platform,
        username,
        profileUrl,
        useEnvironmentCredentials: options.useEnvironmentCredentials,
        fetchRealTimeData: options.fetchRealTimeData
      });

      // Initialize service with environment credentials if available
      if (options.useEnvironmentCredentials && options.apiCredentials?.[platform]) {
        await this.initializeServiceWithCredentials(service, platform, options.apiCredentials[platform]);
      }

      // Get platform-specific data
      const profileData = await this.collectProfileData(service, platform, username, type, options);
      
      // For YouTube, use the returned channel ID (profileData.id) for content collection
      const contentUsername = (platform === 'youtube' && profileData.id) ? profileData.id : username;
      
      const contentData = await this.collectContentData(service, platform, contentUsername, options);
      const engagementData = await this.calculateEngagementMetrics(contentData);

      // Structure the collected data with enhanced details
      const competitorData = {
        profile: {
          platform,
          username,
          profileUrl,
          ...profileData,
          // Enhanced profile data
          bio: profileData.bio || profileData.description || '',
          website: profileData.website || profileData.externalUrl || '',
          location: profileData.location || '',
          joinDate: profileData.joinDate || profileData.createdAt || '',
          niche: profileData.niche || profileData.category || 'general',
          brandCollaborations: profileData.brandCollaborations || [],
          monetizationMethods: profileData.monetizationMethods || [],
          audienceDemographics: profileData.audienceDemographics || {}
        },
        content: {
          posts: contentData.posts || [],
          totalPosts: contentData.totalPosts || 0,
          averagePostsPerWeek: contentData.averagePostsPerWeek || 0,
          contentTypes: contentData.contentTypes || {},
          topHashtags: contentData.topHashtags || [],
          postingSchedule: contentData.postingSchedule || {},
          // Enhanced content analysis
          contentThemes: this.analyzeContentThemes(contentData.posts || []),
          averageCaptionLength: this.calculateAverageCaptionLength(contentData.posts || []),
          averageVideoDuration: this.calculateAverageVideoDuration(contentData.posts || []),
          bestPerformingContent: this.identifyBestPerformingContent(contentData.posts || []),
          contentFrequency: this.analyzeContentFrequency(contentData.posts || []),
          contentStrategy: this.determineContentStrategy(contentData.posts || [])
        },
        engagement: {
          ...engagementData,
          engagementRate: this.calculateEngagementRate(profileData, engagementData),
          growthRate: await this.estimateGrowthRate(service, platform, username),
          // Enhanced engagement insights
          peakEngagementTimes: this.analyzePeakEngagementTimes(contentData.posts || []),
          engagementByContentType: this.analyzeEngagementByContentType(contentData.posts || []),
          audienceGrowthRate: await this.calculateAudienceGrowthRate(service, platform, username),
          engagementConsistency: this.assessEngagementConsistency(contentData.posts || [])
        },
        audience: await this.analyzeAudience(service, platform, username, options),
        collectedAt: new Date(),
        dataQuality: this.assessDataQuality(profileData, contentData, engagementData)
      };

      logger.info('Competitor data collected successfully', {
        platform,
        username,
        postsCollected: contentData.posts?.length || 0,
        dataQuality: competitorData.dataQuality
      });

      return competitorData;

    } catch (error) {
      logger.error('Error collecting competitor data:', {
        profileUrl,
        error: error.message,
        stack: error.stack
      });
      // Return a structured error object
      return {
        profileUrl,
        error: error.message,
        collectedAt: new Date()
      };
    }
  }

  /**
   * Collect profile data from specific platform
   */
  async collectProfileData(service, platform, username, type, options) {
    try {
      switch (platform) {
        case 'twitter':
          return await this.collectTwitterProfile(service, username);
        case 'instagram':
          return await this.collectInstagramProfile(service, username);
        case 'youtube':
          return await this.collectYouTubeProfile(service, username, type);
        case 'linkedin':
          return await this.collectLinkedInProfile(service, username, type);
        case 'facebook':
          return await this.collectFacebookProfile(service, username);
        default:
          throw new Error(`Unsupported platform: ${platform}`);
      }
    } catch (error) {
      logger.error(`Error collecting ${platform} profile:`, { username, error: error.message });
      return { error: error.message, platform, username };
    }
  }

  /**
   * Collect Twitter profile data
   */
  async collectTwitterProfile(service, username) {
    try {
      // Use Twitter API v2 to get user profile
      const profile = await service.getUserByUsername(username);

      if (!profile || profile.error) {
        throw new Error(profile.error || 'Failed to fetch Twitter profile');
      }
      
      return {
        id: profile.id,
        name: profile.name,
        username: profile.username,
        description: profile.description,
        followers: profile.public_metrics?.followers_count || 0,
        following: profile.public_metrics?.following_count || 0,
        tweets: profile.public_metrics?.tweet_count || 0,
        listed: profile.public_metrics?.listed_count || 0,
        verified: profile.verified || false,
        profileImage: profile.profile_image_url,
        bannerImage: profile.header_image_url,
        location: profile.location,
        website: profile.url,
        createdAt: profile.created_at,
        isProtected: profile.protected || false
      };
    } catch (error) {
      logger.error('Twitter profile collection error:', { username, error: error.message });
      return {
        error: error.message,
        platform: 'twitter',
        username: username
      };
    }
  }

  /**
   * Collect Instagram profile data
   */
  async collectInstagramProfile(service, username) {
    try {
      // Use Instagram Basic Display API or Graph API
      let profileResult;
      if (typeof service.getUserProfile === 'function') {
        profileResult = await service.getUserProfile(username);
      } else if (typeof service.getUserByUsername === 'function') {
        logger.warn('instagram.getUserProfile not found, using getUserByUsername fallback', { username });
        const profile = await service.getUserByUsername(username);
        profileResult = profile ? { success: true, profile } : { success: false, error: 'No profile returned' };
      } else {
        logger.error('Instagram service missing profile fetch method');
        return { error: 'Instagram profile method not implemented', platform: 'instagram', username };
      }
      
      if (!profileResult.success) {
        return {
          error: profileResult.error || 'Failed to fetch Instagram profile',
          platform: 'instagram',
          username: username
        };
      }
      
      const profile = profileResult.profile;
      return {
        id: profile.id,
        username: profile.username,
        name: profile.full_name,
        biography: profile.biography,
        followers: profile.followers_count || 0,
        following: profile.follows_count || 0,
        posts: profile.media_count || 0,
        profileImage: profile.profile_picture_url,
        website: profile.external_url,
        isVerified: profile.is_verified || false,
        isPrivate: profile.is_private || false,
        businessCategory: profile.category_name,
        contactInfo: {
          email: profile.business_email,
          phone: profile.business_phone_number,
          address: profile.business_address
        }
      };
    } catch (error) {
      logger.error('Instagram profile collection error:', { username, error: error.message });
      return {
        error: error.message,
        platform: 'instagram',
        username: username
      };
    }
  }

  /**
   * Collect LinkedIn profile data
   */
  async collectLinkedInProfile(service, username, type) {
    try {
      logger.info('Collecting LinkedIn profile:', { username, type });

      let profile;
      if (typeof service.getUserProfile === 'function') {
        profile = await service.getUserProfile(username, { type });
      } else if (typeof service.getUserProfileByUsername === 'function') {
        profile = await service.getUserProfileByUsername(username, { type });
      } else if (typeof service.getProfile === 'function') {
        profile = await service.getProfile(username, { type });
      } else if (typeof service.getOrganizationByVanityName === 'function' && type === 'company') {
        profile = await service.getOrganizationByVanityName(username);
      } else if (typeof service.getUserByUsername === 'function') {
        profile = await service.getUserByUsername(username);
      } else {
        logger.error('LinkedIn service missing profile fetch method');
        return { error: 'LinkedIn profile method not implemented', platform: 'linkedin', username };
      }

      // ✅ **FIX APPLIED** ✅
      // Check if the service returned a "soft" error
      if (profile && profile.success === false) {
        // Re-throw the error so it can be caught properly by the main handler
        throw new Error(profile.error);
      }

      if (!profile || (!profile.id && !profile.success)) { // Check for success or id
        throw new Error('No LinkedIn profile data returned');
      }
      // ✅ **END OF FIX** ✅

      // Normalize common fields
      return {
        id: profile.id,
        username: username,
        name: profile.localizedFirstName && profile.localizedLastName
          ? `${profile.localizedFirstName} ${profile.localizedLastName}`
          : (profile.name || profile.vanityName || username),
        headline: profile.headline || profile.localizedHeadline,
        followers: profile.followers || profile.followerCount || 0,
        profileImage: profile.profilePictureUrl || (profile.profilePicture && profile.profilePicture.displayImageUrl),
        location: profile.location?.name,
        website: profile.website,
        isVerified: false
      };
    } catch (error) {
      logger.error('LinkedIn profile collection error:', { username, type, error: error.message });
      return {
        error: error.message,
        platform: 'linkedin',
        username
      };
    }
  }


  /**
   * Collect YouTube profile data
   */
  async collectYouTubeProfile(service, username, type) {
    try {
      logger.info('Collecting YouTube profile:', { username, type });
      
      let channelData;
      
      if (type === 'channel') {
        logger.info('Using channel ID method:', { channelId: username });
        channelData = await service.getChannelById(username);
      } else {
        logger.info('Using username search method:', { username, type });
        channelData = await service.getChannelByUsername(username);
      }
      
      if (!channelData) {
        throw new Error('No channel data returned');
      }
      
      logger.info('YouTube channel data collected successfully:', {
        channelId: channelData.id,
        title: channelData.snippet?.title
      });
      
      return {
        id: channelData.id,
        username: channelData.snippet?.customUrl || username, // Use custom URL or fallback to username
        name: channelData.snippet?.title,
        title: channelData.snippet?.title,
        description: channelData.snippet?.description,
        customUrl: channelData.snippet?.customUrl,
        publishedAt: channelData.snippet?.publishedAt,
        thumbnails: channelData.snippet?.thumbnails,
        followers: parseInt(channelData.statistics?.subscriberCount) || 0, // Map subscribers to followers
        subscribers: parseInt(channelData.statistics?.subscriberCount) || 0,
        posts: parseInt(channelData.statistics?.videoCount) || 0, // Map videos to posts
        videos: parseInt(channelData.statistics?.videoCount) || 0,
        views: parseInt(channelData.statistics?.viewCount) || 0,
        country: channelData.snippet?.country,
        keywords: channelData.brandingSettings?.channel?.keywords,
        uploads: channelData.contentDetails?.relatedPlaylists?.uploads,
        profileImage: channelData.snippet?.thumbnails?.default?.url,
        isVerified: false, // YouTube doesn't provide verification status in basic API
        website: null // YouTube doesn't provide website in basic API
      };
    } catch (error) {
      logger.error('YouTube profile collection error:', { username, type, error: error.message });
      return {
        error: error.message,
        platform: 'youtube',
        username: username
      };
    }
  }

  /**
   * Collect Facebook profile data
   */
  async collectFacebookProfile(service, username, type) {
    try {
      logger.info('Collecting Facebook profile:', { username, type });
      
      const pageData = await service.getPageByUsername(username);
      
      if (!pageData || pageData.error) {
        throw new Error(pageData.error || 'No page data returned');
      }
      
      logger.info('Facebook page data collected successfully:', {
        pageId: pageData.id,
        name: pageData.name
      });
      
      return {
        id: pageData.id,
        username: pageData.username || username,
        name: pageData.name,
        title: pageData.name,
        description: pageData.about || pageData.description,
        followers: parseInt(pageData.followers_count || pageData.fan_count) || 0,
        following: 0, // Facebook pages don't have following count
        posts: 0, // Will be calculated from content data
        views: 0, // Not available in basic API
        category: pageData.category,
        website: pageData.website,
        phone: pageData.phone,
        location: pageData.location?.name,
        profileImage: pageData.picture?.data?.url,
        coverImage: pageData.cover?.source,
        isVerified: pageData.verification_status || false,
        createdAt: pageData.created_time
      };
    } catch (error) {
      logger.error('Facebook profile collection error:', { username, type, error: error.message });
      return {
        error: error.message,
        platform: 'facebook',
        username: username
      };
    }
  }

  /**
   * Collect content data from platform
   */
  async collectContentData(service, platform, username, options = {}) {
    const maxPosts = options.maxPosts || 50;
    const timePeriod = options.timePeriodDays || 30;
    
    try {
      let posts = [];
      
      console.log('Collecting content data for platform:', { platform, username, maxPosts, timePeriod });
      
      switch (platform) {
        case 'twitter':
          posts = await service.getUserTweets(username, { max_results: maxPosts });
          break;
        case 'instagram':
          if (typeof service.getUserMedia === 'function') {
            const instagramResult = await service.getUserMedia(username, { limit: maxPosts });
            posts = instagramResult?.success ? instagramResult.media : [];
          } else if (typeof service.getUserPosts === 'function') {
            logger.warn('instagram.getUserMedia not found, using getUserPosts fallback', { username });
            const instagramResult = await service.getUserPosts(username, { limit: maxPosts });
            posts = Array.isArray(instagramResult) ? instagramResult : (instagramResult?.posts || []);
          } else {
            logger.error('Instagram service missing content fetch method');
            posts = [];
          }
          break;
        case 'youtube':
          // For YouTube, we need to get the channel ID first if we don't have it
          if (username.startsWith('UC') && username.length === 24) {
            // This is already a channel ID
            logger.info('Using channel ID for YouTube content collection:', { channelId: username });
            posts = await service.getChannelVideos(username, { maxResults: maxPosts });
          } else {
            // This is a username/handle, we need to find the channel ID first
            logger.info('Looking up channel ID for YouTube content collection:', { username });
            try {
              const channelData = await service.getChannelByUsername(username);
              if (channelData && channelData.id) {
                logger.info('Found channel ID, fetching videos:', { channelId: channelData.id });
                posts = await service.getChannelVideos(channelData.id, { maxResults: maxPosts });
              } else {
                logger.warn('No channel data found for YouTube content collection:', { username });
                posts = [];
              }
            } catch (error) {
              logger.error('Failed to get channel ID for YouTube content collection:', { username, error: error.message });
              posts = [];
            }
          }
          break;
        case 'linkedin':
          if (typeof service.getUserPosts === 'function') {
            const linkedinResult = await service.getUserPosts(username, { count: maxPosts });
            posts = linkedinResult?.success ? linkedinResult.posts : [];
          } else if (typeof service.getOrganizationPosts === 'function') {
            logger.warn('linkedin.getUserPosts not found, using getOrganizationPosts fallback', { username });
            const linkedinResult = await service.getOrganizationPosts(username, { count: maxPosts });
            posts = linkedinResult?.success ? linkedinResult.posts : [];
          } else {
            logger.error('LinkedIn service missing content fetch method');
            posts = [];
          }
          break;
        case 'facebook':
          posts = await service.getPagePosts(username, { limit: maxPosts });
          break;
      }

      console.log('Posts collected:', {
        platform,
        postsCount: Array.isArray(posts) ? posts.length : 'not an array',
        postsType: typeof posts,
        firstPost: Array.isArray(posts) && posts[0] ? posts[0].id : 'no posts'
      });

      // Ensure posts is an array
      if (!Array.isArray(posts)) {
        console.error('Posts is not an array:', { posts, type: typeof posts });
        posts = [];
      }

      // Filter posts by time period
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timePeriod);
      
      const recentPosts = posts.filter(post => {
        const postDate = new Date(post.created_time || post.created_at || post.publishedAt);
        return postDate >= cutoffDate;
      });

      // Analyze content patterns
      const contentAnalysis = this.analyzeContentPatterns(recentPosts, platform);

      return {
        posts: recentPosts,
        totalPosts: recentPosts.length,
        averagePostsPerWeek: (recentPosts.length / timePeriod) * 7,
        ...contentAnalysis
      };

    } catch (error) {
      logger.error(`Error collecting ${platform} content:`, { username, error: error.message });
      return { posts: [], totalPosts: 0, error: error.message };
    }
  }

  /**
   * Analyze content patterns
   */
  analyzeContentPatterns(posts, platform) {
    const contentTypes = {};
    const hashtags = {};
    const postingTimes = {};
    const postingDays = {};

    posts.forEach(post => {
      // Content type analysis
      const type = this.determineContentType(post, platform);
      contentTypes[type] = (contentTypes[type] || 0) + 1;

      // Hashtag analysis
      const postHashtags = this.extractHashtags(post.text || post.caption || '');
      postHashtags.forEach(tag => {
        hashtags[tag] = (hashtags[tag] || 0) + 1;
      });

      // Posting time analysis
      const postDate = new Date(post.created_time || post.created_at || post.publishedAt);
      const hour = postDate.getHours();
      const day = postDate.toLocaleDateString('en-US', { weekday: 'long' });
      
      postingTimes[hour] = (postingTimes[hour] || 0) + 1;
      postingDays[day] = (postingDays[day] || 0) + 1;
    });

    // Get top hashtags
    const topHashtags = Object.entries(hashtags)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));

    return {
      contentTypes,
      topHashtags,
      postingSchedule: {
        bestHours: this.getTopEntries(postingTimes, 5),
        bestDays: this.getTopEntries(postingDays, 3)
      }
    };
  }

  /**
   * Calculate engagement metrics
   */
  calculateEngagementMetrics(contentData) {
    const posts = contentData.posts || [];
    
    console.log('Calculating engagement metrics:', {
      postsCount: posts.length,
      firstPost: posts[0] ? {
        id: posts[0].id,
        has_likes: posts[0].likes, // For YouTube
        has_likeCount: posts[0].likeCount, // For YouTube
        has_public_metrics: posts[0].public_metrics, // For Twitter
        like_count: posts[0].like_count, // For Twitter v1/Facebook
        comment_count: posts[0].comment_count // For Twitter v1/Facebook
      } : 'no posts'
    });
    
    if (posts.length === 0) {
      return {
        averageLikes: 0,
        averageComments: 0,
        averageShares: 0,
        totalEngagement: 0,
        engagementTrend: 'stable'
      };
    }

    // ✅ **FIX APPLIED** ✅
    const metrics = posts.reduce((acc, post) => {
      // Handle different platform field names
      // (Twitter v2)                   || (Twitter v1/FB) || (YouTube) || (YouTube)   || 0
      const likes = post.public_metrics?.like_count || post.like_count || post.likes || post.likeCount || 0;
      // (Twitter v2)                     || (Twitter v1/FB)   || (YouTube)    || (YouTube)      || 0
      const comments = post.public_metrics?.reply_count || post.comment_count || post.comments || post.commentCount || 0;
      // (Twitter v2)                     || (Twitter v1/FB)   || (FB)     || 0
      const shares = post.public_metrics?.retweet_count || post.retweet_count || post.shares?.count || 0;
      
      acc.likes += Number(likes) || 0;
      acc.comments += Number(comments) || 0;
      acc.shares += Number(shares) || 0;
      
      console.log('Post engagement:', {
        postId: post.id,
        likes,
        comments,
        shares,
        total: (Number(likes) || 0) + (Number(comments) || 0) + (Number(shares) || 0)
      });
      
      return acc;
    }, { likes: 0, comments: 0, shares: 0 });
    // ✅ **END OF FIX** ✅

    const totalEngagement = metrics.likes + metrics.comments + metrics.shares;
    const averageEngagement = Math.round(totalEngagement / posts.length);

    console.log('Engagement calculation result:', {
      totalLikes: metrics.likes,
      totalComments: metrics.comments,
      totalShares: metrics.shares,
      totalEngagement,
      averageEngagement,
      postsCount: posts.length
    });

    return {
      averageLikes: Math.round(metrics.likes / posts.length),
      averageComments: Math.round(metrics.comments / posts.length),
      averageShares: Math.round(metrics.shares / posts.length),
      totalEngagement,
      averageEngagement,
      engagementTrend: this.calculateEngagementTrend(posts)
    };
  }


  /**
   * Calculate engagement rate
   */
  calculateEngagementRate(profileData, engagementData) {
    const followers = profileData.followers || profileData.subscribers || 1;
    const avgEngagement = engagementData.averageEngagement || 0;
    
    // Ensure followers is a positive number
    const validFollowers = followers > 0 ? followers : 1;
    
    const engagementRate = ((avgEngagement / validFollowers) * 100).toFixed(2);
    
    console.log('Calculating engagement rate:', {
      followers: validFollowers,
      avgEngagement,
      engagementRate,
      profileData: {
        followers: profileData.followers,
        subscribers: profileData.subscribers
      },
      engagementData: {
        averageEngagement: engagementData.averageEngagement,
        totalEngagement: engagementData.totalEngagement
      }
    });
    
    return engagementRate;
  }

  /**
   * Estimate growth rate
   */
  async estimateGrowthRate(service, platform, username) {
    try {
      // This would require historical data or multiple data points
      // For now, return a placeholder that could be enhanced with actual tracking
      return {
        followersGrowthRate: 0, // Would need historical data
        engagementGrowthRate: 0, // Would need historical data
        estimatedMonthlyGrowth: 0,
        note: 'Growth rate calculation requires historical data tracking'
      };
    } catch (error) {
      logger.error('Error estimating growth rate:', { platform, username, error: error.message });
      return { error: error.message };
    }
  }

  /**
   * Analyze audience demographics (limited by API availability)
   */
  async analyzeAudience(service, platform, username, options) {
    try {
      // Most platforms don't provide audience demographics for public profiles
      // This would be enhanced based on available API data
      return {
        note: 'Audience demographics require platform-specific API access',
        estimatedDemographics: {
          ageGroups: {},
          genderDistribution: {},
          topLocations: [],
          interests: []
        }
      };
    } catch (error) {
      logger.error('Error analyzing audience:', { platform, username, error: error.message });
      return { error: error.message };
    }
  }

  /**
   * Assess data quality
   */
  assessDataQuality(profileData, contentData, engagementData) {
    let score = 0;
    const factors = [];

    // Profile data quality
    if (profileData && !profileData.error) {
      score += 30;
      factors.push('profile_data_available');
    }

    // Content data quality
    if (contentData.posts && contentData.posts.length > 0) {
      score += 40;
      factors.push('content_data_available');
      
      if (contentData.posts.length >= 10) {
        score += 10;
        factors.push('sufficient_content_sample');
      }
    }

    // Engagement data quality
    if (engagementData.totalEngagement > 0) {
      score += 20;
      factors.push('engagement_data_available');
    }

    return {
      score: Math.min(score, 100),
      level: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low',
      factors
    };
  }

  /**
   * Initialize service with environment credentials
   */
  async initializeServiceWithCredentials(service, platform, credentials) {
    try {
      logger.info(`Initializing ${platform} service with credentials:`, {
        platform,
        hasClientId: !!credentials.clientId,
        hasClientSecret: !!credentials.clientSecret,
        hasApiKey: !!credentials.apiKey,
        hasBearerToken: !!credentials.bearerToken,
        isPlaceholder: credentials.clientId?.includes('YOUR_') || credentials.clientSecret?.includes('YOUR_') || credentials.apiKey?.includes('YOUR_') || credentials.bearerToken?.includes('YOUR_')
      });

      // Check required credentials based on platform
      if (platform === 'youtube') {
        if (!credentials.apiKey || credentials.apiKey.includes('YOUR_')) {
          logger.warn(`Missing or invalid API key for ${platform}`, { hasApiKey: !!credentials.apiKey, isPlaceholder: credentials.apiKey?.includes('YOUR_') });
          return;
        }
      } else if (platform === 'twitter') {
        // Twitter can generate Bearer token from client credentials, so we only need client ID and secret
        if (!credentials.clientId || !credentials.clientSecret ||
            credentials.clientId.includes('YOUR_') || credentials.clientSecret.includes('YOUR_')) {
          logger.warn(`Missing or invalid credentials for ${platform}`, {
            hasClientId: !!credentials.clientId,
            hasClientSecret: !!credentials.clientSecret,
            isPlaceholder: credentials.clientId?.includes('YOUR_') || credentials.clientSecret?.includes('YOUR_')
          });
          return;
        }
        logger.info(`Twitter will generate Bearer token from client credentials`);
      } else {
        if (!credentials.clientId || !credentials.clientSecret ||
            credentials.clientId.includes('YOUR_') || credentials.clientSecret.includes('YOUR_')) {
          logger.warn(`Missing or invalid credentials for ${platform}`, {
            hasClientId: !!credentials.clientId,
            hasClientSecret: !!credentials.clientSecret,
            isPlaceholder: credentials.clientId?.includes('YOUR_') || credentials.clientSecret?.includes('YOUR_')
          });
          return;
        }
      }

            // Platform-specific initialization
            switch (platform) {
              case 'instagram':
                if (service.setCredentials) {
                  await service.setCredentials(credentials.clientId, credentials.clientSecret);
                }
                break;
              case 'twitter':
                if (service.setCredentials) {
                  await service.setCredentials(credentials.clientId, credentials.clientSecret, credentials.bearerToken);
                }
                break;
              case 'youtube':
                if (service.setCredentials) {
                  await service.setCredentials(credentials.clientId, credentials.clientSecret, credentials.apiKey);
                }
                break;
              case 'linkedin':
                if (service.setCredentials) {
                  await service.setCredentials(credentials.clientId, credentials.clientSecret);
                }
                break;
              case 'facebook':
                if (service.setCredentials) {
                  await service.setCredentials(credentials.clientId, credentials.clientSecret);
                }
                break;
            }

      logger.info(`Service initialized with credentials for ${platform}`);
    } catch (error) {
      logger.error(`Failed to initialize ${platform} service with credentials:`, error);
      // Don't throw error, continue without credentials
    }
  }

  /**
   * Helper methods
   */
  determineContentType(post, platform) {
    // Platform-specific content type determination
    switch (platform) {
      case 'twitter':
        if (post.attachments?.media_keys) return 'media';
        if (post.referenced_tweets) return 'retweet';
        return 'text';
      case 'instagram':
        return post.media_type || 'image';
      case 'youtube':
        return 'video';
      default:
        return 'post';
    }
  }

  extractHashtags(text) {
    if (!text) return [];
    const hashtagRegex = /#[\w]+/g;
    return (text.match(hashtagRegex) || []).map(tag => tag.toLowerCase());
  }

  getTopEntries(obj, limit) {
    return Object.entries(obj)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([key, value]) => ({ key, value }));
  }

  calculateEngagementTrend(posts) {
    if (posts.length < 5) return 'insufficient_data';
    
    const recent = posts.slice(0, Math.floor(posts.length / 2));
    const older = posts.slice(Math.floor(posts.length / 2));
    
    const recentAvg = recent.reduce((sum, post) => {
      const likes = post.public_metrics?.like_count || post.like_count || post.likes || post.likeCount || 0;
      const comments = post.public_metrics?.reply_count || post.comment_count || post.comments || post.commentCount || 0;
      return sum + (Number(likes) || 0) + (Number(comments) || 0);
    }, 0) / recent.length;
    
    const olderAvg = older.reduce((sum, post) => {
      const likes = post.public_metrics?.like_count || post.like_count || post.likes || post.likeCount || 0;
      const comments = post.public_metrics?.reply_count || post.comment_count || post.comments || post.commentCount || 0;
      return sum + (Number(likes) || 0) + (Number(comments) || 0);
    }, 0) / older.length;

    if (olderAvg === 0) {
      return recentAvg > 0 ? 'increasing' : 'stable';
    }
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  // Enhanced content analysis methods
  analyzeContentThemes(posts) {
    const themes = {};
    const keywords = ['tutorial', 'review', 'unboxing', 'challenge', 'behind-the-scenes', 'lifestyle', 'fashion', 'food', 'travel', 'fitness', 'tech', 'beauty', 'gaming', 'music', 'art', 'business', 'motivation', 'comedy', 'dance', 'cooking'];
    
    posts.forEach(post => {
      const text = (post.text || post.caption || post.title || '').toLowerCase();
      keywords.forEach(keyword => {
        if (text.includes(keyword)) {
          themes[keyword] = (themes[keyword] || 0) + 1;
        }
      });
    });
    
    return Object.entries(themes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([theme, count]) => ({ theme, count }));
  }

  calculateAverageCaptionLength(posts) {
    if (posts.length === 0) return 0;
    
    const totalLength = posts.reduce((sum, post) => {
      const text = post.text || post.caption || post.title || '';
      return sum + text.length;
    }, 0);
    
    return Math.round(totalLength / posts.length);
  }

  calculateAverageVideoDuration(posts) {
    const videoPosts = posts.filter(post => post.video_duration || post.duration);
    if (videoPosts.length === 0) return 0;
    
    const totalDuration = videoPosts.reduce((sum, post) => {
      return sum + (post.video_duration || post.duration || 0);
    }, 0);
    
    return Math.round(totalDuration / videoPosts.length);
  }

  identifyBestPerformingContent(posts) {
    return posts
      .map(post => ({
        content: post.text || post.caption || post.title || '',
        engagement: (post.public_metrics?.like_count || post.like_count || post.likes || post.likeCount || 0) +
                    (post.public_metrics?.reply_count || post.comment_count || post.comments || post.commentCount || 0) +
                    (post.public_metrics?.retweet_count || post.retweet_count || post.shares?.count || 0),
        created_at: post.created_time || post.created_at || post.publishedAt,
        content_type: post.content_type || 'unknown'
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 3);
  }

  analyzeContentFrequency(posts) {
    const frequency = {};
    posts.forEach(post => {
      const date = new Date(post.created_time || post.created_at || post.publishedAt);
      const dayOfWeek = date.getDay();
      const hour = date.getHours();
      
      frequency[dayOfWeek] = (frequency[dayOfWeek] || 0) + 1;
      frequency[`hour_${hour}`] = (frequency[`hour_${hour}`] || 0) + 1;
    });
    
    return frequency;
  }

  determineContentStrategy(posts) {
    const strategies = {
      'educational': 0,
      'entertainment': 0,
      'promotional': 0,
      'personal': 0,
      'collaborative': 0
    };
    
  posts.forEach(post => {
      const text = (post.text || post.caption || post.title || '').toLowerCase();
      
      if (text.includes('how to') || text.includes('tutorial') || text.includes('guide')) {
        strategies.educational++;
      }
      if (text.includes('funny') || text.includes('joke') || text.includes('comedy')) {
        strategies.entertainment++;
      }
      if (text.includes('buy') || text.includes('discount') || text.includes('promo')) {
        strategies.promotional++;
      }
      if (text.includes('i') || text.includes('my') || text.includes('personal')) {
        strategies.personal++;
      }
      if (text.includes('collab') || text.includes('partnership') || text.includes('with')) {
        strategies.collaborative++;
      }
    });
    
    return Object.entries(strategies)
      .sort(([,a], [,b]) => b - a)[0][0];
  }

  // Enhanced engagement analysis methods
  analyzePeakEngagementTimes(posts) {
    const hourlyEngagement = {};
    
    posts.forEach(post => {
      const date = new Date(post.created_time || post.created_at || post.publishedAt);
      const hour = date.getHours();
      const engagement = (post.public_metrics?.like_count || post.like_count || post.likes || post.likeCount || 0) +
                       (post.public_metrics?.reply_count || post.comment_count || post.comments || post.commentCount || 0) +
                       (post.public_metrics?.retweet_count || post.retweet_count || post.shares?.count || 0);
      
      hourlyEngagement[hour] = (hourlyEngagement[hour] || 0) + engagement;
    });
    
    return Object.entries(hourlyEngagement)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([hour, engagement]) => ({ hour: parseInt(hour), engagement }));
  }

  analyzeEngagementByContentType(posts) {
    const engagementByType = {};
    
    posts.forEach(post => {
      const contentType = post.content_type || 'unknown';
      const engagement = (post.public_metrics?.like_count || post.like_count || post.likes || post.likeCount || 0) +
                     (post.public_metrics?.reply_count || post.comment_count || post.comments || post.commentCount || 0) +
                     (post.public_metrics?.retweet_count || post.retweet_count || post.shares?.count || 0);
      
      if (!engagementByType[contentType]) {
        engagementByType[contentType] = { total: 0, count: 0 };
      }
      
      engagementByType[contentType].total += engagement;
      engagementByType[contentType].count += 1;
    });
    
    Object.keys(engagementByType).forEach(type => {
      engagementByType[type].average = engagementByType[type].count > 0 ? engagementByType[type].total / engagementByType[type].count : 0;
    });
    
    return engagementByType;
  }

  async calculateAudienceGrowthRate(service, platform, username) {
    try {
      // This would require historical data - for now return a placeholder
      return 0.05; // 5% growth rate placeholder
    } catch (error) {
      return 0;
    }
  }

  assessEngagementConsistency(posts) {
    if (posts.length < 5) return 'insufficient_data';
    
    const engagements = posts.map(post =>
      (post.public_metrics?.like_count || post.like_count || post.likes || post.likeCount || 0) +
      (post.public_metrics?.reply_count || post.comment_count || post.comments || post.commentCount || 0) +
      (post.public_metrics?.retweet_count || post.retweet_count || post.shares?.count || 0)
    );
    
    const avg = engagements.reduce((sum, engagement) => sum + engagement, 0) / engagements.length;
     
    if (avg === 0) return 'stable'; // Avoid division by zero if all engagements are 0
    
    const variance = engagements.reduce((sum, engagement) => sum + Math.pow(engagement - avg, 2), 0) / engagements.length;
    const stdDev = Math.sqrt(variance);
    const coefficient = stdDev / avg;
    
    if (coefficient < 0.3) return 'very_consistent';
    if (coefficient < 0.6) return 'consistent';
    if (coefficient < 1.0) return 'moderate';
    return 'inconsistent';
  }

  /**
   * Batch collect multiple competitors
   */
  async collectMultipleCompetitors(profileUrls, options = {}) {
    const results = [];
    const concurrency = options.concurrency || 3; // Limit concurrent requests
    
    for (let i = 0; i < profileUrls.length; i += concurrency) {
      const batch = profileUrls.slice(i, i + concurrency);
      const batchPromises = batch.map(url =>
        this.collectCompetitorData(url, options) // Errors are now caught inside and returned as objects
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Rate limiting delay between batches
      if (i + concurrency < profileUrls.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return results;
  }
}

module.exports = new CompetitorDataCollector();
