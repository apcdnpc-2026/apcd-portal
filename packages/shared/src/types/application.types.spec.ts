import {
  ApplicationStatus,
  STATUS_TRANSITIONS,
  STATUS_LABELS,
  STATUS_COLORS,
  APPLICATION_STEPS,
  TOTAL_STEPS,
} from './application.types';

describe('ApplicationStatus enum', () => {
  it('should have 18 status values', () => {
    const statuses = Object.values(ApplicationStatus);
    expect(statuses).toHaveLength(18);
  });

  it('should contain all expected statuses', () => {
    expect(ApplicationStatus.DRAFT).toBe('DRAFT');
    expect(ApplicationStatus.SUBMITTED).toBe('SUBMITTED');
    expect(ApplicationStatus.UNDER_REVIEW).toBe('UNDER_REVIEW');
    expect(ApplicationStatus.QUERIED).toBe('QUERIED');
    expect(ApplicationStatus.RESUBMITTED).toBe('RESUBMITTED');
    expect(ApplicationStatus.COMMITTEE_REVIEW).toBe('COMMITTEE_REVIEW');
    expect(ApplicationStatus.COMMITTEE_QUERIED).toBe('COMMITTEE_QUERIED');
    expect(ApplicationStatus.FIELD_VERIFICATION).toBe('FIELD_VERIFICATION');
    expect(ApplicationStatus.LAB_TESTING).toBe('LAB_TESTING');
    expect(ApplicationStatus.FINAL_REVIEW).toBe('FINAL_REVIEW');
    expect(ApplicationStatus.APPROVED).toBe('APPROVED');
    expect(ApplicationStatus.PROVISIONALLY_APPROVED).toBe('PROVISIONALLY_APPROVED');
    expect(ApplicationStatus.REJECTED).toBe('REJECTED');
    expect(ApplicationStatus.WITHDRAWN).toBe('WITHDRAWN');
    expect(ApplicationStatus.RENEWAL_PENDING).toBe('RENEWAL_PENDING');
    expect(ApplicationStatus.EXPIRED).toBe('EXPIRED');
    expect(ApplicationStatus.SUSPENDED).toBe('SUSPENDED');
    expect(ApplicationStatus.BLACKLISTED).toBe('BLACKLISTED');
  });
});

describe('STATUS_TRANSITIONS', () => {
  it('should define transitions for every ApplicationStatus', () => {
    const allStatuses = Object.values(ApplicationStatus);
    for (const status of allStatuses) {
      expect(STATUS_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(STATUS_TRANSITIONS[status])).toBe(true);
    }
  });

  it('DRAFT can transition to SUBMITTED or WITHDRAWN', () => {
    expect(STATUS_TRANSITIONS[ApplicationStatus.DRAFT]).toEqual([
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.WITHDRAWN,
    ]);
  });

  it('SUBMITTED can only transition to UNDER_REVIEW', () => {
    expect(STATUS_TRANSITIONS[ApplicationStatus.SUBMITTED]).toEqual([
      ApplicationStatus.UNDER_REVIEW,
    ]);
  });

  it('UNDER_REVIEW can transition to QUERIED, COMMITTEE_REVIEW, or REJECTED', () => {
    expect(STATUS_TRANSITIONS[ApplicationStatus.UNDER_REVIEW]).toEqual([
      ApplicationStatus.QUERIED,
      ApplicationStatus.COMMITTEE_REVIEW,
      ApplicationStatus.REJECTED,
    ]);
  });

  it('QUERIED can transition to RESUBMITTED or WITHDRAWN', () => {
    expect(STATUS_TRANSITIONS[ApplicationStatus.QUERIED]).toEqual([
      ApplicationStatus.RESUBMITTED,
      ApplicationStatus.WITHDRAWN,
    ]);
  });

  it('COMMITTEE_REVIEW can transition to 4 statuses', () => {
    const transitions = STATUS_TRANSITIONS[ApplicationStatus.COMMITTEE_REVIEW];
    expect(transitions).toHaveLength(4);
    expect(transitions).toContain(ApplicationStatus.COMMITTEE_QUERIED);
    expect(transitions).toContain(ApplicationStatus.FIELD_VERIFICATION);
    expect(transitions).toContain(ApplicationStatus.APPROVED);
    expect(transitions).toContain(ApplicationStatus.REJECTED);
  });

  it('FINAL_REVIEW can transition to APPROVED, PROVISIONALLY_APPROVED, or REJECTED', () => {
    expect(STATUS_TRANSITIONS[ApplicationStatus.FINAL_REVIEW]).toEqual([
      ApplicationStatus.APPROVED,
      ApplicationStatus.PROVISIONALLY_APPROVED,
      ApplicationStatus.REJECTED,
    ]);
  });

  it('REJECTED is a terminal state (no transitions)', () => {
    expect(STATUS_TRANSITIONS[ApplicationStatus.REJECTED]).toEqual([]);
  });

  it('WITHDRAWN is a terminal state (no transitions)', () => {
    expect(STATUS_TRANSITIONS[ApplicationStatus.WITHDRAWN]).toEqual([]);
  });

  it('BLACKLISTED is a terminal state (no transitions)', () => {
    expect(STATUS_TRANSITIONS[ApplicationStatus.BLACKLISTED]).toEqual([]);
  });

  it('APPROVED can transition to RENEWAL_PENDING, EXPIRED, SUSPENDED, BLACKLISTED', () => {
    expect(STATUS_TRANSITIONS[ApplicationStatus.APPROVED]).toEqual([
      ApplicationStatus.RENEWAL_PENDING,
      ApplicationStatus.EXPIRED,
      ApplicationStatus.SUSPENDED,
      ApplicationStatus.BLACKLISTED,
    ]);
  });

  it('EXPIRED can transition back to RENEWAL_PENDING', () => {
    expect(STATUS_TRANSITIONS[ApplicationStatus.EXPIRED]).toEqual([
      ApplicationStatus.RENEWAL_PENDING,
    ]);
  });

  it('SUSPENDED can transition to APPROVED or BLACKLISTED', () => {
    expect(STATUS_TRANSITIONS[ApplicationStatus.SUSPENDED]).toEqual([
      ApplicationStatus.APPROVED,
      ApplicationStatus.BLACKLISTED,
    ]);
  });

  it('all transition targets are valid ApplicationStatus values', () => {
    const allStatuses = new Set(Object.values(ApplicationStatus));
    for (const [, transitions] of Object.entries(STATUS_TRANSITIONS)) {
      for (const target of transitions) {
        expect(allStatuses.has(target)).toBe(true);
      }
    }
  });
});

