'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, CheckCircle, XCircle } from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet, apiPut } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function PaymentVerifyPage() {
  const queryClient = useQueryClient();
  const { data: response, isLoading } = useQuery({
    queryKey: ['payments-verify'],
    queryFn: () => apiGet<any>('/payments/pending-verification'),
  });
  const payments = response?.data || response || [];

  const verifyMutation = useMutation({
    mutationFn: ({ id, isVerified }: { id: string; isVerified: boolean }) =>
      apiPut<any>(`/payments/${id}/verify`, { isVerified }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payments-verify'] }),
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
          <h1 className="text-2xl font-bold">Payment Verification</h1>
          <p className="text-muted-foreground">Verify NEFT/RTGS payments from OEMs</p>
        </div>
        {(payments as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CreditCard className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No payments pending verification</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(payments as any[]).map((p: any) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Txn: {p.transactionId || p.id?.slice(0, 8)}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.paymentType?.replace(/_/g, ' ')} &bull; {formatDate(p.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">{formatCurrency(p.totalAmount || 0)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600"
                        onClick={() => verifyMutation.mutate({ id: p.id, isVerified: true })}
                        disabled={verifyMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" /> Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600"
                        onClick={() => verifyMutation.mutate({ id: p.id, isVerified: false })}
                        disabled={verifyMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 mr-1" /> Reject
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
