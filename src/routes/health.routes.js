const express = require("express");
const redis = require("../config/redis");

const router = express.Router();

// Basic health endpoint so /api/health responds OK
router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "backend", timestamp: Date.now() });
});

router.get("/health/redis", async (req, res) => {
  try {
    await redis.set("health-check", "ok", 10); // expires in 10s
    const value = await redis.get("health-check");
    return res.json({ redis: value === "ok" ? "connected" : "failed" });
  } catch (err) {
    return res.status(500).json({ redis: "error", error: err.message });
  }
});
router.get("/health/mongo", async (req, res) => {
  try {
    await redis.set("health-check", "ok", 10); // expires in 10s
    const value = await redis.get("health-check");
    return res.json({ redis: value === "ok" ? "connected" : "failed" });
  } catch (err) {
    return res.status(500).json({ redis: "error", error: err.message });
  }
});

module.exports = router;
