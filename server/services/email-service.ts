import nodemailer from 'nodemailer';

// Create reusable transporter using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export class EmailService {
  async sendPasswordResetEmail(email: string, resetLink: string, displayName: string) {
    try {
      const mailOptions = {
        from: `"Solar ERP" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Set Your Password - Employee Portal',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
                .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #6b7280; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Welcome to the Team!</h1>
                </div>
                <div class="content">
                  <p>Hi ${displayName},</p>
                  <p>Your employee account has been created. To access the employee portal, you need to set your password first.</p>
                  <p>Click the button below to create your password:</p>
                  <p style="text-align: center;">
                    <a href="${resetLink}" class="button">Set My Password</a>
                  </p>
                  <p>Or copy and paste this link into your browser:</p>
                  <p style="word-break: break-all; background: #e5e7eb; padding: 10px; border-radius: 4px; font-size: 14px;">${resetLink}</p>
                  <p><strong>Note:</strong> This link will expire in 1 hour for security purposes.</p>
                  <p>If you didn't request this account, please ignore this email.</p>
                </div>
                <div class="footer">
                  <p>This is an automated email. Please do not reply.</p>
                </div>
              </div>
            </body>
          </html>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('✅ Password reset email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('❌ Error sending password reset email:', error);
      throw error;
    }
  }

  async sendOTPEmail(email: string, otp: string) {
    try {
      const mailOptions = {
        from: `"Solar ERP" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'Your Verification Code for Solar ERP Registration',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0; }
                .content { background: #f9fafb; padding: 40px 30px; }
                .otp-box { background: white; border: 2px dashed #667eea; border-radius: 12px; padding: 25px; text-align: center; margin: 30px 0; }
                .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #667eea; font-family: 'Courier New', monospace; }
                .warning-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .footer { background: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e9ecef; border-radius: 0 0 8px 8px; font-size: 12px; color: #999; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🔐 Email Verification</h1>
                  <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Solar ERP Registration</p>
                </div>
                <div class="content">
                  <p style="font-size: 16px; margin-bottom: 10px;">Hello!</p>
                  <p style="font-size: 14px; color: #666;">Thank you for registering with Solar ERP. Please use the verification code below to complete your registration:</p>
                  
                  <div class="otp-box">
                    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px;">Your Verification Code</p>
                    <div class="otp-code">${otp}</div>
                  </div>

                  <div class="warning-box">
                    <p style="margin: 0 0 10px 0; font-weight: bold; color: #856404;">⚠️ Important:</p>
                    <ul style="margin: 0; padding-left: 20px; color: #856404;">
                      <li>This code will expire in <strong>5 minutes</strong></li>
                      <li>Do not share this code with anyone</li>
                      <li>If you didn't request this code, please ignore this email</li>
                    </ul>
                  </div>

                  <p style="font-size: 14px; color: #666; margin-top: 30px;">If you have any questions, please contact our support team.</p>
                </div>
                <div class="footer">
                  <p style="margin: 0;">© ${new Date().getFullYear()} Solar ERP - Powered by Godivatech</p>
                  <p style="margin: 5px 0 0 0;">This is an automated email. Please do not reply.</p>
                </div>
              </div>
            </body>
          </html>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log('✅ OTP email sent successfully to:', email, '| Message ID:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      console.error('❌ Error sending OTP email:', error);
      throw new Error(`Failed to send OTP email: ${error.message}`);
    }
  }
}

export const emailService = new EmailService();
