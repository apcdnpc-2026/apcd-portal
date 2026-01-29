'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, CheckCircle2, Star } from 'lucide-react';
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
import { formatDate, getStatusLabel, getStatusColor } from '@/lib/utils';

const CRITERIA = [
  {
    key: 'EXPERIENCE_SCOPE',
    label: 'Experience & Scope of Supply',
    description: 'Relevant industry experience and product range',
  },
  {
    key: 'TECHNICAL_SPECIFICATION',
    label: 'Technical Specification of APCDs',
    description: 'Design specs, efficiency, compliance with standards',
  },
  {
    key: 'TECHNICAL_TEAM',
    label: 'Technical Team & Capability',
    description: 'Qualified staff, R&D capability, lab facilities',
  },
  {
    key: 'FINANCIAL_STANDING',
    label: 'Financial Standing',
    description: 'Turnover, profitability, financial stability',
  },
  {
    key: 'LEGAL_QUALITY_COMPLIANCE',
    label: 'Legal & Quality Compliance',
    description: 'ISO/BIS certifications, regulatory compliance',
  },
  {
    key: 'COMPLAINT_HANDLING',
    label: 'Customer Complaint Handling',
    description: 'Warranty policy, after-sales service, resolution track record',
  },
  {
    key: 'CLIENT_FEEDBACK',
    label: 'Client Feedback',
    description: 'References, testimonials, repeat customer ratio',
  },
  {
    key: 'GLOBAL_SUPPLY',
    label: 'Global Supply (Optional)',
    description: 'International installations, export capability',
  },
];

const RECOMMENDATIONS = [
  { value: 'APPROVE', label: 'Approve', color: 'text-green-700' },
  { value: 'REJECT', label: 'Reject', color: 'text-red-700' },
  { value: 'NEED_MORE_INFO', label: 'Need More Information', color: 'text-yellow-700' },
  {
    value: 'FIELD_VERIFICATION_REQUIRED',
    label: 'Field Verification Required',
    color: 'text-purple-700',
  },
];

type ScoreMap = Record<string, { score: number; remarks: string }>;

