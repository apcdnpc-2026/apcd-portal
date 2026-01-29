'use client';

import { useQuery } from '@tanstack/react-query';
import { MessageSquare, ArrowRight, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

import { DashboardLayout } from '@/components/layout/dashboard-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiGet } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';

export default function QueriesPage() {
  // Fetch OEM's pending queries
  const { data: response, isLoading } = useQuery({
    queryKey: ['my-pending-queries'],
    queryFn: () => apiGet<any>('/verification/my-pending-queries'),
  });
  const queries = response?.data || response || [];

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
          <h1 className="text-2xl font-bold">My Queries</h1>
          <p className="text-muted-foreground">
            Queries raised on your applications that need response
          </p>
        </div>
        {(queries as any[]).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No pending queries</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(queries as any[]).map((q: any) => (
              <Card key={q.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{q.subject}</p>
                      <p className="text-sm text-muted-foreground">
                        {q.application?.applicationNumber || 'Application'} &bull;{' '}
                        {formatDateTime(q.createdAt)}
                        {q.documentType && ` • ${q.documentType.replace(/_/g, ' ')}`}
                      </p>
                      {q.deadline && (
                        <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Deadline: {formatDate(q.deadline)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant={
                          q.status === 'RESOLVED'
                            ? 'secondary'
                            : q.status === 'RESPONDED'
                              ? 'default'
                              : 'destructive'
                        }
                      >
                        {q.status === 'OPEN' && <AlertCircle className="h-3 w-3 mr-1" />}
                        {q.status === 'RESPONDED' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {q.status?.replace(/_/g, ' ')}
                      </Badge>
                      <Button size="sm" asChild>
                        <Link href={`/queries/${q.id}`}>
                          {q.status === 'OPEN' ? 'Respond' : 'View'}{' '}
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
