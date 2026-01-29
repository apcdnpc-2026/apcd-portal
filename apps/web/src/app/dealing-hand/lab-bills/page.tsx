'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Upload } from 'lucide-react';
import { useState } from 'react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { apiGet, uploadFile } from '@/lib/api';

export default function LabBillsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: response, isLoading } = useQuery({
    queryKey: ['lab-bills'],
    queryFn: () => apiGet<any>('/dashboard/dealing-hand'),
  });
  const applications = response?.data?.recentApplications || response?.recentApplications || [];

  const handleUploadClick = (app: any) => {
    setSelectedApp(app);
    setFile(null);
    setUploadDialogOpen(true);
  };

  const handleUpload = async () => {
    if (!file || !selectedApp) return;

    setUploading(true);
    try {
      await uploadFile(`/attachments/${selectedApp.id}/upload`, file, undefined, {
        documentType: 'LAB_TEST_REPORT',
      });
      queryClient.invalidateQueries({ queryKey: ['lab-bills'] });
      setUploadDialogOpen(false);
      toast({ title: 'Lab bill uploaded successfully' });
    } catch {
      toast({
        title: 'Upload Failed',
        description: 'Failed to upload lab bill. Please check the file and try again.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
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
          <h1 className="text-2xl font-bold">Lab Bills</h1>
          <p className="text-muted-foreground">Upload and manage lab testing bills</p>
        </div>
        {applications.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Receipt className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No applications requiring lab bills</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {applications.map((app: any) => (
              <Card key={app.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{app.applicationNumber}</p>
                      <p className="text-sm text-muted-foreground">{app.oemProfile?.companyName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={app.status === 'LAB_TESTING' ? 'warning' : 'default'}>
                        {app.status?.replace(/_/g, ' ')}
                      </Badge>
                      <Button size="sm" onClick={() => handleUploadClick(app)}>
                        <Upload className="h-4 w-4 mr-1" /> Upload Bill
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Lab Bill</DialogTitle>
              <DialogDescription>
                Upload lab test report/bill for application {selectedApp?.applicationNumber}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Application</Label>
                <p className="font-medium">{selectedApp?.applicationNumber}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedApp?.oemProfile?.companyName}
                </p>
              </div>
              <div>
                <Label>Select File *</Label>
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx"
                  className="mt-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                {file && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={uploading || !file}>
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
