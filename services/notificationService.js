const { getMessaging, getMessagingDriver } = require('../config/firebase');
const logger = require('../utils/logger');
const { Notification } = require('../models');

class NotificationService {
  constructor() {
    this.messaging = null;
  }

  // Initialize messaging instance
  getMessagingInstance() {
    if (!this.messaging) {
      this.messaging = getMessaging();
    }
    return this.messaging;
  }

  getMessagingInstanceDriver() {
    if (!this.messagingDriver) {
      this.messagingDriver = getMessagingDriver();
    }
    return this.messagingDriver;
  }

  /**
   * Send notification to a single device
   * @param {string} fcmToken - FCM device token
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Additional data payload
   * @param {object} options - Additional notification options
   */
  async sendToDevice(fcmToken, title, body, data = {}, options = {}) {
    try {
      const messaging = this.getMessagingInstance();
      if (!messaging) {
        logger.warn('Firebase messaging not initialized. Notification not sent.');
        return { success: false, error: 'Firebase not initialized' };
      }

      if (!fcmToken) {
        return { success: false, error: 'No FCM token provided' };
      }

      const message = {
        token: fcmToken,
        notification: {
          title,
          body
        },
        data: this.sanitizeData(data),
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: options.channelId || 'default',
            clickAction: options.clickAction || 'FLUTTER_NOTIFICATION_CLICK'
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: title,
                body: body
              },
              sound: 'default',
              badge: options.badge || 1,
              contentAvailable: true, // Enable background notifications for iOS
              mutableContent: true // Allow notification extensions
            }
          },
          headers: {
            'apns-priority': '10' // High priority for iOS
          }
        }
      };

      // Log iOS payload for debugging
      console.log(`📱 [FCM SEND] iOS APNs payload:`, JSON.stringify({
        alert: message.apns.payload.aps.alert,
        sound: message.apns.payload.aps.sound,
        badge: message.apns.payload.aps.badge,
        contentAvailable: message.apns.payload.aps.contentAvailable,
        mutableContent: message.apns.payload.aps.mutableContent,
        priority: message.apns.headers['apns-priority']
      }, null, 2));
      
      logger.debug(`📱 iOS APNs payload:`, {
        alert: message.apns.payload.aps.alert,
        sound: message.apns.payload.aps.sound,
        badge: message.apns.payload.aps.badge,
        contentAvailable: message.apns.payload.aps.contentAvailable,
        mutableContent: message.apns.payload.aps.mutableContent,
        priority: message.apns.headers['apns-priority']
      });

      console.log(`📤 [FCM SEND] Sending notification to token: ${fcmToken.substring(0, 30)}...`);
      const response = await messaging.send(message);
      console.log(`✅ [FCM SEND] Notification sent successfully: ${response}`);
      logger.info(`✅ Notification sent successfully: ${response}`);
      return { success: true, messageId: response };
    } catch (error) {
      // Skip logging for common token errors (they're expected)
      const skipErrorCodes = [
        'messaging/invalid-argument',
        'messaging/registration-token-not-registered',
        'messaging/invalid-registration-token'
      ];
      
      if (!skipErrorCodes.includes(error.code)) {
        console.error(`❌ [FCM SEND] Error:`, {
          code: error.code,
          message: error.message,
          token: fcmToken ? `${fcmToken.substring(0, 30)}...` : 'no token',
          stack: error.stack
        });
        logger.error('FCM send error:', {
          code: error.code,
          message: error.message,
          token: fcmToken ? `${fcmToken.substring(0, 20)}...` : 'no token'
        });
      } else {
        console.log(`⚠️ [FCM SEND] Token error (skipped): ${error.code} - ${error.message}`);
        logger.debug(`FCM token error (skipped): ${error.code}`);
      }
      return { success: false, error: error.message, code: error.code };
    }
  }

  /**
   * Send notification to multiple devices
   * @param {string[]} fcmTokens - Array of FCM device tokens
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Additional data payload
   */
  async sendToMultipleDevices(fcmTokens, title, body, data = {}) {
    try {
      const messaging = this.getMessagingInstance();
      if (!messaging) {
        logger.warn('Firebase messaging not initialized. Notification not sent.');
        return { success: false, error: 'Firebase not initialized' };
      }

      // Filter out null/undefined/empty tokens and ensure uniqueness
      const validTokens = [...new Set(fcmTokens.filter(token => token && token.trim()))];
      if (validTokens.length === 0) {
        return { success: false, error: 'No valid FCM tokens provided' };
      }

      const message = {
        notification: {
          title,
          body
        },
        data: this.sanitizeData(data),
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK'
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: title,
                body: body
              },
              sound: 'default',
              badge: 1,
              contentAvailable: true, // Enable background notifications for iOS
              mutableContent: true // Allow notification extensions
            }
          },
          headers: {
            'apns-priority': '10' // High priority for iOS
          }
        },
        tokens: validTokens
      };

      const response = await messaging.sendEachForMulticast(message);

      logger.info(`Notifications sent: ${response.successCount} success, ${response.failureCount} failures`);

      // Collect failed tokens with detailed errors
      const failedTokens = [];
      const invalidTokens = [];
      const otherErrors = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const err = resp.error || {};
          const detail = {
            token: validTokens[idx],
            code: err.code || null,
            message: err.message || 'Unknown error'
          };
          failedTokens.push(detail);

          // Track invalid/expired tokens separately so callers can prune them
          if (
            detail.code === 'messaging/registration-token-not-registered' ||
            detail.code === 'messaging/invalid-argument' ||
            detail.code === 'messaging/invalid-registration-token'
          ) {
            invalidTokens.push(detail);
          } else {
            otherErrors.push(detail);
          }
        }
      });

      if (invalidTokens.length > 0) {
        logger.warn('Prune invalid FCM tokens:', invalidTokens);
      }

      if (otherErrors.length > 0) {
        logger.warn('Notification failures detail:', otherErrors);
      }

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
        failedTokens,
        invalidTokens,
        otherErrors
      };
    } catch (error) {
      logger.error('Error sending multiple notifications:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to a topic
   * @param {string} topic - Topic name
   * @param {string} title - Notification title
   * @param {string} body - Notification body
   * @param {object} data - Additional data payload
   */
  async sendToTopic(topic, title, body, data = {}) {
    try {
      const messaging = this.getMessagingInstance();
      if (!messaging) {
        logger.warn('Firebase messaging not initialized. Notification not sent.');
        return { success: false, error: 'Firebase not initialized' };
      }

      const message = {
        topic,
        notification: {
          title,
          body
        },
        data: this.sanitizeData(data),
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK'
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: title,
                body: body
              },
              sound: 'default',
              badge: 1,
              contentAvailable: true, // Enable background notifications for iOS
              mutableContent: true // Allow notification extensions
            }
          },
          headers: {
            'apns-priority': '10' // High priority for iOS
          }
        }
      };

      const response = await messaging.send(message);
      logger.info(`Topic notification sent successfully: ${response}`);
      return { success: true, messageId: response };
    } catch (error) {
      logger.error('Error sending topic notification:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Subscribe devices to a topic
   * @param {string[]} fcmTokens - Array of FCM device tokens
   * @param {string} topic - Topic name
   */
  async subscribeToTopic(fcmTokens, topic) {
    try {
      const messaging = this.getMessagingInstance();
      if (!messaging) {
        return { success: false, error: 'Firebase not initialized' };
      }

      const validTokens = fcmTokens.filter(token => token && token.trim());
      if (validTokens.length === 0) {
        return { success: false, error: 'No valid FCM tokens provided' };
      }

      const response = await messaging.subscribeToTopic(validTokens, topic);
      logger.info(`Subscribed ${response.successCount} devices to topic: ${topic}`);
      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount
      };
    } catch (error) {
      logger.error('Error subscribing to topic:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unsubscribe devices from a topic
   * @param {string[]} fcmTokens - Array of FCM device tokens
   * @param {string} topic - Topic name
   */
  async unsubscribeFromTopic(fcmTokens, topic) {
    try {
      const messaging = this.getMessagingInstance();
      if (!messaging) {
        return { success: false, error: 'Firebase not initialized' };
      }

      const validTokens = fcmTokens.filter(token => token && token.trim());
      if (validTokens.length === 0) {
        return { success: false, error: 'No valid FCM tokens provided' };
      }

      const response = await messaging.unsubscribeFromTopic(validTokens, topic);
      logger.info(`Unsubscribed ${response.successCount} devices from topic: ${topic}`);
      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount
      };
    } catch (error) {
      logger.error('Error unsubscribing from topic:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ========== BUSINESS NOTIFICATION METHODS ==========

  /**
   * Send order status update notification to customer
   */
  async sendOrderStatusNotification(fcmToken, orderData, options = {}) {
    const orderNumber = orderData.orderNumber || orderData.id?.substring(0, 8) || 'N/A';
    
    // Log notification details for debugging
    console.log(`📱 [NOTIFICATION SERVICE] Sending order status notification:`, {
      orderNumber: orderNumber,
      status: orderData.status,
      fcmToken: fcmToken ? `${fcmToken.substring(0, 30)}...` : 'NO TOKEN',
      tokenLength: fcmToken ? fcmToken.length : 0,
      deviceType: options.deviceType || 'unknown'
    });
    
    logger.info(`📱 Sending order status notification:`, {
      orderNumber: orderNumber,
      status: orderData.status,
      fcmToken: fcmToken ? `${fcmToken.substring(0, 20)}...` : 'NO TOKEN',
      tokenLength: fcmToken ? fcmToken.length : 0,
      deviceType: options.deviceType || 'unknown'
    });
    
    const statusMessages = {
      'pending': `Your order #${orderNumber} has been placed successfully. We are waiting for the agency to accept your order.`,
      'confirmed': `Good news! Your order #${orderNumber} has been accepted by the agency and is being prepared.`,
      'processing': `Your order #${orderNumber} is being prepared.`,
      'assigned': `A delivery partner has been assigned to your order #${orderNumber}. Your order will be picked up shortly.`,
      'out_for_delivery': `Your order #${orderNumber} is out for delivery and will reach you soon.`,
      'delivered': `Your order #${orderNumber} has been delivered successfully. Thank you for choosing us!`,
      'cancelled': `Your order #${orderNumber} has been cancelled.`,
      'rejected': `Unfortunately, the agency was unable to accept your order #${orderNumber}. Please select another agency to continue.`
    };

    const notificationTitles = {
      'pending': '✅ Order Placed Successfully',
      'confirmed': '🎉 Order Accepted',
      'processing': 'Order Processing',
      'assigned': '🚴 Rider Assigned',
      'out_for_delivery': '🚚 Out for Delivery',
      'delivered': '🎉 Order Delivered',
      'cancelled': '⚠️ Order Cancelled',
      'rejected': '❌ Order Rejected'
    };

    const title = notificationTitles[orderData.status] || `Order #${orderNumber}`;
    const body = statusMessages[orderData.status] || `Order #${orderNumber} status updated to: ${orderData.status}`;
    
    const data = {
      type: 'ORDER_STATUS',
      orderId: orderData.id,
      orderNumber: orderData.orderNumber || '',
      status: orderData.status
    };

    // Validate FCM token before sending
    if (!fcmToken || !fcmToken.trim()) {
      console.error(`❌ [NOTIFICATION SERVICE] Cannot send notification - FCM token is empty for order ${orderNumber}`);
      logger.error(`❌ Cannot send notification - FCM token is empty for order ${orderNumber}`);
      return { success: false, error: 'FCM token is required' };
    }

    // Log notification payload details
    console.log(`📤 [NOTIFICATION SERVICE] Notification payload:`, {
      title: title,
      body: body.substring(0, 50) + '...',
      hasAlert: true, // iOS alert object will be added in sendToDevice
      deviceType: options.deviceType || 'unknown',
      orderNumber: orderNumber,
      data: JSON.stringify(data)
    });
    
    logger.info(`📤 Notification payload:`, {
      title: title,
      body: body.substring(0, 50) + '...',
      hasAlert: true, // iOS alert object will be added in sendToDevice
      deviceType: options.deviceType || 'unknown'
    });

    // Send push notification
    const result = await this.sendToDevice(fcmToken, title, body, data, options);
    
    // Log result
    if (result.success) {
      console.log(`✅ [NOTIFICATION SERVICE] Notification sent successfully for order ${orderNumber}`);
      logger.info(`✅ Notification sent successfully for order ${orderNumber}`);
    } else {
      console.error(`❌ [NOTIFICATION SERVICE] Failed to send notification for order ${orderNumber}:`, result.error, result.code);
      logger.error(`❌ Failed to send notification for order ${orderNumber}:`, result.error);
    }
    
    // Save notification to database if recipientId is provided
    if (options.recipientId && result.success) {
      try {
        await this.saveUserNotification({
          userId: options.recipientId,
          title,
          content: body,
          notificationType: 'ORDER_STATUS',
          data,
          orderId: orderData.id
        });
      } catch (saveError) {
        logger.error('Error saving order status notification:', saveError.message);
      }
    }
    
    return result;
  }

  /**
   * Send new order notification to agency
   */
  async sendNewOrderToAgency(fcmToken, orderData) {
    const title = '🆕 New Order Received';
    const body = `You have received a new order. Please review the order details and accept or reject it.`;
    
    return this.sendToDevice(fcmToken, title, body, {
      type: 'NEW_ORDER',
      orderId: orderData.id,
      orderNumber: orderData.orderNumber || '',
      total: String(orderData.total || orderData.totalAmount || 0)
    });
  }

  async sendToDeviceDriver(fcmToken, title, body, data = {}, options = {}) {
    try {
      const messaging = this.getMessagingInstanceDriver();
      if (!messaging) {
        logger.warn('Driver Firebase messaging not initialized. Notification not sent.');
        return { success: false, error: 'Driver Firebase not initialized' };
      }

      if (!fcmToken) {
        return { success: false, error: 'No FCM token provided' };
      }

      const message = {
        token: fcmToken,
        notification: {
          title,
          body
        },
        data: this.sanitizeData(data),
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: options.channelId || 'default',
            clickAction: options.clickAction || 'FLUTTER_NOTIFICATION_CLICK'
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: title,
                body: body
              },
              sound: 'default',
              badge: options.badge || 1,
              contentAvailable: true, // Enable background notifications for iOS
              mutableContent: true // Allow notification extensions
            }
          },
          headers: {
            'apns-priority': '10' // High priority for iOS
          }
        }
      };

      const response = await messaging.send(message);
      logger.info(`Driver notification sent successfully: ${response}`);
      return { success: true, messageId: response };
    } catch (error) {

     // Handle SenderId mismatch - this means token belongs to different Firebase project
      if (error.code === 'messaging/mismatched-credential') {
        logger.warn('Driver Firebase SenderId mismatch - token belongs to different Firebase project');
        return { success: false, error: error.message, code: error.code };
      }
      
      // Only log non-token errors (skip invalid token errors as they're common)
      if (error.code !== 'messaging/invalid-argument' && 
          error.code !== 'messaging/registration-token-not-registered' &&
          error.code !== 'messaging/invalid-registration-token') {
        logger.error('Driver notification FCM send error:', {
          code: error.code,
          message: error.message
        });
      }
      return { success: false, error: error.message, code: error.code };
    }
  }


  /**
   * Send order assignment notification to delivery agent
   */
  async sendOrderAssignedToAgent(fcmToken, orderData, options = {}) {
    const title = '📦 New Delivery Assigned';
    const orderNumber = orderData.orderNumber || orderData.id?.substring(0, 8) || 'N/A';
    const body = `You have been assigned a new delivery order #${orderNumber}.`;
    
    const data = {
      type: 'ORDER_ASSIGNED',
      orderId: orderData.id,
      orderNumber: orderData.orderNumber || '',
      deliveryAddress: orderData.deliveryAddress || ''
    };

    // Try driver Firebase first, fallback to regular Firebase
    let result = null;
    let notificationSaved = false;
    
    try {
      const driverResult = await this.sendToDeviceDriver(fcmToken, title, body, data, options);

      if (driverResult.success) {
        result = driverResult;
      } else {
        // If driver Firebase failed due to SenderId mismatch, use regular Firebase
        if (driverResult.code === 'messaging/mismatched-credential') {
          logger.warn('Driver Firebase SenderId mismatch, using regular Firebase for agent notification');
        }
        // Fallback to regular Firebase
        logger.info('Using regular Firebase for agent notification');
        result = await this.sendToDevice(fcmToken, title, body, data, options);
        
        if (!result.success) {
          logger.warn('Regular Firebase also failed:', {
            error: result.error,
            code: result.code,
            orderNumber: orderData.orderNumber
          });
        } else {
          logger.info('Agent notification sent successfully via regular Firebase');
        }
      }
    } catch (error) {
      // If error is SenderId mismatch, fallback to regular Firebase
      if (error.code === 'messaging/mismatched-credential') {
        logger.warn('Driver Firebase SenderId mismatch, using regular Firebase for agent notification');
      } else {
        logger.warn('Driver Firebase failed, trying regular Firebase:', error.message);
      }
      
      // Fallback to regular Firebase
      logger.info('Using regular Firebase for agent notification');
      result = await this.sendToDevice(fcmToken, title, body, data, options);
    }
    
    // Save notification only once if userId provided (even if Firebase failed, save for in-app notification)
    if (options.recipientId && !notificationSaved) {
      try {
        await this.saveUserNotification({
          userId: options.recipientId,
          title,
          content: body,
          notificationType: 'ORDER_ASSIGNED',
          data,
          orderId: orderData.id
        });
        notificationSaved = true;
        logger.info('Notification saved to database for user:', options.recipientId);
      } catch (saveError) {
        logger.error('Error saving user notification:', saveError.message);
      }
    }
    
    return result || { success: false, error: 'Failed to send notification' };
  }

  /**
   * Send low stock alert to agency
   */
  async sendLowStockAlert(fcmToken, productData) {
    const title = 'Low Stock Alert!';
    const body = `${productData.productName} is running low. Current stock: ${productData.stock}`;
    
    return this.sendToDevice(fcmToken, title, body, {
      type: 'LOW_STOCK',
      productId: productData.productId,
      productName: productData.productName,
      stock: String(productData.stock)
    });
  }

  /**
   * Send promotional notification to customers
   */
  async sendPromotionalNotification(fcmTokens, promoData) {
    const title = promoData.title || 'Special Offer!';
    const body = promoData.body || promoData.message;
    
    return this.sendToMultipleDevices(fcmTokens, title, body, {
      type: 'PROMOTION',
      promoId: promoData.id || '',
      couponCode: promoData.couponCode || ''
    });
  }

  /**
   * Send delivery agent status update to agency
   */
  async sendAgentStatusToAgency(fcmToken, agentData) {
    const title = 'Delivery Agent Update';
    const body = `${agentData.agentName} is now ${agentData.status}`;
    
    return this.sendToDevice(fcmToken, title, body, {
      type: 'AGENT_STATUS',
      agentId: agentData.agentId,
      agentName: agentData.agentName,
      status: agentData.status
    });
  }

  /**
   * Save user notification to database
   * @param {object} notificationData - Notification data to save
   */
  async saveUserNotification(notificationData) {
    try {
      if (!notificationData.userId) {
        logger.warn('Cannot save notification: userId is required');
        return null;
      }

      const notification = await Notification.create({
        userId: notificationData.userId,
        title: notificationData.title,
        content: notificationData.content || notificationData.body,
        notificationType: notificationData.notificationType || 'OTHER',
        data: notificationData.data || {},
        orderId: notificationData.orderId || null
      });

      logger.info(`User notification saved: ${notification.id}`);
      return notification;
    } catch (error) {
      logger.error('Error saving user notification:', error.message);
      return null;
    }
  }

  /**
   * Sanitize data payload - FCM requires all values to be strings
   */
  sanitizeData(data) {
    const sanitized = {};
    for (const key in data) {
      if (data[key] !== null && data[key] !== undefined) {
        sanitized[key] = String(data[key]);
      }
    }
    return sanitized;
  }
}

// Export singleton instance
module.exports = new NotificationService();

