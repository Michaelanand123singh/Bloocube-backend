// src/services/engagementService.js
const axios = require('axios');
const { TwitterApi } = require('twitter-api-v2');
const youtubeService = require('./social/youtube');
const instagramService = require('./social/instagram');
const linkedinService = require('./social/linkedin');
const facebookService = require('./social/facebook');
const Post = require('../models/Post');

class EngagementService {
  constructor() {
    // Simple in-memory cache for metrics (TTL: 5 minutes)
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    this.platformSupport = {
      twitter: {
        supportsMetrics: true,
        supportsViews: false, // Twitter doesn't provide view counts via API for free
        supportsLikes: true,
        supportsComments: true,
        supportsShares: true,
        message: null
      },
      youtube: {
        supportsMetrics: true,
        supportsViews: true,
        supportsLikes: true,
        supportsComments: true,
        supportsShares: true,
        message: null
      },
      instagram: {
        supportsMetrics: true,
        supportsViews: true,
        supportsLikes: true,
        supportsComments: true,
        supportsShares: false, // Instagram doesn't have shares for posts
        message: null
      },
      linkedin: {
        supportsMetrics: false,
        supportsViews: false,
        supportsLikes: false,
        supportsComments: false,
        supportsShares: false,
        message: 'Coming soon - LinkedIn API metrics are limited and require special permissions'
      },
      facebook: {
        supportsMetrics: true,
        supportsViews: true, // Available via insights API
        supportsLikes: true,
        supportsComments: true,
        supportsShares: true,
        message: null
      }
    };
  }

  /**
   * Get platform support information
   */
  getPlatformSupport(platform) {
    return this.platformSupport[platform] || {
      supportsMetrics: false,
      message: 'Platform not supported'
    };
  }

