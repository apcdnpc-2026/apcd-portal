import * as fs from 'fs';
import * as path from 'path';

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client | null = null;
  private bucket: string;
  private isEnabled: boolean;
  private localStoragePath: string;

  constructor(private configService: ConfigService) {
    this.bucket = this.configService.get<string>('MINIO_BUCKET', 'apcd-documents');
    // Only enable MinIO if storage type is not 'local'
    this.isEnabled = this.configService.get<string>('STORAGE_TYPE', 'local') !== 'local';
    this.localStoragePath = this.configService.get<string>(
      'LOCAL_STORAGE_PATH',
      path.join(process.cwd(), 'uploads'),
    );
  }

  async onModuleInit() {
    if (!this.isEnabled) {
      this.logger.log('MinIO disabled - using local storage');
      this.ensureLocalStorageDir();
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
      this.logger.warn(`MinIO connection failed: ${error.message}. Falling back to local storage.`);
      this.client = null;
      this.ensureLocalStorageDir();
    }
  }

  private ensureLocalStorageDir() {
    if (!fs.existsSync(this.localStoragePath)) {
      fs.mkdirSync(this.localStoragePath, { recursive: true });
      this.logger.log(`Created local storage directory: ${this.localStoragePath}`);
    }
  }

  /**
   * Check if MinIO is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Upload a file — uses MinIO if available, otherwise local filesystem
   */
  async uploadFile(
    objectName: string,
    buffer: Buffer,
    contentType: string,
    metadata?: Record<string, string>,
  ): Promise<string> {
    if (this.client) {
      await this.client.putObject(this.bucket, objectName, buffer, buffer.length, {
        'Content-Type': contentType,
        ...metadata,
      });
      return objectName;
    }

    // Local storage fallback
    const filePath = path.join(this.localStoragePath, objectName);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, buffer);
    this.logger.debug(`Saved file locally: ${filePath}`);
    return objectName;
  }

  /**
   * Get a presigned URL for downloading a file
   */
  async getPresignedUrl(objectName: string, expirySeconds: number = 3600): Promise<string> {
    if (this.client) {
      return this.client.presignedGetObject(this.bucket, objectName, expirySeconds);
    }

    // Local storage: return a relative path served by the attachments controller
    return `/api/attachments/local/download?path=${encodeURIComponent(objectName)}`;
  }

  /**
   * Download a file as a Buffer
   */
  async getFile(objectName: string): Promise<Buffer> {
    if (this.client) {
      const stream = await this.client.getObject(this.bucket, objectName);
      const chunks: Buffer[] = [];
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    }

    // Local storage fallback
    const filePath = path.join(this.localStoragePath, objectName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${objectName}`);
    }
    return fs.readFileSync(filePath);
  }

  /**
   * Delete a file from MinIO or local storage
   */
  async deleteFile(objectName: string): Promise<void> {
    if (this.client) {
      await this.client.removeObject(this.bucket, objectName);
      return;
    }

    // Local storage fallback
    const filePath = path.join(this.localStoragePath, objectName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Get file metadata (stat)
   */
  async getFileInfo(objectName: string): Promise<Minio.BucketItemStat | { size: number }> {
    if (this.client) {
      return this.client.statObject(this.bucket, objectName);
    }

    // Local storage fallback
    const filePath = path.join(this.localStoragePath, objectName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${objectName}`);
    }
    const stats = fs.statSync(filePath);
    return { size: stats.size };
  }

  /**
   * Get the local storage path for serving files
   */
  getLocalStoragePath(): string {
    return this.localStoragePath;
  }

  /**
   * Generate the storage path for an application's document
   */
  static buildObjectKey(applicationId: string, documentType: string, fileName: string): string {
    const timestamp = Date.now();
    const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `applications/${applicationId}/${documentType}/${timestamp}_${sanitized}`;
  }
}
