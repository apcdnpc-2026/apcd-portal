import { describe, it, expect } from 'vitest';

import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
  getStatusColor,
  getStatusLabel,
  truncate,
  getFileIcon,
  formatFileSize,
} from './utils';

// ---------------------------------------------------------------------------
// cn (className utility using clsx + tailwind-merge)
// ---------------------------------------------------------------------------
describe('cn', () => {
  it('merges multiple class names', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1');
  });

  it('deduplicates conflicting tailwind classes (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('handles conditional classes via boolean expressions', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('handles undefined and null inputs', () => {
    expect(cn('base', undefined, null, 'extra')).toBe('base extra');
  });

  it('handles empty string inputs', () => {
    expect(cn('base', '', 'extra')).toBe('base extra');
  });

  it('handles array inputs', () => {
    expect(cn(['px-2', 'py-1'])).toBe('px-2 py-1');
  });

  it('handles object inputs (truthy values)', () => {
    expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500');
  });

  it('merges conflicting tailwind variants correctly', () => {
    // tailwind-merge should resolve p-2 + px-4 -> keeping both since they don't fully conflict
    const result = cn('p-2', 'px-4');
    expect(result).toContain('px-4');
  });

  it('returns empty string when called with no arguments', () => {
    expect(cn()).toBe('');
  });

  it('handles deeply nested conditional classes', () => {
    const isActive = true;
    const isDisabled = false;
    const result = cn(
      'btn',
      isActive && 'btn-active',
      isDisabled && 'btn-disabled',
      { 'opacity-50': isDisabled },
    );
    expect(result).toBe('btn btn-active');
  });
});

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------
describe('formatCurrency', () => {
  it('formats a positive number as INR currency', () => {
    const result = formatCurrency(100000);
    // en-IN INR formatting: ₹1,00,000
    expect(result).toContain('1,00,000');
  });

  it('formats zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('formats negative numbers', () => {
    const result = formatCurrency(-5000);
    expect(result).toContain('5,000');
    // Should have a minus sign or be in parentheses
    expect(result).toMatch(/-|−/);
  });

  it('formats large numbers with Indian grouping', () => {
    const result = formatCurrency(10000000); // 1 crore
    // In en-IN: ₹1,00,00,000
    expect(result).toContain('1,00,00,000');
  });

  it('uses no fractional digits (maximumFractionDigits: 0)', () => {
    const result = formatCurrency(1234.56);
    // Should round and not show decimal places
    expect(result).not.toContain('.');
  });

  it('formats small numbers correctly', () => {
    const result = formatCurrency(1);
    expect(result).toContain('1');
  });

  it('includes the INR currency symbol', () => {
    const result = formatCurrency(100);
    // Could be ₹ or INR depending on locale implementation
    expect(result).toMatch(/₹|INR/);
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
  it('formats an ISO date string', () => {
    const result = formatDate('2024-03-15T00:00:00Z');
    expect(result).toMatch(/15.*Mar.*2024/);
  });

  it('accepts a Date object', () => {
    const result = formatDate(new Date(2025, 0, 1)); // Jan 1 2025
    expect(result).toMatch(/01.*Jan.*2025/);
  });

  it('formats a date-only ISO string', () => {
    const result = formatDate('2024-12-25');
    expect(result).toMatch(/25.*Dec.*2024/);
  });

  it('formats dates near year boundary correctly', () => {
    const result = formatDate('2024-01-01T00:00:00Z');
    expect(result).toMatch(/0?1.*Jan.*2024/);
  });

  it('handles Date object for end-of-year', () => {
    const result = formatDate(new Date(2024, 11, 31)); // Dec 31 2024
    expect(result).toMatch(/31.*Dec.*2024/);
  });

  it('throws or returns Invalid Date for invalid input', () => {
    expect(() => formatDate('not-a-date')).toThrow();
  });

  it('formats leap day correctly', () => {
    const result = formatDate('2024-02-29T12:00:00Z');
    expect(result).toMatch(/29.*Feb.*2024/);
  });
});

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------
describe('formatDateTime', () => {
  it('includes date and time components for ISO string', () => {
    const result = formatDateTime('2024-06-20T14:30:00Z');
    expect(result).toMatch(/20/);
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2024/);
  });

  it('accepts a Date object', () => {
    const date = new Date(2025, 5, 15, 10, 45); // Jun 15 2025, 10:45
    const result = formatDateTime(date);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2025/);
  });

  it('includes hour and minute information', () => {
    // Using a fixed timezone date string
    const result = formatDateTime('2024-01-15T08:05:00Z');
    // The formatted result should contain time digits
    // The exact format depends on locale, but there should be numeric time components
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });

  it('throws for invalid date input', () => {
    expect(() => formatDateTime('invalid')).toThrow();
  });

  it('formats midnight correctly', () => {
    const result = formatDateTime('2024-06-01T00:00:00Z');
    expect(result).toMatch(/0?1.*Jun.*2024/);
    // Should contain time component
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

// ---------------------------------------------------------------------------
// getStatusColor
// ---------------------------------------------------------------------------
describe('getStatusColor', () => {
  const statusColorMap: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-800',
    SUBMITTED: 'bg-blue-100 text-blue-800',
    PAYMENT_PENDING: 'bg-yellow-100 text-yellow-800',
    PAYMENT_VERIFIED: 'bg-emerald-100 text-emerald-800',
    UNDER_REVIEW: 'bg-indigo-100 text-indigo-800',
    QUERY_RAISED: 'bg-orange-100 text-orange-800',
    QUERY_RESPONDED: 'bg-cyan-100 text-cyan-800',
    FIELD_VERIFICATION_PENDING: 'bg-purple-100 text-purple-800',
    FIELD_VERIFICATION_SCHEDULED: 'bg-violet-100 text-violet-800',
    FIELD_VERIFICATION_COMPLETED: 'bg-teal-100 text-teal-800',
    COMMITTEE_REVIEW: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
    CERTIFICATE_ISSUED: 'bg-emerald-100 text-emerald-800',
  };

  for (const [status, expected] of Object.entries(statusColorMap)) {
    it(`returns correct classes for ${status}`, () => {
      expect(getStatusColor(status)).toBe(expected);
    });
  }

  it('returns default gray for an unknown status', () => {
    expect(getStatusColor('UNKNOWN_STATUS')).toBe('bg-gray-100 text-gray-800');
  });

  it('returns default gray for empty string', () => {
    expect(getStatusColor('')).toBe('bg-gray-100 text-gray-800');
  });
});

// ---------------------------------------------------------------------------
// getStatusLabel
// ---------------------------------------------------------------------------
describe('getStatusLabel', () => {
  const statusLabelMap: Record<string, string> = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    PAYMENT_PENDING: 'Payment Pending',
    PAYMENT_VERIFIED: 'Payment Verified',
    UNDER_REVIEW: 'Under Review',
    QUERY_RAISED: 'Query Raised',
    QUERY_RESPONDED: 'Query Responded',
    FIELD_VERIFICATION_PENDING: 'Field Verification Pending',
    FIELD_VERIFICATION_SCHEDULED: 'Field Verification Scheduled',
    FIELD_VERIFICATION_COMPLETED: 'Field Verification Completed',
    COMMITTEE_REVIEW: 'Committee Review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    CERTIFICATE_ISSUED: 'Certificate Issued',
  };

  for (const [status, expected] of Object.entries(statusLabelMap)) {
    it(`returns "${expected}" for ${status}`, () => {
      expect(getStatusLabel(status)).toBe(expected);
    });
  }

  it('returns the raw status string for an unknown status', () => {
    expect(getStatusLabel('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
  });

  it('returns empty string for empty string input', () => {
    expect(getStatusLabel('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------
describe('truncate', () => {
  it('returns the original string when within length', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns the original string when exactly at length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates and appends ellipsis when exceeding length', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });

  it('truncates to 1 character', () => {
    expect(truncate('hello', 1)).toBe('h...');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('truncates to 0 characters', () => {
    expect(truncate('hello', 0)).toBe('...');
  });

  it('handles very long strings', () => {
    const longStr = 'a'.repeat(1000);
    const result = truncate(longStr, 10);
    expect(result).toBe('aaaaaaaaaa...');
    expect(result.length).toBe(13); // 10 + '...'
  });
});

// ---------------------------------------------------------------------------
// getFileIcon
// ---------------------------------------------------------------------------
describe('getFileIcon', () => {
  it('returns image icon for image/png', () => {
    expect(getFileIcon('image/png')).toBe('\uD83D\uDDBC\uFE0F');
  });

  it('returns image icon for image/jpeg', () => {
    expect(getFileIcon('image/jpeg')).toBe('\uD83D\uDDBC\uFE0F');
  });

  it('returns image icon for image/gif', () => {
    expect(getFileIcon('image/gif')).toBe('\uD83D\uDDBC\uFE0F');
  });

  it('returns pdf icon for application/pdf', () => {
    expect(getFileIcon('application/pdf')).toBe('\uD83D\uDCC4');
  });

  it('returns word icon for word documents', () => {
    expect(getFileIcon('application/msword')).toBe('\uD83D\uDCDD');
    expect(getFileIcon('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(
      '\uD83D\uDCDD',
    );
  });

  it('returns spreadsheet icon for excel documents', () => {
    expect(getFileIcon('application/vnd.ms-excel')).toBe('\uD83D\uDCCA');
    expect(getFileIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(
      '\uD83D\uDCCA',
    );
  });

  it('returns generic icon for unknown mime type', () => {
    expect(getFileIcon('application/octet-stream')).toBe('\uD83D\uDCCE');
  });

  it('returns generic icon for text/plain', () => {
    expect(getFileIcon('text/plain')).toBe('\uD83D\uDCCE');
  });
});

// ---------------------------------------------------------------------------
// formatFileSize
// ---------------------------------------------------------------------------
describe('formatFileSize', () => {
  it('returns "0 Bytes" for 0', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('formats small byte values', () => {
    expect(formatFileSize(1)).toBe('1 Bytes');
    expect(formatFileSize(500)).toBe('500 Bytes');
    expect(formatFileSize(1023)).toBe('1023 Bytes');
  });

  it('formats exactly 1 KB', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
  });

  it('formats kilobytes with decimals', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });

  it('formats exactly 1 MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
  });

  it('formats megabytes with decimals', () => {
    expect(formatFileSize(1536 * 1024)).toBe('1.5 MB');
  });

  it('formats exactly 1 GB', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('formats large megabyte values', () => {
    // 500 MB
    expect(formatFileSize(500 * 1024 * 1024)).toBe('500 MB');
  });

  it('formats fractional GB values', () => {
    // 2.5 GB
    const result = formatFileSize(2.5 * 1024 * 1024 * 1024);
    expect(result).toBe('2.5 GB');
  });
});
