'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle,
  AlertCircle,
  FileText,
  Building2,
  Settings,
  Camera,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet, apiPost } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface Step4Props {
  applicationId: string | null;
  onSave: (data: any) => Promise<void>;
  onNext: () => void;
}

// All required documents for checklist display
const REQUIRED_DOCUMENTS = [
  { id: 'COMPANY_REGISTRATION', name: 'Company Registration Certificate' },
  { id: 'GST_CERTIFICATE', name: 'GST Registration Certificate' },
  { id: 'PAN_CARD', name: 'PAN Card' },
  { id: 'PAYMENT_PROOF', name: 'Proof of Online Payment' },
  { id: 'SERVICE_SUPPORT_UNDERTAKING', name: 'Undertaking for Service Support' },
  { id: 'NON_BLACKLISTING_DECLARATION', name: 'Non-Blacklisting Declaration' },
  { id: 'TURNOVER_CERTIFICATE', name: 'Year-wise Turnover Certificate' },
  { id: 'ISO_CERTIFICATION', name: 'ISO Certification' },
  { id: 'PRODUCT_DATASHEET', name: 'Product Datasheets' },
  { id: 'CLIENT_PERFORMANCE_CERT', name: 'Client Performance Certificates' },
  { id: 'TEST_CERTIFICATE', name: 'Test Certificates of APCDs' },
  { id: 'DESIGN_CALCULATIONS', name: 'Design Calculations' },
  { id: 'MATERIAL_CONSTRUCTION_CERT', name: 'Material of Construction Certificates' },
  { id: 'WARRANTY_DOCUMENT', name: 'Warranty Documents' },
  { id: 'BANK_SOLVENCY_CERT', name: 'Bank Solvency Certificate' },
  { id: 'INSTALLATION_EXPERIENCE', name: 'Installation Experience' },
  { id: 'CONSENT_TO_OPERATE', name: 'Consent to Operate Certificate' },
  { id: 'TECHNICAL_CATALOGUE', name: 'Technical Catalogues' },
  { id: 'ORG_CHART', name: 'Organizational Chart' },
  { id: 'STAFF_QUALIFICATION_PROOF', name: 'Staff Qualifications' },
  { id: 'GST_FILING_PROOF', name: 'GST Filing Proofs' },
  { id: 'NO_LEGAL_DISPUTES_AFFIDAVIT', name: 'No Legal Disputes Affidavit' },
  { id: 'COMPLAINT_HANDLING_POLICY', name: 'Complaint-Handling Policy' },
  { id: 'ESCALATION_MECHANISM', name: 'Escalation Mechanism' },
];

const FACTORY_PHOTO_SLOTS = [
  { slot: 'FRONT_VIEW', label: 'Front View of Factory' },
  { slot: 'MANUFACTURING_AREA', label: 'Manufacturing Area' },
  { slot: 'TESTING_LAB', label: 'Testing Laboratory' },
  { slot: 'QC_AREA', label: 'Quality Control Area' },
  { slot: 'RAW_MATERIAL_STORAGE', label: 'Raw Material Storage' },
  { slot: 'FINISHED_GOODS', label: 'Finished Goods Area' },
];

