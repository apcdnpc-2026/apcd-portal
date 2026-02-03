import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { DomainEventService, ApplicationEventType } from './domain-event.service';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const mockDomainEvent = {
  id: 'event-1',
  aggregateType: 'Application',
  aggregateId: 'app-1',
  eventType: ApplicationEventType.APPLICATION_CREATED,
  eventVersion: 1,
  payload: { applicationNumber: 'APCD-2025-0001' },
  metadata: { userId: 'user-1' },
  createdAt: new Date('2025-06-15T10:00:00Z'),
};

const mockStatusChangedEvent = {
  id: 'event-2',
  aggregateType: 'Application',
  aggregateId: 'app-1',
  eventType: ApplicationEventType.STATUS_CHANGED,
  eventVersion: 2,
  payload: { oldStatus: 'DRAFT', newStatus: 'SUBMITTED' },
  metadata: { userId: 'user-1' },
  createdAt: new Date('2025-06-15T11:00:00Z'),
};

const mockSubmittedEvent = {
  id: 'event-3',
  aggregateType: 'Application',
  aggregateId: 'app-1',
  eventType: ApplicationEventType.APPLICATION_SUBMITTED,
  eventVersion: 3,
  payload: { submittedBy: 'user-1' },
  metadata: { userId: 'user-1', correlationId: 'corr-1' },
  createdAt: new Date('2025-06-15T12:00:00Z'),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('DomainEventService', () => {
  let service: DomainEventService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(async () => {
    const mockPrisma = mockDeep<PrismaClient>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [DomainEventService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<DomainEventService>(DomainEventService);
    prisma = mockPrisma;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // emit()
  // =========================================================================

  describe('emit', () => {
    it('should create event with version 1 when no prior events exist', async () => {
      prisma.domainEvent.findFirst.mockResolvedValue(null);
      prisma.domainEvent.create.mockResolvedValue(mockDomainEvent as unknown as never);

      const result = await service.emit({
        aggregateType: 'Application',
        aggregateId: 'app-1',
        eventType: ApplicationEventType.APPLICATION_CREATED,
        eventData: { applicationNumber: 'APCD-2025-0001' },
        userId: 'user-1',
      });

      expect(result.eventVersion).toBe(1);
      expect(result.aggregateType).toBe('Application');
      expect(result.aggregateId).toBe('app-1');
      expect(result.eventType).toBe(ApplicationEventType.APPLICATION_CREATED);
      expect(prisma.domainEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          aggregateType: 'Application',
          aggregateId: 'app-1',
          eventType: ApplicationEventType.APPLICATION_CREATED,
          eventVersion: 1,
          payload: { applicationNumber: 'APCD-2025-0001' },
          metadata: { userId: 'user-1' },
        }),
      });
    });

    it('should auto-increment version based on last event', async () => {
      prisma.domainEvent.findFirst.mockResolvedValue({
        eventVersion: 3,
      } as unknown as never);
      prisma.domainEvent.create.mockResolvedValue({
        ...mockDomainEvent,
        eventVersion: 4,
      } as unknown as never);

      const result = await service.emit({
        aggregateType: 'Application',
        aggregateId: 'app-1',
        eventType: ApplicationEventType.STATUS_CHANGED,
        eventData: { oldStatus: 'DRAFT', newStatus: 'SUBMITTED' },
      });

      expect(result.eventVersion).toBe(4);
      expect(prisma.domainEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventVersion: 4,
        }),
      });
    });

    it('should include correlationId in metadata when provided', async () => {
      prisma.domainEvent.findFirst.mockResolvedValue(null);
      prisma.domainEvent.create.mockResolvedValue({
        ...mockDomainEvent,
        metadata: { userId: 'user-1', correlationId: 'corr-123' },
      } as unknown as never);

      await service.emit({
        aggregateType: 'Application',
        aggregateId: 'app-1',
        eventType: ApplicationEventType.APPLICATION_SUBMITTED,
        eventData: {},
        userId: 'user-1',
        correlationId: 'corr-123',
      });

      expect(prisma.domainEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: { userId: 'user-1', correlationId: 'corr-123' },
        }),
      });
    });

    it('should set metadata to null when no userId or correlationId provided', async () => {
      prisma.domainEvent.findFirst.mockResolvedValue(null);
      prisma.domainEvent.create.mockResolvedValue({
        ...mockDomainEvent,
        metadata: null,
      } as unknown as never);

      await service.emit({
        aggregateType: 'Application',
        aggregateId: 'app-1',
        eventType: ApplicationEventType.APPLICATION_CREATED,
        eventData: {},
      });

      expect(prisma.domainEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata: null,
        }),
      });
    });

    it('should find the last event by eventVersion descending', async () => {
      prisma.domainEvent.findFirst.mockResolvedValue(null);
      prisma.domainEvent.create.mockResolvedValue(mockDomainEvent as unknown as never);

      await service.emit({
        aggregateType: 'Application',
        aggregateId: 'app-1',
        eventType: ApplicationEventType.APPLICATION_CREATED,
        eventData: {},
      });

      expect(prisma.domainEvent.findFirst).toHaveBeenCalledWith({
        where: {
          aggregateType: 'Application',
          aggregateId: 'app-1',
        },
        orderBy: {
          eventVersion: 'desc',
        },
        select: {
          eventVersion: true,
        },
      });
    });
  });

  // =========================================================================
  // getEvents()
  // =========================================================================

  describe('getEvents', () => {
    it('should return all events for an aggregate in version order', async () => {
      prisma.domainEvent.findMany.mockResolvedValue([
        mockDomainEvent,
        mockStatusChangedEvent,
        mockSubmittedEvent,
      ] as unknown as never);

      const result = await service.getEvents('Application', 'app-1');

      expect(result).toHaveLength(3);
      expect(result[0].eventVersion).toBe(1);
      expect(result[1].eventVersion).toBe(2);
      expect(result[2].eventVersion).toBe(3);
      expect(prisma.domainEvent.findMany).toHaveBeenCalledWith({
        where: {
          aggregateType: 'Application',
          aggregateId: 'app-1',
        },
        orderBy: {
          eventVersion: 'asc',
        },
      });
    });

    it('should return empty array when no events exist', async () => {
      prisma.domainEvent.findMany.mockResolvedValue([]);

      const result = await service.getEvents('Application', 'nonexistent');

      expect(result).toEqual([]);
    });

    it('should map event properties correctly', async () => {
      prisma.domainEvent.findMany.mockResolvedValue([mockDomainEvent] as unknown as never);

      const result = await service.getEvents('Application', 'app-1');

      expect(result[0]).toEqual({
        id: 'event-1',
        aggregateType: 'Application',
        aggregateId: 'app-1',
        eventType: ApplicationEventType.APPLICATION_CREATED,
        eventVersion: 1,
        payload: { applicationNumber: 'APCD-2025-0001' },
        metadata: { userId: 'user-1' },
        createdAt: mockDomainEvent.createdAt,
      });
    });
  });

  // =========================================================================
  // getEventsByCorrelation()
  // =========================================================================

  describe('getEventsByCorrelation', () => {
    it('should return all events with matching correlationId', async () => {
      prisma.domainEvent.findMany.mockResolvedValue([mockSubmittedEvent] as unknown as never);

      const result = await service.getEventsByCorrelation('corr-1');

      expect(result).toHaveLength(1);
      expect(prisma.domainEvent.findMany).toHaveBeenCalledWith({
        where: {
          metadata: {
            path: ['correlationId'],
            equals: 'corr-1',
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    });

    it('should return empty array when no events match correlationId', async () => {
      prisma.domainEvent.findMany.mockResolvedValue([]);

      const result = await service.getEventsByCorrelation('nonexistent-corr');

      expect(result).toEqual([]);
    });

    it('should return events from multiple aggregates with same correlationId', async () => {
      const event1 = {
        ...mockDomainEvent,
        aggregateId: 'app-1',
        metadata: { correlationId: 'corr-shared' },
      };
      const event2 = {
        ...mockDomainEvent,
        id: 'event-2',
        aggregateId: 'app-2',
        metadata: { correlationId: 'corr-shared' },
      };
      prisma.domainEvent.findMany.mockResolvedValue([event1, event2] as unknown as never);

      const result = await service.getEventsByCorrelation('corr-shared');

      expect(result).toHaveLength(2);
      expect(result[0].aggregateId).toBe('app-1');
      expect(result[1].aggregateId).toBe('app-2');
    });
  });

  // =========================================================================
  // reconstructState()
  // =========================================================================

  describe('reconstructState', () => {
    it('should return empty state when no events exist', async () => {
      prisma.domainEvent.findMany.mockResolvedValue([]);

      const result = await service.reconstructState('Application', 'nonexistent');

      expect(result).toEqual({
        aggregateType: 'Application',
        aggregateId: 'nonexistent',
        exists: false,
        state: null,
        version: 0,
        eventCount: 0,
      });
    });

    it('should apply events in order to build Application state', async () => {
      prisma.domainEvent.findMany.mockResolvedValue([
        mockDomainEvent,
        mockStatusChangedEvent,
        mockSubmittedEvent,
      ] as unknown as never);

      const result = await service.reconstructState('Application', 'app-1');

      expect(result.exists).toBe(true);
      expect(result.version).toBe(3);
      expect(result.eventCount).toBe(3);
      expect(result.state).toBeDefined();
      expect((result.state as Record<string, unknown>).status).toBe('SUBMITTED');
    });

    it('should reconstruct Application with correct timeline', async () => {
      prisma.domainEvent.findMany.mockResolvedValue([
        mockDomainEvent,
        mockStatusChangedEvent,
      ] as unknown as never);

      const result = await service.reconstructState('Application', 'app-1');
      const state = result.state as Record<string, unknown>;
      const timeline = state.timeline as Array<Record<string, unknown>>;

      expect(timeline).toHaveLength(2);
      expect(timeline[0].eventType).toBe(ApplicationEventType.APPLICATION_CREATED);
      expect(timeline[1].eventType).toBe(ApplicationEventType.STATUS_CHANGED);
    });

    it('should use generic reconstruction for unknown aggregate types', async () => {
      const customEvent = {
        ...mockDomainEvent,
        aggregateType: 'CustomAggregate',
        eventType: 'CUSTOM_EVENT',
        payload: { customField: 'customValue' },
      };
      prisma.domainEvent.findMany.mockResolvedValue([customEvent] as unknown as never);

      const result = await service.reconstructState('CustomAggregate', 'custom-1');
      const state = result.state as Record<string, unknown>;

      expect(result.exists).toBe(true);
      expect(state.customField).toBe('customValue');
      expect(state.lastEventType).toBe('CUSTOM_EVENT');
    });

    it('should include lastEventAt in result', async () => {
      prisma.domainEvent.findMany.mockResolvedValue([
        mockDomainEvent,
        mockSubmittedEvent,
      ] as unknown as never);

      const result = await service.reconstructState('Application', 'app-1');

      expect(result.lastEventAt).toEqual(mockSubmittedEvent.createdAt);
    });
  });

  // =========================================================================
  // Application-specific event handling
  // =========================================================================

  describe('Application event handling', () => {
    it('should handle DOCUMENT_UPLOADED event', async () => {
      const documentEvent = {
        ...mockDomainEvent,
        eventType: ApplicationEventType.DOCUMENT_UPLOADED,
        eventVersion: 2,
        payload: { documentType: 'GST_CERTIFICATE', fileName: 'gst.pdf' },
      };
      prisma.domainEvent.findMany.mockResolvedValue([
        mockDomainEvent,
        documentEvent,
      ] as unknown as never);

      const result = await service.reconstructState('Application', 'app-1');
      const state = result.state as Record<string, unknown>;
      const documents = state.documents as Array<Record<string, unknown>>;

      expect(documents).toHaveLength(1);
      expect(documents[0].documentType).toBe('GST_CERTIFICATE');
      expect(documents[0].fileName).toBe('gst.pdf');
      expect(documents[0].isVerified).toBe(false);
    });

    it('should handle DOCUMENT_VERIFIED event', async () => {
      const documentUploadEvent = {
        ...mockDomainEvent,
        eventType: ApplicationEventType.DOCUMENT_UPLOADED,
        eventVersion: 2,
        payload: { documentType: 'GST_CERTIFICATE', fileName: 'gst.pdf' },
      };
      const documentVerifyEvent = {
        ...mockDomainEvent,
        id: 'event-3',
        eventType: ApplicationEventType.DOCUMENT_VERIFIED,
        eventVersion: 3,
        payload: { documentType: 'GST_CERTIFICATE', verifiedBy: 'officer-1' },
      };
      prisma.domainEvent.findMany.mockResolvedValue([
        mockDomainEvent,
        documentUploadEvent,
        documentVerifyEvent,
      ] as unknown as never);

      const result = await service.reconstructState('Application', 'app-1');
      const state = result.state as Record<string, unknown>;
      const documents = state.documents as Array<Record<string, unknown>>;

      expect(documents[0].isVerified).toBe(true);
      expect(documents[0].verifiedBy).toBe('officer-1');
    });

    it('should handle PAYMENT_RECEIVED event', async () => {
      const paymentEvent = {
        ...mockDomainEvent,
        eventType: ApplicationEventType.PAYMENT_RECEIVED,
        eventVersion: 2,
        payload: { paymentType: 'APPLICATION_FEE', amount: 25000, transactionId: 'txn-123' },
      };
      prisma.domainEvent.findMany.mockResolvedValue([
        mockDomainEvent,
        paymentEvent,
      ] as unknown as never);

      const result = await service.reconstructState('Application', 'app-1');
      const state = result.state as Record<string, unknown>;
      const payments = state.payments as Array<Record<string, unknown>>;

      expect(payments).toHaveLength(1);
      expect(payments[0].paymentType).toBe('APPLICATION_FEE');
      expect(payments[0].amount).toBe(25000);
      expect(payments[0].transactionId).toBe('txn-123');
    });

    it('should handle QUERY_RAISED and QUERY_RESPONDED events', async () => {
      const queryRaisedEvent = {
        ...mockDomainEvent,
        eventType: ApplicationEventType.QUERY_RAISED,
        eventVersion: 2,
        payload: { queryId: 'query-1', subject: 'Missing document', raisedBy: 'officer-1' },
      };
      const queryRespondedEvent = {
        ...mockDomainEvent,
        id: 'event-3',
        eventType: ApplicationEventType.QUERY_RESPONDED,
        eventVersion: 3,
        payload: { queryId: 'query-1', response: 'Document uploaded' },
      };
      prisma.domainEvent.findMany.mockResolvedValue([
        mockDomainEvent,
        queryRaisedEvent,
        queryRespondedEvent,
      ] as unknown as never);

      const result = await service.reconstructState('Application', 'app-1');
      const state = result.state as Record<string, unknown>;
      const queries = state.queries as Array<Record<string, unknown>>;

      expect(queries).toHaveLength(1);
      expect(queries[0].status).toBe('RESPONDED');
      expect(queries[0].respondedAt).toBeDefined();
    });

    it('should handle FIELD_VERIFICATION_SCHEDULED and FIELD_VERIFICATION_COMPLETED events', async () => {
      const scheduledEvent = {
        ...mockDomainEvent,
        eventType: ApplicationEventType.FIELD_VERIFICATION_SCHEDULED,
        eventVersion: 2,
        payload: { scheduledDate: '2025-07-01T10:00:00Z', verifierId: 'verifier-1' },
      };
      const completedEvent = {
        ...mockDomainEvent,
        id: 'event-3',
        eventType: ApplicationEventType.FIELD_VERIFICATION_COMPLETED,
        eventVersion: 3,
        payload: { result: 'PASS', observations: 'All equipment operational' },
      };
      prisma.domainEvent.findMany.mockResolvedValue([
        mockDomainEvent,
        scheduledEvent,
        completedEvent,
      ] as unknown as never);

      const result = await service.reconstructState('Application', 'app-1');
      const state = result.state as Record<string, unknown>;
      const fieldVerification = state.fieldVerification as Record<string, unknown>;

      expect(fieldVerification).toBeDefined();
      expect(fieldVerification.verifierId).toBe('verifier-1');
      expect(fieldVerification.result).toBe('PASS');
      expect(fieldVerification.observations).toBe('All equipment operational');
    });

    it('should handle APPROVED event', async () => {
      const approvedEvent = {
        ...mockDomainEvent,
        eventType: ApplicationEventType.APPROVED,
        eventVersion: 2,
        payload: { approvedBy: 'admin-1', certificateNumber: 'CERT-001' },
      };
      prisma.domainEvent.findMany.mockResolvedValue([
        mockDomainEvent,
        approvedEvent,
      ] as unknown as never);

      const result = await service.reconstructState('Application', 'app-1');
      const state = result.state as Record<string, unknown>;

      expect(state.status).toBe('APPROVED');
      expect(state.approvedAt).toBeDefined();
    });

    it('should handle REJECTED event', async () => {
      const rejectedEvent = {
        ...mockDomainEvent,
        eventType: ApplicationEventType.REJECTED,
        eventVersion: 2,
        payload: { reason: 'Insufficient documentation' },
      };
      prisma.domainEvent.findMany.mockResolvedValue([
        mockDomainEvent,
        rejectedEvent,
      ] as unknown as never);

      const result = await service.reconstructState('Application', 'app-1');
      const state = result.state as Record<string, unknown>;

      expect(state.status).toBe('REJECTED');
      expect(state.rejectedAt).toBeDefined();
      expect(state.rejectionReason).toBe('Insufficient documentation');
    });
  });
});
