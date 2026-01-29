'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  FileText,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertTriangle,
  Building2,
  MapPin,
  Phone,
  Mail,
  Eye,
  Users,
  ClipboardList,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import {
  formatDate,
  formatDateTime,
  getStatusLabel,
  getStatusColor,
  formatFileSize,
} from '@/lib/utils';

const DOCUMENT_TYPES = [
  'COMPANY_REGISTRATION',
  'GST_CERTIFICATE',
  'PAN_CARD',
  'TECHNICAL_BROCHURE',
  'TEST_REPORT',
  'ISO_CERTIFICATE',
  'BIS_CERTIFICATE',
  'PERFORMANCE_CERTIFICATE',
  'OTHER',
];

export default function VerificationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const applicationId = params.id as string;

  const [queryDialogOpen, setQueryDialogOpen] = useState(false);
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [forwardType, setForwardType] = useState<'committee' | 'field'>('committee');
  const [queryForm, setQueryForm] = useState({
    subject: '',
    description: '',
    documentType: '',
    deadline: '',
  });
  const [forwardRemarks, setForwardRemarks] = useState('');

  // Fetch application details
  const { data: response, isLoading } = useQuery({
    queryKey: ['verification-application', applicationId],
    queryFn: () => apiGet<any>(`/verification/application/${applicationId}`),
  });
  const application = response?.data || response;

  // Fetch queries
  const { data: queriesResponse } = useQuery({
    queryKey: ['verification-queries', applicationId],
    queryFn: () => apiGet<any>(`/verification/application/${applicationId}/queries`),
  });
  const queries = queriesResponse?.data || queriesResponse || [];

  // Raise query mutation
  const raiseQueryMutation = useMutation({
    mutationFn: (data: any) => apiPost(`/verification/application/${applicationId}/query`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-queries', applicationId] });
      queryClient.invalidateQueries({ queryKey: ['verification-application', applicationId] });
      setQueryDialogOpen(false);
      setQueryForm({ subject: '', description: '', documentType: '', deadline: '' });
      toast({ title: 'Query raised successfully' });
    },
    onError: () => toast({ title: 'Failed to raise query', variant: 'destructive' }),
  });

  // Resolve query mutation
  const resolveQueryMutation = useMutation({
    mutationFn: ({ queryId, remarks }: { queryId: string; remarks: string }) =>
      apiPut(`/verification/query/${queryId}/resolve`, { remarks }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verification-queries', applicationId] });
      toast({ title: 'Query resolved' });
    },
  });

  // Forward to committee mutation
  const forwardToCommitteeMutation = useMutation({
    mutationFn: (remarks: string) =>
      apiPost(`/verification/application/${applicationId}/forward-to-committee`, { remarks }),
    onSuccess: () => {
      toast({ title: 'Application forwarded to committee' });
      router.push('/verification');
    },
    onError: () => toast({ title: 'Failed to forward', variant: 'destructive' }),
  });

  // Forward to field verification mutation
  const forwardToFieldMutation = useMutation({
    mutationFn: (remarks: string) =>
      apiPost(`/verification/application/${applicationId}/forward-to-field-verification`, {
        remarks,
      }),
    onSuccess: () => {
      toast({ title: 'Application forwarded to field verification' });
      router.push('/verification');
    },
    onError: () => toast({ title: 'Failed to forward', variant: 'destructive' }),
  });

  const handleRaiseQuery = () => {
    if (!queryForm.subject || !queryForm.description) return;
    raiseQueryMutation.mutate(queryForm);
  };

  const handleForward = () => {
    if (forwardType === 'committee') {
      forwardToCommitteeMutation.mutate(forwardRemarks);
    } else {
      forwardToFieldMutation.mutate(forwardRemarks);
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

  if (!application) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Application not found</p>
          <Button asChild className="mt-4">
            <Link href="/verification">Back to list</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const profile = application.applicant?.oemProfile || application.oemProfile;
  const attachments = application.attachments || [];
  const apcds = application.applicationApcds || application.apcds || [];
  const experiences = application.installationExperiences || [];
  const staffDetails = application.staffDetails || [];
  const statusHistory = application.statusHistory || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" asChild>
              <Link href="/verification">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{application.applicationNumber}</h1>
              <p className="text-muted-foreground">
                {profile?.companyName} &bull; Submitted{' '}
                {formatDate(application.submittedAt || application.createdAt)}
              </p>
            </div>
          </div>
          <Badge className={getStatusColor(application.status)}>
            {getStatusLabel(application.status)}
          </Badge>
        </div>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="details">Application Details</TabsTrigger>
            <TabsTrigger value="documents">Documents ({attachments.length})</TabsTrigger>
            <TabsTrigger value="queries">Queries ({(queries as any[]).length})</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          {/* Application Details Tab */}
          <TabsContent value="details" className="space-y-6">
            {/* Company Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" /> Company Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Company Name</p>
                    <p className="font-medium">{profile?.companyName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Firm Type</p>
                    <p className="font-medium">{profile?.firmType?.replace(/_/g, ' ') || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Address
                    </p>
                    <p className="font-medium">{profile?.fullAddress || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">State / Pin Code</p>
                    <p className="font-medium">
                      {profile?.state || 'N/A'} - {profile?.pinCode || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Contact
                    </p>
                    <p className="font-medium">{profile?.contactNo || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email
                    </p>
                    <p className="font-medium">{application.applicant?.email || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">GST No</p>
                    <p className="font-medium">{profile?.gstRegistrationNo || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">PAN No</p>
                    <p className="font-medium">{profile?.panNo || 'N/A'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* APCD Types */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" /> APCD Types Applied
                </CardTitle>
              </CardHeader>
              <CardContent>
                {apcds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No APCD types listed</p>
                ) : (
                  <div className="space-y-3">
                    {apcds.map((apcd: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div>
                          <p className="font-medium">
                            {apcd.apcdType?.category?.replace(/_/g, ' ')}: {apcd.apcdType?.subType}
                          </p>
                          {apcd.modelName && (
                            <p className="text-sm text-muted-foreground">Model: {apcd.modelName}</p>
                          )}
                          {apcd.capacity && (
                            <p className="text-sm text-muted-foreground">
                              Capacity: {apcd.capacity}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {apcd.seekingEmpanelment && (
                            <Badge variant="secondary">Seeking Empanelment</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Installation Experience */}
            {experiences.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Installation Experience ({experiences.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {experiences.map((exp: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg border">
                        <div className="grid gap-2 md:grid-cols-3">
                          <div>
                            <p className="text-xs text-muted-foreground">Industry</p>
                            <p className="text-sm font-medium">{exp.industryName}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Location</p>
                            <p className="text-sm">{exp.location}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Date</p>
                            <p className="text-sm">
                              {exp.installationDate ? formatDate(exp.installationDate) : 'N/A'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Emission Source</p>
                            <p className="text-sm">{exp.emissionSource || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">APCD Type</p>
                            <p className="text-sm">{exp.apcdType || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Result</p>
                            <p className="text-sm">{exp.performanceResult || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Staff Details */}
            {staffDetails.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" /> Staff Details ({staffDetails.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-2">Name</th>
                          <th className="text-left py-2 px-2">Designation</th>
                          <th className="text-left py-2 px-2">Qualification</th>
                          <th className="text-left py-2 px-2">Experience</th>
                          <th className="text-left py-2 px-2">Coordinator</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffDetails.map((s: any, i: number) => (
                          <tr key={i} className="border-b">
                            <td className="py-2 px-2 font-medium">{s.name}</td>
                            <td className="py-2 px-2">{s.designation}</td>
                            <td className="py-2 px-2">{s.qualification}</td>
                            <td className="py-2 px-2">{s.experienceYears} yrs</td>
                            <td className="py-2 px-2">
                              {s.isFieldCoordinator ? (
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Status History */}
            {statusHistory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Status History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {statusHistory.map((h: any, i: number) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="mt-1 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {getStatusLabel(h.status)}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDateTime(h.createdAt)}
                            </span>
                          </div>
                          {h.remarks && (
                            <p className="text-sm text-muted-foreground mt-1">{h.remarks}</p>
                          )}
                          {h.changedBy && (
                            <p className="text-xs text-muted-foreground">
                              By: {h.changedBy.firstName} {h.changedBy.lastName}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" /> Uploaded Documents
                </CardTitle>
                <CardDescription>
                  Review all documents submitted with this application
                </CardDescription>
              </CardHeader>
              <CardContent>
                {attachments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No documents uploaded
                  </p>
                ) : (
                  <div className="space-y-3">
                    {attachments.map((doc: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">
                              {doc.originalName || doc.fileName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {doc.documentType?.replace(/_/g, ' ')} &bull;{' '}
                              {formatFileSize(doc.fileSizeBytes || 0)}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {doc.fileUrl && (
                            <Button variant="outline" size="sm" asChild>
                              <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                                <Eye className="h-4 w-4 mr-1" /> View
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Queries Tab */}
          <TabsContent value="queries" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Queries</h3>
              <Dialog open={queryDialogOpen} onOpenChange={setQueryDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <MessageSquare className="h-4 w-4 mr-1" /> Raise Query
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Raise Query</DialogTitle>
                    <DialogDescription>
                      Send a query to the applicant regarding this application
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Subject *</Label>
                      <Input
                        value={queryForm.subject}
                        onChange={(e) => setQueryForm({ ...queryForm, subject: e.target.value })}
                        placeholder="Brief subject of the query"
                      />
                    </div>
                    <div>
                      <Label>Document Type</Label>
                      <Select
                        value={queryForm.documentType}
                        onValueChange={(v) => setQueryForm({ ...queryForm, documentType: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select document type (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TYPES.map((dt) => (
                            <SelectItem key={dt} value={dt}>
                              {dt.replace(/_/g, ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Description *</Label>
                      <Textarea
                        value={queryForm.description}
                        onChange={(e) =>
                          setQueryForm({ ...queryForm, description: e.target.value })
                        }
                        placeholder="Describe the query in detail..."
                        rows={4}
                      />
                    </div>
                    <div>
                      <Label>Response Deadline</Label>
                      <Input
                        type="date"
                        value={queryForm.deadline}
                        onChange={(e) => setQueryForm({ ...queryForm, deadline: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setQueryDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleRaiseQuery}
                      disabled={
                        raiseQueryMutation.isPending || !queryForm.subject || !queryForm.description
                      }
                    >
                      {raiseQueryMutation.isPending ? 'Sending...' : 'Send Query'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {(queries as any[]).length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No queries raised yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {(queries as any[]).map((q: any) => (
                  <Card key={q.id} className={q.status === 'RESOLVED' ? 'opacity-70' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium">{q.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(q.createdAt)}
                            {q.documentType && ` • ${q.documentType.replace(/_/g, ' ')}`}
                          </p>
                        </div>
                        <Badge
                          variant={
                            q.status === 'RESOLVED'
                              ? 'secondary'
                              : q.status === 'RESPONDED'
                                ? 'default'
                                : 'destructive'
                          }
                        >
                          {q.status?.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="text-sm mb-3">{q.description}</p>

                      {/* Responses */}
                      {q.responses && q.responses.length > 0 && (
                        <div className="ml-4 border-l-2 pl-4 space-y-2 mb-3">
                          {q.responses.map((r: any, ri: number) => (
                            <div key={ri} className="bg-muted/50 p-3 rounded">
                              <p className="text-sm">{r.message}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {r.responder?.firstName} {r.responder?.lastName} &bull;{' '}
                                {formatDateTime(r.createdAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {q.status === 'RESPONDED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            resolveQueryMutation.mutate({
                              queryId: q.id,
                              remarks: 'Resolved after review',
                            })
                          }
                          disabled={resolveQueryMutation.isPending}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Resolved
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Actions Tab */}
          <TabsContent value="actions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Verification Actions</CardTitle>
                <CardDescription>Forward the application for further processing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Dialog open={forwardDialogOpen} onOpenChange={setForwardDialogOpen}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="border-blue-200 bg-blue-50/50">
                      <CardContent className="p-4">
                        <h4 className="font-medium mb-1">Forward to Committee</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Send for expert committee evaluation and scoring
                        </p>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            onClick={() => {
                              setForwardType('committee');
                              setForwardRemarks('');
                            }}
                          >
                            <Send className="h-4 w-4 mr-1" /> Forward to Committee
                          </Button>
                        </DialogTrigger>
                      </CardContent>
                    </Card>

                    <Card className="border-purple-200 bg-purple-50/50">
                      <CardContent className="p-4">
                        <h4 className="font-medium mb-1">Forward to Field Verification</h4>
                        <p className="text-sm text-muted-foreground mb-3">
                          Request on-site field inspection of installation sites
                        </p>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setForwardType('field');
                              setForwardRemarks('');
                            }}
                          >
                            <Send className="h-4 w-4 mr-1" /> Forward to Field
                          </Button>
                        </DialogTrigger>
                      </CardContent>
                    </Card>
                  </div>

                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {forwardType === 'committee'
                          ? 'Forward to Committee'
                          : 'Forward to Field Verification'}
                      </DialogTitle>
                      <DialogDescription>
                        {forwardType === 'committee'
                          ? 'This will send the application for expert committee evaluation.'
                          : 'This will send the application for on-site field inspection.'}
                      </DialogDescription>
                    </DialogHeader>
                    <div>
                      <Label>Remarks</Label>
                      <Textarea
                        value={forwardRemarks}
                        onChange={(e) => setForwardRemarks(e.target.value)}
                        placeholder="Add any remarks or instructions..."
                        rows={4}
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setForwardDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleForward}
                        disabled={
                          forwardToCommitteeMutation.isPending || forwardToFieldMutation.isPending
                        }
                      >
                        {forwardToCommitteeMutation.isPending || forwardToFieldMutation.isPending
                          ? 'Forwarding...'
                          : 'Confirm Forward'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Separator />

                <div className="p-4 rounded-lg border border-yellow-200 bg-yellow-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <h4 className="font-medium text-yellow-800">Notes</h4>
                  </div>
                  <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                    <li>Ensure all documents have been verified before forwarding</li>
                    <li>Raise queries for any missing or incorrect documents</li>
                    <li>Committee evaluation requires at least one evaluator</li>
                    <li>Field verification is required for physical site inspection</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
