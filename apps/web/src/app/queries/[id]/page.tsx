'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  MessageSquare,
  Send,
  Upload,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { apiGet, apiPost, uploadFile } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';

export default function QueryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const queryId = params.id as string;

  const [responseMessage, setResponseMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // For OEM: fetch my pending queries to find this one
  const { data: queriesResponse, isLoading } = useQuery({
    queryKey: ['my-pending-queries'],
    queryFn: () => apiGet<any>('/verification/my-pending-queries'),
  });
  const allQueries = queriesResponse?.data || queriesResponse || [];
  const query = (allQueries as any[]).find((q: any) => q.id === queryId);

  // Respond to query mutation
  const respondMutation = useMutation({
    mutationFn: async (data: { message: string }) => {
      const result = await apiPost(`/verification/query/${queryId}/respond`, data);

      // If file is attached, upload it to the application
      if (file && query?.applicationId) {
        await uploadFile(`/attachments/${query.applicationId}/upload`, file, undefined, {
          documentType: query.documentType || 'QUERY_RESPONSE',
        });
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-pending-queries'] });
      toast({ title: 'Response submitted successfully' });
      router.push('/queries');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'Failed to submit response';
      toast({ title: msg, variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    if (!responseMessage.trim()) {
      toast({ title: 'Please enter a response message', variant: 'destructive' });
      return;
    }
    respondMutation.mutate({ message: responseMessage });
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

  if (!query) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">Query not found or already resolved</p>
          <Button asChild>
            <Link href="/queries">Back to Queries</Link>
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const statusIcon =
    query.status === 'RESOLVED' ? (
      <CheckCircle2 className="h-5 w-5 text-green-600" />
    ) : query.status === 'RESPONDED' ? (
      <Clock className="h-5 w-5 text-blue-600" />
    ) : (
      <AlertCircle className="h-5 w-5 text-orange-600" />
    );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/queries">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Query Details</h1>
            <p className="text-muted-foreground">
              Application:{' '}
              {query.application?.applicationNumber || query.applicationId?.slice(0, 8)}
            </p>
          </div>
          <Badge
            variant={
              query.status === 'RESOLVED'
                ? 'secondary'
                : query.status === 'RESPONDED'
                  ? 'default'
                  : 'destructive'
            }
          >
            {statusIcon}
            <span className="ml-1">{query.status?.replace(/_/g, ' ')}</span>
          </Badge>
        </div>

        {/* Query Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" /> {query.subject}
            </CardTitle>
            <CardDescription>
              Raised on {formatDateTime(query.createdAt)}
              {query.documentType && ` • Document: ${query.documentType.replace(/_/g, ' ')}`}
              {query.deadline && ` • Deadline: ${formatDateTime(query.deadline)}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-orange-50 border border-orange-200">
              <p className="text-sm font-medium text-orange-800 mb-1">Query from Officer</p>
              <p className="text-sm">{query.description}</p>
            </div>

            {/* Existing Responses */}
            {query.responses && query.responses.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium text-muted-foreground">Previous Responses</p>
                {query.responses.map((r: any, i: number) => (
                  <div key={i} className="ml-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <p className="text-sm">{r.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {r.responder?.firstName} {r.responder?.lastName} •{' '}
                      {formatDateTime(r.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Response Form - only if not resolved */}
        {query.status !== 'RESOLVED' && (
          <Card>
            <CardHeader>
              <CardTitle>Submit Response</CardTitle>
              <CardDescription>
                Respond to the officer's query with details or documents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Response Message *</Label>
                <Textarea
                  value={responseMessage}
                  onChange={(e) => setResponseMessage(e.target.value)}
                  placeholder="Provide your response to the query..."
                  rows={5}
                  className="mt-1"
                />
              </div>

              <div>
                <Label>Attach Document (Optional)</Label>
                <div className="mt-1 flex items-center gap-3">
                  <input
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  />
                  {file && (
                    <Badge variant="secondary">
                      <Upload className="h-3 w-3 mr-1" /> {file.name}
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex justify-end gap-3">
                <Button variant="outline" asChild>
                  <Link href="/queries">Cancel</Link>
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={respondMutation.isPending || !responseMessage.trim()}
                >
                  {respondMutation.isPending ? (
                    'Submitting...'
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" /> Submit Response
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
