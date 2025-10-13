#!/usr/bin/env node

/**
 * AI Services Endpoint Discovery Script
 * This script helps discover what endpoints are available on the AI services API
 */

const axios = require('axios');
const config = require('../src/config/env');

const AI_SERVICE_URL = config.AI_SERVICE_URL;
const AI_SERVICE_API_KEY = config.AI_SERVICE_API_KEY;

console.log('🔍 Discovering AI Services Endpoints');
console.log('=====================================');
console.log(`AI Service URL: ${AI_SERVICE_URL}`);
console.log(`API Key: ${AI_SERVICE_API_KEY ? `${AI_SERVICE_API_KEY.substring(0, 10)}...` : 'Not set'}`);
console.log('');

const headers = {
  'x-api-key': AI_SERVICE_API_KEY,
  'Content-Type': 'application/json'
};

async function testEndpoint(method, endpoint, description) {
  try {
    console.log(`Testing ${method.toUpperCase()} ${endpoint} - ${description}`);
    
    const response = await axios({
      method: method.toLowerCase(),
      url: `${AI_SERVICE_URL}${endpoint}`,
      headers: headers,
      timeout: 10000,
      validateStatus: () => true // Don't throw on any status code
    });
    
    console.log(`   ✅ Status: ${response.status}`);
    if (response.data) {
      console.log(`   📄 Response: ${JSON.stringify(response.data).substring(0, 200)}...`);
    }
    return { endpoint, method, status: response.status, success: true };
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { endpoint, method, status: error.response?.status || 'ERROR', success: false };
  }
}

async function discoverEndpoints() {
  const endpoints = [
    { method: 'GET', path: '/health', desc: 'Health check' },
    { method: 'GET', path: '/', desc: 'Root endpoint' },
    { method: 'GET', path: '/docs', desc: 'API documentation' },
    { method: 'GET', path: '/openapi.json', desc: 'OpenAPI spec' },
    { method: 'GET', path: '/ai', desc: 'AI endpoints root' },
    { method: 'GET', path: '/ai/competitor-analysis', desc: 'Competitor analysis info' },
    { method: 'POST', path: '/ai/competitor-analysis', desc: 'Competitor analysis' },
    { method: 'POST', path: '/ai/competitor-analysis/enhanced', desc: 'Enhanced competitor analysis' },
    { method: 'GET', path: '/ai/providers/status', desc: 'AI providers status' },
    { method: 'GET', path: '/ai/providers/models', desc: 'Available models' }
  ];

  console.log('Testing endpoints...\n');
  
  const results = [];
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.method, endpoint.path, endpoint.desc);
    results.push(result);
    console.log(''); // Empty line for readability
  }

  console.log('=====================================');
  console.log('📊 Endpoint Discovery Results:');
  console.log('=====================================');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Successful endpoints: ${successful.length}`);
  successful.forEach(r => {
    console.log(`   ${r.method} ${r.endpoint} - Status: ${r.status}`);
  });
  
  console.log(`\n❌ Failed endpoints: ${failed.length}`);
  failed.forEach(r => {
    console.log(`   ${r.method} ${r.endpoint} - Status: ${r.status}`);
  });

  // Check if competitor analysis endpoint is available
  const competitorAnalysis = results.find(r => 
    r.endpoint === '/ai/competitor-analysis' && r.method === 'POST' && r.success
  );
  
  if (competitorAnalysis) {
    console.log('\n🎉 Competitor analysis endpoint is available!');
  } else {
    console.log('\n⚠️  Competitor analysis endpoint is not available or not working.');
    console.log('   This explains the 405 Method Not Allowed error.');
  }
}

// Run the discovery
discoverEndpoints().catch(error => {
  console.error('Discovery failed:', error);
  process.exit(1);
});
