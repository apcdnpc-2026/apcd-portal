import {
  ApplicationStatus,
  STATUS_TRANSITIONS,
  STATUS_LABELS,
  STATUS_COLORS,
  APPLICATION_STEPS,
  TOTAL_STEPS,
} from './application.types';

// ---------------------------------------------------------------------------
// ApplicationStatus enum
// ---------------------------------------------------------------------------

describe('ApplicationStatus enum', () => {
  const allStatuses = Object.values(ApplicationStatus);

  it('should have exactly 18 status values', () => {
    expect(allStatuses).toHaveLength(18);
  });

  it('should have string values equal to their keys', () => {
    // TypeScript string enums: the value should match the key
    for (const [key, value] of Object.entries(ApplicationStatus)) {
      expect(key).toBe(value);
    }
  });

  it('should contain all expected statuses', () => {
    const expected = [
      'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'QUERIED', 'RESUBMITTED',
      'COMMITTEE_REVIEW', 'COMMITTEE_QUERIED', 'FIELD_VERIFICATION',
      'LAB_TESTING', 'FINAL_REVIEW', 'APPROVED', 'PROVISIONALLY_APPROVED',
      'REJECTED', 'WITHDRAWN', 'RENEWAL_PENDING', 'EXPIRED',
      'SUSPENDED', 'BLACKLISTED',
    ];
    for (const status of expected) {
      expect(allStatuses).toContain(status);
    }
  });
});

// ---------------------------------------------------------------------------
// STATUS_TRANSITIONS
// ---------------------------------------------------------------------------

