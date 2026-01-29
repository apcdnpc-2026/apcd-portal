'use client';

import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, FileText, Star, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function CommitteeDashboard() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['committee-dashboard'],
    queryFn: () => apiGet<any>('/dashboard/committee'),
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
          <h1 className="text-2xl font-bold">Committee Dashboard</h1>
          <p className="text-muted-foreground">Review and evaluate OEM applications</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.pendingReview || 0}</div>
              <p className="text-xs text-muted-foreground">Applications awaiting evaluation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">My Evaluations</CardTitle>
              <Star className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.myEvaluations || 0}</div>
              <p className="text-xs text-muted-foreground">Total evaluations submitted</p>
            </CardContent>
          </Card>

          <Card className="bg-blue-50 border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">Needs Your Review</CardTitle>
              <FileText className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900">
                {dashboard?.applicationsForReview?.filter((a: any) => !a.hasMyEvaluation).length || 0}
              </div>
              <p className="text-xs text-blue-700">Not yet evaluated by you</p>
            </CardContent>
          </Card>
        </div>

        {/* Applications for Review */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Applications for Review</CardTitle>
              <CardDescription>OEM applications pending committee evaluation</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/committee/pending">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {dashboard?.applicationsForReview?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardCheck className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No applications pending review</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dashboard?.applicationsForReview?.map((app: any) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{app.applicationNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {app.oemProfile?.companyName}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {app.hasMyEvaluation ? (
                        <Badge variant="success">Evaluated</Badge>
                      ) : (
                        <Badge variant="warning">Pending</Badge>
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/committee/evaluate/${app.id}`}>
                          {app.hasMyEvaluation ? 'View' : 'Evaluate'}
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evaluation Criteria Info */}
        <Card>
          <CardHeader>
            <CardTitle>Evaluation Criteria</CardTitle>
            <CardDescription>8-point evaluation system (Maximum 100 marks)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {[
                { name: 'Technical Capability', max: 15 },
                { name: 'Manufacturing Facility', max: 15 },
                { name: 'Quality Control', max: 10 },
                { name: 'Testing Facilities', max: 10 },
                { name: 'Experience & Track Record', max: 15 },
                { name: 'Financial Strength', max: 10 },
                { name: 'Statutory Compliance', max: 15 },
                { name: 'After Sales Service', max: 10 },
              ].map((criteria) => (
                <div key={criteria.name} className="p-3 rounded-lg border">
                  <p className="text-sm font-medium">{criteria.name}</p>
                  <p className="text-xs text-muted-foreground">Max: {criteria.max} marks</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Minimum passing score: 60 marks out of 100
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
