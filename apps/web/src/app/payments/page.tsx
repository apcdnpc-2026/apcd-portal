'use client';

import { useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { apiGet } from '@/lib/api';

export default function PaymentsPage() {
  const { isLoading } = useQuery({
    queryKey: ['my-payments'],
    queryFn: () => apiGet<any>('/payments/stats'),
  });

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
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-muted-foreground">Your payment history and status</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Payment details are shown within each application
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