  /**
   * Check cache for metrics
   */
  getCachedMetrics(cacheKey) {
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
      return cached.data;
    }
    this.cache.delete(cacheKey);
    return null;
  }

  /**
   * Store metrics in cache
   */
  setCachedMetrics(cacheKey, data) {
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Handle Twitter API rate limit errors with retry
   */
  async handleTwitterRateLimit(client, operation, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        // Check various error formats for rate limit
        const isRateLimit = error.code === 429 || 
                          error.status === 429 || 
                          error.rateLimitError ||
                          (error.data && error.data.status === 429) ||
                          (error.message && (error.message.includes('429') || error.message.includes('rate limit'))) ||
                          (error.rateLimit && error.rateLimit.remaining === 0) ||
                          (error.response && error.response.status === 429);
        
        if (isRateLimit && attempt < maxRetries) {
          // Calculate wait time from rate limit headers or use exponential backoff
          const resetTime = error.rateLimit?.reset 
            ? new Date(error.rateLimit.reset * 1000) 
            : null;
          
          const waitTime = resetTime 
            ? Math.max(0, resetTime - Date.now() + 1000) // Wait until reset + 1 second
            : Math.min(60000 * (attempt + 1), 300000); // Max 5 minutes
          
          console.log(`⚠️ Twitter rate limit hit. Waiting ${Math.round(waitTime / 1000)}s before retry ${attempt + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // If not rate limit or max retries reached, throw error
        throw error;
      }
    }
  }

  /**
   * Fetch Twitter engagement metrics
   */
  async getTwitterMetrics(user, postId = null) {
    try {
      const twitter = user.socialAccounts?.twitter;
      if (!twitter || (!twitter.oauth_accessToken && !twitter.accessToken)) {
        return {
          success: false,
          error: 'Twitter account not connected',
          comingSoon: false
        };
      }

      const support = this.getPlatformSupport('twitter');
      if (!support.supportsMetrics) {
        return {
          success: false,
          comingSoon: true,
          message: support.message || 'Twitter metrics coming soon'
        };
      }

      // Check cache first
      const cacheKey = `twitter_${user._id}_${postId || 'all'}`;
      const cached = this.getCachedMetrics(cacheKey);
      if (cached) {
        console.log('📦 Returning cached Twitter metrics');
        return cached;
      }

      // Initialize Twitter client
      const hasOAuth1 = !!twitter.oauth_accessToken && !!twitter.oauth_accessSecret;
      const client = hasOAuth1
        ? new TwitterApi({
            appKey: process.env.TWITTER_APP_KEY,
            appSecret: process.env.TWITTER_APP_SECRET,
            accessToken: twitter.oauth_accessToken,
            accessSecret: twitter.oauth_accessSecret,
          })
        : new TwitterApi({
            clientId: process.env.TWITTER_CLIENT_ID,
            clientSecret: process.env.TWITTER_CLIENT_SECRET,
            accessToken: twitter.accessToken,
          });

      if (postId) {
        // Get metrics for specific post with rate limit handling
        const tweet = await this.handleTwitterRateLimit(client, async () => {
          return await client.v2.singleTweet(postId, {
            'tweet.fields': 'public_metrics,created_at',
            expansions: 'author_id'
          });
        });

        if (!tweet.data) {
          return {
            success: false,
            error: 'Tweet not found'
          };
        }

        const metrics = tweet.data.public_metrics || {};
        const result = {
          success: true,
          platform: 'twitter',
          postId: postId,
          metrics: {
            likes: metrics.like_count || 0,
            comments: metrics.reply_count || 0,
            shares: metrics.retweet_count || 0,
            views: 0, // Twitter doesn't provide views via API
            engagement_rate: 0
          },
          url: `https://twitter.com/${twitter.username || 'user'}/status/${postId}`,
          timestamp: tweet.data.created_at
        };

        // Cache the result
        this.setCachedMetrics(cacheKey, result);
        return result;
      } else {
        // Get user's recent tweets and their metrics with rate limit handling
        const username = twitter.username || twitter.id;
        const userData = await this.handleTwitterRateLimit(client, async () => {
          return await client.v2.userByUsername(username);
        });
        
        if (!userData.data) {
          return {
            success: false,
            error: 'User not found'
          };
        }

        const userId = userData.data.id;
        const tweets = await this.handleTwitterRateLimit(client, async () => {
          return await client.v2.userTimeline(userId, {
            'tweet.fields': 'public_metrics,created_at',
            max_results: 10
          });
        });

        const posts = tweets.data?.data || [];
        const totalMetrics = {
          likes: 0,
          comments: 0,
          shares: 0,
          views: 0,
          posts: posts.length
        };

        posts.forEach(tweet => {
          const metrics = tweet.public_metrics || {};
          totalMetrics.likes += metrics.like_count || 0;
          totalMetrics.comments += metrics.reply_count || 0;
          totalMetrics.shares += metrics.retweet_count || 0;
        });

        // Calculate engagement rate (approximate)
        const followers = parseInt(userData.data.public_metrics?.followers_count || 1);
        const totalEngagement = totalMetrics.likes + totalMetrics.comments + totalMetrics.shares;
        const engagementRate = totalMetrics.posts > 0 
          ? ((totalEngagement / totalMetrics.posts) / followers) * 100 
          : 0;

        const result = {
          success: true,
          platform: 'twitter',
          metrics: {
            ...totalMetrics,
            engagement_rate: parseFloat(engagementRate.toFixed(2))
          },
          posts: posts.map(tweet => ({
            postId: tweet.id,
            likes: tweet.public_metrics?.like_count || 0,
            comments: tweet.public_metrics?.reply_count || 0,
            shares: tweet.public_metrics?.retweet_count || 0,
            url: `https://twitter.com/${username}/status/${tweet.id}`,
            timestamp: tweet.created_at
          }))
        };

        // Cache the result
        this.setCachedMetrics(cacheKey, result);
        return result;
      }
    } catch (error) {
      console.error('Twitter metrics error:', error);
      
      // Handle rate limit errors specifically
      // Twitter API v2 errors can have different structures
      const isRateLimit = error.code === 429 || 
                         error.status === 429 || 
                         error.rateLimitError ||
                         (error.data && error.data.status === 429) ||
                         (error.message && (error.message.includes('429') || error.message.includes('rate limit'))) ||
                         (error.rateLimit && error.rateLimit.remaining === 0) ||
                         (error.response && error.response.status === 429);

      if (isRateLimit) {
        // Check if we have cached data to return
        const cacheKey = `twitter_${user._id}_${postId || 'all'}`;
        const cached = this.getCachedMetrics(cacheKey);
        if (cached) {
          console.log('⚠️ Rate limit hit, returning cached data');
          return {
            ...cached,
            cached: true,
            warning: 'Rate limit exceeded. Showing cached data. Please try again in a few minutes.'
          };
        }

        return {
          success: false,
          error: 'Twitter API rate limit exceeded. Please try again in 15 minutes.',
          rateLimitExceeded: true,
          retryAfter: 15 * 60, // 15 minutes in seconds
          message: 'Twitter API has rate limits. Please wait before requesting metrics again.'
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to fetch Twitter metrics'
      };
    }
  }

  /**
   * Fetch YouTube engagement metrics
   */
  async getYouTubeMetrics(user, videoId = null) {
    try {
      const youtube = user.socialAccounts?.youtube;
      if (!youtube || !youtube.accessToken) {
        return {
          success: false,
          error: 'YouTube account not connected',
          comingSoon: false
        };
      }

      const support = this.getPlatformSupport('youtube');
      if (!support.supportsMetrics) {
        return {
          success: false,
          comingSoon: true,
          message: support.message || 'YouTube metrics coming soon'
        };
      }

      let accessToken = youtube.accessToken;
      
      // Refresh token if needed
      if (youtube.expiresAt && youtube.expiresAt < new Date()) {
        const refreshResult = await youtubeService.refreshToken(youtube.refreshToken);
        if (refreshResult.success) {
          accessToken = refreshResult.access_token;
        }
      }

      if (videoId) {
        // Get metrics for specific video
        const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: {
            part: 'statistics,snippet',
            id: videoId,
            access_token: accessToken
          }
        });

        if (!response.data.items || response.data.items.length === 0) {
          return {
            success: false,
            error: 'Video not found'
          };
        }

        const video = response.data.items[0];
        const stats = video.statistics || {};
        const views = parseInt(stats.viewCount || 0);
        const likes = parseInt(stats.likeCount || 0);
        const comments = parseInt(stats.commentCount || 0);

        // Calculate engagement rate
        const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

        return {
          success: true,
          platform: 'youtube',
          postId: videoId,
          metrics: {
            views: views,
            likes: likes,
            comments: comments,
            shares: 0, // YouTube doesn't provide share count
            engagement_rate: parseFloat(engagementRate.toFixed(2))
          },
          url: `https://www.youtube.com/watch?v=${videoId}`,
          timestamp: video.snippet.publishedAt
        };
      } else {
        // Get user's channel statistics and recent videos
        const channelResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
          params: {
            part: 'statistics,contentDetails',
            mine: true,
            access_token: accessToken
          }
        });

        if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
          return {
            success: false,
            error: 'Channel not found'
          };
        }

        const channel = channelResponse.data.items[0];
        const channelStats = channel.statistics || {};
        const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;

        // Get recent videos
        const playlistResponse = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
          params: {
            part: 'contentDetails',
            playlistId: uploadsPlaylistId,
            maxResults: 10,
            access_token: accessToken
          }
        });

        const videoIds = (playlistResponse.data.items || []).map(item => item.contentDetails.videoId);

        // Get metrics for all videos
        const videosResponse = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
          params: {
            part: 'statistics,snippet',
            id: videoIds.join(','),
            access_token: accessToken
          }
        });

        const videos = videosResponse.data.items || [];
        const totalMetrics = {
          views: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          posts: videos.length
        };

        videos.forEach(video => {
          const stats = video.statistics || {};
          totalMetrics.views += parseInt(stats.viewCount || 0);
          totalMetrics.likes += parseInt(stats.likeCount || 0);
          totalMetrics.comments += parseInt(stats.commentCount || 0);
        });

        const subscribers = parseInt(channelStats.subscriberCount || 1);
        const totalEngagement = totalMetrics.likes + totalMetrics.comments;
        const engagementRate = totalMetrics.posts > 0
          ? ((totalEngagement / totalMetrics.posts) / subscribers) * 100
          : 0;

        return {
          success: true,
          platform: 'youtube',
          metrics: {
            ...totalMetrics,
            engagement_rate: parseFloat(engagementRate.toFixed(2))
          },
          posts: videos.map(video => ({
            postId: video.id,
            views: parseInt(video.statistics?.viewCount || 0),
            likes: parseInt(video.statistics?.likeCount || 0),
            comments: parseInt(video.statistics?.commentCount || 0),
            url: `https://www.youtube.com/watch?v=${video.id}`,
            timestamp: video.snippet.publishedAt
          }))
        };
      }
    } catch (error) {
      console.error('YouTube metrics error:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch YouTube metrics'
      };
    }
  }

  /**
   * Fetch Instagram engagement metrics
   */
  async getInstagramMetrics(user, postId = null) {
    try {
      const instagram = user.socialAccounts?.instagram;
      if (!instagram || !instagram.accessToken || !instagram.igAccountId) {
        return {
          success: false,
          error: 'Instagram account not connected',
          comingSoon: false
        };
      }

      const support = this.getPlatformSupport('instagram');
      if (!support.supportsMetrics) {
        return {
          success: false,
          comingSoon: true,
          message: support.message || 'Instagram metrics coming soon'
        };
      }

      const baseURL = 'https://graph.facebook.com/v20.0';
      const accessToken = instagram.accessToken;
      const igAccountId = instagram.igAccountId;

      if (postId) {
        // Get metrics for specific post
        try {
          const response = await axios.get(`${baseURL}/${postId}`, {
            params: {
              fields: 'like_count,comments_count,media_type,timestamp,permalink',
              access_token: accessToken
            }
          });

          const metrics = {
            likes: parseInt(response.data.like_count || 0),
            comments: parseInt(response.data.comments_count || 0),
            views: 0, // Instagram doesn't provide views for posts in basic API
            shares: 0,
            engagement_rate: 0
          };

          return {
            success: true,
            platform: 'instagram',
            postId: postId,
            metrics: metrics,
            url: response.data.permalink || `https://www.instagram.com/p/${postId}`,
            timestamp: response.data.timestamp
          };
        } catch (error) {
          if (error.response?.status === 404) {
            return {
              success: false,
              error: 'Instagram post not found'
            };
          }
          throw error;
        }
      } else {
        // Get user's recent posts and their metrics
        const response = await axios.get(`${baseURL}/${igAccountId}/media`, {
          params: {
            fields: 'id,like_count,comments_count,media_type,timestamp,permalink',
            limit: 10,
            access_token: accessToken
          }
        });

        const posts = response.data.data || [];
        const totalMetrics = {
          likes: 0,
          comments: 0,
          views: 0,
          shares: 0,
          posts: posts.length
        };

        posts.forEach(post => {
          totalMetrics.likes += parseInt(post.like_count || 0);
          totalMetrics.comments += parseInt(post.comments_count || 0);
        });

        // Get profile info for engagement calculation
        try {
          const profileResponse = await axios.get(`${baseURL}/${igAccountId}`, {
            params: {
              fields: 'followers_count,media_count',
              access_token: accessToken
            }
          });

          const followers = parseInt(profileResponse.data.followers_count || 1);
          const totalEngagement = totalMetrics.likes + totalMetrics.comments;
          const engagementRate = totalMetrics.posts > 0
            ? ((totalEngagement / totalMetrics.posts) / followers) * 100
            : 0;

          totalMetrics.engagement_rate = parseFloat(engagementRate.toFixed(2));

          return {
            success: true,
            platform: 'instagram',
            metrics: totalMetrics,
            posts: posts.map(post => ({
              postId: post.id,
              likes: parseInt(post.like_count || 0),
              comments: parseInt(post.comments_count || 0),
              views: 0,
              url: post.permalink || `https://www.instagram.com/p/${post.id}`,
              timestamp: post.timestamp
            }))
          };
        } catch (profileError) {
          return {
            success: true,
            platform: 'instagram',
            metrics: totalMetrics,
            posts: posts.map(post => ({
              postId: post.id,
              likes: parseInt(post.like_count || 0),
              comments: parseInt(post.comments_count || 0),
              views: 0,
              url: post.permalink || `https://www.instagram.com/p/${post.id}`,
              timestamp: post.timestamp
            }))
          };
        }
      }
    } catch (error) {
      console.error('Instagram metrics error:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch Instagram metrics'
      };
    }
  }

  /**
   * Get LinkedIn metrics (coming soon)
   */
  async getLinkedInMetrics(user, postId = null) {
    const support = this.getPlatformSupport('linkedin');
    return {
      success: false,
      comingSoon: true,
      message: support.message || 'LinkedIn metrics coming soon',
      platform: 'linkedin'
    };
  }

  /**
   * Fetch Facebook engagement metrics
   */
  async getFacebookMetrics(user, postId = null) {
    try {
      const facebook = user.socialAccounts?.facebook;
      if (!facebook || !facebook.accessToken) {
        return {
          success: false,
          error: 'Facebook account not connected',
          comingSoon: false
        };
      }

      const support = this.getPlatformSupport('facebook');
      if (!support.supportsMetrics) {
        return {
          success: false,
          comingSoon: true,
          message: support.message || 'Facebook metrics coming soon',
          platform: 'facebook'
        };
      }

      // Check cache first
      const cacheKey = `facebook_${user._id}_${postId || 'all'}`;
      const cached = this.getCachedMetrics(cacheKey);
      if (cached) {
        console.log('📦 Returning cached Facebook metrics');
        return cached;
      }

      const baseURL = 'https://graph.facebook.com/v18.0';
      const accessToken = facebook.accessToken;
      let pageId = facebook.defaultPageId;

      // Get all pages and their access tokens
      let allPages = [];
      try {
        const pagesResponse = await axios.get(`${baseURL}/me/accounts`, {
          params: {
            access_token: accessToken,
            fields: 'id,name,access_token'
          }
        });
        allPages = pagesResponse.data?.data || [];
        
        if (allPages.length === 0) {
          return {
            success: false,
            error: 'No Facebook Pages found. Please create a Facebook Page and connect it to your account.',
            platform: 'facebook'
          };
        }

        console.log(`Found ${allPages.length} Facebook page(s):`, allPages.map(p => p.name).join(', '));
      } catch (error) {
        console.error('Error fetching Facebook pages:', error.response?.data || error.message);
        return {
          success: false,
          error: error.response?.data?.error?.message || 'Failed to fetch Facebook pages. Please check your permissions.',
          platform: 'facebook',
          details: error.response?.data?.error
        };
      }

      if (postId) {
        // Get metrics for specific post
        // Try each page's access token until we find the post
        let postFound = false;
        for (const page of allPages) {
          const pageAccessToken = page.access_token || accessToken;
          try {
            const response = await axios.get(`${baseURL}/${postId}`, {
              params: {
                fields: 'id,message,created_time,shares,reactions.summary(true),comments.summary(true),permalink_url',
                access_token: pageAccessToken
              }
            });

          const reactions = response.data.reactions?.summary || {};
          const comments = response.data.comments?.summary || {};
          const shares = response.data.shares || {};

          const likes = parseInt(reactions.total_count || 0);
          const commentsCount = parseInt(comments.total_count || 0);
          const sharesCount = parseInt(shares.count || 0);

            // Try to get views via insights API (requires pages_read_engagement permission)
            let views = 0;
            try {
              const insightsResponse = await axios.get(`${baseURL}/${postId}/insights`, {
                params: {
                  metric: 'post_impressions',
                  access_token: pageAccessToken
                }
              });
              const insights = insightsResponse.data?.data || [];
              if (insights.length > 0 && insights[0].values && insights[0].values.length > 0) {
                views = parseInt(insights[0].values[0].value || 0);
              }
            } catch (insightsError) {
              // Views not available, that's okay
              console.log('Facebook insights not available for this post');
            }

            const metrics = {
              likes: likes,
              comments: commentsCount,
              shares: sharesCount,
              views: views,
              engagement_rate: 0
            };

            const result = {
              success: true,
              platform: 'facebook',
              postId: postId,
              metrics: metrics,
              url: response.data.permalink_url || `https://www.facebook.com/${postId}`,
              timestamp: response.data.created_time,
              page: {
                id: page.id,
                name: page.name
              }
            };

            // Cache the result
            this.setCachedMetrics(cacheKey, result);
            return result;
          } catch (error) {
            if (error.response?.status === 404) {
              // Post not found on this page, try next page
              continue;
            }
            // If it's not a 404, try next page anyway
            if (!postFound) continue;
          }
        }
        
        // If we get here, post wasn't found on any page
        return {
          success: false,
          error: 'Facebook post not found on any of your pages'
        };
      } else {
        // Get user's published Facebook posts from database first
        const dbPosts = await Post.find({
          author: user._id,
          platform: 'facebook',
          status: 'published',
          'publishing.platform_post_id': { $exists: true, $ne: null }
        })
        .sort({ 'publishing.published_at': -1 })
        .limit(50)
        .select('publishing platform_post_id');

        console.log(`Found ${dbPosts.length} published Facebook posts in database`);

        // If we have posts in database, fetch metrics for those across all pages
        if (dbPosts.length > 0) {
          const postsWithMetrics = [];
          const totalMetrics = {
            likes: 0,
            comments: 0,
            shares: 0,
            views: 0,
            posts: 0
          };

          // OPTIMIZATION: Batch fetch metrics using Facebook batch API to avoid sequential calls
          // Group posts by page (posts are usually on the same page)
          const postIds = dbPosts.map(p => p.publishing?.platform_post_id).filter(Boolean);
          
          // Try to fetch posts in batches (Facebook batch API allows up to 50 requests per batch)
          const BATCH_SIZE = 20; // Conservative batch size to avoid rate limits
          const batches = [];
          for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
            batches.push(postIds.slice(i, i + BATCH_SIZE));
          }

          // Process batches in parallel for each page
          const batchPromises = allPages.map(async (page) => {
            const pageAccessToken = page.access_token || accessToken;
            const pageResults = [];

            for (const batch of batches) {
              try {
                // Use Facebook batch API to fetch multiple posts at once
                const batchRequests = batch.map(postId => ({
                  method: 'GET',
                  relative_url: `${postId}?fields=id,message,created_time,shares,reactions.summary(true),comments.summary(true),permalink_url`
                }));

                const batchResponse = await axios.post(`${baseURL}`, null, {
                  params: {
                    batch: JSON.stringify(batchRequests),
                    access_token: pageAccessToken
                  }
                });

                const batchResults = Array.isArray(batchResponse.data) ? batchResponse.data : [];
                
                for (let i = 0; i < batchResults.length; i++) {
                  const result = batchResults[i];
                  if (result.code === 200) {
                    try {
                      const postData = JSON.parse(result.body);
                      const reactions = postData.reactions?.summary || {};
                      const comments = postData.comments?.summary || {};
                      const shares = postData.shares || {};

                      const likes = parseInt(reactions.total_count || 0);
                      const commentsCount = parseInt(comments.total_count || 0);
                      const sharesCount = parseInt(shares.count || 0);

                      // Try to get views via insights API (can't batch this, but we'll do it in parallel)
                      let views = 0;
                      try {
                        const insightsResponse = await axios.get(`${baseURL}/${postData.id}/insights`, {
                          params: {
                            metric: 'post_impressions',
                            access_token: pageAccessToken
                          }
                        });
                        const insights = insightsResponse.data?.data || [];
                        if (insights.length > 0 && insights[0].values && insights[0].values.length > 0) {
                          views = parseInt(insights[0].values[0].value || 0);
                        }
                      } catch (insightsError) {
                        // Views not available, skip
                      }

                      pageResults.push({
                        postId: postData.id,
                        likes: likes,
                        comments: commentsCount,
                        shares: sharesCount,
                        views: views,
                        url: postData.permalink_url || `https://www.facebook.com/${postData.id}`,
                        timestamp: postData.created_time,
                        page: {
                          id: page.id,
                          name: page.name
                        }
                      });
                    } catch (parseError) {
                      console.error(`Error parsing batch result for post:`, parseError);
                    }
                  }
                }
              } catch (batchError) {
                console.error(`Error fetching batch from page ${page.name}:`, batchError.message);
                // Fallback to individual requests if batch fails
                for (const postId of batch) {
                  try {
                    const postResponse = await axios.get(`${baseURL}/${postId}`, {
                      params: {
                        fields: 'id,message,created_time,shares,reactions.summary(true),comments.summary(true),permalink_url',
                        access_token: pageAccessToken
                      }
                    });

                    const postData = postResponse.data;
                    const reactions = postData.reactions?.summary || {};
                    const comments = postData.comments?.summary || {};
                    const shares = postData.shares || {};

                    const likes = parseInt(reactions.total_count || 0);
                    const commentsCount = parseInt(comments.total_count || 0);
                    const sharesCount = parseInt(shares.count || 0);
                    let views = 0;

                    try {
                      const insightsResponse = await axios.get(`${baseURL}/${postId}/insights`, {
                        params: {
                          metric: 'post_impressions',
                          access_token: pageAccessToken
                        }
                      });
                      const insights = insightsResponse.data?.data || [];
                      if (insights.length > 0 && insights[0].values && insights[0].values.length > 0) {
                        views = parseInt(insights[0].values[0].value || 0);
                      }
                    } catch (insightsError) {
                      // Views not available
                    }

                    pageResults.push({
                      postId: postData.id,
                      likes: likes,
                      comments: commentsCount,
                      shares: sharesCount,
                      views: views,
                      url: postData.permalink_url || `https://www.facebook.com/${postData.id}`,
                      timestamp: postData.created_time,
                      page: {
                        id: page.id,
                        name: page.name
                      }
                    });
                  } catch (error) {
                    // Skip this post
                    continue;
                  }
                }
              }
            }

            return pageResults;
          });

          // Wait for all pages to complete
          const allPageResults = await Promise.allSettled(batchPromises);
          
          // Combine results from all pages, avoiding duplicates
          const postMetricsMap = new Map();
          allPageResults.forEach((result) => {
            if (result.status === 'fulfilled') {
              result.value.forEach(postMetrics => {
                if (!postMetricsMap.has(postMetrics.postId)) {
                  postMetricsMap.set(postMetrics.postId, postMetrics);
                }
              });
            }
          });

          // Convert map to array and update totals
          postsWithMetrics.push(...Array.from(postMetricsMap.values()));
          postsWithMetrics.forEach(post => {
            totalMetrics.likes += post.likes;
            totalMetrics.comments += post.comments;
            totalMetrics.shares += post.shares;
            totalMetrics.views += post.views;
            totalMetrics.posts += 1;
          });

          // Get page info for engagement calculation (aggregate across all pages)
          let totalFollowers = 0;
          let engagementRate = 0;
          
          for (const page of allPages) {
            const pageAccessToken = page.access_token || accessToken;
            try {
              const pageInfoResponse = await axios.get(`${baseURL}/${page.id}`, {
                params: {
                  fields: 'fan_count,followers_count',
                  access_token: pageAccessToken
                }
              });

              const followers = parseInt(pageInfoResponse.data.fan_count || pageInfoResponse.data.followers_count || 0);
              totalFollowers += followers;
            } catch (pageInfoError) {
              console.log(`Could not fetch info for page ${page.name}`);
            }
          }

          // Calculate engagement rate using total followers across all pages
          const avgFollowers = totalFollowers > 0 ? totalFollowers / allPages.length : 1;
          const totalEngagement = totalMetrics.likes + totalMetrics.comments + totalMetrics.shares;
          engagementRate = totalMetrics.posts > 0 && avgFollowers > 0
            ? ((totalEngagement / totalMetrics.posts) / avgFollowers) * 100
            : 0;

          totalMetrics.engagement_rate = parseFloat(engagementRate.toFixed(2));

          const result = {
            success: true,
            platform: 'facebook',
            metrics: totalMetrics,
            posts: postsWithMetrics,
            pages: allPages.map(p => ({ id: p.id, name: p.name })),
            totalPages: allPages.length
          };

          // Cache the result
          this.setCachedMetrics(cacheKey, result);
          return result;
        }

        // Fallback: Try to get posts directly from Facebook API for all pages
        console.log('No database posts found, trying to fetch from Facebook API for all pages...');
        
        const allPosts = [];
        const totalMetrics = {
          likes: 0,
          comments: 0,
          shares: 0,
          views: 0,
          posts: 0
        };

        // Fetch posts from all pages
        for (const page of allPages) {
          const pageAccessToken = page.access_token || accessToken;
          try {
            console.log(`Fetching posts from page: ${page.name} (${page.id})`);
            const response = await axios.get(`${baseURL}/${page.id}/posts`, {
              params: {
                fields: 'id,message,created_time,shares,reactions.summary(true),comments.summary(true),permalink_url',
                limit: 10,
                access_token: pageAccessToken
              }
            });

            const posts = response.data.data || [];
            console.log(`Found ${posts.length} posts from page ${page.name}`);

            // Fetch metrics for each post
            for (const post of posts) {
              const reactions = post.reactions?.summary || {};
              const comments = post.comments?.summary || {};
              const shares = post.shares || {};

              const likes = parseInt(reactions.total_count || 0);
              const commentsCount = parseInt(comments.total_count || 0);
              const sharesCount = parseInt(shares.count || 0);

              totalMetrics.likes += likes;
              totalMetrics.comments += commentsCount;
              totalMetrics.shares += sharesCount;
              totalMetrics.posts += 1;

              // Try to get views for each post (optional, may fail)
              let views = 0;
              try {
                const insightsResponse = await axios.get(`${baseURL}/${post.id}/insights`, {
                  params: {
                    metric: 'post_impressions',
                    access_token: pageAccessToken
                  }
                });
                const insights = insightsResponse.data?.data || [];
                if (insights.length > 0 && insights[0].values && insights[0].values.length > 0) {
                  views = parseInt(insights[0].values[0].value || 0);
                }
              } catch (insightsError) {
                // Skip views if not available
              }

              totalMetrics.views += views;

              allPosts.push({
                postId: post.id,
                likes: likes,
                comments: commentsCount,
                shares: sharesCount,
                views: views,
                url: post.permalink_url || `https://www.facebook.com/${post.id}`,
                timestamp: post.created_time,
                page: {
                  id: page.id,
                  name: page.name
                }
              });
            }
          } catch (error) {
            console.error(`Error fetching posts from page ${page.name}:`, error.message);
            // Continue with other pages even if one fails
          }
        }

        // Get page info for engagement calculation (aggregate across all pages)
        let totalFollowers = 0;
        for (const page of allPages) {
          const pageAccessToken = page.access_token || accessToken;
          try {
            const pageInfoResponse = await axios.get(`${baseURL}/${page.id}`, {
              params: {
                fields: 'fan_count,followers_count',
                access_token: pageAccessToken
              }
            });

            const followers = parseInt(pageInfoResponse.data.fan_count || pageInfoResponse.data.followers_count || 0);
            totalFollowers += followers;
          } catch (pageInfoError) {
            console.log(`Could not fetch info for page ${page.name}`);
          }
        }

        // Calculate engagement rate using average followers across all pages
        const avgFollowers = totalFollowers > 0 ? totalFollowers / allPages.length : 1;
        const totalEngagement = totalMetrics.likes + totalMetrics.comments + totalMetrics.shares;
        const engagementRate = totalMetrics.posts > 0 && avgFollowers > 0
          ? ((totalEngagement / totalMetrics.posts) / avgFollowers) * 100
          : 0;

        totalMetrics.engagement_rate = parseFloat(engagementRate.toFixed(2));

        const result = {
          success: true,
          platform: 'facebook',
          metrics: totalMetrics,
          posts: allPosts,
          pages: allPages.map(p => ({ id: p.id, name: p.name })),
          totalPages: allPages.length
        };

        // Cache the result
        this.setCachedMetrics(cacheKey, result);
        return result;
      }
    } catch (error) {
      console.error('Facebook metrics error:', error);
      
      // Handle rate limit errors
      const isRateLimit = error.response?.status === 429 || 
                         (error.response?.data?.error?.code === 4) ||
                         (error.message && error.message.includes('rate limit'));

      if (isRateLimit) {
        // Check if we have cached data to return
        const cacheKey = `facebook_${user._id}_${postId || 'all'}`;
        const cached = this.getCachedMetrics(cacheKey);
        if (cached) {
          console.log('⚠️ Rate limit hit, returning cached data');
          return {
            ...cached,
            cached: true,
            warning: 'Rate limit exceeded. Showing cached data. Please try again in a few minutes.'
          };
        }

        return {
          success: false,
          error: 'Facebook API rate limit exceeded. Please try again later.',
          rateLimitExceeded: true,
          retryAfter: 60, // 1 minute
          message: 'Facebook API has rate limits. Please wait before requesting metrics again.'
        };
      }

      return {
        success: false,
        error: error.response?.data?.error?.message || error.message || 'Failed to fetch Facebook metrics'
      };
    }
  }

  /**
   * Get engagement metrics for a specific platform
   */
  async getPlatformMetrics(user, platform, postId = null) {
    switch (platform.toLowerCase()) {
      case 'twitter':
        return await this.getTwitterMetrics(user, postId);
      case 'youtube':
        return await this.getYouTubeMetrics(user, postId);
      case 'instagram':
        return await this.getInstagramMetrics(user, postId);
      case 'linkedin':
        return await this.getLinkedInMetrics(user, postId);
      case 'facebook':
        return await this.getFacebookMetrics(user, postId);
      default:
        return {
          success: false,
          error: 'Platform not supported'
        };
    }
  }

  /**
   * Get engagement metrics for all connected platforms
   */
  async getAllPlatformMetrics(user) {
    const platforms = ['twitter', 'youtube', 'instagram', 'linkedin', 'facebook'];
    const results = {};

    for (const platform of platforms) {
      const account = user.socialAccounts?.[platform];
      if (account && (account.accessToken || account.oauth_accessToken)) {
        results[platform] = await this.getPlatformMetrics(user, platform);
      } else {
        results[platform] = {
          success: false,
          error: 'Account not connected',
          comingSoon: false
        };
      }
    }

    return results;
  }

  /**
   * Generate platform URL from post ID
   */
  generatePlatformURL(platform, postId, username = null) {
    switch (platform.toLowerCase()) {
      case 'twitter':
        return `https://twitter.com/${username || 'user'}/status/${postId}`;
      case 'youtube':
        return `https://www.youtube.com/watch?v=${postId}`;
      case 'instagram':
        return `https://www.instagram.com/p/${postId}`;
      case 'linkedin':
        return `https://www.linkedin.com/feed/update/${postId}`;
      case 'facebook':
        // Facebook post IDs can be in format: pageId_postId or just postId
        // Try to construct permalink URL if we have the format
        if (postId.includes('_')) {
          return `https://www.facebook.com/${postId}`;
        }
        // For permalink URLs, Facebook uses story_fbid parameter
        return `https://www.facebook.com/permalink.php?story_fbid=${postId}`;
      default:
        return null;
    }
  }
}

module.exports = new EngagementService();

