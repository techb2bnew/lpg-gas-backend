const nodemailer = require('nodemailer');
require('dotenv').config();

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD // Use app password for Gmail
  }
});

// Email templates
const emailTemplates = {
  orderConfirmation: (orderData) => ({
    subject: `Order Confirmed - ${orderData.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Order Confirmed!</h2>
        <p>Dear ${orderData.customerName},</p>
        <p>Your order has been confirmed and is being processed.</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Order Details:</h3>
          <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
          <p><strong>Total Amount:</strong> KSH${orderData.totalAmount}</p>
          <p><strong>Payment Method:</strong> Cash on Delivery</p>
          <p><strong>Status:</strong> ${orderData.status}</p>
        </div>
        
        <p>We'll notify you when your order is assigned to a delivery agent.</p>
        <p>Thank you for choosing our service!</p>
      </div>
    `
  }),

  orderAssigned: (orderData, agentData) => ({
    subject: `Order Assigned - ${orderData.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Order Assigned to Delivery Agent</h2>
        <p>Dear ${orderData.customerName},</p>
        <p>Your order has been assigned to a delivery agent and will be delivered soon.</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Delivery Agent Details:</h3>
          <p><strong>Name:</strong> ${agentData.name}</p>
          <p><strong>Phone:</strong> ${agentData.phone}</p>
          <p><strong>Vehicle Number:</strong> ${agentData.vehicleNumber}</p>
        </div>
        
        <p>You'll receive an OTP when the agent arrives for delivery verification.</p>
      </div>
    `
  }),

  deliveryOTP: (data) => ({
    subject: `Delivery OTP - ${data.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Delivery OTP</h2>
        <p>Dear ${data.customerName},</p>
        <p>Your delivery agent has arrived. Please provide this OTP to complete your delivery:</p>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <h1 style="color: #27ae60; font-size: 32px; margin: 0;">${data.otp}</h1>
          <p style="margin: 10px 0 0 0; color: #666;">This OTP expires in 10 minutes</p>
        </div>
        
        <p><strong>Order Number:</strong> ${data.orderNumber}</p>
        <p>Please share this OTP with your delivery agent to verify the delivery.</p>
      </div>
    `
  }),

  orderDelivered: (orderData) => ({
    subject: `Order Delivered - ${orderData.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #27ae60;">Order Delivered Successfully!</h2>
        <p>Dear ${orderData.customerName},</p>
        <p>Your order has been delivered successfully. Thank you for your business!</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Order Summary:</h3>
          <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
          <p><strong>Total Amount:</strong> KSH${orderData.totalAmount}</p>
          <p><strong>Delivery Date:</strong> ${new Date(orderData.deliveredAt).toLocaleString()}</p>
        </div>
        
        <p>We hope you enjoy your purchase. Please rate our service!</p>
      </div>
    `
  }),

  orderCancelled: (orderData, reason) => ({
    subject: `Order Cancelled - ${orderData.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e74c3c;">Order Cancelled</h2>
        <p>Dear ${orderData.customerName},</p>
        <p>Your order has been cancelled.</p>
        
        <div style="background: #fdf2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Order Details:</h3>
          <p><strong>Order Number:</strong> ${orderData.orderNumber}</p>
          <p><strong>Reason:</strong> ${reason || 'No reason provided'}</p>
        </div>
        
        <p>If you have any questions, please contact our support team.</p>
      </div>
    `
  }),

  // OTP for customer/agent login
  loginOTP: (data) => ({
    subject: `Login OTP - LPG Gas App`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Login OTP</h2>
        <p>Hello!</p>
        <p>Your login OTP for LPG Gas App is:</p>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <h1 style="color: #27ae60; font-size: 32px; margin: 0;">${data.otp}</h1>
          <p style="margin: 10px 0 0 0; color: #666;">This OTP expires in 10 minutes</p>
        </div>
        
        <p><strong>Email:</strong> ${data.email}</p>
        <p>Please use this OTP to login to your account.</p>
        <p>If you didn't request this OTP, please ignore this email.</p>
      </div>
    `
  })
  ,
  // OTP for admin password reset
  passwordResetOTP: (data) => ({
    subject: `Password Reset OTP - LPG Gas Admin`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Password Reset OTP</h2>
        <p>Hello Admin,</p>
        <p>Use the following OTP to reset your password:</p>
        
        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
          <h1 style="color: #27ae60; font-size: 32px; margin: 0;">${data.otp}</h1>
          <p style="margin: 10px 0 0 0; color: #666;">This OTP expires in 10 minutes</p>
        </div>
        
        <p><strong>Email:</strong> ${data.email}</p>
        <p>If you didn't request this, please secure your account immediately.</p>
      </div>
    `
  })
  ,
  // Agency confirmation email
  agencyConfirmation: (data) => ({
    subject: `Confirm your Agency - LPG Gas Admin`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50; text-align: center;">Confirm your Agency</h2>
        <p>Hello <strong>${data.agency.name}</strong>,</p>
        <p>Thank you for registering your agency with LPG Gas Admin. To activate your agency account, please click the confirmation link below:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.confirmUrl}" style="background: #27ae60; color: #fff; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Confirm Agency</a>
        </div>
        
        <p style="text-align: center; color: #666; font-size: 14px;">
          If the button doesn't work, copy and paste this link in your browser:<br>
          <a href="${data.confirmUrl}" style="color: #3498db; word-break: break-all;">${data.confirmUrl}</a>
        </p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0; color: #666; font-size: 14px;">
            <strong>Note:</strong> This confirmation link will expire in 24 hours. If you don't confirm within this time, you'll need to contact the admin for a new link.
          </p>
        </div>
        
        <p style="color: #666; font-size: 14px; text-align: center;">
          If you didn't register for this agency, please ignore this email.
        </p>
      </div>
    `
  })
};

// Send email function
const sendEmail = async (to, template, data) => {
  try {
    const emailContent = emailTemplates[template](data);
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: emailContent.subject,
      html: emailContent.html
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Email sending failed:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendEmail,
  emailTemplates
};

