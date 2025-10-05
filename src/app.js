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
const campaignRoutes = require("./routes/campaign.routes");
const bidRoutes = require("./routes/bid.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const adminRoutes = require("./routes/admin.routes");
const aiRoutes = require("./routes/ai.routes");
const twitterRoutes = require("./routes/twitter.routes");
const googleRoutes = require("./routes/google.routes");
const linkedinRoutes = require("./routes/linkedin.routes");
const youtubeRoutes = require("./routes/youtube.routes");
const postRoutes = require("./routes/post.routes");
const competitorRoutes = require("./routes/competitor.routes");

const app = express();

// Middlewares
app.use(helmet());
// Support multiple allowed origins via comma-separated CORS_ORIGIN
const allowedOrigins = (config.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
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

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/bids", bidRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/twitter", twitterRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/linkedin", linkedinRoutes);
app.use("/api/youtube", youtubeRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/competitor", competitorRoutes);
const aiProviderRoutes = require('./routes/aiProvider.routes');
app.use("/api/admin/ai-providers", aiProviderRoutes);
const healthRoutes = require("./routes/health.routes");
app.use("/api", healthRoutes);


// 404 and error handlers
app.use(notFound);
app.use(errorHandler);

module.exports = app;
