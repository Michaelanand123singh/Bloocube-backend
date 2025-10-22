const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { isGcsEnabled, uploadBufferToGcs } = require('../utils/storage');

// Ensure upload directory exists
const uploadDir = path.resolve('./uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer to store files in memory as buffers
const storage = multer.memoryStorage();

// In src/middlewares/upload.js

const fileFilter = (req, file, cb) => {
  // We will keep your original regex, just adding 'quicktime' for .mov files
  const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|quicktime/;

  // This logic correctly uses your regex to validate the MIME type
  const allowedSubstrings = allowedTypes.source.split('|');
  const isValid = allowedSubstrings.some(type => file.mimetype.includes(type));

  if (isValid) {
    cb(null, true); // Accept the file
  } else {
    // Reject the file with a clear error
    cb(new Error('Only image and video files are allowed!'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: fileFilter
});

// Middleware to persist files to GCS or local storage
// In src/middlewares/upload.js

async function persistUploads(req, res, next) {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return next();
    }

    // When using multer.fields(), req.files is an object with field names as keys
    // Convert to arrays for easier processing
    const mediaFiles = req.files.media || [];
    const thumbnailFiles = req.files.thumbnail || [];

    // Process media files
    const mediaProcessingPromises = mediaFiles.map(async (file) => {
      const originalExt = path.extname(file.originalname).toLowerCase();
      const hashedName = crypto.randomBytes(16).toString('hex') + originalExt;
      
      let finalFileObject;

      if (isGcsEnabled()) {
        const today = new Date();
        const datePrefix = `${today.getFullYear()}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}`;
        const gcsKey = `media/${datePrefix}/${hashedName}`;
        const { key, url } = await uploadBufferToGcs(file.buffer, gcsKey, file.mimetype);
        
        finalFileObject = {
          type: file.mimetype.startsWith('image/') ? 'image' : 'video',
          url: url,
          storage: 'gcs',
          storageKey: key,
          filename: hashedName,
          size: file.size,
          mimeType: file.mimetype,
        };

      } else {
        // Local storage fallback
        const destPath = path.join(uploadDir, hashedName);
        fs.writeFileSync(destPath, file.buffer);
        
        finalFileObject = {
          type: file.mimetype.startsWith('image/') ? 'image' : 'video',
          url: `/uploads/${hashedName}`,
          storage: 'local',
          storageKey: null,
          filename: hashedName,
          size: file.size,
          mimeType: file.mimetype,
        };
      }
      return finalFileObject;
    });

    // Process thumbnail files
    const thumbnailProcessingPromises = thumbnailFiles.map(async (file) => {
      const originalExt = path.extname(file.originalname).toLowerCase();
      const hashedName = crypto.randomBytes(16).toString('hex') + originalExt;
      
      let finalFileObject;

      if (isGcsEnabled()) {
        const today = new Date();
        const datePrefix = `${today.getFullYear()}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}`;
        const gcsKey = `thumbnails/${datePrefix}/${hashedName}`;
        const { key, url } = await uploadBufferToGcs(file.buffer, gcsKey, file.mimetype);
        
        finalFileObject = {
          type: 'image',
          url: url,
          storage: 'gcs',
          storageKey: key,
          filename: hashedName,
          size: file.size,
          mimeType: file.mimetype,
        };

      } else {
        // Local storage fallback
        const destPath = path.join(uploadDir, hashedName);
        fs.writeFileSync(destPath, file.buffer);
        
        finalFileObject = {
          type: 'image',
          url: `/uploads/${hashedName}`,
          storage: 'local',
          storageKey: null,
          filename: hashedName,
          size: file.size,
          mimeType: file.mimetype,
        };
      }
      return finalFileObject;
    });

    // Process all files
    const [processedMediaFiles, processedThumbnailFiles] = await Promise.all([
      Promise.all(mediaProcessingPromises),
      Promise.all(thumbnailProcessingPromises)
    ]);

    // Set processed files on request
    req.files = processedMediaFiles;
    req.thumbnail = processedThumbnailFiles[0] || null; // Only one thumbnail per post

    return next();
  } catch (err) {
    return next(err);
  }
}

// ✅ FIX: Correctly export both the multer instance and the persist function
module.exports = {
  upload,
  persistUploads,
};