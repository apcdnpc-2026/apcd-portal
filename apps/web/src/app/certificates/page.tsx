'use client';

import { useQuery } from '@tanstack/react-query';
import { Award, Download } from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { api, apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function CertificatesPage() {
  const { toast } = useToast();

  const { data: response, isLoading } = useQuery({
    queryKey: ['my-certificates'],
    queryFn: () => apiGet<any>('/certificates/my-certificates'),
  });
  const certificates = response?.data || response || [];

  const handleDownload = async (certId: string, certNumber: string) => {
    try {
      const response = await api.get(`/certificates/${certId}/download`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Certificate_${certNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      toast({
        title: 'Download Failed',
        description: 'Failed to download certificate. Please try again.',
        variant: 'destructive',
      });
    }
  };

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
          <h1 className="text-2xl font-bold">My Certificates</h1>
          <p className="text-muted-foreground">Your empanelment certificates</p>
        </div>
        {(certificates as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Award className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No certificates issued yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(certificates as any[]).map((cert: any) => (
              <Card key={cert.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-semibold">{cert.certificateNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        Issued: {formatDate(cert.issuedDate)} &bull; Valid until:{' '}
                        {formatDate(cert.validUntil)}
                      </p>
                      {cert.certificateType && (
                        <Badge variant="outline" className="mt-1">
                          {cert.certificateType?.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={cert.status === 'ACTIVE' ? 'success' : 'destructive'}>
                        {cert.status}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(cert.id, cert.certificateNumber)}
                      >
                        <Download className="h-4 w-4 mr-1" /> Download
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
