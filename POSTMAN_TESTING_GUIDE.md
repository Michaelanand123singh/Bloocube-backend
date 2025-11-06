# Postman Testing Guide for Engagement API

This guide will help you test all the engagement API endpoints using Postman.

## Prerequisites

1. **Postman installed** (Desktop app or web version)
2. **Backend server running** (default: `http://localhost:5000`)
3. **Valid JWT token** from authentication

---

## Step 1: Get Authentication (Cookie-Based)

**IMPORTANT:** Your backend uses **HttpOnly cookies** for authentication, NOT tokens in the response body. The tokens are automatically stored in cookies after login.

### Login Endpoint

**Request:**
```
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "68f1f7e506c16b4faddb37bd",
      "name": "anchal",
      "email": "anchalsandhu8085@gmail.com",
      ...
    }
  }
}
```

**Note:** The token is NOT in the response body - it's in HttpOnly cookies!

### Enable Cookie Handling in Postman

1. **Go to Postman Settings:**
   - Click **Settings** (gear icon) → **General** tab
   - Make sure **"Send cookies"** is **enabled** (checked)
   - This allows Postman to automatically save and send cookies

2. **After Login:**
   - Postman will automatically save the cookies from the login response
   - Cookies are stored in the **Cookies** tab (visible after sending request)
   - All subsequent requests will automatically include these cookies

### Verify Cookies Were Saved

1. After sending login request, click the **Cookies** link below the response
2. You should see cookies like:
   - `access_token` (JWT access token)
   - `refresh_token` (JWT refresh token)
   - `user_data` (User information)

### Option A: Automatic Cookie Handling (Recommended)

**Just enable cookies in Postman settings and login - cookies will be sent automatically!**

- No need to manually add Authorization headers
- Cookies are automatically included in all requests
- Most secure and easiest method

### Option B: Manual Token Extraction (If Needed)

If you need to use the token in Authorization header manually:

1. After login, check **Cookies** tab
2. Copy the `access_token` cookie value
3. Use it in Authorization header: `Bearer <token>`

---

## Step 2: Set Up Postman Environment (Recommended)

1. Click **"Environments"** in the left sidebar
2. Click **"+"** to create a new environment
3. Name it "Bloocube Local" or "Bloocube Production"
4. Add these variables:

| Variable | Initial Value | Current Value |
|----------|---------------|---------------|
| `base_url` | `http://localhost:5000` | `http://localhost:5000` |
| `token` | (empty - will be set after login) | (empty) |

5. Select the environment from the dropdown (top right)

---

## Step 3: Configure Authentication

### Method 1: Cookie-Based Authentication (Recommended - Easiest)

**If cookies are enabled in Postman settings, you don't need to do anything!**

1. Just login once using the login endpoint
2. Postman will automatically save cookies
3. All subsequent requests will automatically include cookies
4. No headers needed!

### Method 2: Manual Bearer Token (Alternative)

If you prefer to use Bearer token authentication:

1. **Extract token from cookies:**
   - After login, click **Cookies** link below response
   - Find `access_token` cookie
   - Copy its value

2. **Add Authorization header:**
   - **Key:** `Authorization`
   - **Value:** `Bearer <paste-token-here>`

3. **Or use collection-level auth:**
   - Create collection: "Engagement API"
   - Go to collection → **Authorization** tab
   - Select **Type:** `Bearer Token`
   - Set **Token:** (paste token value)
   - All requests in collection will use this token

---

## Step 4: Test Each Endpoint

### Endpoint 1: Get All Platform Engagement Metrics

**Request Configuration:**
- **Method:** `GET`
- **URL:** `{{base_url}}/api/engagement`
- **Headers:**
  - `Authorization`: `Bearer {{token}}`
  - `Content-Type`: `application/json`

