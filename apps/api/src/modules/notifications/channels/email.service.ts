import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress: string;
  private enabled: boolean;

  constructor(private config: ConfigService) {
    this.fromAddress = this.config.get('SMTP_FROM', 'noreply@apcd.npc.gov.in');
    this.enabled = this.config.get('SMTP_ENABLED', 'false') === 'true';

    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        host: this.config.get('SMTP_HOST', 'smtp.gmail.com'),
        port: parseInt(this.config.get('SMTP_PORT', '587'), 10),
        secure: this.config.get('SMTP_SECURE', 'false') === 'true',
        auth: {
          user: this.config.get('SMTP_USER', ''),
          pass: this.config.get('SMTP_PASS', ''),
        },
      });
      this.logger.log('Email service initialized with SMTP');
    } else {
      this.logger.log('Email service disabled (SMTP_ENABLED not set)');
    }
  }

  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      this.logger.log(`[EMAIL-DISABLED] To: ${to}, Subject: ${subject}`);
      return false;
    }

    try {
      const htmlBody = this.wrapInTemplate(subject, body);

      await this.transporter.sendMail({
        from: `"APCD Portal - NPC" <${this.fromAddress}>`,
        to,
        subject: `[APCD Portal] ${subject}`,
        html: htmlBody,
        text: body,
      });

      this.logger.log(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error}`);
      return false;
    }
  }

  async sendApplicationSubmitted(to: string, applicationNumber: string): Promise<boolean> {
    return this.sendEmail(
      to,
      'Application Submitted Successfully',
      `Your APCD OEM Empanelment Application (${applicationNumber}) has been submitted successfully.\n\nYour application is now under review. You will be notified of any updates or queries.\n\nPlease ensure your payment is completed if not already done.`,
    );
  }

  async sendQueryRaised(
    to: string,
    applicationNumber: string,
    querySubject: string,
  ): Promise<boolean> {
    return this.sendEmail(
      to,
      `Query Raised - ${applicationNumber}`,
      `A query has been raised on your application ${applicationNumber}.\n\nQuery: ${querySubject}\n\nPlease login to the portal to view the full query details and submit your response at the earliest.`,
    );
  }

  async sendApplicationApproved(to: string, applicationNumber: string): Promise<boolean> {
    return this.sendEmail(
      to,
      'Application Approved',
      `Congratulations! Your APCD OEM Empanelment Application (${applicationNumber}) has been approved.\n\nYour empanelment certificate will be generated shortly. You can download it from the Certificates section of the portal.`,
    );
  }

  async sendApplicationRejected(
    to: string,
    applicationNumber: string,
    reason?: string,
  ): Promise<boolean> {
    return this.sendEmail(
      to,
      'Application Not Approved',
      `Your APCD OEM Empanelment Application (${applicationNumber}) has not been approved.\n\n${reason ? `Reason: ${reason}\n\n` : ''}You may contact the NPC office for further details or submit a fresh application after addressing the observations.`,
    );
  }

  async sendPaymentReceived(
    to: string,
    applicationNumber: string,
    amount: string,
  ): Promise<boolean> {
    return this.sendEmail(
      to,
      'Payment Received',
      `Payment of ${amount} for your application ${applicationNumber} has been received and verified.\n\nYour application will now proceed for review.`,
    );
  }

  async sendCertificateExpiry(
    to: string,
    certificateNumber: string,
    daysLeft: number,
  ): Promise<boolean> {
    return this.sendEmail(
      to,
      'Certificate Expiring Soon',
      `Your APCD empanelment certificate (${certificateNumber}) will expire in ${daysLeft} days.\n\nPlease initiate the renewal process by logging into the portal. The renewal fee is payable at least 60 days before the expiry date.`,
    );
  }

  private wrapInTemplate(title: string, body: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#1e3a5f;padding:20px 30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:18px;">APCD OEM Empanelment Portal</h1>
              <p style="color:#8cb4d8;margin:5px 0 0;font-size:12px;">National Productivity Council for CPCB</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:30px;">
              <h2 style="color:#1e3a5f;margin:0 0 15px;font-size:16px;">${title}</h2>
              <div style="color:#333;font-size:14px;line-height:1.6;">
                ${body
                  .split('\n')
                  .map((line) => `<p style="margin:8px 0;">${line}</p>`)
                  .join('')}
              </div>
              <hr style="border:none;border-top:1px solid #eee;margin:25px 0;">
              <p style="color:#888;font-size:12px;margin:0;">
                This is an automated message from the APCD OEM Empanelment Portal. Please do not reply to this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8f8f8;padding:15px 30px;text-align:center;">
              <p style="color:#999;font-size:11px;margin:0;">
                &copy; ${new Date().getFullYear()} National Productivity Council. All rights reserved.<br>
                For CPCB - Central Pollution Control Board
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }
}
