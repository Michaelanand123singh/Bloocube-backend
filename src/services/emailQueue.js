// src/services/emailQueue.js
const redis = require('../config/redis');
const { sendMail } = require('./notifier/email');
const logger = require('../utils/logger');

class EmailQueue {
  constructor() {
    this.queueName = 'email_queue';
    this.processing = false;
    this.batchSize = 10; // Process 10 emails at a time
    this.delayBetweenBatches = 60000; // 1 minute delay between batches
  }

  /**
   * Add email to queue
   */
  async addToQueue(emailData) {
    try {
      const emailJob = {
        id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...emailData,
        createdAt: new Date().toISOString(),
        attempts: 0,
        maxAttempts: 3,
        status: 'pending'
      };

      await redis.lpush(this.queueName, JSON.stringify(emailJob));
      logger.info('Email added to queue', { 
        jobId: emailJob.id, 
        to: emailData.to,
        subject: emailData.subject 
      });

      return emailJob.id;
    } catch (error) {
      logger.error('Failed to add email to queue', error);
      throw error;
    }
  }

  /**
   * Add bulk emails to queue for announcements
   */
  async addBulkEmails(emails) {
    try {
      // Check if Redis is available
      if (!redis.isConnected) {
        logger.warn('Redis not available, sending emails directly', { count: emails.length });
        return await this.sendEmailsDirectly(emails);
      }

      const pipeline = redis.pipeline();
      
      for (const emailData of emails) {
        const emailJob = {
          id: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          ...emailData,
          createdAt: new Date().toISOString(),
          attempts: 0,
          maxAttempts: 3,
          status: 'pending'
        };
        
        pipeline.lpush(this.queueName, JSON.stringify(emailJob));
      }

      await pipeline.exec();
      logger.info('Bulk emails added to queue', { count: emails.length });
      
      return emails.length;
    } catch (error) {
      logger.error('Failed to add bulk emails to queue', error);
      
      // Fallback to direct sending if Redis fails
      logger.info('Falling back to direct email sending');
      return await this.sendEmailsDirectly(emails);
    }
  }

  /**
   * Send emails directly without queue (fallback method)
   */
  async sendEmailsDirectly(emails) {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const emailData of emails) {
      try {
        await sendMail(emailData.to, emailData.subject, emailData.html);
        results.success++;
        logger.info('Email sent directly', { to: emailData.to, subject: emailData.subject });
      } catch (error) {
        results.failed++;
        results.errors.push({ to: emailData.to, error: error.message });
        logger.error('Direct email failed', { to: emailData.to, error: error.message });
      }
    }

    // Update announcement email stats if announcementId is provided
    if (emails.length > 0 && emails[0].announcementId) {
      try {
        const Announcement = require('../models/Announcement');
        await Announcement.findByIdAndUpdate(emails[0].announcementId, {
          $inc: {
            'emailSettings.emailSent': results.success,
            'emailSettings.emailFailed': results.failed
          }
        });
        logger.info('Updated announcement email stats', { 
          announcementId: emails[0].announcementId,
          sent: results.success,
          failed: results.failed
        });
      } catch (error) {
        logger.error('Failed to update announcement email stats', error);
      }
    }