**Postman Setup:**
1. Create new request → Name it "Get All Platform Metrics"
2. Method: **GET**
3. URL: `{{base_url}}/api/engagement`
4. **If using cookies:** No headers needed (cookies sent automatically)
5. **If using Bearer token:** Headers tab → Add:
   - `Authorization`: `Bearer <your-token>`
   - `Content-Type`: `application/json`

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "platforms": {
      "twitter": { ... },
      "youtube": { ... },
      "instagram": { ... },
      "linkedin": {
        "success": false,
        "comingSoon": true,
        "message": "Coming soon - LinkedIn API metrics are limited..."
      },
      "facebook": {
        "success": false,
        "comingSoon": true,
        "message": "Coming soon - Facebook API metrics require..."
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

### Endpoint 2: Get Twitter Engagement Metrics

**Request Configuration:**
- **Method:** `GET`
- **URL:** `{{base_url}}/api/engagement/twitter`
- **Headers:**
  - `Authorization`: `Bearer {{token}}`
  - `Content-Type`: `application/json`

**Postman Setup:**
1. Create new request → Name it "Get Twitter Metrics"
2. Method: **GET**
3. URL: `{{base_url}}/api/engagement/twitter`
4. **If using cookies:** No headers needed
5. **If using Bearer token:** Headers tab → Add:
   - `Authorization`: `Bearer <your-token>`
   - `Content-Type`: `application/json`

**Expected Response (200 OK):**
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
      "posts": 5,
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

**Test with Specific Post ID:**
- URL: `{{base_url}}/api/engagement/twitter?postId=1234567890`

---

### Endpoint 3: Get YouTube Engagement Metrics

**Request Configuration:**
- **Method:** `GET`
- **URL:** `{{base_url}}/api/engagement/youtube`
- **Headers:**
  - `Authorization`: `Bearer {{token}}`
  - `Content-Type`: `application/json`

**Postman Setup:**
1. Create new request → Name it "Get YouTube Metrics"
2. Method: **GET**
3. URL: `{{base_url}}/api/engagement/youtube`
4. **If using cookies:** No headers needed
5. **If using Bearer token:** Headers tab → Add:
   - `Authorization`: `Bearer <your-token>`
   - `Content-Type`: `application/json`

**Test with Specific Video:**
- URL: `{{base_url}}/api/engagement/youtube?postId=dQw4w9WgXcQ`

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "platform": "youtube",
    "metrics": {
      "views": 10000,
      "likes": 500,
      "comments": 100,
      "shares": 0,
      "posts": 3,
      "engagement_rate": 6.0
    },
    "posts": [ ... ]
  }
}
```

---

### Endpoint 4: Get Instagram Engagement Metrics

**Request Configuration:**
- **Method:** `GET`
- **URL:** `{{base_url}}/api/engagement/instagram`
- **Headers:**
  - `Authorization`: `Bearer {{token}}`
  - `Content-Type`: `application/json`

**Postman Setup:**
1. Create new request → Name it "Get Instagram Metrics"
2. Method: **GET**
3. URL: `{{base_url}}/api/engagement/instagram`
4. **If using cookies:** No headers needed
5. **If using Bearer token:** Headers tab → Add:
   - `Authorization`: `Bearer <your-token>`
   - `Content-Type`: `application/json`

---

### Endpoint 5: Get LinkedIn Engagement Metrics (Coming Soon)

**Request Configuration:**
- **Method:** `GET`
- **URL:** `{{base_url}}/api/engagement/linkedin`
- **Headers (only if using Bearer token):**
  - `Authorization`: `Bearer <your-token>`
  - `Content-Type`: `application/json`
- **Note:** If using cookies, no headers needed

**Expected Response (200 OK):**
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

### Endpoint 6: Get Facebook Engagement Metrics

**Request Configuration:**
- **Method:** `GET`
- **URL:** `{{base_url}}/api/engagement/facebook`
- **Headers (only if using Bearer token):**
  - `Authorization`: `Bearer <your-token>`
  - `Content-Type`: `application/json`
- **Note:** If using cookies, no headers needed

**Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "platform": "facebook",
    "metrics": {
      "likes": 500,
      "comments": 50,
      "shares": 25,
      "views": 5000,
      "posts": 10,
      "engagement_rate": 5.75
    },
    "posts": [
      {
        "postId": "1234567890_987654321",
        "likes": 50,
        "comments": 5,
        "shares": 2,
        "views": 500,
        "url": "https://www.facebook.com/permalink.php?story_fbid=...",
        "timestamp": "2024-01-15T10:00:00+0000"
      }
    ]
  }
}
```

