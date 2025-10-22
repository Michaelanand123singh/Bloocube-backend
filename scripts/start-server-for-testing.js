#!/usr/bin/env node

/**
 * Start Backend Server for Testing
 * 
 * This script starts the backend server in the background for testing purposes
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting backend server for testing...\n');

// Start the server
const server = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'pipe',
  shell: true
});

let serverReady = false;
const maxWaitTime = 30000; // 30 seconds
const startTime = Date.now();

// Handle server output
server.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(output);
  
  // Check if server is ready
  if (output.includes('Server running on port') || output.includes('listening on port')) {
    serverReady = true;
    console.log('\n✅ Backend server is ready for testing!');
    console.log('💡 You can now run the test scripts:');
    console.log('   npm run test:redirection-flows');
    console.log('   npm run test:social-connections');
    console.log('\n🛑 Press Ctrl+C to stop the server when done testing.\n');
  }
});

server.stderr.on('data', (data) => {
  console.error('Server error:', data.toString());
});

server.on('close', (code) => {
  console.log(`\n🛑 Backend server stopped with code ${code}`);
});

server.on('error', (error) => {
  console.error('Failed to start server:', error);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping backend server...');
  server.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Stopping backend server...');
  server.kill('SIGTERM');
  process.exit(0);
});

// Timeout check
setTimeout(() => {
  if (!serverReady) {
    console.log('\n⚠️  Server startup is taking longer than expected...');
    console.log('   Check if there are any errors in the server output above.');
    console.log('   You may need to check your environment variables and dependencies.');
  }
}, maxWaitTime);
