'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, ArrowRight, FileSearch, FileText } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { formatDate, getStatusLabel, getStatusColor } from '@/lib/utils';

function ApplicationCard({ app, isDraft }: { app: any; isDraft: boolean }) {
  return (
    <Card
      key={app.id}
      className={`hover:shadow-md transition-shadow ${isDraft ? 'border-amber-200' : ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-medium">{app.applicationNumber}</p>
            <p className="text-sm text-muted-foreground">
              {app.oemProfile?.companyName} &bull; {isDraft ? 'Created' : 'Submitted'}:{' '}
              {formatDate(isDraft ? app.createdAt : app.submittedAt || app.createdAt)}
              {isDraft && (
                <span className="ml-2">&bull; {app.attachments?.length || 0} doc(s) uploaded</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              className={
                isDraft
                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                  : getStatusColor(app.status)
              }
            >
              {isDraft ? 'Pre-Check' : getStatusLabel(app.status)}
            </Badge>
            <Button size="sm" variant={isDraft ? 'outline' : 'default'} asChild>
              <Link href={`/verification/${app.id}`}>
                {isDraft ? (
                  <>
                    <FileSearch className="h-4 w-4 mr-1" /> Check Docs
                  </>
                ) : (
                  <>
                    Review <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function VerificationPage() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['verification-pending'],
    queryFn: () => apiGet<any>('/verification/pending'),
  });
  const allApplications = (response?.data || response || []) as any[];

  const draftApps = allApplications.filter((a) => a.status === 'DRAFT');
  const submittedApps = allApplications.filter((a) => a.status !== 'DRAFT');

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Application Verification</h1>
          <p className="text-muted-foreground">
            Review submitted applications and pre-check draft documents
          </p>
        </div>

        {/* Submitted applications - primary section */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" /> Submitted Applications ({submittedApps.length})
          </h2>
          {submittedApps.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <ClipboardCheck className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No submitted applications pending verification
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {submittedApps.map((app: any) => (
                <ApplicationCard key={app.id} app={app} isDraft={false} />
              ))}
            </div>
          )}
        </div>

        {/* Draft applications - pre-check section */}
        {draftApps.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-amber-600" /> Document Pre-Check (
              {draftApps.length})
            </h2>
            <p className="text-sm text-muted-foreground -mt-1">
              These applicants have requested document verification before making payment. You can
              review uploaded documents and raise queries.
            </p>
            <div className="space-y-3">
              {draftApps.map((app: any) => (
                <ApplicationCard key={app.id} app={app} isDraft={true} />
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
