'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function FieldVerificationCompletedPage() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['field-completed'],
    queryFn: () => apiGet<any>('/field-verification/my-assignments'),
  });
  const reports = response?.data || response || [];

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
          <h1 className="text-2xl font-bold">Completed Verifications</h1>
          <p className="text-muted-foreground">Past field verification reports</p>
        </div>
        {(reports as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No completed verifications</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(reports as any[]).map((r: any) => (
              <Card key={r.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{r.application?.oemProfile?.companyName}</p>
                      <p className="text-sm text-muted-foreground">
                        Visited: {formatDate(r.visitDate)}
                      </p>
                    </div>
                    <Badge variant="success">Completed</Badge>
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
