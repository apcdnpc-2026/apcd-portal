import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client | null = null;
  private bucket: string;
  private isEnabled: boolean;

  constructor(private configService: ConfigService) {
    this.bucket = this.configService.get<string>('MINIO_BUCKET', 'apcd-documents');
    // Only enable MinIO if storage type is not 'local'
    this.isEnabled = this.configService.get<string>('STORAGE_TYPE', 'local') !== 'local';
  }

  async onModuleInit() {
    if (!this.isEnabled) {
      this.logger.log('MinIO disabled - using local storage');
      return;
    }

    try {
      this.client = new Minio.Client({
        endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
        port: this.configService.get<number>('MINIO_PORT', 9000),
        useSSL: this.configService.get<string>('MINIO_USE_SSL') === 'true',
        accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', ''),
        secretKey: this.configService.get<string>('MINIO_SECRET_KEY', ''),
      });

      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created MinIO bucket: ${this.bucket}`);
      }
      this.logger.log('MinIO connection established');
    } catch (error) {
      this.logger.warn(`MinIO connection failed: ${error.message}. File uploads will use local storage.`);
      this.client = null;
    }
  }

  /**
   * Check if MinIO is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Upload a file to MinIO
   */
  async uploadFile(
    objectName: string,
    buffer: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    if (!this.client) {
      throw new Error('MinIO is not available. Use local storage instead.');
    }
    await this.client.putObject(this.bucket, objectName, buffer, buffer.length, {
      'Content-Type': contentType,
      ...metadata,
    });
    return objectName;
  }

  /**
   * Get a presigned URL for downloading a file
   */
  async getPresignedUrl(objectName: string, expirySeconds: number = 3600): Promise<string> {
    if (!this.client) {
      throw new Error('MinIO is not available');
    }
    return this.client.presignedGetObject(this.bucket, objectName, expirySeconds);
  }

  /**
   * Download a file as a Buffer
   */
  async getFile(objectName: string): Promise<Buffer> {
    if (!this.client) {
      throw new Error('MinIO is not available');
    }
    const stream = await this.client.getObject(this.bucket, objectName);
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Delete a file from MinIO
   */
  async deleteFile(objectName: string): Promise<void> {
    if (!this.client) {
      throw new Error('MinIO is not available');
    }
    await this.client.removeObject(this.bucket, objectName);
  }

  /**
   * Get file metadata (stat)
   */
  async getFileInfo(objectName: string): Promise<Minio.BucketItemStat> {
    if (!this.client) {
      throw new Error('MinIO is not available');
    }
    return this.client.statObject(this.bucket, objectName);
  }

  /**
   * Generate the storage path for an application's document
   */
  static buildObjectKey(
    applicationId: string,
    documentType: string,
    fileName: string,
  ): string {
    const timestamp = Date.now();
    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `applications/${applicationId}/${documentType}/${timestamp}_${sanitized}`;
  }
}
