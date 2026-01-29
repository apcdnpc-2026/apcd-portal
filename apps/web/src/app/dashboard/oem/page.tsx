'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, CreditCard, Award, AlertCircle, Plus, ArrowRight, Building2, UserCircle } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatDate, formatCurrency, getStatusColor, getStatusLabel } from '@/lib/utils';

export default function OEMDashboard() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['oem-dashboard'],
    queryFn: () => apiGet<{ success: boolean; data: any }>('/dashboard/oem'),
  });

  // Check if profile exists
  const { data: profileResponse, isLoading: profileLoading } = useQuery({
    queryKey: ['oem-profile'],
    queryFn: async () => {
      try {
        const response = await apiGet<{ success: boolean; data: any }>('/oem-profile');
        return response;
      } catch (error: any) {
        if (error.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
  });

  const dashboard = response?.data;
  const hasProfile = !!profileResponse?.data;

  if (isLoading || profileLoading) {
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
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Welcome to APCD OEM Empanelment Portal</p>
          </div>
          {hasProfile ? (
            <Button asChild>
              <Link href="/applications/new">
                <Plus className="mr-2 h-4 w-4" />
                New Application
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/profile">
                <UserCircle className="mr-2 h-4 w-4" />
                Complete Profile
              </Link>
            </Button>
          )}
        </div>

        {/* Profile Required Alert - Show prominently if no profile */}
        {!hasProfile && (
          <Card className="border-red-300 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <Building2 className="h-6 w-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-red-800">Complete Your Company Profile</h3>
                  <p className="text-red-700 mt-1">
                    You must complete your company profile before you can start an empanelment application.
                    This includes company details, GST registration, PAN, and address information.
                  </p>
                  <div className="mt-4 flex gap-3">
                    <Button asChild>
                      <Link href="/profile">
                        <Building2 className="mr-2 h-4 w-4" />
                        Complete Profile Now
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Profile Complete Badge */}
        {hasProfile && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-full">
              <Building2 className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-green-800">
                Profile: {profileResponse?.data?.companyName}
              </p>
              <p className="text-sm text-green-700">
                GST: {profileResponse?.data?.gstRegistrationNo}
              </p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/profile">Edit Profile</Link>
            </Button>
          </div>
        )}

        {/* Alert for pending queries */}
        {dashboard?.pendingQueries > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-orange-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-orange-800">Action Required</h3>
              <p className="text-sm text-orange-700">
                You have {dashboard.pendingQueries} pending {dashboard.pendingQueries === 1 ? 'query' : 'queries'} that require your response.
              </p>
              <Button variant="link" className="p-0 h-auto text-orange-700" asChild>
                <Link href="/queries">View Queries</Link>
              </Button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Applications</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.applications?.total || 0}</div>
              <p className="text-xs text-muted-foreground">
                {dashboard?.applications?.statusCounts?.DRAFT || 0} in draft
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Certificates</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.certificates?.active || 0}</div>
              <p className="text-xs text-muted-foreground">
                {dashboard?.certificates?.expiring?.length || 0} expiring soon
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(dashboard?.totalPayments || 0)}
              </div>
              <p className="text-xs text-muted-foreground">All verified payments</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Queries</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.pendingQueries || 0}</div>
              <p className="text-xs text-muted-foreground">Requires response</p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Applications */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Applications</CardTitle>
              <CardDescription>Your latest application submissions</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/applications">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {dashboard?.applications?.recent?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No applications yet</p>
                {hasProfile ? (
                  <Button className="mt-4" asChild>
                    <Link href="/applications/new">Create Your First Application</Link>
                  </Button>
                ) : (
                  <div className="mt-4">
                    <p className="text-sm mb-2">Complete your profile first to start an application</p>
                    <Button asChild>
                      <Link href="/profile">Complete Profile</Link>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {dashboard?.applications?.recent?.slice(0, 5).map((app: any) => (
                  <div
                    key={app.id}
                    className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{app.applicationNumber || 'Draft'}</p>
                      <p className="text-sm text-muted-foreground">
                        Created: {formatDate(app.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge className={getStatusColor(app.status)}>
                        {getStatusLabel(app.status)}
                      </Badge>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/applications/${app.id}`}>View</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expiring Certificates Warning */}
        {dashboard?.certificates?.expiring?.length > 0 && (
          <Card className="border-orange-200 bg-orange-50">
            <CardHeader>
              <CardTitle className="text-orange-800">Certificates Expiring Soon</CardTitle>
              <CardDescription className="text-orange-700">
                The following certificates will expire within 60 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {dashboard.certificates.expiring.map((cert: any) => (
                  <div
                    key={cert.id}
                    className="flex items-center justify-between p-3 bg-white rounded border"
                  >
                    <div>
                      <p className="font-medium">{cert.certificateNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        Expires: {formatDate(cert.validUntil)}
                      </p>
                    </div>
                    <Button size="sm" asChild>
                      <Link href={`/certificates/${cert.id}/renew`}>Renew</Link>
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
