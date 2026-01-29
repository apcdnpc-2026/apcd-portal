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

describe('cn', () => {
  it('merges multiple class names', () => {
    const result = cn('px-2', 'py-1');
    expect(result).toBe('px-2 py-1');
  });

  it('deduplicates conflicting tailwind classes (last wins)', () => {
    const result = cn('px-2', 'px-4');
    expect(result).toBe('px-4');
  });

  it('handles conditional classes', () => {
    const result = cn('base', false && 'hidden', 'visible');
    expect(result).toBe('base visible');
  });
});

describe('formatCurrency', () => {
  it('formats a number as INR currency', () => {
    const result = formatCurrency(100000);
    // en-IN INR formatting: ₹1,00,000
    expect(result).toContain('1,00,000');
  });

  it('formats zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });
});

describe('formatDate', () => {
  it('formats an ISO date string to en-IN short date', () => {
    // 15 Mar 2024 (en-IN: "15 Mar 2024")
    const result = formatDate('2024-03-15T00:00:00Z');
    expect(result).toMatch(/15.*Mar.*2024/);
  });

  it('accepts a Date object', () => {
    const result = formatDate(new Date(2025, 0, 1)); // Jan 1 2025
    expect(result).toMatch(/01.*Jan.*2025/);
  });
});

describe('formatDateTime', () => {
  it('includes both date and time components', () => {
    const result = formatDateTime('2024-06-20T14:30:00Z');
    // Should contain day, month, year and time parts
    expect(result).toMatch(/20/);
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/2024/);
  });
});

describe('getStatusColor', () => {
  it('returns correct classes for APPROVED', () => {
    expect(getStatusColor('APPROVED')).toBe('bg-green-100 text-green-800');
  });

  it('returns correct classes for REJECTED', () => {
    expect(getStatusColor('REJECTED')).toBe('bg-red-100 text-red-800');
  });

  it('returns correct classes for SUBMITTED', () => {
    expect(getStatusColor('SUBMITTED')).toBe('bg-blue-100 text-blue-800');
  });

  it('returns default gray for an unknown status', () => {
    expect(getStatusColor('UNKNOWN_STATUS')).toBe('bg-gray-100 text-gray-800');
  });
});

describe('getStatusLabel', () => {
  it('returns human-readable label for PAYMENT_PENDING', () => {
    expect(getStatusLabel('PAYMENT_PENDING')).toBe('Payment Pending');
  });

  it('returns human-readable label for FIELD_VERIFICATION_SCHEDULED', () => {
    expect(getStatusLabel('FIELD_VERIFICATION_SCHEDULED')).toBe('Field Verification Scheduled');
  });

  it('returns the raw status string for an unknown status', () => {
    expect(getStatusLabel('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
  });
});

describe('truncate', () => {
  it('returns the original string when within length', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and appends ellipsis when exceeding length', () => {
    expect(truncate('hello world', 5)).toBe('hello...');
  });
});

describe('getFileIcon', () => {
  it('returns image icon for image mime types', () => {
    expect(getFileIcon('image/png')).toBe('🖼️');
  });

  it('returns pdf icon for application/pdf', () => {
    expect(getFileIcon('application/pdf')).toBe('📄');
  });

  it('returns generic icon for unknown mime type', () => {
    expect(getFileIcon('application/octet-stream')).toBe('📎');
  });
});

describe('formatFileSize', () => {
  it('returns "0 Bytes" for 0', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
  });

  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 Bytes');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
  });

  it('formats megabytes with decimals', () => {
    expect(formatFileSize(1536 * 1024)).toBe('1.5 MB');
  });
});
