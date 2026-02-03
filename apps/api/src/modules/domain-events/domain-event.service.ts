import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';

import { ApplicationEventsHandler } from './event-handlers/application-events.handler';

/**
 * Event types for Application aggregate
 */
export enum ApplicationEventType {
  APPLICATION_CREATED = 'APPLICATION_CREATED',
  APPLICATION_SUBMITTED = 'APPLICATION_SUBMITTED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
  DOCUMENT_VERIFIED = 'DOCUMENT_VERIFIED',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  QUERY_RAISED = 'QUERY_RAISED',
  QUERY_RESPONDED = 'QUERY_RESPONDED',
  FIELD_VERIFICATION_SCHEDULED = 'FIELD_VERIFICATION_SCHEDULED',
  FIELD_VERIFICATION_COMPLETED = 'FIELD_VERIFICATION_COMPLETED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export interface DomainEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  userId?: string;
  correlationId?: string;
}

export interface DomainEventRecord {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

@Injectable()
export class DomainEventService {
  private readonly logger = new Logger(DomainEventService.name);
  private readonly applicationEventsHandler = new ApplicationEventsHandler();

  constructor(private prisma: PrismaService) {}

  /**
   * Emit a domain event for an aggregate.
   * Auto-increments version for the aggregate.
   */
  async emit(event: DomainEventInput): Promise<DomainEventRecord> {
    const { aggregateType, aggregateId, eventType, eventData, userId, correlationId } = event;

    // Get the current max version for this aggregate
    const lastEvent = await this.prisma.domainEvent.findFirst({
      where: {
        aggregateType,
        aggregateId,
      },
      orderBy: {
        eventVersion: 'desc',
      },
      select: {
        eventVersion: true,
      },
    });

    const nextVersion = (lastEvent?.eventVersion ?? 0) + 1;

    const metadata: Record<string, unknown> = {};
    if (userId) {
      metadata.userId = userId;
    }
    if (correlationId) {
      metadata.correlationId = correlationId;
    }

    const createdEvent = await this.prisma.domainEvent.create({
      data: {
        aggregateType,
        aggregateId,
        eventType,
        eventVersion: nextVersion,
        payload: eventData,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      },
    });

    this.logger.log(
      `Domain event emitted: ${eventType} for ${aggregateType}:${aggregateId} (v${nextVersion})`,
    );

    return {
      id: createdEvent.id,
      aggregateType: createdEvent.aggregateType,
      aggregateId: createdEvent.aggregateId,
      eventType: createdEvent.eventType,
      eventVersion: createdEvent.eventVersion,
      payload: createdEvent.payload as Record<string, unknown>,
      metadata: createdEvent.metadata as Record<string, unknown> | null,
      createdAt: createdEvent.createdAt,
    };
  }

  /**
   * Get all events for an aggregate in version order.
   */
  async getEvents(aggregateType: string, aggregateId: string): Promise<DomainEventRecord[]> {
    const events = await this.prisma.domainEvent.findMany({
      where: {
        aggregateType,
        aggregateId,
      },
      orderBy: {
        eventVersion: 'asc',
      },
    });

    return events.map((event) => ({
      id: event.id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      payload: event.payload as Record<string, unknown>,
      metadata: event.metadata as Record<string, unknown> | null,
      createdAt: event.createdAt,
    }));
  }

  /**
   * Get all events in a correlation chain.
   */
  async getEventsByCorrelation(correlationId: string): Promise<DomainEventRecord[]> {
    const events = await this.prisma.domainEvent.findMany({
      where: {
        metadata: {
          path: ['correlationId'],
          equals: correlationId,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return events.map((event) => ({
      id: event.id,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
      payload: event.payload as Record<string, unknown>,
      metadata: event.metadata as Record<string, unknown> | null,
      createdAt: event.createdAt,
    }));
  }

  /**
   * Reconstruct the current state of an aggregate by applying all events in order.
   */
  async reconstructState(
    aggregateType: string,
    aggregateId: string,
  ): Promise<Record<string, unknown>> {
    const events = await this.getEvents(aggregateType, aggregateId);

    if (events.length === 0) {
      return {
        aggregateType,
        aggregateId,
        exists: false,
        state: null,
        version: 0,
        eventCount: 0,
      };
    }

    let state: Record<string, unknown>;

    switch (aggregateType) {
      case 'Application':
        state = this.applicationEventsHandler.reconstructApplication(events);
        break;
      default:
        // Generic reconstruction - just merge all event payloads
        state = this.genericReconstruct(events);
        break;
    }

    return {
      aggregateType,
      aggregateId,
      exists: true,
      state,
      version: events[events.length - 1].eventVersion,
      eventCount: events.length,
      lastEventAt: events[events.length - 1].createdAt,
    };
  }

  /**
   * Generic reconstruction by merging event payloads.
   */
  private genericReconstruct(events: DomainEventRecord[]): Record<string, unknown> {
    let state: Record<string, unknown> = {};

    for (const event of events) {
      state = {
        ...state,
        ...event.payload,
        lastEventType: event.eventType,
        lastEventAt: event.createdAt,
      };
    }

    return state;
  }
}