**Note:** Requires Facebook Page permissions: `pages_manage_engagement`, `pages_read_user_content`, `pages_show_list`, `pages_read_engagement`

---

### Endpoint 7: Get Platform Support Information

**Request Configuration:**
- **Method:** `GET`
- **URL:** `{{base_url}}/api/engagement/platforms/support`
- **Headers:**
  - `Authorization`: `Bearer {{token}}`
  - `Content-Type`: `application/json`

**Postman Setup:**
1. Create new request → Name it "Get Platform Support"
2. Method: **GET**
3. URL: `{{base_url}}/api/engagement/platforms/support`
4. **If using cookies:** No headers needed
5. **If using Bearer token:** Headers tab → Add:
   - `Authorization`: `Bearer <your-token>`
   - `Content-Type`: `application/json`

**Expected Response (200 OK):**
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
    "youtube": { ... },
    "instagram": { ... },
    "linkedin": {
      "supportsMetrics": false,
      "message": "Coming soon - LinkedIn API metrics..."
    },
    "facebook": {
      "supportsMetrics": false,
      "message": "Coming soon - Facebook API metrics..."
    }
  }
}
```

---

### Endpoint 8: Get User's Published Posts

**Request Configuration:**
- **Method:** `GET`
- **URL:** `{{base_url}}/api/engagement/posts/all`
- **Query Parameters (optional):**
  - `platform`: `twitter`, `youtube`, `instagram`, `linkedin`, `facebook`
  - `page`: `1` (default)
  - `limit`: `20` (default, max 100)
  - `includeMetrics`: `true` (default) or `false` - Set to `false` for faster loading (skips real-time metrics fetching)
- **Headers (only if using Bearer token):**
  - `Authorization`: `Bearer <your-token>`
  - `Content-Type`: `application/json`
- **Note:** If using cookies, no headers needed

**Postman Setup:**
1. Create new request → Name it "Get Published Posts"
2. Method: **GET**
3. URL: `{{base_url}}/api/engagement/posts/all`
4. **Params tab** (Query Parameters):
   - `platform`: `twitter` (optional)
   - `page`: `1` (optional)
   - `limit`: `20` (optional)
5. **If using cookies:** No headers needed
6. **If using Bearer token:** Headers tab → Add:
   - `Authorization`: `Bearer <your-token>`
   - `Content-Type`: `application/json`

**Example URLs:**
- All posts: `{{base_url}}/api/engagement/posts/all`
- Twitter only: `{{base_url}}/api/engagement/posts/all?platform=twitter`
- With pagination: `{{base_url}}/api/engagement/posts/all?page=1&limit=10`
- Combined: `{{base_url}}/api/engagement/posts/all?platform=youtube&page=1&limit=20`

**Expected Response (200 OK):**
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

### Endpoint 9: Sync Post Metrics

**Request Configuration:**
- **Method:** `POST`
- **URL:** `{{base_url}}/api/engagement/posts/:postId/sync`
- **Path Variables:**
  - `postId`: MongoDB post ID (e.g., `507f1f77bcf86cd799439011`)
- **Headers:**
  - `Authorization`: `Bearer {{token}}`
  - `Content-Type`: `application/json`

**Postman Setup:**
1. Create new request → Name it "Sync Post Metrics"
2. Method: **POST**
3. URL: `{{base_url}}/api/engagement/posts/:postId/sync`
4. **Params tab** (Path Variables):
   - `postId`: `507f1f77bcf86cd799439011` (replace with actual post ID)
5. **If using cookies:** No headers needed
6. **If using Bearer token:** Headers tab → Add:
   - `Authorization`: `Bearer <your-token>`
   - `Content-Type`: `application/json`
7. Body tab: Leave empty (no body needed)

**Expected Response (200 OK):**
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

---

## Step 5: Create Postman Collection

1. **Create Collection:**
   - Click **"New"** → **"Collection"**
   - Name: "Bloocube Engagement API"
   - Description: "API endpoints for engagement metrics and analytics"

2. **Add All Requests:**
   - Create each request as described above
   - Drag them into the collection

3. **Set Collection Variables:**
   - Go to collection → **Variables** tab
   - Add:
     - `base_url`: `http://localhost:5000`
     - `token`: (optional - only if using Bearer token auth)

