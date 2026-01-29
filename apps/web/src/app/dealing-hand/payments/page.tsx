'use client';

import { useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function DealingHandPaymentsPage() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['dealing-hand-payments'],
    queryFn: () => apiGet<any>('/payments/pending-verification'),
  });
  const payments = response?.data || response || [];

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
          <h1 className="text-2xl font-bold">Payment Support</h1>
          <p className="text-muted-foreground">View and manage payment queries</p>
        </div>
        {(payments as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No pending payment queries</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(payments as any[]).map((p: any) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{p.transactionId || p.id}</p>
                      <p className="text-sm text-muted-foreground">{formatDate(p.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">{formatCurrency(p.totalAmount || 0)}</span>
                      <Badge variant="warning">{p.status?.replace(/_/g, ' ')}</Badge>
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
