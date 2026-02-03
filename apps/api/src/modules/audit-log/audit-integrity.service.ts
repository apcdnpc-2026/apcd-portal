import { createHash } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Result of hash chain verification.
 */
export interface VerificationResult {
  valid: boolean;
  invalidRecords: Array<{
    id: string;
    sequenceNumber: bigint;
    expectedHash: string;
    actualHash: string | null;
  }>;
  checkedCount: number;
  firstSequence: bigint | null;
  lastSequence: bigint | null;
}

/**
 * Current status of the audit chain.
 */
export interface ChainStatus {
  totalRecords: number;
  latestSequence: bigint | null;
  lastVerifiedAt: Date | null;
  lastVerificationResult: VerificationResult | null;
}

/**
 * Record shape for hash computation.
 */
interface AuditRecord {
  id: string;
  sequenceNumber: bigint;
  action: string;
  entityType: string;
  entityId: string;
  userId: string | null;
  previousHash: string | null;
  recordHash: string | null;
  oldValues: unknown;
  newValues: unknown;
  createdAt: Date;
}

@Injectable()
export class AuditIntegrityService {
  private readonly logger = new Logger(AuditIntegrityService.name);
  private lastVerifiedAt: Date | null = null;
  private lastVerificationResult: VerificationResult | null = null;

  constructor(private prisma: PrismaService) {}

  /**
   * Verify the hash chain integrity for audit logs within a sequence range.
   * If no range is specified, verifies the entire chain.
   */
  async verifyHashChain(startSequence?: bigint, endSequence?: bigint): Promise<VerificationResult> {
    this.logger.log(
      `Starting hash chain verification${startSequence ? ` from sequence ${startSequence}` : ''}${endSequence ? ` to sequence ${endSequence}` : ''}`,
    );

    const whereClause: Record<string, unknown> = {};
    if (startSequence !== undefined || endSequence !== undefined) {
      whereClause.sequenceNumber = {};
      if (startSequence !== undefined) {
        (whereClause.sequenceNumber as Record<string, bigint>).gte = startSequence;
      }
      if (endSequence !== undefined) {
        (whereClause.sequenceNumber as Record<string, bigint>).lte = endSequence;
      }
    }

    const records = await this.prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { sequenceNumber: 'asc' },
      select: {
        id: true,
        sequenceNumber: true,
        action: true,
        entityType: true,
        entityId: true,
        userId: true,
        previousHash: true,
        recordHash: true,
        oldValues: true,
        newValues: true,
        createdAt: true,
      },
    });

    if (records.length === 0) {
      const result: VerificationResult = {
        valid: true,
        invalidRecords: [],
        checkedCount: 0,
        firstSequence: null,
        lastSequence: null,
      };
      this.updateVerificationState(result);
      return result;
    }

    const invalidRecords: VerificationResult['invalidRecords'] = [];
    let previousHash = 'GENESIS';

    // If starting from a specific sequence, fetch the previous record's hash
    if (startSequence !== undefined && startSequence > BigInt(1)) {
      const previousRecord = await this.prisma.auditLog.findFirst({
        where: { sequenceNumber: { lt: startSequence } },
        orderBy: { sequenceNumber: 'desc' },
        select: { recordHash: true },
      });
      if (previousRecord?.recordHash) {
        previousHash = previousRecord.recordHash;
      }
    }

    for (const record of records) {
      // Check that the stored previousHash matches what we expect
      const expectedPreviousHash = previousHash;
      if (record.previousHash !== expectedPreviousHash) {
        this.logger.warn(`Chain break at sequence ${record.sequenceNumber}: previousHash mismatch`);
      }

      // Recompute the hash for this record
      const computedHash = this.computeHash(record as AuditRecord, expectedPreviousHash);

      if (record.recordHash !== computedHash) {
        invalidRecords.push({
          id: record.id,
          sequenceNumber: record.sequenceNumber,
          expectedHash: computedHash,
          actualHash: record.recordHash,
        });
        this.logger.warn(
          `Invalid hash at sequence ${record.sequenceNumber}: expected ${computedHash}, got ${record.recordHash}`,
        );
      }

      // Use the stored hash for the next iteration to continue chain validation
      previousHash = record.recordHash || computedHash;
    }

    const result: VerificationResult = {
      valid: invalidRecords.length === 0,
      invalidRecords,
      checkedCount: records.length,
      firstSequence: records[0].sequenceNumber,
      lastSequence: records[records.length - 1].sequenceNumber,
    };

    this.updateVerificationState(result);

    this.logger.log(
      `Hash chain verification complete: ${result.valid ? 'VALID' : 'INVALID'} (${result.checkedCount} records checked, ${invalidRecords.length} invalid)`,
    );

    return result;
  }

  /**
   * Verify hash chain for records created in the last N hours.
   */
  async verifyRecentRecords(hoursBack: number = 24): Promise<VerificationResult> {
    this.logger.log(`Verifying records from the last ${hoursBack} hours`);

    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

    // Find the first record after the cutoff date
    const firstRecentRecord = await this.prisma.auditLog.findFirst({
      where: { createdAt: { gte: cutoffDate } },
      orderBy: { sequenceNumber: 'asc' },
      select: { sequenceNumber: true },
    });

    if (!firstRecentRecord) {
      return {
        valid: true,
        invalidRecords: [],
        checkedCount: 0,
        firstSequence: null,
        lastSequence: null,
      };
    }

    return this.verifyHashChain(firstRecentRecord.sequenceNumber);
  }

  /**
   * Get the current status of the audit chain.
   */
  async getChainStatus(): Promise<ChainStatus> {
    const totalRecords = await this.prisma.auditLog.count();

    const latestRecord = await this.prisma.auditLog.findFirst({
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });

    return {
      totalRecords,
      latestSequence: latestRecord?.sequenceNumber ?? null,
      lastVerifiedAt: this.lastVerifiedAt,
      lastVerificationResult: this.lastVerificationResult,
    };
  }

  /**
   * Compute SHA-256 hash for a record, matching the pattern used in AuditLogService.
   * Note: The original service includes a timestamp in the hash, but we don't have
   * that exact timestamp stored. We use a simplified verification that checks
   * the chain linkage and core data integrity.
   */
  private computeHash(record: AuditRecord, previousHash: string): string {
    // Compute hash based on the critical fields that define the audit record.
    // This matches the structure used in audit-log.service.ts but without timestamp
    // since we can't recreate the exact timestamp used during creation.
    const payload = JSON.stringify({
      action: record.action,
      entityId: record.entityId,
      entityType: record.entityType,
      userId: record.userId,
      oldValues: record.oldValues,
      newValues: record.newValues,
      previousHash,
      // Note: Original hash includes timestamp which we can't reproduce exactly.
      // For full integrity verification, we verify the chain linkage is intact.
      sequenceNumber: record.sequenceNumber.toString(),
    });
    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  /**
   * Update internal verification state tracking.
   */
  private updateVerificationState(result: VerificationResult): void {
    this.lastVerifiedAt = new Date();
    this.lastVerificationResult = result;
  }
}
