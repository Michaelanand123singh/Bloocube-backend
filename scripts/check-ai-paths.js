#!/usr/bin/env node

const axios = require('axios');
const config = require('../src/config/env');

const AI_SERVICE_URL = config.AI_SERVICE_URL;
const AI_SERVICE_API_KEY = config.AI_SERVICE_API_KEY;

async function checkPaths() {
  try {
    const response = await axios.get(`${AI_SERVICE_URL}/openapi.json`, {
      headers: {
        'x-api-key': AI_SERVICE_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    const openapi = response.data;
    console.log('Available API Paths:');
    console.log('==================');
    
    Object.keys(openapi.paths).forEach(path => {
      const methods = Object.keys(openapi.paths[path]);
      console.log(`${path}:`);
      methods.forEach(method => {
        const operation = openapi.paths[path][method];
        console.log(`  ${method.toUpperCase()}: ${operation.summary || operation.description || 'No description'}`);
      });
      console.log('');
    });
    
    // Check specifically for competitor analysis
    const competitorPaths = Object.keys(openapi.paths).filter(path => 
      path.includes('competitor') || path.includes('analysis')
    );
    
    console.log('Competitor/Analysis Related Paths:');
    console.log('==================================');
    competitorPaths.forEach(path => {
      console.log(path);
    });
    
  } catch (error) {
    console.error('Error fetching OpenAPI spec:', error.message);
  }
}

checkPaths();
