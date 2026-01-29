'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { apiGet } from '@/lib/api';

interface StepProps {
  applicationId: string | null;
  onSave: (data: any) => Promise<void>;
  onNext: () => void;
}

interface StaffEntry {
  id?: string;
  name: string;
  employeeId: string;
  designation: string;
  qualification: string;
  experienceYears: number;
  isFieldCoordinator: boolean;
}

const emptyStaff: StaffEntry = {
  name: '',
  employeeId: '',
  designation: '',
  qualification: '',
  experienceYears: 0,
  isFieldCoordinator: false,
};

export function Step6StaffDetails({ applicationId, onSave, onNext }: StepProps) {
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffEntry[]>([{ ...emptyStaff }]);
  const [saving, setSaving] = useState(false);

  // Fetch existing staff
  const { data: response } = useQuery({
    queryKey: ['staff-details', applicationId],
    queryFn: () => apiGet<any>(`/staff-details/${applicationId}`),
    enabled: !!applicationId,
  });

  useEffect(() => {
    const existing = response?.data || response;
    if (Array.isArray(existing) && existing.length > 0) {
      setStaff(
        existing.map((s: any) => ({
          id: s.id,
          name: s.name || '',
          employeeId: s.employeeId || '',
          designation: s.designation || '',
          qualification: s.qualification || '',
          experienceYears: s.experienceYears || 0,
          isFieldCoordinator: s.isFieldCoordinator || false,
        })),
      );
    }
  }, [response]);

  const addStaff = () => {
    setStaff((prev) => [...prev, { ...emptyStaff }]);
  };

  const removeStaff = (index: number) => {
    if (staff.length <= 1) return;
    setStaff((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStaff = (index: number, field: keyof StaffEntry, value: any) => {
    setStaff((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const handleSave = async () => {
    const filled = staff.filter((s) => s.name && s.designation);
    if (filled.length === 0) {
      toast({ title: 'Please add at least one staff member', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await onSave({ staffDetails: staff });
      onNext();
    } catch {
      toast({ title: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Staff Details</h2>
        <p className="text-muted-foreground">
          Provide details of key technical staff involved in APCD manufacturing and installation.
        </p>
      </div>

      {staff.map((member, index) => (
        <Card key={index}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Staff Member #{index + 1}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeStaff(index)}
                disabled={staff.length <= 1}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Full Name *</Label>
                <Input
                  value={member.name}
                  onChange={(e) => updateStaff(index, 'name', e.target.value)}
                  placeholder="Full name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Employee ID</Label>
                <Input
                  value={member.employeeId}
                  onChange={(e) => updateStaff(index, 'employeeId', e.target.value)}
                  placeholder="Employee ID"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Designation *</Label>
                <Input
                  value={member.designation}
                  onChange={(e) => updateStaff(index, 'designation', e.target.value)}
                  placeholder="e.g., Senior Engineer, QC Manager"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Qualification</Label>
                <Input
                  value={member.qualification}
                  onChange={(e) => updateStaff(index, 'qualification', e.target.value)}
                  placeholder="e.g., B.Tech Mechanical, M.E. Environmental"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Experience (Years)</Label>
                <Input
                  type="number"
                  min={0}
                  value={member.experienceYears}
                  onChange={(e) =>
                    updateStaff(index, 'experienceYears', parseInt(e.target.value) || 0)
                  }
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-3 mt-6">
                <input
                  type="checkbox"
                  id={`coordinator-${index}`}
                  checked={member.isFieldCoordinator}
                  onChange={(e) => updateStaff(index, 'isFieldCoordinator', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor={`coordinator-${index}`} className="cursor-pointer">
                  Field Coordinator (for site visits)
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" onClick={addStaff} className="w-full">
        <Plus className="h-4 w-4 mr-2" /> Add Staff Member
      </Button>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onNext}>
          Skip for now
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save & Continue'}
        </Button>
      </div>
    </div>
  );
}
