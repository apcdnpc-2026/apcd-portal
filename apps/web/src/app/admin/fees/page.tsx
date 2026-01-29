'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Pencil } from 'lucide-react';
import { useState } from 'react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { apiGet, apiPut, getApiErrorMessage } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

export default function AdminFeesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFee, setEditingFee] = useState<any>(null);
  const [newAmount, setNewAmount] = useState('');

  const { data: response, isLoading } = useQuery({
    queryKey: ['admin-fees'],
    queryFn: () => apiGet<any>('/admin/fees'),
  });
  const fees = response?.data || response || [];

  const updateMutation = useMutation({
    mutationFn: ({ paymentType, baseAmount }: { paymentType: string; baseAmount: number }) =>
      apiPut(`/admin/fees/${paymentType}`, { baseAmount }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-fees'] });
      setEditDialogOpen(false);
      toast({ title: 'Fee updated successfully' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Fee Update Failed',
        description: getApiErrorMessage(error, 'Failed to update fee. Please try again.'),
        variant: 'destructive',
      });
    },
  });

  const handleEdit = (fee: any) => {
    setEditingFee(fee);
    setNewAmount(String(fee.baseAmount));
    setEditDialogOpen(true);
  };

  const handleSave = () => {
    if (!editingFee || !newAmount) return;
    updateMutation.mutate({
      paymentType: editingFee.paymentType,
      baseAmount: parseFloat(newAmount),
    });
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
          <h1 className="text-2xl font-bold">Fee Configuration</h1>
          <p className="text-muted-foreground">Manage application and empanelment fees</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(fees as any[]).map((fee: any) => (
            <Card key={fee.paymentType}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4" />
                    {fee.paymentType?.replace(/_/g, ' ')}
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(fee)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Base Amount</span>
                  <span className="font-medium">{formatCurrency(fee.baseAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">GST Rate</span>
                  <span className="font-medium">{fee.gstRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Discount</span>
                  <span className="font-medium">{fee.discountPercent}%</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-sm font-medium">Total (with GST)</span>
                  <span className="font-bold">
                    {formatCurrency(fee.baseAmount * (1 + fee.gstRate / 100))}
                  </span>
                </div>
                {fee.description && (
                  <p className="text-xs text-muted-foreground mt-2">{fee.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Fee</DialogTitle>
              <DialogDescription>
                Update the base amount for {editingFee?.paymentType?.replace(/_/g, ' ')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Current Amount</Label>
                <p className="text-lg font-bold">{formatCurrency(editingFee?.baseAmount || 0)}</p>
              </div>
              <div>
                <Label>New Base Amount (in ₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="Enter new amount"
                  className="mt-1"
                />
                {newAmount && (
                  <p className="text-sm text-muted-foreground mt-1">
                    With GST ({editingFee?.gstRate || 18}%):{' '}
                    {formatCurrency(
                      parseFloat(newAmount) * (1 + (editingFee?.gstRate || 18) / 100),
                    )}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending || !newAmount}>
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
