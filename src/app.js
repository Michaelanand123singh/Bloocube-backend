// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const mongoSanitize = require("express-mongo-sanitize");
const hpp = require("hpp");
const config = require("./config/env");
const { errorHandler, notFound } = require("./middlewares/errorHandler");
const { generalLimiter } = require("./middlewares/rateLimiter");
const logger = require("./utils/logger");

// Routes
const authRoutes = require("./routes/auth.routes");
const profileRoutes = require("./routes/profile.routes");
const campaignRoutes = require("./routes/campaign.routes");
const bidRoutes = require("./routes/bid.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const adminRoutes = require("./routes/admin.routes");
const aiRoutes = require("./routes/ai.routes");
const twitterRoutes = require("./routes/twitter.routes");
const googleRoutes = require("./routes/google.routes");
const linkedinRoutes = require("./routes/linkedin.routes");
const youtubeRoutes = require("./routes/youtube.routes");
const instagramRoutes = require("./routes/instagram.routes");
const facebookRoutes = require("./routes/facebook.routes");
const postRoutes = require("./routes/post.routes");
const competitorRoutes = require("./routes/competitor.routes");
const notificationRoutes = require("./routes/notification.routes");

const app = express();

// Middlewares
app.use(helmet());
// Support multiple allowed origins via comma-separated CORS_ORIGIN
const corsOrigin = config.CORS_ORIGIN || 'http://localhost:3000,https://bloocube.com,https://admin.bloocube.com,https://api-backend.bloocube.com,https://api-ai-services.bloocube.com';
const allowedOrigins = corsOrigin.split(',').map(s => s.trim()).filter(Boolean);
console.log('CORS_ORIGIN from config:', config.CORS_ORIGIN);

app.use(cors({
  origin: (origin, callback) => {
    console.log('CORS request from origin:', origin);
  
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('No origin provided, allowing request');
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      console.log('Origin allowed:', origin);
      return callback(null, true);
    }
    
    // Additional check for subdomains
    const isSubdomain = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.startsWith('https://') && origin.startsWith('https://')) {
        const allowedDomain = allowedOrigin.replace('https://', '');
        const requestDomain = origin.replace('https://', '');
        return requestDomain === allowedDomain || requestDomain.endsWith('.' + allowedDomain);
      }
      return false;
    });
    
    if (isSubdomain) {
      console.log('Origin allowed as subdomain:', origin);
      return callback(null, true);
    }
    
    console.log('Origin rejected:', origin, 'Allowed origins:', allowedOrigins);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());
app.use(hpp());
app.use(compression());
app.use(morgan("dev"));
app.use(generalLimiter);

// Healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "backend", timestamp: Date.now() });
});

// Serve uploaded files statically
app.use('/uploads', express.static('uploads'));

// CORS test endpoint
app.get("/cors-test", (req, res) => {
  res.json({ 
    status: "ok", 
    origin: req.headers.origin,
    allowedOrigins: allowedOrigins,
    corsOrigin: config.CORS_ORIGIN,
    timestamp: Date.now() 
  });
});

// Simple CORS test for preflight
app.options("/cors-test", (req, res) => {
  res.json({ status: "ok", message: "CORS preflight successful" });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/bids", bidRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/twitter", twitterRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/linkedin", linkedinRoutes);
app.use("/api/youtube", youtubeRoutes);
app.use("/api/instagram", instagramRoutes);
app.use("/api/facebook", facebookRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/competitor", competitorRoutes);
app.use("/api/notifications", notificationRoutes);
const aiProviderRoutes = require('./routes/aiProvider.routes');
app.use("/api/admin/ai-providers", aiProviderRoutes);
const healthRoutes = require("./routes/health.routes");
app.use("/api", healthRoutes);


// 404 and error handlers
app.use(notFound);
app.use(errorHandler);

module.exports = app;
