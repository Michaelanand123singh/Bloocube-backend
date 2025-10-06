const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs');
const config = require('../config/env');

let gcsClient = null;

function getGcsClient() {
  if (!gcsClient) {
    const options = {};
    if (config.GCS_PROJECT_ID) options.projectId = config.GCS_PROJECT_ID;
    if (config.GCS_KEYFILE) options.keyFilename = config.GCS_KEYFILE;
    gcsClient = new Storage(options);
  }
  return gcsClient;
}

function isGcsEnabled() {
  return Boolean(config.GCS_BUCKET);
}

async function uploadBufferToGcs(buffer, destinationPath, contentType) {
  if (!isGcsEnabled()) {
    throw new Error('GCS is not configured');
  }
  const storage = getGcsClient();
  const bucket = storage.bucket(config.GCS_BUCKET);
  const file = bucket.file(destinationPath);
  await file.save(buffer, {
    resumable: false,
    contentType
  });
  const publicUrl = `${config.GCS_BASE_URL}/${config.GCS_BUCKET}/${encodeURI(destinationPath)}`;
  return { key: destinationPath, url: publicUrl };
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


