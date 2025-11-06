# Engagement & Analytics API Endpoints

This document describes the engagement and analytics API endpoints for fetching user metrics, views, likes, comments, shares, and calculating engagement rates across all platforms.

## Base URL
All endpoints are prefixed with `/api/engagement`

## Authentication
All endpoints require authentication via JWT token in the Authorization header or cookies.

---

## Endpoints

### 1. Get All Platform Engagement Metrics
Get engagement metrics for all connected platforms.

**Endpoint:** `GET /api/engagement`

**Response:**
```json
{
  "success": true,
  "data": {
    "platforms": {
      "twitter": {
        "success": true,
        "platform": "twitter",
        "metrics": {
          "likes": 150,
          "comments": 25,
          "shares": 10,
          "views": 0,
          "posts": 5,
          "engagement_rate": 2.5
        },
        "posts": [...]
      },
      "youtube": {
        "success": true,
        "platform": "youtube",
        "metrics": {
          "views": 10000,
          "likes": 500,
          "comments": 100,
          "shares": 0,
          "posts": 3,
          "engagement_rate": 6.0
        },
        "posts": [...]
      },
      "instagram": {
        "success": true,
        "platform": "instagram",
        "metrics": {
          "likes": 300,
          "comments": 50,
          "views": 0,
          "shares": 0,
          "posts": 4,
          "engagement_rate": 3.5
        },
        "posts": [...]
      },
      "linkedin": {
        "success": false,
        "comingSoon": true,
        "message": "Coming soon - LinkedIn API metrics are limited and require special permissions",
        "platform": "linkedin"
      },
      "facebook": {
        "success": true,
        "platform": "facebook",
        "metrics": {
          "likes": 500,
          "comments": 50,
          "shares": 25,
          "views": 5000,
          "posts": 10,
          "engagement_rate": 5.75
        },
        "posts": [...]
      }
    },
    "summary": {
      "totalLikes": 950,
      "totalComments": 175,
      "totalShares": 10,
      "totalViews": 10000,
      "totalPosts": 12,
      "platforms": ["twitter", "youtube", "instagram"]
    }
  }
}
```

---

### 2. Get Platform-Specific Engagement Metrics
Get engagement metrics for a specific platform.

**Endpoint:** `GET /api/engagement/:platform`

**Parameters:**
- `platform` (path): One of `twitter`, `youtube`, `instagram`, `linkedin`, `facebook`
- `postId` (query, optional): Specific post ID to get metrics for

**Example Requests:**
```
GET /api/engagement/twitter
GET /api/engagement/youtube?postId=VIDEO_ID
GET /api/engagement/instagram
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "platform": "twitter",
    "metrics": {
      "likes": 150,
      "comments": 25,
      "shares": 10,
      "views": 0,
      "engagement_rate": 2.5
    },
    "posts": [
      {
        "postId": "1234567890",
        "likes": 30,
        "comments": 5,
        "shares": 2,
        "url": "https://twitter.com/username/status/1234567890",
        "timestamp": "2024-01-15T10:00:00Z"
      }
    ]
  }
}
```

**Response (Coming Soon):**
```json
{
  "success": false,
  "comingSoon": true,
  "message": "Coming soon - LinkedIn API metrics are limited and require special permissions",
  "data": {
    "platform": "linkedin"
  }
}
```

**Response (Not Connected):**
```json
{
  "success": false,
  "comingSoon": false,
  "message": "Twitter account not connected",
  "data": {
    "error": "Twitter account not connected"
  }
}
```

---

### 3. Get Platform Support Information
Get information about which metrics are supported by each platform.

**Endpoint:** `GET /api/engagement/platforms/support`

**Response:**
```json
{
  "success": true,
  "data": {
    "twitter": {
      "supportsMetrics": true,
      "supportsViews": false,
      "supportsLikes": true,
      "supportsComments": true,
      "supportsShares": true,
      "message": null
    },
    "youtube": {
      "supportsMetrics": true,
      "supportsViews": true,
      "supportsLikes": true,
      "supportsComments": true,
      "supportsShares": false,
      "message": null
    },
    "instagram": {
      "supportsMetrics": true,
      "supportsViews": true,
      "supportsLikes": true,
      "supportsComments": true,
      "supportsShares": false,
      "message": null
    },
    "linkedin": {
      "supportsMetrics": false,
      "supportsViews": false,
      "supportsLikes": false,
      "supportsComments": false,
      "supportsShares": false,
      "message": "Coming soon - LinkedIn API metrics are limited and require special permissions"
    },
    "facebook": {
      "supportsMetrics": false,
      "supportsViews": false,
      "supportsLikes": false,
      "supportsComments": false,
      "supportsShares": false,
      "message": "Coming soon - Facebook API metrics require additional permissions"
    }
  }
}
```

---

### 4. Get User's Published Posts with Platform Links
Get all published posts by the authenticated user with their platform URLs and metrics.

**Endpoint:** `GET /api/engagement/posts/all`

**Query Parameters:**
- `platform` (optional): Filter by platform (`twitter`, `youtube`, `instagram`, `linkedin`, `facebook`)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)

**Example Requests:**
```
GET /api/engagement/posts/all
GET /api/engagement/posts/all?platform=twitter
GET /api/engagement/posts/all?page=1&limit=10
GET /api/engagement/posts/all?platform=youtube&page=2&limit=20
```

