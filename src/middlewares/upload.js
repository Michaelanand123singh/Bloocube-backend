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

const fileFilter = (req, file, cb) => {
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

// Middleware to persist files to GCS or local storage
// In src/middlewares/upload.js

async function persistUploads(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      return next();
    }

    // This will create a new array of file objects in the exact format the schema needs
    const fileProcessingPromises = req.files.map(async (file) => {
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

    // Replace req.files with our new, perfectly formatted file objects
    req.files = await Promise.all(fileProcessingPromises);

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