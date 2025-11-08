// src/controllers/aiController.js
const aiClient = require('../services/aiClient');
const AIResults = require('../models/AI_Results');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../utils/constants');
const { asyncHandler } = require('../middlewares/errorHandler');

const competitorAnalysis = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const payload = req.body;
  const aiResponse = await aiClient.competitorAnalysis(payload);

  const record = await AIResults.create({
    user_id: userId,
    campaign_id: payload.campaign_id || null,
    result_type: 'competitor_analysis',
    input_data: payload,
    content: aiResponse.content,
    status: 'completed'
  });

  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { result: record } });
});

const suggestions = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const payload = req.body;
  const aiResponse = await aiClient.suggestions(payload);

  const record = await AIResults.create({
    user_id: userId,
    campaign_id: payload.campaign_id || null,
    result_type: 'suggestion',
    input_data: payload,
    content: aiResponse.content,
    status: 'completed'
  });

  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { result: record } });
});

const matchmaking = asyncHandler(async (req, res) => {
  const userId = req.userId;
  const payload = req.body;
  const aiResponse = await aiClient.matchmaking(payload);

  const record = await AIResults.create({
    user_id: userId,
    campaign_id: payload.campaign_id || null,
    result_type: 'matchmaking',
    input_data: payload,
    content: aiResponse.content,
    status: 'completed'
  });

  res.status(HTTP_STATUS.CREATED).json({ success: true, data: { result: record } });
});

const scoreContent = asyncHandler(async (req, res) => {
  const payload = req.body;
  const aiResponse = await aiClient.scoreContent(payload);
  
  res.status(HTTP_STATUS.OK).json({ 
    success: true, 
    data: aiResponse 
  });
});

module.exports = { competitorAnalysis, suggestions, matchmaking, scoreContent };