describe('STATUS_LABELS', () => {
  it('should have a label for every ApplicationStatus', () => {
    const allStatuses = Object.values(ApplicationStatus);
    for (const status of allStatuses) {
      expect(STATUS_LABELS[status]).toBeDefined();
      expect(typeof STATUS_LABELS[status]).toBe('string');
      expect(STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it('should have human-readable labels', () => {
    expect(STATUS_LABELS[ApplicationStatus.DRAFT]).toBe('Draft');
    expect(STATUS_LABELS[ApplicationStatus.UNDER_REVIEW]).toBe('Under Review');
    expect(STATUS_LABELS[ApplicationStatus.QUERIED]).toBe('Query Raised');
    expect(STATUS_LABELS[ApplicationStatus.APPROVED]).toBe('Approved');
    expect(STATUS_LABELS[ApplicationStatus.REJECTED]).toBe('Rejected');
  });
});

describe('STATUS_COLORS', () => {
  it('should have a color for every ApplicationStatus', () => {
    const allStatuses = Object.values(ApplicationStatus);
    for (const status of allStatuses) {
      expect(STATUS_COLORS[status]).toBeDefined();
      expect(typeof STATUS_COLORS[status]).toBe('string');
    }
  });

  it('should use green for APPROVED', () => {
    expect(STATUS_COLORS[ApplicationStatus.APPROVED]).toBe('green');
  });

  it('should use red for REJECTED', () => {
    expect(STATUS_COLORS[ApplicationStatus.REJECTED]).toBe('red');
  });

  it('should use gray for DRAFT', () => {
    expect(STATUS_COLORS[ApplicationStatus.DRAFT]).toBe('gray');
  });

  it('should use orange for QUERIED states', () => {
    expect(STATUS_COLORS[ApplicationStatus.QUERIED]).toBe('orange');
    expect(STATUS_COLORS[ApplicationStatus.COMMITTEE_QUERIED]).toBe('orange');
  });
});

describe('APPLICATION_STEPS', () => {
  it('should have exactly 9 steps', () => {
    expect(APPLICATION_STEPS).toHaveLength(9);
  });

  it('TOTAL_STEPS should equal 9', () => {
    expect(TOTAL_STEPS).toBe(9);
  });

  it('should have step numbers from 1 to 9', () => {
    for (let i = 0; i < APPLICATION_STEPS.length; i++) {
      expect(APPLICATION_STEPS[i].step).toBe(i + 1);
    }
  });

  it('every step should have label and description', () => {
    for (const step of APPLICATION_STEPS) {
      expect(step.label).toBeDefined();
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.description).toBeDefined();
      expect(step.description.length).toBeGreaterThan(0);
    }
  });

  it('step 1 should be Applicant Details', () => {
    expect(APPLICATION_STEPS[0].label).toBe('Applicant Details');
  });

  it('step 9 should be Declaration & Submit', () => {
    expect(APPLICATION_STEPS[8].label).toBe('Declaration & Submit');
  });

  it('step 8 should be Payment', () => {
    expect(APPLICATION_STEPS[7].label).toBe('Payment');
  });

  it('step 7 should be Documents', () => {
    expect(APPLICATION_STEPS[6].label).toBe('Documents');
  });
});
