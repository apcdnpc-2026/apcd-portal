'use client';

import { useQuery } from '@tanstack/react-query';
import { Award, Search, Building2, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiGet } from '@/lib/api';
import { formatDate } from '@/lib/utils';

export default function EmpaneledOemsPage() {
  const [search, setSearch] = useState('');

  const { data: oems = [], isLoading } = useQuery({
    queryKey: ['empaneled-oems'],
    queryFn: async () => {
      const response = await apiGet<any>('/certificates/empaneled-oems');
      return response?.data || response || [];
    },
  });

  const filtered = (oems as any[]).filter(
    (oem) =>
      !search ||
      oem.companyName?.toLowerCase().includes(search.toLowerCase()) ||
      oem.state?.toLowerCase().includes(search.toLowerCase()) ||
      oem.apcdTypes?.some(
        (t: any) =>
          t.category?.toLowerCase().includes(search.toLowerCase()) ||
          t.subType?.toLowerCase().includes(search.toLowerCase()),
      ),
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Government Header */}
      <div className="gov-stripe" />
      <header className="bg-gov-blue text-white py-4 sticky top-0 z-50">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center">
              <span className="text-gov-blue font-bold text-sm">NPC</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">APCD OEM Empanelment Portal</h1>
              <p className="text-sm text-blue-200">National Productivity Council for CPCB</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button
                variant="outline"
                className="bg-transparent border-white text-white hover:bg-white hover:text-gov-blue"
              >
                Home
              </Button>
            </Link>
            <Link href="/login">
              <Button className="bg-white text-gov-blue hover:bg-blue-50">Login</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">Empaneled OEM Manufacturers</h2>
            <p className="text-muted-foreground">
              List of manufacturers empaneled for Air Pollution Control Devices under CPCB
              guidelines
            </p>
          </div>

          {/* Search */}
          <div className="mb-6 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by company, state, or APCD type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Results count */}
          <p className="text-sm text-muted-foreground mb-4">
            {isLoading ? 'Loading...' : `${filtered.length} empaneled manufacturer(s) found`}
          </p>

          {/* OEM List */}
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Award className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No empaneled manufacturers found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filtered.map((oem: any, index: number) => (
                <Card key={index} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      <div className="p-3 bg-green-100 rounded-lg flex-shrink-0">
                        <Building2 className="h-6 w-6 text-green-600" />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <h3 className="text-lg font-semibold">{oem.companyName}</h3>
                          <Badge variant="success" className="w-fit">
                            <Award className="h-3 w-3 mr-1" />
                            {oem.certificateNumber}
                          </Badge>
                        </div>

                        {oem.address && (
                          <p className="text-sm text-muted-foreground flex items-start gap-1">
                            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            {oem.address}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2 mt-2">
                          {oem.apcdTypes?.map((type: any, i: number) => (
                            <Badge key={i} variant="secondary">
                              {type.category}: {type.subType}
                            </Badge>
                          ))}
                        </div>

                        <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                          <span>Issued: {formatDate(oem.issuedDate)}</span>
                          <span>Valid until: {formatDate(oem.validUntil)}</span>
                          {oem.state && <span>State: {oem.state}</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-4">
        <div className="container mx-auto px-4 text-center text-sm">
          <p>
            &copy; {new Date().getFullYear()} National Productivity Council. All rights reserved.
          </p>
          <p className="text-gray-400 mt-1">For CPCB - Central Pollution Control Board</p>
        </div>
      </footer>
    </div>
  );
}
