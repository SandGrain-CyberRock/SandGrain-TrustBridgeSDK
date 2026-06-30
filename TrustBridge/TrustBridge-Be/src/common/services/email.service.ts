import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private logger = new Logger(EmailService.name);

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  async sendInvitationEmail(
    email: string,
    username: string,
    invitationToken: string,
  ): Promise<boolean> {
    try {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const setPasswordLink = `${frontendUrl}/set-password?token=${invitationToken}`;

      const htmlContent = this.getInvitationEmailTemplate(
        username,
        setPasswordLink,
      );

      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: "Welcome to TrustBridge - Set Your Password",
        html: htmlContent,
      });

      this.logger.log(`Invitation email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send invitation email to ${email}:`, error);
      return false;
    }
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
  ): Promise<boolean> {
    try {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const resetLink = `${frontendUrl}?token=${resetToken}`;

      const htmlContent = this.getPasswordResetEmailTemplate(resetLink);

      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: "TrustBridge - Password Reset Request",
        html: htmlContent,
      });

      this.logger.log(`Password reset email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${email}:`,
        error,
      );
      return false;
    }
  }

  async sendActivationEmail(
    email: string,
    name: string,
    username: string,
    temporaryPassword: string,
  ): Promise<boolean> {
    try {
      const htmlContent = this.getActivationEmailTemplate(
        name,
        username,
        temporaryPassword,
      );

      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: "Action Required: Your TrustBridge Account is Ready",
        html: htmlContent,
      });

      this.logger.log(`Activation email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send activation email to ${email}:`,
        error,
      );
      return false;
    }
  }

  async sendPasswordChangedEmail(
    email: string,
    name: string,
    username: string,
    temporaryPassword: string,
  ): Promise<boolean> {
    try {
      const htmlContent = this.getPasswordChangedEmailTemplate(
        name,
        username,
        temporaryPassword,
      );

      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: "Action Required: Your TrustBridge Password Has Changed",
        html: htmlContent,
      });

      this.logger.log(`Password changed email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send password changed email to ${email}:`,
        error,
      );
      return false;
    }
  }

  private renderBrandedEmail(opts: {
    pill: string;
    heroEyebrow: string;
    heroTitle: string;
    heroSub: string;
    name: string;
    intro: string;
    credLabel: string;
    username: string;
    temporaryPassword: string;
    infoBox?: { title: string; body: string };
    warning: { title: string; body: string };
    securityNote: string;
    title: string;
  }): string {
    const infoBoxHtml = opts.infoBox
      ? this.renderCalloutRow("ℹ️", "#1e88e5", opts.infoBox.title, opts.infoBox.body)
      : "";

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TrustBridge – ${opts.title}</title>
</head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Inter','Segoe UI',Tahoma,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f0f0;padding:40px 20px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

      <!-- Header -->
      <tr><td style="background:#2b2b2b;padding:20px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="left" valign="middle" style="font-size:22px;font-weight:700;letter-spacing:-0.3px;line-height:1;">
              <span style="color:#ffffff;">Trust</span><span style="color:#d4a017;">Bridge</span>
            </td>
            <td align="right" valign="middle">
              <span style="display:inline-block;font-size:10.5px;font-weight:600;color:#d4a017;border:1px solid rgba(212,160,23,0.4);background:rgba(212,160,23,0.08);padding:5px 12px;border-radius:20px;letter-spacing:0.7px;text-transform:uppercase;line-height:1;">
                ${opts.pill}
              </span>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Hero -->
      <tr><td style="background:#2b2b2b;background:linear-gradient(135deg,#333333 0%,#2b2b2b 100%);padding:34px 36px 30px;border-bottom:3px solid #d4a017;">
        <div style="font-size:10.5px;font-weight:600;color:#d4a017;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:10px;">${opts.heroEyebrow}</div>
        <div style="font-size:22px;font-weight:700;color:#f5f5f5;letter-spacing:-0.3px;margin-bottom:8px;line-height:1.25;">${opts.heroTitle}</div>
        <div style="font-size:13px;color:#9a9a9a;font-weight:400;line-height:1.5;">${opts.heroSub}</div>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:34px 36px;">
        <p style="margin:0 0 12px 0;font-size:14.5px;color:#1e2330;">Hello <strong style="font-weight:600;">${opts.name}</strong>,</p>
        <p style="margin:0 0 24px 0;font-size:13.5px;color:#555e73;line-height:1.75;">${opts.intro}</p>

        ${infoBoxHtml}

        <!-- Credentials card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e4e7ee;border-radius:9px;margin-bottom:22px;background:#ffffff;">
          <tr><td style="background:#f7f8fa;border-bottom:1px solid #e4e7ee;padding:11px 18px;border-radius:9px 9px 0 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" style="padding-right:8px;line-height:0;">
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#d4a017;"></span>
                </td>
                <td valign="middle" style="font-size:10.5px;font-weight:600;color:#7a8299;letter-spacing:0.8px;text-transform:uppercase;line-height:1;">
                  ${opts.credLabel}
                </td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:14px 18px;border-bottom:1px solid #f0f1f4;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" width="160" style="font-size:10.5px;font-weight:600;color:#9aa0b4;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Username</td>
                <td valign="middle" style="font-family:'JetBrains Mono',Consolas,Menlo,monospace;font-size:13px;font-weight:500;color:#1e2330;letter-spacing:0.3px;word-break:break-all;">${opts.username}</td>
              </tr>
            </table>
          </td></tr>
          <tr><td style="padding:14px 18px;border-radius:0 0 9px 9px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle" width="160" style="font-size:10.5px;font-weight:600;color:#9aa0b4;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Temporary Password</td>
                <td valign="middle" style="font-family:'JetBrains Mono',Consolas,Menlo,monospace;font-size:13px;font-weight:600;color:#1e2330;letter-spacing:0.3px;word-break:break-all;">${opts.temporaryPassword}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        ${this.renderCalloutRow("⚠️", "#d4a017", opts.warning.title, opts.warning.body)}

        <p style="margin:22px 0 0 0;padding-top:20px;border-top:1px solid #f0f1f5;font-size:12.5px;color:#6b7490;line-height:1.75;">
          ${opts.securityNote}
        </p>
      </td></tr>

      <!-- Slogan band -->
      <tr><td style="background:#d4a017;padding:18px 36px;text-align:center;">
        <div style="font-size:13px;font-weight:700;color:#1e2330;letter-spacing:0.2px;margin-bottom:3px;line-height:1.3;">TrustBridge</div>
        <div style="font-size:11.5px;color:rgba(30,35,48,0.78);font-style:italic;font-weight:400;line-height:1.55;">
          Faster, stronger, future-ready – bridging you to the highest assurance, today and beyond.
        </div>
      </td></tr>

      <!-- Footer -->
      <tr><td align="center" style="background:#2b2b2b;padding:18px 36px;border-radius:0 0 12px 12px;">
        <span style="font-size:11px;color:#a0a8b8;letter-spacing:0.2px;">© 2026 TrustBridge. All rights reserved.</span>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
  }

  private renderCalloutRow(
    iconChar: string,
    iconColor: string,
    title: string,
    body: string,
  ): string {
    return `
        <div style="background:#fffbf0;border:1px solid #f0c040;border-left:3px solid #d4a017;border-radius:8px;padding:12px 14px;margin-bottom:22px;font-size:13px;color:#7a5a00;line-height:1.55;font-family:'Inter','Segoe UI',Tahoma,Arial,sans-serif;">
          <span style="color:${iconColor};font-weight:700;font-size:13px;margin-right:6px;">${iconChar}</span><strong style="font-weight:600;color:#5c4200;">${title}</strong> ${body}
        </div>`;
  }

  private getActivationEmailTemplate(
    name: string,
    username: string,
    temporaryPassword: string,
  ): string {
    return this.renderBrandedEmail({
      title: "Account Activation",
      pill: "Account Activation",
      heroEyebrow: "Welcome Aboard",
      heroTitle: "Your account is ready",
      heroSub: "Here are your login details to get started",
      name,
      intro:
        "Welcome to TrustBridge! Your account has been set up and is ready to use. Find your login details below — once you sign in for the first time, you'll be asked to choose a new password.",
      credLabel: "Your Login Details",
      username,
      temporaryPassword,
      warning: {
        title: "Please act now:",
        body: "This password is temporary. You'll need to set a new one the first time you log in to keep your account active.",
      },
      securityNote:
        "Keep your login details private and never share them with anyone — including TrustBridge support. If something doesn't seem right, get in touch with your TrustBridge Administrator as soon as possible.",
    });
  }

  private getPasswordChangedEmailTemplate(
    name: string,
    username: string,
    temporaryPassword: string,
  ): string {
    return this.renderBrandedEmail({
      title: "Password Reset",
      pill: "Password Reset",
      heroEyebrow: "Heads Up",
      heroTitle: "Your password has been reset",
      heroSub:
        "Your TrustBridge Administrator has set a new temporary password for your account",
      name,
      intro:
        "Your TrustBridge password was recently reset by your TrustBridge Administrator. Use the temporary password below to log in, then you'll be asked to choose a new one straight away.",
      infoBox: {
        title: "Just so you know:",
        body: "Your TrustBridge Administrator made this change on your behalf. If this comes as a surprise, just reach out to them to confirm.",
      },
      credLabel: "Your New Temporary Password",
      username,
      temporaryPassword,
      warning: {
        title: "Please act now:",
        body: "This password is temporary — change it on your next sign-in.",
      },
      securityNote:
        "Keep your password private and never share it with anyone — including TrustBridge support. If something doesn't seem right, get in touch with your TrustBridge Administrator as soon as possible.",
    });
  }

  private getInvitationEmailTemplate(username: string, link: string): string {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: #f8f9fa;
            padding: 20px;
          }
          .email-wrapper {
            background: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            padding: 40px 20px;
            text-align: center;
          }
          .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
            font-weight: 600;
          }
          .content {
            padding: 40px 30px;
          }
          .greeting {
            font-size: 16px;
            margin-bottom: 20px;
          }
          .greeting strong {
            color: #667eea;
          }
          .message {
            font-size: 15px;
            line-height: 1.8;
            margin-bottom: 30px;
            color: #555;
          }
          .cta-container {
            text-align: center;
            margin: 40px 0;
          }
          .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            padding: 14px 40px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
            transition: transform 0.2s ease;
          }
          .cta-button:hover {
            transform: translateY(-2px);
          }
          .link-text {
            font-size: 12px;
            color: #999;
            word-break: break-all;
            margin-top: 15px;
            padding: 15px;
            background: #f5f5f5;
            border-radius: 4px;
            font-family: monospace;
          }
          .important-note {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
            color: #856404;
          }
          .footer {
            background: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            font-size: 12px;
            color: #666;
          }
          .footer-link {
            color: #667eea;
            text-decoration: none;
          }
          .divider {
            height: 1px;
            background: #e9ecef;
            margin: 30px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="email-wrapper">
            <!-- Header -->
            <div class="header">
              <h1>🔐 Welcome to TrustBridge</h1>
              <p>Set Up Your Account</p>
            </div>

            <!-- Content -->
            <div class="content">
              <div class="greeting">
                Hello <strong>${username}</strong>,
              </div>

              <div class="message">
                Your TrustBridge account has been created successfully! To get started, you need to set your password by clicking the button below.
              </div>

              <div class="message">
                This link will expire in <strong>7 days</strong>. If you don't set your password before then, you'll need to request a new invitation.
              </div>

              <!-- CTA Button -->
              <div class="cta-container">
                <a href="${link}" class="cta-button">Set Your Password</a>
                <div class="link-text">
                  Or copy this link:<br>
                  ${link}
                </div>
              </div>

              <!-- Important Note -->
              <div class="important-note">
                ⚠️ <strong>Important:</strong> Never share this link with anyone. The link is unique to your account and should be kept confidential.
              </div>

              <div class="message">
                If you didn't request this invitation or have any questions, please contact our support team.
              </div>

              <div class="divider"></div>

              <div class="message" style="font-size: 13px; color: #999;">
                <strong>Security Tip:</strong> Make sure your password is strong and unique. Use a combination of uppercase letters, lowercase letters, numbers, and special characters.
              </div>
            </div>

            <!-- Footer -->
            <div class="footer">
              <p>
                <strong>TrustBridge Team</strong> | Your Trusted Access Management Platform
              </p>
              <p style="margin-top: 10px;">
                Questions? <a href="mailto:support@trustbridge.com" class="footer-link">Contact Support</a>
              </p>
              <p style="margin-top: 15px; color: #999;">
                © 2026 TrustBridge. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
    `;
  }

  private getPasswordResetEmailTemplate(link: string): string {
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: #f8f9fa;
            padding: 20px;
          }
          .email-wrapper {
            background: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            padding: 40px 20px;
            text-align: center;
          }
          .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
            font-weight: 600;
          }
          .content {
            padding: 40px 30px;
          }
          .message {
            font-size: 15px;
            line-height: 1.8;
            margin-bottom: 20px;
            color: #555;
          }
          .cta-container {
            text-align: center;
            margin: 40px 0;
          }
          .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            padding: 14px 40px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
            transition: transform 0.2s ease;
          }
          .cta-button:hover {
            transform: translateY(-2px);
          }
          .link-text {
            font-size: 12px;
            color: #999;
            word-break: break-all;
            margin-top: 15px;
            padding: 15px;
            background: #f5f5f5;
            border-radius: 4px;
            font-family: monospace;
          }
          .warning-box {
            background: #f8d7da;
            border-left: 4px solid #dc3545;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
            color: #721c24;
          }
          .info-box {
            background: #d1ecf1;
            border-left: 4px solid #17a2b8;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
            color: #0c5460;
          }
          .footer {
            background: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            font-size: 12px;
            color: #666;
          }
          .footer-link {
            color: #667eea;
            text-decoration: none;
          }
          .divider {
            height: 1px;
            background: #e9ecef;
            margin: 30px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="email-wrapper">
            <!-- Header -->
            <div class="header">
              <h1>🔑 Password Reset</h1>
              <p>Follow the link below to reset your password</p>
            </div>

            <!-- Content -->
            <div class="content">
              <div class="message">
                We received a request to reset the password for your TrustBridge account. Click the button below to set a new password.
              </div>

              <!-- Warning -->
              <div class="warning-box">
                ⏰ <strong>Link Expiration:</strong> This reset link will expire in 1 hour. If it expires, you'll need to request another password reset.
              </div>

              <!-- CTA Button -->
              <div class="cta-container">
                <a href="${link}" class="cta-button">Reset Your Password</a>
                <div class="link-text">
                  Or copy this link:<br>
                  ${link}
                </div>
              </div>

              <!-- Info Box -->
              <div class="info-box">
                ℹ️ <strong>Didn't request this?</strong> If you didn't request a password reset, please ignore this email. Your account is secure and no changes have been made.
              </div>

              <!-- Password Tips -->
              <div class="divider"></div>

              <div class="message" style="font-size: 13px; color: #666; margin-top: 20px;">
                <strong>Password Best Practices:</strong>
                <ul style="margin-left: 20px; margin-top: 10px;">
                  <li>Use at least 8 characters</li>
                  <li>Include uppercase and lowercase letters</li>
                  <li>Add numbers and special characters (!@#$%^&*)</li>
                  <li>Avoid using personal information</li>
                  <li>Don't reuse passwords from other accounts</li>
                </ul>
              </div>
            </div>

            <!-- Footer -->
            <div class="footer">
              <p>
                <strong>TrustBridge Team</strong> | Your Trusted Access Management Platform
              </p>
              <p style="margin-top: 10px;">
                Questions? <a href="mailto:support@trustbridge.com" class="footer-link">Contact Support</a>
              </p>
              <p style="margin-top: 15px; color: #999;">
                © 2026 TrustBridge. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
    `;
  }
}
