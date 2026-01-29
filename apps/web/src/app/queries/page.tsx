'use client';

import { useQuery } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function QueriesPage() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['all-queries'],
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

  const queriedApps = (applications as any[]).filter(
    (app: any) => app.status === 'QUERIED' || app.status === 'COMMITTEE_QUERIED'
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Queries</h1>
          <p className="text-muted-foreground">Applications with open queries</p>
        </div>
        {queriedApps.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No open queries</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {queriedApps.map((app: any) => (
              <Card key={app.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{app.applicationNumber}</p>
                      <p className="text-sm text-muted-foreground">{app.oemProfile?.companyName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="warning">Queried</Badge>
                      <Button size="sm" asChild>
                        <Link href={`/verification/${app.id}`}>View</Link>
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
