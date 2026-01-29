'use client';

import { useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

export default function AdminFeesPage() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['admin-fees'],
    queryFn: () => apiGet<any>('/admin/fees'),
  });
  const fees = response?.data || response || [];

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
          <h1 className="text-2xl font-bold">Fee Configuration</h1>
          <p className="text-muted-foreground">Manage application and empanelment fees</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(fees as any[]).map((fee: any) => (
            <Card key={fee.paymentType}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4" />
                  {fee.paymentType?.replace(/_/g, ' ')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Base Amount</span>
                  <span className="font-medium">{formatCurrency(fee.baseAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">GST Rate</span>
                  <span className="font-medium">{fee.gstRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Discount</span>
                  <span className="font-medium">{fee.discountPercent}%</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-sm font-medium">Total (with GST)</span>
                  <span className="font-bold">
                    {formatCurrency(fee.baseAmount * (1 + fee.gstRate / 100))}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
