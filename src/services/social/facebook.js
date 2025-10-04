// src/services/social/facebook.js
const axios = require('axios');
const logger = require('../../utils/logger');

class FacebookService {
  constructor() {
    this.baseURL = 'https://graph.facebook.com/v18.0';
    this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
    this.appId = process.env.FACEBOOK_APP_ID;
    this.appSecret = process.env.FACEBOOK_APP_SECRET;
  }

  /**
   * Get Facebook page information
   * @param {string} pageId - Facebook page ID or username
   * @returns {Object} - Page data
   */
  async getPageInfo(pageId) {
    try {
      if (!this.accessToken) {
        throw new Error('Facebook access token not configured');
      }

      const response = await axios.get(`${this.baseURL}/${pageId}`, {
        params: {
          access_token: this.accessToken,
          fields: 'id,name,username,about,description,followers_count,fan_count,category,website,phone,emails,location,hours,picture,cover,link,verification_status'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Facebook page info error:', { pageId, error: error.message });
      throw error;
    }
  }

  /**
   * Get Facebook page posts
   * @param {string} pageId - Facebook page ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of posts
   */
  async getPagePosts(pageId, options = {}) {
    try {
      if (!this.accessToken) {
        throw new Error('Facebook access token not configured');
      }

      const { limit = 25, since, until } = options;
      
      const params = {
        access_token: this.accessToken,
        fields: 'id,message,created_time,updated_time,type,status_type,permalink_url,shares,reactions.summary(true),comments.summary(true)',
        limit
      };

      if (since) params.since = since;
      if (until) params.until = until;

      const response = await axios.get(`${this.baseURL}/${pageId}/posts`, {
        params
      });

      return response.data.data || [];
    } catch (error) {
      logger.error('Facebook page posts error:', { pageId, error: error.message });
      throw error;
    }
  }

  /**
   * Get Facebook page insights/metrics
   * @param {string} pageId - Facebook page ID
   * @param {Object} options - Query options
   * @returns {Object} - Page insights
   */
  async getPageInsights(pageId, options = {}) {
    try {
      if (!this.accessToken) {
        throw new Error('Facebook access token not configured');
      }

      const { period = 'day', since, until } = options;
      
      const params = {
        access_token: this.accessToken,
        metric: 'page_fans,page_fan_adds,page_fan_removes,page_impressions,page_impressions_unique,page_engaged_users,page_post_engagements,page_video_views',
        period
      };

      if (since) params.since = since;
      if (until) params.until = until;

      const response = await axios.get(`${this.baseURL}/${pageId}/insights`, {
        params
      });

      return this.formatInsights(response.data.data || []);
    } catch (error) {
      logger.error('Facebook page insights error:', { pageId, error: error.message });
      throw error;
    }
  }

  /**
   * Search for Facebook pages
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} - Array of pages
   */
  async searchPages(query, options = {}) {
    try {
      if (!this.accessToken) {
        throw new Error('Facebook access token not configured');
      }

      const { limit = 25, type = 'page' } = options;
      
      const response = await axios.get(`${this.baseURL}/search`, {
        params: {
          access_token: this.accessToken,
          q: query,
          type,
          fields: 'id,name,username,category,followers_count,picture,link',
          limit
        }
      });

      return response.data.data || [];
    } catch (error) {
      logger.error('Facebook search pages error:', { query, error: error.message });
      throw error;
    }
  }

  /**
   * Get Facebook page events
   * @param {string} pageId - Facebook page ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of events
   */
  async getPageEvents(pageId, options = {}) {
    try {
      if (!this.accessToken) {
        throw new Error('Facebook access token not configured');
      }

      const { limit = 25, since, until } = options;
      
      const params = {
        access_token: this.accessToken,
        fields: 'id,name,description,start_time,end_time,place,attending_count,interested_count,maybe_count,declined_count',
        limit
      };

      if (since) params.since = since;
      if (until) params.until = until;

      const response = await axios.get(`${this.baseURL}/${pageId}/events`, {
        params
      });

      return response.data.data || [];
    } catch (error) {
      logger.error('Facebook page events error:', { pageId, error: error.message });
      throw error;
    }
  }

  /**
   * Get Facebook page photos
   * @param {string} pageId - Facebook page ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of photos
   */
  async getPagePhotos(pageId, options = {}) {
    try {
      if (!this.accessToken) {
        throw new Error('Facebook access token not configured');
      }

      const { limit = 25, since, until } = options;
      
      const params = {
        access_token: this.accessToken,
        fields: 'id,created_time,updated_time,link,images,name,caption,comments.summary(true),reactions.summary(true)',
        limit
      };

      if (since) params.since = since;
      if (until) params.until = until;

      const response = await axios.get(`${this.baseURL}/${pageId}/photos`, {
        params
      });

      return response.data.data || [];
    } catch (error) {
      logger.error('Facebook page photos error:', { pageId, error: error.message });
      throw error;
    }
  }

  /**
   * Get Facebook page videos
   * @param {string} pageId - Facebook page ID
   * @param {Object} options - Query options
   * @returns {Array} - Array of videos
   */
  async getPageVideos(pageId, options = {}) {
    try {
      if (!this.accessToken) {
        throw new Error('Facebook access token not configured');
      }

      const { limit = 25, since, until } = options;
      
      const params = {
        access_token: this.accessToken,
        fields: 'id,created_time,updated_time,description,length,permalink_url,source,title,comments.summary(true),reactions.summary(true),views',
        limit
      };

      if (since) params.since = since;
      if (until) params.until = until;

      const response = await axios.get(`${this.baseURL}/${pageId}/videos`, {
        params
      });

      return response.data.data || [];
    } catch (error) {
      logger.error('Facebook page videos error:', { pageId, error: error.message });
      throw error;
    }
  }

  /**
   * Format insights data for easier consumption
   * @param {Array} insights - Raw insights data
   * @returns {Object} - Formatted insights
   */
  formatInsights(insights) {
    const formatted = {};
    
    insights.forEach(insight => {
      const metric = insight.name;
      const values = insight.values || [];
      
      if (values.length > 0) {
        // Get the most recent value
        const latestValue = values[values.length - 1];
        formatted[metric] = {
          current: latestValue.value,
          trend: this.calculateTrend(values),
          period: insight.period,
          title: insight.title,
          description: insight.description
        };
      }
    });

    return formatted;
  }

  /**
   * Calculate trend from values array
   * @param {Array} values - Array of value objects
   * @returns {string} - Trend direction
   */
  calculateTrend(values) {
    if (values.length < 2) return 'stable';
    
    const recent = values.slice(-3);
    const older = values.slice(0, -3);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((sum, val) => sum + val.value, 0) / recent.length;
    const olderAvg = older.reduce((sum, val) => sum + val.value, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * Validate Facebook page URL
   * @param {string} url - Facebook page URL
   * @returns {Object} - Parsed page info
   */
  parsePageUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      if (!hostname.includes('facebook.com')) {
        throw new Error('Invalid Facebook URL');
      }
      
      const pathname = urlObj.pathname;
      let pageId = null;
      
      // Handle different Facebook URL formats
      if (pathname.startsWith('/pages/')) {
        // Format: /pages/Page-Name/123456789
        const parts = pathname.split('/');
        pageId = parts[3];
      } else if (pathname.startsWith('/')) {
        // Format: /pagename or /page.id
        pageId = pathname.substring(1).split('/')[0];
      }
      
      if (!pageId) {
        throw new Error('Could not extract page ID from URL');
      }
      
      return {
        pageId,
        url,
        isValid: true
      };
    } catch (error) {
      logger.error('Facebook URL parsing error:', { url, error: error.message });
      return {
        pageId: null,
        url,
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Get comprehensive page data for competitor analysis
   * @param {string} pageId - Facebook page ID
   * @param {Object} options - Analysis options
   * @returns {Object} - Comprehensive page data
   */
  async getComprehensivePageData(pageId, options = {}) {
    try {
      const [pageInfo, posts, insights] = await Promise.all([
        this.getPageInfo(pageId),
        this.getPagePosts(pageId, { limit: options.postLimit || 50 }),
        this.getPageInsights(pageId, { period: 'day' })
      ]);

      return {
        profile: pageInfo,
        posts: posts,
        insights: insights,
        metrics: {
          totalPosts: posts.length,
          averageEngagement: this.calculateAverageEngagement(posts),
          postingFrequency: this.calculatePostingFrequency(posts),
          topPostTypes: this.analyzePostTypes(posts)
        },
        collectedAt: new Date()
      };
    } catch (error) {
      logger.error('Facebook comprehensive data error:', { pageId, error: error.message });
      throw error;
    }
  }

  /**
   * Calculate average engagement for posts
   * @param {Array} posts - Array of posts
   * @returns {Object} - Engagement metrics
   */
  calculateAverageEngagement(posts) {
    if (posts.length === 0) {
      return { likes: 0, comments: 0, shares: 0, total: 0 };
    }

    const totals = posts.reduce((acc, post) => {
      const reactions = post.reactions?.summary?.total_count || 0;
      const comments = post.comments?.summary?.total_count || 0;
      const shares = post.shares?.count || 0;
      
      acc.likes += reactions;
      acc.comments += comments;
      acc.shares += shares;
      acc.total += reactions + comments + shares;
      
      return acc;
    }, { likes: 0, comments: 0, shares: 0, total: 0 });

    return {
      likes: Math.round(totals.likes / posts.length),
      comments: Math.round(totals.comments / posts.length),
      shares: Math.round(totals.shares / posts.length),
      total: Math.round(totals.total / posts.length)
    };
  }

  /**
   * Calculate posting frequency
   * @param {Array} posts - Array of posts
   * @returns {Object} - Posting frequency data
   */
  calculatePostingFrequency(posts) {
    if (posts.length === 0) {
      return { postsPerDay: 0, postsPerWeek: 0, postsPerMonth: 0 };
    }

    const now = new Date();
    const oldestPost = new Date(posts[posts.length - 1].created_time);
    const daysDiff = Math.max(1, (now - oldestPost) / (1000 * 60 * 60 * 24));

    return {
      postsPerDay: (posts.length / daysDiff).toFixed(2),
      postsPerWeek: ((posts.length / daysDiff) * 7).toFixed(2),
      postsPerMonth: ((posts.length / daysDiff) * 30).toFixed(2)
    };
  }

  /**
   * Analyze post types
   * @param {Array} posts - Array of posts
   * @returns {Object} - Post type analysis
   */
  analyzePostTypes(posts) {
    const types = {};
    
    posts.forEach(post => {
      const type = post.type || 'status';
      types[type] = (types[type] || 0) + 1;
    });

    return Object.entries(types)
      .sort(([,a], [,b]) => b - a)
      .map(([type, count]) => ({ type, count, percentage: ((count / posts.length) * 100).toFixed(1) }));
  }
}

module.exports = new FacebookService();
