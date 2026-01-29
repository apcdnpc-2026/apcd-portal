'use client';

import { useQuery } from '@tanstack/react-query';
import { Award } from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function AdminCertificatesPage() {
  const { data: response, isLoading } = useQuery({
    queryKey: ['admin-certificates'],
    queryFn: () => apiGet<any>('/certificates/all'),
  });
  const certificates = response?.data || response || [];

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
          <h1 className="text-2xl font-bold">Certificates</h1>
          <p className="text-muted-foreground">All issued empanelment certificates</p>
        </div>

        {(certificates as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Award className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No certificates issued yet</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Certificate No.</th>
                      <th className="text-left p-3 font-medium">Company</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Issued</th>
                      <th className="text-left p-3 font-medium">Valid Until</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(certificates as any[]).map((cert: any) => (
                      <tr key={cert.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-medium">{cert.certificateNumber}</td>
                        <td className="p-3">{cert.application?.oemProfile?.companyName || '-'}</td>
                        <td className="p-3">
                          <Badge variant={cert.status === 'ACTIVE' ? 'success' : 'destructive'}>
                            {cert.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">{formatDate(cert.issuedDate)}</td>
                        <td className="p-3 text-muted-foreground">{formatDate(cert.validUntil)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
