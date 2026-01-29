'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings } from 'lucide-react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiGet, apiPut } from '@/lib/api';

export default function AdminApcdTypesPage() {
  const queryClient = useQueryClient();

  const { data: response, isLoading } = useQuery({
    queryKey: ['admin-apcd-types'],
    queryFn: () => apiGet<any>('/admin/apcd-types'),
  });
  const types = response?.data || response || [];

  const toggleMutation = useMutation({
    mutationFn: (id: string) => apiPut<any>(`/admin/apcd-types/${id}/toggle-status`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-apcd-types'] }),
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

  // Group by category
  const grouped = (types as any[]).reduce((acc: Record<string, any[]>, type: any) => {
    const cat = type.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(type);
    return acc;
  }, {});

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">APCD Types Configuration</h1>
          <p className="text-muted-foreground">Manage Air Pollution Control Device categories</p>
        </div>

        {Object.entries(grouped).map(([category, items]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                {category}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(items as any[]).map((type: any) => (
                  <div key={type.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <span className="font-medium">{type.subType}</span>
                      {type.description && (
                        <p className="text-sm text-muted-foreground">{type.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={type.isActive ? 'success' : 'destructive'}>
                        {type.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleMutation.mutate(type.id)}
                        disabled={toggleMutation.isPending}
                      >
                        {type.isActive ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