    logger.info('Direct email sending completed', results);
    return results.success;
  }

  /**
   * Process email queue
   */
  async processQueue() {
    if (this.processing) {
      logger.debug('Email queue is already processing');
      return;
    }

    // Skip processing if Redis is not available
    if (!redis.isConnected) {
      logger.warn('Redis not available, skipping email queue processing');
      return;
    }

    this.processing = true;
    logger.info('Starting email queue processing');

    try {
      while (true) {
        // Get batch of emails from queue
        const emails = await this.getBatchFromQueue();
        
        if (emails.length === 0) {
          logger.debug('No emails in queue, stopping processing');
          break;
        }

        // Process batch
        await this.processBatch(emails);
        
        // Wait before processing next batch (rate limiting)
        if (emails.length === this.batchSize) {
          logger.info(`Processed batch of ${emails.length} emails, waiting ${this.delayBetweenBatches}ms`);
          await this.sleep(this.delayBetweenBatches);
        }
      }
    } catch (error) {
      logger.error('Error processing email queue', error);
    } finally {
      this.processing = false;
      logger.info('Email queue processing completed');
    }
  }

  /**
   * Get batch of emails from queue
   */
  async getBatchFromQueue() {
    try {
      if (!redis.isConnected) {
        logger.warn('Redis not available, skipping queue processing');
        return [];
      }

      const emails = [];
      
      for (let i = 0; i < this.batchSize; i++) {
        const emailJson = await redis.rpop(this.queueName);
        if (!emailJson) break;
        
        try {
          const email = JSON.parse(emailJson);
          emails.push(email);
        } catch (parseError) {
          logger.error('Failed to parse email from queue', { emailJson, error: parseError.message });
        }
      }
      
      return emails;
    } catch (error) {
      logger.error('Failed to get batch from queue', error);
      return [];
    }
  }

  /**
   * Process a batch of emails
   */
  async processBatch(emails) {
    const promises = emails.map(email => this.processEmail(email));
    const results = await Promise.allSettled(promises);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    logger.info('Batch processing completed', { 
      total: emails.length, 
      successful, 
      failed 
    });
  }

  /**
   * Process individual email
   */
  async processEmail(emailJob) {
    try {
      emailJob.attempts += 1;
      emailJob.status = 'processing';
      
      logger.info('Processing email', { 
        jobId: emailJob.id, 
        to: emailJob.to,
        attempt: emailJob.attempts 
      });

      // Send email
      await sendMail(emailJob.to, emailJob.subject, emailJob.html);
      
      emailJob.status = 'completed';
      emailJob.completedAt = new Date().toISOString();
      
      logger.info('Email sent successfully', { 
        jobId: emailJob.id, 
        to: emailJob.to 
      });

    } catch (error) {
      emailJob.status = 'failed';
      emailJob.lastError = error.message;
      emailJob.failedAt = new Date().toISOString();
      
      logger.error('Failed to send email', { 
        jobId: emailJob.id, 
        to: emailJob.to,
        error: error.message,
        attempt: emailJob.attempts 
      });

      // Retry if under max attempts
      if (emailJob.attempts < emailJob.maxAttempts) {
        emailJob.status = 'pending';
        emailJob.retryAt = new Date(Date.now() + (emailJob.attempts * 300000)).toISOString(); // 5min * attempts
        
        // Add back to queue for retry
        await redis.lpush(this.queueName, JSON.stringify(emailJob));
        
        logger.info('Email queued for retry', { 
          jobId: emailJob.id, 
          attempt: emailJob.attempts,
          retryAt: emailJob.retryAt 
        });
      } else {
        logger.error('Email failed permanently', { 
          jobId: emailJob.id, 
          to: emailJob.to,
          attempts: emailJob.attempts 
        });
      }
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    try {
      if (!redis.isConnected) {
        return { queueLength: 0, processing: false, batchSize: this.batchSize };
      }
      const queueLength = await redis.llen(this.queueName);
      return {
        queueLength,
        processing: this.processing,
        batchSize: this.batchSize
      };
    } catch (error) {
      logger.error('Failed to get queue stats', error);
      return { queueLength: 0, processing: false, batchSize: this.batchSize };
    }
  }

  /**
   * Get detailed email statistics
   */
  async getDetailedEmailStats() {
    try {
      if (!redis.isConnected) {
        // Return empty stats when Redis is not available
        return {
          total: 0,
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          retrying: 0,
          recent: {
            last24Hours: 0,
            lastHour: 0
          },
          isProcessing: false,
          batchSize: this.batchSize
        };
      }
      
      // Get all emails from queue
      const allEmails = await redis.lrange(this.queueName, 0, -1);
      const emails = allEmails.map(email => {
        try {
          return JSON.parse(email);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

      const stats = {
        total: emails.length,
        pending: emails.filter(e => e.status === 'pending').length,
        processing: emails.filter(e => e.status === 'processing').length,
        completed: emails.filter(e => e.status === 'completed').length,
        failed: emails.filter(e => e.status === 'failed').length,
        retrying: emails.filter(e => e.status === 'pending' && e.attempts > 0).length
      };

      // Get recent activity (last 100 emails)
      const recentEmails = emails
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 100);

      const recentStats = {
        last24Hours: recentEmails.filter(e => 
          new Date(e.createdAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)
        ).length,
        lastHour: recentEmails.filter(e => 
          new Date(e.createdAt) > new Date(Date.now() - 60 * 60 * 1000)
        ).length
      };

      return {
        ...stats,
        recent: recentStats,
        isProcessing: this.processing,
        batchSize: this.batchSize
      };
    } catch (error) {
      logger.error('Failed to get detailed email stats', error);
      return {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        retrying: 0,
        recent: { last24Hours: 0, lastHour: 0 },
        isProcessing: false,
        batchSize: this.batchSize
      };
    }
  }

  /**
   * Clear queue (admin function)
   */
  async clearQueue() {
    try {
      await redis.del(this.queueName);
      logger.info('Email queue cleared');
    } catch (error) {
      logger.error('Failed to clear email queue', error);
      throw error;
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new EmailQueue();
