'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, CreditCard, MapPin, ClipboardCheck, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';

export default function OfficerDashboard() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['officer-dashboard'],
    queryFn: () => apiGet<any>('/dashboard/officer'),
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
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Officer Dashboard</h1>
          <p className="text-muted-foreground">Application verification and management</p>
        </div>

        {/* Today's Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">
                Today's New Applications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-900">
                {dashboard?.todayStats?.newApplications || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-50 border-green-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-800">
                Today's Submissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-900">
                {dashboard?.todayStats?.submittedApplications || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-purple-50 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-purple-800">
                Today's Payments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-900">
                {dashboard?.todayStats?.paymentsReceived || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.totalApplications || 0}</div>
              <Link href="/verification" className="text-xs text-primary hover:underline">
                View all applications
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.pendingPayments || 0}</div>
              <Link href="/payments/verify" className="text-xs text-primary hover:underline">
                Verify payments
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Field Verification</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.pendingFieldVerifications || 0}</div>
              <Link href="/field-verification" className="text-xs text-primary hover:underline">
                Schedule verifications
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Committee Review</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.pendingCommitteeReview || 0}</div>
              <Link href="/committee" className="text-xs text-primary hover:underline">
                View pending
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Applications by Status */}
        <Card>
          <CardHeader>
            <CardTitle>Applications by Status</CardTitle>
            <CardDescription>Distribution of all applications</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Object.entries(dashboard?.applicationsByStatus || {}).map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <span className="text-sm">{getStatusLabel(status)}</span>
                  <Badge className={getStatusColor(status)}>{String(count)}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Applications */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Applications</CardTitle>
              <CardDescription>Latest submitted applications</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/verification">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {dashboard?.recentApplications?.slice(0, 5).map((app: any) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <p className="font-medium">{app.applicationNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      {app.oemProfile?.companyName} • {formatDate(app.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge className={getStatusColor(app.status)}>
                      {getStatusLabel(app.status)}
                    </Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/verification/${app.id}`}>Review</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
