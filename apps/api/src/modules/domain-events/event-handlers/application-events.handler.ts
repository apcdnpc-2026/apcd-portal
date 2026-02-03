import { ApplicationEventType, DomainEventRecord } from '../domain-event.service';

/**
 * Represents the reconstructed state of an Application aggregate.
 */
export interface ApplicationState {
  id: string;
  status: string | null;
  currentStep: number;
  documents: DocumentRecord[];
  payments: PaymentRecord[];
  queries: QueryRecord[];
  fieldVerification: FieldVerificationRecord | null;
  timeline: TimelineEntry[];
  createdAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
}

interface DocumentRecord {
  documentType: string;
  fileName: string;
  uploadedAt: Date;
  isVerified: boolean;
  verifiedAt: Date | null;
  verifiedBy: string | null;
}

interface PaymentRecord {
  paymentType: string;
  amount: number;
  status: string;
  receivedAt: Date;
  transactionId: string | null;
}

interface QueryRecord {
  queryId: string;
  subject: string;
  raisedAt: Date;
  raisedBy: string;
  status: string;
  respondedAt: Date | null;
}

interface FieldVerificationRecord {
  scheduledDate: Date | null;
  verifierId: string | null;
  completedAt: Date | null;
  result: string | null;
  observations: string | null;
}

interface TimelineEntry {
  eventType: string;
  occurredAt: Date;
  description: string;
  metadata: Record<string, unknown>;
}

/**
 * Handler for Application aggregate events.
 * Provides methods to apply each event type to the application state.
 */
export class ApplicationEventsHandler {
  /**
   * Reconstruct an Application state from a sequence of events.
   */
  reconstructApplication(events: DomainEventRecord[]): ApplicationState {
    let state = this.createInitialState();

    for (const event of events) {
      state = this.applyEvent(state, event);
    }

    return state;
  }

  /**
   * Create the initial state for a new Application.
   */
  private createInitialState(): ApplicationState {
    return {
      id: '',
      status: null,
      currentStep: 1,
      documents: [],
      payments: [],
      queries: [],
      fieldVerification: null,
      timeline: [],
      createdAt: null,
      submittedAt: null,
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: null,
    };
  }

  /**
   * Apply a single event to the current state.
   */
  private applyEvent(state: ApplicationState, event: DomainEventRecord): ApplicationState {
    const eventType = event.eventType as ApplicationEventType;

    switch (eventType) {
      case ApplicationEventType.APPLICATION_CREATED:
        return this.applyApplicationCreated(state, event);
      case ApplicationEventType.APPLICATION_SUBMITTED:
        return this.applyApplicationSubmitted(state, event);
      case ApplicationEventType.STATUS_CHANGED:
        return this.applyStatusChanged(state, event);
      case ApplicationEventType.DOCUMENT_UPLOADED:
        return this.applyDocumentUploaded(state, event);
      case ApplicationEventType.DOCUMENT_VERIFIED:
        return this.applyDocumentVerified(state, event);
      case ApplicationEventType.PAYMENT_RECEIVED:
        return this.applyPaymentReceived(state, event);
      case ApplicationEventType.QUERY_RAISED:
        return this.applyQueryRaised(state, event);
      case ApplicationEventType.QUERY_RESPONDED:
        return this.applyQueryResponded(state, event);
      case ApplicationEventType.FIELD_VERIFICATION_SCHEDULED:
        return this.applyFieldVerificationScheduled(state, event);
      case ApplicationEventType.FIELD_VERIFICATION_COMPLETED:
        return this.applyFieldVerificationCompleted(state, event);
      case ApplicationEventType.APPROVED:
        return this.applyApproved(state, event);
      case ApplicationEventType.REJECTED:
        return this.applyRejected(state, event);
      default:
        // Unknown event type - add to timeline but don't modify state
        return this.addToTimeline(state, event, 'Unknown event type');
    }
  }

