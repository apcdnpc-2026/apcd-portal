'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle, AlertCircle, FileText, Building2, Settings } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface Step4Props {
  applicationId: string | null;
  onSave: (data: any) => Promise<void>;
  onNext: () => void;
}

export function Step4Review({ applicationId, onSave, onNext }: Step4Props) {
  const { data: appResponse, isLoading } = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => apiGet<{ success: boolean; data: any }>(`/applications/${applicationId}`),
    enabled: !!applicationId,
  });
  const application = appResponse?.data;

  const { data: feesResponse } = useQuery({
    queryKey: ['application-fees', applicationId],
    queryFn: () => apiGet<{ success: boolean; data: any }>(`/payments/calculate/${applicationId}`),
    enabled: !!applicationId,
  });
  const fees = feesResponse?.data;

  if (isLoading || !application) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isComplete = application.applicationApcds?.length > 0;

  return (
    <div className="space-y-6">
      {/* Validation Status */}
      <div
        className={`rounded-lg p-4 ${
          isComplete ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}
      >
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-red-600" />
          )}
          <span className={`font-medium ${isComplete ? 'text-green-800' : 'text-red-800'}`}>
            {isComplete ? 'Application is complete and ready for submission' : 'Application is incomplete'}
          </span>
        </div>
        {!isComplete && application.validationErrors && (
          <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
            {application.validationErrors.map((error: string, index: number) => (
              <li key={index}>{error}</li>
            ))}
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

          {/* Discount Eligibility */}
          <div className="mt-4 flex gap-2">
            {application.oemProfile?.isMSE && <Badge variant="success">MSE</Badge>}
            {application.oemProfile?.isStartup && <Badge variant="success">Startup</Badge>}
            {application.oemProfile?.isLocalSupplier && <Badge variant="success">Local Supplier</Badge>}
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
                <div key={apcd.id} className="flex items-center justify-between p-2 bg-muted rounded">
                  <span>{apcd.apcdType?.category}: {apcd.apcdType?.subType}</span>
                  <Badge variant="default">
                    {apcd.seekingEmpanelment ? 'Seeking Empanelment' : 'Not Seeking'}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No APCD types selected</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documents Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Uploaded Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {application.attachments?.length || 0} documents uploaded
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {application.attachments?.slice(0, 6).map((doc: any) => (
              <div key={doc.id} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>{doc.documentType.replace(/_/g, ' ')}</span>
              </div>
            ))}
            {(application.attachments?.length || 0) > 6 && (
              <p className="text-sm text-muted-foreground">
                +{application.attachments.length - 6} more documents
              </p>
            )}
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
                <span>Empanelment Fee ({fees.apcdCount || 0} APCD type{fees.apcdCount !== 1 ? 's' : ''} × ₹65,000 + 18% GST)</span>
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
                    Refund of {formatCurrency(fees.refundAmount || 0)} will be processed after issuance of Final Certificate.
                    Full fees must be paid at the time of application.
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
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 rounded" required />
            <span className="text-sm">
              I hereby declare that all information provided in this application is true and correct
              to the best of my knowledge. I understand that any false information may result in
              rejection of my application and legal action.
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button variant="outline">Save as Draft</Button>
        <Button disabled={!isComplete}>
          Submit Application & Proceed to Payment
        </Button>
      </div>
    </div>
  );
}
