import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { EmailService } from './email.service';

// ---------------------------------------------------------------------------
// Mock nodemailer
// ---------------------------------------------------------------------------

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });

jest.mock('nodemailer', () => ({
  createTransport: (...args: any[]) => mockCreateTransport(...args),
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('EmailService', () => {
  let service: EmailService;
  let configValues: Record<string, string>;

  // Helper to build a module with specific config values
  async function createService(overrides: Record<string, string> = {}) {
    configValues = {
      SMTP_FROM: 'noreply@apcd.npc.gov.in',
      SMTP_ENABLED: 'true',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'testuser',
      SMTP_PASS: 'testpass',
      ...overrides,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal?: string) => {
              return configValues[key] !== undefined ? configValues[key] : defaultVal;
            }),
          },
        },
      ],
    }).compile();

    return module.get<EmailService>(EmailService);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await createService();
  });

  // =========================================================================
  // sendEmail()
  // =========================================================================

  describe('sendEmail', () => {
    it('should send an email and return true when SMTP is enabled', async () => {
      const result = await service.sendEmail(
        'user@test.com',
        'Test Subject',
        'Test body content',
      );

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith({
        from: '"APCD Portal - NPC" <noreply@apcd.npc.gov.in>',
        to: 'user@test.com',
        subject: '[APCD Portal] Test Subject',
        html: expect.stringContaining('Test Subject'),
        text: 'Test body content',
      });
    });

    it('should return false when SMTP is disabled', async () => {
      service = await createService({ SMTP_ENABLED: 'false' });

      const result = await service.sendEmail(
        'user@test.com',
        'Test Subject',
        'Test body',
      );

      expect(result).toBe(false);
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should return false when sendMail throws an error', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

      const result = await service.sendEmail(
        'user@test.com',
        'Test Subject',
        'Test body',
      );

      expect(result).toBe(false);
    });

    it('should prefix subject with [APCD Portal]', async () => {
      await service.sendEmail('user@test.com', 'My Subject', 'Body');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '[APCD Portal] My Subject',
        }),
      );
    });

    it('should wrap body in HTML template', async () => {
      await service.sendEmail('user@test.com', 'Title', 'Body content');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('APCD OEM Empanelment Portal'),
        }),
      );
    });

    it('should include plain text body as fallback', async () => {
      const body = 'Plain text content here';
      await service.sendEmail('user@test.com', 'Subject', body);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: body,
        }),
      );
    });
  });

  // =========================================================================
  // sendApplicationSubmitted()
  // =========================================================================

  describe('sendApplicationSubmitted', () => {
    it('should send application submitted email with correct content', async () => {
      const result = await service.sendApplicationSubmitted(
        'oem@test.com',
        'APCD-2025-0001',
      );

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'oem@test.com',
          subject: '[APCD Portal] Application Submitted Successfully',
          text: expect.stringContaining('APCD-2025-0001'),
        }),
      );
    });

    it('should mention that application is under review', async () => {
      await service.sendApplicationSubmitted('oem@test.com', 'APCD-2025-0001');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('under review'),
        }),
      );
    });
  });

  // =========================================================================
  // sendQueryRaised()
  // =========================================================================

  describe('sendQueryRaised', () => {
    it('should send query raised email with application number and query subject', async () => {
      const result = await service.sendQueryRaised(
        'oem@test.com',
        'APCD-2025-0001',
        'Missing ISO certificate',
      );

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'oem@test.com',
          subject: '[APCD Portal] Query Raised - APCD-2025-0001',
          text: expect.stringContaining('Missing ISO certificate'),
        }),
      );
    });

    it('should include application number in the body', async () => {
      await service.sendQueryRaised(
        'oem@test.com',
        'APCD-2025-0002',
        'Clarification needed',
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('APCD-2025-0002'),
        }),
      );
    });
  });

  // =========================================================================
  // sendApplicationApproved()
  // =========================================================================

  describe('sendApplicationApproved', () => {
    it('should send approval email with congratulations', async () => {
      const result = await service.sendApplicationApproved(
        'oem@test.com',
        'APCD-2025-0001',
      );

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'oem@test.com',
          subject: '[APCD Portal] Application Approved',
          text: expect.stringContaining('Congratulations'),
        }),
      );
    });

    it('should mention certificate generation in the body', async () => {
      await service.sendApplicationApproved('oem@test.com', 'APCD-2025-0001');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('certificate'),
        }),
      );
    });
  });

  // =========================================================================
  // sendApplicationRejected()
  // =========================================================================

  describe('sendApplicationRejected', () => {
    it('should send rejection email with reason when provided', async () => {
      const result = await service.sendApplicationRejected(
        'oem@test.com',
        'APCD-2025-0001',
        'Incomplete documentation',
      );

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'oem@test.com',
          subject: '[APCD Portal] Application Not Approved',
          text: expect.stringContaining('Incomplete documentation'),
        }),
      );
    });

    it('should send rejection email without reason when not provided', async () => {
      const result = await service.sendApplicationRejected(
        'oem@test.com',
        'APCD-2025-0001',
      );

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('not been approved'),
        }),
      );
    });

    it('should include application number in the body', async () => {
      await service.sendApplicationRejected(
        'oem@test.com',
        'APCD-2025-0003',
        'Some reason',
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('APCD-2025-0003'),
        }),
      );
    });

    it('should mention contacting NPC office for further details', async () => {
      await service.sendApplicationRejected('oem@test.com', 'APCD-2025-0001');

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('NPC office'),
        }),
      );
    });
  });

  // =========================================================================
  // Constructor / initialization
  // =========================================================================

  describe('initialization', () => {
    it('should create transporter when SMTP is enabled', async () => {
      await createService({ SMTP_ENABLED: 'true' });

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: 'testuser',
          pass: 'testpass',
        },
      });
    });

    it('should not create transporter when SMTP is disabled', async () => {
      mockCreateTransport.mockClear();

      await createService({ SMTP_ENABLED: 'false' });

      expect(mockCreateTransport).not.toHaveBeenCalled();
    });
  });
});
