'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  FileText,
  CreditCard,
  Users,
  Award,
  TrendingUp,
  MapPin,
  Settings,
} from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatCurrency, getStatusLabel } from '@/lib/utils';

export default function MisReportsPage() {
  const { data: report, isLoading } = useQuery({
    queryKey: ['mis-report'],
    queryFn: async () => {
      const response = await apiGet<any>('/admin/reports/mis');
      return response?.data || response;
    },
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
          <h1 className="text-2xl font-bold">MIS Reports</h1>
          <p className="text-muted-foreground">Management Information System - comprehensive overview</p>
        </div>

        {/* Revenue Summary */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="bg-green-50 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-800">Revenue This Month</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900">
                {formatCurrency(report?.summary?.revenueThisMonth || 0)}
              </div>
              <p className="text-xs text-green-700">
                {report?.summary?.paymentsThisMonth || 0} payments
              </p>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">Revenue Last Month</CardTitle>
              <CreditCard className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900">
                {formatCurrency(report?.summary?.revenueLastMonth || 0)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-purple-50 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-purple-800">Revenue This Year</CardTitle>
              <BarChart3 className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900">
                {formatCurrency(report?.summary?.revenueThisYear || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{report?.summary?.totalApplications || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* Applications by Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Applications by Status
            </CardTitle>
            <CardDescription>All-time application distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Object.entries(report?.applicationsByStatus || {}).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm">{getStatusLabel(status)}</span>
                  <Badge variant="secondary">{String(count)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Certificates by Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Certificates by Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(report?.certificatesByStatus || {}).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between p-3 rounded-lg border">
                    <span className="text-sm">{status.replace(/_/g, ' ')}</span>
                    <Badge variant="secondary">{String(count)}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Users by Role */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Users by Role
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(report?.usersByRole || {}).map(([role, count]) => (
                  <div key={role} className="flex items-center justify-between p-3 rounded-lg border">
                    <span className="text-sm">{role.replace(/_/g, ' ')}</span>
                    <Badge variant="secondary">{String(count)}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payments This Month */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payments This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3">
              {(report?.paymentsSummary || []).map((p: any) => (
                <div key={p.status} className="p-4 rounded-lg border">
                  <p className="text-sm font-medium">{p.status?.replace(/_/g, ' ')}</p>
                  <p className="text-2xl font-bold mt-1">{formatCurrency(p.amount || 0)}</p>
                  <p className="text-xs text-muted-foreground">{p.count} payment(s)</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* State-wise Applications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                State-wise Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(report?.stateWiseApplications || []).map((s: any) => (
                  <div key={s.state} className="flex items-center justify-between p-2 rounded border">
                    <span className="text-sm">{s.state}</span>
                    <Badge variant="secondary">{s.count}</Badge>
                  </div>
                ))}
                {(report?.stateWiseApplications?.length || 0) === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* APCD Type-wise Applications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                APCD Type-wise Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(report?.apcdTypeWiseApplications || []).map((a: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded border">
                    <span className="text-sm">
                      {a.category}: {a.subType}
                    </span>
                    <Badge variant="secondary">{a.count}</Badge>
                  </div>
                ))}
                {(report?.apcdTypeWiseApplications?.length || 0) === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No data available</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
