'use client';

import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  ClipboardCheck,
  Award,
  Users,
  ChevronRight,
  CheckCircle2,
  Clock,
  Shield,
  HelpCircle,
  Building2,
  MapPin,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiGet } from '@/lib/api';

function getEmpanelmentStatusColor(status: string) {
  switch (status) {
    case 'Final':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'Provisional':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'Renewal Due':
      return 'bg-red-100 text-red-800 border-red-300';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export default function HomePage() {
  const [oemSearch, setOemSearch] = useState('');

  const { data: oems = [], isLoading: oemsLoading } = useQuery({
    queryKey: ['empaneled-oems-home'],
    queryFn: async () => {
      const response = await apiGet<any>('/certificates/empaneled-oems');
      return response?.data || response || [];
    },
  });

  const filteredOems = (oems as any[]).filter(
    (oem) =>
      !oemSearch ||
      oem.companyName?.toLowerCase().includes(oemSearch.toLowerCase()) ||
      oem.state?.toLowerCase().includes(oemSearch.toLowerCase()),
  );

  const displayedOems = filteredOems.slice(0, 10);

  const processSteps = [
    {
      step: 1,
      title: 'Register as OEM',
      description: 'Create your account with basic company details',
      icon: Users,
    },
    {
      step: 2,
      title: 'Complete Application',
      description: 'Fill the application form with required documents',
      icon: FileText,
    },
    {
      step: 3,
      title: 'Document Verification',
      description: 'NPC officers verify your submitted documents',
      icon: ClipboardCheck,
    },
    {
      step: 4,
      title: 'Field Verification',
      description: 'Physical verification of manufacturing facility',
      icon: Shield,
    },
    {
      step: 5,
      title: 'Committee Evaluation',
      description: 'Expert committee reviews your application',
      icon: Users,
    },
    {
      step: 6,
      title: 'Certificate Issuance',
      description: 'Receive empanelment certificate upon approval',
      icon: Award,
    },
  ];

  const apcdCategories = [
    'Electrostatic Precipitators (ESP)',
    'Bag Filters / Fabric Filters',
    'Wet Scrubbers',
    'Cyclone Separators',
    'Dry Scrubbers',
    'Fume Extraction Systems',
    'Hybrid / Other Technologies',
  ];

  const faqs = [
    {
      question: 'Who can apply for empanelment?',
      answer:
        'Manufacturers of Air Pollution Control Devices (APCDs) with valid GST registration, manufacturing facilities in India, at least 3 years of operating history, and a minimum of 3 APCD installations can apply.',
    },
    {
      question: 'What documents are required?',
      answer:
        'Company registration certificates, GST registration, PAN card, manufacturing facility proof, product catalogs, NABL-accredited test reports, ISO certifications (if available), and installation experience proof (minimum 3 installations).',
    },
    {
      question: 'How long does the process take?',
      answer:
        'The complete empanelment process typically takes 45-60 working days after submission of a complete application with all required documents.',
    },
    {
      question: 'What is the validity of the certificate?',
      answer:
        'The empanelment certificate is valid for 2 years from the date of issuance and can be renewed before expiry.',
    },
    {
      question: 'What are the fees for empanelment?',
      answer:
        'The application fee is \u20B925,000 plus \u20B965,000 per APCD type selected, plus 18% GST. MSE/DPIIT-recognized startups and Class-I local suppliers are eligible for a 15% discount.',
    },
    {
      question: 'Can I apply for multiple APCD categories?',
      answer:
        'Yes, you can select multiple APCD categories in a single application. Each additional APCD type has a separate fee of \u20B965,000.',
    },
    {
      question: 'What happens after approval?',
      answer:
        'Upon approval, you receive an empanelment certificate (provisional or final) valid for 2 years. Your company will be listed on the public empanelled OEMs directory. The certificate can be renewed before expiry.',
    },
    {
      question: 'Is there a field verification?',
      answer:
        'Yes, NPC officers conduct a physical verification of your manufacturing facility to confirm production capabilities, quality systems, and installed equipment. The field verification fee is \u20B957,000.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Government Header */}
      <div className="gov-stripe" />
      <header className="bg-gov-blue text-white py-3 sm:py-4 sticky top-0 z-50">
        <div className="container mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-white flex items-center justify-center flex-shrink-0">
              <span className="text-gov-blue font-bold text-xs sm:text-sm">NPC</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-xl font-bold truncate">APCD OEM Empanelment Portal</h1>
              <p className="text-xs sm:text-sm text-blue-200 hidden sm:block">
                National Productivity Council for CPCB
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/empaneled-oems" className="hidden md:inline-block">
              <Button
                variant="outline"
                className="bg-transparent border-white text-white hover:bg-white hover:text-gov-blue"
              >
                Empaneled OEMs
              </Button>
            </Link>
            <Link href="/login">
              <Button
                variant="outline"
                size="sm"
                className="bg-transparent border-white text-white hover:bg-white hover:text-gov-blue text-xs sm:text-sm"
              >
                Login
              </Button>
            </Link>
            <Link href="/register">
              <Button
                size="sm"
                className="bg-white text-gov-blue hover:bg-blue-50 text-xs sm:text-sm"
              >
                Register
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-gov-blue to-blue-800 text-white py-10 sm:py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3 sm:mb-4">
              Air Pollution Control Device Manufacturers Empanelment
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-blue-100 mb-6 sm:mb-8">
              Get your company empaneled as an approved manufacturer of Air Pollution Control
              Devices under the Central Pollution Control Board (CPCB) guidelines.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Link href="/register">
                <Button
                  size="lg"
                  className="bg-white text-gov-blue hover:bg-blue-50 w-full sm:w-auto"
                >
                  Start Application
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/check-eligibility">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white text-white hover:bg-white/10 w-full sm:w-auto"
                >
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Check Eligibility
                </Button>
              </Link>
              <Link href="#process">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/50 text-white hover:bg-white/10 w-full sm:w-auto"
                >
                  View Process
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features */}
      <section className="py-12 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Online Application</h3>
                    <p className="text-sm text-muted-foreground">
                      Complete paperless process with online document submission
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Clock className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Track Progress</h3>
                    <p className="text-sm text-muted-foreground">
                      Real-time status updates and notifications at every stage
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Shield className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Secure & Transparent</h3>
                    <p className="text-sm text-muted-foreground">
                      Government-grade security with complete audit trail
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* APCD Categories */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">APCD Categories for Empanelment</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Manufacturers can apply for empanelment in the following Air Pollution Control Device
              categories
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
            {apcdCategories.map((category, index) => (
              <div key={index} className="flex items-center gap-2 p-4 bg-gray-50 rounded-lg border">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
                <span className="text-sm">{category}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Steps */}
      <section id="process" className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Empanelment Process</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Follow these steps to get your company empaneled as an approved APCD manufacturer
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {processSteps.map((step) => (
              <Card key={step.step} className="relative">
                <CardHeader>
                  <div className="absolute -top-3 -left-3 w-8 h-8 bg-gov-blue text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {step.step}
                  </div>
                  <div className="flex items-center gap-3 pt-2">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <step.icon className="h-5 w-5 text-gov-blue" />
                    </div>
                    <CardTitle className="text-lg">{step.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{step.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Empanelled OEMs - Live List */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">Empanelled OEM Manufacturers</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              List of manufacturers currently empaneled for Air Pollution Control Devices
            </p>
          </div>

          {/* Search */}
          <div className="max-w-md mx-auto mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by company or state..."
                value={oemSearch}
                onChange={(e) => setOemSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground text-center mb-4">
            {oemsLoading ? 'Loading...' : `${filteredOems.length} empaneled manufacturer(s)`}
          </p>

          {oemsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredOems.length === 0 ? (
            <Card className="max-w-2xl mx-auto">
              <CardContent className="py-12 text-center">
                <Award className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {(oems as any[]).length === 0
                    ? 'No manufacturers empaneled yet. Be the first to apply!'
                    : 'No manufacturers match your search.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="max-w-4xl mx-auto space-y-3">
              {displayedOems.map((oem: any, index: number) => (
                <Card key={index} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                      <div className="p-2 bg-green-100 rounded-lg flex-shrink-0 hidden sm:block">
                        <Building2 className="h-5 w-5 text-green-600" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <h3 className="font-semibold">{oem.companyName}</h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={getEmpanelmentStatusColor(oem.empanelmentStatus)}>
                              {oem.empanelmentStatus}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {oem.certificateNumber}
                            </Badge>
                          </div>
                        </div>
                        {oem.state && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {oem.state}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {oem.apcdTypes?.slice(0, 3).map((type: any, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {type.category?.replace(/_/g, ' ')}
                            </Badge>
                          ))}
                          {oem.apcdTypes?.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{oem.apcdTypes.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredOems.length > 10 && (
                <div className="text-center pt-4">
                  <Link href="/empaneled-oems">
                    <Button variant="outline">
                      View All {filteredOems.length} Manufacturers
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Required Documents */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Required Documents</h2>
              <p className="text-muted-foreground">
                Ensure you have the following documents ready before starting your application
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Company Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">
                        Certificate of Incorporation / Partnership Deed
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">GST Registration Certificate</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">PAN Card of Company</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">MSME/Udyam Registration (if applicable)</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Technical Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">Product Catalog with specifications</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">Test Reports from NABL accredited labs</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">ISO Certification (if available)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1 flex-shrink-0" />
                      <span className="text-sm">
                        Installation experience proof (3+ installations)
                      </span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* FAQs - Accordion */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Frequently Asked Questions</h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left">
                    <span className="flex items-start gap-3">
                      <HelpCircle className="h-5 w-5 text-gov-blue mt-0.5 flex-shrink-0" />
                      <span className="text-base font-medium">{faq.question}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pl-8 text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-10 sm:py-16 bg-gov-blue text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-blue-100 mb-6 sm:mb-8 max-w-2xl mx-auto">
            Register now and begin your APCD OEM empanelment application. Our team is here to guide
            you through the process.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
            <Link href="/register">
              <Button
                size="lg"
                className="bg-white text-gov-blue hover:bg-blue-50 w-full sm:w-auto"
              >
                Register Now
                <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/check-eligibility">
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10 w-full sm:w-auto"
              >
                Check Eligibility First
              </Button>
            </Link>
            <Link href="/login">
              <Button
                size="lg"
                variant="outline"
                className="border-white/50 text-white hover:bg-white/10 w-full sm:w-auto"
              >
                Already Registered? Login
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div>
              <h3 className="font-semibold mb-4">About</h3>
              <p className="text-sm text-gray-400">
                The APCD OEM Empanelment Portal is an initiative by the National Productivity
                Council for the Central Pollution Control Board to streamline the empanelment of Air
                Pollution Control Device manufacturers.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Quick Links</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <Link href="/register" className="hover:text-white">
                    Register as OEM
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-white">
                    Login
                  </Link>
                </li>
                <li>
                  <Link href="/empaneled-oems" className="hover:text-white">
                    Empaneled OEMs
                  </Link>
                </li>
                <li>
                  <Link href="/check-eligibility" className="hover:text-white">
                    Check Eligibility
                  </Link>
                </li>
                <li>
                  <Link href="#process" className="hover:text-white">
                    Empanelment Process
                  </Link>
                </li>
                <li>
                  <a
                    href="https://cpcb.nic.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white"
                  >
                    CPCB Website
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Contact</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>National Productivity Council</li>
                <li>Utpadakta Bhawan, 5-6 Institutional Area</li>
                <li>Lodhi Road, New Delhi - 110003</li>
                <li>Email: apcd-support@npcindia.gov.in</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 pt-6 text-center text-sm text-gray-400">
            <p>
              &copy; {new Date().getFullYear()} National Productivity Council. All rights reserved.
            </p>
            <p className="mt-1">For CPCB - Central Pollution Control Board</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
