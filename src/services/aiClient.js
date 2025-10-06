// src/services/aiClient.js
const axios = require('axios');
const http = require('http');
const https = require('https');
const config = require('../config/env');
const logger = require('../utils/logger');

const keepAliveHttp = new http.Agent({ keepAlive: true, maxSockets: 100 });
const keepAliveHttps = new https.Agent({ keepAlive: true, maxSockets: 100 });

const client = axios.create({
  baseURL: config.AI_SERVICE_URL ,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip, deflate, br',
    'x-api-key': config.AI_SERVICE_API_KEY 
  },
  httpAgent: keepAliveHttp,
  httpsAgent: keepAliveHttps,
  maxRedirects: 3,
});

const handle = async (method, url, data) => {
  const start = Date.now();
  try {
    const res = await client({ method, url, data });
    logger.api('ai-service', url, method.toUpperCase(), res.status, Date.now() - start);
    return res.data;
  } catch (err) {
    logger.api('ai-service', url, method.toUpperCase(), err.response?.status || 500, Date.now() - start, { error: err.message });
    throw err;
  }
};

module.exports = {
  // Competitor Analysis - Updated for new stateless flow
  competitorAnalysis: (payload) => handle('post', '/ai/competitor-analysis', payload),
  
  // Content Suggestions
  suggestions: (payload) => handle('post', '/ai/suggestions', payload),
  
  // Brand-Creator Matchmaking
  matchmaking: (payload) => handle('post', '/ai/matchmaking', payload),
  
  // Trend Analysis
  trendAnalysis: (payload) => handle('post', '/ai/trends', payload),
  
  // Performance Predictions
  performancePrediction: (payload) => handle('post', '/ai/predictions', payload),
  
  // Health Check
  healthCheck: () => handle('get', '/health', null),
  
  // AI Provider Management (Super Admin)
  getProvidersStatus: () => handle('get', '/ai/providers/status', null),
  switchProvider: (payload) => handle('post', '/ai/providers/switch', payload),
  testProvider: (payload) => handle('post', '/ai/providers/test', payload),
  getAvailableModels: (provider) => handle('get', `/ai/providers/models${provider ? `?provider=${provider}` : ''}`, null),
  healthCheckProviders: () => handle('get', '/ai/providers/health', null),
  getUsageStatistics: (period) => handle('get', `/ai/providers/usage-stats${period ? `?period=${period}` : ''}`, null)
};


