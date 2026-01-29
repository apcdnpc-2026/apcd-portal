'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt, CreditCard, FileText, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';

export default function DealingHandDashboard() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dealing-hand-dashboard'],
    queryFn: () => apiGet<any>('/dashboard/dealing-hand'),
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
          <h1 className="text-2xl font-bold">Dealing Hand Dashboard</h1>
          <p className="text-muted-foreground">Manage lab bills and payment support</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Lab Bills</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.pendingLabBills || 0}</div>
              <Link href="/dealing-hand/lab-bills" className="text-xs text-primary hover:underline">
                View pending bills
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Uploaded Lab Bills</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.uploadedLabBills || 0}</div>
              <p className="text-xs text-muted-foreground">Total bills uploaded</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Payment Queries</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.paymentQueries || 0}</div>
              <Link href="/dealing-hand/payments" className="text-xs text-primary hover:underline">
                View payment queries
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Recent Lab Bills */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Lab Bills</CardTitle>
              <CardDescription>Lab testing bills pending upload or approval</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dealing-hand/lab-bills">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {(dashboard?.recentApplications?.length || 0) === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No pending lab bills</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dashboard?.recentApplications?.map((app: any) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{app.applicationNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {app.oemProfile?.companyName} &bull; {formatDate(app.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant={app.status === 'LAB_TESTING' ? 'warning' : 'default'}>
                        {app.status?.replace(/_/g, ' ')}
                      </Badge>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/dealing-hand/lab-bills?app=${app.id}`}>Upload Bill</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