export function Step4Review({ applicationId, onSave, onNext }: Step4Props) {
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: appResponse, isLoading } = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => apiGet<any>(`/applications/${applicationId}`),
    enabled: !!applicationId,
  });
  const application = appResponse?.data;

  const { data: feesResponse } = useQuery({
    queryKey: ['application-fees', applicationId],
    queryFn: () => apiGet<any>(`/payments/calculate/${applicationId}`),
    enabled: !!applicationId,
  });
  const fees = feesResponse?.data;

  // Get uploaded document types as a Set for quick lookup
  const uploadedDocTypes = new Set(
    (application?.attachments || []).map((a: any) => a.documentType),
  );

  // Get uploaded factory photo slots
  const uploadedPhotoSlots = new Set(
    (application?.attachments || [])
      .filter((a: any) => a.documentType === 'GEO_TAGGED_PHOTOS' && a.photoSlot)
      .map((a: any) => a.photoSlot),
  );

  // Calculate completeness
  const hasApcds = (application?.applicationApcds?.length || 0) > 0;
  const attachedDocCount = REQUIRED_DOCUMENTS.filter((d) => uploadedDocTypes.has(d.id)).length;
  const missingDocCount = REQUIRED_DOCUMENTS.length - attachedDocCount;
  const photosUploaded = uploadedPhotoSlots.size;
  const photosMissing = 6 - photosUploaded;

  // Submit application
  const handleSubmit = async () => {
    if (!applicationId || !declarationAccepted) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Save declaration first
      await onSave({
        declarationAccepted: true,
        declarationDate: new Date().toISOString(),
      });

      // Submit application
      await apiPost(`/applications/${applicationId}/submit`);

      onNext();
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.data?.message ||
        'Failed to submit application. Please check all required fields and documents.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !application) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Validation Status */}
      <div
        className={`rounded-lg p-4 ${
          missingDocCount === 0 && photosMissing === 0 && hasApcds
            ? 'bg-green-50 border border-green-200'
            : 'bg-red-50 border border-red-200'
        }`}
      >
        <div className="flex items-center gap-2">
          {missingDocCount === 0 && photosMissing === 0 && hasApcds ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600" />
          )}
          <span
            className={`font-medium ${
              missingDocCount === 0 && photosMissing === 0 && hasApcds
                ? 'text-green-800'
                : 'text-red-800'
            }`}
          >
            {missingDocCount === 0 && photosMissing === 0 && hasApcds
              ? 'Application is ready for submission'
              : 'Application is incomplete - review items below'}
          </span>
        </div>
        {(!hasApcds || missingDocCount > 0 || photosMissing > 0) && (
          <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
            {!hasApcds && <li>No APCD types selected for empanelment</li>}
            {missingDocCount > 0 && <li>{missingDocCount} required document(s) not uploaded</li>}
            {photosMissing > 0 && <li>{photosMissing} factory photo(s) not uploaded</li>}
          </ul>
        )}
      </div>

      {/* Company Profile Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 md:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">Company Name</dt>
              <dd className="font-medium">{application.oemProfile?.companyName || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">GST Number</dt>
              <dd className="font-medium">{application.oemProfile?.gstRegistrationNo || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Address</dt>
              <dd className="font-medium">{application.oemProfile?.fullAddress || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Contact No</dt>
              <dd className="font-medium">{application.oemProfile?.contactNo || '-'}</dd>
            </div>
          </dl>
          <div className="mt-4 flex gap-2">
            {application.oemProfile?.isMSE && <Badge variant="success">MSE</Badge>}
            {application.oemProfile?.isStartup && <Badge variant="success">Startup</Badge>}
            {application.oemProfile?.isLocalSupplier && (
              <Badge variant="success">Local Supplier</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* APCD Types Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            APCD Types for Empanelment ({application.applicationApcds?.length || 0} selected)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {application.applicationApcds?.length > 0 ? (
              application.applicationApcds.map((apcd: any) => (
                <div
                  key={apcd.id}
                  className="flex items-center justify-between p-2 bg-muted rounded"
                >
                  <span>
                    {apcd.apcdType?.category}: {apcd.apcdType?.subType}
                  </span>
                  <Badge variant="default">
                    {apcd.seekingEmpanelment ? 'Seeking Empanelment' : 'Not Seeking'}
                  </Badge>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">No APCD types selected - go back to Step 1</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documents Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Required Documents ({attachedDocCount}/{REQUIRED_DOCUMENTS.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-1.5 md:grid-cols-2">
            {REQUIRED_DOCUMENTS.map((doc) => {
              const isUploaded = uploadedDocTypes.has(doc.id);
              return (
                <div key={doc.id} className="flex items-center gap-2 text-sm py-1">
                  {isUploaded ? (
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  )}
                  <span className={isUploaded ? '' : 'text-red-600'}>{doc.name}</span>
                  {!isUploaded && (
                    <Badge variant="destructive" className="text-xs ml-auto">
                      Not Attached
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Factory Photos Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Factory Photos ({photosUploaded}/6)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-1.5 md:grid-cols-2">
            {FACTORY_PHOTO_SLOTS.map(({ slot, label }) => {
              const isUploaded = uploadedPhotoSlots.has(slot);
              return (
                <div key={slot} className="flex items-center gap-2 text-sm py-1">
                  {isUploaded ? (
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  )}
                  <span className={isUploaded ? '' : 'text-red-600'}>{label}</span>
                  {!isUploaded && (
                    <Badge variant="destructive" className="text-xs ml-auto">
                      Not Attached
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Fee Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Fee Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {fees ? (
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Application Fee (₹25,000 + 18% GST)</span>
                <span>{formatCurrency(fees.applicationFee?.total || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>
                  Empanelment Fee ({fees.apcdCount || 0} APCD type
                  {fees.apcdCount !== 1 ? 's' : ''} × ₹65,000 + 18% GST)
                </span>
                <span>{formatCurrency(fees.empanelmentFee?.total || 0)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-3">
                <span>Total Payable</span>
                <span>{formatCurrency(fees.grandTotal || 0)}</span>
              </div>
              {fees.isDiscountEligible && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
                  <p className="text-sm text-green-800 font-medium">
                    Eligible for 15% Discount (MSE / Startup / Local Supplier)
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    Refund of {formatCurrency(fees.refundAmount || 0)} will be processed after
                    issuance of Final Certificate. Full fees must be paid at the time of
                    application.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Loading fee calculation...</p>
          )}
        </CardContent>
      </Card>

      {/* Declaration */}
      <Card>
        <CardContent className="pt-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 rounded"
              checked={declarationAccepted}
              onChange={(e) => setDeclarationAccepted(e.target.checked)}
            />
            <span className="text-sm">
              I hereby declare that all information provided in this application is true and correct
              to the best of my knowledge. I understand that any false information may result in
              rejection of my application and legal action.
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Submit Error */}
      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => onSave({})}>
          Save as Draft
        </Button>
        <Button onClick={handleSubmit} disabled={!declarationAccepted || submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit Application & Proceed to Payment
        </Button>
      </div>
    </div>
  );
}