describe('STATUS_TRANSITIONS', () => {
  const allStatuses = Object.values(ApplicationStatus);

  it('should define transitions for every ApplicationStatus', () => {
    for (const status of allStatuses) {
      expect(STATUS_TRANSITIONS).toHaveProperty(status);
      expect(Array.isArray(STATUS_TRANSITIONS[status])).toBe(true);
    }
  });

  it('all transition targets should be valid ApplicationStatus values', () => {
    const statusSet = new Set(allStatuses);
    for (const [, transitions] of Object.entries(STATUS_TRANSITIONS)) {
      for (const target of transitions) {
        expect(statusSet.has(target)).toBe(true);
      }
    }
  });

  // -- Specific transition rules --------------------------------------------

  describe('DRAFT', () => {
    it('can transition to SUBMITTED or WITHDRAWN', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.DRAFT]).toEqual([
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.WITHDRAWN,
      ]);
    });
  });

  describe('SUBMITTED', () => {
    it('can only transition to UNDER_REVIEW', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.SUBMITTED]).toEqual([
        ApplicationStatus.UNDER_REVIEW,
      ]);
    });
  });

  describe('UNDER_REVIEW', () => {
    it('can transition to QUERIED, COMMITTEE_REVIEW, or REJECTED', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.UNDER_REVIEW]).toEqual([
        ApplicationStatus.QUERIED,
        ApplicationStatus.COMMITTEE_REVIEW,
        ApplicationStatus.REJECTED,
      ]);
    });
  });

  describe('QUERIED', () => {
    it('can transition to RESUBMITTED or WITHDRAWN', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.QUERIED]).toEqual([
        ApplicationStatus.RESUBMITTED,
        ApplicationStatus.WITHDRAWN,
      ]);
    });
  });

  describe('RESUBMITTED', () => {
    it('can only transition to UNDER_REVIEW', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.RESUBMITTED]).toEqual([
        ApplicationStatus.UNDER_REVIEW,
      ]);
    });
  });

  describe('COMMITTEE_REVIEW', () => {
    it('can transition to 4 statuses', () => {
      const transitions = STATUS_TRANSITIONS[ApplicationStatus.COMMITTEE_REVIEW];
      expect(transitions).toHaveLength(4);
      expect(transitions).toContain(ApplicationStatus.COMMITTEE_QUERIED);
      expect(transitions).toContain(ApplicationStatus.FIELD_VERIFICATION);
      expect(transitions).toContain(ApplicationStatus.APPROVED);
      expect(transitions).toContain(ApplicationStatus.REJECTED);
    });
  });

  describe('COMMITTEE_QUERIED', () => {
    it('can only transition back to COMMITTEE_REVIEW', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.COMMITTEE_QUERIED]).toEqual([
        ApplicationStatus.COMMITTEE_REVIEW,
      ]);
    });
  });

  describe('FIELD_VERIFICATION', () => {
    it('can transition to LAB_TESTING or FINAL_REVIEW', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.FIELD_VERIFICATION]).toEqual([
        ApplicationStatus.LAB_TESTING,
        ApplicationStatus.FINAL_REVIEW,
      ]);
    });
  });

  describe('LAB_TESTING', () => {
    it('can only transition to FINAL_REVIEW', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.LAB_TESTING]).toEqual([
        ApplicationStatus.FINAL_REVIEW,
      ]);
    });
  });

  describe('FINAL_REVIEW', () => {
    it('can transition to APPROVED, PROVISIONALLY_APPROVED, or REJECTED', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.FINAL_REVIEW]).toEqual([
        ApplicationStatus.APPROVED,
        ApplicationStatus.PROVISIONALLY_APPROVED,
        ApplicationStatus.REJECTED,
      ]);
    });
  });

  describe('APPROVED', () => {
    it('can transition to RENEWAL_PENDING, EXPIRED, SUSPENDED, BLACKLISTED', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.APPROVED]).toEqual([
        ApplicationStatus.RENEWAL_PENDING,
        ApplicationStatus.EXPIRED,
        ApplicationStatus.SUSPENDED,
        ApplicationStatus.BLACKLISTED,
      ]);
    });
  });

  describe('PROVISIONALLY_APPROVED', () => {
    it('can transition to APPROVED, REJECTED, or SUSPENDED', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.PROVISIONALLY_APPROVED]).toEqual([
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.SUSPENDED,
      ]);
    });
  });

  describe('RENEWAL_PENDING', () => {
    it('can transition to APPROVED or EXPIRED', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.RENEWAL_PENDING]).toEqual([
        ApplicationStatus.APPROVED,
        ApplicationStatus.EXPIRED,
      ]);
    });
  });

  describe('EXPIRED', () => {
    it('can transition back to RENEWAL_PENDING', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.EXPIRED]).toEqual([
        ApplicationStatus.RENEWAL_PENDING,
      ]);
    });
  });

  describe('SUSPENDED', () => {
    it('can transition to APPROVED or BLACKLISTED', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.SUSPENDED]).toEqual([
        ApplicationStatus.APPROVED,
        ApplicationStatus.BLACKLISTED,
      ]);
    });
  });

  // -- Terminal states (no outgoing transitions) ----------------------------

  describe('terminal states', () => {
    it('REJECTED has no transitions', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.REJECTED]).toEqual([]);
    });

    it('WITHDRAWN has no transitions', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.WITHDRAWN]).toEqual([]);
    });

    it('BLACKLISTED has no transitions', () => {
      expect(STATUS_TRANSITIONS[ApplicationStatus.BLACKLISTED]).toEqual([]);
    });

    it('should have exactly 3 terminal states', () => {
      const terminalStates = allStatuses.filter(
        (s) => STATUS_TRANSITIONS[s].length === 0,
      );
      expect(terminalStates).toHaveLength(3);
      expect(terminalStates).toContain(ApplicationStatus.REJECTED);
      expect(terminalStates).toContain(ApplicationStatus.WITHDRAWN);
      expect(terminalStates).toContain(ApplicationStatus.BLACKLISTED);
    });
  });

  // -- No self-transitions --------------------------------------------------

  describe('no self-transitions', () => {
    it('no status should transition to itself', () => {
      for (const status of allStatuses) {
        expect(STATUS_TRANSITIONS[status]).not.toContain(status);
      }
    });
  });

  // -- Reachability from DRAFT (basic check) --------------------------------

  describe('reachability', () => {
    it('APPROVED should be reachable from DRAFT (via any path)', () => {
      // BFS from DRAFT
      const visited = new Set<ApplicationStatus>();
      const queue: ApplicationStatus[] = [ApplicationStatus.DRAFT];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const next of STATUS_TRANSITIONS[current]) {
          if (!visited.has(next)) queue.push(next);
        }
      }
      expect(visited.has(ApplicationStatus.APPROVED)).toBe(true);
    });

    it('REJECTED should be reachable from DRAFT', () => {
      const visited = new Set<ApplicationStatus>();
      const queue: ApplicationStatus[] = [ApplicationStatus.DRAFT];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const next of STATUS_TRANSITIONS[current]) {
          if (!visited.has(next)) queue.push(next);
        }
      }
      expect(visited.has(ApplicationStatus.REJECTED)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// STATUS_LABELS
// ---------------------------------------------------------------------------

describe('STATUS_LABELS', () => {
  const allStatuses = Object.values(ApplicationStatus);

  it('should have a label for every ApplicationStatus', () => {
    for (const status of allStatuses) {
      expect(STATUS_LABELS[status]).toBeDefined();
      expect(typeof STATUS_LABELS[status]).toBe('string');
      expect(STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  it('should have human-readable labels (not identical to enum keys)', () => {
    // At least some should differ from enum values (e.g. "Under Review" vs "UNDER_REVIEW")
    expect(STATUS_LABELS[ApplicationStatus.UNDER_REVIEW]).toBe('Under Review');
    expect(STATUS_LABELS[ApplicationStatus.QUERIED]).toBe('Query Raised');
    expect(STATUS_LABELS[ApplicationStatus.PROVISIONALLY_APPROVED]).toBe('Provisionally Approved');
  });

  it('specific label values', () => {
    expect(STATUS_LABELS[ApplicationStatus.DRAFT]).toBe('Draft');
    expect(STATUS_LABELS[ApplicationStatus.SUBMITTED]).toBe('Submitted');
    expect(STATUS_LABELS[ApplicationStatus.APPROVED]).toBe('Approved');
    expect(STATUS_LABELS[ApplicationStatus.REJECTED]).toBe('Rejected');
    expect(STATUS_LABELS[ApplicationStatus.WITHDRAWN]).toBe('Withdrawn');
    expect(STATUS_LABELS[ApplicationStatus.COMMITTEE_REVIEW]).toBe('Committee Review');
    expect(STATUS_LABELS[ApplicationStatus.COMMITTEE_QUERIED]).toBe('Committee Query');
    expect(STATUS_LABELS[ApplicationStatus.FIELD_VERIFICATION]).toBe('Field Verification');
    expect(STATUS_LABELS[ApplicationStatus.LAB_TESTING]).toBe('Lab Testing');
    expect(STATUS_LABELS[ApplicationStatus.FINAL_REVIEW]).toBe('Final Review');
    expect(STATUS_LABELS[ApplicationStatus.RENEWAL_PENDING]).toBe('Renewal Pending');
    expect(STATUS_LABELS[ApplicationStatus.EXPIRED]).toBe('Expired');
    expect(STATUS_LABELS[ApplicationStatus.SUSPENDED]).toBe('Suspended');
    expect(STATUS_LABELS[ApplicationStatus.BLACKLISTED]).toBe('Blacklisted');
    expect(STATUS_LABELS[ApplicationStatus.RESUBMITTED]).toBe('Resubmitted');
  });
});

// ---------------------------------------------------------------------------
// STATUS_COLORS
// ---------------------------------------------------------------------------

describe('STATUS_COLORS', () => {
  const allStatuses = Object.values(ApplicationStatus);

  it('should have a color for every ApplicationStatus', () => {
    for (const status of allStatuses) {
      expect(STATUS_COLORS[status]).toBeDefined();
      expect(typeof STATUS_COLORS[status]).toBe('string');
      expect(STATUS_COLORS[status].length).toBeGreaterThan(0);
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

  it('should use orange for QUERIED and COMMITTEE_QUERIED', () => {
    expect(STATUS_COLORS[ApplicationStatus.QUERIED]).toBe('orange');
    expect(STATUS_COLORS[ApplicationStatus.COMMITTEE_QUERIED]).toBe('orange');
  });

  it('should use blue for SUBMITTED', () => {
    expect(STATUS_COLORS[ApplicationStatus.SUBMITTED]).toBe('blue');
  });

  it('should use red for negative terminal/serious states', () => {
    expect(STATUS_COLORS[ApplicationStatus.EXPIRED]).toBe('red');
    expect(STATUS_COLORS[ApplicationStatus.SUSPENDED]).toBe('red');
    expect(STATUS_COLORS[ApplicationStatus.BLACKLISTED]).toBe('red');
  });

  it('should use gray for WITHDRAWN', () => {
    expect(STATUS_COLORS[ApplicationStatus.WITHDRAWN]).toBe('gray');
  });
});

// ---------------------------------------------------------------------------
// APPLICATION_STEPS
// ---------------------------------------------------------------------------

describe('APPLICATION_STEPS', () => {
  it('should have exactly 9 steps', () => {
    expect(APPLICATION_STEPS).toHaveLength(9);
  });

  it('TOTAL_STEPS should equal 9', () => {
    expect(TOTAL_STEPS).toBe(9);
  });

  it('TOTAL_STEPS should match APPLICATION_STEPS.length', () => {
    expect(TOTAL_STEPS).toBe(APPLICATION_STEPS.length);
  });

  it('should have sequential step numbers from 1 to 9', () => {
    for (let i = 0; i < APPLICATION_STEPS.length; i++) {
      expect(APPLICATION_STEPS[i].step).toBe(i + 1);
    }
  });

  it('every step should have a non-empty label', () => {
    for (const step of APPLICATION_STEPS) {
      expect(step.label).toBeDefined();
      expect(step.label.length).toBeGreaterThan(0);
    }
  });

  it('every step should have a non-empty description', () => {
    for (const step of APPLICATION_STEPS) {
      expect(step.description).toBeDefined();
      expect(step.description.length).toBeGreaterThan(0);
    }
  });

  // -- Specific step labels -------------------------------------------------

  it('step 1 should be "Applicant Details"', () => {
    expect(APPLICATION_STEPS[0].label).toBe('Applicant Details');
  });

  it('step 2 should be "Contact Persons"', () => {
    expect(APPLICATION_STEPS[1].label).toBe('Contact Persons');
  });

  it('step 3 should be "Financials & Standards"', () => {
    expect(APPLICATION_STEPS[2].label).toBe('Financials & Standards');
  });

  it('step 4 should be "Compliance"', () => {
    expect(APPLICATION_STEPS[3].label).toBe('Compliance');
  });

  it('step 5 should be "APCD Selection"', () => {
    expect(APPLICATION_STEPS[4].label).toBe('APCD Selection');
  });

  it('step 6 should be "Quality & Feedback"', () => {
    expect(APPLICATION_STEPS[5].label).toBe('Quality & Feedback');
  });

  it('step 7 should be "Documents"', () => {
    expect(APPLICATION_STEPS[6].label).toBe('Documents');
  });

  it('step 8 should be "Payment"', () => {
    expect(APPLICATION_STEPS[7].label).toBe('Payment');
  });

  it('step 9 should be "Declaration & Submit"', () => {
    expect(APPLICATION_STEPS[8].label).toBe('Declaration & Submit');
  });

  // -- Step descriptions mention field numbers ------------------------------

  it('step 1 description should mention Fields 1-14', () => {
    expect(APPLICATION_STEPS[0].description).toContain('1-14');
  });

  it('step 2 description should mention Fields 15-16', () => {
    expect(APPLICATION_STEPS[1].description).toContain('15-16');
  });

  it('step 8 description should mention Field 25', () => {
    expect(APPLICATION_STEPS[7].description).toContain('25');
  });
});