export default function CommitteeEvaluatePage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const applicationId = params.id as string;

  const [scores, setScores] = useState<ScoreMap>(() => {
    const initial: ScoreMap = {};
    CRITERIA.forEach((c) => {
      initial[c.key] = { score: 0, remarks: '' };
    });
    return initial;
  });
  const [recommendation, setRecommendation] = useState('');
  const [overallRemarks, setOverallRemarks] = useState('');

  // Fetch application
  const { data: response, isLoading } = useQuery({
    queryKey: ['committee-application', applicationId],
    queryFn: () => apiGet<any>(`/committee/application/${applicationId}`),
  });
  const application = response?.data || response;

  // Fetch evaluation summary (to see if already evaluated)
  const { data: summaryResponse } = useQuery({
    queryKey: ['committee-summary', applicationId],
    queryFn: () => apiGet<any>(`/committee/application/${applicationId}/summary`),
  });
  const summary = summaryResponse?.data || summaryResponse;

  // Submit evaluation mutation
  const submitMutation = useMutation({
    mutationFn: (data: any) => apiPost(`/committee/application/${applicationId}/evaluate`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['committee-summary', applicationId] });
      queryClient.invalidateQueries({ queryKey: ['committee-application', applicationId] });
      toast({ title: 'Evaluation submitted successfully' });
      router.push('/committee');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'Failed to submit evaluation';
      toast({ title: msg, variant: 'destructive' });
    },
  });

  const totalScore = Object.values(scores).reduce((sum, s) => sum + (s.score || 0), 0);
  const maxScore = CRITERIA.length * 10;

  const handleScoreChange = (key: string, score: number) => {
    const clamped = Math.min(10, Math.max(0, score));
    setScores((prev) => {
      const updated = { ...prev };
      updated[key] = { score: clamped, remarks: prev[key]?.remarks || '' };
      return updated;
    });
  };

  const handleRemarksChange = (key: string, remarks: string) => {
    setScores((prev) => {
      const updated = { ...prev };
      updated[key] = { score: prev[key]?.score || 0, remarks };
      return updated;
    });
  };

  const handleSubmit = () => {
    if (!recommendation) {
      toast({ title: 'Please select a recommendation', variant: 'destructive' });
      return;
    }
    submitMutation.mutate({
      scores: Object.entries(scores).map(([criterion, data]) => ({
        criterion,
        score: data.score,
        remarks: data.remarks,
      })),
      recommendation,
      overallRemarks,
      totalScore,
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

  if (!application) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Application not found</p>
          <Button asChild className="mt-4">
            <Link href="/committee">Back to list</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const profile = application.applicant?.oemProfile || application.oemProfile;
  const apcds = application.applicationApcds || application.apcds || [];
  const existingEvaluations = application.evaluations || summary?.evaluations || [];
  const alreadyEvaluated = existingEvaluations.length > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" asChild>
              <Link href="/committee">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Committee Evaluation</h1>
              <p className="text-muted-foreground">{application.applicationNumber}</p>
            </div>
          </div>
          <Badge className={getStatusColor(application.status)}>
            {getStatusLabel(application.status)}
          </Badge>
        </div>

        {/* Application Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Application Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Company</p>
                <p className="font-medium">{profile?.companyName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">State</p>
                <p className="font-medium">{profile?.state || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Firm Type</p>
                <p className="font-medium">{profile?.firmType?.replace(/_/g, ' ') || 'N/A'}</p>
              </div>
            </div>

            {apcds.length > 0 && (
              <>
                <Separator className="my-4" />
                <div>
                  <p className="text-sm font-medium mb-2">APCD Types Applied</p>
                  <div className="flex flex-wrap gap-2">
                    {apcds.map((apcd: any, i: number) => (
                      <Badge key={i} variant="secondary">
                        {apcd.apcdType?.category?.replace(/_/g, ' ')}: {apcd.apcdType?.subType}
                        {apcd.modelName && ` (${apcd.modelName})`}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Existing Evaluations Summary */}
        {alreadyEvaluated && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader>
              <CardTitle className="text-amber-800">
                Previous Evaluations ({existingEvaluations.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {existingEvaluations.map((ev: any, i: number) => (
                  <div key={i} className="p-3 rounded border bg-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">
                          {ev.evaluator?.firstName} {ev.evaluator?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(ev.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">
                          {ev.totalScore}/{maxScore}
                        </p>
                        <Badge variant={ev.recommendation === 'APPROVE' ? 'default' : 'secondary'}>
                          {ev.recommendation?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
                {summary?.averageScore !== undefined && (
                  <div className="p-3 rounded border-2 border-amber-300 bg-amber-100">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">Average Score</p>
                      <p className="font-bold text-lg">
                        {summary.averageScore.toFixed(1)}/{maxScore}
                        {summary.isPassing ? (
                          <span className="text-green-600 text-sm ml-2">(Passing)</span>
                        ) : (
                          <span className="text-red-600 text-sm ml-2">(Below threshold)</span>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scoring Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5" /> Evaluation Scoring
            </CardTitle>
            <CardDescription>
              Score each criterion from 0-10. Minimum passing total: 60/{maxScore}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {CRITERIA.map((criterion, index) => (
              <div key={criterion.key} className="p-4 rounded-lg border">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="font-medium">
                      {index + 1}. {criterion.label}
                    </p>
                    <p className="text-sm text-muted-foreground">{criterion.description}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      value={scores[criterion.key]?.score || 0}
                      onChange={(e) =>
                        handleScoreChange(criterion.key, parseInt(e.target.value) || 0)
                      }
                      className="w-20 text-center font-bold"
                    />
                    <span className="text-sm text-muted-foreground">/ 10</span>
                  </div>
                </div>
                <Textarea
                  placeholder="Remarks for this criterion (optional)"
                  value={scores[criterion.key]?.remarks || ''}
                  onChange={(e) => handleRemarksChange(criterion.key, e.target.value)}
                  rows={2}
                  className="mt-2"
                />
              </div>
            ))}

            <Separator />

            {/* Total Score */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
              <p className="text-lg font-bold">Total Score</p>
              <p
                className={`text-2xl font-bold ${totalScore >= 60 ? 'text-green-600' : 'text-red-600'}`}
              >
                {totalScore} / {maxScore}
              </p>
            </div>

            <Separator />

            {/* Recommendation */}
            <div>
              <Label className="text-base font-medium">Recommendation *</Label>
              <Select value={recommendation} onValueChange={setRecommendation}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select your recommendation" />
                </SelectTrigger>
                <SelectContent>
                  {RECOMMENDATIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      <span className={r.color}>{r.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Overall Remarks */}
            <div>
              <Label className="text-base font-medium">Overall Remarks</Label>
              <Textarea
                value={overallRemarks}
                onChange={(e) => setOverallRemarks(e.target.value)}
                placeholder="Provide overall assessment remarks..."
                rows={4}
                className="mt-2"
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" asChild>
                <Link href="/committee">Cancel</Link>
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending || !recommendation}
                className="min-w-[160px]"
              >
                {submitMutation.isPending ? (
                  'Submitting...'
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Submit Evaluation
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
