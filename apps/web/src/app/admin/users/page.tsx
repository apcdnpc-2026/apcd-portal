'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const ROLES = ['OFFICER', 'COMMITTEE', 'FIELD_VERIFIER', 'DEALING_HAND', 'ADMIN', 'SUPER_ADMIN'];

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: '',
    phone: '',
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: response, isLoading } = useQuery({
    queryKey: ['admin-users', search],
    queryFn: () => apiGet<any>(`/admin/users?search=${search}`),
  });
  const users = response?.data?.users || response?.users || [];

  const toggleMutation = useMutation({
    mutationFn: (userId: string) => apiPut<any>(`/admin/users/${userId}/toggle-status`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiPost('/admin/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setDialogOpen(false);
      setNewUser({ firstName: '', lastName: '', email: '', password: '', role: '', phone: '' });
      toast({ title: 'User created successfully' });
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'Failed to create user';
      toast({ title: msg, variant: 'destructive' });
    },
  });

  const handleCreate = () => {
    if (!newUser.firstName || !newUser.email || !newUser.password || !newUser.role) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' });
      return;
    }
    createMutation.mutate(newUser);
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-muted-foreground">Manage portal users and roles</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Create User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>Add a new user to the portal</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-4 grid-cols-2">
                  <div>
                    <Label>First Name *</Label>
                    <Input
                      value={newUser.firstName}
                      onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                      placeholder="First name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Last Name</Label>
                    <Input
                      value={newUser.lastName}
                      onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                      placeholder="Last name"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="user@example.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Minimum 8 characters"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Role *</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(v) => setNewUser({ ...newUser, role: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={newUser.phone}
                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    placeholder="Phone number (optional)"
                    className="mt-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create User'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 sm:p-3 font-medium whitespace-nowrap">Name</th>
                    <th className="text-left p-2 sm:p-3 font-medium whitespace-nowrap hidden md:table-cell">
                      Email
                    </th>
                    <th className="text-left p-2 sm:p-3 font-medium whitespace-nowrap">Role</th>
                    <th className="text-left p-2 sm:p-3 font-medium whitespace-nowrap">Status</th>
                    <th className="text-left p-2 sm:p-3 font-medium whitespace-nowrap hidden lg:table-cell">
                      Last Login
                    </th>
                    <th className="text-left p-2 sm:p-3 font-medium whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(users as any[]).map((user: any) => (
                    <tr key={user.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 sm:p-3">
                        {user.firstName} {user.lastName}
                      </td>
                      <td className="p-2 sm:p-3 text-muted-foreground hidden md:table-cell">
                        {user.email}
                      </td>
                      <td className="p-2 sm:p-3">
                        <Badge variant="secondary">{user.role?.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="p-2 sm:p-3">
                        <Badge variant={user.isActive ? 'success' : 'destructive'}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="p-2 sm:p-3 text-muted-foreground hidden lg:table-cell">
                        {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                      </td>
                      <td className="p-2 sm:p-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleMutation.mutate(user.id)}
                          disabled={toggleMutation.isPending}
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