4. **Collection Authentication (Optional):**
   - **For Cookie-based auth:** No collection auth needed - just enable cookies in Postman settings
   - **For Bearer token auth:** 
     - Go to collection → **Authorization** tab
     - Type: **Bearer Token**
     - Token: `{{token}}` (or paste token directly)

---

## Step 6: Test Authentication Errors

### Test 1: Request Without Token

1. Remove Authorization header or set wrong token
2. Expected Response (401 Unauthorized):
```json
{
  "success": false,
  "message": "Unauthorized - Invalid or expired token"
}
```

### Test 2: Invalid Platform Name

1. Request: `GET {{base_url}}/api/engagement/invalid-platform`
2. Expected Response (400 Bad Request):
```json
{
  "errors": [
    {
      "msg": "Platform must be one of: twitter, youtube, instagram, linkedin, facebook",
      "param": "platform",
      "location": "params"
    }
  ]
}
```

### Test 3: Invalid Post ID

1. Request: `POST {{base_url}}/api/engagement/posts/invalid-id/sync`
2. Expected Response (400 Bad Request):
```json
{
  "errors": [
    {
      "msg": "Invalid post ID",
      "param": "postId",
      "location": "params"
    }
  ]
}
```

---

## Step 7: Postman Pre-request Script (Optional - For Bearer Token Only)

If you're using Bearer token authentication and want to automatically extract token from cookies:

1. Create a **login request** first
2. In the **Tests** tab of login request, add:
```javascript
// Extract token from cookies and save to collection variable
if (pm.response.code === 200) {
    // Get cookies from response
    const cookies = pm.cookies.all();
    const accessTokenCookie = cookies.find(c => c.name === 'access_token');
    
    if (accessTokenCookie) {
        pm.collectionVariables.set("token", accessTokenCookie.value);
        console.log("Token extracted from cookie and saved to collection variable");
    } else {
        console.log("No access_token cookie found");
    }
}
```

3. Now all other requests using `{{token}}` will automatically use this token

**Note:** If using cookie-based auth, you don't need this script - cookies are handled automatically!

---

## Step 8: Test Workflow Sequence

### Complete Testing Flow:

1. **Login** → Get token → Save to collection variable
2. **Get Platform Support** → Check which platforms are supported
3. **Get All Platform Metrics** → See overview
4. **Get Twitter Metrics** → Test specific platform
5. **Get YouTube Metrics** → Test another platform
6. **Get Published Posts** → See all posts with links
7. **Sync Post Metrics** → Update metrics for a specific post

---

## Common Issues & Troubleshooting

### Issue 1: 401 Unauthorized
**Solution:**
- **If using cookies:** 
  - Make sure "Send cookies" is enabled in Postman Settings
  - Login again to get fresh cookies
  - Check Cookies tab to verify cookies are saved
- **If using Bearer token:**
  - Check if token is valid
  - Ensure Authorization header format: `Bearer <token>`
  - Token might be expired - login again and extract new token from cookies

