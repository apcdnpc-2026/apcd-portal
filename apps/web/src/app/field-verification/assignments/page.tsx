'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPin, Calendar } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function FieldVerificationAssignmentsPage() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['field-assignments'],
    queryFn: () => apiGet<any>('/field-verification/my-assignments'),
  });
  const assignments = response?.data || response || [];

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
          <h1 className="text-2xl font-bold">My Assignments</h1>
          <p className="text-muted-foreground">Field verification assignments</p>
        </div>
        {(assignments as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MapPin className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No assignments</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(assignments as any[]).map((a: any) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{a.application?.oemProfile?.companyName}</p>
                      <p className="text-sm text-muted-foreground">
                        {a.application?.oemProfile?.fullAddress}
                      </p>
                      {a.scheduledDate && (
                        <div className="flex items-center gap-1 mt-1 text-sm">
                          <Calendar className="h-3 w-3" />
                          {formatDate(a.scheduledDate)}
                        </div>
                      )}
                    </div>
                    <Button size="sm" asChild>
                      <Link href={`/field-verification/${a.id}`}>View</Link>
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
