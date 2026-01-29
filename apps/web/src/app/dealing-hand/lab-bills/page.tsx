'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt } from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function LabBillsPage() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['lab-bills'],
    queryFn: () => apiGet<any>('/dashboard/dealing-hand'),
  });
  const applications = response?.data?.recentApplications || response?.recentApplications || [];

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
          <h1 className="text-2xl font-bold">Lab Bills</h1>
          <p className="text-muted-foreground">Upload and manage lab testing bills</p>
        </div>
        {applications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Receipt className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No applications requiring lab bills</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {applications.map((app: any) => (
              <Card key={app.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{app.applicationNumber}</p>
                      <p className="text-sm text-muted-foreground">{app.oemProfile?.companyName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={app.status === 'LAB_TESTING' ? 'warning' : 'default'}>
                        {app.status?.replace(/_/g, ' ')}
                      </Badge>
                      <Button size="sm">Upload Bill</Button>
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
