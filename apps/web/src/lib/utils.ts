import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
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
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
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
  return labels[status] || status;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('word')) return '📝';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
  return '📎';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
