#!/usr/bin/env node

/**
 * Test AI Services with minimal payload to identify the issue
 */

const axios = require('axios');
const config = require('../src/config/env');

const AI_SERVICE_URL = config.AI_SERVICE_URL;
const AI_SERVICE_API_KEY = config.AI_SERVICE_API_KEY;

const headers = {
  'x-api-key': AI_SERVICE_API_KEY,
  'Content-Type': 'application/json'
};

async function testMinimalPayload() {
  console.log('🧪 Testing AI Services with minimal payload');
  console.log('==========================================');
  
  // Test 1: Empty payload
  console.log('\n1. Testing with empty payload...');
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/ai/competitor-analysis/`, {}, {
      headers,
      timeout: 30000,
      validateStatus: () => true
    });
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, response.data);
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }

  // Test 2: Minimal required fields only
  console.log('\n2. Testing with minimal required fields...');
  const minimalPayload = {
    user_id: 'test_user_123',
    competitors_data: []
  };
  
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/ai/competitor-analysis/`, minimalPayload, {
      headers,
      timeout: 30000,
      validateStatus: () => true
    });
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, response.data);
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }

  // Test 3: With one minimal competitor
  console.log('\n3. Testing with one minimal competitor...');
  const minimalCompetitorPayload = {
    user_id: 'test_user_123',
    competitors_data: [{
      platform: 'instagram',
      username: 'test_user',
      profile_url: 'https://instagram.com/test_user'
    }]
  };
  
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/ai/competitor-analysis/`, minimalCompetitorPayload, {
      headers,
      timeout: 30000,
      validateStatus: () => true
    });
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, response.data);
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }

  // Test 4: Check what the API expects by looking at validation errors
  console.log('\n4. Testing with invalid data to see validation errors...');
  const invalidPayload = {
    user_id: 123, // Should be string
    competitors_data: 'invalid' // Should be array
  };
  
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/ai/competitor-analysis/`, invalidPayload, {
      headers,
      timeout: 30000,
      validateStatus: () => true
    });
    console.log(`   Status: ${response.status}`);
    console.log(`   Response:`, response.data);
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
}

testMinimalPayload().catch(console.error);
