const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Try to load ffprobe, but don't fail if it's not available
let ffprobe;
try {
  ffprobe = require('ffprobe-static');
} catch (error) {
  console.warn('⚠️ ffprobe-static not available, video analysis will be limited');
  ffprobe = null;
}

/**
 * Analyze video file to determine if it's a YouTube Short
 * YouTube Shorts criteria:
 * - Vertical video (height > width)
 * - Duration <= 60 seconds
 * - Resolution typically 1080x1920 or similar vertical format
 */
class VideoAnalysis {
  /**
   * Analyze video file and return metadata
   * @param {string} videoPath - Path to video file
   * @returns {Promise<Object>} Video metadata including dimensions, duration, and Shorts detection
   */
  static async analyzeVideo(videoPath) {
    try {
      console.log('🎬 Analyzing video:', videoPath);
      
      // Check if ffprobe is available
      if (!ffprobe) {
        console.warn('⚠️ ffprobe not available, using basic file analysis');
        return this.basicVideoAnalysis(videoPath);
      }
      
      // Use ffprobe to get video metadata
      const command = `"${ffprobe.path}" -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
      const { stdout } = await execAsync(command);
      const metadata = JSON.parse(stdout);
      
      // Find video stream
      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      if (!videoStream) {
        throw new Error('No video stream found');
      }
      
      const width = parseInt(videoStream.width) || 0;
      const height = parseInt(videoStream.height) || 0;
      const duration = parseFloat(metadata.format.duration) || 0;
      
      // Determine if it's a YouTube Short
      const isVertical = height > width;
      const isShortDuration = duration <= 60; // 60 seconds or less
      const isShortResolution = height >= 1080 && width <= 1920; // Typical Shorts resolution
      
      const isYouTubeShort = isVertical && (isShortDuration || isShortResolution);
      
      const analysis = {
        width,
        height,
        duration,
        aspectRatio: width > 0 ? (height / width).toFixed(2) : 0,
        isVertical,
        isShortDuration,
        isShortResolution,
        isYouTubeShort,
        format: metadata.format.format_name,
        codec: videoStream.codec_name,
        bitrate: parseInt(metadata.format.bit_rate) || 0,
        size: parseInt(metadata.format.size) || 0
      };
      
      console.log('📊 Video analysis result:', analysis);
      return analysis;
      
    } catch (error) {
      console.error('❌ Video analysis error:', error.message);
      
      // Fallback analysis based on filename or basic checks
      return this.basicVideoAnalysis(videoPath, error.message);
    }
  }
  
  /**
   * Basic video analysis when ffprobe is not available
   * @param {string} videoPath - Path to video file
   * @param {string} errorMessage - Error message from previous analysis
   * @returns {Object} Basic video metadata
   */
  static basicVideoAnalysis(videoPath, errorMessage = null) {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const stats = fs.statSync(videoPath);
      const filename = path.basename(videoPath).toLowerCase();
      
      // Basic heuristics based on filename
      const isVerticalFilename = filename.includes('vertical') || 
                                filename.includes('portrait') || 
                                filename.includes('short') ||
                                filename.includes('shorts');
      
      const isShortFilename = filename.includes('short') || 
                             filename.includes('shorts') ||
                             filename.includes('quick');
      
      return {
        width: 0,
        height: 0,
        duration: 0,
        aspectRatio: 0,
        isVertical: isVerticalFilename,
        isShortDuration: isShortFilename,
        isShortResolution: false,
        isYouTubeShort: isVerticalFilename || isShortFilename,
        format: path.extname(videoPath).substring(1),
        codec: 'unknown',
        bitrate: 0,
        size: stats.size,
        error: errorMessage || 'Basic analysis only - ffprobe not available'
      };
    } catch (fileError) {
      return {
        width: 0,
        height: 0,
        duration: 0,
        aspectRatio: 0,
        isVertical: false,
        isShortDuration: false,
        isShortResolution: false,
        isYouTubeShort: false,
        format: 'unknown',
        codec: 'unknown',
        bitrate: 0,
        size: 0,
        error: errorMessage || fileError.message
      };
    }
  }
  
  /**
   * Get YouTube category ID from category name
   * @param {string} categoryName - Category name
   * @returns {string} YouTube category ID
   */
  static getYouTubeCategoryId(categoryName) {
    const categories = {
      'Film & Animation': '1',
      'Autos & Vehicles': '2',
      'Music': '10',
      'Pets & Animals': '15',
      'Sports': '17',
      'Short Movies': '18',
      'Travel & Events': '19',
      'Gaming': '20',
      'Videoblogging': '21',
      'People & Blogs': '22',
      'Comedy': '23',
      'Entertainment': '24',
      'News & Politics': '25',
      'Howto & Style': '26',
      'Education': '27',
      'Science & Technology': '28',
      'Nonprofits & Activism': '29',
      'Movies': '30',
      'Anime/Animation': '31',
      'Action/Adventure': '32',
      'Classics': '33',
      'Comedy': '34',
      'Documentary': '35',
      'Drama': '36',
      'Family': '37',
      'Foreign': '38',
      'Horror': '39',
      'Sci-Fi/Fantasy': '40',
      'Thriller': '41',
      'Shorts': '42'
    };
    
    return categories[categoryName] || '22'; // Default to People & Blogs
  }
  
  /**
   * Generate appropriate title for YouTube Shorts
   * @param {string} originalTitle - Original title
   * @param {Object} analysis - Video analysis result
   * @returns {string} Modified title for Shorts
   */
  static generateShortsTitle(originalTitle, analysis) {
    if (!analysis.isYouTubeShort) {
      return originalTitle;
    }
    
    // Add #Shorts hashtag if not already present
    const shortsTag = '#Shorts';
    if (!originalTitle.includes(shortsTag)) {
      return `${originalTitle} ${shortsTag}`;
    }
    
    return originalTitle;
  }
  
  /**
   * Generate appropriate description for YouTube Shorts
   * @param {string} originalDescription - Original description
   * @param {Object} analysis - Video analysis result
   * @returns {string} Modified description for Shorts
   */
  static generateShortsDescription(originalDescription, analysis) {
    if (!analysis.isYouTubeShort) {
      return originalDescription;
    }
    
    const shortsNote = '\n\n#Shorts #YouTubeShorts';
    if (!originalDescription.includes('#Shorts')) {
      return `${originalDescription}${shortsNote}`;
    }
    
    return originalDescription;
  }
}

module.exports = VideoAnalysis;
