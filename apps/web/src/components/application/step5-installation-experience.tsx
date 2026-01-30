'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { apiGet, apiPost } from '@/lib/api';

interface StepProps {
  applicationId: string | null;
  onSave: (data: any) => Promise<void>;
  onNext: () => void;
}

interface ExperienceEntry {
  id?: string;
  industryName: string;
  location: string;
  installationDate: string;
  emissionSource: string;
  apcdType: string;
  apcdCapacity: string;
  performanceResult: string;
}

const emptyEntry: ExperienceEntry = {
  industryName: '',
  location: '',
  installationDate: '',
  emissionSource: '',
  apcdType: '',
  apcdCapacity: '',
  performanceResult: '',
};

export function Step5InstallationExperience({ applicationId, onNext }: StepProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<ExperienceEntry[]>([
    { ...emptyEntry },
    { ...emptyEntry },
    { ...emptyEntry },
  ]);
  const [saving, setSaving] = useState(false);

  // Fetch existing entries
  const { data: response } = useQuery({
    queryKey: ['installation-experience', applicationId],
    queryFn: () => apiGet<any>(`/installation-experience/application/${applicationId}`),
    enabled: !!applicationId,
  });

  useEffect(() => {
    const existing = response?.data || response;
    if (Array.isArray(existing) && existing.length > 0) {
      setEntries(
        existing.map((e: any) => ({
          id: e.id,
          industryName: e.industryName || '',
          location: e.location || '',
          installationDate: e.installationDate
            ? new Date(e.installationDate).toISOString().split('T')[0] || ''
            : '',
          emissionSource: e.emissionSource || '',
          apcdType: e.apcdType || '',
          apcdCapacity: e.apcdCapacity || '',
          performanceResult: e.performanceResult || '',
        })),
      );
    }
  }, [response]);

  const addEntry = () => {
    setEntries((prev) => [...prev, { ...emptyEntry }]);
  };

  const removeEntry = (index: number) => {
    if (entries.length <= 3) {
      toast({ title: 'Minimum 3 entries required', variant: 'destructive' });
      return;
    }
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEntry = (index: number, field: keyof ExperienceEntry, value: string) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, [field]: value } : e)));
  };

  const handleSave = async () => {
    // Validate minimum entries
    const filledEntries = entries.filter((e) => e.industryName && e.location);
    if (filledEntries.length < 3) {
      toast({ title: 'Please fill at least 3 installation experiences', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await apiPost(`/installation-experience/${applicationId}/bulk`, { entries });
      toast({ title: 'Installation experiences saved' });
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
        <h2 className="text-xl font-bold">Installation Experience</h2>
        <p className="text-muted-foreground">
          Provide details of at least 3 APCD installations. More entries strengthen your
          application.
        </p>
      </div>

      {entries.map((entry, index) => (
        <Card key={index}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Installation #{index + 1}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeEntry(index)}
                disabled={entries.length <= 3}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Industry Name *</Label>
                <Input
                  value={entry.industryName}
                  onChange={(e) => updateEntry(index, 'industryName', e.target.value)}
                  placeholder="Name of the industry / plant"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Location *</Label>
                <Input
                  value={entry.location}
                  onChange={(e) => updateEntry(index, 'location', e.target.value)}
                  placeholder="City, State"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Installation Date</Label>
                <Input
                  type="date"
                  value={entry.installationDate}
                  onChange={(e) => updateEntry(index, 'installationDate', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Emission Source</Label>
                <Input
                  value={entry.emissionSource}
                  onChange={(e) => updateEntry(index, 'emissionSource', e.target.value)}
                  placeholder="e.g., Boiler, Kiln, Furnace"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>APCD Type</Label>
                <Input
                  value={entry.apcdType}
                  onChange={(e) => updateEntry(index, 'apcdType', e.target.value)}
                  placeholder="e.g., Pulse Jet Baghouse"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Capacity</Label>
                <Input
                  value={entry.apcdCapacity}
                  onChange={(e) => updateEntry(index, 'apcdCapacity', e.target.value)}
                  placeholder="e.g., 50,000 Nm³/hr"
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Performance Result</Label>
                <Input
                  value={entry.performanceResult}
                  onChange={(e) => updateEntry(index, 'performanceResult', e.target.value)}
                  placeholder="e.g., Outlet emission < 30 mg/Nm³, 99.5% efficiency"
                  className="mt-1"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button variant="outline" onClick={addEntry} className="w-full">
        <Plus className="h-4 w-4 mr-2" /> Add Another Installation
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
