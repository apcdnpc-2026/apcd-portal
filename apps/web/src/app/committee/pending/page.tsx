'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';

export default function CommitteePendingPage() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['committee-pending'],
    queryFn: () => apiGet<any>('/committee/pending'),
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
          <h1 className="text-2xl font-bold">Pending Committee Review</h1>
          <p className="text-muted-foreground">Applications awaiting committee evaluation</p>
        </div>
        {(applications as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No applications pending review</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(applications as any[]).map((app: any) => (
              <Card key={app.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{app.applicationNumber}</p>
                      <p className="text-sm text-muted-foreground">{app.oemProfile?.companyName}</p>
                    </div>
                    <Button size="sm" asChild>
                      <Link href={`/committee/evaluate/${app.id}`}>
                        Evaluate <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
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
