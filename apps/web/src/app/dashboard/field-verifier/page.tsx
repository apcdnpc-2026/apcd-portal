'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPin, ClipboardCheck, Calendar, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function FieldVerifierDashboard() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['field-verifier-dashboard'],
    queryFn: () => apiGet<any>('/dashboard/field-verifier'),
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
          <h1 className="text-2xl font-bold">Field Verifier Dashboard</h1>
          <p className="text-muted-foreground">Manage your field verification assignments</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Assigned</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.assignedCount || 0}</div>
              <p className="text-xs text-muted-foreground">Pending verifications</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.completedCount || 0}</div>
              <p className="text-xs text-muted-foreground">Total completed</p>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">Upcoming</CardTitle>
              <Calendar className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900">
                {dashboard?.upcomingVerifications?.length || 0}
              </div>
              <p className="text-xs text-blue-700">Scheduled visits</p>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Verifications */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Upcoming Verifications</CardTitle>
              <CardDescription>Your scheduled factory visits</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/field-verification/assignments">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {dashboard?.upcomingVerifications?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No upcoming verifications scheduled</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dashboard?.upcomingVerifications?.map((verification: any) => (
                  <div
                    key={verification.id}
                    className="p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="info">
                            {formatDate(verification.scheduledDate)}
                          </Badge>
                        </div>
                        <p className="font-medium">
                          {verification.application?.oemProfile?.companyName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {verification.application?.oemProfile?.factoryAddress}
                        </p>
                      </div>
                      <Button size="sm" asChild>
                        <Link href={`/field-verification/${verification.id}`}>
                          View Details
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Verification Checklist */}
        <Card>
          <CardHeader>
            <CardTitle>Verification Checklist</CardTitle>
            <CardDescription>Items to verify during factory visit</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                'Factory premises and infrastructure',
                'Manufacturing equipment and machinery',
                'Quality control systems',
                'Testing facilities',
                'Raw material storage',
                'Finished goods inventory',
                'Staff qualifications and training',
                'Safety measures and compliance',
                'Environmental compliance',
                'Documentation and records',
              ].map((item, index) => (
                <div key={index} className="flex items-center gap-2 p-2 rounded border">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </div>
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
