'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useQuery } from '@tanstack/react-query';
import { Upload, X, CheckCircle, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { uploadFile, apiGet } from '@/lib/api';
import { formatFileSize } from '@/lib/utils';
import { FactoryPhotosSection } from './factory-photos-section';

// Document requirements (excluding factory photos - handled by FactoryPhotosSection)
const DOCUMENT_TYPES = [
  { id: 'GST_CERTIFICATE', name: 'GST Registration Certificate', mandatory: true },
  { id: 'PAN_CARD', name: 'Company PAN Card', mandatory: true },
  { id: 'CIN_CERTIFICATE', name: 'Certificate of Incorporation', mandatory: true },
  { id: 'UDYAM_CERTIFICATE', name: 'Udyam/MSME Certificate', mandatory: false },
  { id: 'STARTUP_CERTIFICATE', name: 'DPIIT Startup Certificate', mandatory: false },
  { id: 'ISO_CERTIFICATE', name: 'ISO Certification', mandatory: true },
  { id: 'BIS_CERTIFICATE', name: 'BIS License/Certificate', mandatory: false },
  { id: 'FACTORY_LICENSE', name: 'Factory License', mandatory: true },
  { id: 'POLLUTION_CONSENT', name: 'Pollution Control Board Consent', mandatory: true },
  { id: 'FIRE_NOC', name: 'Fire Safety NOC', mandatory: true },
  { id: 'COMPANY_PROFILE', name: 'Company Profile/Brochure', mandatory: true },
  { id: 'PRODUCT_CATALOG', name: 'Product Catalog', mandatory: true },
  { id: 'FINANCIAL_STATEMENT', name: 'Audited Financial Statements (3 years)', mandatory: true },
  { id: 'BANK_SOLVENCY', name: 'Bank Solvency Certificate', mandatory: true },
];

interface Step3Props {
  applicationId: string | null;
  onSave: (data: any) => Promise<void>;
  onNext: () => void;
}

interface UploadedFile {
  documentType: string;
  fileName: string;
  fileSize: number;
  status: 'uploading' | 'success' | 'error';
  progress?: number;
  error?: string;
}

export function Step3Documents({ applicationId, onSave, onNext }: Step3Props) {
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, UploadedFile>>({});

  // Fetch existing attachments to show what's already uploaded
  const { data: existingAttachments = [], refetch: refreshAttachments } = useQuery({
    queryKey: ['attachments', applicationId],
    queryFn: async () => {
      const response = await apiGet<any>(`/attachments/application/${applicationId}`);
      return response?.data || response || [];
    },
    enabled: !!applicationId,
  });

  const handleUpload = async (documentType: string, file: File) => {
    setUploadedFiles((prev) => ({
      ...prev,
      [documentType]: {
        documentType,
        fileName: file.name,
        fileSize: file.size,
        status: 'uploading',
        progress: 0,
      },
    }));

    try {
      await uploadFile(
        '/attachments/upload',
        file,
        (progress) => {
          setUploadedFiles((prev) => ({
            ...prev,
            [documentType]: { ...prev[documentType], progress } as UploadedFile,
          }));
        },
        {
          applicationId: applicationId!,
          documentType,
        },
      );

      setUploadedFiles((prev) => ({
        ...prev,
        [documentType]: {
          ...prev[documentType],
          status: 'success' as const,
        } as UploadedFile,
      }));
      refreshAttachments();
    } catch (error: any) {
      setUploadedFiles((prev) => ({
        ...prev,
        [documentType]: {
          ...prev[documentType],
          status: 'error' as const,
          error: error.response?.data?.message || 'Upload failed',
        } as UploadedFile,
      }));
    }
  };

  const removeFile = (documentType: string) => {
    setUploadedFiles((prev) => {
      const updated = { ...prev };
      delete updated[documentType];
      return updated;
    });
  };

  const handleSubmit = async () => {
    await onSave({});
    onNext();
  };

  const mandatoryDocs = DOCUMENT_TYPES.filter((d) => d.mandatory);
  const uploadedMandatory = mandatoryDocs.filter(
    (d) => uploadedFiles[d.id]?.status === 'success'
  ).length;

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-800">Document Upload</h3>
        <p className="text-sm text-blue-700 mt-1">
          Upload all required documents and factory photographs.
          Maximum file size: 10MB per document.
        </p>
      </div>

      {/* Factory Photos Section */}
      {applicationId && (
        <FactoryPhotosSection
          applicationId={applicationId}
          existingAttachments={existingAttachments}
          onPhotoChanged={refreshAttachments}
        />
      )}

      {/* Separator */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold mb-1">Other Required Documents</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Upload certificates, financial documents, and compliance proofs.
        </p>
      </div>

      {/* Document Progress */}
      <div className="bg-muted rounded-lg p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            Documents: {uploadedMandatory} / {mandatoryDocs.length}
          </span>
          <span className="text-sm text-muted-foreground">
            {mandatoryDocs.length > 0 ? Math.round((uploadedMandatory / mandatoryDocs.length) * 100) : 0}% complete
          </span>
        </div>
        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${mandatoryDocs.length > 0 ? (uploadedMandatory / mandatoryDocs.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-4">
        {DOCUMENT_TYPES.map((docType) => {
          const uploaded = uploadedFiles[docType.id];

          return (
            <Card key={docType.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{docType.name}</span>
                      {docType.mandatory ? (
                        <Badge variant="destructive" className="text-xs">Required</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Optional</Badge>
                      )}
                    </div>

                    {uploaded ? (
                      <div className="mt-2">
                        {uploaded.status === 'uploading' && (
                          <div className="flex items-center gap-2">
                            <div className="h-1 flex-1 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary transition-all"
                                style={{ width: `${uploaded.progress}%` }}
                              />
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {uploaded.progress}%
                            </span>
                          </div>
                        )}

                        {uploaded.status === 'success' && (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-sm">
                              {uploaded.fileName} ({formatFileSize(uploaded.fileSize)})
                            </span>
                            <button
                              onClick={() => removeFile(docType.id)}
                              className="ml-auto text-red-500 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}

                        {uploaded.status === 'error' && (
                          <div className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="h-4 w-4" />
                            <span className="text-sm">{uploaded.error}</span>
                            <button
                              onClick={() => removeFile(docType.id)}
                              className="ml-auto"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <DocumentDropzone
                        onDrop={(file) => handleUpload(docType.id, file)}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onNext}>
          Skip for now
        </Button>
        <Button onClick={handleSubmit}>
          Save & Continue
        </Button>
      </div>
    </div>
  );
}

function DocumentDropzone({
  onDrop,
  accept,
}: {
  onDrop: (file: File) => void;
  accept?: Record<string, string[]>;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onDrop(files[0]),
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
    accept: accept || {
      'application/pdf': ['.pdf'],
      'image/*': ['.jpg', '.jpeg', '.png'],
    },
  });

  return (
    <div
      {...getRootProps()}
      className={`mt-2 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
        isDragActive ? 'border-primary bg-primary/5' : 'border-muted hover:border-primary/50'
      }`}
    >
      <input {...getInputProps()} />
      <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground mt-1">
        {isDragActive ? 'Drop file here' : 'Click or drag file to upload'}
      </p>
    </div>
  );
}