### Issue 2: 404 Not Found
**Solution:**
- Check if backend server is running
- Verify base URL is correct
- Check if route exists in backend

### Issue 3: Empty Metrics Response
**Solution:**
- User might not have connected social accounts
- Check if platform account is connected in user profile
- Verify access tokens are valid

### Issue 4: Twitter Rate Limit Error (429)
**Error Message:** `"Request failed with code 429"` or `"Twitter API rate limit exceeded"`

**What it means:**
- Twitter API has strict rate limits (typically 15 requests per 15 minutes per user)
- You've exceeded the allowed number of requests

**Solutions:**
1. **Wait before retrying:**
   - Wait at least 15 minutes before making another request
   - The system will automatically use cached data if available

2. **Use cached data:**
   - The system caches metrics for 5 minutes
   - If you hit rate limit, it will return cached data with a warning

3. **Reduce request frequency:**
   - Don't send multiple requests in quick succession
   - Space out your API calls

4. **Check response:**
   - If cached data is available, you'll see:
     ```json
     {
       "success": true,
       "cached": true,
       "warning": "Rate limit exceeded. Showing cached data..."
     }
     ```

**Expected Error Response:**
```json
{
  "success": false,
  "error": "Twitter API rate limit exceeded. Please try again in 15 minutes.",
  "rateLimitExceeded": true,
  "retryAfter": 900,
  "message": "Twitter API has rate limits. Please wait before requesting metrics again."
}
```

### Issue 5: "Coming Soon" for All Platforms
**Solution:**
- This is expected for LinkedIn only
- Twitter, YouTube, Instagram, and Facebook should work if accounts are connected
- Facebook requires Page permissions: `pages_manage_engagement`, `pages_read_user_content`, `pages_show_list`, `pages_read_engagement`

### Issue 6: CORS Error
**Solution:**
- Ensure backend CORS is configured correctly
- Check if origin is allowed in backend config
- Use Postman (not browser) to avoid CORS issues

---

## Postman Collection JSON Export

You can export your collection as JSON and share it with your team:

1. Click collection → **"..."** (three dots)
2. Select **"Export"**
3. Choose **Collection v2.1** format
4. Save the JSON file

Here's a sample collection structure you can import:

```json
{
  "info": {
    "name": "Bloocube Engagement API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:5000"
    },
    {
      "key": "token",
      "value": ""
    }
  ],
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{token}}",
        "type": "string"
      }
    ]
  },
  "item": [
    {
      "name": "Get All Platform Metrics",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{base_url}}/api/engagement",
          "host": ["{{base_url}}"],
          "path": ["api", "engagement"]
        }
      }
    }
  ]
}
```

---

## Quick Reference Card

| Endpoint | Method | URL | Auth Required |
|----------|--------|-----|---------------|
| All Metrics | GET | `/api/engagement` | Yes |
| Platform Metrics | GET | `/api/engagement/:platform` | Yes |
| Platform Support | GET | `/api/engagement/platforms/support` | Yes |
| Published Posts | GET | `/api/engagement/posts/all` | Yes |
| Sync Metrics | POST | `/api/engagement/posts/:postId/sync` | Yes |

---

## Testing Checklist

- [ ] Login and get token
- [ ] Test all platform metrics endpoint
- [ ] Test individual platform metrics (Twitter, YouTube, Instagram, Facebook)
- [ ] Test "coming soon" platforms (LinkedIn only)
- [ ] Test platform support endpoint
- [ ] Test published posts endpoint (with and without filters)
- [ ] Test sync metrics endpoint
- [ ] Test authentication errors
- [ ] Test validation errors
- [ ] Test pagination

---

## Next Steps

After testing in Postman:
1. Export collection for team sharing
2. Create automated tests using Postman Tests
3. Set up environment variables for different environments (dev, staging, prod)
4. Integrate with CI/CD pipeline using Newman (Postman CLI)

