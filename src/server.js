// src/server.js
const app = require("./app");
const connectDB = require("./config/db");
const config = require("./config/env");
const logger = require("./utils/logger");
const redis = require("./config/redis");

const PORT = config.PORT || 5000;

// Function to find an available port
const findAvailablePort = async (startPort) => {
  const net = require('net');
  
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
};

(async () => {
  try {
    console.log('Starting server...');
    await connectDB();
    console.log('Database connected');
    
    // Try to connect to Redis, but don't fail if it's not available
    try {
      await redis.connect();
      console.log('Redis connected');
    } catch (error) {
      console.log('Redis connection failed, continuing without Redis:', error.message);
    }

    console.log('Starting HTTP server...');
    
    // Find an available port
    const availablePort = await findAvailablePort(PORT);
    
    const server = app.listen(availablePort, () => {
      console.log(`Server is running on port ${availablePort}`);
      if (availablePort !== PORT) {
        console.log(`Note: Port ${PORT} was in use, using port ${availablePort} instead`);
      }
    });

    server.on('error', (error) => {
      console.error('Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.log('Port is still in use, trying alternative port...');
        findAvailablePort(availablePort + 1).then(newPort => {
          server.close();
          const newServer = app.listen(newPort, () => {
            console.log(`Server restarted on port ${newPort}`);
          });
        }).catch(err => {
          console.error('Failed to find available port:', err);
          process.exit(1);
        });
      }
    });

    server.on('listening', () => {
      console.log('Server is now listening');
    });
  } catch (error) {
    console.error('Server startup error:', error);
    process.exit(1);
  }
})();
