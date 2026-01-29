'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardCheck, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { apiGet, apiPost } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const OVERALL_RESULTS = [
  { value: 'PASS', label: 'Pass', color: 'text-green-700' },
  { value: 'FAIL', label: 'Fail', color: 'text-red-700' },
  { value: 'CONDITIONAL', label: 'Conditional', color: 'text-yellow-700' },
];

interface ReportForm {
  siteIndex: number;
  visitDate: string;
  industryName: string;
  location: string;
  apcdCondition: string;
  isOperational: boolean;
  isEmissionCompliant: boolean;
  inletReading: string;
  outletReading: string;
  pressureDrop: string;
  observations: string;
  recommendations: string;
  overallResult: string;
}

const defaultForm: ReportForm = {
  siteIndex: 0,
  visitDate: new Date().toISOString().split('T')[0] || '',
  industryName: '',
  location: '',
  apcdCondition: '',
  isOperational: true,
  isEmissionCompliant: true,
  inletReading: '',
  outletReading: '',
  pressureDrop: '',
  observations: '',
  recommendations: '',
  overallResult: '',
};

export default function FieldVerificationReportPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const applicationId = params.id as string;

  const [form, setForm] = useState<ReportForm>(defaultForm);

  // Fetch sites
  const { data: sitesResponse } = useQuery({
    queryKey: ['field-sites', applicationId],
    queryFn: () => apiGet<any>(`/field-verification/sites/${applicationId}`),
  });
  const sites = sitesResponse?.data || sitesResponse || [];

  // Fetch existing reports
  const { data: reportsResponse, isLoading } = useQuery({
    queryKey: ['field-reports', applicationId],
    queryFn: () => apiGet<any>(`/field-verification/reports/${applicationId}`),
  });
  const existingReports = reportsResponse?.data || reportsResponse || [];

  // Submit report mutation
  const submitMutation = useMutation({
    mutationFn: (data: any) => apiPost(`/field-verification/report/${applicationId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['field-reports', applicationId] });
      toast({ title: 'Field verification report submitted' });
      router.push('/field-verification');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'Failed to submit report';
      toast({ title: msg, variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    if (!form.overallResult) {
      toast({ title: 'Please select an overall result', variant: 'destructive' });
      return;
    }
    if (!form.observations) {
      toast({ title: 'Please add observations', variant: 'destructive' });
      return;
    }
    submitMutation.mutate(form);
  };

  const updateForm = (field: keyof ReportForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Pre-fill from selected site
  const handleSiteSelect = (siteIndex: string) => {
    const idx = parseInt(siteIndex);
    const site = (sites as any[])[idx];
    if (site) {
      setForm((prev) => ({
        ...prev,
        siteIndex: idx,
        industryName: site.industryName || '',
        location: site.location || site.address || '',
      }));
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
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/field-verification">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Field Verification Report</h1>
            <p className="text-muted-foreground">Application: {applicationId.slice(0, 8)}...</p>
          </div>
        </div>

        {/* Existing Reports */}
        {(existingReports as any[]).length > 0 && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="text-blue-800">
                Previous Reports ({(existingReports as any[]).length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(existingReports as any[]).map((report: any, i: number) => (
                  <div key={i} className="p-3 rounded border bg-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          Site {report.siteIndex + 1}: {report.industryName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Visited: {formatDate(report.visitDate)} &bull; By:{' '}
                          {report.verifier?.firstName} {report.verifier?.lastName}
                        </p>
                      </div>
                      <Badge
                        variant={
                          report.overallResult === 'PASS'
                            ? 'default'
                            : report.overallResult === 'FAIL'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {report.overallResult}
                      </Badge>
                    </div>
                    {report.observations && (
                      <p className="text-sm mt-2 text-muted-foreground">{report.observations}</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Report Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" /> Submit Verification Report
            </CardTitle>
            <CardDescription>
              Complete the field verification report for an installation site
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Site Selection */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Select Site</Label>
                {(sites as any[]).length > 0 ? (
                  <Select onValueChange={handleSiteSelect}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select installation site" />
                    </SelectTrigger>
                    <SelectContent>
                      {(sites as any[]).map((site: any, i: number) => (
                        <SelectItem key={i} value={String(i)}>
                          Site {i + 1}: {site.industryName || site.location || `Site ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    No sites configured. Enter details manually.
                  </p>
                )}
              </div>
              <div>
                <Label>Visit Date *</Label>
                <Input
                  type="date"
                  value={form.visitDate}
                  onChange={(e) => updateForm('visitDate', e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Location Details */}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Industry Name</Label>
                <Input
                  value={form.industryName}
                  onChange={(e) => updateForm('industryName', e.target.value)}
                  placeholder="Name of the industry / plant"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  value={form.location}
                  onChange={(e) => updateForm('location', e.target.value)}
                  placeholder="Site location / address"
                  className="mt-1"
                />
              </div>
            </div>

            <Separator />

            {/* APCD Inspection */}
            <h4 className="font-medium">APCD Inspection</h4>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>APCD Condition</Label>
                <Input
                  value={form.apcdCondition}
                  onChange={(e) => updateForm('apcdCondition', e.target.value)}
                  placeholder="e.g., Good, Fair, Poor"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Operational?</Label>
                <Select
                  value={form.isOperational ? 'yes' : 'no'}
                  onValueChange={(v) => updateForm('isOperational', v === 'yes')}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes - Operational</SelectItem>
                    <SelectItem value="no">No - Not Operational</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Emission Compliant?</Label>
                <Select
                  value={form.isEmissionCompliant ? 'yes' : 'no'}
                  onValueChange={(v) => updateForm('isEmissionCompliant', v === 'yes')}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes - Compliant</SelectItem>
                    <SelectItem value="no">No - Non-compliant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Readings */}
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>Inlet Reading (mg/Nm³)</Label>
                <Input
                  value={form.inletReading}
                  onChange={(e) => updateForm('inletReading', e.target.value)}
                  placeholder="e.g., 500"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Outlet Reading (mg/Nm³)</Label>
                <Input
                  value={form.outletReading}
                  onChange={(e) => updateForm('outletReading', e.target.value)}
                  placeholder="e.g., 50"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Pressure Drop (mmWC)</Label>
                <Input
                  value={form.pressureDrop}
                  onChange={(e) => updateForm('pressureDrop', e.target.value)}
                  placeholder="e.g., 120"
                  className="mt-1"
                />
              </div>
            </div>

            <Separator />

            {/* Observations & Recommendations */}
            <div>
              <Label>Observations *</Label>
              <Textarea
                value={form.observations}
                onChange={(e) => updateForm('observations', e.target.value)}
                placeholder="Detailed observations from the site visit..."
                rows={4}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Recommendations</Label>
              <Textarea
                value={form.recommendations}
                onChange={(e) => updateForm('recommendations', e.target.value)}
                placeholder="Recommendations for improvement or compliance..."
                rows={3}
                className="mt-1"
              />
            </div>

            {/* Overall Result */}
            <div>
              <Label className="text-base font-medium">Overall Result *</Label>
              <Select
                value={form.overallResult}
                onValueChange={(v) => updateForm('overallResult', v)}
              >
                <SelectTrigger className="mt-2 max-w-xs">
                  <SelectValue placeholder="Select overall result" />
                </SelectTrigger>
                <SelectContent>
                  {OVERALL_RESULTS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className={r.color}>{r.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" asChild>
                <Link href="/field-verification">Cancel</Link>
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending || !form.overallResult || !form.observations}
              >
                {submitMutation.isPending ? (
                  'Submitting...'
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Submit Report
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
