const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Email templates
const emailTemplates = {
  'tenant-welcome': (data) => ({
    subject: `Welcome to ${process.env.APP_NAME || 'Multi-Tenant App'} - Your Account is Ready!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to ${process.env.APP_NAME || 'Multi-Tenant App'}!</h2>
        
        <p>Dear ${data.companyName} Team,</p>
        
        <p>Congratulations! Your company account has been successfully created. You can now access your dedicated recruitment platform.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">Your Account Details:</h3>
          <p><strong>Company Subdomain:</strong> ${data.subdomain}</p>
          <p><strong>Login URL:</strong> <a href="${data.loginUrl}">${data.loginUrl}</a></p>
          <p><strong>Username:</strong> ${data.username}</p>
          <p><strong>Temporary Password:</strong> ${data.password}</p>
        </div>
        
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <p style="margin: 0;"><strong>Important:</strong> Please change your password after your first login for security purposes.</p>
        </div>
        
        <h3>Next Steps:</h3>
        <ol>
          <li>Click on the login URL above</li>
          <li>Use the provided credentials to log in</li>
          <li>Change your password</li>
          <li>Set up your company profile and branding</li>
          <li>Create your RMG department and add recruiters</li>
        </ol>
        
        <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
        
        <p>Best regards,<br>
        The ${process.env.APP_NAME || 'Multi-Tenant App'} Team</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #666;">
          This is an automated email. Please do not reply to this email address.
        </p>
      </div>
    `
  }),
  
  'user-invitation': (data) => ({
    subject: `You've been invited to join ${data.companyName} on ${process.env.APP_NAME}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">You're Invited!</h2>
        
        <p>Hello ${data.name},</p>
        
        <p>You have been invited to join <strong>${data.companyName}</strong> as a ${data.role} on our recruitment platform.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">Your Login Details:</h3>
          <p><strong>Login URL:</strong> <a href="${data.loginUrl}">${data.loginUrl}</a></p>
          <p><strong>Email:</strong> ${data.email}</p>
          <p><strong>Temporary Password:</strong> ${data.password}</p>
        </div>
        
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <p style="margin: 0;"><strong>Security Note:</strong> Please change your password after your first login.</p>
        </div>
        
        <p>Welcome to the team!</p>
        
        <p>Best regards,<br>
        ${data.companyName} Team</p>
      </div>
    `
  }),
  
  'password-reset': (data) => ({
    subject: 'Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        
        <p>Hello ${data.name},</p>
        
        <p>You have requested to reset your password. Click the link below to reset your password:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.resetUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p>This link will expire in 10 minutes.</p>
        
        <p>If you did not request this password reset, please ignore this email.</p>
        
        <p>Best regards,<br>
        The ${process.env.APP_NAME || 'Multi-Tenant App'} Team</p>
      </div>
    `
  }),
  
  'application-received': (data) => ({
    subject: `Application Received - ${data.jobTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Application Received</h2>
        
        <p>Dear ${data.candidateName},</p>
        
        <p>Thank you for your interest in the <strong>${data.jobTitle}</strong> position at <strong>${data.companyName}</strong>.</p>
        
        <p>We have successfully received your application and our recruitment team will review it shortly.</p>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #333; margin-top: 0;">Application Details:</h3>
          <p><strong>Position:</strong> ${data.jobTitle}</p>
          <p><strong>Applied on:</strong> ${data.appliedDate}</p>
          <p><strong>Application ID:</strong> ${data.applicationId}</p>
        </div>
        
        <p>We will contact you if your profile matches our requirements.</p>
        
        <p>Best regards,<br>
        ${data.companyName} Recruitment Team</p>
      </div>
    `
  })
};

// Send email function
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();
    
    let emailContent;
    
    if (options.template && emailTemplates[options.template]) {
      emailContent = emailTemplates[options.template](options.data);
    } else {
      emailContent = {
        subject: options.subject,
        html: options.html || options.text
      };
    }
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: options.to,
      subject: emailContent.subject,
      html: emailContent.html
    };
    
    const info = await transporter.sendMail(mailOptions);
    
    console.log('Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

// Send bulk emails
const sendBulkEmails = async (emailList) => {
  try {
    const transporter = createTransporter();
    const results = [];
    
    for (const emailOptions of emailList) {
      try {
        const info = await sendEmail(emailOptions);
        results.push({ success: true, messageId: info.messageId, to: emailOptions.to });
      } catch (error) {
        results.push({ success: false, error: error.message, to: emailOptions.to });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Bulk email sending failed:', error);
    throw error;
  }
};

module.exports = {
  sendEmail,
  sendBulkEmails
};