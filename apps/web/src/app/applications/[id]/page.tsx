'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FileText, Settings, Upload, CreditCard, Clock } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatDate, getStatusColor, getStatusLabel, formatCurrency } from '@/lib/utils';

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params.id as string;

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => apiGet<{ success: boolean; data: any }>(`/applications/${applicationId}`),
    enabled: !!applicationId,
  });

  const application = response?.data;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !application) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Application Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The application you are looking for does not exist or you do not have access.
          </p>
          <Button asChild>
            <Link href="/dashboard/oem">Back to Dashboard</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const isDraft = application.status === 'DRAFT';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{application.applicationNumber}</h1>
              <p className="text-muted-foreground">
                Created on {formatDate(application.createdAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={getStatusColor(application.status)}>
              {getStatusLabel(application.status)}
            </Badge>
            {isDraft && (
              <Button asChild>
                <Link href="/applications/new">Continue Editing</Link>
              </Button>
            )}
          </div>
        </div>

        {/* Company Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
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
                <dt className="text-sm text-muted-foreground">Firm Type</dt>
                <dd className="font-medium">{application.oemProfile?.firmType || '-'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* APCD Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              APCD Types ({application.applicationApcds?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {application.applicationApcds?.length > 0 ? (
              <div className="space-y-2">
                {application.applicationApcds.map((apcd: any) => (
                  <div key={apcd.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span>{apcd.apcdType?.category}: {apcd.apcdType?.subType}</span>
                    <Badge variant="default">
                      {apcd.seekingEmpanelment ? 'Seeking Empanelment' : 'Not Seeking'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No APCD types selected yet</p>
            )}
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Uploaded Documents ({application.attachments?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {application.attachments?.length > 0 ? (
              <div className="space-y-2">
                {application.attachments.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">{doc.originalName}</p>
                      <p className="text-sm text-muted-foreground">{doc.documentType}</p>
                    </div>
                    <Badge variant={doc.isVerified ? 'default' : 'secondary'}>
                      {doc.isVerified ? 'Verified' : 'Pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No documents uploaded yet</p>
            )}
          </CardContent>
        </Card>

        {/* Payments */}
        {application.payments?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {application.payments.map((payment: any) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">{payment.paymentType}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(payment.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(payment.totalAmount)}</p>
                      <Badge variant={payment.status === 'COMPLETED' || payment.status === 'VERIFIED' ? 'default' : 'secondary'}>
                        {payment.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status History */}
        {application.statusHistory?.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Status History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {application.statusHistory.map((entry: any, index: number) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{entry.fromStatus}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge className={getStatusColor(entry.toStatus)}>{entry.toStatus}</Badge>
                      </div>
                      {entry.remarks && (
                        <p className="text-sm text-muted-foreground mt-1">{entry.remarks}</p>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
