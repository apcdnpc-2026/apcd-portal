'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, CreditCard, Award, Users, Settings, BarChart3 } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { formatCurrency, getStatusColor } from '@/lib/utils';

export default function AdminDashboard() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiGet<any>('/dashboard/admin'),
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">System overview and management</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/admin/reports">
                <BarChart3 className="mr-2 h-4 w-4" />
                Reports
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/users">
                <Users className="mr-2 h-4 w-4" />
                Manage Users
              </Link>
            </Button>
          </div>
        </div>

        {/* System Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.userStats?.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                {dashboard?.userStats?.activeToday || 0} active today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.totalApplications || 0}</div>
              <p className="text-xs text-muted-foreground">
                {dashboard?.todayStats?.newApplications || 0} today
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(dashboard?.paymentStats?.verifiedAmount || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                {dashboard?.paymentStats?.verifiedCount || 0} payments
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Certificates Issued</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {dashboard?.certificateStats?.byStatus?.ACTIVE || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {dashboard?.certificateStats?.issuedThisMonth || 0} this month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Users by Role */}
        <Card>
          <CardHeader>
            <CardTitle>Users by Role</CardTitle>
            <CardDescription>Distribution of registered users</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              {Object.entries(dashboard?.userStats?.byRole || {}).map(([role, count]) => (
                <div key={role} className="text-center p-4 rounded-lg border">
                  <div className="text-2xl font-bold">{String(count)}</div>
                  <div className="text-sm text-muted-foreground">{role.replace('_', ' ')}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Two column layout */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Payment Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
              <CardDescription>Overview of all payments</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <span className="text-green-800">Verified</span>
                <div className="text-right">
                  <div className="font-bold text-green-900">
                    {formatCurrency(dashboard?.paymentStats?.verifiedAmount || 0)}
                  </div>
                  <div className="text-sm text-green-700">
                    {dashboard?.paymentStats?.verifiedCount || 0} payments
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <span className="text-yellow-800">Pending Verification</span>
                <div className="text-right">
                  <div className="font-bold text-yellow-900">
                    {formatCurrency(dashboard?.paymentStats?.pendingAmount || 0)}
                  </div>
                  <div className="text-sm text-yellow-700">
                    {dashboard?.paymentStats?.pendingCount || 0} payments
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Certificate Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Certificate Status</CardTitle>
              <CardDescription>Overview of all certificates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {Object.entries(dashboard?.certificateStats?.byStatus || {}).map(
                ([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <Badge className={getStatusColor(status)}>{status}</Badge>
                    <span className="font-bold">{String(count)}</span>
                  </div>
                ),
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <Button variant="outline" className="h-auto py-4 flex flex-col" asChild>
                <Link href="/admin/users/new">
                  <Users className="h-6 w-6 mb-2" />
                  <span>Add User</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col" asChild>
                <Link href="/admin/fees">
                  <CreditCard className="h-6 w-6 mb-2" />
                  <span>Fee Config</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col" asChild>
                <Link href="/admin/apcd-types">
                  <Settings className="h-6 w-6 mb-2" />
                  <span>APCD Types</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col" asChild>
                <Link href="/admin/reports">
                  <BarChart3 className="h-6 w-6 mb-2" />
                  <span>Generate Report</span>
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