  /**
   * Apply APPLICATION_CREATED event.
   */
  applyApplicationCreated(state: ApplicationState, event: DomainEventRecord): ApplicationState {
    const payload = event.payload;
    return {
      ...state,
      id: event.aggregateId,
      status: 'DRAFT',
      currentStep: (payload.currentStep as number) || 1,
      createdAt: event.createdAt,
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: 'Application created',
          metadata: payload,
        },
      ],
    };
  }

  /**
   * Apply APPLICATION_SUBMITTED event.
   */
  applyApplicationSubmitted(state: ApplicationState, event: DomainEventRecord): ApplicationState {
    return {
      ...state,
      status: 'SUBMITTED',
      submittedAt: event.createdAt,
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: 'Application submitted for review',
          metadata: event.payload,
        },
      ],
    };
  }

  /**
   * Apply STATUS_CHANGED event.
   */
  applyStatusChanged(state: ApplicationState, event: DomainEventRecord): ApplicationState {
    const payload = event.payload;
    const newStatus = payload.newStatus as string;
    const oldStatus = payload.oldStatus as string;

    return {
      ...state,
      status: newStatus,
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: `Status changed from ${oldStatus} to ${newStatus}`,
          metadata: payload,
        },
      ],
    };
  }

  /**
   * Apply DOCUMENT_UPLOADED event.
   */
  applyDocumentUploaded(state: ApplicationState, event: DomainEventRecord): ApplicationState {
    const payload = event.payload;
    const newDocument: DocumentRecord = {
      documentType: payload.documentType as string,
      fileName: payload.fileName as string,
      uploadedAt: event.createdAt,
      isVerified: false,
      verifiedAt: null,
      verifiedBy: null,
    };

    return {
      ...state,
      documents: [...state.documents, newDocument],
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: `Document uploaded: ${payload.documentType}`,
          metadata: payload,
        },
      ],
    };
  }

  /**
   * Apply DOCUMENT_VERIFIED event.
   */
  applyDocumentVerified(state: ApplicationState, event: DomainEventRecord): ApplicationState {
    const payload = event.payload;
    const documentType = payload.documentType as string;

    const updatedDocuments = state.documents.map((doc) => {
      if (doc.documentType === documentType) {
        return {
          ...doc,
          isVerified: true,
          verifiedAt: event.createdAt,
          verifiedBy: payload.verifiedBy as string | null,
        };
      }
      return doc;
    });

    return {
      ...state,
      documents: updatedDocuments,
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: `Document verified: ${documentType}`,
          metadata: payload,
        },
      ],
    };
  }

  /**
   * Apply PAYMENT_RECEIVED event.
   */
  applyPaymentReceived(state: ApplicationState, event: DomainEventRecord): ApplicationState {
    const payload = event.payload;
    const newPayment: PaymentRecord = {
      paymentType: payload.paymentType as string,
      amount: payload.amount as number,
      status: 'COMPLETED',
      receivedAt: event.createdAt,
      transactionId: (payload.transactionId as string) || null,
    };

    return {
      ...state,
      payments: [...state.payments, newPayment],
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: `Payment received: ${payload.paymentType}`,
          metadata: payload,
        },
      ],
    };
  }

  /**
   * Apply QUERY_RAISED event.
   */
  applyQueryRaised(state: ApplicationState, event: DomainEventRecord): ApplicationState {
    const payload = event.payload;
    const newQuery: QueryRecord = {
      queryId: payload.queryId as string,
      subject: payload.subject as string,
      raisedAt: event.createdAt,
      raisedBy: payload.raisedBy as string,
      status: 'OPEN',
      respondedAt: null,
    };

    return {
      ...state,
      queries: [...state.queries, newQuery],
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: `Query raised: ${payload.subject}`,
          metadata: payload,
        },
      ],
    };
  }

  /**
   * Apply QUERY_RESPONDED event.
   */
  applyQueryResponded(state: ApplicationState, event: DomainEventRecord): ApplicationState {
    const payload = event.payload;
    const queryId = payload.queryId as string;

    const updatedQueries = state.queries.map((query) => {
      if (query.queryId === queryId) {
        return {
          ...query,
          status: 'RESPONDED',
          respondedAt: event.createdAt,
        };
      }
      return query;
    });

    return {
      ...state,
      queries: updatedQueries,
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: `Query responded: ${queryId}`,
          metadata: payload,
        },
      ],
    };
  }

  /**
   * Apply FIELD_VERIFICATION_SCHEDULED event.
   */
  applyFieldVerificationScheduled(
    state: ApplicationState,
    event: DomainEventRecord,
  ): ApplicationState {
    const payload = event.payload;

    return {
      ...state,
      fieldVerification: {
        scheduledDate: payload.scheduledDate
          ? new Date(payload.scheduledDate as string)
          : event.createdAt,
        verifierId: (payload.verifierId as string) || null,
        completedAt: null,
        result: null,
        observations: null,
      },
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: 'Field verification scheduled',
          metadata: payload,
        },
      ],
    };
  }

  /**
   * Apply FIELD_VERIFICATION_COMPLETED event.
   */
  applyFieldVerificationCompleted(
    state: ApplicationState,
    event: DomainEventRecord,
  ): ApplicationState {
    const payload = event.payload;

    return {
      ...state,
      fieldVerification: state.fieldVerification
        ? {
            ...state.fieldVerification,
            completedAt: event.createdAt,
            result: (payload.result as string) || null,
            observations: (payload.observations as string) || null,
          }
        : {
            scheduledDate: null,
            verifierId: null,
            completedAt: event.createdAt,
            result: (payload.result as string) || null,
            observations: (payload.observations as string) || null,
          },
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: `Field verification completed: ${payload.result || 'N/A'}`,
          metadata: payload,
        },
      ],
    };
  }

  /**
   * Apply APPROVED event.
   */
  applyApproved(state: ApplicationState, event: DomainEventRecord): ApplicationState {
    return {
      ...state,
      status: 'APPROVED',
      approvedAt: event.createdAt,
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: 'Application approved',
          metadata: event.payload,
        },
      ],
    };
  }

  /**
   * Apply REJECTED event.
   */
  applyRejected(state: ApplicationState, event: DomainEventRecord): ApplicationState {
    const payload = event.payload;

    return {
      ...state,
      status: 'REJECTED',
      rejectedAt: event.createdAt,
      rejectionReason: (payload.reason as string) || null,
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description: `Application rejected: ${payload.reason || 'No reason provided'}`,
          metadata: payload,
        },
      ],
    };
  }

  /**
   * Helper method to add unknown events to the timeline.
   */
  private addToTimeline(
    state: ApplicationState,
    event: DomainEventRecord,
    description: string,
  ): ApplicationState {
    return {
      ...state,
      timeline: [
        ...state.timeline,
        {
          eventType: event.eventType,
          occurredAt: event.createdAt,
          description,
          metadata: event.payload,
        },
      ],
    };
  }
}
