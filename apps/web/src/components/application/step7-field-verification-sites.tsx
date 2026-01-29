'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, MapPin } from 'lucide-react';
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

interface SiteEntry {
  id?: string;
  industryName: string;
  location: string;
  address: string;
  contactPerson: string;
  contactPhone: string;
  apcdType: string;
  designCapacity: string;
  installationYear: string;
}

const emptySite: SiteEntry = {
  industryName: '',
  location: '',
  address: '',
  contactPerson: '',
  contactPhone: '',
  apcdType: '',
  designCapacity: '',
  installationYear: '',
};

export function Step7FieldVerificationSites({ applicationId, onSave, onNext }: StepProps) {
  const { toast } = useToast();
  const [sites, setSites] = useState<SiteEntry[]>([{ ...emptySite }]);
  const [saving, setSaving] = useState(false);

  // Fetch existing sites
  const { data: response } = useQuery({
    queryKey: ['field-verification-sites', applicationId],
    queryFn: () => apiGet<any>(`/field-verification/sites/${applicationId}`),
    enabled: !!applicationId,
  });

  useEffect(() => {
    const existing = response?.data || response;
    if (Array.isArray(existing) && existing.length > 0) {
      setSites(
        existing.map((s: any) => ({
          id: s.id,
          industryName: s.industryName || '',
          location: s.location || '',
          address: s.address || '',
          contactPerson: s.contactPerson || '',
          contactPhone: s.contactPhone || '',
          apcdType: s.apcdType || '',
          designCapacity: s.designCapacity || '',
          installationYear: s.installationYear || '',
        })),
      );
    }
  }, [response]);

  const addSite = () => {
    if (sites.length >= 3) {
      toast({ title: 'Maximum 3 sites allowed', variant: 'destructive' });
      return;
    }
    setSites((prev) => [...prev, { ...emptySite }]);
  };

  const removeSite = (index: number) => {
    if (sites.length <= 1) return;
    setSites((prev) => prev.filter((_, i) => i !== index));
  };

  const updateSite = (index: number, field: keyof SiteEntry, value: string) => {
    setSites((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const handleSave = async () => {
    const filled = sites.filter((s) => s.industryName && s.location);
    if (filled.length === 0) {
      toast({ title: 'Please add at least one verification site', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await onSave({ fieldVerificationSites: sites });
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
        <h2 className="text-xl font-bold">Field Verification Sites</h2>
        <p className="text-muted-foreground">
          Provide up to 3 installation sites where APCD systems can be verified by field inspectors.
          At least one site is required.
        </p>
      </div>

      {sites.map((site, index) => (
        <Card key={index}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Site #{index + 1}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeSite(index)}
                disabled={sites.length <= 1}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Industry / Plant Name *</Label>
                <Input
                  value={site.industryName}
                  onChange={(e) => updateSite(index, 'industryName', e.target.value)}
                  placeholder="Name of the industry"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Location (City, State) *</Label>
                <Input
                  value={site.location}
                  onChange={(e) => updateSite(index, 'location', e.target.value)}
                  placeholder="e.g., Pune, Maharashtra"
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Full Address</Label>
                <Input
                  value={site.address}
                  onChange={(e) => updateSite(index, 'address', e.target.value)}
                  placeholder="Complete site address"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Contact Person (Site Representative)</Label>
                <Input
                  value={site.contactPerson}
                  onChange={(e) => updateSite(index, 'contactPerson', e.target.value)}
                  placeholder="Name of site contact"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Contact Phone</Label>
                <Input
                  value={site.contactPhone}
                  onChange={(e) => updateSite(index, 'contactPhone', e.target.value)}
                  placeholder="Phone number"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>APCD Type Installed</Label>
                <Input
                  value={site.apcdType}
                  onChange={(e) => updateSite(index, 'apcdType', e.target.value)}
                  placeholder="e.g., Pulse Jet Baghouse"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Design Capacity</Label>
                <Input
                  value={site.designCapacity}
                  onChange={(e) => updateSite(index, 'designCapacity', e.target.value)}
                  placeholder="e.g., 50,000 Nm³/hr"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Installation Year</Label>
                <Input
                  value={site.installationYear}
                  onChange={(e) => updateSite(index, 'installationYear', e.target.value)}
                  placeholder="e.g., 2023"
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {sites.length < 3 && (
        <Button variant="outline" onClick={addSite} className="w-full">
          <Plus className="h-4 w-4 mr-2" /> Add Another Site ({sites.length}/3)
        </Button>
      )}

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