**Response:**
```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "title": "My First Tweet",
        "content": {
          "caption": "Hello Twitter!"
        },
        "platform": "twitter",
        "post_type": "tweet",
        "platform_post_id": "1234567890",
        "platform_url": "https://twitter.com/username/status/1234567890",
        "published_at": "2024-01-15T10:00:00Z",
        "metrics": {
          "views": 0,
          "likes": 30,
          "comments": 5,
          "shares": 2
        },
        "createdAt": "2024-01-15T09:55:00Z"
      },
      {
        "_id": "507f1f77bcf86cd799439012",
        "title": "My YouTube Video",
        "content": {
          "caption": "Check out this video!"
        },
        "platform": "youtube",
        "post_type": "video",
        "platform_post_id": "dQw4w9WgXcQ",
        "platform_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "published_at": "2024-01-14T15:30:00Z",
        "metrics": {
          "views": 5000,
          "likes": 250,
          "comments": 50,
          "shares": 0
        },
        "createdAt": "2024-01-14T15:25:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 12,
      "pages": 1
    }
  }
}
```

---

### 5. Sync Engagement Metrics for a Specific Post
Manually sync the latest engagement metrics for a specific published post.

**Endpoint:** `POST /api/engagement/posts/:postId/sync`

**Parameters:**
- `postId` (path): MongoDB post ID

**Response (Success):**
```json
{
  "success": true,
  "message": "Metrics synced successfully",
  "data": {
    "metrics": {
      "likes": 30,
      "comments": 5,
      "shares": 2,
      "views": 0,
      "engagement_rate": 2.5
    },
    "url": "https://twitter.com/username/status/1234567890"
  }
}
```

**Response (Coming Soon):**
```json
{
  "success": false,
  "comingSoon": true,
  "message": "Coming soon - LinkedIn API metrics are limited and require special permissions",
  "data": {
    "platform": "linkedin"
  }
}
```

---

## Platform-Specific Notes

### Twitter
- ✅ Supports: Likes, Comments (Replies), Shares (Retweets)
- ❌ Does NOT support: Views (not available via free API)
- Returns engagement rate based on followers and recent posts

### YouTube
- ✅ Supports: Views, Likes, Comments
- ❌ Does NOT support: Shares (not provided by API)
- Returns engagement rate based on subscribers and video metrics

### Instagram
- ✅ Supports: Likes, Comments
- ⚠️ Limited: Views (not available for posts in basic API, only for stories/reels)
- ❌ Does NOT support: Shares (Instagram doesn't have shares for posts)
- Returns engagement rate based on followers and post metrics

### LinkedIn
- ⚠️ Coming Soon: Metrics require special API permissions and are limited
- Message: "Coming soon - LinkedIn API metrics are limited and require special permissions"

### Facebook
- ⚠️ Coming Soon: Metrics require additional API permissions
- Message: "Coming soon - Facebook API metrics require additional permissions"

---

## Automatic Platform URL Storage

When a post is successfully published to any platform, the platform URL is automatically:
1. Generated from the platform post ID
2. Stored in the `publishing.platform_url` field
3. Available in the post response

**Platform URL Format:**
- Twitter: `https://twitter.com/{username}/status/{tweet_id}`
- YouTube: `https://www.youtube.com/watch?v={video_id}`
- Instagram: `https://www.instagram.com/p/{media_id}`
- LinkedIn: `https://www.linkedin.com/feed/update/{post_id}`
- Facebook: `https://www.facebook.com/{post_id}`

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error information"
}
```

Common HTTP status codes:
- `200`: Success (even for "coming soon" responses)
- `400`: Bad Request (invalid parameters)
- `401`: Unauthorized (not authenticated)
- `403`: Forbidden (not authorized)
- `404`: Not Found (resource doesn't exist)
- `500`: Internal Server Error

---

## Testing Examples

### cURL Examples

```bash
# Get all platform engagement metrics
curl -X GET "http://localhost:5000/api/engagement" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Get Twitter metrics
curl -X GET "http://localhost:5000/api/engagement/twitter" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Get YouTube metrics for specific video
curl -X GET "http://localhost:5000/api/engagement/youtube?postId=VIDEO_ID" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Get user's published posts
curl -X GET "http://localhost:5000/api/engagement/posts/all?platform=twitter&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Sync metrics for a specific post
curl -X POST "http://localhost:5000/api/engagement/posts/POST_ID/sync" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"

# Get platform support info
curl -X GET "http://localhost:5000/api/engagement/platforms/support" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

### JavaScript/Fetch Examples

```javascript
// Get all platform engagement metrics
const response = await fetch('http://localhost:5000/api/engagement', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  credentials: 'include'
});
const data = await response.json();

// Get Twitter metrics
const twitterMetrics = await fetch('http://localhost:5000/api/engagement/twitter', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  credentials: 'include'
});

// Get user's published posts
const posts = await fetch('http://localhost:5000/api/engagement/posts/all?platform=twitter&page=1&limit=20', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  credentials: 'include'
});

// Sync post metrics
const syncResult = await fetch('http://localhost:5000/api/engagement/posts/POST_ID/sync', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  credentials: 'include'
});
```

---

## Notes

1. **Engagement Rate Calculation**: 
   - Formula: `((total engagement / number of posts) / followers) * 100`
   - Engagement = Likes + Comments + Shares
   - For platforms without follower data, engagement rate may be 0

2. **Platform URLs**: Automatically generated and stored when posts are published

3. **Coming Soon Platforms**: LinkedIn and Facebook return "coming soon" messages as they require additional API permissions

4. **Rate Limiting**: Be mindful of API rate limits when fetching metrics frequently

5. **Caching**: Consider caching metrics responses to avoid excessive API calls

---

## Summary

All endpoints are now available and ready for testing. The system automatically:
- ✅ Fetches metrics from Twitter, YouTube, and Instagram
- ✅ Calculates engagement rates
- ✅ Stores platform URLs when posts are published
- ✅ Shows "coming soon" for LinkedIn and Facebook
- ✅ Provides endpoints to get all published posts with links

