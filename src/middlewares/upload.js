// src/middlewares/upload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { isGcsEnabled, uploadBufferToGcs } = require('../utils/storage');
const config = require('../config/env');

// Ensure upload directory exists
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads (memory storage so we can forward to GCS)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Check file type
  const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image and video files are allowed!'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: fileFilter
});

// Helper to persist uploaded files to local or GCS and normalize req.files
async function persistUploads(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) return next();

    // Ensure local uploads dir exists if not using GCS
    if (!isGcsEnabled()) {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
    }

    for (const file of req.files) {
      const originalExt = path.extname(file.originalname).toLowerCase();
      const safeExt = originalExt || (file.mimetype.includes('video') ? '.mp4' : '.bin');
      const hashedName = crypto.randomBytes(16).toString('hex') + safeExt;
      const today = new Date();
      const datePrefix = `${today.getFullYear()}/${(today.getMonth()+1).toString().padStart(2,'0')}/${today.getDate().toString().padStart(2,'0')}`;

      if (isGcsEnabled()) {
        try {
          const gcsKey = `media/${datePrefix}/${hashedName}`;
          const { key, url } = await uploadBufferToGcs(file.buffer, gcsKey, file.mimetype);
          // Attach storage info for downstream controllers
          file.storage = 'gcs';
          file.storageKey = key;
          file.url = url;
          file.filename = hashedName; // keep a normalized filename reference
        } catch (gcsError) {
          console.warn('⚠️ GCS upload failed, falling back to local storage:', gcsError.message);
          // Fallback to local storage
          const destPath = path.join(uploadDir, hashedName);
          fs.writeFileSync(destPath, file.buffer);
          file.storage = 'local';
          file.storageKey = `uploads/${hashedName}`;
          file.url = `/uploads/${hashedName}`;
          file.filename = hashedName;
        }
      } else {
        const destPath = path.join(uploadDir, hashedName);
        fs.writeFileSync(destPath, file.buffer);
        file.storage = 'local';
        file.storageKey = `uploads/${hashedName}`;
        file.url = `/uploads/${hashedName}`;
        file.filename = hashedName;
      }
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

// Single-file variant helper
async function persistUploadSingle(req, res, next) {
  if (req.file) {
    req.files = [req.file];
  }
  return persistUploads(req, res, next);
}

module.exports = Object.assign(upload, { persistUploads, persistUploadSingle });

module.exports = upload;
