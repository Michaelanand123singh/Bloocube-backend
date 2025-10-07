const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

let gcsClient = null;

function getGcsClient() {
  if (!gcsClient) {
    const options = {};
    if (config.GCS_PROJECT_ID) options.projectId = config.GCS_PROJECT_ID;
    if (config.GCS_KEYFILE) {
      // Check if the keyfile exists before using it
      const fs = require('fs');
      if (fs.existsSync(config.GCS_KEYFILE)) {
        options.keyFilename = config.GCS_KEYFILE;
      } else {
        console.warn(`⚠️ GCS keyfile not found: ${config.GCS_KEYFILE}. Using default credentials.`);
      }
    }
    gcsClient = new Storage(options);
  }
  return gcsClient;
}

function isGcsEnabled() {
  // Disable GCS if no proper credentials are available
  if (!config.GCS_BUCKET || !config.GCS_PROJECT_ID) {
    return false;
  }
  
  // Check if we have a valid keyfile or if we're in a Google Cloud environment
  if (config.GCS_KEYFILE) {
    const fs = require('fs');
    if (!fs.existsSync(config.GCS_KEYFILE)) {
      console.warn('⚠️ GCS keyfile not found, disabling GCS');
      return false;
    }
  }
  
  // Check for Google Cloud environment variables (for Cloud Run, etc.)
  if (!config.GCS_KEYFILE && !process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GCLOUD_PROJECT) {
    // Check if gcloud is authenticated locally
    const os = require('os');
    const adcPath = path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json');
    if (!fs.existsSync(adcPath)) {
      console.warn('⚠️ No Google Cloud credentials found, disabling GCS');
      return false;
    } else {
      console.log('✅ Using Google Cloud Application Default Credentials');
    }
  }
  
  return true;
}

async function uploadBufferToGcs(buffer, destinationPath, contentType) {
  if (!isGcsEnabled()) {
    throw new Error('GCS is not configured');
  }
  try {
    const storage = getGcsClient();
    const bucket = storage.bucket(config.GCS_BUCKET);
    const file = bucket.file(destinationPath);
    await file.save(buffer, {
      resumable: false,
      contentType
    });
    const publicUrl = `${config.GCS_BASE_URL}/${config.GCS_BUCKET}/${encodeURI(destinationPath)}`;
    return { key: destinationPath, url: publicUrl };
  } catch (error) {
    console.error('GCS upload error:', error.message);
    throw new Error(`Failed to upload to GCS: ${error.message}`);
  }
}

async function downloadToBufferFromGcs(key) {
  if (!isGcsEnabled()) {
    throw new Error('GCS is not configured');
  }
  const storage = getGcsClient();
  const bucket = storage.bucket(config.GCS_BUCKET);
  const file = bucket.file(key);
  const [contents] = await file.download();
  return contents;
}

module.exports = {
  isGcsEnabled,
  uploadBufferToGcs,
  downloadToBufferFromGcs
};


