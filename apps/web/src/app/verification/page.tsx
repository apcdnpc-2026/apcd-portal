'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatDate, getStatusLabel, getStatusColor } from '@/lib/utils';

export default function VerificationPage() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['verification-pending'],
    queryFn: () => apiGet<any>('/verification/pending'),
  });
  const applications = response?.data || response || [];

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
          <p className="text-muted-foreground">Review and verify submitted applications</p>
        </div>

        {(applications as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No applications pending verification</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(applications as any[]).map((app: any) => (
              <Card key={app.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{app.applicationNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {app.oemProfile?.companyName} &bull; Submitted: {formatDate(app.submittedAt || app.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={getStatusColor(app.status)}>{getStatusLabel(app.status)}</Badge>
                      <Button size="sm" asChild>
                        <Link href={`/verification/${app.id}`}>
                          Review <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
