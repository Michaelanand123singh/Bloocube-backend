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

const app = express();

// Middlewares
app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
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
const healthRoutes = require("./routes/health.routes");
app.use("/api", healthRoutes);


// 404 and error handlers
app.use(notFound);
app.use(errorHandler);

module.exports = app;
